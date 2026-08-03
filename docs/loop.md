[← Research](research.md) · [Back to README](../README.md) · [Subagents →](subagents.md)

# Reflex Loop

`/aif-loop` is a strict iterative workflow for quality-gated generation:

1. Generate initial artifact
2. Evaluate against explicit rules
3. Critique failed rules
4. Refine artifact
5. Repeat until stop condition is reached

It is designed for high-signal iteration with minimal storage overhead.

Paths below show the default `.ai-factory/` layout. `config.yaml` can relocate the loop-state root via `paths.evolution`.

Terminology:
- **loop** = one full execution for a task alias (stored in `run.json`, identified by `run_id`)
- **iteration** = one cycle inside that loop

## Command Modes

```bash
/aif-loop new <task>
/aif-loop resume [alias]
/aif-loop status
/aif-loop stop [reason]
/aif-loop list
/aif-loop history [alias]
/aif-loop clean [alias|--all]
```

- `new` - start a new loop and initialize loop state
- `resume` - continue active loop or loop by alias
- `status` - show current loop progress
- `stop` - explicitly stop active loop and clear `current.json`
- `list` - list all task aliases with status (`running`, `stopped`, `completed`, `failed`)
- `history` - show event history for a loop
- `clean` - remove loop files (requires confirmation, refuses to clean running loops)

## Setup Confirmation (New Loop)

Before iteration 1, `/aif-loop new` must always ask for explicit user confirmation of:

1. Success criteria (rules + thresholds)
2. Max iterations (`run.json.max_iterations`)
3. The completed-phase time budget (`run.json.max_completed_phase_seconds`) whenever the drafted value is not `none` — `none` is always offered as an option

This confirmation is mandatory even when the task prompt already contains criteria, an iteration count, or a duration. The loop must not start until they are confirmed. A domain-level timeout in the task text ("request timeout 5 seconds") is not a loop budget — a budget is inferred only when the text says the limit applies to running `/aif-loop` itself.

## Persistence Model

4 files total for loop persistence (1 global pointer + 3 per-loop files). `current.json` exists only while a loop is active:

```text
<paths.evolution>/current.json
<paths.evolution>/<task-alias>/run.json
<paths.evolution>/<task-alias>/history.jsonl
<paths.evolution>/<task-alias>/artifact.md
```

### `current.json`

Pointer to active loop:

```json
{
  "active_run_id": "courses-api-ddd-20260218-120000",
  "task_alias": "courses-api-ddd",
  "status": "running",
  "updated_at": "2026-02-18T12:00:00Z"
}
```

When a loop reaches a terminal state (`completed`, `stopped`, `failed`), `current.json` is deleted.

### `run.json`

Single source of truth for current state:

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
    "ideal_result": "Spec + notes + examples pass phase B"
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

### `history.jsonl`

Append-only event stream, one JSON object per line:

```json
{"ts":"2026-02-18T12:01:10Z","run_id":"courses-api-ddd-20260218-120000","iteration":1,"phase":"A","step":"EVALUATE","event":"evaluation_done","status":"ok","payload":{"score":0.72,"passed":false}}
```

### `artifact.md`

Single source of truth for artifact content. Written after PRODUCE and REFINE phases. Artifact content is never stored in `run.json` — always read from this file.

Ownership note: `artifact.md` is owned by `/aif-loop` for the active run. Other workflow commands should treat loop artifacts as read-only context unless the user explicitly asks for manual edits.

## Phases

6 phases per iteration with parallel execution where possible:

1. `PLAN` - short plan (3-5 steps max)
2. `PRODUCE` - generates `artifact.md` ← **parallel with PREPARE**
3. `PREPARE` - generates check scripts/definitions from rules ← **parallel with PRODUCE**
4. `EVALUATE` - runs prepared checks + content rules, aggregates score ← **parallel check groups**
5. `CRITIQUE` - failed rules -> exact fix instructions (only if fail)
6. `REFINE` - targeted rewrite of artifact (only if fail)

### Parallel Execution

Two levels of parallelism via `Task` tool:

- **PRODUCE || PREPARE**: both depend only on PLAN output, run as parallel `Task` agents
- **Within EVALUATE**: independent check groups (executable via Bash, content via Read/Grep) run as parallel `Task` agents

If `Task` tool is unavailable, all phases execute sequentially as fallback.

### Phase Contracts

Strict I/O contracts are defined in skill references:

- `skills/aif-loop/references/PHASE-CONTRACTS.md` - input/output/constraints per phase

## Evaluation Rules

Rules define what the evaluator checks. Runtime rules in `run.json.criteria.rules` always include full schema fields (`id`, `description`, `severity`, `weight`, `phase`, `check`).

### Rule Format

```json
{
  "id": "a.correctness.endpoints",
  "description": "All core CRUD endpoints are present",
  "severity": "fail",
  "weight": 2,
  "phase": "A",
  "check": "Verify each endpoint from the task prompt exists (materialized by PREPARE into concrete checks)"
}
```

### Score Formula

```
score = sum(passed_weights) / sum(all_active_weights)
passed = (score >= threshold) AND (no fail-severity rules failed)
```

Severity levels: `fail` (weight 2, blocks pass), `warn` (weight 1, reduces score), `info` (weight 0, tracked only).

Template rows are shorthand; during setup they are normalized to full runtime rules. If `weight` is omitted, it is derived from severity (`fail`=2, `warn`=1, `info`=0). If task-specific checks are needed, `check` is materialized before iteration starts.

Full schema and ID conventions: `skills/aif-loop/references/RULE-SCHEMA.md`

### Criteria Templates

Pre-built rule sets for common task types (API spec, code generation, documentation, configuration): `skills/aif-loop/references/CRITERIA-TEMPLATES.md`

## Iteration Flow

1. `PLAN` -> `plan`
2. In parallel: `PRODUCE` -> `artifact.md` || `PREPARE` -> `checks`
3. `EVALUATE` -> `evaluation` (runs prepared checks in parallel groups)
4. If failed: `CRITIQUE` -> `critique`, then `REFINE` -> updated `artifact.md`
5. If phase A passed: switch to phase B, re-run `PREPARE` (phase=B) + `EVALUATE` against same artifact with B-level rules (no re-produce)
6. Update state, increment iteration, repeat

### State Events

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

## Stop Conditions

### Precedence contract

More than one condition can hold at the same phase boundary. The numbered order below is a **tie-break**, not a list of independent checks: evaluate top-down, and the first match becomes `stop.reason`. Completion guards precede resource guards, so a successful run is never relabelled `stopped` because a resource ran out in the same breath.

1. `threshold_reached` — `phase=B` and threshold passed
2. `no_major_issues` — **`phase=B`** and no `fail`-severity rules failed in current evaluation; only `warn`/`info` remain and no stricter phase is left. In `phase=A` this never stops the loop — a clean A-evaluation moves into `phase=B`, so B-level rules are never skipped
3. `user_stop` — user requested stop
4. `stagnation` — stagnation detected (`stagnation_count >= 2`)
5. `budget_exceeded` — completed-phase budget exhausted, only when `max_completed_phase_seconds` is set
6. `iteration_limit` — iteration limit reached

`budget_exceeded` outranks `iteration_limit` deliberately — time is an irreversibly spent external resource, so naming the budget is more useful when both trip. This exact order is repeated in `skills/aif-loop/SKILL.md` Step 5 and `subagents/claude/agents/loop-orchestrator.md`; all three must stay in sync.

Default iteration limit is `4` (`run.json.max_iterations` is the single source of truth). The time budget has no default: `run.json.max_completed_phase_seconds` is optional, and `null` or a missing field means no limit — run files created before the field existed behave unchanged.

### Simultaneous conditions

| Conditions true at the same boundary | `stop_reason` | `run.json` status |
|--------------------------------------|---------------|-------------------|
| `threshold_reached` + `budget_exceeded` | `threshold_reached` | `completed` |
| `no_major_issues` + `budget_exceeded` | `no_major_issues` | `completed` |
| `iteration_limit` + `budget_exceeded` | `budget_exceeded` | `stopped` |
| `stagnation` + `budget_exceeded` | `stagnation` | `stopped` |
| `user_stop` + any other | `user_stop` | `stopped` |

### Completed-Phase Time Budget

`max_completed_phase_seconds` caps time spent inside **completed** phase segments, measured at phase boundaries with `date +%s` — there are no background timers:

- before a phase starts: if `completed_phase_seconds >= max_completed_phase_seconds`, the loop stops with `budget_exceeded` instead of starting it; otherwise `phase_started_epoch_seconds` is set to the current epoch and persisted
- after a phase completes: `completed_phase_seconds += max(0, now - phase_started_epoch_seconds)`, `phase_started_epoch_seconds` resets to `null`, and the cap is re-checked
- the `PRODUCE_PREPARE` pair is one segment — parallel or sequential fallback alike, never a per-task sum

The limit is **soft**: it is only evaluated at phase boundaries and never interrupts a running phase or its `Task` subagents. A run may overshoot the cap by up to the duration of the in-flight phase — expected behavior, not an error.

Only completed segments count. An interrupted phase contributes nothing at all, and idle time never counts — so a repeatedly interrupted loop can spend real time without moving `completed_phase_seconds`. That is the contract, stated openly: precise accounting needs internal checkpoints that do not exist at the skill level.

Field types, invariants, clock-rollback handling, diagnostics and setup rules: `skills/aif-loop/references/ACTIVE-TIME-BUDGET.md`.

### Stop Reason → Status Mapping

| Stop reason | `run.json` status |
|-------------|-------------------|
| `threshold_reached` | `completed` |
| `no_major_issues` | `completed` |
| `user_stop` | `stopped` |
| `iteration_limit` | `stopped` |
| `stagnation` | `stopped` |
| `budget_exceeded` | `stopped` |
| `phase_error` | `failed` |

## Final Summary Contract

After loop termination, always show final summary with:

1. `iteration` and `max_iterations`
2. `phase`
3. `final_score`
4. `stop_reason`

If stop reason is `iteration_limit` or `budget_exceeded` and latest evaluation is `passed=false`, summary must also include **distance to success**:

1. active threshold vs final score
2. numeric gap to threshold (`threshold - score`, floor `0`)
3. remaining failed `fail`-severity rule count and blocking rule IDs
4. rules progress (`passed_rules / total_rules`)

If stop reason is `budget_exceeded`, the summary and the `stopped` event payload additionally carry `completed_phase_seconds`, `max_completed_phase_seconds`, `overshoot_seconds`, and `last_completed_step`. The `status` command shows `completed_phase_seconds / max_completed_phase_seconds` while the loop is still running.

### Artifact status gates the numbers

A stop can land at any phase boundary, so the artifact may be missing, unevaluated, or newer than the last evaluation. `evaluation.artifact_hash` (first 8 hex of the artifact SHA-256, recorded by EVALUATE) makes that detectable:

| `artifact_status` | Condition | Reported score |
|-------------------|-----------|----------------|
| `not_created` | no `artifact.md` (e.g. stop right after PLAN) | `unavailable` |
| `unevaluated` | artifact exists, `evaluation` is `null` | `unavailable` |
| `stale` | `evaluation.artifact_hash` ≠ current artifact hash (e.g. stop right after REFINE) | `unavailable`, with `last_evaluated_score` |
| `evaluated` | hashes match | numeric `final_score` |

Distance-to-success is computed only for `evaluated`. A score belonging to an older artifact version is never presented as `final_score`.

### Stagnation Rule

Track `delta = score - last_score`:

- if `delta < 0.02` and no severity `fail` blockers, increment `stagnation_count`
- if `stagnation_count >= 2`, stop with `stagnation`

## Criteria Model

Use template-recommended phase thresholds by default (fallback: A=`0.8`, B=`0.9`):

- Phase `A`: threshold `0.8`, base correctness/coverage rules
- Phase `B`: threshold `0.9`, stricter quality/performance/security rules

If any rule with severity `fail` is failed, overall `passed=false` regardless of score.

## Iteration Output

After each iteration, show a **compact summary** — do not dump full `run.json` or `artifact.md` into the conversation. The artifact is on disk; duplicating it wastes context.

```text
── Iteration {N}/{max} | Phase {A|B} | Score: {score} | {PASS|FAIL} ──
Plan: {1-line summary}
Hash: {first 8 chars of artifact SHA-256}
Changed: {list of added/modified sections or "initial generation"}
Failed: {rule IDs or "none"}
Warnings: {rule IDs or "none"}
Artifact: <paths.evolution>/<alias>/artifact.md
```

If `passed=false`, append compact critique (rule ID + 1-line fix per issue).

### Full output exceptions

Show the full artifact content (not just summary) in these cases:

1. **Loop termination** — final iteration always shows the complete artifact
2. **Phase A → B transition** — show the phase-A-passing artifact in full once at the transition boundary for visibility (B-level evaluation still runs immediately per iteration flow)
3. **Explicit user request** — user asks to see the full artifact

## Context Management

All loop state is persisted to disk. Clearing conversation context loses nothing — `resume` reconstructs from files.

Recommend `/clear` then `/aif-loop resume` when:

- After iteration 2 (midpoint of default 4-iteration loop)
- On Phase A → B transition
- When iteration >= 3

## Error Recovery

- **Invalid phase output**: retry the phase once, then stop with `phase_error`
- **Corrupted `run.json`**: reconstruct from `history.jsonl` events
- **Missing `history.jsonl`**: inform user, suggest starting a new loop

## Anti-Overengineering Guardrails

1. Do not create extra index files by default
2. Keep plan to 3-5 steps
3. Critique returns max 5 issues
4. Refiner changes only failed-rule areas
5. Use one artifact (`artifact.md`) per iteration

## Design Rationale

The loop uses a phase model with targeted parallelism:

1. Keep architecture simple — phases run in a single agent context, parallelism only where inputs are independent (PRODUCE||PREPARE, check groups in EVALUATE).
2. Evaluation is grounded in explicit rules with measurable scores.
3. Each phase has strict I/O contracts to prevent drift.
4. Hard stop guards prevent infinite loops (threshold, stagnation, max iterations, optional active-time budget, manual stop).
5. Artifact is always on disk — resumable across sessions.

## See Also

- [Development Workflow](workflow.md) - where `/aif-loop` fits in the overall process
- [Subagents](subagents.md) - Claude-only loop roles used to split planning, generation, and evaluation
- [Core Skills](skills.md) - full command reference including `/aif-loop`
- [Configuration](configuration.md) - `.ai-factory/` storage layout
