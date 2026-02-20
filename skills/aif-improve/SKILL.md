---
name: aif-improve
description: Refine and enhance an existing implementation plan with a second iteration. Re-analyzes the codebase, checks for gaps, missing tasks, wrong dependencies, and improves the plan quality. Use after /aif-plan to polish the plan before implementation.
argument-hint: "[improvement prompt or empty for auto-review]"
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

### Step 0: Find the Plan

**Locate the active plan file using this priority:**

```
1. .ai-factory/PLAN.md exists? → Use it (from /aif-plan fast)
2. No .ai-factory/PLAN.md → Check current git branch:
   git branch --show-current
   → Convert branch name to filename: replace "/" with "-", add ".md"
   → Look for .ai-factory/plans/<branch-name>.md
   Example: feature/user-auth → .ai-factory/plans/feature-user-auth.md
```

**If NO plan file found at either location:**

```
No active plan found.

To create a plan first, use:
- /aif-plan full <description>  — for a new feature (creates branch + plan)
- /aif-plan fast <description>  — for a quick task plan
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

Read `.ai-factory/DESCRIPTION.md` if it exists:
- Tech stack
- Architecture
- Conventions
- Non-functional requirements

**1.3: Read patches (past mistakes)**

```
Glob: .ai-factory/patches/*.md
```

If patches exist, read them to understand:
- What mistakes were made before
- What patterns to avoid
- What the plan should account for

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

If the user provided specific improvement instructions in `$ARGUMENTS`:
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

Apply these improvements?
- [ ] Yes, apply all
- [ ] Let me pick which ones
- [ ] No, keep the plan as is
```

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

Context is heavy after deep codebase analysis. Plan is updated in file — suggest freeing space:

```
AskUserQuestion: Free up context before continuing?

Options:
1. /clear — Full reset (recommended)
2. /compact — Compress history
3. Continue as is
```

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

→ Found plan: .ai-factory/PLAN.md
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

→ No .ai-factory/PLAN.md found
→ Branch: main (no feature branch)
→ No plan file found

"No active plan found. Create one first:
- /aif-plan full <description>
- /aif-plan fast <description>"
```

### Example 4: Plan already looks good

```
User: /aif-improve

→ Found plan: .ai-factory/plans/feature-product-search.md
→ 5 tasks in plan
→ Deep analysis... all tasks well-defined, dependencies correct
→ No significant improvements found

"Plan looks solid! Ready to implement:
/aif-implement"
```
