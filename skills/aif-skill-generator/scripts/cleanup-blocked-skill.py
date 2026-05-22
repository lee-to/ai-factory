#!/usr/bin/env python3
"""
Cleanup helper for security-blocked skills.

Workaround for upstream bug vercel-labs/skills#977:
  On project scope, `npx skills remove` deletes files but leaves the
  skills-lock.json entry stale. A later `npx skills experimental_install`
  (or a teammate cloning the repo and running install) resurrects the
  blocked skill — defeating the security scan gate in /aif.

This script:
  1. Runs `npx skills remove -s <skill> -y` (best-effort; removes files,
     may leave the lock entry behind on project scope).
  2. Patches <root>/skills-lock.json to drop the "skills.<skill>" key
     atomically (tmp + os.replace). No-op if the entry is absent.
  3. Verifies via `npx skills list` that the skill no longer appears.

When upstream skills#977 is fixed, step 2 becomes a no-op and the script
can be reduced to just calling `npx skills remove`; no consumer changes
needed.

Usage:
  cleanup-blocked-skill.py --skill <name> [--root <dir>] [--dry-run]

Exit codes:
  0 - clean removal
  1 - operational error (invalid JSON, write failed, verify failed)
  2 - usage error (missing/invalid arguments)
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

SKILL_NAME_RE = re.compile(r'^[A-Za-z0-9._-]+$')
HAS_ALNUM_RE = re.compile(r'[A-Za-z0-9]')


def patch_lock(lock_path: Path, skill: str, dry_run: bool = False):
    """Remove skills[<skill>] from skills-lock.json.

    Returns (changed: bool, message: str). Raises RuntimeError on invalid JSON.
    Atomic write: writes to <lock>.tmp then os.replace. Preserves 2-space
    indent and trailing newline if the original had one.
    """
    if not lock_path.exists():
        return (False, f"lock file not found: {lock_path} (nothing to clean)")

    raw = lock_path.read_text(encoding='utf-8')
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"invalid JSON in {lock_path}: {e}")

    skills_section = data.get('skills')
    if not isinstance(skills_section, dict):
        return (False, "no 'skills' object in lock file (nothing to clean)")

    if skill not in skills_section:
        return (False, f"skill '{skill}' not present in lock file (nothing to clean)")

    if dry_run:
        return (True, f"would remove '{skill}' from {lock_path}")

    del skills_section[skill]

    new_text = json.dumps(data, indent=2, ensure_ascii=False)
    if raw.endswith('\n'):
        new_text += '\n'

    tmp_path = lock_path.with_name(lock_path.name + '.tmp')
    tmp_path.write_text(new_text, encoding='utf-8')
    os.replace(tmp_path, lock_path)
    return (True, f"removed '{skill}' from {lock_path}")


def _resolve_npx():
    """Locate the npx executable (handles npx.cmd on Windows)."""
    return shutil.which('npx') or shutil.which('npx.cmd')


def run_skills_remove(skill: str, dry_run: bool = False) -> int:
    """Invoke `npx skills remove -s <skill> -y`. Returns the CLI exit code,
    or 0 if npx is unavailable (caller will still patch the lock file)."""
    npx = _resolve_npx()
    if not npx:
        print("warning: npx not found on PATH; skipping CLI step", file=sys.stderr)
        return 0
    cmd = [npx, 'skills', 'remove', '-s', skill, '-y']
    if dry_run:
        print(f"would run: {' '.join(cmd)}")
        return 0
    result = subprocess.run(cmd)
    return result.returncode


def verify_removed(skill: str, dry_run: bool = False) -> bool:
    """Return True if `npx skills list` does NOT mention <skill> as a token.
    Returns True if verification cannot be performed (npx missing, dry-run)."""
    if dry_run:
        return True
    npx = _resolve_npx()
    if not npx:
        return True
    result = subprocess.run(
        [npx, 'skills', 'list'],
        capture_output=True,
        text=True,
    )
    pattern = re.compile(rf'\b{re.escape(skill)}\b')
    return not pattern.search(result.stdout or '')


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Cleanup helper for security-blocked skills: deletes the skill directory and clears its entry from skills-lock.json.",
    )
    parser.add_argument('--skill', required=True,
                        help="Skill name to remove (single name only — no wildcards or slashes)")
    parser.add_argument('--root', default='.',
                        help="Project root containing skills-lock.json (default: cwd)")
    parser.add_argument('--dry-run', action='store_true',
                        help="Print actions without executing")
    args = parser.parse_args()

    skill = args.skill
    if not (SKILL_NAME_RE.match(skill) and HAS_ALNUM_RE.search(skill)):
        print(f"error: invalid --skill value: {skill!r}", file=sys.stderr)
        print("       must match [A-Za-z0-9._-]+ and contain at least one alphanumeric",
              file=sys.stderr)
        return 2

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"error: --root is not a directory: {root}", file=sys.stderr)
        return 2

    lock_path = root / 'skills-lock.json'

    # Step 1: ask the CLI to remove (deletes files; may leave lock stale on project scope).
    rc = run_skills_remove(skill, dry_run=args.dry_run)
    if rc != 0:
        # Non-fatal: files may already be gone, or upstream CLI may not be installed.
        # The lock-patch step below is the security-critical part.
        print(f"note: `npx skills remove` returned exit {rc} (continuing)", file=sys.stderr)

    # Step 2: patch lock file (workaround for skills#977).
    try:
        _, msg = patch_lock(lock_path, skill, dry_run=args.dry_run)
    except RuntimeError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    print(msg)

    # Step 3: verify.
    if not verify_removed(skill, dry_run=args.dry_run):
        print(f"warning: '{skill}' still appears in `npx skills list` output",
              file=sys.stderr)
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
