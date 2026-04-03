---
name: aif-improve
description: Refine and enhance an existing implementation plan with a second iteration. Re-analyzes the codebase, checks for gaps, missing tasks, wrong dependencies, and improves the plan quality. Use after /aif-plan to polish the plan before implementation, or to improve an existing /aif-fix plan.
argument-hint: "[--list] [@plan-file] [improvement prompt or empty for auto-review]"
allowed-tools: Read Write Edit Glob Grep Bash(git *) TaskCreate TaskUpdate TaskList TaskGet AskUserQuestion Questions
disable-model-invocation: false
---

# Improve - Plan Refinement (Second Iteration)

Refine an existing plan by re-analyzing it against the codebase. Finds gaps, missing tasks, wrong dependencies, and enhances task quality.

## Core Idea

```
existing plan + deeper codebase analysis + user feedback (optional)
    ↓
find gaps, missing edge cases, wrong assumptions
    ↓
enhanced plan with better tasks, correct dependencies, more detail
```

## Workflow

### Step 0: Load Config & Find the Plan

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:
- **Paths:** `paths.plan`, `paths.plans`, `paths.fix_plan`, `paths.research`, `paths.description`, and `paths.patches`
- **Language:** `language.ui` for prompts
- **Git:** `git.enabled`, `git.base_branch`, `git.create_branches`

If config.yaml doesn't exist, use defaults:
- plan: `paths.plan` (default: `.ai-factory/PLAN.md`)
- plans/: `.ai-factory/plans/`
- fix plan: `paths.fix_plan` (default: `.ai-factory/FIX_PLAN.md`)
- research: `.ai-factory/RESEARCH.md`
- patches/: `.ai-factory/patches/`
- DESCRIPTION.md: `.ai-factory/DESCRIPTION.md`
- Language: `en` (English)

**First parse arguments:**

```
- --list    → list available plans only (read-only, then STOP)
- @<path>   → explicit plan file override (highest priority)
- remaining argument text → optional improvement prompt
```

When both are present, `--list` wins and no refinement is executed.

### Step 0.list: List Available Plans (`--list`)

If `$ARGUMENTS` contains `--list`, run read-only discovery and stop.

```
1. Get current branch:
   git branch --show-current (git mode only)
2. Convert branch to filename: replace "/" with "-", add ".md" (git mode only)
3. Check existence of:
   - <configured plans dir>/<branch-name>.md
   - if git mode is off or branch creation is disabled: any `*.md` full-mode plan in `<configured plans dir>/`
   - <resolved fast plan path>
   - <resolved fix plan path>
4. Print availability summary and usage hints:
   - /aif-improve @<path> <optional prompt>
   - /aif-improve <optional prompt>      # automatic priority
5. If none found, suggest creating a plan via /aif-plan or /aif-fix
6. STOP.
```

**Important:** In `--list` mode:
- Do not execute refinement
- Do not modify files
- Do not update TaskList/plan content

**Locate the active plan file using this priority:**

```
1. If `$ARGUMENTS` contains `@<path>`:
   - Resolve the path (relative to project root; absolute paths allowed)
   - If file exists → use it
   - If missing → show "Plan file not found: <path>" and STOP
2. No explicit `@<path>` override → Check current git branch:
   git branch --show-current
   → Convert branch name to filename: replace "/" with "-", add ".md"
   → Look for <configured plans dir>/<branch-name>.md (from /aif-plan full)
   Example: feature/user-auth → .ai-factory/plans/feature-user-auth.md
3. If the branch-based plan is missing or git mode is off:
   → Check whether the configured plans dir contains exactly one `*.md` full-mode plan
   → If exactly one exists, use it
   → If multiple exist, ask the user to choose or require `@<path>`
4. No full-mode plan → Check the resolved fast plan path (from /aif-plan fast)
5. No full-mode plan and no resolved fast plan → Check the resolved fix plan path (from /aif-fix plan mode)
```

**If NO plan file found at any location:**

```
No active plan found.

To create a plan first, use:
- /aif-plan full <description>  — for a new feature (rich full plan; may also create a branch when git settings allow it)
- /aif-plan fast <description>  — for a quick task plan
- /aif-fix <bug description>    - for a bugfix plan (use the resolved fix plan path)
```

→ **STOP here.** Do not proceed without a plan file.

**If plan file found → read it and continue to Step 1.**

### Step 1: Load Context

**1.1: Read the plan file**

Read the found plan file completely. Understand:
- Feature scope and goals
- Current tasks (subjects, descriptions, dependencies)
- Settings (testing, logging preferences)
- Commit checkpoints
- Which tasks are already completed (checkboxes `- [x]`)

**1.2: Read project context**

Read `.ai-factory/DESCRIPTION.md` (use path from config) if it exists:
- Tech stack
- Architecture
- Conventions
- Non-functional requirements

Read `.ai-factory/RESEARCH.md` (use path from config) if it exists and is relevant to the plan being refined.

**1.3: Read patches (limited fallback)**

Use patches as fallback context, not the default source:

- If `.ai-factory/skill-context/aif-improve/SKILL.md` does not exist and the resolved patches dir exists:
  - `Glob: <resolved patches dir>/*.md`
  - Sort patch filenames ascending (lexical), then select the last **10** (or fewer if less exist)
  - Read those selected patch files only
  - Focus on reusable Prevention/Root Cause patterns that affect planning quality
- If skill-context exists, do **not** read all patches by default.
  - Optionally inspect a small targeted subset when refining around a known recurring issue.

**Read `.ai-factory/skill-context/aif-improve/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**
- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including the Plan
  Refinement Report and any plan modifications. If a skill-context rule says "tasks MUST include X"
  or "plan structure MUST have Y" — you MUST apply these when refining. Generating a refinement
  report that ignores skill-context rules is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

**1.4: Load current task list**

```
TaskList → Get all tasks with statuses
```

Understand what's already been created, what's in progress, what's completed.

### Step 2: Deep Codebase Analysis

Now do a **deeper** codebase exploration than what `/aif-plan` did initially:

**2.1: Trace through existing code paths**

For each task in the plan, find the relevant files:
```
Glob + Grep: Find files mentioned in tasks
Read: Understand current implementation
```

Look for:
- Existing patterns the plan should follow
- Code that already partially implements what a task describes
- Hidden dependencies the plan missed
- Shared utilities or services the plan should use instead of creating new ones

**2.2: Check for integration points**

Look for things the plan might have missed:
- API routes that need updating
- Database migrations needed
- Config files that need changes
- Import/export updates
- Middleware or guards that apply
- Existing validation patterns

**2.3: Check for edge cases**

Based on the tech stack and codebase:
- Error handling patterns used in the project
- Null/undefined safety patterns
- Authentication/authorization checks needed
- Rate limiting, caching considerations
- Data validation at boundaries

### Step 3: Identify Improvements

Compare the plan against what you found. Categorize issues:

**3.1: Missing tasks**
- Tasks that should exist but don't (e.g., migration, config update, index creation)
- Tasks for edge cases not covered

**3.2: Task quality issues**
- Descriptions too vague (no file paths, no specific implementation details)
- Missing logging requirements
- Missing error handling details
- Incorrect file paths

**3.3: Dependency issues**
- Wrong task order (task A depends on B but B comes after A)
- Missing dependencies (task C needs task A's output but isn't blocked by it)
- Unnecessary dependencies (tasks could run in parallel)

**3.4: Redundant or duplicate tasks**
- Two tasks doing the same thing
- Task that's unnecessary because the code already exists
- Task that duplicates existing functionality

**3.5: Scope issues**
- Tasks too large (should be split)
- Tasks too small (should be merged)
- Tasks outside the feature scope (gold-plating)

**3.6: User-prompted improvements (if $ARGUMENTS provided)**

If the user provided specific improvement instructions in `$ARGUMENTS` (excluding `--list` and `@<path>` tokens):
- Apply the user's feedback to the plan
- Look for tasks that need modification based on the prompt
- Add new tasks if the user's prompt requires them

### Step 4: Present Improvements

Show the user what you found in a clear format:

```
## Plan Refinement Report

Plan: [plan file path]
Tasks analyzed: N

### Findings

#### 🆕 Missing Tasks (N found)
1. **[New task subject]**
   Why: [reason this task is needed]
   After: Task #X (dependency)

2. **[New task subject]**
   Why: [reason]

#### 📝 Task Improvements (N found)
1. **Task #X: [subject]**
   Issue: [what's wrong]
   Fix: [what should change]

2. **Task #Y: [subject]**
   Issue: [what's wrong]
   Fix: [what should change]

#### 🔗 Dependency Fixes (N found)
1. Task #X should depend on Task #Y
   Reason: [why]

#### 🗑️ Removals (N found)
1. **Task #X: [subject]**
   Reason: [why it's redundant/unnecessary]

#### 📋 Summary
- Missing tasks: N
- Tasks to improve: N
- Dependencies to fix: N
- Tasks to remove: N

AskUserQuestion: Apply these improvements?

Options:
1. Yes, apply all
2. Let me pick which ones
3. No, keep the plan as is
```

**Based on choice:**
- Yes, apply all → apply all improvements to the plan file
- Let me pick which ones → present each improvement individually for approval
- No, keep the plan as is → exit without modifications

**If no improvements found:**

```
## Plan Review Complete

The plan looks solid! No significant gaps or issues found.

Plan: [plan file path]
Tasks: N

Ready to implement:
/aif-implement
```

### Step 5: Apply Approved Improvements

Based on user's choice:

**5.1: Apply task improvements**

For existing tasks that need better descriptions:
```
TaskGet(taskId) → read current
TaskUpdate(taskId, description: "improved description", subject: "improved subject")
```

**5.2: Add missing tasks**

For new tasks:
```
TaskCreate(subject, description, activeForm)
TaskUpdate(taskId, addBlockedBy: [...]) → set dependencies
```

**5.3: Fix dependencies**

```
TaskUpdate(taskId, addBlockedBy: [...])
```

**5.4: Remove redundant tasks**

```
TaskUpdate(taskId, status: "deleted")
```

**5.5: Update the plan file**

**CRITICAL:** After all changes, update the plan file to reflect the new state:

- Add new tasks to the correct phase with `- [ ]` checkboxes
- Update task descriptions if they changed
- Fix task ordering if dependencies changed
- Remove deleted tasks
- Update commit checkpoints if task count changed significantly
- Preserve any `- [x]` checkboxes for already completed tasks

Use `Edit` to make surgical changes to the plan file, or `Write` to regenerate it if changes are extensive.

**5.6: Confirm completion**

```
## Plan Refined

Changes applied:
- Added N new tasks
- Improved N task descriptions
- Fixed N dependencies
- Removed N redundant tasks

Updated plan: [plan file path]
Total tasks: N

Ready to implement:
/aif-implement
```

### Context Cleanup

Suggest the user to free up context space if needed: `/clear` (full reset) or `/compact` (compress history).

## Artifact Ownership

- Primary ownership: the plan artifact being refined (resolved branch-plan path, named full-plan path, resolved fast plan path, or resolved fix plan path when explicitly targeted).
- Config use: resolve full-plan directory via `paths.plans`, fast/fix plans via `paths.plan` and `paths.fix_plan`, git behavior via `git.enabled` and `git.create_branches`, optional research context via `paths.research`, and patch fallback via `paths.patches`.
- Read-only context: description, architecture, roadmap, rules, and research artifacts except where the active plan file itself is being updated.

## Important Rules

1. **Don't rewrite from scratch** — improve the existing plan, don't replace it
2. **Preserve completed work** — never modify or remove `- [x]` completed tasks
3. **Traceable improvements** — every change must be justified by codebase analysis or user input
4. **Respect settings** — if testing is "no", don't add test tasks. If logging is "minimal", don't add verbose logging tasks
5. **No gold-plating** — don't add tasks outside the feature scope unless critical
6. **Minimal viable improvements** — suggest only what matters, not every possible enhancement
7. **User approves first** — never apply changes without user confirmation
8. **Keep plan file in sync** — the plan file MUST match the task list after improvements

## Examples

### Example 1: Auto-review (no arguments)

```
User: /aif-improve

→ Found plan: .ai-factory/plans/feature-user-auth.md
→ 6 tasks in plan
→ Deep codebase analysis...
→ Found: project uses middleware pattern for auth, plan misses middleware task
→ Found: Task #3 description doesn't mention existing UserService
→ Found: Task #5 depends on Task #3 but no dependency set

Report:
- 1 missing task (auth middleware)
- 1 task to improve (reference UserService)
- 1 dependency to fix

Apply? → Yes → Changes applied
```

### Example 2: With user prompt

```
User: /aif-improve добавь обработку ошибок и валидацию входных данных

→ Found plan: <resolved fast plan path>
→ 4 tasks in plan
→ User wants: error handling + input validation
→ Analyzing each task for missing error handling...
→ Found: none of the tasks mention input validation
→ Found: error handling is inconsistent

Report:
- 2 tasks improved (added validation details to descriptions)
- 1 new task (create shared validation utils)
- Updated task descriptions with error handling patterns from codebase

Apply? → Yes → Changes applied
```

### Example 3: No plan found

```
User: /aif-improve

→ Branch: <current-branch-or-empty>
→ No matching branch-based full plan found
→ No resolved fast plan found
→ No resolved fix plan found
→ No plan file found

"No active plan found. Create one first:
- /aif-plan full <description>
- /aif-plan fast <description>
- /aif-fix <bug description>"
```

### Example 4: Explicit plan file

```
User: /aif-improve @my-custom-plan.md add rollback and edge-case handling

→ Explicit plan override: my-custom-plan.md
→ Found plan: my-custom-plan.md
→ User wants: rollback + edge-case handling
→ Deep codebase analysis...
→ Report prepared
```

### Example 5: List mode

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

### Example 6: Plan already looks good

```
User: /aif-improve

→ Found plan: .ai-factory/plans/feature-product-search.md
→ 5 tasks in plan
→ Deep analysis... all tasks well-defined, dependencies correct
→ No significant improvements found

"Plan looks solid! Ready to implement:
/aif-implement"
```
