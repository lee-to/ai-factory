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
| `workflow` | Workflow-level defaults and feature flags |
| `git` | Git-aware planning / verification behavior |
| `rules` | Base rules file plus named area-rule files |

## Key Reference

### `language`

| Key | Default | Read by skills | Notes |
|-----|---------|----------------|-------|
| `language.ui` | `en` | `/aif`, `/aif-architecture`, `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-rules-check`, `/aif-commit`, `/aif-fix`, `/aif-improve`, `/aif-loop`, `/aif-docs`, `/aif-evolve`, `/aif-reference`, `/aif-rules`, `/aif-security-checklist`, `/aif-qa` | UI language for prompts, questions, and summaries; `/aif` resolves it before downstream setup questions |
| `language.artifacts` | `en` | `/aif`, `/aif-architecture`, `/aif-roadmap`, `/aif-implement`, `/aif-loop`, `/aif-docs`, `/aif-evolve` | Language for generated artifacts; `/aif` locks it before the first setup artifact so DESCRIPTION/rules base/AGENTS/ARCHITECTURE stay aligned in one run |
| `language.technical_terms` | `keep` | No dedicated built-in reader yet | Present in schema and template; `/aif` preserves an existing value when present and otherwise writes the default `keep`, while the wider translation policy stays reserved for future use |

### `paths`

| Key | Default | Read by skills | Notes |
|-----|---------|----------------|-------|
| `paths.description` | `.ai-factory/DESCRIPTION.md` | `/aif-architecture`, `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-commit`, `/aif-fix`, `/aif-improve`, `/aif-evolve`, `/aif-docs` | Core project description artifact |
| `paths.architecture` | `.ai-factory/ARCHITECTURE.md` | `/aif-architecture`, `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-commit`, `/aif-fix`, `/aif-docs`, `/aif-loop`, `/aif-evolve` | Architecture source of truth |
| `paths.docs` | `docs/` | `/aif-docs` | Detailed docs directory; `README.md` stays fixed in project root |
| `paths.roadmap` | `.ai-factory/ROADMAP.md` | `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-commit`, `/aif-loop` | Strategic roadmap artifact |
| `paths.research` | `.ai-factory/RESEARCH.md` | `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-improve`, `/aif-loop` | Persisted exploration context |
| `paths.rules_file` | `.ai-factory/RULES.md` | `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-rules-check`, `/aif-commit`, `/aif-fix`, `/aif-evolve`, `/aif-rules`, `/aif-reference`, `/aif-loop` | Top-level rules artifact |
| `paths.plan` | `.ai-factory/PLAN.md` | `/aif-plan`, `/aif-explore`, `/aif-improve`, `/aif-implement`, `/aif-verify`, `/aif-rules-check`, `/aif-loop` | Fast-plan path |
| `paths.plans` | `.ai-factory/plans/` | `/aif-plan`, `/aif-explore`, `/aif-improve`, `/aif-implement`, `/aif-verify`, `/aif-rules-check`, `/aif-loop` | Full-plan directory |
| `paths.fix_plan` | `.ai-factory/FIX_PLAN.md` | `/aif-fix`, `/aif-improve`, `/aif-implement`, `/aif-verify` | Fix-plan path |
| `paths.security` | `.ai-factory/SECURITY.md` | `/aif-security-checklist` | Security ignore-state artifact |
| `paths.references` | `.ai-factory/references/` | `/aif-reference` | Knowledge reference storage |
| `paths.patches` | `.ai-factory/patches/` | `/aif-plan`, `/aif-improve`, `/aif-implement`, `/aif-fix`, `/aif-evolve` | Fix patches and fallback learning context |
| `paths.evolutions` | `.ai-factory/evolutions/` | `/aif-plan`, `/aif-evolve` | Evolution logs and patch cursor |
| `paths.evolution` | `.ai-factory/evolution/` | `/aif-loop` | Reflex loop state root |
| `paths.specs` | `.ai-factory/specs/` | `/aif-plan`, `/aif-verify` | Specs / archived plan support |
| `paths.rules` | `.ai-factory/rules/` | `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-rules-check`, `/aif-commit`, `/aif-fix`, `/aif-evolve`, `/aif-rules` | Area-rules directory and relative rule resolution base |
| `paths.qa` | `.ai-factory/qa/` | `/aif-qa` | QA artifacts root; branch slug is appended as subdirectory (`<paths.qa>/<branch-slug>/`) |

### `workflow`

| Key | Default | Read by skills | Notes |
|-----|---------|----------------|-------|
| `workflow.auto_create_dirs` | `true` | No dedicated built-in reader yet | Present in schema/template; reserved for directory-management behavior |
| `workflow.plan_id_format` | `slug` | No dedicated built-in reader yet | Present in schema/template; reserved for plan naming strategy |
| `workflow.analyze_updates_architecture` | `true` | No dedicated built-in reader yet | Present in schema/template; reserved for setup/update workflow control |
| `workflow.architecture_updates_roadmap` | `true` | No dedicated built-in reader yet | Present in schema/template; reserved for architecture-to-roadmap automation |
| `workflow.verify_mode` | `normal` | `/aif-verify` | Default strictness for verification runs |

### `git`

| Key | Default | Read by skills | Notes |
|-----|---------|----------------|-------|
| `git.enabled` | `true` | `/aif`, `/aif-plan`, `/aif-improve`, `/aif-implement`, `/aif-verify`, `/aif-rules-check` | Disables branch/worktree assumptions when false |
| `git.base_branch` | `main` with auto-detect fallback | `/aif`, `/aif-plan`, `/aif-improve`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-rules-check` | Target branch for diff, merge, and verification guidance |
| `git.create_branches` | `true` | `/aif`, `/aif-plan`, `/aif-improve`, `/aif-implement`, `/aif-verify` | Full plans may still exist when false; they just skip auto branch creation |
| `git.branch_prefix` | `feature/` | `/aif`, `/aif-plan` | Prefix for auto-created full-plan branches |
| `git.skip_push_after_commit` | `false` | `/aif-commit` | When true, `/aif-commit` skips push prompt and ends after local commit |

### `rules`

| Key | Default | Read by skills | Notes |
|-----|---------|----------------|-------|
| `rules.base` | `.ai-factory/rules/base.md` | `/aif-implement`, `/aif-verify`, `/aif-rules-check`, `/aif-commit`, `/aif-fix`, `/aif-evolve` | Base project rule file |
| `rules.<area>` | none | `/aif-implement`, `/aif-verify`, `/aif-rules-check`, `/aif-commit`, `/aif-fix`, `/aif-evolve`; written by `/aif-rules area:<name>` | Named area rule entries like `rules.api`, `rules.frontend`; preserved during `/aif` reruns |

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
| `/aif-plan` | Yes | No | `paths.*` for planning artifacts, `language.ui`, `git.*` |
| `/aif-explore` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.research`, `paths.plan`, `paths.plans`, `paths.rules`, `language.ui` |
| `/aif-roadmap` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.research`, `paths.rules`, `language.ui`, `language.artifacts` |
| `/aif-improve` | Yes | No | `paths.plan`, `paths.plans`, `paths.fix_plan`, `paths.research`, `paths.description`, `paths.patches`, `language.ui`, `git.enabled`, `git.base_branch`, `git.create_branches` |
| `/aif-implement` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.research`, `paths.plan`, `paths.plans`, `paths.fix_plan`, `paths.patches`, `paths.rules`, `language.ui`, `language.artifacts`, `git.enabled`, `git.base_branch`, `git.create_branches`, `rules.base`, `rules.<area>` |
| `/aif-verify` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.plan`, `paths.plans`, `paths.fix_plan`, `paths.specs`, `paths.rules`, `workflow.verify_mode`, `git.enabled`, `git.base_branch`, `git.create_branches`, `rules.base`, `rules.<area>` |
| `/aif-rules-check` | Yes | No | `paths.rules_file`, `paths.rules`, `paths.plan`, `paths.plans`, `language.ui`, `git.enabled`, `git.base_branch`, `rules.base`, `rules.<area>` |
| `/aif-commit` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.rules`, `language.ui`, `git.skip_push_after_commit`, `rules.base`, `rules.<area>` |
| `/aif-review` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.rules`, `language.ui`, `git.base_branch` |
| `/aif-loop` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.research`, `paths.plan`, `paths.plans`, `paths.evolution`, `language.ui`, `language.artifacts` |
| `/aif-docs` | Yes | No | `paths.description`, `paths.architecture`, `paths.docs`, `language.ui`, `language.artifacts` |
| `/aif-fix` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.rules`, `paths.fix_plan`, `paths.patches`, `language.ui`, `rules.base`, `rules.<area>` |
| `/aif-evolve` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.rules`, `paths.patches`, `paths.evolutions`, `language.ui`, `language.artifacts`, `rules.base`, `rules.<area>` |
| `/aif-reference` | Yes | No | `paths.references`, `paths.rules_file`, `language.ui` |
| `/aif-security-checklist` | Yes | No | `paths.security`, `language.ui` |
| `/aif-qa` | Yes | No | `paths.description`, `paths.architecture`, `paths.qa`, `language.ui`, `git.base_branch` |

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
| `.ai-factory/skill-context/` | Built-in skill overrides written by `/aif-evolve` |
| `README.md` | Landing page for `/aif-docs` |
| `docs-html/` | Static HTML output for `/aif-docs --web` |

## See Also

- [Configuration](configuration.md) — high-level config architecture and project structure
- [Core Skills](skills.md) — full skill reference
- [Development Workflow](workflow.md) — where config-aware workflow skills fit end to end
