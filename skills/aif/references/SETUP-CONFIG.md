Resolve `<reference-dir>` as the `references` directory beside the installed entrypoint, including flat workflows. Use that actual location for the helper and template below.

**Questions to ask only when a value is still missing:**

```
AskUserQuestion: What UI language should I use for communication during this `/aif` run?

Options:
1. English (en) — Default
2. Russian (ru)
3. Chinese (zh)
4. Other — specify manually
```

```
AskUserQuestion: What artifact language should I use for generated files in this `/aif` run?

Options:
1. Same as `language.ui` (Recommended)
2. English (en)
3. Different language — specify manually
```

**Language mapping notes:**
- `language.ui != English` + `language.artifacts = English` → communication-only localization
- `language.ui = English` + `language.artifacts != English` → artifacts-only localization
- If only one language key was missing, ask only the question for that missing key

**Git workflow detection (if `config.yaml` is missing or the `git:` section is incomplete):**

1. Check whether the project uses git:
   - If `.git` exists - set `git.enabled: true`
   - If `.git` does not exist - set `git.enabled: false` and `git.create_branches: false`
2. If git is enabled, detect the default/base branch from git metadata:
   - Prefer `origin/HEAD`
   - Fallback to remote metadata (`git remote show origin`)
   - Fallback to `main`
3. If git is enabled, preserve the existing setup question about whether
   `/aif-plan full` should create a new branch:

```
AskUserQuestion: How should full plans behave in git?

Options:
1. Create a new branch (Recommended) - /aif-plan full creates a branch and saves the full plan as a branch-scoped file
2. Stay on the current branch - /aif-plan full still creates a rich full plan, but without creating a new branch
```

The stored `git.create_branches` value also governs explicitly requested
`/aif-plan ultra` runs. Do not add an ultra-specific setup question: existing
users who never invoke ultra must see the same setup flow as before.

**Persist resolved settings in `.ai-factory/config.yaml`:**

- Never reconstruct `config.yaml` from memory or by free-writing YAML text.
- Always use `skills/aif/references/update-config.mjs` with `skills/aif/references/config-template.yaml` as the canonical source.
- Write or update `.ai-factory/config.yaml` immediately after resolving the run-scoped language state.
- This write MUST happen before writing the first setup artifact and before invoking `/aif-architecture`.
- Ensure `.ai-factory/` exists before writing the payload or target file.
- First write a temporary payload file (for example `.ai-factory/config.update.json`) via `Write`.
- Then invoke the helper:

```bash
node <reference-dir>/update-config.mjs \
  --template <reference-dir>/config-template.yaml \
  --target .ai-factory/config.yaml \
  --payload .ai-factory/config.update.json
```

- Use `mode: "create"` when `.ai-factory/config.yaml` does not exist.
- Use `mode: "merge"` when `.ai-factory/config.yaml` already exists.
- Preserve `language.technical_terms` from existing config when present; otherwise set it to `keep` when writing config.
- In `set`, include only values explicitly resolved in the current run and that must be written now.
- In `fillMissing`, include canonical defaults that should be backfilled only when the key or section is missing or incomplete.
- Preserve existing command defaults (`workflow.explore_mode`, `workflow.plan_mode`, `workflow.improve_check`, `workflow.fix_mode`, and `workflow.fix_patch`) on reruns unless the user explicitly changes them. Backfill only missing/incomplete values with `regular`, `ask`, `false`, `ask`, and `true`, respectively; do not infer preferences from prior command usage. Preserve `fix_patch: false` as an explicit choice.
- `workflow.roadmap_next_mode` and nested `workflow.roadmap_next_capacity` are optional user-owned settings. Preserve them and their comments verbatim; do not add them to managed updater payloads or backfill them. New configs include commented examples only.
- Managed keys for this helper are limited to:
  - `language.ui`
  - `language.artifacts`
  - `language.technical_terms`
  - `paths.*` (including current schema keys such as `paths.qa`)
  - `workflow.*`
  - `git.enabled`
  - `git.base_branch`
  - `git.create_branches`
  - `git.branch_prefix`
  - `git.skip_push_after_commit`
  - `rules.base`
- `warmup.paths` is user-owned optional configuration: the template includes
  `warmup.paths: []` on initial create, but reruns must not set or backfill it.
  Preserve any existing list unchanged; absence is equivalent to an empty list.
- `writing.*` is user-owned optional configuration. Initial creation includes
  the disabled template defaults; reruns must preserve the entire section and
  must not set, backfill, or infer a writing preference. Missing means disabled.
- Never normalize or overwrite `rules.<area>` entries. Those belong to `/aif-rules`.
- The helper must preserve comments, blank lines, section order, inline comments, unknown sections, custom user values outside targeted keys, and the commented `rules.*` examples from the template.
- If the helper reports an unsafe structure or invalid payload, STOP. Do **not** fall back to free-form YAML generation.
- After the helper succeeds, remove the temporary payload file.

**Payload shape:**

```json
{
  "mode": "create|merge",
  "set": {
    "language.ui": "en",
    "language.artifacts": "en",
    "language.technical_terms": "keep",
    "paths.qa": ".ai-factory/qa/"
  },
  "fillMissing": {
    "git.branch_prefix": "feature/",
    "rules.base": ".ai-factory/rules/base.md"
  }
}
```

- Initial create: pass the resolved canonical values through `set`.
- Rerun merge: use `set` only for values re-resolved in this run; use `fillMissing` for canonical defaults that should be restored only when absent or incomplete.

**Create `.ai-factory/rules/base.md` from codebase evidence:**

After language resolution and config write, analyze the codebase to detect:
- Naming conventions (camelCase, snake_case, PascalCase)
- Module boundaries (src/core/, src/cli/, src/utils/)
- Error handling patterns (try/catch, error codes)
- Control flow patterns (guard clauses, early returns/continues, nested conditionals)
- Logging patterns (console.log, winston, pino)
- Test patterns (jest, mocha, vitest)

Create `.ai-factory/rules/base.md` with detected conventions. Use resolved `language.artifacts` for all headings and service text in this file:

```markdown
# [Localized title for project base rules in resolved artifacts language]

> [Localized note in resolved artifacts language: Auto-detected conventions from codebase analysis. Edit as needed.]

## [Localized heading: Naming Conventions]

- Files: [detected pattern]
- Variables: [detected pattern]
- Functions: [detected pattern]
- Classes: [detected pattern]

## [Localized heading: Module Structure]

- [detected module boundaries]

## [Localized heading: Error Handling]

- [detected error handling pattern]

## Control Flow

- Prefer flat, readable control flow over deeply nested conditionals. Use guard clauses, early `return`/`continue`, small named helper methods, or explicit classification logic when they make the code easier to follow. Handle edge cases and irrelevant branches early so the main path stays visible.

## [Localized heading: Logging]

- [detected logging pattern]
```

---
