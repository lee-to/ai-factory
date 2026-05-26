# Large Materials

Large books, PDFs, and source folders need staged processing. The goal is to fit the agent context without losing structure.

## Helper Script

Use the helper only when a working Python 3 interpreter is available. Detect and verify it by running these version probes in order:

```bash
python3 --version
python --version
py -3 --version
py --version
```

Use the first command that exits successfully and reports `Python 3.x`:

- `python3 --version` -> `python3`
- `python --version` -> `python`
- `py -3 --version` -> `py -3`
- `py --version` -> `py`

Then run the helper with that concrete command shape:

```bash
python3 {{skills_dir}}/aif-distillation/scripts/material-prep.py <source...>
```

Use `python`, `py -3`, or `py` only if that was the selected Python 3 command. If no probe reports Python 3, do not call the helper. Use direct reads/searches for text sources, ask the user for text/markdown exports for PDFs or very large sources, and state the coverage limitation in the final result.

The script:

- accepts local files, local folders, and URLs
- converts GitHub `blob` URLs to raw downloads when possible
- extracts text from PDFs with Python libraries when present, then falls back to `pdftotext`
- walks directories while skipping common generated/vendor folders, hidden paths, and credential-like paths by default
- writes a `manifest.json`, `source-index.md`, and chunk files
- writes output to a fresh temporary directory by default

Optional flags:

- `--out <dir>` writes to a specific output directory. Use only an empty directory or a directory previously created by this helper.
- `--include-hidden` includes hidden files and folders during directory extraction.
- `--include-sensitive` includes credential-like paths such as `.env*`, `*token*`, `*credential*`, `.ssh`, `.codex`, `.claude`, `secrets`, and `private`. Hidden sensitive paths still require both `--include-hidden` and `--include-sensitive`. Treat this as unsafe unless the user explicitly asks for those sources.
- `--include-symlinks` includes symlinked files only when the resolved target stays inside the selected folder and passes the same hidden/sensitive checks. Symlinks to hidden sensitive targets require `--include-symlinks --include-hidden --include-sensitive`.

Read `source-index.md` first. Then read only the chunks needed for each section of the target skill.

When `--redact-source-map` is present, treat `source-index.md` as a private
working index only. Do not copy its raw URLs, local paths, filenames, or exact
source titles into generated files. Do not create `references/SOURCE-MAP.md`
for redacted output.

## Chunking Strategy

Use this order:

1. Table of contents or headings
2. Introductions to each major part
3. Checklists, summaries, and examples
4. Sections that explain core techniques
5. Edge-case sections and warnings

Do not read chunks linearly if the source is a book. Build a topic map first, then sample intentionally.

## Temporary Artifacts

Extraction artifacts are working files, not project artifacts.

Required cleanup:

- keep only the final generated or updated skill package
- remove downloaded PDFs and chunk directories after validation
- do not commit extracted full text

Preferred cleanup command:

```bash
python3 {{skills_dir}}/aif-distillation/scripts/material-prep.py --cleanup <temp-dir>
```

Use `python`, `py -3`, or `py` only if that was the selected Python 3 command. If no probe reports Python 3, remove only known helper-generated temporary files manually.

The cleanup guard removes only directories with this helper's dedicated marker file.

If cleanup cannot be completed, report the exact temporary path to the user.

## PDF Fallbacks

If PDF text extraction fails:

1. Try a different extractor if available.
2. Ask the user for a text/markdown export.
3. Distill only accessible metadata or pages if the user accepts partial coverage.

Never pretend a full book was processed when only a small sample was readable.
