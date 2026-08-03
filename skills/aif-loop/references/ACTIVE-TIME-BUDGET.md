# Completed-Phase Time Budget

Optional cap on the time a loop spends inside **completed phase segments**. Referenced from `SKILL.md` Step 5 (Stop Conditions).

## Contract

The budget is off by default. `null` or an absent `max_completed_phase_seconds` means no limit: every rule below is skipped, the accounting fields stay untouched, and run files created before these fields existed behave exactly as they did.

## Field types and invariants

```text
max_completed_phase_seconds: null | positive integer   (seconds)
completed_phase_seconds:     non-negative integer, monotonically non-decreasing
phase_started_epoch_seconds: null | non-negative integer (Unix epoch seconds)
```

`phase_started_epoch_seconds` is named for its unit on purpose — it is epoch seconds from `date +%s`, not an ISO-8601 timestamp like `created_at` / `updated_at`.

A value outside these types is a **validation failure**, not something to interpret. Where it surfaces decides how it is handled — `phase_error` is deliberately *not* reused, because it means "a phase returned output off-contract" and carries a retry-once semantic that makes no sense for a config value:

- **During setup**, before iteration 1: `"300"` (string), `0`, a negative number, or a decimal for `max_completed_phase_seconds` → report the offending field and value to the user and do not start the loop. Do not coerce, round, or guess. No `phase_error` event is written; no phase has run.
- **On resume**, when a hand-edited `run.json` carries such a value: treat the run file as corrupted and follow "Corrupted `run.json`" recovery in `SKILL.md`.
- `completed_phase_seconds` must never decrease. A read lower than the previously persisted value is the same corruption case.

Clock rollback is contained at the arithmetic, not trusted away:

```text
delta = max(0, now - phase_started_epoch_seconds)
```

A backwards jump of the system clock therefore contributes `0` to the total, never a negative number.

## What the budget counts

Only **completed** phase segments. This is the definition, not an approximation:

- A phase that ran to completion adds its wall-clock duration.
- A phase interrupted by session end, `/clear`, a crash, or any other stop adds **nothing** — the partial work is not counted at all.
- Idle time between sessions is never counted.

The consequence is explicit: a loop that is repeatedly interrupted mid-phase can burn real time without moving `completed_phase_seconds`. That is a deliberate contract limit, not an accounting bug. Precise wall-clock accounting requires internal checkpoints that do not exist at the skill level — the same reason token accounting is out of core.

## Measurement

Time is taken at **phase boundaries** with `date +%s`. There are no background timers.

- **Before starting a phase**: if `completed_phase_seconds >= max_completed_phase_seconds`, stop with `budget_exceeded` instead of starting the phase. Otherwise persist `phase_started_epoch_seconds = <now>` and run the phase.
- **After the phase completes**: add `max(0, <now> - phase_started_epoch_seconds)` to `completed_phase_seconds`, reset `phase_started_epoch_seconds` to `null`, persist both in the same `run.json` write, and re-check the cap — if exceeded, stop with `budget_exceeded` before the next phase begins.
- **On resume**: discard any stale `phase_started_epoch_seconds` by setting it to the current `date +%s` when the interrupted phase actually re-starts. The interrupted attempt contributes nothing (see "What the budget counts").

### `PRODUCE_PREPARE` is one segment

The logical pair `PRODUCE_PREPARE` is a **single timed segment** regardless of how it executed:

- parallel via `Task` — wall-clock from launching both to both completing, not a per-`Task` sum;
- sequential fallback — the same single segment, still one boundary pair;
- a failed parallel attempt followed by the sequential fallback — the failed attempt's time belongs to the same segment.

There is no budget stop between `PRODUCE` and `PREPARE`, and `current_step` stays `PRODUCE_PREPARE` throughout.

### Retried phases

`SKILL.md` retries a phase once when its output is off-contract. Both attempts belong to **one** segment: the boundary opens when the first attempt starts and closes when the retry completes. There is no budget check between the failed attempt and the retry — a phase already in flight is never interrupted, and that includes its retry.

If the retry also fails, the loop stops with `phase_error` (`status: failed`). That is a failure path, not a budget path: no `budget_exceeded` reason is produced, and the segment's time is still folded into `completed_phase_seconds` before the run terminates, so `status` reflects what was actually spent.

## Soft limit

The check runs only at phase boundaries and never interrupts a phase or its `Task` subagents mid-flight. A run may overshoot the cap by up to the duration of the phase that was in flight when the budget ran out. That overshoot is expected and is not an error.

## Diagnostics

When the loop stops with `budget_exceeded`, both the final summary and the `stopped` event payload carry:

| Field | Meaning |
|-------|---------|
| `completed_phase_seconds` | total counted time |
| `max_completed_phase_seconds` | the cap that was set |
| `overshoot_seconds` | `max(0, completed_phase_seconds - max_completed_phase_seconds)` |
| `last_completed_step` | the `run.json.current_step` value of the segment that just completed and tripped the cap — read at the boundary, not a new persisted field |

Example `stopped` event line:

```json
{"ts":"2026-02-18T12:31:44Z","run_id":"courses-api-ddd-20260218-120000","iteration":3,"phase":"A","step":"EVALUATE","event":"stopped","status":"ok","payload":{"reason":"budget_exceeded","completed_phase_seconds":624,"max_completed_phase_seconds":600,"overshoot_seconds":24,"last_completed_step":"EVALUATE"}}
```

Because `budget_exceeded` maps to `stopped` with `passed=false`, the final summary also carries the mandatory **distance-to-success** block (`SKILL.md` Step 7).

## Setup

The budget is offered in both quick mode and full setup, and it is never inferred silently:

- The normalized value is shown next to `max_iterations` in the draft summary.
- A non-`null` value requires explicit confirmation, with `none` always offered as an option.
- Changing the budget re-opens draft confirmation on the same footing as criteria and max iterations.
- A domain-level timeout mentioned in the task text — "request timeout 5 seconds", "the endpoint must answer within 200 ms", a deadline for the *artifact* — does **not** become a loop budget. Infer a budget only when the text says the limit applies to running `/aif-loop` itself. In every other case the answer is `none`, even when the task is full of seconds.
