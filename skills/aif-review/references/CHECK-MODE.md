# `+check` validation procedure

This file describes the optional findings-validation pass that runs when `aif-review` is invoked with the `+check` flag. The parent skill defers to this document so the main `SKILL.md` stays focused on the default review workflow; `+check` is opt-in and most invocations do not need it.

The two severity levels — **critical** (merge-blocking) and **suggestion** (non-blocking) — and the rules for moving an item between them are defined in `SEVERITY.md` next to this file. Do not redefine severity here.

## When to run

After the full review is produced internally (all sections, including the gate result inputs) but **before** anything is rendered to the user. The validator only adjusts which items reach the user and what the final `aif-gate-result` block reports.

If `+check` is not set, skip this entire procedure — render the review as-is, with no validator-related lines in the output. "Questions", "Positive Notes", and the "Context Gates" block are NOT validated even when `+check` is set; neither are commit-structure findings in commits mode (see Procedure step 1).

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

> Edge case: the reviewed diff covers the change itself. A finding about how the change interacts with **unchanged** surrounding code is still verified against disk, and in PR mode disk is the current branch, not the PR branch — that residual mismatch is an acceptable compromise, since checking out the PR branch would break the read-only contract.

## Failure modes

- **Per-item malformed response** (heading missing, no `Verdict` line, unknown verdict token, unknown `Severity` value, or missing `Modified-text` line when `Verdict` is `modify`): treat that item as `keep` with `Severity: unchanged` and append one line after all review sections, just before the `aif-gate-result` fence: `WARN [+check]: validator response for item N was malformed, kept as-is`. Continue processing remaining items.
- **Whole-dispatch failure** (empty response, exception, timeout, validator refusal): treat **all** items as `keep` with `Severity: unchanged` and append one line in the same position (before the `aif-gate-result` fence): `WARN [+check]: validator failed (<reason>), all items kept as-is`. In this case the `aif-gate-result` block is assembled from the **unfiltered** original list — do NOT recompute `status`, `blockers`, `affected_files`, or `suggested_next`.

In both failure paths the `aif-gate-result` fence stays the **last** thing in the output. WARN lines always go above it.

## Output additions

When `+check` ran successfully (no whole-dispatch failure), append exactly one line at the end of the human-readable review, after all sections and before the `aif-gate-result` fence:

```
Filtered: N hidden, M adjusted, K reclassified by +check
```

`N`, `M`, `K` are zero when nothing happened in that bucket — still emit the line so the user sees the validator ran. Skip this line entirely when `+check` was not set or when the whole-dispatch failure path applies (the `WARN` line replaces it).

## Recomputing `aif-gate-result` after `+check`

`aif-gate-result` is computed by the **Machine-readable gate result** section of `SKILL.md` — that section is the single owner of the projection (findings + context gates → `status` / `blocking` / `blockers` / `affected_files` / `suggested_next`). `+check` does **not** define its own projection; it only changes the input the projection runs on.

Apply the `SKILL.md` rules unchanged, with three `+check`-specific points:

- **Input is the post-filter findings.** Recompute `status`, `blockers`, and `affected_files` from "Critical Issues" and "Suggestions" *after* every keep/modify/drop and severity move. A dropped critical item or a demoted finding can lower `status`; a promoted suggestion can raise it.
- **Context gates are not touched.** `+check` never validates the "Context Gates" block (see "When to run" above). Carry its result over from the pre-`+check` draft unchanged and feed it into the same `status` merge — a blocking context gate keeps `status` at `fail` regardless of what the validator did to the findings, and that gate finding stays in `blockers`.
- **`suggested_next.reason`** gains a short note mentioning `+check` and the three counters, e.g. `"After +check filtering: 2 hidden, 1 adjusted, 1 reclassified; remaining blockers require a fix pass."`.

Whole-dispatch failure is the exception: keep the unfiltered draft and do NOT recompute (see "Failure modes" above).

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

### Whole-dispatch failure

```
User: /aif-review +check

→ Review drafted: 2 in Critical Issues, 3 in Suggestions
→ +check validator dispatched
→ Validator failed (timeout)
→ All items kept as-is; aif-gate-result NOT recomputed (kept from the draft)

Rendered review (unchanged from the draft):
- Critical Issues: 2 (original)
- Suggestions: 3 (original)
- Questions / Positive Notes: unchanged

WARN [+check]: validator failed (timeout), all items kept as-is

aif-gate-result (assembled from the unfiltered original list):
- status: fail, blocking: true
- suggested_next: /aif-fix
- reason: original draft reason, no +check counters appended
```
