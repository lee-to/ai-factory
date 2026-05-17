#!/usr/bin/env python3
"""Prepare large material for aif-distillation.

The script extracts text from local files, folders, and URLs, then writes
chunked markdown files plus a manifest. It intentionally leaves the output
directory for the caller to read and remove after distillation.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


TEXT_EXTENSIONS = {
    ".adoc",
    ".c",
    ".cc",
    ".cpp",
    ".cs",
    ".css",
    ".csv",
    ".go",
    ".h",
    ".hpp",
    ".html",
    ".htm",
    ".java",
    ".js",
    ".json",
    ".jsx",
    ".kt",
    ".md",
    ".php",
    ".py",
    ".rb",
    ".rs",
    ".rst",
    ".scss",
    ".sh",
    ".sql",
    ".svelte",
    ".swift",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".vue",
    ".xml",
    ".yaml",
    ".yml",
}

PDF_EXTENSIONS = {".pdf"}

SKIP_DIRS = {
    ".cache",
    ".git",
    ".hg",
    ".next",
    ".nuxt",
    ".svn",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
    "vendor",
    "__pycache__",
}


@dataclass
class ExtractedDocument:
    source: str
    title: str
    kind: str
    text: str


def slugify(value: str, fallback: str = "source") -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return value[:80] or fallback


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


def read_text_file(path: Path) -> str:
    data = path.read_bytes()
    for encoding in ("utf-8", "utf-8-sig", "cp1251", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def html_to_text(raw: str) -> str:
    raw = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", raw)
    raw = re.sub(r"(?s)<[^>]+>", " ", raw)
    raw = html.unescape(raw)
    return re.sub(r"[ \t]{2,}", " ", raw)


def extract_pdf_with_python(path: Path) -> str | None:
    try:
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(str(path))
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception:
        pass

    try:
        from PyPDF2 import PdfReader  # type: ignore

        reader = PdfReader(str(path))
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception:
        pass

    try:
        from pdfminer.high_level import extract_text  # type: ignore

        return extract_text(str(path))
    except Exception:
        return None


def extract_pdf(path: Path) -> str:
    text = extract_pdf_with_python(path)
    if text and text.strip():
        return text

    pdftotext = shutil.which("pdftotext")
    if pdftotext:
        result = subprocess.run(
            [pdftotext, "-layout", str(path), "-"],
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout

    raise RuntimeError(
        f"Could not extract PDF text from {path}. Install pypdf, PyPDF2, pdfminer.six, or pdftotext."
    )


def convert_github_blob_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    if parsed.netloc != "github.com":
        return url

    parts = parsed.path.strip("/").split("/")
    if len(parts) >= 5 and parts[2] == "blob":
        owner, repo, _, branch = parts[:4]
        rest = "/".join(parts[4:])
        raw_path = "/".join([owner, repo, branch, rest])
        return urllib.parse.urlunparse(("https", "raw.githubusercontent.com", raw_path, "", "", ""))

    return url


def download_url(url: str, work_dir: Path) -> Path:
    download_url_value = convert_github_blob_url(url)
    parsed = urllib.parse.urlparse(download_url_value)
    basename = Path(urllib.parse.unquote(parsed.path)).name or "downloaded-source"
    if "." not in basename:
        basename += ".html"
    target = work_dir / basename

    request = urllib.request.Request(
        download_url_value,
        headers={"User-Agent": "ai-factory-aif-distillation/1.0"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        target.write_bytes(response.read())
    return target


def iter_folder_files(root: Path) -> Iterable[Path]:
    for current_root, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for filename in sorted(files):
            path = Path(current_root) / filename
            if path.suffix.lower() in TEXT_EXTENSIONS | PDF_EXTENSIONS:
                yield path


def extract_path(path: Path, label: str | None = None) -> ExtractedDocument:
    suffix = path.suffix.lower()
    title = label or path.name
    if suffix in PDF_EXTENSIONS:
        text = extract_pdf(path)
        kind = "pdf"
    elif suffix in {".html", ".htm"}:
        text = html_to_text(read_text_file(path))
        kind = "html"
    elif suffix in TEXT_EXTENSIONS:
        text = read_text_file(path)
        kind = "text"
    else:
        raise RuntimeError(f"Unsupported file type: {path}")

    return ExtractedDocument(
        source=str(path),
        title=title,
        kind=kind,
        text=normalize_text(text),
    )


def extract_source(source: str, work_dir: Path) -> list[ExtractedDocument]:
    if re.match(r"^https?://", source):
        downloaded = download_url(source, work_dir)
        doc = extract_path(downloaded, label=source)
        doc.source = source
        return [doc]

    path = Path(source).expanduser().resolve()
    if path.is_dir():
        docs = []
        for file_path in iter_folder_files(path):
            try:
                docs.append(extract_path(file_path))
            except RuntimeError as exc:
                print(f"warning: {exc}", file=sys.stderr)
        return docs

    if path.is_file():
        return [extract_path(path)]

    raise RuntimeError(f"Source not found: {source}")


def split_text(text: str, chunk_chars: int) -> list[str]:
    paragraphs = re.split(r"\n\s*\n", text)
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        piece_len = len(paragraph) + 2
        if current and current_len + piece_len > chunk_chars:
            chunks.append("\n\n".join(current).strip())
            current = []
            current_len = 0
        if piece_len > chunk_chars:
            for start in range(0, len(paragraph), chunk_chars):
                chunks.append(paragraph[start : start + chunk_chars].strip())
            continue
        current.append(paragraph)
        current_len += piece_len

    if current:
        chunks.append("\n\n".join(current).strip())

    return [chunk for chunk in chunks if chunk]


def write_chunks(docs: list[ExtractedDocument], out_dir: Path, chunk_chars: int) -> dict:
    chunks_dir = out_dir / "chunks"
    chunks_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "chunk_chars": chunk_chars,
        "documents": [],
        "chunks": [],
    }

    chunk_index = 1
    for doc in docs:
        doc_hash = hashlib.sha256(doc.text.encode("utf-8", errors="ignore")).hexdigest()[:12]
        doc_chunks = split_text(doc.text, chunk_chars)
        doc_record = {
            "source": doc.source,
            "title": doc.title,
            "kind": doc.kind,
            "characters": len(doc.text),
            "sha256_12": doc_hash,
            "chunk_count": len(doc_chunks),
        }
        manifest["documents"].append(doc_record)

        for local_index, chunk in enumerate(doc_chunks, start=1):
            slug = slugify(Path(doc.title).stem or f"source-{chunk_index}")
            filename = f"{chunk_index:04d}-{slug}.md"
            chunk_path = chunks_dir / filename
            chunk_path.write_text(
                "\n".join(
                    [
                        f"# Chunk {chunk_index:04d}",
                        "",
                        f"Source: {doc.source}",
                        f"Document chunk: {local_index}/{len(doc_chunks)}",
                        f"Characters: {len(chunk)}",
                        "",
                        "---",
                        "",
                        chunk,
                        "",
                    ]
                ),
                encoding="utf-8",
            )
            manifest["chunks"].append(
                {
                    "file": str(chunk_path.relative_to(out_dir)),
                    "source": doc.source,
                    "document_chunk": local_index,
                    "characters": len(chunk),
                }
            )
            chunk_index += 1

    return manifest


def write_index(out_dir: Path, manifest: dict) -> None:
    lines = [
        "# Source Index",
        "",
        "Read this file first, then open only the chunks needed for the target skill.",
        "",
        "## Documents",
        "",
        "| Source | Kind | Characters | Chunks |",
        "|--------|------|------------|--------|",
    ]

    for doc in manifest["documents"]:
        lines.append(
            f"| {doc['source']} | {doc['kind']} | {doc['characters']} | {doc['chunk_count']} |"
        )

    lines.extend(["", "## Chunks", "", "| File | Source | Characters |", "|------|--------|------------|"])
    for chunk in manifest["chunks"]:
        lines.append(f"| {chunk['file']} | {chunk['source']} | {chunk['characters']} |")

    (out_dir / "source-index.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def cleanup_output(path_value: str) -> int:
    target = Path(path_value).expanduser().resolve()
    if not target.exists():
        print(f"Already removed: {target}")
        return 0

    if not target.is_dir():
        raise RuntimeError(f"Cleanup target is not a directory: {target}")

    parts = set(target.parts)
    if not any("aif-distillation" in part for part in parts):
        raise RuntimeError(f"Refusing cleanup because target is not an aif-distillation directory: {target}")

    if not (target / "manifest.json").is_file() or not (target / "source-index.md").is_file():
        raise RuntimeError(f"Refusing cleanup because extraction markers are missing: {target}")

    shutil.rmtree(target)
    print(f"Removed: {target}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract and chunk material for aif-distillation.")
    parser.add_argument("sources", nargs="*", help="Local file, local directory, or URL.")
    parser.add_argument("--out", help="Output directory. Defaults to a new temp directory.")
    parser.add_argument("--chunk-chars", type=int, default=18000, help="Approximate max characters per chunk.")
    parser.add_argument("--cleanup", help="Remove an extraction output directory created by this script.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.cleanup:
        if args.sources:
            raise RuntimeError("--cleanup cannot be combined with sources.")
        return cleanup_output(args.cleanup)

    if not args.sources:
        raise RuntimeError("At least one source is required unless --cleanup is used.")

    out_dir = Path(args.out).expanduser().resolve() if args.out else Path(tempfile.mkdtemp(prefix="aif-distillation-"))
    out_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="aif-distillation-download-") as download_dir:
        docs: list[ExtractedDocument] = []
        for source in args.sources:
            docs.extend(extract_source(source, Path(download_dir)))

    docs = [doc for doc in docs if doc.text.strip()]
    if not docs:
        raise RuntimeError("No readable text extracted from sources.")

    manifest = write_chunks(docs, out_dir, args.chunk_chars)
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_index(out_dir, manifest)

    print(f"Output: {out_dir}")
    print(f"Documents: {len(manifest['documents'])}")
    print(f"Chunks: {len(manifest['chunks'])}")
    print(f"Index: {out_dir / 'source-index.md'}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
