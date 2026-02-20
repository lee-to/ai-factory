---
name: aif-plan
description: Plan implementation for a feature or task. Two modes — fast (no branch) or full (git branch + plan). Use when user says "plan", "new feature", "start feature", "create tasks".
argument-hint: "[fast | full] [--parallel | --list | --cleanup <branch>] <description>"
allowed-tools: Read Write Glob Grep Bash(git *) Bash(cd *) Bash(cp *) Bash(mkdir *) Bash(basename *) TaskCreate TaskUpdate TaskList AskUserQuestion Questions Task
disable-model-invocation: false
---

# Plan - Implementation Planning

Create an implementation plan for a feature or task. Two modes:
- **Fast** — quick plan, no git branch, saves to `.ai-factory/PLAN.md`
- **Full** — creates git branch, asks preferences, saves to `.ai-factory/plans/<branch>.md`

## Workflow

### Step 0: Load Project Context

**FIRST:** Read `.ai-factory/DESCRIPTION.md` if it exists to understand:
- Tech stack (language, framework, database, ORM)
- Project architecture
- Coding conventions
- Non-functional requirements

**ALSO:** Read `.ai-factory/ARCHITECTURE.md` if it exists to understand:
- Chosen architecture pattern
- Folder structure conventions
- Layer/module boundaries
- Dependency rules

Use this context when:
- Exploring codebase (know what patterns to look for)
- Writing task descriptions (use correct technologies)
- Planning file structure (follow project conventions)
- **Follow architecture guidelines from `.ai-factory/ARCHITECTURE.md` when planning file structure and task organization**

### Step 0.1: Ensure Git Repository

```bash
git rev-parse --is-inside-work-tree 2>/dev/null || git init
```

### Step 0.2: Parse Arguments & Select Mode

Extract flags and mode from `$ARGUMENTS`:

```
--parallel  → Enable parallel worktree mode (full mode only)
--list      → Show all active worktrees, then STOP
--cleanup <branch> → Remove worktree and optionally delete branch, then STOP
fast        → Fast mode (first word)
full        → Full mode (first word)
```

**Parsing rules:**
- Strip `--parallel`, `--list`, `--cleanup <branch>`, `fast`, `full` from `$ARGUMENTS`
- Remaining text becomes the description
- `--list` and `--cleanup` execute immediately and **STOP** (do NOT continue to Step 1+)

**If `--list` is present**, jump to [--list Subcommand](#--list-subcommand).
**If `--cleanup` is present**, jump to [--cleanup Subcommand](#--cleanup-subcommand).

**Mode selection:**
- `fast` keyword → fast mode
- `full` keyword → full mode
- Neither → ask interactively:

```
AskUserQuestion: Which planning mode?

Options:
1. Full (Recommended) — creates git branch, asks preferences, full plan
2. Fast — quick plan, no branch, saves to PLAN.md
```

For concrete parsing examples and expected behavior per command shape, read `references/EXAMPLES.md` (Argument Parsing).

---

## Full Mode

### Step 1: Parse Description & Quick Reconnaissance

From the description, extract:
- Core functionality being added
- Key domain terms
- Type (feature, enhancement, fix, refactor)

**Use `Task` tool with `subagent_type: Explore` to quickly understand the relevant parts of the codebase.** This runs as a subagent and keeps the main context clean.

Based on the parsed description, launch 1-2 Explore agents in parallel:

```
Task(subagent_type: Explore, model: sonnet, prompt:
  "In [project root], find files and modules related to [feature domain keywords].
   Report: key directories, relevant files, existing patterns, integration points.
   Thoroughness: quick. Be concise — return a structured summary, not file contents.")
```

**Rules:**
- 1-2 agents max, "quick" thoroughness — this is reconnaissance, not deep analysis
- Deep exploration happens later in Step 3
- If `.ai-factory/DESCRIPTION.md` already provides sufficient context, this step can be skipped

### Step 1.2: Generate Branch Name

```
Format: <type>/<short-description>

Examples:
- feature/user-authentication
- fix/cart-total-calculation
- refactor/api-error-handling
- chore/upgrade-dependencies
```

**Rules:**
- Lowercase with hyphens
- Max 50 characters
- No special characters except hyphens
- Descriptive but concise

### Step 1.3: Ask About Preferences

**IMPORTANT: Always ask the user before proceeding:**

```
AskUserQuestion: Before we start, a few questions:

1. Should I write tests for this feature?
   - [ ] Yes, write tests
   - [ ] No, skip tests

2. Logging level for implementation:
   - [ ] Verbose (recommended) - detailed DEBUG logs for development
   - [ ] Standard - INFO level, key events only
   - [ ] Minimal - only WARN/ERROR

3. Update documentation after implementation?
   - [ ] Yes, update docs (/aif-docs)
   - [ ] No, skip docs

4. Any specific requirements or constraints?
```

**Default to verbose logging.** AI-generated code benefits greatly from extensive logging because:
- Subtle bugs are common and hard to trace without logs
- Users can always remove logs later
- Missing logs during development wastes debugging time

Store all preferences — they will be used in the plan file and passed to `/aif-implement`.

### Step 1.4: Create Branch or Worktree

**If `--parallel` flag is set → create worktree:**

#### Worktree Creation

```bash
DIRNAME=$(basename "$(pwd)")
git branch <branch-name> main
git worktree add ../${DIRNAME}-<branch-name-with-hyphens> <branch-name>
```

Convert branch name for directory: replace `/` with `-`.

**Example:**
```
Project dir: my-project
Branch: feature/user-auth
Worktree: ../my-project-feature-user-auth
```

Copy context files so the worktree has full AI context:

```bash
WORKTREE="../${DIRNAME}-<branch-name-with-hyphens>"

# Project context
cp .ai-factory/DESCRIPTION.md "${WORKTREE}/.ai-factory/DESCRIPTION.md" 2>/dev/null
cp .ai-factory/ARCHITECTURE.md "${WORKTREE}/.ai-factory/ARCHITECTURE.md" 2>/dev/null

# Past lessons / patches
cp -r .ai-factory/patches/ "${WORKTREE}/.ai-factory/patches/" 2>/dev/null

# Claude Code skills + settings
cp -r .claude/ "${WORKTREE}/.claude/" 2>/dev/null

# CLAUDE.md only if untracked
if [ -f CLAUDE.md ] && ! git ls-files --error-unmatch CLAUDE.md &>/dev/null; then
  cp CLAUDE.md "${WORKTREE}/CLAUDE.md"
fi
```

Create changes directory and switch:

```bash
mkdir -p "${WORKTREE}/.ai-factory/plans"
cd "${WORKTREE}"
```

Display confirmation:

```
Parallel worktree created!

  Branch:    <branch-name>
  Directory: <worktree-path>

To manage worktrees later:
  /aif-plan --list
  /aif-plan --cleanup <branch-name>
```

Continue to Step 2.

**If no `--parallel` → create branch normally:**

```bash
git checkout main
git pull origin main
git checkout -b <branch-name>
```

If branch already exists, ask user:
- Switch to existing branch?
- Create with different name?

---

## Fast Mode

### Step 1: Ask About Preferences

Ask a shorter set of questions:

```
AskUserQuestion: Before we start:

1. Should I include tests in the plan?
   - [ ] Yes, include tests
   - [ ] No, skip tests

2. Any specific requirements or constraints?
```

**Plan file:** Always `.ai-factory/PLAN.md` (no branch, no branch-named file).

---

## Shared Steps (both modes)

### Step 2: Analyze Requirements

From the description, identify:
- Core functionality to implement
- Components/files that need changes
- Dependencies between tasks
- Edge cases to handle

If requirements are ambiguous, ask clarifying questions:
```
I need a few clarifications before creating the plan:
1. [Specific question about scope]
2. [Question about approach]
```

### Step 3: Explore Codebase

Before planning, understand the existing code through **parallel exploration**.

**Use `Task` tool with `subagent_type: Explore` to investigate the codebase in parallel.** This keeps the main context clean and speeds up research.

Launch 2-3 Explore agents simultaneously, each focused on a different aspect:

```
Agent 1 — Architecture & affected modules:
Task(subagent_type: Explore, model: sonnet, prompt:
  "Find files and modules related to [feature domain]. Map the directory structure,
   key entry points, and how modules interact. Thoroughness: medium.")

Agent 2 — Existing patterns & conventions:
Task(subagent_type: Explore, model: sonnet, prompt:
  "Find examples of similar functionality already implemented in the project.
   Show patterns for [relevant patterns: API endpoints, services, models, etc.].
   Thoroughness: medium.")

Agent 3 — Dependencies & integration points (if needed):
Task(subagent_type: Explore, model: sonnet, prompt:
  "Find all files that import/use [module/service]. Identify integration points
   and potential side effects of changes. Thoroughness: medium.")
```

**If full mode passed codebase reconnaissance** from Step 1 — use it as a starting point. Focus Explore agents on areas that need deeper understanding.

**After agents return, synthesize:**
- Which files need to be created/modified
- What patterns to follow (from existing code)
- Dependencies between components
- Potential risks or edge cases

**Fallback:** If Task tool is unavailable, use Glob/Grep/Read directly.

### Step 4: Create Task Plan

Create tasks using `TaskCreate` with clear, actionable items.

**Task Guidelines:**
- Each task should be completable in one focused session
- Tasks should be ordered by dependency (do X before Y)
- Include file paths where changes will be made
- Be specific about what to implement, not vague

Use `TaskUpdate` to set `blockedBy` relationships:
- Task 2 blocked by Task 1 if it depends on Task 1's output
- Keep dependency chains logical

### Step 5: Save Plan to File

**Determine plan file path:**
- **Fast mode** → `.ai-factory/PLAN.md`
- **Full mode** → `.ai-factory/plans/<branch-name>.md` (replace `/` with `-`)

**Before saving, ensure directory exists:**
```bash
mkdir -p .ai-factory/plans  # only when saving to branch-named plan files
```

**Plan file must include:**
- Title with feature name
- Branch and creation date
- `Settings` section (Testing, Logging, Docs)
- `Tasks` section grouped by phases
- `Commit Plan` section when there are 5+ tasks

Use the canonical template in `references/TASK-FORMAT.md` (Plan File Template).

**Commit Plan Rules:**
- **5+ tasks** → add commit checkpoints every 3-5 tasks
- **Less than 5 tasks** → single commit at the end, no commit plan needed
- Group logically related tasks into one commit
- Suggest meaningful commit messages following conventional commits

### Step 6: Next Steps

**Full mode + parallel (`--parallel`):** Automatically invoke `/aif-implement` — the whole point of parallel is autonomous end-to-end execution in an isolated worktree.

```
/aif-implement

CONTEXT FROM /aif-plan:
- Plan file: .ai-factory/plans/<branch-name>.md
- Testing: yes/no
- Logging: verbose/standard/minimal
- Docs: yes/no
```

**Full mode normal:** STOP after planning. The user reviews the plan and decides when to implement.

```
Plan created with [N] tasks.
Plan file: .ai-factory/plans/<branch-name>.md

To start implementation, run:
/aif-implement

To view tasks:
/tasks (or use TaskList)
```

**Fast mode:** STOP after planning.

```
Plan created with [N] tasks.
Plan file: .ai-factory/PLAN.md

To start implementation, run:
/aif-implement

To view tasks:
/tasks (or use TaskList)
```

### Context Cleanup

Context is heavy after planning. All results are saved to the plan file — suggest freeing space:

```
AskUserQuestion: Free up context before continuing?

Options:
1. /clear — Full reset (recommended)
2. /compact — Compress history
3. Continue as is
```

---

## --list Subcommand

When `--list` is passed, show all active worktrees and their feature status. Then **STOP**.

```bash
git worktree list
```

For each worktree path:
1. Check if `<worktree>/.ai-factory/plans/` contains any plan files
2. Show name and whether it looks complete (has tasks) or is still in progress

**Output format:**
```
Active worktrees:

  /path/to/my-project          (main)        <- you are here
  /path/to/my-project-feature-user-auth  (feature/user-auth)  -> Plan: feature-user-auth.md
  /path/to/my-project-fix-cart-bug       (fix/cart-bug)        -> No plan yet
```

## --cleanup Subcommand

When `--cleanup <branch>` is passed, remove the worktree and optionally delete the branch. Then **STOP**.

```bash
DIRNAME=$(basename "$(pwd)")
BRANCH_DIR=$(echo "<branch>" | tr '/' '-')
WORKTREE="../${DIRNAME}-${BRANCH_DIR}"

git worktree remove "${WORKTREE}"
git branch -d <branch>  # -d (not -D) will fail if unmerged, which is safe
```

If `git branch -d` fails because the branch is unmerged:

```
Branch <branch> has unmerged changes.
To force-delete: git branch -D <branch>
To merge first: git checkout main && git merge <branch>
```

If the worktree path doesn't exist, check `git worktree list` and suggest the correct path.

---

## Task Description Requirements

Every `TaskCreate` item MUST include:
- Clear deliverable and expected behavior
- File paths to change/create
- Logging requirements (what to log, where, and levels)
- Dependency notes when applicable

**Never create tasks without logging instructions.**

Use canonical examples in `references/TASK-FORMAT.md`:
- TaskCreate Example
- Logging Requirements Checklist

## Important Rules

1. **NO tests if user said no** — Don't sneak in test tasks
2. **NO reports** — Don't create summary/report tasks at the end
3. **Actionable tasks** — Each task should have clear deliverable
4. **Right granularity** — Not too big (overwhelming), not too small (noise)
5. **Dependencies matter** — Order tasks so they can be done sequentially
6. **Include file paths** — Help implementer know where to work
7. **Commit checkpoints for large plans** — 5+ tasks need commit plan with checkpoints every 3-5 tasks
8. **Plan file location** — Fast mode: `.ai-factory/PLAN.md`. Full mode: `.ai-factory/plans/<branch-name>.md`

## Plan File Handling

**Fast mode (`.ai-factory/PLAN.md`)**
- Temporary plan for quick work
- `/aif-implement` may offer deletion after completion

**Full mode (`.ai-factory/plans/<branch>.md`)**
- Branch-scoped, long-lived plan for feature delivery
- Used to resume work from current branch context

For concrete end-to-end flows (fast/full/full+parallel/interactive), read `references/EXAMPLES.md` (Flow Scenarios).
