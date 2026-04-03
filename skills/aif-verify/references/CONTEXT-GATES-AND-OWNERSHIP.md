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
| `aif-roadmap`      | `.ai-factory/ROADMAP.md`                                                                                 | `.ai-factory/DESCRIPTION.md`, `.ai-factory/ARCHITECTURE.md`                                                                                           | `aif-implement` may mark completed milestones after implementation                                                                                                    |
| `aif-rules`        | `paths.rules_file` (default: `.ai-factory/RULES.md`)                                                    | Existing project context                                                                                                                              | None                                                                                                                                                                  |
| `aif-plan`         | `paths.plan`, `paths.plans/<branch-or-slug>.md`                                                          | `.ai-factory/DESCRIPTION.md`, `.ai-factory/ARCHITECTURE.md`, `.ai-factory/RESEARCH.md`                                                                | `aif-improve` may refine existing plan files                                                                                                                          |
| `aif-implement`    | Plan progress updates (checkboxes/task status)                                                           | resolved RULES.md, `.ai-factory/ARCHITECTURE.md`, `.ai-factory/DESCRIPTION.md`, `.ai-factory/skill-context/*`, limited recent patches (fallback)      | May update `.ai-factory/DESCRIPTION.md` and `.ai-factory/ARCHITECTURE.md` only when stack/structure changed; may update `.ai-factory/ROADMAP.md` milestone completion |
| `aif-fix`          | `paths.fix_plan` (plan mode), `paths.patches/*.md`                                                       | `.ai-factory/DESCRIPTION.md`, `.ai-factory/skill-context/*`, limited recent patches (fallback)                                                       | None (context artifacts remain read-only by default)                                                                                                                  |
| `aif-evolve`       | `paths.evolutions/*.md`, `paths.evolutions/patch-cursor.json`, `.ai-factory/skill-context/*`            | `.ai-factory/DESCRIPTION.md`, `.ai-factory/patches/*.md` (processed incrementally)                                                                    | None                                                                                                                                                                  |
| `aif-docs`         | `README.md`, `paths.docs/*`, `AGENTS.md` documentation section                                            | Project/context files for factual docs                                                                                                                | README stays fixed; detailed docs location comes from `paths.docs`                                                                                                   |
| `aif-explore`      | `.ai-factory/RESEARCH.md` only                                                                           | All context and codebase files for analysis                                                                                                           | None                                                                                                                                                                  |
| `aif-commit`       | Git commit object/message only                                                                           | Context artifacts are read-only gates                                                                                                                 | No context artifact writes by default                                                                                                                                 |
| `aif-review`       | Review output/comments only                                                                              | Context artifacts are read-only gates                                                                                                                 | No context artifact writes by default unless user explicitly asks                                                                                                     |
| `aif-verify`       | Verification report output                                                                               | Context artifacts are read-only gates                                                                                                                 | May move to fix flow after user confirmation; no default context artifact writes                                                                                      |

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
