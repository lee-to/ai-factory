---
name: aif-distillation
description: >-
  Distill books, documents, folders, or URLs into compact, practical Agent Skills.
  Use when source material should become a reusable skill package with a concise
  SKILL.md plus detailed references and examples.
argument-hint: "<path|url> [path|url...] [--name <skill-name>] [--update]"
allowed-tools: Read Write Edit Glob Grep Bash(mkdir *) Bash(ls *) Bash(find *) Bash(wc *) Bash(python3 *) WebFetch WebSearch AskUserQuestion
disable-model-invocation: false
metadata:
  author: ai-factory
  version: "1.0"
  category: knowledge-management
---

# Distillation

Turn source material into a useful skill. The output is not a summary dump: it is an operational skill that captures the best practices, decision rules, workflows, checks, and examples from the material.

## Step 0: Load Config and Skill Context

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:
- `language.ui` for prompts, questions, progress updates, and final summaries
- `language.artifacts` for generated skill package content (`SKILL.md`, `references/`, `examples/`)
- `language.technical_terms` for translated artifacts; default to `keep` when absent

If config.yaml doesn't exist, use defaults:
- `language.ui`: `en`
- `language.artifacts`: same as `language.ui`
- `language.technical_terms`: `keep`

**Read `.ai-factory/skill-context/aif-distillation/SKILL.md`** - MANDATORY if the file exists.

Treat skill-context rules as project-level overrides for this skill. They apply to all generated skill files, references, examples, source maps, and final reports.

## Inputs

Accept `$ARGUMENTS` as one or more:
- local files
- local directories
- URLs
- optional `--name <skill-name>`
- optional `--update` to improve an existing skill instead of creating a duplicate

If the target skill name is missing, derive a concise, general, lowercase-hyphenated name from the material topic, such as `clean-code-style`, `api-design-rules`, or `ddd-modeling`.

Before any write, validate the final target skill name:
- It must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
- Reject empty names, overlong names, `.`, `..`, dots, path separators (`/` or `\`), absolute paths, Windows drive paths, and hidden names.
- Reject reserved `aif-*` names unless the user explicitly says they are developing AI Factory itself.
- Resolve the final destination path and confirm it is inside `{{skills_dir}}` before creating or updating files.

Default destination: `{{skills_dir}}/<skill-name>/` for the current agent. Do not save distilled skills into the package `skills/` directory unless the user is explicitly developing AI Factory itself.

## Workflow

1. Prepare sources.
   - For normal text, markdown, JSON, YAML, HTML, or code files, read directly.
   - For large folders or PDFs, use `{{skills_dir}}/aif-distillation/scripts/material-prep.py` to extract and chunk material, then clean temporary extraction artifacts with the helper after the skill is generated.
   - For URLs, fetch the source and any critical linked pages needed to understand the topic.

2. Distill, do not copy.
   - Extract transferable principles, workflows, heuristics, checklists, terminology, and failure modes.
   - Inventory examples from the source, especially code snippets, before deciding the output structure.
   - Group source examples by topic so coverage can be checked later.
   - Preserve only short source excerpts when essential. Prefer paraphrase and cite sources.
   - Convert narrative advice into agent-operable instructions and source examples into original, reusable examples.

3. Design the target skill package.
   - Keep target `SKILL.md` focused on purpose, triggers, and workflow.
   - Put detailed knowledge in `references/`.
   - Put reusable prompts, cases, and transformed examples in `examples/`.
   - If the material teaches programming with code examples, create or update an examples file with original before/after snippets or compact code patterns. Do not omit code examples only because verbatim copying is inappropriate.
   - For book-scale or broad code material, cover every major code-facing topic with an adapted example, or state why a topic does not need one. Split examples into multiple files when one file would become a shallow sampler.
   - Add scripts only when the workflow needs repeatable processing.
   - Save the package under `{{skills_dir}}/<skill-name>/` using the chosen concise name.
   - Use resolved `language.artifacts` for generated skill content unless the source material or user explicitly requires another language.

4. Check existing content before writing.
   - If the target skill already has matching references or examples, update them in place.
   - Do not create near-duplicate files with different names.
   - Preserve useful existing material and add only missing or better distilled content.

5. Validate usefulness.
   - The skill must tell an agent what to do, when to do it, what good output looks like, and what mistakes to avoid.
   - References must be dense and navigable.
   - Examples must demonstrate decisions or transformations, not decorative filler.
   - If source material contained meaningful code snippets or worked examples, the generated skill must include adapted examples. Missing adapted examples is a failure to fix before finishing.
   - Example coverage must match the source map: major code-facing source areas should point to concrete examples, not just prose references.
   - Generated skills must include an artifact ownership/config policy section when they write or read project artifacts.
   - Generated quality-gate skills must follow the `aif-gate-result` contract from `/aif-verify` references.

## Required Supporting Guidance

Read these before generating or updating a distilled skill:
- `references/DISTILLATION-PROTOCOL.md`
- `references/OUTPUT-STRUCTURE.md`
- `references/LARGE-MATERIALS.md`

Use `examples/REQUESTS.md` for invocation patterns.

## Artifact Ownership

- Primary ownership: generated or updated skill packages under `{{skills_dir}}/<skill-name>/`.
- Read-only context: `.ai-factory/config.yaml`, existing AI Factory context artifacts, and existing skill files except the selected target skill in update mode.
- Config policy: config-aware for `language.ui`, `language.artifacts`, and `language.technical_terms` only. Do not write `config.yaml`.
