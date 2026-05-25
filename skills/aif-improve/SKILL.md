---
name: aif-improve
description: Refine an existing implementation plan with a second iteration. Re-analyzes the codebase for gaps, missing tasks, and wrong dependencies. Use after /aif-plan or to improve an /aif-fix plan. Optional +check flag validates refinements via a fresh-context subagent.
argument-hint: "[--list] [+check] [@plan-file] [improvement prompt or empty for auto-review]"
allowed-tools: Read Write Edit Glob Grep Bash(git *) Task Agent TaskCreate TaskUpdate TaskList TaskGet AskUserQuestion Questions
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

### Step 0: Load Config & Parse Arguments

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:
- **Paths:** `paths.plan`, `paths.plans`, `paths.fix_plan`, `paths.research`, `paths.description`, `paths.patches`, and `paths.archive`
- **Language:** `language.ui` for prompts and summaries, `language.artifacts` for plan artifact updates, and `language.technical_terms` for human-readable technical terminology in plan artifacts
- **Git:** `git.enabled`, `git.base_branch`, `git.create_branches`
- **Workflow:** `workflow.plan_id_format` (default: `slug`) — used by branch-based plan discovery.
  Active values: `slug` and `sequential`. When `sequential`, the resolver globs
  `<paths.plans>/[0-9]{4}_<branch-slug>.md` first and falls back to
  `<paths.plans>/<branch-slug>.md` only if no numbered match is found.
  `timestamp` and `uuid` are **reserved values** and currently behave like `slug`.
  Treat any unknown value as `slug`.

If config.yaml doesn't exist, use defaults:
- plan: `paths.plan` (default: `.ai-factory/PLAN.md`)
- plans/: `.ai-factory/plans/`
- fix plan: `paths.fix_plan` (default: `.ai-factory/FIX_PLAN.md`)
- research: `.ai-factory/RESEARCH.md`
- patches/: `.ai-factory/patches/`
- DESCRIPTION.md: `.ai-factory/DESCRIPTION.md`
- `ui_language`: `en`
- `artifact_language`: `en`
- `technical_terms_policy`: `keep`
- `workflow.plan_id_format`: `slug`

Resolved language values:
- `ui_language = language.ui || "en"`
- `artifact_language = language.artifacts || language.ui || "en"`
- `technical_terms_policy = language.technical_terms || "keep"`

If `technical_terms_policy` is not one of `keep`, `translate`, or `mixed`, treat it as `keep`. Legacy values such as `english` also behave like `keep`.

All AskUserQuestion prompts, progress updates, refinement reports, summaries, and next-step guidance MUST be written in `ui_language`.

Any generated or updated plan artifact content under `paths.plan`, `paths.plans`, or `paths.fix_plan` MUST be written in `artifact_language`.

Templates and examples define structure, not fixed English output. If `artifact_language` is not `en`, translate human-readable headings, labels, task prose, roadmap rationale, research summaries, improvement notes, and dependency notes before saving. Preserve markdown structure, checkbox syntax, task IDs, numeric prefixes, branch names, commit messages, commands, file paths, config keys, package names, API names, `WARN`/`INFO` labels, and raw errors unchanged. Apply `technical_terms_policy` to other human-readable terminology.

**First parse arguments:**

```
- --list    → list available plans only (read-only, then STOP)
- +check    → after refinement, validate findings via a fresh-context subagent
- @<path>   → explicit plan file override (highest priority)
- remaining argument text → optional improvement prompt
```

`+check` is orthogonal to the other flags and may appear anywhere in `$ARGUMENTS`. Strip it from the argument string before resolving `@<path>` and the improvement prompt.

When `--list` is present, it wins and no refinement is executed. `+check` is silently ignored in `--list` mode (there is nothing to validate before refinement runs).

### Step 0.list: List Available Plans (`--list`)

If `$ARGUMENTS` contains `--list`, execute the procedure in `references/LIST-MODE.md` and STOP. That document is the single source of truth for the discovery rules, output shape, and read-only contract (no refinement, no file modifications, `+check` is silently ignored). Do not duplicate its content here.

### Step 1: Resolve Active Plan

This step runs in the default (non-`--list`) mode and picks **one** plan file for refinement using the priority chain below. The discovery-list logic for `--list` lives in `references/LIST-MODE.md` and is independent of this step.

**Locate the active plan file using this priority:**

```
1. If `$ARGUMENTS` contains `@<path>`:
   - Resolve the path (relative to project root; absolute paths allowed)
   - If file exists → use it
   - If missing → show "Plan file not found: <path>" and STOP
2. No explicit `@<path>` override → Check current git branch:
   git branch --show-current
   → Convert branch name to filename: replace "/" with "-" (this is <branch-slug>)
   → When `workflow.plan_id_format = sequential`, glob first
     `<configured plans dir>/[0-9][0-9][0-9][0-9]_<branch-slug>.md`:
     - 0 matches → fall through to the un-prefixed lookup below
     - 1 match → use it
     - >1 matches → use the **highest-numbered** match and emit
       `WARN [aif-improve] multiple sequential plans for <branch>: <list>; using <chosen>`
   → Otherwise look for `<configured plans dir>/<branch-slug>.md` (from /aif-plan full)
   Example (slug):       feature/user-auth → .ai-factory/plans/feature-user-auth.md
   Example (sequential): feature/user-auth → .ai-factory/plans/0042_feature-user-auth.md
3. If the branch-based plan is missing or git mode is off:
   → Check whether the configured plans dir contains exactly one `*.md` full-mode plan
     (a leading 4-digit prefix counts as a match)
   → If exactly one exists, use it
   → If multiple exist, ask the user to choose or require `@<path>`
4. No full-mode plan → Check the resolved fast plan path (from /aif-plan fast)
5. No full-mode plan and no resolved fast plan → Check the resolved fix plan path (from /aif-fix plan mode)
```

**Note:** Plan discovery scans `paths.plans/` only. Plans archived to `paths.archive/plans/` by `/aif-archive` are excluded from discovery.

**If NO plan file found at any location:**

```
No active plan found.

To create a plan first, use:
- /aif-plan full <description>  — for a new feature (rich full plan; may also create a branch when git settings allow it)
- /aif-plan fast <description>  — for a quick task plan
- /aif-fix <bug description>    - for a bugfix plan (use the resolved fix plan path)
```

→ **STOP here.** Do not proceed without a plan file.

**If plan file found → proceed to Step 2 (Load Context).**

### Step 2: Load Context

**2.1: Read the plan file**

Read the found plan file completely. Understand:
- Feature scope and goals
- Current tasks (subjects, descriptions, dependencies)
- Settings (testing, logging preferences)
- Commit checkpoints
- Which tasks are already completed (checkboxes `- [x]`)

**2.2: Read project context**

Read `.ai-factory/DESCRIPTION.md` (use path from config) if it exists:
- Tech stack
- Architecture
- Conventions
- Non-functional requirements

Read `.ai-factory/RESEARCH.md` (use path from config) if it exists and is relevant to the plan being refined.

**2.3: Read patches (limited fallback)**

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

**2.4: Load current task list**

```
TaskList → Get all tasks with statuses
```

Understand what's already been created, what's in progress, what's completed.

### Step 3: Deep Codebase Analysis

Now do a **deeper** codebase exploration than what `/aif-plan` did initially:

**3.1: Trace through existing code paths**

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

**3.2: Check for integration points**

Look for things the plan might have missed:
- API routes that need updating
- Database migrations needed
- Config files that need changes
- Import/export updates
- Middleware or guards that apply
- Existing validation patterns

**3.3: Check for edge cases**

Based on the tech stack and codebase:
- Error handling patterns used in the project
- Null/undefined safety patterns
- Authentication/authorization checks needed
- Rate limiting, caching considerations
- Data validation at boundaries

### Step 4: Identify Improvements

Compare the plan against what you found. Categorize issues:

**4.1: Missing tasks**
- Tasks that should exist but don't (e.g., migration, config update, index creation)
- Tasks for edge cases not covered

**4.2: Task quality issues**
- Descriptions too vague (no file paths, no specific implementation details)
- Missing logging requirements
- Missing error handling details
- Incorrect file paths

**4.3: Dependency issues**
- Wrong task order (task A depends on B but B comes after A)
- Missing dependencies (task C needs task A's output but isn't blocked by it)
- Unnecessary dependencies (tasks could run in parallel)

**4.4: Redundant or duplicate tasks**
- Two tasks doing the same thing
- Task that's unnecessary because the code already exists
- Task that duplicates existing functionality

**4.5: Task size issues**
- Tasks too large (should be split)
- Tasks too small (should be merged)
- Split/merge findings go into the "📝 Task Improvements" report section (`improvements` group, alongside 4.2) — they restructure existing tasks rather than add or remove them.

**4.6: Out-of-scope tasks**
- Tasks already in the plan that look useful in themselves but are unrelated to the feature this plan is about (gold-plating)
- On approval these are removed from the active plan — the same drop action as `removals` (see Step 6.4). The difference is the report only: an out-of-scope task goes to its own "💡 Out of scope" section instead of being lumped into "🗑️ Removals", so the user sees a useful-but-unrelated idea before it is dropped and can choose to capture it elsewhere. The skill itself does not persist out-of-scope items anywhere.

**4.7: User-prompted improvements (if $ARGUMENTS provided)**

If the user provided specific improvement instructions in `$ARGUMENTS` (excluding `--list`, `+check`, and `@<path>` tokens):
- Apply the user's feedback to the plan
- Look for tasks that need modification based on the prompt
- Add new tasks if the user's prompt requires them

This is a dispatcher step, not a separate finding category. Each finding it produces is routed to its natural group based on its nature: a new task goes to 4.1 (`missing`), a rewording or expansion of an existing task goes to 4.2 (`improvements`), an explicit removal request goes to 4.4 (`removals`), and a "useful-but-out-of-scope" idea goes to 4.6 (`out_of_scope`). There is no separate 4.7 group in the Step 5 report or in `+check` validation.

### Optional: `+check` validation between Step 4 and Step 5

When the `+check` flag is set (and `--list` is not), run the validation procedure from `references/CHECK-MODE.md` here, between Step 4 and Step 5. It re-reads cited files via a fresh-context subagent, then drops invented items, rewrites partially-correct ones, and recomputes dependencies on the filtered list. Without `+check`, skip this entirely — the output has no validator-related lines and the Summary block stays in its default shape without the two `+check` counter rows.

### Step 5: Present Improvements

Show the user what you found in a clear format. The emoji-grouped sections are kept for scannability, but the items inside "🆕 Missing Tasks", "📝 Task Improvements", "🗑️ Removals", and "💡 Out of scope" all follow the same prose shape — no labeled `Why:` / `Issue:` / `Fix:` fields:

1. **Behavioral impact** — what breaks or becomes harder if the plan stays as-is (missing capability, vague task that will be misimplemented, redundant task that wastes effort).
2. **Optional note** — short citation from the codebase, an existing pattern the plan should match, or a consequence. Include only when it adds signal.
3. **Plan anchor** — `Task #X` reference (or "after Task #X" for new tasks).
4. **Suggested edit** — concrete change: what to add / how to reword / what to remove.

The "🔗 Dependency Fixes" group is **not** restated in this shape — it is always computed after the four other groups (and after `+check` filtering when the flag is set, see `references/CHECK-MODE.md`) and uses the short legacy form: `Task #X should depend on Task #Y. Reason: …`. The dependency entries reference only tasks that survived filtering.

```
## Plan Refinement Report

Plan: [plan file path]
Tasks analyzed: N

### Findings

#### 🆕 Missing Tasks (N found)
1. The plan currently leaves authenticated requests without a session refresh step — long-running clients silently lose access after the access-token TTL. The existing middleware in `src/middleware/auth.ts` already exposes a `refresh()` hook, so the plan should reuse it instead of inventing a new one. After Task #3. Add a new task: "Wire `authMiddleware.refresh()` into the login flow and cover the expired-token path with an explicit test."

#### 📝 Task Improvements (N found)
1. Task #4 ("Add validation") gives no field-by-field contract — implementer will either over-validate or skip the email format check that the rest of the codebase enforces via `validators/email.ts`. Task #4. Rewrite as: "Validate `email` (via `validators/email.ts`), `password` (min 12 chars), and `displayName` (1-64 chars) in `RegisterRequest`; return 422 with field-level errors when validation fails."

#### 🔗 Dependency Fixes (N found)
1. Task #5 should depend on Task #2. Reason: Task #5 consumes the session helper introduced in Task #2.

#### 🗑️ Removals (N found)
1. Task #7 ("Create UserRepository") duplicates `src/repos/user.ts:12` which already exposes the same query surface — keeping the task will lead to a parallel implementation. Task #7. Remove the task; rely on the existing repository and adjust Task #8 to import it.

#### 💡 Out of scope — for later (N found)
1. Task #11 ("Refactor the logging module") looks reasonable on its own but is unrelated to the login feature this plan is about — keeping it expands scope without any concrete trigger from the current code paths. Task #11. Drop it from the active plan; the idea is surfaced here so you can capture it elsewhere (issue tracker, backlog note) if it's worth revisiting as its own feature later.

#### 📋 Summary
- Missing tasks: N
- Tasks to improve: N
- Dependencies to fix: N
- Tasks to remove: N
- Out of scope: N

When `+check` ran successfully, two extra rows (`Hidden by +check: N`, `Adjusted by +check: M`) are appended to the Summary block — the exact wording and failure-mode replacements live in `references/CHECK-MODE.md`.

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

The completion templates below define structure only. Render all human-readable text in these user-facing responses in `ui_language`. Preserve command names, paths, task counts, and numeric counts unchanged.

```
## Plan Review Complete

The plan looks solid! No significant gaps or issues found.

Plan: [plan file path]
Tasks: N

Ready to implement:
/aif-implement
```

### Step 6: Apply Approved Improvements

Based on user's choice:

**6.1: Apply task improvements**

For existing tasks that need better descriptions:
```
TaskGet(taskId) → read current
TaskUpdate(taskId, description: "improved description", subject: "improved subject")
```

**6.2: Add missing tasks**

For new tasks:
```
TaskCreate(subject, description, activeForm)
TaskUpdate(taskId, addBlockedBy: [...]) → set dependencies
```

**6.3: Fix dependencies**

```
TaskUpdate(taskId, addBlockedBy: [...])
```

**6.4: Remove redundant or out-of-scope tasks**

Both `removals` and `out_of_scope` translate to the same plan-file action — drop the task:

```
TaskUpdate(taskId, status: "deleted")
```

The difference between the two is the report only. `removals` are dead-weight duplicates: mentioned once and forgotten. `out_of_scope` items appear in the "💡 Out of scope" section so the user sees the idea was noticed and consciously dropped from this plan, not removed without a trace. The skill does not persist out-of-scope tasks anywhere — capturing the idea elsewhere (issue tracker, backlog) is the user's call.

**6.5: Update the plan file**

**CRITICAL:** After all changes, update the plan file to reflect the new state:

- Add new tasks to the correct phase with `- [ ]` checkboxes
- Update task descriptions if they changed
- Fix task ordering if dependencies changed
- Remove deleted tasks
- Update commit checkpoints if task count changed significantly
- Preserve any `- [x]` checkboxes for already completed tasks

Use `Edit` to make surgical changes to the plan file, or `Write` to regenerate it if changes are extensive.

When editing or regenerating the plan file, keep all human-readable artifact content in `artifact_language`; the examples above are structural only. Preserve completed `- [x]` checkboxes exactly.

**Filename invariant:** when the existing plan filename matches the sequential
pattern `^[0-9]{4}_.*\.md$` (e.g. `0042_feature-user-auth.md`), preserve the
exact numeric prefix on rewrite. Never renumber a plan during an improve pass —
the prefix is permanent and must survive any regeneration. Write back to the
same absolute path you read from.

**6.6: Confirm completion**

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
5. **No gold-plating** — don't propose adding tasks outside the feature scope unless critical. When you find a task already in the plan that drifts outside scope, route it to the "💡 Out of scope" report section, not to "🗑️ Removals" — the user should see useful-but-not-here ideas separately from dead-weight duplicates.
6. **Minimal viable improvements** — suggest only what matters, not every possible enhancement
7. **User approves first** — never apply changes without user confirmation
8. **Keep plan file in sync** — the plan file MUST match the task list after improvements

## Examples

Worked examples for the default, prompt-driven, no-plan, explicit-plan-file, and "plan looks solid" flows live in `references/EXAMPLES.md`. The `--list` mode example lives in `references/LIST-MODE.md`; the `+check` mode example lives in `references/CHECK-MODE.md`.
