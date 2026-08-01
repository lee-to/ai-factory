# Terminal Report Contract

Referenced from `SKILL.md` Step 7 and Step 8. Defines what the loop may claim about the artifact once it stops.

## Why this exists

A loop can stop at **any** phase boundary — including right after `PLAN` (no artifact yet), right after `PRODUCE_PREPARE` (artifact never evaluated), or right after `REFINE` (the stored evaluation describes the previous artifact version). Reporting `final_score` unconditionally would attach a number to an artifact it does not describe.

`EVALUATE` therefore records `evaluation.artifact_hash` — the first 8 hex chars of the SHA-256 of the artifact it actually read (`references/PHASE-CONTRACTS.md`). That binding is what makes staleness detectable rather than invisible.

## Resolve `artifact_status` first

| `artifact_status` | Condition | Typical stop point |
|-------------------|-----------|--------------------|
| `not_created` | `artifact.md` does not exist | budget exhausted after `PLAN` |
| `unevaluated` | artifact exists, `run.json.evaluation` is `null` | budget exhausted after `PRODUCE_PREPARE` |
| `stale` | `evaluation.artifact_hash` ≠ current hash of `artifact.md` | budget exhausted after `REFINE` |
| `evaluated` | `evaluation.artifact_hash` = current hash | after `EVALUATE` |

## What each status may report

Only `evaluated` may print a numeric `final_score` and a distance-to-success block.

```text
final_score: unavailable
artifact_status: unevaluated
reason: artifact was not evaluated before the loop stopped
last_evaluated_score: 0.60      # only when an earlier evaluation existed
```

For `stale`, name the mismatch explicitly rather than silently reusing the old number:

```text
final_score: unavailable
artifact_status: stale
reason: artifact was refined after the last evaluation
last_evaluated_score: 0.72      # describes the previous artifact version
```

Rules that hold for every status:

- Never present a score from an older artifact version as `final_score`.
- Never compute distance-to-success from an evaluation whose hash does not match.
- `not_created` skips the "where to save the artifact" prompt entirely — do not offer a file that does not exist, and do not print an empty artifact block.
- The stop reason is reported normally in all four cases; it is the *numbers* that are gated, not the reason.

## Interaction with stop reasons

`threshold_reached` and `no_major_issues` can only be selected from an evaluation that just ran, so they always arrive as `evaluated`. The gated statuses come from resource guards (`budget_exceeded`, `iteration_limit`) and from `user_stop`, which can land anywhere.
