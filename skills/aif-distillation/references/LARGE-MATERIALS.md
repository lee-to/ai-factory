# Large Materials

Large books, PDFs, and source folders need staged processing. The goal is to fit the agent context without losing structure.

## Helper Script

Use:

```bash
python3 ~/{{skills_dir}}/aif-distillation/scripts/material-prep.py <source...> --out <temp-dir>
```

The script:

- accepts local files, local folders, and URLs
- converts GitHub `blob` URLs to raw downloads when possible
- extracts text from PDFs with Python libraries when present, then falls back to `pdftotext`
- walks directories while skipping common generated/vendor folders
- writes a `manifest.json`, `source-index.md`, and chunk files

Read `source-index.md` first. Then read only the chunks needed for each section of the target skill.

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
python3 ~/{{skills_dir}}/aif-distillation/scripts/material-prep.py --cleanup <temp-dir>
```

The cleanup guard accepts only directories that look like `aif-distillation` extraction output.

If cleanup cannot be completed, report the exact temporary path to the user.

## PDF Fallbacks

If PDF text extraction fails:

1. Try a different extractor if available.
2. Ask the user for a text/markdown export.
3. Distill only accessible metadata or pages if the user accepts partial coverage.

Never pretend a full book was processed when only a small sample was readable.
