# Phase Dispatch and Manual Resume

The loop owns `run.json`, `history.jsonl`, and phase results. The dispatch CLI only
resolves/spawns a command and emits its result; it never changes loop state.

## Phase transfer

Pass the full PHASE-CONTRACTS.md execution preamble, exact run path/id, iteration,
A/B level, task, required phase inputs and expected output format in `--prompt` as
one argv element. A short task summary alone does not transfer a phase. Include
resolved paths rather than assuming the default `.ai-factory/` layout.

In auto mode, the external agent must persist JSON phase output in the corresponding existing
`run.json` field (`plan`, `prepared_checks`, `evaluation`, `critique`) and markdown
in `artifact.md`. It must execute only the requested phase, not resume routing or
advance the loop. Only the parent validates the output and advances state. Do not
create extra output files. For a JSON phase, invalidate its old field before the
attempt and require a result for this iteration; never reuse the previous value
after a process merely exits 0. For PRODUCE/REFINE, require the child to confirm
the artifact path and this attempt in its completion output, then read that file;
unchanged bytes can be valid, but an old file alone is not proof of execution.
Missing/off-contract results use the existing phase-output retry-once policy.

Use only the dispatcher JSON stdout for `noop | manual | completed | error`.
The child's stderr/stdout (both on stderr in JSON mode) can contain arbitrary
text, including strings resembling dispatcher results. Never parse those as status.
An unavailable CLI or JSON option is a dispatch error and falls back in-process.

## Manual handoff

On `status: "manual"`, before stopping, persist `manual_dispatch` inside run.json:

```json
{
  "run_id": "courses-api-ddd-20260218-120000",
  "iteration": 1,
  "phase_level": "A",
  "step": "PRODUCE_PREPARE",
  "phase": "prepare",
  "completed_phases": ["produce"]
}
```

`step` preserves the existing logical current_step exactly. `completed_phases` is empty outside PRODUCE_PREPARE. Inside that pair it lists only
parts already executed, validated and persisted in this same iteration/level.
Never include the pending phase or unvalidated output. Keep
`current_step = PRODUCE_PREPARE` only when already executing that pair. Standalone
PREPARE at the A→B transition keeps `current_step = PREPARE` with an empty
completed_phases list: it must not run PRODUCE or overwrite the A-passing artifact.
Other phases keep their matching uppercase step. Do not add a new phase name or state file.

Generate the target-agent command with a second, non-spawning call:

```text
ai-factory dispatch <phase> --json --print --prompt "Run /aif-loop resume <alias> in this agent to execute the pending handoff for run <run_id>, iteration <N>, level <A|B>, phase <phase>."
```

Show that command's exact argv and tell the user to switch to the target agent.
Do not launch it automatically in manual mode. If instructions cannot be generated,
clear the new marker and use the dispatch-error fallback before any phase starts.
Keep loop status `running`; the marker is the handoff, not a terminal stop reason.

## Accepting the handoff on resume

Handle the marker before ordinary interrupted-phase recovery or dispatch:

1. Confirm run status is running and compare marker run_id, iteration, phase_level,
   step and phase with the current run. Require correct field types, a valid
   phase/step combination (prepare permits PREPARE or PRODUCE_PREPARE),
   distinct completed_phases drawn only from the complementary part of the pair,
   and its persisted result (`artifact.md` for produce, prepared_checks for prepare).
   A stale, inconsistent or malformed marker is corrupted run state: report it and
   use the existing recovery path; never let it bypass the current phase.
2. Execute only the pending phase in the current target-agent session, using the
   persisted task/inputs and PHASE-CONTRACTS.md, **without calling dispatch for it**.
   Resume is acceptance of the handoff, not evidence that its work already happened.
3. Validate and persist the result in the normal field/file. An invalid result
   follows the existing retry-once policy; do not clear the marker or advance on
   failure. Clear the marker only after its result is accepted.
4. Continue normal routing and dispatch for subsequent phases. Within
   PRODUCE_PREPARE retain the already accepted part(s) in this invocation; if the
   other part needs manual handoff, save a new marker with the accepted parts in
   completed_phases. Do not overwrite an accepted artifact just to re-enter the pair.

Legacy runs without a marker retain normal interrupted-phase replay. This
exception authorizes neither skipping work nor treating unverified old output as
completed. No changes to dispatch config are needed to finish a handoff.

## Budget and diagnostics

When max_completed_phase_seconds is enabled, before manual STOP clear
phase_started_epoch_seconds. On resume start a fresh
boundary timer. As for any interrupted segment, partial elapsed time is discarded;
user/session waiting is never charged. PRODUCE_PREPARE remains one logical segment
with no budget stop or per-task sum between its parts. Apply the normal budget
check at the completed segment boundary, including after accepting a handoff.
When the budget is null/absent, leave all budget accounting fields untouched.

When DEBUG_FIX=1 or LOG_LEVEL=debug, use `[FIX:dispatch]` diagnostics for the bound
phase, handoff acceptance and output validation/error. Never log task text, prompt
contents, secrets or artifact content. Keep default no-op CLI output silent.
