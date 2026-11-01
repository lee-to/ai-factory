---
name: aif-implement
description: Execute implementation tasks from the current plan. Works through tasks sequentially, marks completion, and preserves progress for continuation across sessions. Use when user says "implement", "start coding", "execute plan", or "continue implementation".
argument-hint: '[--list] [--without-plan <description>] [@plan-file-or-directory] [task-id or "status"]'
allowed-tools: Read Write Edit Glob Grep TaskList TaskGet TaskUpdate AskUserQuestion Questions mcp__handoff__handoff_sync_status mcp__handoff__handoff_push_plan mcp__handoff__handoff_get_task mcp__handoff__handoff_list_tasks mcp__handoff__handoff_update_task
disable-model-invocation: false
---

# Implement - Execute Task Plan

Shell commands are not pre-approved by this skill. Use an exposed execution tool
under the runtime's existing permissions for the authorized command and CWD.
Reuse applicable authorization; request native approval only when required.
Unavailable or denied commands remain blockers/not_run in delegated runs too.
Never broaden permissions, use another path to bypass a denial, or report an
unexecuted check as passed.

## Shared project skill-context

Before mode routing or work, read existing files relative to the current project root in this order (reuse them if already loaded):

1. `.ai-factory/skill-context/global-skill-context.md` — all bundled skills.
2. `.ai-factory/skill-context/build-skill-context.md` — only fix, implement, plan, verify, improve.
3. `.ai-factory/skill-context/aif-implement/SKILL.md` — this skill.

Missing files are skipped; an existing unreadable file stops dependent work with its path.
Precedence: individual > build (when applicable) > global > skill defaults; retain non-conflicting instructions and check all outputs against the effective rules.
These layers customize workflow; they do not replace the project's rules/architecture hierarchy or relax explicit requirements, ownership, scope, safety/privacy, validation, or approval boundaries. Report conflicts with those boundaries instead of overriding them.
`global` is a project-local layer, not home-directory configuration. Custom/extension skills do not automatically use it.

Execute tasks from the plan, track progress, and enable session continuation.

## Selective reference loading

Resolve reference paths beside this installed entrypoint, including flat workflows. Read a reference in full only when its stated condition applies, before the dependent step; do not preload all references. If a selected reference is missing or unreadable, STOP before that step and report its path. The entrypoint dispatch and hard boundaries apply to every reference. Project skill-context overrides and managed extension injections retain their existing precedence. Keep managed `aif-ext` blocks in the entrypoint; never move them into references.

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
- **No pause/resume prompts:** Execute all tasks sequentially without stopping
  for confirmation. Blocking integrity, safety, or requirement conflicts still
  stop with their defined non-interactive outcome.

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
   - `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.research`; derive `research_bundles_dir = <parent directory of paths.research>/research/`
   - `paths.plan`, `paths.plans`, `paths.fix_plan`, `paths.patches`
   - `paths.archive`
   - `paths.rules`
   - `language.ui`, `language.artifacts`
   - `git.enabled`, `git.base_branch`, `git.create_branches`
   - `workflow.plan_id_format` (default: `slug`) — used by branch-based plan discovery.
     Active values: `slug` and `sequential`. Discovery treats a root `*.md` as
     a full plan unless it is the resolved `paths.plan` or `paths.fix_plan`.
     Treat a direct child `*/index.md` as an ultra bundle only after reading it
     and confirming that it contains exactly one
     `<!-- aif:plan-mode:ultra -->`; ignore unrelated directories and never count
     phase files independently.
     When `sequential`, resolve both
     `<paths.plans>/[0-9]{4}_<branch-slug>.md` and
     `<paths.plans>/[0-9]{4}_<branch-slug>/index.md`, then choose the
     highest-numbered matching artifact.
     `timestamp` and `uuid` are **reserved values** and currently behave like `slug`.
     Treat any unknown value as `slug`.
   - `rules.base` plus any named `rules.<area>` entries
2. Parse arguments:
   - --list → list available plans only (no implementation; STOP)
   - --without-plan <description> → inline implementation mode; skip plan discovery and jump to Step 0.inline
   - @<path> → explicit plan file, ultra directory, or ultra `index.md` override (highest priority)
   - <number> → start from specific task
   - status → status-only mode
   - Optional inline-mode flag: --docs=yes|no|warn (only valid with --without-plan; default: warn)
3. If `git.enabled = true`, check for uncommitted changes (`git status`)
4. If `git.enabled = true`, check current branch
```

For `status`, perform read-only discovery and show progress, then STOP. Do not
call Handoff synchronization, update task/checklist state, execute tasks, or run
completion actions; this boundary also applies to discovery reference steps.

### Read-only list route

For `--list`, read [plan listing](references/IMPLEMENT-LIST.md), perform read-only discovery, print the result, and STOP. Do not execute tasks, modify files, or update TaskList statuses.

### Inline route

For `--without-plan`, read [inline implementation](references/IMPLEMENT-INLINE.md) before parsing the description or editing files; execute that route and STOP. Apply the command discovery contract below before choosing verification commands. Reject conflicting plan/status/task-id arguments or overbroad scope. Do not read/create plan artifacts, use TaskList, create patches, alter coordinator branches/worktrees, or run plan-backed completion logic. Only existence probes needed to warn about ignored plan artifacts are permitted.

### Command discovery (execution routes only)

Before selecting build/test/verification commands for plan-backed or inline work,
use an available, permitted `ai-factory commands --json` from project root. Supply
explicit monorepo directories and an existing project JSON mapping only as needed.
If unavailable, read bounded package manifests directly; never install tooling or
run Make/Task/just, imports, plugins, lifecycle scripts or `--help` for discovery.
Use the exact command ID, CWD, source hash and catalog `revision_sha256` (which also
binds runner evidence). Refresh changed sources before use;
resolve multiple applicable definitions with source evidence/user selection and leave
unsupported entries unresolved. Catalog declarations grant no execution permission,
network/production access, or proof of success; report actual execution separately.
List/status routes do not discover or execute commands.

### Recovery route

For plan-backed resumption after a break or lost context, or when discovery finds no active plan, read [recovery and reconciliation](references/IMPLEMENT-RECOVERY.md) before continuing. Preserve uncommitted work, reconcile code/task/checklist evidence, redirect fix plans to `/aif-fix`, and use the no-plan choices when needed. Inline and list routes never enter recovery; status stays read-only and does not enter the interactive no-plan flow.

### Project context

Before executing plan-backed tasks, read [project context and past experience](references/IMPLEMENT-CONTEXT.md). Load configured description, architecture, and the rules hierarchy; more specific rules override general ones. Read `.ai-factory/skill-context/aif-implement/SKILL.md` when present; it overrides general guidance and governs every output. Only use the limited recent-patch fallback when skill-context is missing.

### Plan discovery and integrity

Before selecting any plan-backed artifact, read [discovery, research drift, and Handoff binding](references/IMPLEMENT-DISCOVERY.md). Priority: explicit path → branch full/ultra → single named artifact → fast plan → fix-plan redirect.

Classify ultra by exactly one `<!-- aif:plan-mode:ultra -->` before folder assumptions. Ignore unrelated auto-discovered directories, but STOP for invalid explicit bundles, malformed marked bundles, escaping/broken Phase Index links, or tasks without exactly one phase specification. Read the entire entrypoint and the active task's complete phase; only `index.md` owns progress. Research revisions are drift checks; committed Research Context remains scope. Preserve exact `/aif-fix` redirection and `<!-- ultra-phase:<relative-path> -->` Handoff serialization.

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

### Task execution

Before each plan-backed task, read [execution and requirement consistency](references/IMPLEMENT-TASK.md) and the full task/ultra phase. Resolve requirements against committed Research Context; live research remains drift-only. On clear conflicts emit `ERROR [requirement-conflict]`, leave the task pending, and STOP; autonomous Handoff returns `handoff_outcome: blocked_external` without a completion/review transition.

Execute one task at a time: mark in progress, implement within scope, verify, mark completed, and immediately update the entrypoint checkbox. Never duplicate progress in phase files or mark unfinished work complete. Keep manual Handoff sync and commit checkpoints; do not call Handoff MCP in autonomous mode. Context artifacts remain read-only except the factual maintenance explicitly allowed by this workflow. Read [logging requirements](references/LOGGING-GUIDE.md) before editing implementation code.

### Session persistence

When pausing plan-backed work, read [progress persistence](references/IMPLEMENT-PERSISTENCE.md). Preserve TaskUpdate and entrypoint progress so the next session can resume the next incomplete task.

### Plan-backed completion

Only after all plan-backed tasks are verified complete, read [completion, docs, cleanup, and worktree procedures](references/IMPLEMENT-COMPLETION.md). Apply manual Handoff final sync only when linked; autonomous Handoff never calls MCP. Mark roadmap completion only with evidence. `Docs: yes` requires the docs checkpoint via `/aif-docs`; no/unset is warn-only. Ask before deleting the fast plan or merging/cleaning a worktree; keep named full/ultra artifacts. On merge conflict STOP before cleanup. No reports or wrap-up tasks.

The exact follow-up commands remain `/aif-verify` or `/aif-commit`.

## Command examples

Read [usage examples](references/IMPLEMENT-COMMANDS.md) only when the user needs command syntax examples. `status` shows progress and stops before task execution, task/progress writes, Handoff synchronization, or completion actions.

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
- Read-only context in this command by default: the resolved `paths.rules_file`, configured `paths.research`, and any exact research source linked from the plan entrypoint.
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
