[← Configuration](configuration.md) · [Back to README](../README.md) · [Instruction Manifests →](instruction-manifests.md)

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

`/aif-skills-audit` is a read-only config consumer for context paths, scoped rules
and language. It works without config, introduces no keys, and reports in chat
unless `--output` names a new report file. See [installed-library auditing](skills.md#aif-skills-audit).

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
| `writing` | Opt-in editorial profile for selected documentation; independent of language |
| `paths` | Artifact locations under project root |
| `warmup` | Optional extra session context for `/aif-warmup` |
| `workflow` | Workflow-level defaults and feature flags |
| `git` | Git-aware planning / verification behavior |
| `rules` | Base rules file plus named area-rule files |

## Key Reference

### `language`

| Key | Default | Read by skills | Notes |
|-----|---------|----------------|-------|
| `language.ui` | `en` | `/aif-skills-audit`, `/aif`, `/aif-architecture`, `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-rules-check`, `/aif-commit`, `/aif-fix`, `/aif-improve`, `/aif-loop`, `/aif-docs`, `/aif-evolve`, `/aif-transfer`, `/aif-reference`, `/aif-distillation`, `/aif-rules`, `/aif-security-checklist`, `/aif-qa`, `/aif-qa-check`, `/aif-warmup` | UI language for prompts, questions, and summaries; `/aif` resolves it before downstream setup questions |
| `language.artifacts` | `en` | `/aif-skills-audit`, `/aif`, `/aif-architecture`, `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-improve`, `/aif-loop`, `/aif-docs`, `/aif-fix`, `/aif-evolve`, `/aif-transfer`, `/aif-reference`, `/aif-distillation`, `/aif-rules`, `/aif-security-checklist`, `/aif-qa`, `/aif-qa-check`, `/aif-warmup` | Language for generated or persisted artifacts; `/aif` locks it before the first setup artifact so DESCRIPTION/rules base/AGENTS/ARCHITECTURE stay aligned in one run; workflow artifact writers use it for plans, research, fix plans, patches, references, rules, security ignore state, docs, evolution reports, and QA artifacts, with fallback to `language.ui`; `/aif-warmup` only reports the configured preference |
| `language.technical_terms` | `keep` | `/aif-skills-audit`, `/aif-plan`, `/aif-explore`, `/aif-improve`, `/aif-fix`, `/aif-transfer`, `/aif-docs`, `/aif-reference`, `/aif-distillation`, `/aif-rules`, `/aif-security-checklist`, `/aif-qa`, `/aif-qa-check`, `/aif-warmup` | Present in schema and template; `/aif` preserves an existing value when present and otherwise writes the default `keep`; artifact-writing skills use it to decide whether human-readable terminology should stay in English, be translated, or use mixed style while preserving commands, paths, identifiers, config keys, package names, API names, machine-readable metadata keys/status values, and raw errors where required; `/aif-warmup` only reports the configured preference |

### `writing`

These user-owned settings are read only by `/aif-docs`. New config templates
include disabled defaults. `/aif` preserves the whole section on reruns and
does not backfill it into existing configs; absence means disabled.

| Key | Default | Read by skills | Notes |
|-----|---------|----------------|-------|
| `writing.profile` | `none` | `/aif-docs` | `none` or `simple-technical`; applies adapted SimpleEn-RU structural rules after artifact language resolution |
| `writing.targets` | `[]` | `/aif-docs` | Exact project-relative Markdown file paths, using `/`; no globs, directories, absolute paths, or `..`. Intersect with the current authorized docs scope (`README.md` or files under resolved `paths.docs`, including runbooks). Empty disables the pass |
| `writing.dictionary` | `""` | `/aif-docs` | Optional project-relative terminology file; read-only authority. Empty preserves established terms and uses `language.technical_terms` only for new prose |

Example (the runbook must be included in the authorized `/aif-docs` task):

```yaml
language:
  ui: ru
  artifacts: en
writing:
  profile: simple-technical
  targets:
    - docs/runbooks/recovery.md
  dictionary: docs/terminology.md
```

The English runbook stays English during a Russian conversation. An explicit
artifact-language instruction takes priority; existing documents retain their
language unless translation was requested. New documents use
`language.artifacts`, then `language.ui`, then `en`. The profile selects RU/EN
rules only after this resolution; unsupported languages are skipped. Selection
does not authorize opening, rewriting, translating, or moving other artifacts.

A dictionary can define a concept, its approved RU/EN terms, and distinctions
from related concepts. For example, a project can define `validate` as schema
validation and `verify` as checking evidence. The editor preserves this
distinction, reports conflicts, and never updates the dictionary itself. A
configured missing/unreadable/outside-root dictionary skips the editorial pass
with `WARN [writing]`. Unknown profiles and malformed settings also warn and
skip; ordinary documentation work can continue. Out-of-scope/invalid targets
are reported and skipped. Symlink escapes are rejected.

Meaning preservation precedes readability: preserve modality, conditions,
exceptions, uncertainty, warnings, numbers/units, and project terminology.
Code, commands, identifiers, paths, link targets, and quoted errors/logs remain
exact. Failed rewrites are restored; style exceptions are reported separately.

The profile does not affect chat, issues, plans, requirement correctness, or
quality-gate verdicts. It is not a ГОСТ Р 58049-2017 / ASD-STE100 certification.

Upstream −71% EN / −55% RU lint-hit reductions are heuristic conformance
metrics, not local results or evidence of fewer technical errors. The bundled
[profile contract](../skills/aif-docs/references/WRITING-PROFILE.md) links to the
pinned source revision and MIT notice.

### `paths`

| Key | Default | Read by skills | Notes |
|-----|---------|----------------|-------|
| `paths.description` | `.ai-factory/DESCRIPTION.md` | `/aif-skills-audit`, `/aif-architecture`, `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-commit`, `/aif-fix`, `/aif-improve`, `/aif-evolve`, `/aif-transfer`, `/aif-docs`, `/aif-qa`, `/aif-qa-check`, `/aif-warmup`, `/aif-roadmap-next` | Core project description artifact |
| `paths.architecture` | `.ai-factory/ARCHITECTURE.md` | `/aif-skills-audit`, `/aif-architecture`, `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-commit`, `/aif-fix`, `/aif-docs`, `/aif-loop`, `/aif-evolve`, `/aif-transfer`, `/aif-qa`, `/aif-qa-check`, `/aif-warmup`, `/aif-roadmap-next` | Architecture source of truth |
| `paths.docs` | `docs/` | `/aif-docs` | Detailed docs directory; `README.md` stays fixed in project root |
| `paths.roadmap` | `.ai-factory/ROADMAP.md` | `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-commit`, `/aif-loop`, `/aif-warmup`, `/aif-plan-overview`, `/aif-roadmap-next` | Strategic roadmap artifact |
| `paths.research` | `.ai-factory/RESEARCH.md` | `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-improve`, `/aif-fix`, `/aif-warmup` | Regular persisted exploration file; ultra bundles derive `<parent>/research/<english-slug>/` from this path and keep a compatible `RESEARCH.md` inside |
| `paths.rules_file` | `.ai-factory/RULES.md` | `/aif-skills-audit`, `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-rules-check`, `/aif-commit`, `/aif-fix`, `/aif-evolve`, `/aif-transfer`, `/aif-rules`, `/aif-reference`, `/aif-loop`, `/aif-warmup`, `/aif-roadmap-next` | Top-level rules artifact |
| `paths.plan` | `.ai-factory/PLAN.md` | `/aif-plan`, `/aif-explore`, `/aif-improve`, `/aif-implement`, `/aif-verify`, `/aif-rules-check`, `/aif-commit`, `/aif-loop`, `/aif-plan-overview`, `/aif-roadmap-next` | Fast-plan path |
| `paths.plans` | `.ai-factory/plans/` | `/aif-plan`, `/aif-explore`, `/aif-improve`, `/aif-implement`, `/aif-verify`, `/aif-rules-check`, `/aif-commit`, `/aif-loop`, `/aif-archive`, `/aif-plan-overview`, `/aif-roadmap-next` | Named plans directory: full plans are root `.md` files; ultra plans are direct child directories whose `index.md` contains the stable `<!-- aif:plan-mode:ultra -->` marker plus linked phase files |
| `paths.fix_plan` | `.ai-factory/FIX_PLAN.md` | `/aif-fix`, `/aif-improve`, `/aif-implement`, `/aif-verify`, `/aif-plan-overview`, `/aif-roadmap-next` | Fix-plan path |
| `paths.security` | `.ai-factory/SECURITY.md` | `/aif-security-checklist` | Security ignore-state artifact |
| `paths.references` | `.ai-factory/references/` | `/aif-reference` | Knowledge reference storage |
| `paths.patches` | `.ai-factory/patches/` | `/aif-plan`, `/aif-improve`, `/aif-implement`, `/aif-fix`, `/aif-evolve`, `/aif-transfer` (source config only) | Fix patches and fallback learning context; transfer never writes or copies them |
| `paths.evolutions` | `.ai-factory/evolutions/` | `/aif-plan`, `/aif-evolve`, `/aif-transfer` | Evolution logs and patch cursor; transfer delegates one approved log but never touches the cursor |
| `paths.evolution` | `.ai-factory/evolution/` | `/aif-loop` | Reflex loop state root |
| `paths.specs` | `.ai-factory/specs/` | `/aif-plan`, `/aif-verify` | Specs / archived plan support |
| `paths.rules` | `.ai-factory/rules/` | `/aif-skills-audit`, `/aif-plan`, `/aif-explore`, `/aif-roadmap`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-rules-check`, `/aif-commit`, `/aif-fix`, `/aif-evolve`, `/aif-transfer`, `/aif-rules`, `/aif-warmup`, `/aif-roadmap-next` | Area-rules directory and relative rule resolution base |
| `paths.qa` | `.ai-factory/qa/` | `/aif-qa`, `/aif-qa-check` | QA artifacts root; branch slug is appended as subdirectory (`<paths.qa>/<branch-slug>/`). `/aif-qa` writes `change-summary.md`, `test-plan.md`, and `test-cases.md`; `/aif-qa-check` writes revision/worktree/source/target/replay-bound `qa-check.md`, canonical per-case `browser-replay/TC-NNN.js` scripts, preserved replacements under `browser-replay/history/`, and root-level agent memory. |
| `paths.archive` | `.ai-factory/archive/` | `/aif-archive`, `/aif-plan`, `/aif-implement`, `/aif-verify`, `/aif-improve`, `/aif-plan-overview`, `/aif-roadmap-next` | Archive directory for completed plans and roadmap snapshots. `archive/plans/` stores full `.md` plans and ultra bundle directories; `archive/roadmap/` stores dated snapshots. Plan identifiers retain any sequential prefix. |

### `warmup`

| Key | Default | Read by skills | Notes |
|-----|---------|----------------|-------|
| `warmup.paths` | `[]` | `/aif-warmup` | Ordered extra files or directories loaded after core context. Entries must remain inside project root; directories are scanned recursively for readable text. Outside-root, missing/unreadable, binary, symlinked, sensitive, generated, or context-limited entries are reported instead of silently ignored. This user-owned option is included in new config templates and preserved on setup reruns; absence in an existing config is equivalent to `[]`. |

### `workflow`

| Key | Default | Read by skills | Notes |
|-----|---------|----------------|-------|
| `workflow.explore_mode` | `regular` | `/aif-explore` | Default mode: `regular` or `ultra`; a leading mode token overrides it. `ultra` opts into saving a named research bundle. |
| `workflow.plan_mode` | `ask` | `/aif-plan`, `/aif-roadmap-next` | Default mode: `ask`, `fast`, `full`, or `ultra`; a leading mode token overrides it. `ask` keeps the full/fast question, or fast in non-interactive Handoff mode. |
| `workflow.improve_check` | `false` | `/aif-improve` | Boolean default for findings validation. `+check` enables it; `--no-check` disables it for one invocation; the last explicit flag wins. `--list` always skips validation. |
| `workflow.roadmap_next_mode` | concrete `workflow.plan_mode`, otherwise `ultra` | `/aif-roadmap-next` | Optional user-owned fast/full/ultra default; explicit argument wins; invalid present value warns and uses ultra |
| `workflow.roadmap_next_capacity` | `{fast: 1, full: 2, ultra: 3}` | `/aif-roadmap-next` | Optional user-owned mapping of positive integer estimate points per mode; absent/invalid keys use their built-in defaults |
| `workflow.auto_create_dirs` | `true` | No dedicated built-in reader yet | Present in schema/template; reserved for directory-management behavior |
| `workflow.plan_id_format` | `slug` | `/aif-plan`, `/aif-implement`, `/aif-improve`, `/aif-explore`, `/aif-verify`, `/aif-rules-check`, `/aif-commit`, `/aif-archive`, `/aif-warmup`, `/aif-plan-overview` | Active values: `slug` (default), `sequential`; `timestamp` and `uuid` are reserved and fall back to `slug`. Sequential writes a full plan as `paths.plans/<NNNN>_<stem>.md` or an ultra bundle as `paths.plans/<NNNN>_<stem>/index.md`. Allocation counts numbered full files and only directories whose `index.md` has the exact ultra marker, uses max + 1, starts at `0001`, caps at `9999`, ignores unrelated numbered directories, and excludes the archive. Moving/deleting the highest active artifact can free its number. Force-disabled when `HANDOFF_BRANCH_PREPARED=1`. `/aif-warmup` only reports the configured preference. |
| `workflow.plan_structure` | `classic` | `/aif-plan`, `/aif-implement` | Plan commit layout: `classic` uses a separate `## Commit Plan` section; `task-based` writes explicit commit tasks inline in the task list. |
| `workflow.analyze_updates_architecture` | `true` | No dedicated built-in reader yet | Present in schema/template; reserved for setup/update workflow control |
| `workflow.architecture_updates_roadmap` | `true` | No dedicated built-in reader yet | Present in schema/template; reserved for architecture-to-roadmap automation |
| `workflow.verify_mode` | `normal` | `/aif-verify`, `/aif-warmup` | Default strictness for verification runs; `/aif-warmup` only reports the configured preference |

#### Command defaults

Set the options you repeatedly type in `.ai-factory/config.yaml`:

```yaml
workflow:
  explore_mode: ultra
  plan_mode: full
  improve_check: true
```

With these settings, `/aif-explore <topic>`, `/aif-plan <request>`, and
`/aif-improve` behave like their explicit `ultra`, `full`, and `+check` forms.

Explicit arguments win: `/aif-explore regular <topic>` restores regular
exploration and its save prompt; `/aif-plan fast <request>` uses fast mode;
`/aif-improve --no-check` skips validation once. Defaults do not become part
of the topic, improvement prompt, or plan's verbatim `Original Request`.
List/cleanup subcommands keep their early-return behavior. Other questions,
permissions, git settings, and artifact ownership stay in effect.

Missing values retain the previous behavior (`regular`, `ask`, `false`).
Invalid values or types emit `WARN [config]` and fall back to those same defaults;
`improve_check` must be a YAML boolean, not a quoted string. `/aif` setup reruns
preserve existing values and comments and backfill only missing/incomplete keys.
These settings support the three command options listed above.

#### Roadmap-next defaults

```yaml
workflow:
  roadmap_next_mode: full
  roadmap_next_capacity:
    fast: 1
    full: 2
    ultra: 3
```

Mode precedence: explicit valid argument → valid `roadmap_next_mode` → concrete
`plan_mode` → ultra (`ask` is not a concrete mode). An invalid explicit/present
override warns and uses built-in ultra; it does not silently fall through to another
configured preference.

Invalid/missing capacity entries keep that mode's built-in
value; a non-mapping value resets all capacity defaults with a warning. Booleans and
quoted numbers are invalid capacities.

S/M/L/XL use 1/2/3/4+ estimated points; XL
has no known upper bound and is proposed alone. These are scope estimates, not
execution time, token limits or a guarantee that the plan fits.

Both keys are optional and user-owned. The initial template includes commented
examples only, so a default next-mode value cannot mask a later `plan_mode` choice.
Setup reruns preserve scalar/nested settings and comments verbatim rather than
managing or backfilling these fields. Neither advisor writes config or plan artifacts.

### `git`

| Key | Default | Read by skills | Notes |
|-----|---------|----------------|-------|
| `git.enabled` | `true` | `/aif`, `/aif-plan`, `/aif-improve`, `/aif-implement`, `/aif-verify`, `/aif-rules-check`, `/aif-commit`, `/aif-qa`, `/aif-qa-check`, `/aif-warmup`, `/aif-plan-overview` | Disables branch/worktree assumptions when false; `/aif-qa` switches to manual change context instead of git diffing; `/aif-warmup` only reports the configured preference |
| `git.base_branch` | `main` with auto-detect fallback | `/aif`, `/aif-plan`, `/aif-improve`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-rules-check`, `/aif-qa`, `/aif-warmup` | Target branch for diff, merge, and verification guidance; `/aif-warmup` only reports the configured preference |
| `git.create_branches` | `true` | `/aif`, `/aif-plan`, `/aif-improve`, `/aif-implement`, `/aif-verify`, `/aif-commit`, `/aif-warmup` | Full and ultra plans still exist when false; they skip automatic branch creation; `/aif-warmup` only reports the configured preference |
| `git.branch_prefix` | `feature/` | `/aif`, `/aif-plan`, `/aif-warmup` | Prefix for auto-created full-plan branches; `/aif-warmup` only reports the configured preference |
| `git.skip_push_after_commit` | `false` | `/aif-commit`, `/aif-warmup` | When true, `/aif-commit` skips push prompt and ends after local commit; `/aif-warmup` only reports the configured preference |

### `rules`

| Key | Default | Read by skills | Notes |
|-----|---------|----------------|-------|
| `rules.base` | `.ai-factory/rules/base.md` | `/aif-skills-audit`, `/aif-implement`, `/aif-verify`, `/aif-rules-check`, `/aif-commit`, `/aif-fix`, `/aif-evolve`, `/aif-transfer`, `/aif-warmup`, `/aif-roadmap-next` | Base project rule file |
| `rules.<area>` | none | `/aif-skills-audit`, `/aif-implement`, `/aif-verify`, `/aif-rules-check`, `/aif-commit`, `/aif-fix`, `/aif-evolve`, `/aif-transfer`, `/aif-warmup`, `/aif-roadmap-next`; written by `/aif-rules area:<name>` | Named area rule entries like `rules.api`, `rules.frontend`; preserved during `/aif` reruns |

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
| `/aif-plan` | Yes | No | `paths.*` for planning artifacts, `language.ui`, `language.artifacts`, `language.technical_terms`, `git.*`, `workflow.plan_mode` |
| `/aif-plan-overview` | Yes | No | Plan/archive/roadmap paths, language, `git.enabled`, `workflow.plan_id_format`; read-only summary |
| `/aif-roadmap-next` | Yes | No | Roadmap/plan/archive/context/rules paths, language, `workflow.plan_mode`, user-owned `workflow.roadmap_next_*`; read-only recommendation |
| `/aif-explore` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.research`, `paths.plan`, `paths.plans`, `paths.rules`, `language.ui`, `language.artifacts`, `language.technical_terms`, `workflow.explore_mode` |
| `/aif-roadmap` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.research`, `paths.rules`, `language.ui`, `language.artifacts` |
| `/aif-improve` | Yes | No | `paths.plan`, `paths.plans`, `paths.fix_plan`, `paths.research`, `paths.description`, `paths.patches`, `language.ui`, `language.artifacts`, `language.technical_terms`, `git.enabled`, `git.base_branch`, `git.create_branches`, `workflow.improve_check` |
| `/aif-implement` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.research`, `paths.plan`, `paths.plans`, `paths.fix_plan`, `paths.patches`, `paths.rules`, `language.ui`, `language.artifacts`, `git.enabled`, `git.base_branch`, `git.create_branches`, `rules.base`, `rules.<area>` |
| `/aif-verify` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.research`, `paths.plan`, `paths.plans`, `paths.fix_plan`, `paths.specs`, `paths.rules`, `workflow.verify_mode`, `language.ui`, `git.enabled`, `git.base_branch`, `git.create_branches`, `rules.base`, `rules.<area>` |
| `/aif-rules-check` | Yes | No | `paths.rules_file`, `paths.rules`, `paths.plan`, `paths.plans`, `language.ui`, `git.enabled`, `git.base_branch`, `rules.base`, `rules.<area>` |
| `/aif-commit` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.rules`, `paths.plan`, `paths.plans`, `workflow.plan_id_format`, `language.ui`, `git.enabled`, `git.create_branches`, `git.skip_push_after_commit`, `rules.base`, `rules.<area>` |
| `/aif-review` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.rules`, `language.ui`, `git.base_branch` |
| `/aif-loop` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.plan`, `paths.plans`, `paths.evolution`, `language.ui`, `language.artifacts` |
| `/aif-docs` | Yes | No | `paths.description`, `paths.architecture`, `paths.docs`, `language.ui`, `language.artifacts`, `language.technical_terms`, `writing.profile`, `writing.targets`, `writing.dictionary` |
| `/aif-fix` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.rules`, `paths.research`, `paths.fix_plan`, `paths.patches`, `language.ui`, `language.artifacts`, `language.technical_terms`, `rules.base`, `rules.<area>` |
| `/aif-evolve` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.rules`, `paths.patches`, `paths.evolutions`, `language.ui`, `language.artifacts`, `rules.base`, `rules.<area>` |
| `/aif-skills-audit` | Yes | No | `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.rules`, `rules.base`, `rules.<area>`, `language.ui`, `language.artifacts`, `language.technical_terms` |
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
