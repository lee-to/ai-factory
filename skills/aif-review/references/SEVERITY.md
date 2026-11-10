# Review item severity levels

This document is the single source of truth for what counts as a *critical* item versus a *suggestion* in `aif-review`. Both `SKILL.md` and `references/VALIDATOR.md` defer to this file — do not redefine the levels inline elsewhere.

## Two levels

- **critical** — merge-blocking. Lands in the "Critical Issues" section of the rendered review and contributes to `aif-gate-result.blockers`. Pick this level when the cited behavior would cause:
  - data loss, corruption, or unbounded resource usage,
  - a security regression (auth bypass, injection, leaked credentials),
  - broken correctness on a path that real users hit,
  - a downstream regression that needs a fix before merge (build break, contract change without consumers updated).

- **suggestion** — non-blocking. Lands in the "Suggestions" section and does NOT contribute to `aif-gate-result.blockers`. Pick this level when the cited behavior is:
  - a clarity / readability / naming improvement,
  - a performance-budget tweak or micro-optimization,
  - a missing log line or comment,
  - a future refactor that does not block this change,
  - a test gap that does not hide an active bug.

When in doubt between the two, leave the item at its original level. Reclassification is a deliberate judgment, not a default.

## When validator reclassifies

The `+check` validator may move an item between levels when the original review picked the wrong one. Two directions:

- **suggestion → critical** (promote) — the underlying behavior is more severe than the original framing. Example: the original review framed it as "extra database round-trip", on inspection it is "N+1 that times out the request under realistic load".
- **critical → suggestion** (demote) — the underlying behavior does not actually block merge. Example: the original review framed it as "missing null check that would crash", on inspection the upstream caller already guarantees non-null and the cited path is unreachable in production.

Reclassification with no text change is allowed (text is fine, only the level was wrong). Reclassification with a rewritten text is also allowed (both wrong).

The validator does NOT reclassify items just to balance the sections or to make the review "feel right". A move requires a concrete reason tied to the actual code or the actual cited behavior.

## Confidence markers

A `(confidence: low)` / `(confidence: medium)` marker on an item is not a third level and never changes severity semantics: severity reflects the impact of the cited behavior *assuming the finding is true*, so an uncertain potential blocker is filed as **critical** and a well-established nitpick as **suggestion**. Uncertainty is resolved by the validator's verdict (`modify` to confirm, `drop` to refute), never by demotion: do not demote a confirmed item because it arrived with a marker, and do not keep an unconfirmed one because it is hedged.

A marker has no gate projection of its own: it is resolved before the gate is computed, and a marker that reaches the gate unresolved is a validation failure that the gate reports as such (`review-validation-failed`). Both rules belong to the owner of the projection (see below), not to this file.

## Where `aif-gate-result` is computed

How `critical` / `suggestion` items project into the final `aif-gate-result` (`status`, `blockers`, `suggested_next`) is **not** defined here. The single owner of that computation is the **Machine-readable gate result** section of `SKILL.md`; `+check` reuses it via `references/CHECK-MODE.md`. This file only defines the two levels and when to move an item between them.
