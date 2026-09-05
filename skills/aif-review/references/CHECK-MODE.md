# `+check` validation procedure

This file describes the findings-validation pass. It runs when `aif-review` is invoked with the `+check` flag, and automatically when a review produced at least one confidence marker (`SKILL.md`, "Resolving markers before the gate"). The parent skill defers to this document so the main `SKILL.md` stays focused on the default review workflow; for marker-free reviews the flag remains opt-in and most invocations dispatch nothing.

The two severity levels — **critical** (merge-blocking) and **suggestion** (non-blocking) — and the rules for moving an item between them are defined in `SEVERITY.md` next to this file. Do not redefine severity here.

## When to run

After the full review is produced internally (all sections, including the gate result inputs) but **before** anything is rendered to the user. The validator only adjusts which items reach the user and what the final `aif-gate-result` block reports.

If `+check` is not set **and** the drafted review contains no `(confidence: low)` / `(confidence: medium)` marker, skip this entire procedure — render the review as-is, with no validator-related lines in the output. If markers are present, run the procedure even without the flag: the gate cannot be published while a marker is unresolved. The validator receives exactly one class of item: actionable code findings, which live in "Critical Issues" and "Suggestions". "Questions", "Positive Notes", the "Context Gates" block, and commit-structure findings in commits mode (see Procedure step 1) are NOT validated even when `+check` is set — the validator judges items against the reviewed diff, which is not evidence for context-gate or per-commit claims. That class table, and the rule that an actionable code finding is never rendered outside the two validated sections, live in `SKILL.md` ("Findings taxonomy and the validation boundary").

## Procedure

1. Collect items from "Critical Issues" and "Suggestions" into a numbered list. Use the prose format from the Output Format section of `SKILL.md`. Number them across both sections in display order (Critical first, then Suggestions), and render each item under a `### Item N (section: critical|suggestion)` heading so the validator sees which section it currently sits in. For each item, remember its **original section** — you need it to detect reclassification and to fall back if the validator response is malformed. In commits mode the reviewed diff handed to the validator is the squashed `git diff <ref>...HEAD` (step 2b) and carries no per-commit boundaries — so exclude from the numbered list any finding tied to an individual commit rather than to the net code change (commit-message accuracy, commit atomicity, or a change introduced in one commit and reverted within the range), exactly as "Questions" and "Positive Notes" are excluded; such findings stay in the rendered review verbatim and are not counted by the `Filtered:` line. **If the list is empty, skip steps 2–5 entirely**: do not dispatch the validator, treat the run as successful with `hidden = 0`, `adjusted = 0`, `reclassified = 0`, and proceed straight to "Output additions" / "Recomputing `aif-gate-result`".
2. Build two inputs for the validator. **(a) Project context block** — working directory path, plus a short excerpt from the project description file (the path resolved from `paths.description` in `SKILL.md` Step 0, default `.ai-factory/DESCRIPTION.md`) if that file exists; keep it under ~30 lines. **(b) Reviewed diff** — the exact diff the review was produced from, captured verbatim: `git diff --cached` for staged mode, or `git diff` when staged mode found nothing staged and reviewed the unstaged working tree instead; `gh pr diff <N>` for PR mode; `git diff <ref>...HEAD` for commits mode. The validator judges findings against this diff instead of reconstructing the change from disk — in PR mode the PR branch is not checked out, so disk holds the wrong version.
3. Read `references/VALIDATOR.md`. The reference declares four substitution slots at the top of the file — one for the project context block and one for the reviewed diff (both from step 2), one for the items list from step 1 (each under its own `### Item N (section: …)` heading), and one for the severity rules. For the severity slot, read `references/SEVERITY.md` and inline its full body into `{{SEVERITY_RULES}}` verbatim — the subagent gets the rules inside its own prompt and does not need to fetch the file from disk during dispatch. Replace all four before dispatch; the exact placeholder tokens are listed in the VALIDATOR.md header.
4. Dispatch one call: `Task(subagent_type: general-purpose, prompt: <rendered template>)`. The subagent runs with fresh context. Read-only behavior (no writes, no commands) is enforced by the prompt inside `references/VALIDATOR.md`, not by the dispatch interface — `general-purpose` exposes the full tool set, so a tool-level restriction is not available.
5. Parse the response by `### Item N` headings. For each item, first determine the **target section** from `Severity`:
   - `Severity: unchanged` (or field missing) → target section = original section.
   - `Severity: critical` → target section = Critical Issues.
   - `Severity: suggestion` → target section = Suggestions.

   Then apply `Verdict`:
   - `Verdict: keep` → item text stays. Place it in the target section. If target ≠ original, increment `reclassified`.
   - `Verdict: modify` → replace the item text with `Modified-text`. Place it in the target section. Increment `adjusted`. If target ≠ original, also increment `reclassified`.
   - `Verdict: drop` → remove the item. `Severity` is ignored. Increment `hidden`.

   Reclassified items (target ≠ original) are rendered with a short suffix appended to the item text so the user understands the move: ` [+check: promoted from Suggestions]` or ` [+check: demoted from Critical Issues]`. The suffix is added by the main skill, not by the validator.

   **Confidence markers.** A confirmed marked item loses its marker through `Modified-text` — `VALIDATOR.md` requires `modify` for exactly that reason. A response that leaves the marker in place violates the marked-item contract and is handled as a malformed per-item response (see "Failure modes"), not as a normal outcome. Never strip a marker yourself: the item was not confirmed through the contract, and silently unmarking it would present an unverified claim as verified.

   **Post-condition of a successful pass.** After a pass that had no whole-dispatch failure, every input marked item has been either removed via `drop` or returned via `modify` without its marker. No confidence marker remains among the processed findings — this is what lets the gate publish a verdict at all (`SKILL.md`, "No unresolved markers reach the gate"). When the post-condition does not hold — a marked item went through the per-item malformed path or the marked-item violation path and is still carrying its marker — the pass has failed for that item, and the gate reports `review-validation-failed` (see "Recomputing `aif-gate-result`" below) in addition to the item's `WARN` line.

> Edge case: the reviewed diff covers the change itself. A finding about how the change interacts with **unchanged** surrounding code is still verified against disk, and in PR mode disk is the current branch, not the PR branch — that residual mismatch is an acceptable compromise, since checking out the PR branch would break the read-only contract.

## Failure modes

- **Per-item malformed response** (heading missing, no `Verdict` line, unknown verdict token, unknown `Severity` value, or missing `Modified-text` line when `Verdict` is `modify`): treat that item as `keep` with `Severity: unchanged` and append one line after all review sections, just before the `aif-gate-result` fence: `WARN [+check]: validator response for item N was malformed, kept as-is`. Continue processing remaining items. An unmarked item kept this way is an established finding and projects normally; a **marked** item kept this way still carries its marker, so it is unresolved and the gate reports `review-validation-failed`.
- **Marked-item contract violation** — the input item carried a confidence marker and the response either returns `Verdict: keep`, or returns `Verdict: modify` whose `Modified-text` still contains `(confidence: low)` / `(confidence: medium)`. Both mean the uncertainty was not resolved, so neither is a normal outcome: preserve the original marked finding verbatim in its section, exclude it from `blockers`, and append `WARN [+check]: validator response for item N violated the marked-item contract, kept as-is`. Continue processing remaining items. The gate for the run is the `review-validation-failed` failure (see "Recomputing `aif-gate-result`" below). As with any per-item malformed response, the run no longer reports a fully successful filtering: the `Filtered:` line is replaced by the `WARN` line.
- **Whole-dispatch failure** (empty response, exception, timeout, validator refusal): treat **all** items as `keep` with `Severity: unchanged` and append one line in the same position (before the `aif-gate-result` fence): `WARN [+check]: validator failed (<reason>), all items kept as-is`. The `aif-gate-result` block is then assembled from the **unfiltered** original list, and what that yields depends on why the pass ran:
  - **explicit `+check` on a marker-free review** — the draft is a legitimate gate input (every finding is high-confidence), so the block is exactly the pre-validation gate: `status`, `blockers`, `affected_files`, and `suggested_next` unchanged from the draft;
  - **the draft carries at least one marker** (the pass was mandatory) — the unfiltered list still contains the markers, so the projection reports `review-validation-failed`; the marked items are excluded from `blockers`, the `WARN` line gives the reason.

In every failure path the `aif-gate-result` fence stays the **last** thing in the output. WARN lines always go above it.

## Output additions

When `+check` ran successfully (no whole-dispatch failure), append exactly one line at the end of the human-readable review, after all sections and before the `aif-gate-result` fence:

```
Filtered: N hidden, M adjusted, K reclassified by +check
```

`N`, `M`, `K` are zero when nothing happened in that bucket — still emit the line so the user sees the validator ran. Skip this line entirely when the pass did not run at all (no flag and no markers), when the whole-dispatch failure path applies, or when any per-item `WARN` was emitted — in those cases the `WARN` line replaces it.

## Recomputing `aif-gate-result` after `+check`

`aif-gate-result` is computed by the **Machine-readable gate result** section of `SKILL.md` — that section is the single owner of the projection (findings + context gates → `status` / `blocking` / `blockers` / `affected_files` / `suggested_next`). `+check` does **not** define its own projection; it only changes the input the projection runs on.

Apply the `SKILL.md` rules unchanged, with four `+check`-specific points:

- **Input is the post-filter findings.** Recompute `status`, `blockers`, and `affected_files` from "Critical Issues" and "Suggestions" *after* every keep/modify/drop and severity move. A dropped critical item or a demoted finding can lower `status`; a promoted suggestion can raise it.
- **Confirmed criticals become blockers.** A marked critical that the validator confirmed comes back without its marker and enters `blockers` like any other critical, driving `status` to `fail` and `suggested_next.command` to `/aif-fix`. This is the normal way a validation pass turns a draft into a `fail` gate. A refuted one is dropped and cannot influence the gate at all.
- **Context gates are not touched.** `+check` never validates the "Context Gates" block (see "When to run" above). Carry its result over from the pre-`+check` draft unchanged and feed it into the same `status` merge — a blocking context gate keeps `status` at `fail` regardless of what the validator did to the findings, and that gate finding stays in `blockers`.
- **Validation failure is a gate failure, not a finding state.** If any marked item is still carrying its marker after the pass (per-item malformed response or marked-item contract violation on a marked item, or a whole-dispatch failure of a mandatory pass — see "Failure modes"), project per the `SKILL.md` rule "An unresolved marker is a validation failure": `status: fail`, `blocking: true`, one `review-validation-failed` blocker (`severity: error`, summary = count of unresolved items and the cause from the `WARN` line) next to the established blockers, the unresolved items excluded from `blockers`, and `suggested_next.command: null` with a reason that says the review is incomplete and to re-run `/aif-review +check`. The `null` takes precedence over `/aif-fix` even when established blockers exist.
- **`suggested_next.reason`** gains a short note mentioning `+check` and the three counters, e.g. `"After +check filtering: 2 hidden, 1 adjusted, 1 reclassified; remaining blockers require a fix pass."`. On a validation failure the note names the failure instead of the counters.

Whole-dispatch failure feeds the unfiltered draft into the same projection: a marker-free draft reproduces the pre-validation gate, a marked draft yields the `review-validation-failed` gate (see "Failure modes" above).

## Examples

### Success

```
User: /aif-review +check

→ Review drafted: 2 in Critical Issues, 3 in Suggestions
→ +check validator dispatched (see procedure above)
→ Validator returned: 3 keep (1 promoted from Suggestions → Critical Issues),
  1 modify, 1 drop
→ aif-gate-result recomputed against the post-filter sections

Rendered review:
- Critical Issues: 2 (1 original + 1 promoted with " [+check: promoted from Suggestions]")
- Suggestions: 2
- Questions / Positive Notes: unchanged (not validated)

Filtered: 1 hidden, 1 adjusted, 1 reclassified by +check

aif-gate-result (post-filter):
- status: fail, blocking: true
- suggested_next: /aif-fix
- reason: "After +check filtering: 1 hidden, 1 adjusted, 1 reclassified; remaining blockers require a fix pass."
```

### Whole-dispatch failure on a marker-free review

```
User: /aif-review +check

→ Review drafted: 2 in Critical Issues, 3 in Suggestions, no confidence markers
→ +check validator dispatched
→ Validator failed (timeout)
→ All items kept as-is; the draft is a legitimate gate input, so the
  aif-gate-result is the pre-validation gate

Rendered review (unchanged from the draft):
- Critical Issues: 2 (original)
- Suggestions: 3 (original)
- Questions / Positive Notes: unchanged

WARN [+check]: validator failed (timeout), all items kept as-is

aif-gate-result (assembled from the unfiltered original list):
- status: fail, blocking: true
- blockers: the 2 original criticals
- suggested_next: /aif-fix
- reason: original draft reason, no +check counters appended
```

### Validation failure on a marked item

```
User: /aif-review

→ Review drafted: 1 in Critical Issues (unmarked), 1 in Critical Issues
  with "(confidence: medium)", 1 in Suggestions
→ Markers present → validator dispatched automatically
→ Validator returned: item 1 keep, item 2 keep (marked — contract violation),
  item 3 keep

Rendered review:
- Critical Issues: 2 (item 2 still carries its marker)
- Suggestions: 1

WARN [+check]: validator response for item 2 violated the marked-item contract, kept as-is

aif-gate-result:
- status: fail, blocking: true
- blockers: item 1 (established) + review-validation-failed
  ("1 marked finding left unresolved: validator response for item 2
  violated the marked-item contract"); item 2 is NOT a blocker
- suggested_next: null
- reason: "Validation of 1 marked finding failed, so the review is
  incomplete. Re-run /aif-review +check."
```
