---
name: aif-plan
description: Plan implementation for a feature or task. Two modes — fast (single quick plan) or full (richer plan with optional git branch/worktree flow). Use when user says "plan", "new feature", "start feature", "create tasks".
argument-hint: "[fast | full] [--parallel | --list | --cleanup <branch>] <description>"
allowed-tools: Read Write Glob Grep Bash(git *) Bash(cd *) Bash(cp *) Bash(mkdir *) Bash(basename *) TaskCreate TaskUpdate TaskList AskUserQuestion Questions Task mcp__handoff__handoff_sync_status mcp__handoff__handoff_push_plan mcp__handoff__handoff_get_task mcp__handoff__handoff_list_tasks mcp__handoff__handoff_update_task
disable-model-invocation: false
---

# Plan - Implementation Planning

Create an implementation plan for a feature or task. Two modes:

- **Fast** – quick plan, no git branch, saves to the configured fast plan path (default: `.ai-factory/PLAN.md`)
- **Full** — richer plan, asks preferences, saves to the configured full-plan directory, and optionally creates a git branch/worktree when git is enabled and branch creation is allowed

## Workflow

### Step 0 (pre): Detect Handoff Mode

Determine Handoff mode and task ID. If the caller passed `HANDOFF_MODE` and `HANDOFF_TASK_ID` as explicit text in the prompt, use those values. Otherwise, use the Bash tool to read the environment variables:

```
Bash: printenv HANDOFF_MODE || true
Bash: printenv HANDOFF_TASK_ID || true
```

**Then check `HANDOFF_MODE`:**

#### When `HANDOFF_MODE` is `1` (autonomous Handoff agent)

The Handoff coordinator already manages status transitions and DB writes directly. Do NOT call MCP tools (`handoff_sync_status`, `handoff_push_plan`). Instead:

- **No interactive questions:** Do not use `AskUserQuestion` — use sensible defaults (verbose logging, yes to tests, yes to docs, skip roadmap linkage).
- **Mode default:** If mode is not specified, default to `fast`.
- **Plan annotation (MANDATORY):** If `HANDOFF_TASK_ID` is non-empty, you MUST insert `<!-- handoff:task:<HANDOFF_TASK_ID> -->` as the very first line of the plan file, before the title. This annotation links the plan to its Handoff task for bidirectional sync. **Omitting this annotation when HANDOFF_TASK_ID is set is a bug — verify before completing.**

#### When `HANDOFF_MODE` is NOT `1` (manual Claude Code session)

If polishing an existing plan, extract the Handoff task ID from the `<!-- handoff:task:<id> -->` annotation on the first line (if present). If creating a new plan and no annotation context exists, skip all MCP sync — there is no linked Handoff task.

If a task ID IS found in the plan annotation, sync with Handoff via MCP tools:

- **On start:** Call `handoff_sync_status` with `{ taskId: <extracted-id>, newStatus: "planning", sourceTimestamp: "<current UTC time in ISO 8601 format>", direction: "aif_to_handoff", paused: true }`.
- **On completion:** Call `handoff_push_plan` with `{ taskId: <extracted-id>, planContent: <full plan text> }`. Then call `handoff_sync_status` with `{ taskId: <extracted-id>, newStatus: "plan_ready", sourceTimestamp: "<current UTC time in ISO 8601 format>", direction: "aif_to_handoff", paused: true }`.

**CRITICAL:** Always pass `paused: true` with every `handoff_sync_status` call except `done`. This prevents the autonomous Handoff agent from picking up the task while you work manually. Only `done` passes `paused: false`.

Preserve the `<!-- handoff:task:<id> -->` annotation on the first line when rewriting the plan file.

### Step 0: Load Project Context

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:

- **Paths:** `paths.description`, `paths.architecture`, `paths.roadmap`, `paths.research`, `paths.rules_file`, `paths.plan`, `paths.plans`, `paths.patches`, `paths.evolutions`, `paths.specs`, and `paths.rules`
- **Language:** `language.ui` for AskUserQuestion prompts
- **Git:** `git.enabled`, `git.base_branch`, `git.create_branches`, and `git.branch_prefix`

If config.yaml doesn't exist, use defaults:

- Paths: `.ai-factory/` for all artifacts
- Language: `en` (English)
- Git: `enabled: true`, `base_branch: main`, `create_branches: true`, `branch_prefix: feature/`

**THEN:** Read `.ai-factory/DESCRIPTION.md` (use path from config) if it exists to understand:

- Tech stack (language, framework, database, ORM)
- Project architecture
- Coding conventions
- Non-functional requirements

**ALSO:** Read the resolved architecture artifact if it exists (`paths.architecture`, default: `.ai-factory/ARCHITECTURE.md`) to understand:

- Chosen architecture pattern
- Folder structure conventions
- Layer/module boundaries
- Dependency rules

Use this context when:

- Exploring codebase (know what patterns to look for)
- Writing task descriptions (use correct technologies)
- Planning file structure (follow project conventions)
- **Follow architecture guidelines from the resolved architecture artifact when planning file structure and task organization**

**Read `.ai-factory/skill-context/aif-plan/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**

- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including the PLAN.md
  template and task format. The plan template from TASK-FORMAT.md is a **base structure**. If a
  skill-context rule says "tasks MUST include X" or "plan MUST have section Y" — you MUST augment
  the template accordingly. Generating a plan that violates skill-context rules is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

**OPTIONAL (recommended):** Read the resolved roadmap artifact if it exists (`paths.roadmap`, default: `.ai-factory/ROADMAP.md`):

- Use it to link this plan to a specific milestone (when applicable)
- This reduces ambiguity in `/aif-implement` milestone completion and `/aif-verify` roadmap gates

**OPTIONAL (recommended):** Read the resolved research path if it exists:

- Treat `## Active Summary (input for /aif-plan)` as an additional requirements source
- Carry over constraints/decisions into tasks and plan settings
- Prefer the summary over raw notes; use `## Sessions` only when you need deeper rationale
- If the user omitted the feature description, use `Active Summary -> Topic:` as the default description

### Step 0.1: Resolve Git State

Do **not** auto-run `git init`.

Resolve the current git mode from config first:

- `git.enabled: true` → git-aware workflow is allowed
- `git.enabled: false` → no-git workflow only
- `git.base_branch` → target branch for diffs/merge guidance (default: detected branch or `main`)
- `git.create_branches: true` → full mode may create a branch/worktree
- `git.create_branches: false` → full mode still creates a rich plan, but stays on the current branch / repository state

If `git.enabled = false`:

- Skip all branch/worktree commands
- Save full-mode plans under `paths.plans/<slug>.md`
- Treat `--parallel`, `--list`, and `--cleanup` as unavailable

If `git.enabled = true` but the repository is not actually inside a git work tree:

- Warn the user that git-aware actions are unavailable until the repository is initialized
- Fall back to the same no-git behavior as above

### Step 0.2: Parse Arguments & Select Mode

Extract flags and mode from `$ARGUMENTS`:

```
--parallel  → Enable parallel worktree mode (full mode only; requires `git.enabled=true` and `git.create_branches=true`)
--list      → Show all active worktrees, then STOP (git-only)
--cleanup <branch> → Remove worktree and optionally delete branch, then STOP (git-only)
fast        → Fast mode (first word)
full        → Full mode (first word)
```

**Parsing rules:**

- Strip `--parallel`, `--list`, `--cleanup <branch>`, `fast`, `full` from `$ARGUMENTS`
- Remaining text becomes the description
- `--list` and `--cleanup` execute immediately and **STOP** (do NOT continue to Step 1+)
- If `git.enabled = false`, reject `--parallel`, `--list`, and `--cleanup` with a short explanation instead of trying git commands
- If `--parallel` is set while `git.create_branches = false`, reject it with a short explanation because parallel mode requires branch creation

**If the description is empty:**

- If the resolved research path exists and its `Active Summary` has a non-empty `Topic:`, default the description to that topic (no extra user input required)
- Otherwise, ask the user for a short feature description

**If `--list` is present**, jump to [--list Subcommand](#--list-subcommand).
**If `--cleanup` is present**, jump to [--cleanup Subcommand](#--cleanup-subcommand).

**Mode selection:**

- `fast` keyword → fast mode
- `full` keyword → full mode
- Neither → ask interactively:

```
AskUserQuestion: Which planning mode?

Options:
1. Full (Recommended) — richer plan, asks preferences, optional branch/worktree flow when git settings allow it
2. Fast – quick plan, no branch, saves to the resolved fast plan path
```

If the user did not provide a description and the resolved research path exists:

- Mention that you will default the description to the `Active Summary` topic
- Only ask for `full` vs `fast` (no description prompt needed)

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

### Step 1.2: Generate Full-Mode Plan Identifier

Generate a reusable slug from the description first. This slug is used for:

- the git branch name when branch creation is enabled
- the full-mode plan filename when no branch is created

If `git.enabled = true` and `git.create_branches = true`, generate a branch name:

```
Format: <configured branch prefix><short-description>

Examples:
- feature/user-authentication
- fix/cart-total-calculation
- refactor/api-error-handling
- chore/upgrade-dependencies
```

**Rules:**

- Start with the configured `git.branch_prefix` when present (default: `feature/`)
- Lowercase with hyphens
- Max 50 characters
- No special characters except hyphens
- Descriptive but concise

If `git.enabled = false` or `git.create_branches = false`:

- Do **not** create a branch name
- Use the slug to create `<configured plans dir>/<slug>.md`
- Keep the user on the current branch or current non-git directory state

### Step 1.3: Ask About Preferences

**IMPORTANT: Always ask the user before proceeding:**

```
AskUserQuestion: Before we start, a few questions:

1. Should I write tests for this feature?
   a. Yes, write tests
   b. No, skip tests

2. Logging level for implementation:
   a. Verbose (recommended) - detailed DEBUG logs for development
   b. Standard - INFO level, key events only
   c. Minimal - only WARN/ERROR

3. Documentation policy after implementation?
   a. Yes — mandatory docs checkpoint at completion (recommended)
   b. No — warn-only (`WARN [docs]`), no mandatory checkpoint

4. Roadmap milestone linkage (only if the resolved roadmap artifact exists):
   a. Link this plan to a milestone
   b. Skip — no linkage (allowed; `/aif-verify --strict` should report WARN, not fail, for missing linkage alone)

5. Any specific requirements or constraints?
```

**Default to verbose logging.** AI-generated code benefits greatly from extensive logging because:

- Subtle bugs are common and hard to trace without logs
- Users can always remove logs later
- Missing logs during development wastes debugging time

Store all preferences — they will be used in the plan file and passed to `/aif-implement`.

Docs policy semantics:

- `Docs: yes` → `/aif-implement` MUST show a mandatory documentation checkpoint and route docs changes through `/aif-docs`
- `Docs: no` (or unset) → `/aif-implement` emits `WARN [docs]` and continues without a mandatory docs checkpoint

**If the resolved roadmap artifact exists and the user chose milestone linkage:**

- Read the resolved roadmap artifact and list candidate milestones (prefer unchecked items)
- Ask the user to pick one milestone (or type a custom one)
- Store the selected milestone name and a 1-sentence rationale for inclusion in the plan file

### Step 1.4: Optional Branch / Worktree Setup

**If `git.enabled = false` or `git.create_branches = false`:**

- Skip all branch/worktree creation
- Continue with the generated full plan file path under `paths.plans/<slug>.md`

**If `--parallel` flag is set → create worktree:**

#### Worktree Creation

```bash
DIRNAME=$(basename "$(pwd)")
git branch <branch-name> <configured-base-branch>
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

- Create the parent directories for the resolved DESCRIPTION, ARCHITECTURE, RESEARCH, plan, patch, and evolution paths inside the worktree.
- Copy the resolved DESCRIPTION, ARCHITECTURE, and RESEARCH artifacts into the same configured relative locations inside the worktree.
- Copy `.ai-factory/skill-context/` as-is into the worktree.
- Copy only the latest 10 patch files from the resolved `paths.patches` directory into the same configured relative path inside the worktree.
- Do **not** copy `patch-cursor.json` when you copied only a truncated patch set; that cursor is valid only with the full patch history.
- Copy agent settings (for example `.claude/`) and untracked `CLAUDE.md` when present.

Create changes directory and switch:

```bash
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
git checkout <configured-base-branch>
git pull origin <configured-base-branch>
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
   a. Yes, include tests
   b. No, skip tests

2. Any specific requirements or constraints?

3. Roadmap milestone linkage (only if the resolved roadmap artifact exists):
   a. Link this plan to a milestone
   b. Skip — no linkage (allowed; `/aif-verify --strict` should report WARN, not fail, for missing linkage alone)
```

**Plan file:** Always the resolved `paths.plan` file (default: `.ai-factory/PLAN.md`).

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

- **Fast mode** → the resolved `paths.plan`
- **Full mode** → `<configured plans dir>/<branch-or-slug>.md`

**Before saving, ensure directory exists:**

```bash
mkdir -p <configured plans dir>
```

**Plan file must include:**

- Title with feature name
- Branch and creation date
- `Settings` section (Testing, Logging, Docs)
- `Roadmap Linkage` section (optional, only if the resolved roadmap artifact exists)
- `Research Context` section (optional, if the resolved research path exists)
- `Tasks` section grouped by phases
- `Commit Plan` section when there are 5+ tasks

If the resolved roadmap artifact exists:

- If the user linked a milestone, write `## Roadmap Linkage` with `Milestone: "..."` and `Rationale: ...`
- If the user skipped linkage, write `## Roadmap Linkage` with `Milestone: "none"` and `Rationale: "Skipped by user"`

If the resolved research path exists:

- Include `## Research Context` by copying only the `Active Summary` (do not paste full `Sessions`)
- Keep it compact; it should be readable as a one-screen requirements snapshot

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
- Plan file: <configured plans dir>/<branch-or-slug>.md
- Testing: yes/no
- Logging: verbose/standard/minimal
- Docs: yes/no  # yes => mandatory docs checkpoint, no => warn-only
```

**Full mode normal:** STOP after planning. The user reviews the plan and decides when to implement.

```
Plan created with [N] tasks.
Plan file: <configured plans dir>/<branch-or-slug>.md

To start implementation, run:
/aif-implement

To view tasks:
/tasks (or use TaskList)
```

**Fast mode:** STOP after planning.

```
Plan created with [N] tasks.
Plan file: <resolved fast plan path>

To start implementation, run:
/aif-implement

To view tasks:
/tasks (or use TaskList)
```

### Context Cleanup

Suggest the user to free up context space if needed: `/clear` (full reset) or `/compact` (compress history).

---

## --list Subcommand

When `--list` is passed, show all active worktrees and their feature status. Then **STOP**.

```bash
git worktree list
```

For each worktree path:

1. Check whether the resolved plans directory exists under that worktree (`<worktree>/<resolved paths.plans>`, default: `<worktree>/.ai-factory/plans/`) and contains any plan files
2. Show name and whether it looks complete (has tasks) or is still in progress

**Output format:**

```
Active worktrees:

  /path/to/my-project          (<configured-base-branch>)        <- you are here
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
To merge first: git checkout <configured-base-branch> && git merge <branch>
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
8. **Plan file location** – Fast mode: `paths.plan`. Full mode: `paths.plans/<branch-or-slug>.md`
9. **Ownership boundary** – This command owns plan files only (the resolved fast plan path and files under `paths.plans`). Use owner commands (`/aif-roadmap`, `/aif-rules`, `/aif-explore`) for their artifacts.
10. **Roadmap linkage (when available)** — If the resolved roadmap artifact exists, include a `## Roadmap Linkage` section in the plan (or explicitly state it was skipped).

## Plan File Handling

**Fast mode (`paths.plan`, default: `.ai-factory/PLAN.md`)**

- Temporary plan for quick work
- `/aif-implement` may offer deletion after completion

**Full mode (`paths.plans/<branch-or-slug>.md`)**

- Long-lived plan for feature delivery
- Branch-scoped when a branch is created; slug-scoped when full mode runs without branch creation

For concrete end-to-end flows (fast/full/full+parallel/interactive), read `references/EXAMPLES.md` (Flow Scenarios).
