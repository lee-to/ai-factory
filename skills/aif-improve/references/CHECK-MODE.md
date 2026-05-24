# `+check` validation procedure

This file describes the optional findings-validation pass that runs when `aif-improve` is invoked with the `+check` flag. The parent skill defers to this document so the main `SKILL.md` stays focused on the default refinement workflow; `+check` is opt-in and most invocations do not need it.

## When this runs

`aif-improve` is invoked with `+check` and **without** `--list`. The pass executes between Step 4 (Identify Improvements) and Step 5 (Present Improvements). Without `+check`, skip this procedure entirely — there are no validator-related lines in the output and the Step 5 Summary block stays in its default shape without the two `+check` counter rows.

`+check` together with `--list` is silently ignored (no refinement to validate).

## Procedure

The validation pass has two sequential phases.

### Phase (a) — validate the four findings groups

1. Collect items from the four findings groups built in Step 4: `missing` (4.1), `improvements` (4.2 + 4.5 — everything that rewords or expands existing tasks), `removals` (4.4 — redundant/duplicate tasks dropped without trace), and `out_of_scope` (4.6 — useful-but-unrelated tasks routed to the "💡 Out of scope" report section). Number them across all four groups in display order — group label is carried alongside each item. **If the combined list is empty, skip steps 2–5 of phase (a) entirely**: do not dispatch the validator, treat phase (a) as successful with `hidden = 0`, `adjusted = 0`, and proceed directly to phase (b) (Dependency Fixes still get recomputed normally).
2. Build the project context block: working directory path, optional excerpt from `.ai-factory/DESCRIPTION.md`, a one-line summary of the plan being refined (plan path + task count), and the user's improvement prompt parsed in Step 0 — verbatim when the run had one, or the literal marker `none — bare auto-review` when `$ARGUMENTS` carried no prompt text. The validator needs the prompt to tell a user-requested task apart from agent-invented gold-plating.
3. Read `references/VALIDATOR.md`. The reference declares two substitution slots at the top of the file — one for the project context block from step 2 and one for the items list from step 1 (each under its own `### Item N (group: …)` heading). Replace both before dispatch; the exact placeholder tokens are listed in the VALIDATOR.md header.
4. Dispatch one call: `Task(subagent_type: general-purpose, prompt: <rendered template>)`. The subagent runs with fresh context. Read-only behavior (no writes, no commands) is enforced by the prompt inside `references/VALIDATOR.md`, not by the dispatch interface — `general-purpose` exposes the full tool set, so a tool-level restriction is not available.
5. Parse the response by `### Item N` headings. The group of each item is always its **original** group from step 1 — the validator is forbidden by `references/VALIDATOR.md` from changing it. The `Group:` line in the response is an integrity check, not a control field: if its value differs from the original group, treat the whole item block as malformed (see failure modes below). For each well-formed item:
   - `Verdict: keep` → keep the item unchanged in its original group.
   - `Verdict: modify` → replace the item text with `Modified-text`, put it back in its original group. Increment `adjusted`.
   - `Verdict: drop` → remove the item from the output. Increment `hidden`.

### Phase (b) — recompute dependencies on the filtered list

After phase (a) finishes, the main skill (not the validator) recomputes the 🔗 Dependency Fixes group against the **post-(a) plan state**:

- start from the original plan tasks,
- add tasks introduced by `missing.keep` and `missing.modify` (these are confirmed new tasks),
- remove tasks targeted by `removals.keep`, `removals.modify`, `out_of_scope.keep`, and `out_of_scope.modify` (the validator confirmed the proposal to drop the task from the plan),
- tasks rescued by `removals.drop` or `out_of_scope.drop` stay in the plan — the validator overruled the proposal — and remain valid dependency targets,
- `improvements` only reword existing tasks; they never add or remove anything from the graph.

Any dependency that points at a task absent from the post-(a) plan is discarded. Dependencies are NOT sent to the validator — the legacy short form (`Task #X should depend on Task #Y. Reason: …`) is preserved and the counters from phase (a) do not include this group.

## Failure modes

- **Per-item malformed response** (heading missing, no `Verdict` line, unknown verdict token, missing `Modified-text` line when `Verdict` is `modify`, or `Group:` value that differs from the item's original group): treat that item as `keep` and append one extra line at the very end of the Step 5 output: `WARN [+check]: validator response for item N was malformed, kept as-is`. Continue with the remaining items.
- **Whole-dispatch failure** (empty response, exception, timeout, validator refusal): treat **all** items in phase (a) as `keep`, skip the `Hidden by +check` / `Adjusted by +check` Summary rows, and append one line at the end of Step 5: `WARN [+check]: validator failed (<reason>), all items kept as-is`. Phase (b) still runs against the unfiltered list — dependencies are recomputed normally.

## Output additions

When phase (a) ran successfully (no whole-dispatch failure), the Step 5 Summary block gains two extra rows at the end:

```
- Hidden by +check: N
- Adjusted by +check: M
```

The counters cover the four validated groups (`missing`, `improvements`, `removals`, `out_of_scope`) — `Dependencies to fix` is computed after validation and is not part of the counters. Skip both rows entirely when `+check` was not set, when the whole-dispatch failure path applies (the single `WARN [+check]` line replaces them), or when Step 5 takes the no-improvements branch (the "Plan Review Complete" / "Plan looks solid" path has no Summary block to extend).

## Examples

### Success

```
User: /aif-improve +check

→ Found plan: .ai-factory/plans/feature-user-auth.md
→ Step 4 produced 4 missing, 3 improvements, 2 removals, 1 out_of_scope
→ +check validator dispatched (see procedure above)
→ Validator returned: 7 keep, 2 modify, 1 drop
→ Dependencies recomputed against the post-(a) plan state

Step 5 report:
- Missing tasks: 3
- Tasks to improve: 3
- Dependencies to fix: 2
- Tasks to remove: 2
- Out of scope: 1
- Hidden by +check: 1
- Adjusted by +check: 2

Apply? → Yes → Changes applied
```

### Whole-dispatch failure

```
User: /aif-improve +check

→ Found plan: .ai-factory/plans/feature-user-auth.md
→ Step 4 produced 4 missing, 3 improvements, 2 removals, 1 out_of_scope
→ +check validator dispatched
→ Validator failed (empty response)
→ Phase (a): all items treated as keep (no Hidden/Adjusted counters emitted)
→ Phase (b): dependencies still recomputed normally against the unfiltered list

Step 5 report (original counters, no +check rows appended):
- Missing tasks: 4
- Tasks to improve: 3
- Dependencies to fix: 2
- Tasks to remove: 2
- Out of scope: 1

WARN [+check]: validator failed (empty response), all items kept as-is

Apply? → Yes → Changes applied
```
