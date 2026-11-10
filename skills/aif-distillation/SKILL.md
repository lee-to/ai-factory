---
name: aif-distillation
description: >-
  Distill books, documents, folders, or URLs into compact, practical Agent Skills.
  Use when source material should become either one reusable skill package or a
  split set of focused skills, each with a concise SKILL.md plus detailed
  references and examples.
argument-hint: "<path|url> [path|url...] [--name <skill-name>] [--path <directory>] [--update] [--redact-source-map] [--split|--split-by <strategy>]"
allowed-tools: Read Write Edit Glob Grep Bash(mkdir *) Bash(ls *) Bash(find *) Bash(wc *) Bash(python3 --version) Bash(python --version) Bash(py -3 --version) Bash(py --version) Bash(python3 *material-prep.py*) Bash(python *material-prep.py*) Bash(py -3 *material-prep.py*) Bash(py *material-prep.py*) WebFetch WebSearch AskUserQuestion
disable-model-invocation: false
metadata:
  author: ai-factory
  version: "1.0"
  category: knowledge-management
---

# Distillation

## Runtime-aware questions

Apply this contract whenever the workflow asks the user to decide:

- `AskUserQuestion` and `Questions` below describe the intended interaction, not a required tool name. Use only a question tool actually exposed and permitted in the current session/mode, with its advertised schema. Do not guess aliases, probe unavailable tools, or assume `questionnaire` exists. A frontmatter entry alone does not make a tool available.
- Ask one focused question at a time with clearly labelled options. Batch independent questions only if the actual tool schema supports it; respect its field names, limits, and selection semantics. For open-ended input, use native free-text support or plain text if the schema cannot represent the question. Use the resolved UI language.
- If no usable question tool exists (or it reports unavailable in this mode), ask the same question in plain text with numbered options and allow a free-text answer. Pause work that depends on that answer; independent read-only investigation may continue. Missing UI does not make the session autonomous.
- An empty/cancelled response, a preselected option, or elapsed time is not an answer or approval. Reuse an answer already given in the session instead of asking again.
- In a subagent/background run or explicit non-interactive mode (including `HANDOFF_MODE=1`), do not prompt the user directly. Use declared defaults only for optional preferences within the authorized scope and report assumptions. If a required decision, approval, or material scope/behavior choice remains unresolved, stop dependent work and return the missing decision and options to the parent/caller using its existing blocked/failure contract. Never invent consent or select a new scope to avoid blocking.

This delivery policy applies to this skill and its linked references. Preserve workflow-specific question scope, required confirmations, approval boundaries, and blocked-result rules.

## Shared project skill-context

Before mode routing or work, read existing files relative to the current project root in this order (reuse them if already loaded):

1. `.ai-factory/skill-context/global-skill-context.md` — all bundled skills.
2. `.ai-factory/skill-context/aif-distillation/SKILL.md` — this skill.

Missing files are skipped; an existing unreadable file stops dependent work with its path.
Precedence: individual > build (when applicable) > global > skill defaults; retain non-conflicting instructions and check all outputs against the effective rules.
These layers customize workflow; they do not replace the project's rules/architecture hierarchy or relax explicit requirements, ownership, scope, safety/privacy, validation, or approval boundaries. Report conflicts with those boundaries instead of overriding them.
`global` is a project-local layer, not home-directory configuration. Custom/extension skills do not automatically use it.

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

Treat skill-context rules as project-level overrides for this skill. They apply to all generated skill files, references, examples, source-map policy, and final reports.

## Inputs

Accept `$ARGUMENTS` as one or more:
- local files
- local directories
- URLs
- optional `--name <skill-name>`
- optional `--path <directory>` to save generated skill package directories under a custom output root instead of `{{skills_dir}}`
- optional `--update` to improve an existing skill instead of creating a duplicate
- optional `--redact-source-map` to skip generated source-map files and sections entirely, so exact source titles, URLs, local paths, repository paths, and link reference definitions are not written to output
- optional `--split` to create several focused skills from one material set
- optional `--split-by <strategy>` to choose the split strategy:
  - `auto` (default): infer skill boundaries from user goals, triggers, workflows, source topics, and use cases
  - `goal`: split by user goals or jobs-to-be-done, regardless of domain
  - `topic`: split by major source topics or chapters
  - `workflow`: split by recurring actions an agent performs
  - `audience`: split by distinct user roles or implementation contexts

If the target skill name is missing, derive a concise, general, lowercase-hyphenated name from the material topic or user goal, such as `clean-code-style`, `api-design-rules`, `decision-making`, `writing-feedback`, or `meeting-facilitation`.

Before any write, validate the final target skill name:
- It must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
- Reject empty names, overlong names, `.`, `..`, dots, path separators (`/` or `\`), absolute paths, Windows drive paths, and hidden names.
- Reject reserved `aif-*` names unless the user explicitly says they are developing AI Factory itself.
- Resolve the output root: `--path <directory>` when present, otherwise `{{skills_dir}}`.
- Treat relative `--path` values as relative to the current working directory. Create the output root if it does not exist; reject it if it resolves to an existing file.
- Resolve the final destination path and confirm it is inside the resolved output root before creating or updating files.

Default destination for single-skill mode: `<output-root>/<skill-name>/`, where `<output-root>` is `{{skills_dir}}` unless `--path` is present.

Default destination for split mode: `<output-root>/<prefix>-<child-scope>/` for each generated child skill. Every split child name must share one namespace prefix to prevent collisions with existing skills. Use `--name` as the preferred prefix when present; otherwise derive a concise prefix from the book title or primary material title. If `--redact-source-map` is present and the exact source title should not be exposed, use `--name` as the public namespace or derive a neutral topic prefix.

Do not save distilled skills into the package `skills/` directory unless the user is explicitly developing AI Factory itself.

## Workflow

1. Prepare sources.
   - Record source kind, permitted locator, edition/revision/digest, output relationship, and known license/terms using `references/SOURCE-USE.md`. Keep `known`, `unknown`, `not-applicable`, and `redacted` distinct; record conflicting terms without deciding permission.
   - For normal text, markdown, JSON, YAML, HTML, or code files, read directly.
   - For large folders or PDFs, use `{{skills_dir}}/aif-distillation/scripts/material-prep.py` only when a working Python 3 interpreter is available. Detect it with `python3 --version`, `python --version`, `py -3 --version`, then `py --version`; use the first command that exits successfully and reports Python major version 3.
   - When invoking the helper, expand the selected interpreter to the concrete command shape, such as `python3 ...material-prep.py` or `py -3 ...material-prep.py`. Do not run arbitrary Python payloads; the pre-approved tool contract only covers version probes and `material-prep.py` execution.
   - If Python 3 is not available, do not invoke the helper. Continue with direct `Read`/`Glob`/`Grep`/`find`/`wc` sampling for accessible text files, ask the user for a text/markdown export for PDFs or very large sources, and clearly report any reduced coverage.
   - For URLs, fetch the source and any critical linked pages needed to understand the topic.

2. Distill, do not copy.
   - Separate short quoted/referenced material, agent interpretation, and independently authored guidance. Preserve relevant notices and explicit user/project export restrictions; independent authorship is not legal approval.
   - Extract transferable principles, workflows, heuristics, checklists, terminology, and failure modes.
   - Inventory examples from the source, especially code snippets, before deciding the output structure.
   - Group source examples by topic so coverage can be checked later.
   - Preserve only short source excerpts when essential. Prefer paraphrase and cite sources.
   - Convert narrative advice into agent-operable instructions and source examples into original, reusable examples.

3. Choose single-skill or split-skill design.
   - Default to single-skill mode unless `--split` or `--split-by` is present.
   - In split mode, resolve one shared namespace prefix before writing the boundary map. Use `--name` when present; otherwise use a normalized book/material title. Every proposed child name must start with `<prefix>-`.
   - In split mode, create a skill boundary map before writing: proposed prefixed skill name, user-facing job, trigger description, owned source topics, references/examples needed, and overlap risks.
   - Prefer split mode when the material contains independent goals that should trigger separately, such as reviewing, planning, diagnosing, rewriting, teaching, deciding, testing, facilitating, auditing, or troubleshooting.
   - Name split children by the user goal or job-to-be-done, not by an abstract source theme. Choose the goal taxonomy from the material's domain: for software this may be `refactoring-review`, `test-design`, or `framework-fit-review`; for writing this may be `argument-edit` or `style-review`; for operations this may be `incident-triage` or `runbook-review`; for management this may be `decision-brief` or `stakeholder-analysis`; for learning this may be `concept-coach` or `practice-drill`.
   - Avoid vague lifecycle or chapter names such as `framework-evolution`, `principles`, `philosophy`, `chapter-4`, `mindset`, or `overview` unless that exact name is the user's requested public taxonomy.
   - Do not split into tiny skills that differ only by wording. Merge candidates when their triggers, workflow, and reference needs substantially overlap.
   - Keep every generated child skill independently useful: clear frontmatter, focused workflow, and relevant references/examples. If `--redact-source-map` is absent, include its own source map; if present, do not create `references/SOURCE-MAP.md` or a source-map section.

4. Design the target skill package.
   - Keep target `SKILL.md` focused on purpose, triggers, and workflow.
   - Make the generated skill self-explanatory from its directory name and frontmatter. The description must start with an action verb and say what the skill reviews, improves, generates, or checks.
   - Near the top of every generated `SKILL.md`, answer in plain language: what this skill does, when to use it, and what output it should produce. A user should not need to inspect the source material to understand why the skill exists.
   - Put detailed knowledge in `references/`.
   - Put reusable prompts, cases, and transformed examples in `examples/`.
   - If the material teaches programming with code examples, create or update an examples file with original before/after snippets or compact code patterns. Do not omit code examples only because verbatim copying is inappropriate.
   - For book-scale or broad code material, cover every major code-facing topic with an adapted example, or state why a topic does not need one. Split examples into multiple files when one file would become a shallow sampler.
   - Add scripts only when the workflow needs repeatable processing.
   - Resolve `<output-root>` from `--path` or `{{skills_dir}}` before writing. Treat `--path` as a parent directory for generated skill packages, not as the skill package name.
   - In single-skill mode, save the package under `<output-root>/<skill-name>/` using the chosen concise name.
   - In split mode, save each child package directly under `<output-root>/<prefix>-<child-scope>/`. Do not drop the shared prefix even when the child scope is clear on its own.
   - When `--redact-source-map` is present, do not create `references/SOURCE-MAP.md`, do not create a "Source Map" section in any generated file, and remove any empty `SOURCE-MAP.md` accidentally created during drafting. In `--update` mode, leave an existing non-empty `SOURCE-MAP.md` unchanged unless the user explicitly asks to remove or rewrite it.
   - Use resolved `language.artifacts` for generated skill content unless the source material or user explicitly requires another language.

5. Check existing content before writing.
   - If the target skill already has matching references or examples, update them in place.
   - Do not create near-duplicate files with different names.
   - Preserve useful existing material and add only missing or better distilled content.
   - In split mode, also check existing sibling skills under `<output-root>` for matching triggers. Update a matching skill with `--update` instead of creating a new near-duplicate child.

6. Validate usefulness.
   - Validate source-use metadata against `references/SOURCE-USE.md`, including revision invalidation on source/terms changes, split children, and redacted output. Missing terms do not block local distillation or imply redistribution permission.
   - The skill must tell an agent what to do, when to do it, what good output looks like, and what mistakes to avoid.
   - The name and description must be invocation-ready. If a user would ask "what does this skill actually do?", rename it or rewrite the trigger before finishing.
   - References must be dense and navigable.
   - Examples must demonstrate decisions or transformations, not decorative filler.
   - If source material contained meaningful code snippets or worked examples, the generated skill must include adapted examples. Missing adapted examples is a failure to fix before finishing.
   - Example coverage must match source coverage: when `--redact-source-map` is absent, record this in the source map; when present, validate coverage internally without writing source-map files or sections.
   - Generated skills must include an artifact ownership/config policy section when they write or read project artifacts.
   - Generated quality-gate skills must follow the `aif-gate-result` contract from `/aif-verify` references.
   - In split mode, every child skill must have a distinct activation trigger. If two children would activate for the same request and tell the agent to do the same work, merge them before finishing.

## Optional project application handoff

If the user wants to evaluate a distilled practice in a specific project,
suggest `/aif-explore` to formulate a source-linked hypothesis. Preserve source
conditions and carry forward disclosure restrictions, including
`--redact-source-map`; do not reintroduce restricted identifiers in the handoff.
Carry the current source-use metadata revision, relevant notices, export
restrictions, conflicts, and unresolved owner decisions into any downstream
handoff. Redacted handoffs must explicitly retain reduced public traceability.
Distillation still writes only the selected skill outputs, does not write
RESEARCH/PLAN/RULES/config, and does not authorize a separate installation or
experiment run.

Publication is a separate explicit opt-in by the source/package owner. Local
distillation does not automatically publish sources or skills, install a skill
separately, train a model, or copy full books. No registry, network license lookup,
or new mandatory legal-approval gate is required; unresolved reuse decisions stay
with the owner.

## Required Supporting Guidance

Read these before generating or updating a distilled skill:
- `references/DISTILLATION-PROTOCOL.md`
- `references/SOURCE-USE.md`
- `references/OUTPUT-STRUCTURE.md`
- `references/LARGE-MATERIALS.md`

Use `examples/REQUESTS.md` for invocation patterns.

## Artifact Ownership

- Primary ownership: generated or updated skill packages under `<output-root>/<skill-name>/`, or multiple direct child skill packages under `<output-root>/<prefix>-<child-scope>/` in split mode. `<output-root>` is `{{skills_dir}}` unless the user passes `--path <directory>`.
- Read-only context: `.ai-factory/config.yaml`, existing AI Factory context artifacts, and existing skill files except the selected target skill in update mode.
- Config policy: config-aware for `language.ui`, `language.artifacts`, and `language.technical_terms` only. Do not write `config.yaml`.
