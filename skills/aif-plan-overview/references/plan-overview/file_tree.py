#!/usr/bin/env python3
"""Render declared plan paths from JSON stdin; never inspect the filesystem."""
import json
import re
import sys
from dataclasses import dataclass, field

LIMIT = 1000
ACTIONS = {"create": "+", "modify": "~", "delete": "-", "unknown": "?"}


def text(value, limit=1000):
    if not isinstance(value, str) or not value or len(value) > limit or any(
        ord(char) < 32 or 127 <= ord(char) <= 159 or char in "\u2028\u2029" for char in value
    ):
        raise ValueError("Expected bounded single-line text")
    return value


def expand(value):
    result = [value]
    for _ in range(32):
        expanded = []
        changed = False
        for item in result:
            match = re.search(r"\{([^{}]*,[^{}]*)\}", item)
            if match:
                changed = True
                expanded.extend(item[:match.start()] + choice.strip() + item[match.end():]
                                for choice in match[1].split(","))
            else:
                expanded.append(item)
            if len(expanded) > 256:
                raise ValueError("Brace expansion exceeds 256 paths per row")
        result = expanded
        if not changed:
            return result
    raise ValueError("Brace expansion is too deep")


@dataclass
class Node:
    children: dict = field(default_factory=dict)
    entry: dict = field(default_factory=dict)

    def directory(self):
        return bool(self.children) or self.entry.get("directory", False)


def render(rows):
    if not isinstance(rows, list) or len(rows) > LIMIT:
        raise ValueError("Expected an array of at most 1000 file rows")
    entries = {}
    for row in rows:
        if not isinstance(row, dict) or set(row) - {"path", "action", "refs", "note"}:
            raise ValueError("Unsupported file row")
        action = row.get("action", "unknown")
        if not isinstance(action, str) or action not in ACTIONS:
            raise ValueError("Action must be create, modify, delete or unknown")
        refs = row.get("refs", [])
        if not isinstance(refs, list) or len(refs) > 100:
            raise ValueError("Expected up to 100 phase/task references")
        refs = [text(ref, 200) for ref in refs]
        note = row.get("note", "")
        if not isinstance(note, str):
            raise ValueError("Note must be text")
        if note:
            text(note)
        for raw in expand(text(row.get("path"))):
            name = raw.replace("\\", "/")
            while name.startswith("./"):
                name = name[2:]
            directory = name.endswith("/")
            name = name.rstrip("/")
            if not name or name.startswith("/") or re.match(r"^[a-zA-Z]:", name) or any(
                part in ("", ".", "..") for part in name.split("/")
            ):
                raise ValueError("Expected a project-relative path without traversal")
            entry = entries.setdefault(name, {"actions": [], "refs": [], "notes": [], "directory": False})
            for key, values in (("actions", [action]), ("refs", refs), ("notes", [note] if note else [])):
                entry[key].extend(value for value in values if value not in entry[key])
            entry["directory"] = entry["directory"] or directory
            if len(entries) > LIMIT:
                raise ValueError("Expanded input exceeds 1000 unique paths")

    root = Node()
    for name, entry in entries.items():
        node = root
        for part in name.split("/"):
            node = node.children.setdefault(part, Node())
        node.entry = entry

    def marker(entry):
        return ACTIONS[entry["actions"][0]] if len(entry["actions"]) == 1 else "*"

    lines = ["."]

    def visit(parent, prefix):
        children = sorted(parent.children.items(), key=lambda item: (not item[1].directory(), item[0]))
        for index, (name, node) in enumerate(children):
            while not node.entry and len(node.children) == 1:
                child_name, child = next(iter(node.children.items()))
                if not child.directory():
                    break
                name += "/" + child_name
                node = child
            last = index == len(children) - 1
            label = name + ("/" if node.directory() else "")
            if node.entry:
                label = marker(node.entry) + " " + label
                details = []
                if len(node.entry["actions"]) > 1:
                    details.append("actions: " + ", ".join(node.entry["actions"]))
                details.extend([", ".join(node.entry["refs"]), "; ".join(node.entry["notes"])])
                label += "  " + " — ".join(detail for detail in details if detail)
            lines.append(prefix + ("└── " if last else "├── ") + label.rstrip())
            visit(node, prefix + ("    " if last else "│   "))

    visit(root, "")
    counts = {symbol: 0 for symbol in [*ACTIONS.values(), "*"]}
    for entry in entries.values():
        counts[marker(entry)] += 1
    footer = [f"{symbol} {action}: {counts[symbol]}" for action, symbol in ACTIONS.items()
              if action != "unknown" or counts[symbol]]
    if counts["*"]:
        footer.append(f"* multiple actions: {counts['*']}")
    lines.extend(["", "   ".join(footer) + f"   (planned paths: {len(entries)})"])
    return "\n".join(lines)


def main():
    try:
        raw = sys.stdin.buffer.read(256 * 1024 + 1)
        if len(raw) > 256 * 1024:
            raise ValueError("Input exceeds 256 KiB")
        sys.stdout.buffer.write((render(json.loads(raw)) + "\n").encode("utf-8"))
        return 0
    except (ValueError, TypeError, RecursionError):
        print("ERROR [file-tree]: Invalid or oversized declaration data; keep unresolved rows visible in the overview.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
