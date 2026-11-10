# Applying a Selected Setup

## Before Mutation

Confirm the proposal is selected and execution is permitted in this runtime.
Reuse session authorization for the same concrete effects. Preserve an inventory
of existing files/entries and staged versus unstaged state before editing.
Re-read targeted files; changes since the proposal require reconciliation before
overwriting a user's new work. Never use blanket reset/clean as recovery.

Check versions using current docs for the selected runtime/framework. Resolve exact
dependency constraints through the existing package/environment manager. Do not
install latest blindly, upgrade runtime or replace a lockfile/manager. Show install
effects including package lifecycle/plugins, environment provisioning, network,
toolchain components and project configuration execution.

## Select, Validate, Then Activate

For a fresh setup, tools need not already exist to explain a candidate autofix mode:

1. Show the concrete tools/versions, candidate mode, intended project changes and
   disposable validation plan. Disclose scratch dependency downloads, lifecycle/
   config execution, temporary Git commits and expected source/index mutations.
2. Resolve tool selection and permission for those validation effects. Reuse exact
   session authorization; an unanswered question or audit request permits none of
   these effects. Selecting tools alone does not authorize a different mutating mode.
3. In an owned disposable layout, install/use the selected versions and test success
   and failure with partial staging, unrelated hunks and matching platform/EOL/Git
   policy. Review executable project inputs before copying/running them. Do not
   activate a project hook as an experiment or copy private input unnecessarily.
4. Report the observed result and its exact conditions. Only a passing, applicable
   validation permits activation of the selected mutating mode. Reuse consent for
   the already selected concrete change set; ask only if failure or changed conditions
   introduce a material new choice. Revalidate affected guarantees after drift.
5. Apply selected project changes below, then verify the installed result. Scratch
   success is evidence for that mode under those conditions, not project verification.

If validation fails, prerequisites are unavailable or execution is not authorized,
leave the candidate unactivated and report failed/not_run. Explain a suitable
check-only alternative with its truthful scope or leave the decision unresolved;
never silently substitute it. Check-only isolation also needs restoration evidence.
Do not auto-change EOL/attributes/Git policy, suppress failures or disable backups.
Audit stops at the proposal; validation itself is an execution choice for setup/enhance.

## Apply Per Repository

Use that repository's resolved context and artifact language; recheck its applicable
rules and Git preference before mutation. Never reuse another root's selection or
config defaults. `git.enabled:false` permits selected native checks only, with no
hook installation or Git commands. A failed root remains separate in the result.

1. Make the smallest selected native configuration changes. Preserve unrelated
   tables, comments, settings, rule policy and local config variants.
2. Merge only missing/selected scripts or aliases. Inspect existing script semantics
   before deciding a check is absent. Compose lifecycle tasks with correct ordering,
   failure propagation and quoting; do not overwrite an existing prepare command
   with a hook initializer. Dynamic/ambiguous scripts need an explicit resolution.
3. Install selected dev dependencies using the current manager/environment and
   compatible version constraints. Keep generated lockfile changes scoped; review
   unexpected transitive/lifecycle changes rather than accepting them silently.
4. Configure only chosen hook events using [hooks](hooks.md). Show existing manager/
   hook order and effective Git paths. Do not replace unowned hooks or change shared
   worktree settings without selecting that concrete impact.
5. Re-read the diff. Preserve unrelated dirty files/hunks. A setup command does not
   authorize formatting the whole repository or staging files for the user.
6. Follow [verification](verification.md). A successful installation alone is
   configured/installed, not verified behavior.

If a step fails, stop dependent changes and report which files/dependencies/hooks
were changed, the failed step and a scoped recovery path. Do not declare the whole
workspace rolled back unless it actually is. Revert only this operation's exact
changes when explicitly appropriate, preserving concurrent/user work.

## Repeat Runs

Audit actual current files rather than relying on a previous answer. Reuse matching
commands/configs; do not duplicate lifecycle entries, hook blocks or dependencies.
Treat user modifications since installation as current input, not drift to erase.
Enhance fills selected gaps. A tool migration, strictness increase or bulk source
cleanup is a distinct choice with its own visible effects.

## Owner Handoffs

Give `/aif-ci` selected command declarations/CWD, runtime versions, project scope,
blocking policy and existing CI gaps when CI changes were requested. CI runs full
selected checks without autofix. Give `/aif-build-automation` the same native
commands when build-file integration was requested. Preserve their independent
entrypoints and file ownership; neither needs to regenerate tool configs.

Use `/aif-rules` for requested rules and `/aif-docs` for requested documentation.
This skill never edits AI Factory context/config/plans to persist the proposal.
