# Output Structure

Use this structure for skills created by `aif-distillation`.

## Target Package

```text
{{skills_dir}}/<skill-name>/
├── SKILL.md
├── references/
│   ├── SOURCE-MAP.md
│   ├── CORE-PRINCIPLES.md
│   ├── WORKFLOW.md
│   └── CHECKLISTS.md
├── examples/
│   ├── REQUESTS.md
│   ├── code-patterns.md   # when source material teaches programming with snippets
│   ├── testing-debugging.md
│   ├── refactoring-optimization.md
│   └── <topic>.md
└── scripts/
    └── <helper>    # only when repeatable processing is needed
```

Use fewer files when the material is small. Do not create empty directories.
For broad programming material, use enough example files to cover the major
source topics. Do not create a single `code-patterns.md` that only samples a few
topics while the references claim broad code coverage.

## Destination

Save the distilled skill in the configured skills directory of the currently active agent:

```text
{{skills_dir}}/<skill-name>/
```

`{{skills_dir}}` is resolved by AI Factory for the active agent installation.

Do not write distilled output into AI Factory's package `skills/` directory unless the task is explicitly to add a built-in AI Factory skill.

## Naming

Choose a concise, general name that matches the distilled practice, not just the exact source title.

Good:

- `clean-code-style`
- `domain-modeling`
- `api-design-rules`
- `incident-review`

Avoid:

- author names unless the method is known by that name
- full book titles
- version/date suffixes unless required for compatibility
- vague names like `notes`, `reference`, or `book-summary`

## SKILL.md Rules

`SKILL.md` should contain:

- frontmatter with name, description, and argument hint
- one-sentence purpose
- trigger/input detection
- workflow steps
- links to the most important references/examples
- artifact ownership and config policy if relevant

For AI Factory-style skills, also include:

- a Step 0 section that reads `.ai-factory/config.yaml` when the skill uses any config-managed path or language setting
- a project skill-context read (`.ai-factory/skill-context/<skill-name>/SKILL.md`) when the skill should learn from `/aif-evolve`
- clear read/write boundaries matching the artifact ownership contract
- `aif-gate-result` output only for quality-gate skills that need machine-readable orchestration

`SKILL.md` should not contain:

- a book-length summary
- long source excerpts
- all examples from the material
- exhaustive background theory

## Reference File Roles

| File | Purpose |
|------|---------|
| `SOURCE-MAP.md` | Sources, coverage, and attribution |
| `CORE-PRINCIPLES.md` | Dense distilled concepts and rules |
| `WORKFLOW.md` | Step-by-step operating procedure |
| `CHECKLISTS.md` | Review gates and quality criteria |
| `PITFALLS.md` | Common mistakes and detection signals |
| `GLOSSARY.md` | Terms that affect interpretation |

Prefer stable, obvious filenames over clever names.

## Example File Roles

Examples should show how to apply the distilled knowledge:

- before/after transformations
- decision tables
- prompt examples
- review examples
- compact case studies
- source-derived code patterns when licensing allows reuse

Do not copy examples blindly. If a source example is long, convert it into a shorter original example that teaches the same rule.

For programming sources:

- create or update a code examples file when the source uses code to teach practices
- prefer original before/after snippets, tests, refactoring steps, or table-driven examples
- keep snippets compact enough to review in one screen
- label the construction rule or decision each snippet demonstrates
- adapt examples to the source language unless the user or project context calls for a different target language
- do not finish with prose-only examples when the source contained meaningful code examples
- include a short coverage note or table when the source spans many code topics, mapping source areas to example files
- split examples by topic when a single file would hide gaps

## Update Mode

When `--update` is present:

1. Locate the target skill by `--name` or inferred topic.
2. Read its existing `SKILL.md`, references, and examples.
3. Build a gap list from the new material.
4. Patch matching files.
5. Add new files only for new topics.
6. Report what changed and what was intentionally left untouched.

## Ownership and Context-Gate Alignment

When distilling material into an AI Factory workflow or quality skill:

- Owner commands write only their owned artifacts.
- Non-owner commands treat `.ai-factory/DESCRIPTION.md`, architecture, roadmap, rules, research, plan, patch, QA, security, and evolution artifacts as read-only unless the user explicitly asks otherwise.
- Commit/review/verify style skills should keep context gates read-only.
- Use human `WARN` / `ERROR` labels for context findings and reserve final fenced `aif-gate-result` JSON blocks for supported quality gates.
