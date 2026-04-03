---
name: aif-reference
description: >-
  Create knowledge references from URLs, documents, or files for use by AI agents.
  Fetch, process, and store structured references in the configured references directory
  (default: .ai-factory/references/).
argument-hint: "<url|path> [url2|path2] [--name <ref-name>] [--update]"
allowed-tools: Read Write Edit Glob Grep Bash(mkdir *) Bash(ls *) Bash(wc *) WebFetch WebSearch AskUserQuestion
disable-model-invocation: false
metadata:
  author: ai-factory
  version: "1.0"
  category: knowledge-management
---

# Reference Creator

Create structured knowledge references from external sources and store them in the configured references directory so other AI Factory skills can reuse them later.

## Step 0: Load Config

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:
- **Paths:** `paths.references` and `paths.rules_file`
- **Language:** `language.ui` for prompts

If config.yaml doesn't exist, use defaults:
- references/: `.ai-factory/references/`
- RULES.md: `.ai-factory/RULES.md`
- Language: `en` (English)

### Project Context

**Read `.ai-factory/skill-context/aif-reference/SKILL.md`** - MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**
- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins**
- When there is no conflict, apply both
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill - including the generated
  reference files. If a skill-context rule says "references MUST include X" - you MUST comply.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated - fix the output before presenting it to the user.

## When To Use

- AI needs documentation it was not trained on or may know only partially
- You want grounded answers based on specific docs, specs, or internal files
- You want reusable domain context for `/aif-plan`, `/aif-implement`, `/aif-explore`, or `/aif-grounded`
- You want a durable knowledge artifact instead of one-off conversation context

## Argument Detection

```text
Check $ARGUMENTS:
- Contains "--update"        -> Update Mode: refresh existing reference
- Contains URLs (http/https) -> URL Mode: fetch and process web sources
- Contains file paths        -> File Mode: process local documents
- "list"                     -> List existing references
- "show <name>"              -> Show reference content
- "delete <name>"            -> Delete a reference (with confirmation)
- Empty                      -> Interactive mode
```

## Workflow

### Step 0.1: Setup

Ensure the resolved references directory exists:

```bash
mkdir -p <resolved references dir>
```

Check for existing references to avoid duplicates:

```bash
ls <resolved references dir>
```

If `--name <ref-name>` is provided, use it as the reference name.
If `--update` is provided, find and update the existing reference instead of creating a new one.

### Step 1: Collect Sources

**For URLs:**

For each URL:

1. Fetch the page using `WebFetch` and extract:
   - main topic and purpose
   - key concepts, terms, and definitions
   - code examples and patterns
   - API methods, parameters, return types, and signatures
   - configuration options with defaults
   - best practices and recommendations
   - error handling and edge cases
   - version information and compatibility notes
   - links to critical sub-pages
2. If critical sub-pages are referenced, fetch them too (up to 8 extra pages per source URL).
3. If obvious gaps remain, run 1-2 targeted `WebSearch` queries to fill them.

**For local files:**

1. Read each file with `Read`
2. If the file references other local files, read those too (up to 5 levels of includes)
3. Detect the format (markdown, HTML, JSON, YAML, plain text) and extract accordingly

**For interactive mode:**

Ask the user:
1. What topic or technology should this reference cover?
2. Do they have URLs or local files, or should you search?
3. What aspects matter most for their use case?

### Step 2: Synthesize the Reference

Transform collected material into a structured reference document.

**Reference file format:**

```markdown
# <Topic> Reference

> Source: <list of source URLs or file paths>
> Created: YYYY-MM-DD
> Updated: YYYY-MM-DD

## Overview

<1-3 paragraph summary>

## Core Concepts

<Concept 1>: <clear explanation>
<Concept 2>: <clear explanation>

## API / Interface

<Only if applicable. Preserve exact signatures and types from source docs.>

## Usage Patterns

<Practical code examples organized by use case.>

## Configuration

<Options, defaults, valid values. Table format preferred.>

## Best Practices

<Numbered list with reasoning>

## Common Pitfalls

<What goes wrong and how to avoid it>

## Version Notes

<Only if relevant. Breaking changes, migration notes, deprecations.>
```

**Quality rules:**
- **No hallucination** - include only what was actually found
- **Preserve code verbatim** - docs examples must stay exact
- **Actionable over academic** - optimize for useful lookup
- **Dense** - maximize useful information per line
- **Complete signatures** - APIs need full parameters, types, and returns
- **Source attribution** - always include source URLs or paths

### Step 3: Name and Save

**Naming convention:**
- Derive from topic: `react-hooks.md`, `fastapi-endpoints.md`, `docker-compose.md`
- Use lowercase, hyphens, `.md`
- If `--name` was provided, use that (add `.md` if missing)
- Avoid generic names like `reference.md`

**Save to:** `<resolved references dir>/<name>.md`

### Step 4: Register in Index

Check if `<resolved references dir>/INDEX.md` exists. Create or update it:

```markdown
# References Index

Available knowledge references for AI agents.

| Reference | Topic | Sources | Updated |
|-----------|-------|---------|---------|
| [react-hooks](react-hooks.md) | React Hooks API and patterns | react.dev | 2026-03-20 |
| [docker-compose](docker-compose.md) | Docker Compose configuration | docs.docker.com | 2026-03-20 |
```

### Step 5: Report

Show the user:
- reference name and path
- size (line count)
- sections included
- source URLs or file paths used
- how to use it in later AI Factory workflows

## Update Mode (`--update`)

When `--update` is present:

1. Find the existing reference by `--name` or matching sources
2. Re-fetch the sources listed in the header
3. Compare new material with existing content and update only changed sections
4. Preserve `Created:`, update `Updated:`
5. Report what changed

## List / Show / Delete

- **`/aif-reference list`** - read and display `<resolved references dir>/INDEX.md` or list files in the directory
- **`/aif-reference show <name>`** - read and display the reference content (`.md` is optional)
- **`/aif-reference delete <name>`** - ask for confirmation, delete the file, and update `INDEX.md`

## Integration With Other Skills

References in the resolved references directory are available to all AI Factory skills:
- `/aif-plan` and `/aif-implement` can read them for domain context
- `/aif-grounded` can use them as evidence sources
- `/aif-explore` can reference them during research

To make a skill aware of a specific reference, mention it in the resolved RULES.md file:

```markdown
## References
- For <topic> details, see `<resolved references dir>/<name>.md`
```

## Artifact Ownership

- **Primary ownership:** the resolved references directory (default: `.ai-factory/references/`)
- **Shared ownership:** the resolved references index file (`INDEX.md` inside that directory)
- **Read-only:** all other `.ai-factory/` files
- **Config policy:** config-aware. Use `paths.references` for storage and `paths.rules_file` when pointing other skills at a saved reference.

## Guardrails

- **Max reference size:** aim for under 1000 lines per reference. If larger, split into multiple files and create a directory inside the resolved references dir with an `INDEX.md` inside
- **No duplication:** check existing references before creating a new one
- **No stale data:** always include sources so the reference can be refreshed
- **No opinions:** references should reflect sources, not personal preferences
- **Respect access:** if a URL requires authentication or fails to load, report that instead of guessing
