---
name: aif-loop
description: Run a strict multi-iteration Reflex Loop with phases (PLAN, PRODUCE||PREPARE, EVALUATE, CRITIQUE, REFINE) to improve an artifact until quality gates pass or iteration limits are reached. Use when user asks for iterative refinement, quality-gated generation, or "generate -> critique -> refine" loops.
argument-hint: "[new|resume|status|stop|list|history|clean] [task or alias]"
allowed-tools: Read Write Edit Glob Grep Bash Task AskUserQuestion Questions
disable-model-invocation: true
---

# Loop - Reflex Iteration Workflow

Run a result-focused iterative loop with strict phase contracts, evaluation rules, and persistent state between sessions.

## Step 0: Load Config

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:
- **Paths:** `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.plan`, `paths.plans`, and `paths.evolution`
- **Language:** `language.ui` for prompts, `language.artifacts` for generated content

If config.yaml doesn't exist, use defaults:
- Paths: `.ai-factory/` for all artifacts
- Language: `en` (English)

Terminology:

- **loop** = one full execution for a task alias (stored in `run.json`, identified by `run_id`)
- **iteration** = one cycle inside that loop

## Core Idea

Each iteration executes 6 phases with parallel execution where possible:

1. `PLAN` - short plan for current iteration
2. `PRODUCE` - produce one `artifact.md` ← **runs in parallel with PREPARE**
3. `PREPARE` - generate check scripts and test definitions from rules ← **runs in parallel with PRODUCE**
4. `EVALUATE` - run prepared checks + content rules against artifact, score result. Uses parallel `Task` agents for independent check groups
5. `CRITIQUE` - precise issues + fixes (only if fail)
6. `REFINE` - rewrite artifact using critique (only if fail)

```text
         PLAN
           │
    ┌──────┴──────┐
    ↓             ↓          ← parallel (Task tool)
 PRODUCE      PREPARE
 (artifact)   (checks)
    ↓             ↓
    └──────┬──────┘
           ↓
       EVALUATE              ← parallel check execution (Task tool)
       ┌───┼───┐
       ↓   ↓   ↓
      exec content aggregate
       └───┼───┘
           ↓
       CRITIQUE (if fail)
           ↓
       REFINE (if fail)
```

Stop when quality is good enough, no major issues remain, the user stops the run, progress stagnates, or a resource guard trips (optional time budget, iteration limit). The full precedence order is in Step 5.

## Persistence Contract

Use exactly 3+1 files for state inside the resolved evolution directory (where `current.json` exists only while a loop is active):

```text
<resolved evolution dir>/current.json
<resolved evolution dir>/<task-alias>/run.json
<resolved evolution dir>/<task-alias>/history.jsonl
<resolved evolution dir>/<task-alias>/artifact.md
```

Do not create extra index files or per-iteration folder trees unless user explicitly asks.

### File Roles

- `current.json`: pointer to active loop only; delete it when loop becomes `completed`/`stopped`/`failed`
- `run.json`: single source of truth for current loop state
- `history.jsonl`: append-only event log (one JSON object per line)
- `artifact.md`: single source of truth for artifact content (written after PRODUCE and REFINE phases, never duplicated in `run.json`)

## Command Modes

Parse `$ARGUMENTS`:

- `status` - show active loop status from `current.json` and stop
- `resume [alias]` - continue active loop or loop by alias
- `stop [reason]` - stop active loop with reason (`user_stop` if omitted)
- `new <task>` or no mode + task text - start new loop
- `list` - list all task aliases with status (running/stopped/completed/failed)
- `history [alias]` - show event history for a loop (default: active loop)
- `clean [alias|--all]` - remove loop files for a stopped/completed/failed loop (requires user confirmation, always confirm before deleting)

If no task and no active loop exists, ask user for task prompt.

## Step 0: Load Context

Read these files if present:

- the resolved description path
- the resolved architecture path
- the resolved RULES.md path

Use them to keep outputs aligned with project conventions.

**Read `.ai-factory/skill-context/aif-loop/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**
- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including the generated
  artifact, run state, and evaluation criteria. If a skill-context rule says "artifact MUST include X"
  or "evaluation MUST check Y" — you MUST comply. Producing loop outputs that violate skill-context
  rules is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

## Step 0.1: Handle Non-Iteration Commands

If command is `status`, `stop`, `list`, `history`, or `clean`, execute and stop:

- **`status`**: read `current.json`; if file exists, read pointed `run.json` and display `alias | status | iteration | phase | current_step | last_score | updated_at`, plus `completed_phase_seconds / max_completed_phase_seconds` when a budget is set; if file is missing, report that no loop is active
- **`stop [reason]`**: stop active running loop only; set `run.json.status = "stopped"` and `run.json.stop.reason = <reason or "user_stop">`, append `stopped` event to `history.jsonl`, then delete `current.json` (active pointer cleared) and exit
- **`list`**: scan the resolved evolution directory, read each `run.json`, display table of `alias | status | iteration | last_score | updated_at`
- **`history [alias]`**: read `history.jsonl` for the alias (or active loop), display formatted event timeline
- **`clean [alias|--all]`**: show what will be deleted, ask for explicit user confirmation via `AskUserQuestion`, then delete loop directory. Only clean stopped/completed/failed loops — refuse to clean running loops. Update `current.json` if needed.

## Step 1: Initialize or Resume Loop

### 1.1 Ensure directories

```bash
mkdir -p <resolved evolution dir>
```

### 1.2 Alias and IDs (new loop)

Generate:

- `task_alias`: lowercase hyphen slug (3-64 chars)
- `run_id`: `<task_alias>-<yyyyMMdd-HHmmss>`

### 1.3 Write `current.json`

```json
{
  "active_run_id": "courses-api-ddd-20260218-120000",
  "task_alias": "courses-api-ddd",
  "status": "running",
  "updated_at": "2026-02-18T12:00:00Z"
}
```

### 1.4 Write initial `run.json`

```json
{
  "run_id": "courses-api-ddd-20260218-120000",
  "task_alias": "courses-api-ddd",
  "status": "running",
  "iteration": 1,
  "max_iterations": 4,
  "max_completed_phase_seconds": null,
  "completed_phase_seconds": 0,
  "phase_started_epoch_seconds": null,
  "phase": "A",
  "current_step": "PLAN",
  "task": {
    "prompt": "OpenAPI 3.1 spec + DDD notes + JSON examples",
    "ideal_result": "..."
  },
  "criteria": {
    "name": "loop_default_v1",
    "version": 1,
    "phase": {
      "A": { "threshold": 0.8, "active_levels": ["A"] },
      "B": { "threshold": 0.9, "active_levels": ["A", "B"] }
    },
    "rules": []
  },
  "plan": [],
  "prepared_checks": null,
  "evaluation": null,
  "critique": null,
  "stop": { "passed": false, "reason": "" },
  "last_score": 0,
  "stagnation_count": 0,
  "created_at": "2026-02-18T12:00:00Z",
  "updated_at": "2026-02-18T12:00:00Z"
}
```

### 1.5 Resume Logic

When resuming a loop:

1. Read `run.json` to get `current_step` and `iteration`
2. Read last event from `history.jsonl` to confirm consistency
3. If `run.json.current_step` indicates a phase was interrupted:
   - Re-execute from that phase (do not skip)
   - `PRODUCE_PREPARE`: always re-run both PRODUCE and PREPARE (idempotent — artifact overwrites, checks regenerate)
4. If `run.json.status` is `stopped`, `completed`, or `failed`, inform user and suggest `new` (for `failed` runs, also show the last `phase_error` event from `history.jsonl` so user understands what went wrong)
5. Discard a stale `phase_started_epoch_seconds`: set it to the current `date +%s` when the interrupted phase actually re-starts. The interrupted attempt contributes nothing to the budget — only `completed_phase_seconds` already accumulated from finished segments carries over (see `references/ACTIVE-TIME-BUDGET.md`).

## Step 2: Interactive Setup (new loop)

### Quick mode (default, confirmation-first)

If the task prompt contains enough context to infer task type and ideal result:

1. Auto-detect task type from prompt (API spec, code, docs, config)
2. Load matching template from `references/CRITERIA-TEMPLATES.md`
3. Draft inferred rules, phase thresholds (fallback: A=0.8, B=0.9), max iterations (default: `4`), and a completed-phase time budget (default: `none`; infer one only per the setup rules in `references/ACTIVE-TIME-BUDGET.md`)
4. Show inferred settings as a draft summary, with the normalized budget next to max iterations
5. **Always ask explicit confirmation of success criteria** (rules/thresholds) via `AskUserQuestion`, even if criteria were already present in the task text
6. **Always ask explicit confirmation of max iterations** via `AskUserQuestion`, even if iteration count was already present in the task text
7. **Ask explicit confirmation of the time budget** via `AskUserQuestion` whenever the drafted value is not `null`, always offering `none` as an option
8. If user changes criteria, max iterations, or the budget, update the draft and re-confirm all three fields
9. Start iteration 1 only after the confirmations are explicit
10. If task type cannot be auto-detected (ambiguous or mixed prompt), fall through to full setup immediately

### Full setup

Critical guardrail:

- Always re-ask and explicitly confirm success criteria and max iterations, even if both are already written in the task prompt.

Ask concise setup questions before first iteration:

1. **Task type** - what kind of artifact? (API spec, code, docs, config, other) - used to load template from `references/CRITERIA-TEMPLATES.md`
2. **Ideal result** definition
3. **Mandatory checks** (tests, schema/contract, specific requirements)
4. **Quality threshold** (A/B phases)
5. **Max iterations** (default: `4`)
6. **Completed-phase time budget** in seconds (default: `none`) — offer `none` explicitly; a domain-level timeout is not a loop budget
7. **What counts as a major issue**
8. Explicit confirmation: "Confirm these success criteria?"
9. Explicit confirmation: "Confirm max iterations = N?"
10. Explicit confirmation of the budget when it is not `none`: "Confirm time budget = N seconds?"

Generate evaluation rules from answers:

- Load matching template from `references/CRITERIA-TEMPLATES.md` as starting point
- Add task-specific rules based on ideal result and mandatory checks
- Let user review and adjust rules before starting

Persist answers and generated rules inside `run.json.criteria` (snapshot for reproducibility).

Never treat criteria, iteration limits, or a time budget parsed from task text as final until the user explicitly confirms them.

Normalization rules before persisting:

- `run.json.max_iterations` is the single source of truth for iteration limit
- `run.json.max_completed_phase_seconds` is the single source of truth for the time budget; it is optional — persist `null` (no limit) unless the user asked for one and confirmed it. Run files without the field behave as `null`. Accepted values are `null` or a positive integer of seconds; a string, `0`, a negative number, or a decimal is a validation failure (`phase_error`), never coerced — see `references/ACTIVE-TIME-BUDGET.md`
- every rule must be expanded to full RULE-SCHEMA format (`id`, `description`, `severity`, `weight`, `phase`, `check`)
- if template shorthand omitted `weight`, derive from severity (`fail`=2, `warn`=1, `info`=0)

## Step 3: Phase Contracts

Before running phases, load:

- `references/PHASE-CONTRACTS.md` - strict I/O contracts for each phase
- `references/RULE-SCHEMA.md` - rule format and score calculation

### 3.1 Phases

- `PLAN` - generates iteration plan (sequential)
- `PRODUCE` - generates artifact (parallel with PREPARE)
- `PREPARE` - generates check scripts/definitions from rules + task prompt (parallel with PRODUCE)
- `EVALUATE` - runs prepared checks + content rules, aggregates score (parallel check groups via `Task`)
- `CRITIQUE` - identifies issues with fix instructions (sequential, only on fail)
- `REFINE` - applies fixes to artifact (sequential, only on fail)

### 3.2 Parallel Execution Model

Two levels of parallelism via `Task` tool:

1. **Inter-phase**: PRODUCE and PREPARE run as parallel `Task` agents after PLAN completes. Both depend only on PLAN output.
2. **Intra-phase**: EVALUATE spawns parallel `Task` agents for independent check groups (executable checks via Bash, content rules via Read/Grep). Aggregates results into final score.

### 3.3 Phase Output Format

Each phase produces its defined output (see PHASE-CONTRACTS.md). No envelope wrapping. No router output.

## Step 4: Iteration Execution

For each iteration:

1. Set `run.json.current_step = "PLAN"`, run PLAN phase
2. Set `run.json.current_step = "PRODUCE_PREPARE"`, launch both as parallel `Task` agents:
   - Task A (PRODUCE): generates artifact → writes to `artifact.md`
   - Task B (PREPARE): generates check scripts/definitions from rules + plan
   - Wait for both to complete
3. Set `run.json.current_step = "EVALUATE"`, run EVALUATE phase:
   - Spawn parallel `Task` agents for independent check groups:
     - Executable checks (compile, lint, tests) → `Task` with `Bash`
     - Content rules (structure, completeness, style) → `Task` with `Read`/`Grep`
   - Aggregate results into score
4. If `passed=false`:
   - **First evaluate the Step 5 stop conditions in precedence order.** If any of them holds, stop with that reason instead of continuing — Step 5 is checked before the iteration proceeds, never after
   - Otherwise: set `run.json.current_step = "CRITIQUE"`, run CRITIQUE phase
   - Set `run.json.current_step = "REFINE"`, run REFINE phase
   - Write updated artifact to `artifact.md`
   - Increment iteration and continue
5. If `phase=A` and `passed=true`:
   - Switch to `phase=B`, activate B-level rules
   - Set `run.json.current_step = "PREPARE"`, re-run PREPARE with `phase=B` to materialize B-level checks (no PLAN/PRODUCE — artifact already passed A)
   - Set `run.json.current_step = "EVALUATE"`, run EVALUATE against the same artifact with B-level prepared checks
   - If B evaluation also passes → stop with success (`threshold_reached`)
   - If B evaluation fails → continue to CRITIQUE → REFINE, then increment iteration
6. If `phase=B` and `passed=true`:
   - Stop with success (`threshold_reached`)

### Fallback to Sequential

If `Task` tool is unavailable or returns errors, fall back to sequential execution: PLAN → PRODUCE → PREPARE → EVALUATE → CRITIQUE → REFINE. The loop must work without parallelism.

`PRODUCE_PREPARE` stays one logical step across this fallback: `current_step` is not split, there is no budget stop between PRODUCE and PREPARE, and a failed parallel attempt plus the sequential retry count as the same timed segment.

## Step 5: Stop Conditions

### Precedence contract

Several conditions can hold at the same phase boundary. This numbered order is the **tie-break**, not a list of independent checks: evaluate top-down and report the first match as `stop.reason`. Completion guards come before resource guards, so a run that finished successfully is never relabelled as `stopped` by a resource that ran out in the same breath.

1. `threshold_reached` — `phase=B` and `passed=true`
2. `no_major_issues` — **`phase=B`** and no `fail`-severity rules failed in current evaluation: only `warn`/`info` remain and no stricter phase is left. Never fires in `phase=A` — a clean A-evaluation moves into `phase=B` (Step 4.5) or keeps refining, so B-level rules are never skipped
3. `user_stop` — explicit user stop
4. `stagnation` — `stagnation_count >= 2` (see "Stagnation rule" below)
5. `budget_exceeded` — `max_completed_phase_seconds` is set and `completed_phase_seconds >= max_completed_phase_seconds`
6. `iteration_limit` — `iteration >= run.max_iterations`

`budget_exceeded` outranks `iteration_limit` deliberately: time is an irreversibly spent external resource, so when both trip it is more useful to name the budget. What matters is that the order is identical everywhere — this list is repeated verbatim in `docs/loop.md` and `subagents/claude/agents/loop-orchestrator.md`, and all three must stay in sync.

### Completed-phase time budget

`run.json.max_completed_phase_seconds` is an optional cap on time spent inside **completed** phase segments; `null` or absent = no limit. The limit is **soft** — checked only at phase boundaries, never interrupting a phase (or its retry) mid-flight, so a run may overshoot by up to the in-flight phase duration. Only completed segments count: an interrupted phase contributes nothing, by definition rather than by accident. Full contract — types and invariants, boundary measurement, `PRODUCE_PREPARE` and retries as single segments, clock rollback, diagnostics, setup rules: **`references/ACTIVE-TIME-BUDGET.md`**.

### Stagnation rule

Track score progress:

- `delta = score - last_score`
- if `delta < 0.02` and there are no severity `fail` blockers, increment `stagnation_count`
- if `stagnation_count >= 2`, stop with `stagnation`

## Step 6: Persistence Writes (every step)

After each phase output:

1. Update `run.json` (including `current_step`)
2. Append event to `history.jsonl`
3. Update `current.json.updated_at`
4. Write `artifact.md` to disk after PRODUCE and REFINE phases
5. Before REFINE overwrites `artifact.md`, save a SHA-256 hash of the previous artifact in the `refinement_done` event payload as `"previous_artifact_hash"` (enables integrity verification without bloating history)
6. When `max_completed_phase_seconds` is set: update `completed_phase_seconds` / `phase_started_epoch_seconds` at every phase boundary per `references/ACTIVE-TIME-BUDGET.md`, in the same `run.json` write — never as a separate timer

Event names:

- `run_started`
- `plan_created`
- `artifact_created`
- `checks_prepared`
- `evaluation_done`
- `critique_done`
- `refinement_done`
- `phase_switched`
- `iteration_advanced`
- `phase_error`
- `stopped`
- `failed`

`history.jsonl` example line:

```json
{"ts":"2026-02-18T12:01:10Z","run_id":"courses-api-ddd-20260218-120000","iteration":1,"phase":"A","step":"EVALUATE","event":"evaluation_done","status":"ok","payload":{"score":0.72,"passed":false}}
```

## Step 7: Post-Loop

### Artifact status (resolve before reporting anything numeric)

A stop can land at any phase boundary, so the artifact may be missing (`not_created`), never evaluated (`unevaluated`), newer than the stored evaluation (`stale`, detected via `evaluation.artifact_hash`), or `evaluated`. **Only `evaluated` may report a numeric `final_score` or a distance-to-success block**; the other three print `final_score: unavailable` with the reason and, when one existed, `last_evaluated_score`. Full contract, output shapes, per-status rules: **`references/TERMINAL-REPORT.md`**.

After the loop stops (any reason):

1. Display final state summary (`iteration`, `max_iterations`, `phase`, `artifact_status`, `final score` per the rules above, `stop reason`)
2. If `stop reason` is `iteration_limit` or `budget_exceeded`, `artifact_status` is `evaluated`, and that evaluation has `passed=false`, include mandatory **distance-to-success** details:
   - active phase threshold and final score
   - numeric gap to threshold (`threshold - score`, floor at `0`)
   - remaining failed `fail`-severity rule count + blocking rule IDs
   - rules progress (`passed_rules / total_rules`)
3. If `stop reason` is `budget_exceeded`, also include budget diagnostics — `completed_phase_seconds`, `max_completed_phase_seconds`, `overshoot_seconds`, `last_completed_step` — and repeat them in the `stopped` event payload (`references/ACTIVE-TIME-BUDGET.md`)
4. Ask user where to save the final artifact (default: keep it in `<resolved evolution dir>/<alias>/artifact.md`) — skip steps 4-5 entirely when `artifact_status` is `not_created`, and say so instead of offering a file that does not exist
5. Offer to copy artifact to a user-specified path
6. Suggest next skills based on artifact type:
   - API spec -> `/aif-plan` to implement it
   - Code -> `/aif-verify` to check it
   - Docs -> `/aif-docs` to integrate it
7. Update `run.json.status` based on stop reason, and if `current.json` points to this loop, delete `current.json` (no active loop remains):

| Stop reason | Status |
|-------------|--------|
| `threshold_reached` | `completed` |
| `no_major_issues` | `completed` |
| `user_stop` | `stopped` |
| `iteration_limit` | `stopped` |
| `stagnation` | `stopped` |
| `budget_exceeded` | `stopped` |
| `phase_error` | `failed` |

The mapping applies to the reason selected by the Step 5 precedence contract, so a resource guard tripping in the same boundary as a completion guard never downgrades a `completed` run to `stopped`.

## Step 8: Response Format to User

Show a compact summary after each iteration — do NOT dump full `run.json` or `artifact.md` content into the conversation. The artifact is already on disk; duplicating it wastes context.

### Iteration summary format

```text
── Iteration {N}/{max} | Phase {A|B} | Score: {score} | {PASS|FAIL} ──
Plan: {1-line summary of plan focus}
Hash: {first 8 chars of artifact SHA-256}
Changed: {list of added/modified sections, or "initial generation"}
Failed: {comma-separated rule IDs, or "none"}
Warnings: {comma-separated rule IDs, or "none"}
Artifact: <resolved evolution dir>/<alias>/artifact.md
```

- `Hash` — lets the user verify which version they're looking at without reading the full artifact
- `Changed` — shows what actually moved between iterations so regressions are visible from the summary alone

If `passed=false`, append a compact critique summary (rule ID + 1-line fix instruction per issue). Do not repeat the full artifact or full evaluation object.

When the loop terminates with `reason=iteration_limit` or `reason=budget_exceeded`, `artifact_status` is `evaluated`, and `passed=false`, append a compact `distance_to_success` block to the final response. For any other `artifact_status`, print the `final_score: unavailable` block from Step 7 instead — never a computed gap against an evaluation that does not belong to the current artifact.

### Full output exceptions

Show the **full artifact content** (not just summary) in these cases only:

1. **Loop termination** — the final iteration outputs the complete artifact, unless `artifact_status` is `not_created`; then report that no artifact was produced and why the loop stopped
2. **Phase A → B transition** — show the phase-A-passing artifact in full once at the transition boundary for visibility (B-level evaluation still runs immediately per Step 4)
3. **Explicit user request** — user asks to see the full artifact mid-loop

## Step 9: Context Management

The loop generates significant context per iteration (subagent results, evaluation data, critique). All loop state is persisted to disk — clearing context loses nothing, and `resume` fully reconstructs state from files.

Recommend a context clear after iteration 2, on the Phase A → B transition, and after any iteration where `iteration >= 3`. Never force or auto-clear — the user decides.

Exact wording and rationale: `references/CONTEXT-MANAGEMENT.md`.

## Error Recovery

### Invalid phase output

If a phase produces output that does not match its contract:

1. Log the error to `history.jsonl` with event `phase_error`
2. Retry the phase once with the same inputs
3. If retry also fails, stop the loop with `reason=phase_error` and display the error

### Corrupted `run.json`

If `run.json` is missing or unparseable:

1. Read `history.jsonl` to reconstruct the last known state
2. Rebuild `run.json` from the most recent events (last iteration, phase, score, etc.)
3. If `history.jsonl` is also missing/empty, inform user and suggest starting a new loop

## Important Rules

1. `run.json` is the only source of current state truth (does NOT store artifact content)
2. `artifact.md` on disk is the single source of truth for artifact content — never duplicate it in `run.json`
3. `history.jsonl` is append-only; do not edit old events
4. Keep loop fast: short plans, targeted critique, minimal rewrites
5. Do not create extra files beyond the 3+1 persistence files
6. Evaluator must remain strict and non-creative
7. Refiner changes only what is needed to pass failed rules
8. Start simple and add complexity only when metrics show need
9. Retry failed phases exactly once before stopping
10. Use compact iteration summaries by default (Step 8). Full artifact output is allowed only in Step 8 exceptions; never dump full `run.json` into conversation.
11. Recommend context clear at strategic points (Step 9) — after iteration 2, on phase transition, or when iteration >= 3

## Examples

```text
/aif-loop new OpenAPI 3.1 spec + DDD notes + JSON examples
/aif-loop resume
/aif-loop resume courses-api-ddd
/aif-loop status
/aif-loop stop
/aif-loop list
/aif-loop history
/aif-loop history courses-api-ddd
/aif-loop clean courses-api-ddd
/aif-loop clean --all
```
