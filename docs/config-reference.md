[← Configuration](configuration.md) · [Back to README](../README.md)

# Config Reference

This page is the key-by-key reference for `.ai-factory/config.yaml`.

Use it when you need to know:
- which keys exist and what their defaults are,
- which built-in skills read them,
- which skills may write `config.yaml`,
- which skills are intentionally config-agnostic.

## Ownership

`config.yaml` is a user-editable file, but built-in skills follow a narrow write contract.

| Operation | Allowed writer | Scope |
|-----------|----------------|-------|
| Create the initial file | `/aif` | Whole file from `skills/aif/references/config-template.yaml` |
| Bootstrap config while adding the first area rule | `/aif-rules area:<name>` | Minimal config scaffold plus the new `rules.<area>` entry |
| Refresh the file during setup reruns | `/aif` | Managed keys only; preserve existing comments, manual edits outside targeted keys, unknown sections, and `rules.<area>` entries |
| Register a new area rule | `/aif-rules area:<name>` | `rules.<area>` entry only |
| Manual edits | Developer | Any key |

All other built-in skills treat `config.yaml` as read-only input.

## `/aif` Setup Order

During setup, `/aif` resolves `language.ui` and `language.artifacts` immediately after mode detection and before it writes any setup artifact.

- If both language keys already exist in `config.yaml`, `/aif` reuses them and does not ask again.
- If only one language key exists, `/aif` keeps the existing value and resolves only the missing key via `config.yaml` → `AGENTS.md` → `CLAUDE.md` → `RULES.md` → user question.
- `/aif` preserves an existing `language.technical_terms` value and defaults it to `keep` only when the key is missing.
- Initial creation starts from the full commented template at `skills/aif/references/config-template.yaml`.
- When `.ai-factory/config.yaml` already exists, `/aif` updates only the managed subset (`language.*`, `paths.*`, `workflow.*`, selected `git.*`, and `rules.base`) and preserves comments, unknown sections, manual edits outside targeted keys, and existing `rules.<area>` entries.
- After language resolution, `/aif` updates `config.yaml` via `skills/aif/references/update-config.mjs` before writing `.ai-factory/DESCRIPTION.md`, `.ai-factory/rules/base.md`, `AGENTS.md`, or invoking `/aif-architecture`.
- This ordering keeps all setup-time artifacts in a single run aligned to one `language.artifacts` value, while prompts, questions, summaries, and next-step guidance use `language.ui`.

## Schema Summary

| Section | Purpose |
|---------|---------|
| `language` | Prompt language and artifact language |
| `paths` | Artifact locations under project root |
| `warmup` | Optional extra session context for `/aif-warmup` |
| `workflow` | Workflow-level defaults and feature flags |
| `git` | Git-aware planning / verification behavior |
| `rules` | Base rules file plus named area-rule files |

## Key Reference

### `language`

| Key | Default | Read by skills | Notes |
|-----|---------|----------------|-------|
| `language.ui` | `en` | `/aif`, `/aif-architecture`, `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-rules-check`, `/aif-commit`, `/aif-fix`, `/aif-improve`, `/aif-loop`, `/aif-docs`, `/aif-evolve`, `/aif-transfer`, `/aif-reference`, `/aif-distillation`, `/aif-rules`, `/aif-security-checklist`, `/aif-qa`, `/aif-qa-check`, `/aif-warmup` | UI language for prompts, questions, and summaries; `/aif` resolves it before downstream setup questions |
| `language.artifacts` | `en` | `/aif`, `/aif-architecture`, `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-improve`, `/aif-loop`, `/aif-docs`, `/aif-fix`, `/aif-evolve`, `/aif-transfer`, `/aif-reference`, `/aif-distillation`, `/aif-rules`, `/aif-security-checklist`, `/aif-qa`, `/aif-qa-check`, `/aif-warmup` | Language for generated or persisted artifacts; `/aif` locks it before the first setup artifact so DESCRIPTION/rules base/AGENTS/ARCHITECTURE stay aligned in one run; workflow artifact writers use it for plans, research, fix plans, patches, references, rules, security ignore state, docs, evolution reports, and QA artifacts, with fallback to `language.ui`; `/aif-warmup` only reports the configured preference |
| `language.technical_terms` | `keep` | `/aif-plan`, `/aif-explore`, `/aif-improve`, `/aif-fix`, `/aif-transfer`, `/aif-reference`, `/aif-distillation`, `/aif-rules`, `/aif-security-checklist`, `/aif-qa`, `/aif-qa-check`, `/aif-warmup` | Present in schema and template; `/aif` preserves an existing value when present and otherwise writes the default `keep`; artifact-writing skills use it to decide whether human-readable terminology should stay in English, be translated, or use mixed style while preserving commands, paths, identifiers, config keys, package names, API names, machine-readable metadata keys/status values, and raw errors where required; `/aif-warmup` only reports the configured preference |

### `paths`

| Key | Default | Read by skills | Notes |
|-----|---------|----------------|-------|
| `paths.description` | `.ai-factory/DESCRIPTION.md` | `/aif-architecture`, `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-commit`, `/aif-fix`, `/aif-improve`, `/aif-evolve`, `/aif-transfer`, `/aif-docs`, `/aif-qa`, `/aif-qa-check`, `/aif-warmup` | Core project description artifact |
| `paths.architecture` | `.ai-factory/ARCHITECTURE.md` | `/aif-architecture`, `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-commit`, `/aif-fix`, `/aif-docs`, `/aif-loop`, `/aif-evolve`, `/aif-transfer`, `/aif-qa`, `/aif-qa-check`, `/aif-warmup` | Architecture source of truth |
| `paths.docs` | `docs/` | `/aif-docs` | Detailed docs directory; `README.md` stays fixed in project root |
| `paths.roadmap` | `.ai-factory/ROADMAP.md` | `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-commit`, `/aif-loop`, `/aif-warmup` | Strategic roadmap artifact |
| `paths.research` | `.ai-factory/RESEARCH.md` | `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-improve`, `/aif-fix`, `/aif-warmup` | Regular persisted exploration file; ultra bundles derive `<parent>/research/<english-slug>/` from this path and keep a compatible `RESEARCH.md` inside |
| `paths.rules_file` | `.ai-factory/RULES.md` | `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-rules-check`, `/aif-commit`, `/aif-fix`, `/aif-evolve`, `/aif-transfer`, `/aif-rules`, `/aif-reference`, `/aif-loop`, `/aif-warmup` | Top-level rules artifact |
| `paths.plan` | `.ai-factory/PLAN.md` | `/aif-plan`, `/aif-explore`, `/aif-improve`, `/aif-implement`, `/aif-verify`, `/aif-rules-check`, `/aif-commit`, `/aif-loop` | Fast-plan path |
| `paths.plans` | `.ai-factory/plans/` | `/aif-plan`, `/aif-explore`, `/aif-improve`, `/aif-implement`, `/aif-verify`, `/aif-rules-check`, `/aif-commit`, `/aif-loop`, `/aif-archive` | Named plans directory: full plans are root `.md` files; ultra plans are direct child directories whose `index.md` contains the stable `<!-- aif:plan-mode:ultra -->` marker plus linked phase files |
| `paths.fix_plan` | `.ai-factory/FIX_PLAN.md` | `/aif-fix`, `/aif-improve`, `/aif-implement`, `/aif-verify` | Fix-plan path |
| `paths.security` | `.ai-factory/SECURITY.md` | `/aif-security-checklist` | Security ignore-state artifact |
| `paths.references` | `.ai-factory/references/` | `/aif-reference` | Knowledge reference storage |
| `paths.patches` | `.ai-factory/patches/` | `/aif-plan`, `/aif-improve`, `/aif-implement`, `/aif-fix`, `/aif-evolve`, `/aif-transfer` (source config only) | Fix patches and fallback learning context; transfer never writes or copies them |
| `paths.evolutions` | `.ai-factory/evolutions/` | `/aif-plan`, `/aif-evolve`, `/aif-transfer` | Evolution logs and patch cursor; transfer delegates one approved log but never touches the cursor |
| `paths.evolution` | `.ai-factory/evolution/` | `/aif-loop` | Reflex loop state root |
| `paths.specs` | `.ai-factory/specs/` | `/aif-plan`, `/aif-verify` | Specs / archived plan support |
| `paths.rules` | `.ai-factory/rules/` | `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-rules-check`, `/aif-commit`, `/aif-fix`, `/aif-evolve`, `/aif-transfer`, `/aif-rules`, `/aif-warmup` | Area-rules directory and relative rule resolution base |
| `paths.qa` | `.ai-factory/qa/` | `/aif-qa`, `/aif-qa-check` | QA artifacts root; branch slug is appended as subdirectory (`<paths.qa>/<branch-slug>/`). `/aif-qa` writes `change-summary.md`, `test-plan.md`, and `test-cases.md`; `/aif-qa-check` writes revision/worktree/source/target/replay-bound `qa-check.md`, canonical per-case `browser-replay/TC-NNN.js` scripts, preserved replacements under `browser-replay/history/`, and root-level agent memory. |
| `paths.archive` | `.ai-factory/archive/` | `/aif-archive`, `/aif-plan`, `/aif-implement`, `/aif-verify`, `/aif-improve` | Archive directory for completed plans and roadmap snapshots. `archive/plans/` stores full `.md` plans and ultra bundle directories; `archive/roadmap/` stores dated snapshots. Plan identifiers retain any sequential prefix. |

### `warmup`

| Key | Default | Read by skills | Notes |
|-----|---------|----------------|-------|
| `warmup.paths` | `[]` | `/aif-warmup` | Ordered extra files or directories loaded after core context. Entries must remain inside project root; directories are scanned recursively for readable text. Outside-root, missing/unreadable, binary, symlinked, sensitive, generated, or context-limited entries are reported instead of silently ignored. This user-owned option is included in new config templates and preserved on setup reruns; absence in an existing config is equivalent to `[]`. |

### `workflow`

| Key | Default | Read by skills | Notes |
|-----|---------|----------------|-------|
| `workflow.auto_create_dirs` | `true` | No dedicated built-in reader yet | Present in schema/template; reserved for directory-management behavior |
| `workflow.plan_id_format` | `slug` | `/aif-plan`, `/aif-implement`, `/aif-improve`, `/aif-explore`, `/aif-verify`, `/aif-rules-check`, `/aif-commit`, `/aif-archive`, `/aif-warmup` | Active values: `slug` (default), `sequential`; `timestamp` and `uuid` are reserved and fall back to `slug`. Sequential writes a full plan as `paths.plans/<NNNN>_<stem>.md` or an ultra bundle as `paths.plans/<NNNN>_<stem>/index.md`. Allocation counts numbered full files and only directories whose `index.md` has the exact ultra marker, uses max + 1, starts at `0001`, caps at `9999`, ignores unrelated numbered directories, and excludes the archive. Moving/deleting the highest active artifact can free its number. Force-disabled when `HANDOFF_BRANCH_PREPARED=1`. `/aif-warmup` only reports the configured preference. |
| `workflow.analyze_updates_architecture` | `true` | No dedicated built-in reader yet | Present in schema/template; reserved for setup/update workflow control |
| `workflow.architecture_updates_roadmap` | `true` | No dedicated built-in reader yet | Present in schema/template; reserved for architecture-to-roadmap automation |
| `workflow.verify_mode` | `normal` | `/aif-verify`, `/aif-warmup` | Default strictness for verification runs; `/aif-warmup` only reports the configured preference |

### `git`

| Key | Default | Read by skills | Notes |
|-----|---------|----------------|-------|
| `git.enabled` | `true` | `/aif`, `/aif-plan`, `/aif-improve`, `/aif-implement`, `/aif-verify`, `/aif-rules-check`, `/aif-commit`, `/aif-qa`, `/aif-qa-check`, `/aif-warmup` | Disables branch/worktree assumptions when false; `/aif-qa` switches to manual change context instead of git diffing; `/aif-warmup` only reports the configured preference |
| `git.base_branch` | `main` with auto-detect fallback | `/aif`, `/aif-plan`, `/aif-improve`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-rules-check`, `/aif-qa`, `/aif-warmup` | Target branch for diff, merge, and verification guidance; `/aif-warmup` only reports the configured preference |
| `git.create_branches` | `true` | `/aif`, `/aif-plan`, `/aif-improve`, `/aif-implement`, `/aif-verify`, `/aif-commit`, `/aif-warmup` | Full and ultra plans still exist when false; they skip automatic branch creation; `/aif-warmup` only reports the configured preference |
| `git.branch_prefix` | `feature/` | `/aif`, `/aif-plan`, `/aif-warmup` | Prefix for auto-created full-plan branches; `/aif-warmup` only reports the configured preference |
| `git.skip_push_after_commit` | `false` | `/aif-commit`, `/aif-warmup` | When true, `/aif-commit` skips push prompt and ends after local commit; `/aif-warmup` only reports the configured preference |

### `rules`

| Key | Default | Read by skills | Notes |
|-----|---------|----------------|-------|
| `rules.base` | `.ai-factory/rules/base.md` | `/aif-implement`, `/aif-verify`, `/aif-rules-check`, `/aif-commit`, `/aif-fix`, `/aif-evolve`, `/aif-transfer`, `/aif-warmup` | Base project rule file |
| `rules.<area>` | none | `/aif-implement`, `/aif-verify`, `/aif-rules-check`, `/aif-commit`, `/aif-fix`, `/aif-evolve`, `/aif-transfer`, `/aif-warmup`; written by `/aif-rules area:<name>` | Named area rule entries like `rules.api`, `rules.frontend`; preserved during `/aif` reruns |

## Skill Matrix

### Config Writers

| Skill | Reads config | Writes config | Write scope |
|-------|--------------|---------------|-------------|
| `/aif` | Yes | Yes | Creates the initial file from the commented template; reruns update only managed keys while preserving comments, custom edits outside targeted keys, unknown sections, and `rules.<area>` |
| `/aif-rules` | Yes | Yes, limited | Adds or updates `rules.<area>` registrations when creating area rules; may bootstrap a minimal config file when the first area rule is created |

### Config Readers

| Skill | Reads config | Writes config | Main sections used |
|-------|--------------|---------------|--------------------|
| `/aif-architecture` | Yes | No | `paths.description`, `paths.architecture`, `language.ui`, `language.artifacts` |
| `/aif-plan` | Yes | No | `paths.*` for planning artifacts, `language.ui`, `language.artifacts`, `language.technical_terms`, `git.*` |
| `/aif-explore` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.research`, `paths.plan`, `paths.plans`, `paths.rules`, `language.ui`, `language.artifacts`, `language.technical_terms` |
| `/aif-roadmap` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.research`, `paths.rules`, `language.ui`, `language.artifacts` |
| `/aif-improve` | Yes | No | `paths.plan`, `paths.plans`, `paths.fix_plan`, `paths.research`, `paths.description`, `paths.patches`, `language.ui`, `language.artifacts`, `language.technical_terms`, `git.enabled`, `git.base_branch`, `git.create_branches` |
| `/aif-implement` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.research`, `paths.plan`, `paths.plans`, `paths.fix_plan`, `paths.patches`, `paths.rules`, `language.ui`, `language.artifacts`, `git.enabled`, `git.base_branch`, `git.create_branches`, `rules.base`, `rules.<area>` |
| `/aif-verify` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.research`, `paths.plan`, `paths.plans`, `paths.fix_plan`, `paths.specs`, `paths.rules`, `workflow.verify_mode`, `language.ui`, `git.enabled`, `git.base_branch`, `git.create_branches`, `rules.base`, `rules.<area>` |
| `/aif-rules-check` | Yes | No | `paths.rules_file`, `paths.rules`, `paths.plan`, `paths.plans`, `language.ui`, `git.enabled`, `git.base_branch`, `rules.base`, `rules.<area>` |
| `/aif-commit` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.rules`, `paths.plan`, `paths.plans`, `workflow.plan_id_format`, `language.ui`, `git.enabled`, `git.create_branches`, `git.skip_push_after_commit`, `rules.base`, `rules.<area>` |
| `/aif-review` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.rules`, `language.ui`, `git.base_branch` |
| `/aif-loop` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.plan`, `paths.plans`, `paths.evolution`, `language.ui`, `language.artifacts` |
| `/aif-docs` | Yes | No | `paths.description`, `paths.architecture`, `paths.docs`, `language.ui`, `language.artifacts` |
| `/aif-fix` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.rules`, `paths.research`, `paths.fix_plan`, `paths.patches`, `language.ui`, `language.artifacts`, `language.technical_terms`, `rules.base`, `rules.<area>` |
| `/aif-evolve` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.rules`, `paths.patches`, `paths.evolutions`, `language.ui`, `language.artifacts`, `rules.base`, `rules.<area>` |
| `/aif-transfer` | Yes | No | Current project: `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.rules`, `paths.evolutions`, `language.ui`, `language.artifacts`, `language.technical_terms`, `rules.base`, and `rules.<area>`; source project: `paths.description`, `paths.architecture`, and `paths.patches` inside the source root |
| `/aif-reference` | Yes | No | `paths.references`, `paths.rules_file`, `language.ui`, `language.artifacts`, `language.technical_terms` |
| `/aif-distillation` | Yes | No | `language.ui`, `language.artifacts`, `language.technical_terms` |
| `/aif-security-checklist` | Yes | No | `paths.security`, `language.ui`, `language.artifacts`, `language.technical_terms` |
| `/aif-rules` | Yes | Yes, limited | `paths.rules_file`, `paths.rules`, `language.ui`, `language.artifacts`, `language.technical_terms`; writes only `rules.<area>` registrations and may bootstrap minimal config for first area rule |
| `/aif-qa` | Yes | No | `paths.description`, `paths.architecture`, `paths.qa`, `language.ui`, `language.artifacts`, `language.technical_terms`, `git.enabled`, `git.base_branch` |
| `/aif-qa-check` | Yes | No | `paths.description`, `paths.architecture`, `paths.qa`, `language.ui`, `language.artifacts`, `language.technical_terms`, `git.enabled` |
| `/aif-archive` | Yes | No | `paths.plans`, `paths.archive`, `paths.plan`, `paths.fix_plan`, `paths.roadmap`, `workflow.plan_id_format`, `language.ui` |
| `/aif-warmup` | Yes | No | `paths.description`, `paths.architecture`, `paths.roadmap`, `paths.research`, `paths.rules_file`, `paths.rules`, `rules.base`, `rules.<area>`, `warmup.paths`, `language.ui`, `language.artifacts`, `language.technical_terms`, selected `git.*`, `workflow.plan_id_format`, `workflow.verify_mode` |

### Config-Agnostic Built-ins

| Skill | Reads config | Writes config | Notes |
|-------|--------------|---------------|-------|
| `/aif-best-practices` | No | No | Uses repository context and skill-context only |
| `/aif-build-automation` | No | No | Repo and tool detection drive outputs |
| `/aif-ci` | No | No | Repo and platform detection drive outputs |
| `/aif-dockerize` | No | No | Repo and infrastructure choices drive outputs |
| `/aif-grounded` | No | No | Evidence-only reasoning gate |
| `/aif-skill-generator` | No | No | Driven by user input and source material |

## Fixed Paths Outside the Current Schema

These locations are still fixed by contract and are not yet configurable via `config.yaml`:

| Path | Notes |
|------|-------|
| `.ai-factory/skill-context/` | Built-in skill overrides written by `/aif-evolve`, directly or through `/aif-transfer` |
| `README.md` | Landing page for `/aif-docs` |
| `docs-html/` | Static HTML output for `/aif-docs --web` |

## See Also

- [Configuration](configuration.md) — high-level config architecture and project structure
- [Core Skills](skills.md) — full skill reference
- [Development Workflow](workflow.md) — where config-aware workflow skills fit end to end
