# `--list` mode procedure

This file describes the read-only plan discovery procedure that runs when `aif-improve` is invoked with the `--list` flag. The parent skill defers to this document instead of inlining the procedure, because `--list` is a conditional branch and keeps the main `SKILL.md` body within the size limit.

## When this runs

`aif-improve --list` is invoked. The flag may appear anywhere in `$ARGUMENTS`. When `--list` is present, this procedure runs to completion and the skill stops — no refinement is performed even if other tokens (`+check`, `@path`, free-form prompt) are also passed. Those tokens are silently ignored in `--list` mode.

## Procedure

1. **Get the current branch** (git mode only):

   ```bash
   git branch --show-current
   ```

2. **Convert the branch name to a filename stem** (git mode only): replace `/` with `-`. The result is `<branch-slug>`. Example: `feature/user-auth` → `feature-user-auth`.

3. **Check existence of every plan location below.** Use the path values resolved from `.ai-factory/config.yaml` (see Step 0 of `SKILL.md` for the defaults applied when the config file is missing):

   - `<configured plans dir>/<branch-slug>.md` (default `workflow.plan_id_format = slug`).
   - When `workflow.plan_id_format = sequential`, additionally glob `<configured plans dir>/[0-9][0-9][0-9][0-9]_<branch-slug>.md` and report all matches with the highest-numbered match first.
   - If git mode is off or branch creation is disabled (`git.enabled = false` or `git.create_branches = false`), list every `*.md` file in `<configured plans dir>/` that looks like a full-mode plan. A leading 4-digit prefix counts as a match.
   - The resolved fast plan path (`paths.plan`).
   - The resolved fix plan path (`paths.fix_plan`).

4. **Print the availability summary**, followed by usage hints that the user can copy verbatim. Example output shape:

   ```
   ## Available Plans
   Current branch: feature/user-auth

   - [x] .ai-factory/plans/feature-user-auth.md
   - [ ] .ai-factory/PLAN.md
   - [x] .ai-factory/FIX_PLAN.md

   Use:
   - /aif-improve @<path> <optional prompt>
   - /aif-improve <optional prompt>      # automatic priority
   ```

   - Mark each candidate with `[x]` when it exists and `[ ]` when it does not.
   - Show absolute paths only if the configured paths are absolute; otherwise show them relative to the project root.

5. **If no plan exists at any of the locations above**, suggest creating one:

   ```
   No plans found. Create one first:
   - /aif-plan full <description>
   - /aif-plan fast <description>
   - /aif-fix <bug description>
   ```

6. **Archived plans.** If `paths.archive/plans/` exists and contains `*.md` files, display a separate count line after the main list: `Archived plans: N (in <paths.archive>/plans/)`. Do not list individual archived plans — use `/aif-archive list` for that.

7. **STOP.** Do not proceed to any refinement step.

## Read-only contract

In `--list` mode the skill MUST NOT:

- modify any files,
- create or delete any plans,
- update `TaskList` entries or task statuses,
- call the validator subagent (the `+check` flag is silently ignored — there is nothing to validate before refinement runs).

Only `git` (read-only), `Read`, `Glob`, and `Grep` are required to satisfy the procedure above.

## Example

```
User: /aif-improve --list

## Available Plans
Current branch: feature/user-auth
- [x] .ai-factory/plans/feature-user-auth.md
- [ ] <resolved fast plan path>
- [x] <resolved fix plan path>

Use:
- /aif-improve @.ai-factory/plans/feature-user-auth.md
- /aif-improve add validation and retries
```
