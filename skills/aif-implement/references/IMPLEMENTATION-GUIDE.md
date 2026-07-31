# Implementation Reference

## Progress Display Format

```
┌─────────────────────────────────────────────┐
│ Feature: User Authentication                │
├─────────────────────────────────────────────┤
│ ✅ #1 Create user model                     │
│ ✅ #2 Add registration endpoint             │
│ ✅ #3 Add login endpoint                    │
│ 🔄 #4 Implement JWT generation    ← current │
│ ⏳ #5 Add password reset                    │
│ ⏳ #6 Add email verification                │
├─────────────────────────────────────────────┤
│ Progress: 3/6 (50%)                         │
└─────────────────────────────────────────────┘
```

## Handling Blockers

If a task cannot be completed:

```
⚠️ Blocker encountered on Task #4

Issue: [Description of the problem]

Options:
1. Skip this task and continue (mark as blocked)
2. Modify the task approach
3. Stop implementation and discuss

What would you like to do?
```

## Session Continuity

Tasks are persisted in the conversation/project state.

## List Available Plans (`--list`)

When the user runs:

```
/aif-implement --list
```

Use read-only discovery and stop without executing any tasks.

### Discovery steps

```
git branch --show-current   # git mode only
```

Then derive:
- `branchPlan = <configured plans dir>/<branch-stem>.md` or `<configured plans dir>/<branch-stem>/index.md`
- `namedPlan = the only root *.md full plan or declared-ultra direct child */index.md entrypoint in <configured plans dir>/ when no branch-based plan exists; exclude resolved fast/fix plan paths`
- `fastPlan = <resolved fast plan path>`
- `fixPlan = <resolved fix plan path>`

For `workflow.plan_id_format: sequential`, include both
`[0-9]{4}_<branch-stem>.md` and `[0-9]{4}_<branch-stem>/index.md`, highest
number first. Count a directory entrypoint only when it contains
exactly one `<!-- aif:plan-mode:ultra -->`.
Do not list phase files as independent plans.

Check which files exist and print:

```
## Available Plans
Current branch: <branch>
- [x| ] <branchPlan>   (current-branch plan)
- [x| ] <namedPlan>    (full/ultra plan without branch)
- [x| ] <fastPlan>     (fast plan)
- [x| ] <fixPlan>      (fix plan)

Use:
- /aif-implement @<path>  to execute a specific plan
- /aif-implement          to use automatic priority
```

If no plans exist, print:

```
No plan files found. Create one with:
- /aif-plan full <description>
- /aif-plan ultra <description>
- /aif-plan fast <description>
- /aif-fix <bug description>
```

### Constraints

- Do not execute implementation tasks
- Do not modify files
- Do not call `TaskUpdate`

### Recovery after a break or after /clear

If the user is resuming later and you don't have prior conversational context, rebuild context from git + the plan artifact before continuing:

```
git status
git branch --show-current
git log --oneline --decorate -20
git diff --stat
```

Then:
- Re-open the active plan entrypoint (`@path` override if provided; otherwise branch plan first, then a single named full/ultra plan, then `PLAN.md`, then `FIX_PLAN.md` redirect to `/aif-fix`).
- For ultra, validate the Phase Index and read the complete phase file for the active task before editing code.
- Use `TaskList` to find `in_progress` first, otherwise the next pending task.
- If `TaskList` and plan checkboxes disagree, reconcile (verify code, then update `TaskUpdate` + plan checkbox).

**Starting new session:**
```
User: /aif-implement

Agent: Resuming implementation...

Found 3 completed tasks, 5 pending.
Continuing from Task #4: Implement JWT generation

[Executes task #4]
```

## Example Full Flow

```
Session 1:
  /aif-plan full Add user authentication
  → Creates branch: feature/user-authentication (if enabled)
  → Asks about tests (No), logging (Verbose)
  → Creates 6 tasks
  → Saves plan to: <configured plans dir>/feature-user-authentication.md
  → /aif-implement starts
  → Completes tasks #1, #2, #3
  → User ends session

Session 2:
  /aif-implement
  → Detects branch: feature/user-authentication (or resolves a single named full/ultra plan when no branch was created)
  → Reads plan: <configured plans dir>/feature-user-authentication.md
  → Loads state: 3/6 complete
  → Continues from task #4
  → Completes tasks #4, #5, #6
  → All done, suggests /aif-commit
```
