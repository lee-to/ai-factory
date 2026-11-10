### Step 0.0: Resume / Recovery (after a break or after /clear)

If the user is resuming **the next day**, says the session was **abandoned**, or you suspect context was lost (e.g. after `/clear`), rebuild local context from the repo **before** continuing tasks:

If `git.enabled = true`:

```
1. git status
2. git branch --show-current
3. git log --oneline --decorate -20
4. (optional) git diff --stat
5. (optional) git stash list
```

If `git.enabled = false`, skip git recovery commands and reconcile only from the resolved plan/fix-plan paths plus the working tree state.

Then reconcile plan/task state:

- Ensure the current plan artifact matches the current branch when git branch plans are in use (`@path` override wins; otherwise a branch-named full file or ultra directory takes priority over the resolved fast plan).
- If `git.enabled = false` or full/ultra plans were created without a branch, prefer:
    - explicit `@plan-file-or-directory`,
    - then the only root `*.md` full plan or declared-ultra direct child
      `*/index.md` entrypoint in the configured plans dir, excluding the
      resolved fast/fix plan paths,
    - then the resolved fast plan path.
- Compare `TaskList` statuses vs plan-entrypoint checkboxes.
    - If code changes for a task appear already implemented but the task is not marked completed, verify quickly and then `TaskUpdate(..., status: "completed")` and update the plan checkbox.
    - If a task is marked completed but the corresponding code is missing (rebase/reset happened), mark it back to pending and discuss with the user.

**If uncommitted changes exist:**

```
AskUserQuestion: You have uncommitted changes. Commit them first?

Options:
1. Yes, commit now (/aif-commit)
2. No, stash and continue
3. Cancel
```

**Based on choice:**

- Yes → run `/aif-commit`, then continue to plan discovery
- No → `git stash push -m "aif-implement: stash before plan execution"`, then continue
- Cancel → inform the user: "Implementation cancelled." → **STOP**

**If NO plan file exists but the resolved fix plan exists:**

A fix plan was created by `/aif-fix` in plan mode. Redirect to fix workflow:

```
Found a fix plan at the resolved fix plan path.

This plan was created by /aif-fix and should be executed through the fix workflow
(it follows the configured learning patch policy and handles cleanup automatically).

Running /aif-fix to execute the plan...
```

→ **Invoke `/aif-fix`** (without arguments – it will detect the resolved fix plan and execute it).
→ **STOP** — do not continue with implement workflow.

**If NO plan file exists AND no resolved fix plan (all tasks completed or fresh start):**

```
AskUserQuestion: No active plan found. Current branch: <current-branch>.
What would you like to do?

Options:
1. Start new feature from current branch
2. Return to configured base branch and start new feature
3. Create quick task plan (no branch)
4. Nothing, just checking status
```

**Based on choice:**

- New feature from current → `/aif-plan full <description>`
- Return to base branch → `git checkout <configured-base-branch>`, then `git pull origin <configured-base-branch>` → `/aif-plan full <description>` (git mode only)
- Quick task → `/aif-plan fast <description>`
- Nothing, just checking status → display branch info and recent commits summary → **STOP**

If `git.enabled = false`, replace option 2 with:

- `2. Create rich full plan without branch creation`
- Route it to `/aif-plan full <description>` without any git commands

**If plan file exists → continue to Step 0.1**
