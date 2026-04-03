---
name: aif-implement
description: Execute implementation tasks from the current plan. Works through tasks sequentially, marks completion, and preserves progress for continuation across sessions. Use when user says "implement", "start coding", "execute plan", or "continue implementation".
argument-hint: '[--list] [@plan-file] [task-id or "status"]'
allowed-tools: Read Write Edit Glob Grep Bash TaskList TaskGet TaskUpdate AskUserQuestion Questions mcp__handoff__handoff_sync_status mcp__handoff__handoff_push_plan mcp__handoff__handoff_get_task mcp__handoff__handoff_list_tasks mcp__handoff__handoff_update_task
disable-model-invocation: false
---

# Implement - Execute Task Plan

Execute tasks from the plan, track progress, and enable session continuation.

## Workflow

### Step 0 (pre): Detect Handoff Mode

Determine Handoff mode. If the caller passed `HANDOFF_MODE` and `HANDOFF_SKIP_REVIEW` as explicit text in the prompt, use those values. Otherwise, use the Bash tool:

```
Bash: printenv HANDOFF_MODE || true
Bash: printenv HANDOFF_SKIP_REVIEW || true
```

**Then check `HANDOFF_MODE`:**

#### When `HANDOFF_MODE` is `1` (autonomous Handoff agent)

The Handoff coordinator already manages status transitions and DB writes directly. Do NOT call MCP tools. Instead:

- **No interactive questions:** Do not use `AskUserQuestion` — use sensible defaults (auto-commit at checkpoints, skip pause prompts).
- **No pause/resume prompts:** Execute all tasks sequentially without stopping.

#### When `HANDOFF_MODE` is NOT `1` (manual Claude Code session)

Handoff sync is handled inline — see **Step 0.2** (after reading the plan file) for the task ID extraction and MCP sync trigger. The sync points are:

- **On start (Step 0.2):** `handoff_sync_status` → `"implementing"` (with `paused: true`)
- **On checklist update (Step 3.6):** `handoff_push_plan` with updated plan content
- **On completion (Step 5):** `handoff_push_plan` with final plan, then `handoff_sync_status` → `"review"` (with `paused: true`) or `"done"` (with `paused: false` when `HANDOFF_SKIP_REVIEW=1`)

**CRITICAL:** Always pass `paused: true` with every `handoff_sync_status` call except `done`. This prevents the autonomous Handoff agent from picking up the task while you work manually. Only `done` passes `paused: false`.

### Step 0: Check Current State

**FIRST:** Determine what state we're in:

```
1. Read `.ai-factory/config.yaml` if it exists to resolve:
   - `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.research`
   - `paths.plan`, `paths.plans`, `paths.fix_plan`, `paths.patches`
   - `paths.rules`
   - `language.ui`, `language.artifacts`
   - `git.enabled`, `git.base_branch`, `git.create_branches`
   - `rules.base` plus any named `rules.<area>` entries
2. Parse arguments:
   - --list → list available plans only (no implementation; STOP)
   - @<path> → explicit plan file override (highest priority)
   - <number> → start from specific task
   - status → status-only mode
3. If `git.enabled = true`, check for uncommitted changes (`git status`)
4. If `git.enabled = true`, check current branch
```

### Step 0.list: List Available Plans (`--list`)

If `$ARGUMENTS` contains `--list`, run read-only plan discovery and stop.

```
1. Get current branch:
   git branch --show-current (git mode only)
2. Convert branch to filename: replace "/" with "-", add ".md" (git mode only)
3. Check existence of:
   - <configured plans dir>/<branch-name>.md (git mode only)
   - if git mode is off or branch creation is disabled: any `*.md` full-mode plan in `<configured plans dir>/`
   - <resolved fast plan path>
   - <resolved fix plan path>
4. Print plan availability summary and usage hints
5. STOP.
```

**Important:** In `--list` mode:

- Do not execute tasks
- Do not modify files
- Do not update TaskList statuses

For detailed output format and examples, see:

- `skills/aif-implement/references/IMPLEMENTATION-GUIDE.md` → "List Available Plans (`--list`)"

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

- Ensure the current plan file matches the current branch when git branch plans are in use (`@plan-file` override wins; otherwise branch-named plan takes priority over the resolved fast plan).
- If `git.enabled = false` or full plans were created without a branch, prefer:
    - explicit `@plan-file`,
    - then the only `*.md` file in the configured plans dir,
    - then the resolved fast plan path.
- Compare `TaskList` statuses vs plan checkboxes.
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
(it creates a patch and handles cleanup automatically).

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

### Step 0.1: Load Project Context & Past Experience

Use the resolved config from Step 0:

- **Paths:** description, architecture, RULES.md, roadmap, research, plan files, patches, and rules dir
- **Language:** `language.ui` for prompts, `language.artifacts` for generated content
- **Rules hierarchy:** the resolved RULES.md file + `rules.base` + named `rules.<area>` entries

**Read `.ai-factory/DESCRIPTION.md`** (use path from config) if it exists to understand:

- Tech stack (language, framework, database, ORM)
- Project architecture and conventions
- Non-functional requirements

**Read the resolved architecture artifact** if it exists (`paths.architecture`, default: `.ai-factory/ARCHITECTURE.md`) to understand:

- Chosen architecture pattern and folder structure
- Dependency rules (what depends on what)
- Layer/module boundaries and communication patterns
- Follow these conventions when implementing — file placement, imports, module boundaries

**Read the resolved RULES.md path** if it exists:

- These are project-specific rules and conventions added by the user
- **ALWAYS follow these rules** when implementing — they override general patterns
- Rules are short, actionable — treat each as a hard requirement

**Read rules hierarchy** (paths from config):

1. **RULES.md** – axioms (universal project rules)
2. **rules/base.md** — project-specific base conventions (naming, structure, patterns)
3. **rules.<area>** — area-specific rule entries resolved from config (for example `rules.api`, `rules.frontend`)

Load all available rule files and merge them. More specific rules override general ones.

**Read `.ai-factory/skill-context/aif-implement/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**

- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including the code
  you write and how you update plan checkboxes. If a skill-context rule says "code MUST follow X"
  or "implementation MUST include Y" — you MUST comply. Writing code that violates skill-context
  rules is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

**Patch fallback (limited, only when skill-context is missing):**

- If `.ai-factory/skill-context/aif-implement/SKILL.md` does not exist and the resolved patches dir exists:
    - Use `Glob` to find `*.md` files in the resolved patches dir
    - Sort patch filenames ascending (lexical), then select the last **10** (or fewer if less exist)
    - Read those selected patch files only
    - Prioritize **Root Cause** and **Prevention** sections
- If skill-context exists, do **not** read all patches by default.
    - Optionally read a few targeted recent patches only when a task clearly matches a known failure pattern.

**Use this context when implementing:**

- Follow the specified tech stack
- Use correct import patterns and conventions
- Apply proper error handling and logging as specified
- Avoid pitfalls documented in skill-context rules and relevant fallback patches

### Step 0.2: Find Plan File

**If `$ARGUMENTS` contains `@<path>`:**

Use this explicit plan file and skip automatic plan discovery.

```
1. Extract path after "@"
2. Resolve relative to project root (absolute paths are also valid)
3. If file does not exist:
   "Plan file not found: <path>
    Provide an existing markdown plan file, for example:
    - /aif-implement @<resolved fast plan path>
    - /aif-implement @.ai-factory/plans/feature-user-auth.md"
   → STOP
4. If file is the resolved fix plan path:
   → invoke /aif-fix (ownership + cleanup workflow) and STOP
5. Otherwise use this file as the active plan
```

Then continue with normal execution using the selected plan file.

**If no `@<path>` override is provided, check plan files in this order:**

**Check for plan files in this order:**

```
1. Check current git branch:
   git branch --show-current
   → Convert branch name to filename: replace "/" with "-", add ".md"
   → Look for <configured plans dir>/<branch-name>.md
2. If git mode is off or branch-based plan is missing:
   - Check whether the configured plans dir contains exactly one `*.md` plan file created by `/aif-plan full` without a branch
   - If exactly one exists → use it
   - If multiple exist → ask the user to choose or use `@<path>`
3. No full-mode plan → Check the resolved fast plan path
4. No full-mode plan and no resolved fast plan → Check the resolved fix plan path
   → If exists: invoke /aif-fix (handles its own workflow with patches) and STOP
```

**Priority:**

1. `@<path>` argument - explicit user-selected plan file
2. Branch-named file (from `/aif-plan full`) - if it matches current branch
3. Single named full-plan file in `paths.plans` (from `/aif-plan full` without branch creation)
4. `paths.plan` (from `/aif-plan fast`) - fallback when no full plan exists
5. `paths.fix_plan` - redirect to `/aif-fix` (from `/aif-fix` plan mode)

**Read the plan file** to understand:

- Context and settings (testing, logging preferences)
- Commit checkpoints (when to commit)
- Task dependencies
- Task checklist format (`- [ ]` / `- [x]`) to keep progress synced

**Immediately after reading the plan file, check the first line for `<!-- handoff:task:<uuid> -->`:**

- If found AND `HANDOFF_MODE` is NOT `1` (manual session): extract the task ID. This is the Handoff task ID for MCP sync throughout this session. Call `handoff_sync_status` with `{ taskId: <extracted-id>, newStatus: "implementing", sourceTimestamp: "<current UTC time in ISO 8601 format, e.g. 2026-04-02T18:30:45.000Z>", direction: "aif_to_handoff", paused: true }`. The timestamp must reflect the actual current time, not midnight or an approximation.
- If found AND `HANDOFF_MODE` is `1`: the Handoff coordinator handles sync — do nothing.
- If NOT found: no linked Handoff task — skip all MCP sync for the rest of this session.

### Step 1: Load Current State

```
TaskList → Get all tasks with status
```

Find:

- Next pending task (not blocked, not completed)
- Any in_progress tasks (resume these first)

### Step 2: Display Progress

```
## Implementation Progress

✅ Completed: 3/8 tasks
🔄 In Progress: Task #4 - Implement search service
⏳ Pending: 4 tasks

Current task: #4 - Implement search service
```

### Step 3: Execute Current Task

For each task:

**3.1: Fetch full details**

```
TaskGet(taskId) → Get description, files, context
```

**3.2: Mark as in_progress**

```
TaskUpdate(taskId, status: "in_progress")
```

**3.3: Implement the task**

- Read relevant files
- Make necessary changes
- Follow existing code patterns
- **NO tests unless plan includes test tasks**
- **NO reports or summaries**

**3.4: Verify implementation**

- Check code compiles/runs
- Verify functionality works
- Fix any immediate issues

**3.5: Mark as completed**

```
TaskUpdate(taskId, status: "completed")
```

**3.6: Update checkbox in plan file**

**IMMEDIATELY** after completing a task, update the checkbox in the plan file:

```markdown
# Before

- [ ] Task 1: Create user model

# After

- [x] Task 1: Create user model
```

**This is MANDATORY** — checkboxes must reflect actual progress:

- Use `Edit` tool to change `- [ ]` to `- [x]`
- Do this RIGHT AFTER each task completion
- Even if deletion will be offered later
- Plan file is the source of truth for progress

**Handoff sync (manual mode ONLY — skip when `HANDOFF_MODE` is `1`):** If a Handoff task ID was extracted in Step 0.2, call `handoff_push_plan` with `{ taskId: <id>, planContent: <full updated plan text> }` to sync the checklist progress.

**3.7: Update the resolved description artifact if needed**

If during implementation:

- New dependency/library was added
- Tech stack changed (e.g., added Redis, switched ORM)
- New integration added (e.g., Stripe, SendGrid)
- Architecture decision was made

→ Update the resolved description artifact (`paths.description`, default: `.ai-factory/DESCRIPTION.md`) to reflect the change:

```markdown
## Tech Stack

- **Cache:** Redis (added for session storage)
```

This keeps the resolved description artifact as the source of truth.

**3.7.1: Update AGENTS.md and ARCHITECTURE.md if project structure changed**

If during implementation:

- New directories or modules were created
- Project structure changed significantly (new `src/modules/`, new API routes directory, etc.)
- New entry points or key files were added

→ Update `AGENTS.md` — refresh the "Project Structure" tree and "Key Entry Points" table to reflect new directories/files.

→ Update the resolved architecture artifact — if new modules or layers were added that should be documented in the folder structure section.

**Only update if structure actually changed** — don't rewrite on every task. Check if new directories were created that aren't in the current structure map.

**3.8: Check for commit checkpoint**

If the plan has commit checkpoints and current task is at a checkpoint:

```
AskUserQuestion: ✅ Tasks <first>-<last> completed. This is a commit checkpoint. Ready to commit? Suggested message: "<conventional commit message>"

Options:
1. Yes, commit now (/aif-commit)
2. No, continue to next task
3. Skip all commit checkpoints
```

**Based on choice:**

- Yes, commit now → invoke `/aif-commit` with the suggested message, then continue to next task
- No, continue to next task → proceed to the next task without committing
- Skip all commit checkpoints → for all subsequent checkpoints within this `/aif-implement` run, skip the prompt automatically and proceed directly to the next task (as if user selected "No, continue to next task" each time). This is in-context memory — resets on `/clear` or new session

**3.9: Move to next task or pause**

### Step 4: Session Persistence

Progress is automatically saved via TaskUpdate.

**To pause:**

```
Current progress saved.

Completed: 4/8 tasks
Next task: #5 - Add pagination support

To resume later, run:
/aif-implement
```

**To resume (next session):**

```
/aif-implement
```

→ Automatically finds next incomplete task

### Step 5: Completion

**Handoff sync (manual mode ONLY — skip entirely when `HANDOFF_MODE` is `1`):** If a Handoff task ID was extracted from the plan annotation AND `HANDOFF_MODE` is NOT `1`:
1. Call `handoff_push_plan` with `{ taskId: <id>, planContent: <final updated plan text> }`.
2. If `HANDOFF_SKIP_REVIEW` is `1`: call `handoff_sync_status` with `{ taskId: <id>, newStatus: "done", sourceTimestamp: "<current UTC time in ISO 8601 format>", direction: "aif_to_handoff", paused: false }`.
3. Otherwise: call `handoff_sync_status` with `{ taskId: <id>, newStatus: "review", sourceTimestamp: "<current UTC time in ISO 8601 format>", direction: "aif_to_handoff", paused: true }`.

When all tasks are done:

```
## Implementation Complete

All 8 tasks completed.

Branch: feature/product-search
Plan file: .ai-factory/plans/feature-product-search.md
Files modified:
- src/services/search.ts (created)
- src/api/products/search.ts (created)
- src/types/search.ts (created)
Documentation: updated existing docs | created docs/<feature-slug>.md | skipped by user | warn-only (Docs: no/unset)

What's next?

1. 🔍 /aif-verify — Verify nothing was missed (recommended)
2. 💾 /aif-commit — Commit the changes directly
```

**Check ROADMAP.md progress:**

If the resolved roadmap artifact exists:

1. Read it
   1.1. If the plan file includes `## Roadmap Linkage` with a non-`none` milestone, prefer that milestone for completion marking
2. Check if the completed work corresponds to any unchecked milestone
3. If yes — mark it `[x]` and add entry to the Completed table with today's date
4. Tell the user which milestone was marked done

### Context Maintenance (Artifacts)

Only do this step when there is something concrete to capture.

**DESCRIPTION.md (allowed in this command):**

- If this plan introduced new dependencies/integrations or changed the stack, update the resolved description artifact with factual deltas only.
- Do not rewrite unrelated sections.

**ARCHITECTURE.md + AGENTS.md (allowed in this command):**

- If new modules/layers/folders were added (or dependency rules changed), update the resolved architecture artifact to reflect the new structure and constraints.
- If you maintain `AGENTS.md` structure maps or entry points, refresh them only when they are now incorrect.

**ROADMAP.md (allowed, limited):**

- This command may mark milestone completion when evidence is clear.
- If milestone mapping is ambiguous, emit `WARN [roadmap] ...` and suggest the owner command:
    - `/aif-roadmap check`
    - or `/aif-roadmap <short update request>`

**RULES.md (NOT allowed in this command):**

- Never edit the resolved `paths.rules_file` artifact from `/aif-implement`.
- If you discovered repeatable conventions/pitfalls during implementation, propose up to 3 candidate rules and ask the user to add them via `/aif-rules`.
- Do not invoke `/aif-rules` automatically (it is user-invoked).

If candidate rules exist:

```
AskUserQuestion: Capture new project rules in the resolved RULES.md artifact?

Options:
1. Yes — output `/aif-rules ...` commands (recommended)
2. No — skip
```

**Documentation policy checkpoint (after completion, before plan cleanup):**

Read the plan file setting `Docs: yes/no`.

If plan setting is `Docs: yes`:

```
AskUserQuestion: Documentation checkpoint — how should we document this feature?

Options:
1. Update existing docs (recommended) — invoke /aif-docs
2. Create a new feature doc page — invoke /aif-docs with feature-page context
3. Skip documentation
```

Handling:

- Option 1 → invoke `/aif-docs` to update README/docs based on completed work
- Option 2 → invoke `/aif-docs` with context to create `docs/<feature-slug>.md`, include sections (Summary, Usage/user-facing behavior, Configuration, API/CLI changes, Examples, Troubleshooting, See Also), and add a README docs-table link
- Option 3 → do not invoke `/aif-docs`; emit `WARN [docs] Documentation skipped by user`

If plan setting is `Docs: no` or setting is unset:

- Do **not** show a mandatory docs checkpoint prompt
- Do **not** invoke `/aif-docs` automatically
- Emit `WARN [docs] Docs policy is no/unset; skipping documentation checkpoint`

**Always include documentation outcome in the final completion output:**

- `Documentation: updated existing docs`
- `Documentation: created docs/<feature-slug>.md`
- `Documentation: skipped by user`
- `Documentation: warn-only (Docs: no/unset)`

**Handle plan file after completion:**

- **If the resolved fast plan path** (from `/aif-plan fast`):

  ```
  AskUserQuestion: Would you like to delete the resolved fast plan file? (It's no longer needed)

  Options:
  1. Yes, delete it
  2. No, keep it
  ```

  **Based on choice:**
    - "Yes, delete it" → delete the file:
      ```bash
      rm <resolved fast plan path>
      ```
    - "No, keep it" → leave the file as is, continue to the next step

- **If branch-named file** (e.g., `<configured plans dir>/feature-user-auth.md`):
    - Keep it - documents what was done
    - User can delete before merging if desired

**Check if running in a git worktree:**

Detect worktree context:

```bash
# If .git is a file (not a directory), we're in a worktree
[ -f .git ]
```

**If we ARE in a worktree**, offer to merge back and clean up:

```
You're working in a parallel worktree.

  Branch:    <current-branch>
  Worktree:  <current-directory>
  Main repo: <main-repo-path>

AskUserQuestion: Would you like to merge this branch into the configured base branch and clean up?

Options:
1. Yes, merge and clean up (recommended)
2. No, I'll handle it manually
```

**Based on choice:**

- "Yes, merge and clean up" → follow the Worktree Merge procedure below
- "No, I'll handle it manually" → show a reminder:
  ```
  To merge and clean up later:
    cd <main-repo-path>
    git merge <branch>
    /aif-plan --cleanup <branch>
  ```

#### Worktree Merge

1. **Ensure everything is committed** — check `git status`. If uncommitted changes exist, suggest `/aif-commit` first and wait.

2. **Get repository root path:**

   ```bash
   MAIN_REPO=$(git rev-parse --git-common-dir | sed 's|/\.git$||')
   BRANCH=$(git branch --show-current)
   ```

3. **Switch to the repository root:**

   ```bash
   cd "${MAIN_REPO}"
   ```

4. **Merge the branch:**

   ```bash
   git checkout <configured-base-branch>
   git pull origin <configured-base-branch>
   git merge "${BRANCH}"
   ```

   If merge conflict occurs:

   ```
   ⚠️  Merge conflict detected. Resolve manually:
     cd <main-repo-path>
     git merge --abort   # to cancel
     # or resolve conflicts and git commit
   ```

   → STOP here, do not proceed with cleanup.

5. **Remove worktree and branch (only if merge succeeded):**

   ```bash
   git worktree remove <worktree-path>
   git branch -d "${BRANCH}"
   ```

6. **Confirm:**

   ```
   ✅ Merged and cleaned up!

     Branch <branch> merged into <configured-base-branch>.
     Worktree removed.

   You're now in: <main-repo-path> (<configured-base-branch>)
   ```

→ **STOP** — worktree merged and removed, no further steps needed.

### Final Step — Verify or Commit

```
AskUserQuestion: All tasks complete. What's next?

Options:
1. Verify first — Run /aif-verify to check completeness (recommended)
2. Skip to commit — Go straight to /aif-commit
```

**Based on choice:**

- "Verify first" → invoke `/aif-verify` → after it completes, continue to context cleanup below
- "Skip to commit" → invoke `/aif-commit` → after it completes, continue to context cleanup below

**Context cleanup (after verify or commit):**

Suggest the user to free up context space if needed: `/clear` (full reset) or `/compact` (compress history).

**IMPORTANT: NO summary reports, NO analysis documents, NO wrap-up tasks.**

## Commands

### Start/Resume Implementation

```
/aif-implement
```

Continues from next incomplete task.

### List Available Plans

```
/aif-implement --list
```

Lists the resolved fast plan path, resolved fix plan path, and current-branch `<configured plans dir>/<branch>.md` (if present), then exits without implementation.

### Use Explicit Plan File

```
/aif-implement @my-custom-plan.md
/aif-implement @.ai-factory/plans/feature-user-auth.md status
```

Uses the provided plan file instead of auto-detecting by branch/default files.

### Start from Specific Task

```
/aif-implement 5
```

Starts from task #5 (useful for skipping or re-doing).

### Check Status Only

```
/aif-implement status
```

Shows progress without executing.

## Execution Rules

### DO:

- ✅ Execute one task at a time
- ✅ Mark tasks in_progress before starting
- ✅ Mark tasks completed after finishing
- ✅ Follow existing code conventions
- ✅ Follow `/aif-best-practices` guidelines (naming, structure, error handling)
- ✅ Create files mentioned in task description
- ✅ Handle edge cases mentioned in task
- ✅ Stop and ask if task is unclear

### DON'T:

- ❌ Write tests (unless explicitly in task list)
- ❌ Create report files
- ❌ Create summary documents
- ❌ Add tasks not in the plan
- ❌ Skip tasks without user permission
- ❌ Mark incomplete tasks as done
- ❌ Violate the resolved architecture artifact conventions for file placement and module boundaries

## Artifact Ownership Boundaries

- Primary ownership in this command: task execution state and plan progress checkboxes.
- Allowed context artifact updates: the resolved description artifact, the resolved architecture artifact, and roadmap milestone completion in the resolved roadmap artifact when implementation evidence justifies it.
- Read-only context in this command by default: the resolved `paths.rules_file` and `paths.research` artifacts.
- Context-gate findings should be communicated as `WARN`/`ERROR` outputs only; this does not replace the required verbose implementation logging rules below.

For progress display format, blocker handling, session continuity examples, and full flow examples → see `references/IMPLEMENTATION-GUIDE.md`

## Critical Rules

1. **NEVER write tests** unless task list explicitly includes test tasks
2. **NEVER create reports** or summary documents after completion
3. **ALWAYS mark task in_progress** before starting work
4. **ALWAYS mark task completed** after finishing
5. **ALWAYS update checkbox in plan file** - `- [ ]` → `- [x]` immediately after task completion
6. **PRESERVE progress** - tasks survive session boundaries
7. **ONE task at a time** - focus on current task only

## CRITICAL: Logging Requirements

**ALWAYS add verbose logging when implementing code.** For logging guidelines, patterns, and management requirements → read `references/LOGGING-GUIDE.md`

Key rules: log function entry/exit, state changes, external calls, error context. Use structured logging, configurable log levels (LOG_LEVEL env var).

**DO NOT skip logging to "keep code clean" - verbose logging is REQUIRED during implementation, but MUST be configurable.**
