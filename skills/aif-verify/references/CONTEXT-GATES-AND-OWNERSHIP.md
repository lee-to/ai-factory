# Context Gates and Artifact Ownership Contract

Canonical contract for AI Factory workflow commands. This file defines:
- which command owns each artifact,
- which commands consume artifacts as read-only context,
- and how context gates behave in normal vs strict verification.

## Command-to-Artifact Matrix

| Command            | Primary write ownership                                                                                  | Read-only context                                                                                                                                     | Approved exceptions                                                                                                                                                   |
|--------------------|----------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `aif`              | `.ai-factory/DESCRIPTION.md`, `AGENTS.md` (setup map), skill installation and MCP config                 | Existing project files and context artifacts                                                                                                          | May invoke `aif-architecture` to create/update `.ai-factory/ARCHITECTURE.md` during setup                                                                             |
| `aif-architecture` | `.ai-factory/ARCHITECTURE.md`                                                                            | `.ai-factory/DESCRIPTION.md`                                                                                                                          | May update `DESCRIPTION.md` architecture pointer and `AGENTS.md` context table                                                                                        |
| `aif-roadmap`      | `.ai-factory/ROADMAP.md`                                                                                 | `.ai-factory/DESCRIPTION.md`, `.ai-factory/ARCHITECTURE.md`, at most one configured or marked-bundle `RESEARCH.md`                                   | `aif-implement` may mark completed milestones after implementation                                                                                                    |
| `aif-rules`        | `paths.rules_file` (default: `.ai-factory/RULES.md`)                                                    | Existing project context                                                                                                                              | None                                                                                                                                                                  |
| `aif-plan`         | `paths.plan`, `paths.plans/<id>.md`, `paths.plans/<id>/index.md` + linked phase files                   | `.ai-factory/DESCRIPTION.md`, `.ai-factory/ARCHITECTURE.md`, configured or bundled `RESEARCH.md` sources                                              | `aif-improve` may refine existing plan files or complete ultra bundles                                                                                                 |
| `aif-improve`      | Selected plan/fix-plan file or marked ultra plan bundle                                                  | Description, architecture, rules, embedded Research Context, and its exact configured/bundled `RESEARCH.md` drift source                            | May refine only the selected plan artifact                                                                                                                            |
| `aif-implement`    | Plan progress updates (checkboxes/task status)                                                           | resolved rules/architecture/description, skill-context, embedded Research Context, its exact configured/bundled `RESEARCH.md` drift source, limited patches | May update description/architecture only when stack/structure changed; may update roadmap milestone completion                                                   |
| `aif-fix`          | `paths.fix_plan` (plan mode), `paths.patches/*.md`                                                       | Description, rules, skill-context, selected or linked configured/bundled `RESEARCH.md`, limited recent patches                                      | None (context artifacts remain read-only by default)                                                                                                                  |
| `aif-evolve`       | `paths.evolutions/*.md`, `paths.evolutions/patch-cursor.json`, `.ai-factory/skill-context/*`            | `.ai-factory/DESCRIPTION.md`, `.ai-factory/patches/*.md` (processed incrementally)                                                                    | None                                                                                                                                                                  |
| `aif-docs`         | `README.md`, `paths.docs/*`, `AGENTS.md` documentation section                                            | Project/context files for factual docs                                                                                                                | README stays fixed; detailed docs location comes from `paths.docs`                                                                                                   |
| `aif-explore`      | regular `paths.research`, or one explicit ultra `<parent>/research/<slug>/` bundle                       | All context and codebase files for analysis                                                                                                           | Ultra always owns `INDEX.md` + `RESEARCH.md`; C4/ADR/dependency files are conditional                                                                                  |
| `aif-commit`       | Git commit object/message only                                                                           | Context artifacts are read-only gates                                                                                                                 | No context artifact writes by default                                                                                                                                 |
| `aif-review`       | Review output/comments only                                                                              | Context artifacts are read-only gates                                                                                                                 | No context artifact writes by default unless user explicitly asks                                                                                                     |
| `aif-verify`       | Verification report output                                                                               | Context gates, embedded Research Context, and its exact configured/bundled `RESEARCH.md` drift source                                                 | May move to fix flow after user confirmation; no default context artifact writes                                                                                      |

## Artifact Update Policy (Recommended)

- **Owner writes only:** An artifact should be updated by its owner command.
- **Implement may do factual deltas:** `aif-implement` may update `.ai-factory/DESCRIPTION.md` and `.ai-factory/ARCHITECTURE.md` only when implementation materially changed stack/structure; it may mark roadmap milestones complete when evidence is clear.
- **Verify stays read-only:** `aif-verify` reports drift and suggests owner commands; it does not update context artifacts by default.
- **Rules are explicit:** Only `aif-rules` edits the resolved RULES.md artifact. Other commands may propose candidate rules and instruct the user to run `/aif-rules`.

## Context Gates (commit/review/verify)

These commands evaluate context consistency against:
- `.ai-factory/ARCHITECTURE.md`
- `.ai-factory/ROADMAP.md` (optional, graceful if missing)
- the resolved RULES.md artifact (optional, graceful if missing)

Gate outputs must use:
- `WARN` for non-blocking mismatches or missing optional files
- `ERROR` for blocking violations

For machine-readable orchestration, supported quality gates append a final `aif-gate-result` JSON block using lowercase `pass` / `warn` / `fail` status values. The human `WARN` / `ERROR` labels above remain readable report labels, not the machine contract.

### Architecture Gate
- **Pass:** Changes follow documented module/layer boundaries.
- **Warn:** Architecture document appears stale or mapping is ambiguous.
- **Fail:** Clear boundary/dependency violation against explicit architecture rules.

### Rules Gate
- **Pass:** Changes comply with explicit project rules.
- **Warn:** Rule relevance is uncertain or cannot be verified confidently.
- **Fail:** Clear violation of an explicit rule in the resolved RULES.md artifact.

### Roadmap Gate
- **Pass:** Changes align with an active milestone or approved roadmap direction.
- **Warn:** `.ai-factory/ROADMAP.md` missing, ambiguous milestone mapping, or no milestone linkage for `feat`/`fix`/`perf` work.
- **Fail (strict verify only):** Clear mismatch with roadmap direction after all available roadmap context is considered.

## Standalone Rules Gate

`/aif-rules-check` is the standalone, read-only rules-only companion to these context gates.

- It evaluates the resolved rules hierarchy plus changed files/diff and reports `PASS` / `WARN` / `FAIL`.
- Missing or non-applicable rules remain `WARN`.
- Explicit hard-rule violations may become `FAIL`.
- This does not change the human `WARN` / `ERROR` reporting labels used by `/aif-commit`, `/aif-review`, and `/aif-verify`; `/aif-review` and `/aif-verify` still append the shared machine-readable gate result when they act as quality gates.

## Threshold Decisions (Resolved)

### Verify normal mode
- Architecture/rules clear violations: **fail**
- Roadmap mismatch: **warn** unless contradiction is explicit and severe
- Missing milestone linkage for `feat`/`fix`/`perf`: **warn**

### Verify strict mode
- Architecture clear violations: **fail**
- Rules clear violations: **fail**
- Roadmap clear mismatch: **fail**
- Missing milestone linkage for `feat`/`fix`/`perf` when `.ai-factory/ROADMAP.md` exists: **warn**

### Commit and review mode
- Context gates are read-only and non-destructive.
- Missing roadmap linkage for `feat`/`fix`/`perf`: **warn** by default.
- Blocking behavior is only allowed when explicitly requested by the user or policy extension.
