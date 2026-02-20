[← Development Workflow](workflow.md) · [Back to README](../README.md) · [Core Skills →](skills.md)

# Reflex Loop

`/aif-loop` is a strict iterative workflow for quality-gated generation:

1. Generate initial artifact
2. Evaluate against explicit rules
3. Critique failed rules
4. Refine artifact
5. Repeat until stop condition is reached

It is designed for high-signal iteration with minimal storage overhead.

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

This confirmation is mandatory even when the task prompt already contains criteria and an iteration count. The loop must not start until both are confirmed.

## Persistence Model

4 files total for loop persistence (1 global pointer + 3 per-loop files). `current.json` exists only while a loop is active:

```text
.ai-factory/evolution/current.json
.ai-factory/evolution/<task-alias>/run.json
.ai-factory/evolution/<task-alias>/history.jsonl
.ai-factory/evolution/<task-alias>/artifact.md
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
  "phase": "A",
  "current_step": "PLAN",
  "task": {
    "prompt": "OpenAPI 3.1 + DDD notes + JSON examples + PHP controller",
    "ideal_result": "Spec + notes + examples + controller pass phase B"
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

Loop stops when any of the following is true:

1. `phase=B` and threshold passed (`threshold_reached`)
2. no `fail`-severity rules failed in current evaluation (`no_major_issues`) — only `warn`/`info` remain
3. iteration limit reached (`iteration_limit`)
4. user requested stop (`user_stop`)
5. stagnation detected (`stagnation`)

Default iteration limit is `4` (`run.json.max_iterations` is the single source of truth).

### Stop Reason → Status Mapping

| Stop reason | `run.json` status |
|-------------|-------------------|
| `threshold_reached` | `completed` |
| `no_major_issues` | `completed` |
| `user_stop` | `stopped` |
| `iteration_limit` | `stopped` |
| `stagnation` | `stopped` |
| `phase_error` | `failed` |

## Final Summary Contract

After loop termination, always show final summary with:

1. `iteration` and `max_iterations`
2. `phase`
3. `final_score`
4. `stop_reason`

If stop reason is `iteration_limit` and latest evaluation is `passed=false`, summary must also include **distance to success**:

1. active threshold vs final score
2. numeric gap to threshold (`threshold - score`, floor `0`)
3. remaining failed `fail`-severity rule count and blocking rule IDs
4. rules progress (`passed_rules / total_rules`)

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
Artifact: .ai-factory/evolution/<alias>/artifact.md
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
4. Hard stop guards prevent infinite loops (threshold, stagnation, max iterations, manual stop).
5. Artifact is always on disk — resumable across sessions.

## See Also

- [Development Workflow](workflow.md) - where `/aif-loop` fits in the overall process
- [Core Skills](skills.md) - full command reference including `/aif-loop`
- [Configuration](configuration.md) - `.ai-factory/` storage layout
