---
name: aif-verify
description: >-
  Verify completed implementation against the plan. Checks that all tasks were implemented,
  nothing was forgotten, code compiles, tests pass, and quality standards are met.
  Use after "/aif-implement" completes, or when user says "verify", "check work", "did we miss anything".
argument-hint: "[--strict]"
allowed-tools: Read Edit Glob Grep Bash(git *) Bash(npm *) Bash(npx *) Bash(yarn *) Bash(pnpm *) Bash(bun *) Bash(go *) Bash(python *) Bash(php *) Bash(composer *) Bash(cargo *) Bash(make *) Bash(task *) Bash(just *) Bash(mage *) Bash(shasum -a 256 *) Bash(sha256sum *) TaskList TaskGet AskUserQuestion Questions
disable-model-invocation: false
metadata:
  author: AI Factory
  version: "1.0"
  category: quality
---

# Verify — Post-Implementation Quality Check

## Shared project skill-context

Before mode routing or work, read existing files relative to the current project root in this order (reuse them if already loaded):

1. `.ai-factory/skill-context/global-skill-context.md` — all bundled skills.
2. `.ai-factory/skill-context/build-skill-context.md` — only fix, implement, plan, verify, improve.
3. `.ai-factory/skill-context/aif-verify/SKILL.md` — this skill.

Missing files are skipped; an existing unreadable file stops dependent work with its path.
Precedence: individual > build (when applicable) > global > skill defaults; retain non-conflicting instructions and check all outputs against the effective rules.
These layers customize workflow; they do not replace the project's rules/architecture hierarchy or relax explicit requirements, ownership, scope, safety/privacy, validation, or approval boundaries. Report conflicts with those boundaries instead of overriding them.
`global` is a project-local layer, not home-directory configuration. Custom/extension skills do not automatically use it.

Verify that the completed implementation matches the plan, nothing was missed, and the code is production-ready.

**This skill is optional** — invoked after `/aif-implement` finishes all tasks, or manually at any time.

---

## Runtime-aware questions

Apply this contract whenever the workflow asks the user to decide:

- `AskUserQuestion` and `Questions` below describe the intended interaction, not a required tool name. Use only a question tool actually exposed and permitted in the current session/mode, with its advertised schema. Do not guess aliases, probe unavailable tools, or assume `questionnaire` exists. A frontmatter entry alone does not make a tool available.
- Ask one focused question at a time with clearly labelled options. Batch independent questions only if the actual tool schema supports it; respect its field names, limits, and selection semantics. For open-ended input, use native free-text support or plain text if the schema cannot represent the question. Use the resolved UI language.
- If no usable question tool exists (or it reports unavailable in this mode), ask the same question in plain text with numbered options and allow a free-text answer. Pause work that depends on that answer; independent read-only investigation may continue. Missing UI does not make the session autonomous.
- An empty/cancelled response, a preselected option, or elapsed time is not an answer or approval. Reuse an answer already given in the session instead of asking again.
- In a subagent/background run or explicit non-interactive mode (including `HANDOFF_MODE=1`), do not prompt the user directly. Use declared defaults only for optional preferences within the authorized scope and report assumptions. If a required decision, approval, or material scope/behavior choice remains unresolved, stop dependent work and return the missing decision and options to the parent/caller using its existing blocked/failure contract. Never invent consent or select a new scope to avoid blocking.

## Selective reference loading

Resolve reference paths beside this installed entrypoint, including flat workflows. Read a reference in full only when its stated condition applies, before the dependent step; do not preload all references. If a selected reference is missing or unreadable, STOP before that step and report its path. The entrypoint dispatch and hard boundaries apply to every reference. Project skill-context overrides and managed extension injections retain their existing precedence. Keep managed `aif-ext` blocks in the entrypoint; never move them into references.

## Step 0: Load Context

### 0.0 Load config.yaml

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:
- **Paths:** `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.research`, `paths.plan`, `paths.plans`, `paths.fix_plan`, `paths.specs`, `paths.rules`, and `paths.archive`; derive `research_bundles_dir = <parent directory of paths.research>/research/`
- **verify_mode:** default verification strictness (`strict` | `normal` | `lenient`)
- **Git:** `git.enabled`, `git.base_branch`, `git.create_branches`
- **Rules hierarchy:** the resolved RULES.md path + `rules.base` + named `rules.<area>` entries
- **Language:** `language.ui` for prompts, user-visible explanations, verification reports, context-gate summaries, issue remediation prompts, and next-step guidance
- **Workflow:** `workflow.plan_id_format` (default: `slug`) — used by branch-based plan discovery in Step 0.2.
  Active values: `slug` and `sequential`. Discovery treats root `*.md` files as
  full plans except the resolved fast/fix paths, and direct child `*/index.md`
  files as ultra entrypoints only when they contain exactly one
  `<!-- aif:plan-mode:ultra -->`. When
  `sequential`, search both numbered shapes and choose the highest prefix.
  `timestamp` and `uuid` are **reserved values** and currently behave like `slug`.
  Treat any unknown value as `slug`.

**verify_mode priority:**
1. `--strict` CLI flag → always use `strict`
2. config.yaml `workflow.verify_mode` → use configured value
3. Default → `normal`

If config.yaml doesn't exist, use defaults:
- Paths: `.ai-factory/` for all artifacts
- research: `.ai-factory/RESEARCH.md`
- verify_mode: `normal`
- Rules: RULES.md only
- `ui_language`: `en`
- `workflow.plan_id_format`: `slug`

Resolved language value:
- `ui_language = language.ui || "en"`

All AskUserQuestion prompts, user-visible explanations, verification reports, context-gate summaries, issue remediation prompts, and next-step guidance MUST be written in `ui_language`.

Preserve machine-readable `aif-gate-result` JSON schema fields and enum values (`pass`, `warn`, `fail`) unchanged. Preserve `WARN`/`ERROR` gate labels, commands, paths, config keys, code identifiers, package names, API names, and raw command output unchanged.

### 0.1 Load Ownership and Gate Contract

- Read `references/CONTEXT-GATES-AND-OWNERSHIP.md` first.
- Read `references/GATE-RESULT-CONTRACT.md` for the machine-readable quality gate summary.
- Treat it as the canonical source for:
  - command-to-artifact ownership,
  - read-only behavior for `aif-commit`/`aif-review`/`aif-verify`,
  - normal vs strict context-gate thresholds.
- If this contract conflicts with older examples in this file, follow the contract.

### Plan discovery

Before selecting a plan or standalone verification target, read [plan discovery](references/VERIFY-DISCOVERY.md). Scan configured active plan paths, preserve canonical branch stems and sequential IDs, and ignore unrelated directories. Ultra requires exactly one `<!-- aif:plan-mode:ultra -->`; missing plan context requires the existing standalone choice.

### 0.3 Read Plan & Tasks

- Read the selected plan entrypoint to understand what was supposed to be implemented
- An automatically discovered directory entrypoint is a plan only when it
  contains `<!-- aif:plan-mode:ultra -->`; ignore unrelated `*/index.md` files.
- For ultra, validate all Phase Index links and read every linked phase file
  before verification. Verify implementation against the detailed per-task
  interfaces, edge cases, logging, acceptance criteria, and commands—not only
  the short checkbox text in `index.md`. A missing/broken/escaping phase link is
  a blocking plan-integrity failure because the committed specification is incomplete.
- Cross-check every `Task N` in `index.md` against exactly one matching
  `## Task N` section in its linked phase file. Unmapped tasks, duplicate task
  sections, and unlinked `phase-*.md` files are blocking plan-integrity failures.
- `TaskList` → get all tasks and their statuses
- Read `.ai-factory/DESCRIPTION.md` (use path from config) for project context (tech stack, conventions)
- Read `.ai-factory/ARCHITECTURE.md` (use path from config) for dependency and boundary rules (if present)
- Read **rules hierarchy** (use paths from config):
  1. **RULES.md** — axioms (universal project rules)
  2. **rules/base.md** — project-specific base conventions
  3. **rules.<area>** — area-specific rule entries resolved from config (for example `rules.api`, `rules.frontend`)
- Read `.ai-factory/ROADMAP.md` (use path from config) for milestone alignment checks (if present)
- If the plan entrypoint contains `## Original Request`, treat it as useful original scope context. Use it to understand the user's starting intent, while the task list, committed `## Research Context`, and ultra phase specifications remain the executable verification inputs.
- If the plan entrypoint contains `## Research Context`, treat its embedded copy as the committed requirements snapshot. Parse the first `Source:` / `Reference:` line with canonical `^(?:Source|Reference):\s+\x60([^\x60]+)\x60\s+\(` syntax; for older bare-path lines, fall back to `^(?:Source|Reference):\s+(.+?)\s+\(`. Fall back to configured `paths.research` only when neither form identifies a usable path.
- If the parsed source is inside `research_bundles_dir`, require its sibling `INDEX.md` to contain `<!-- aif:research-mode:ultra -->` exactly once and link that `RESEARCH.md` from `## Artifact Index`; otherwise emit `WARN [research-drift]`. Sibling C4/ADR/dependency files remain rationale only.
- When `SHA256:` is present, extract the current source text strictly between `<!-- aif:active-summary:start -->` and `<!-- aif:active-summary:end -->`, remove HTML comment blocks, preserve line order and leading whitespace, trim trailing spaces from every line, use LF endings, and end with one newline. Hash through stdin with `shasum -a 256` or `sha256sum`; the digest is authoritative. Use `Updated:` only as a legacy fallback when `SHA256:` is absent. A missing/invalid source or revision mismatch emits `WARN [research-drift]`; verify against the embedded Research Context and do not expand scope unless the user explicitly requests a rebase/refinement. Skipping this drift check is a verification bug.
- Compatibility wording for the same rule: emit `WARN [research-drift]` and
  verify against the plan's embedded Research Context.

**Read `.ai-factory/skill-context/aif-verify/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**
- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including the Verification
  Report template. If a skill-context rule says "verification MUST check X" or "report MUST include
  section Y" — you MUST augment the report accordingly. Generating a verification that ignores
  skill-context rules is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

### 0.3 Gather Changed Files

```bash
# All files changed during this feature/plan
git diff --name-only <configured-base-branch>...HEAD
# Or if on the base branch / in no-git mode, check recent commits
git diff --name-only HEAD~$(number_of_tasks)..HEAD
```

If `git.enabled = false`, skip branch diffing entirely and gather changed files from:
- the working tree (if uncommitted changes exist), or
- the recent commit window that corresponds to the implemented tasks.

Store as `CHANGED_FILES`.

---

## Task and code audit

Before auditing implementation, read [task completion and code quality checks](references/VERIFY-AUDIT.md). Verify every required task against real code, run applicable build/test/lint/dependency checks, and report skipped or failed checks honestly. Apply the plan's testing policy and strict-mode requirements; never treat missing evidence as a passing check.

## Step 3: Consistency Checks

### 3.0 Requirements Provenance and Semantic Consistency

Verify the full chain `authoritative requirements → plan → implementation →
verification evidence`, not only plan-to-code agreement.

1. If the plan contains `## Requirements Reconciliation`, resolve citations to
   the selected research source against the embedded `## Research Context`; the
   live research file remains drift-only unless the user explicitly rebases the
   plan. Re-read other cited source passages. Otherwise use the Original Request,
   committed Research Context, project rules, and authoritative sources they
   explicitly reference.
2. Follow a source-priority hierarchy only when declared by the user or project.
   Treat roadmap text as scope rather than a detailed behavioral contract unless
   explicitly declared otherwise. If sources conflict without declared
   authority, do not guess: emit `WARN [requirement-ambiguity]` in normal or
   lenient mode, and `ERROR [requirement-ambiguity]` in strict mode.
3. A clear contradiction between the implementation and a higher-priority
   requirement is `ERROR [requirement-conflict]` and blocks verification even
   when the plan, code, and tests agree with one another.
4. When behavior depends on independent selectors, states, modes, or input
   shapes, enumerate only the supported combinations and verify each material
   combination across validation, persistence, output/transition, and side
   effects. Separate tests for each dimension do not prove their interaction.
5. When repository data, configuration, fixtures, schemas, or content define the
   contract, verify at least one representative existing artifact through the
   primary integration path when such an artifact is available and relevant.

Respect the plan's testing setting. If tests were intentionally skipped, use
static inspection plus the plan's runnable/manual verification evidence; report
missing evidence as a warning in normal mode and a failure in strict mode.

### Code and context consistency

Before evaluating code/configuration drift and context gates, read [consistency checks and owner remediation](references/VERIFY-CONSISTENCY.md). Apply the canonical ownership/gate contracts. Clear architecture/rule violations block; clear roadmap mismatch blocks in strict mode. Missing milestone linkage remains a warning even in strict mode. Context artifacts are read-only; route remediation to their owner commands.

## Report and follow-up

Before rendering any result, read [report format and follow-up procedures](references/VERIFY-REPORT.md). Report task completion, code quality, requirement consistency, context gates, and unavailable evidence in `ui_language`. Unresolved blockers remain failures even when accepted or deferred; remediation requires the user's choice and owner commands.

Append exactly one final fenced `aif-gate-result` JSON block with `"gate": "verify"` and unchanged schema. Use `pass` only without warnings/blockers, `warn` for non-blocking limitations, and `fail` for blocking gaps. Keep `blocking`, `blockers`, `affected_files`, and `suggested_next` consistent with `references/GATE-RESULT-CONTRACT.md`. Nothing follows the final machine-readable block; any follow-up suggestions precede it.

## Strict Mode

When invoked with `--strict`:

```
/aif-verify --strict
```

- **All tasks must be COMPLETE** — no partial or skipped allowed
- **Build must pass** — fail verification if build fails
- **Tests must pass** — fail verification if any test fails (tests are required in strict mode)
- **Lint must pass** — zero warnings, zero errors
- **No unfinished task markers** in changed files
- **No undocumented environment variables**
- **Architecture gate must pass** — fail on clear boundary/dependency violations
- **Rules gate must pass** — fail on clear rule violations
- **Roadmap gate must pass** — fail on clear roadmap mismatch
- **Requirements consistency gate must pass** — fail on clear requirement
  conflicts, unresolved source ambiguity, or missing evidence for material
  supported combinations
- Missing milestone linkage for `feat`/`fix`/`perf` is a warning even in strict mode
- Do not fail strict verification solely because milestone linkage is missing

Strict mode is recommended before merging to the configured base branch or creating a pull request.

---

## Worked report example

Read [report example](references/VERIFY-EXAMPLES.md) only when a worked rendering is needed; use actual evidence rather than the example values.

## Usage examples

Only when usage help is needed, read [verification examples](references/VERIFY-USAGE.md). Normal, strict, and standalone verification remain supported.
