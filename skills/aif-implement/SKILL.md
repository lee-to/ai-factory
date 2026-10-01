---
name: aif-implement
description: Execute implementation tasks from the current plan. Works through tasks sequentially, marks completion, and preserves progress for continuation across sessions. Use when user says "implement", "start coding", "execute plan", or "continue implementation".
argument-hint: '[--list] [--without-plan <description>] [@plan-file-or-directory] [task-id or "status"]'
allowed-tools: Read Write Edit Glob Grep Bash TaskList TaskGet TaskUpdate AskUserQuestion Questions mcp__handoff__handoff_sync_status mcp__handoff__handoff_push_plan mcp__handoff__handoff_get_task mcp__handoff__handoff_list_tasks mcp__handoff__handoff_update_task
disable-model-invocation: false
---

# Implement - Execute Task Plan

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
   - `workflow.plan_structure` (default: `classic`) — `classic` or
     `task-based`. Invalid types or values warn and fall back to `classic`.
     Use it only for unreadable or legacy plans; a readable plan's markers and
     sections determine its execution structure.
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

Before ordinary execution, check whether the actual task checkbox is marked with
`<!-- aif:task-kind:commit -->` immediately above it. Route marked commit tasks
to the commit-task handler below before marking them in progress; only ordinary
tasks follow the implementation, verification, and generic completion flow.
Execute one task at a time. Never duplicate progress in phase files or mark
unfinished work complete. Keep manual Handoff sync and commit checkpoints; do
not call Handoff MCP in autonomous mode. Context artifacts remain read-only
except the factual maintenance explicitly allowed by this workflow. Read
[logging requirements](references/LOGGING-GUIDE.md) before editing implementation
code.

### Task-based commit tasks

Treat `## Settings`, `Commit strategy:`, `Development methodology:`, and
`TDD granularity:` as exact, untranslated plan-control tokens. Read their
canonical values literally; do not infer settings from translated prose.

For a marked commit task:

- Extract its exact commit message from the task description; if it is unclear,
  stop without guessing. A description-only fallback is allowed only for legacy
  plans without the stable marker.
- Read its dependency IDs and the associated task descriptions, `Files:` hints,
  and complete ultra task specifications to identify the exact commit group.
  If ownership is unclear, stop before invoking `/aif-commit`.
- For `incremental-at-end` or `single-commit`, do not dispatch any marked
  commit task until all implementation/test tasks are complete and the reserved
  documentation task and ownership gate below are complete when `Docs: yes`.
- Before dispatch, capture the complete outstanding group changes from index
  and worktree, including untracked paths/content. Enumerate untracked files
  with `git status --porcelain -uall` and
  `git ls-files --others --exclude-standard`; prove ownership at path and
  hunk/content level before staging, especially for files overlapping other
  work. Persist a receipt adjacent to the task in the plan before dispatch.
  Use the unique ID `task-<task-id>` and store the task ID, full pre-commit
  `HEAD`, `state: captured`, and a SHA-256 digest plus the complete canonical
  owned-change manifest. The lossless manifest must encode each path's
  pre-commit blob/mode, exact resulting bytes or owned patch, result mode, and
  staged/unstaged state, including untracked content; a digest or path list
  alone is insufficient. Store it losslessly (for example, base64 canonical
  JSON). Treat the receipt as plan control data, not part of the commit group
  unless explicitly assigned. Do not duplicate receipt IDs.

  ```markdown
  <!-- aif:commit-receipt:start id="task-<task-id>" -->
  {"task_id":"<task-id>","state":"captured","pre_head":"<full HEAD>","manifest_sha256":"<sha256>","manifest_b64":"<base64 canonical manifest>"}
  <!-- aif:commit-receipt:end id="task-<task-id>" -->
  ```
  After verification, retain all capture fields and add
  `"state":"verified","commit":"<full commit hash>"`.
- Invoke `/aif-commit` in task-bound mode with the exact plan path, marked task
  ID and message, dependency task IDs/descriptions, planned files or hunk
  ownership evidence, captured outstanding changes, and `HANDOFF_MODE`. Commit
  only this group; preserve unrelated staged and unstaged changes. If ownership
  is unclear or unrelated staged work exists, stop without changing the index.
- Log the invocation as `[aif-implement.commit] invoking /aif-commit for task
  {taskId}`. After it returns, independently verify a new local commit has the
  exact planned message and its diff exactly covers the complete captured
  group, at path and hunk/content level, with no omissions or unrelated
  changes; its parent must be the receipt's pre-commit `HEAD`. Update the
  receipt to `state: verified` with the full commit hash while preserving the
  captured fields, and persist it before marking the commit task complete in
  TaskUpdate and the plan entrypoint. The receipt is the durable resume source.
- On failure, cancellation, or unverified commit, leave the task incomplete and
  stop at the commit boundary. On resume, reconcile the checkbox, task status,
  and local history. A persisted no-op marker is accepted only for an omitted
  docs-only group, with matching documentation outcome markers and a complete
  checkbox; inspect live staged, unstaged, and untracked changes to confirm the
  group still has no outstanding changes. A stale/malformed marker or any
  current change attributable to that group is an integrity error; do not
  clear it, recommit, or absorb new work.
  If there is no receipt and the task is unchecked/incomplete with no candidate
  commit using its planned message, capture and persist a receipt before first
  dispatch. A missing receipt when the task is complete or a candidate commit
  exists is an integrity error. Otherwise validate the canonical manifest and
  digest. A verified receipt must match exactly one commit with the planned
  message, the recorded `pre_head` as parent, and a tree delta exactly matching
  the manifest. If the receipt remains captured after a commit, prove the
  commit from that receipt, then persist its verified state/hash before task
  completion. If no commit proves it, compare current owned changes to the
  saved manifest before retrying; any mismatch or multiple candidates stops
  without replacing the receipt. Otherwise mark completion only when exactly
  one matching commit exactly covers the captured group.

The canonical marker is a standalone comment immediately before the task
checkbox; it is not itself a task. A task without the marker is ordinary even if
its text mentions commits. Commit tasks are dependency boundaries, not
implementation work.

### Deferred commit strategies

Read `Commit strategy:` from the exact `## Settings` section; absent values in
classic plans mean `incremental`. For `incremental-at-end`, wait until all
implementation, test, and documentation tasks finish, then process classic
`## Commit Plan` groups in order. For `single-commit`, wait until those tasks
finish, then process the single group. Neither strategy offers intermediate
commit checkpoints. Begin finalization immediately after the final work task.
Ask before each group; skipping one or all remaining groups must be reported,
and completion must not imply skipped groups were committed.

For classic groups, invoke `/aif-commit classic-group` with the exact plan path,
group name/number, task range, exact message, every task's IDs/descriptions and
file/hunk ownership evidence, `HANDOFF_MODE`, and authorization for that group.
Capture the complete outstanding selected-group change set, including staged,
unstaged, and untracked changes, before dispatch. It must validate against the
saved `## Commit Plan` and commit only that group. Persist the same durable
capture receipt before dispatch, keyed by the exact classic group name/number;
after verification, persist the pre-commit `HEAD`, canonical manifest, and
verified commit hash before continuing. A group without a receipt and without a
candidate commit using its exact message may capture one before first dispatch;
a candidate commit without a receipt is an integrity error. Independently
verify that the local commit has the exact message and parent and its diff
exactly covers the captured group with no omissions or unrelated changes
before recording success. On resume, reconcile from the saved receipt and local
history, never a newly inferred baseline. If no commit proves a captured
receipt, compare live owned changes to that exact manifest before retrying;
mismatch or multiple/ambiguous matches stops without guessing.
Use receipt ID `classic-<group-number>` and include the exact classic group
name in its canonical manifest/receipt data.

For deferred strategies with `Docs: yes`, require a reserved documentation
task with `Files:` hints that depends on all implementation/test tasks and
belongs to the final deferred group (a dedicated final group for
`incremental-at-end`, the single group for `single-commit`). After implementation
and test work but before any deferred commit, run the mandatory `/aif-docs`
checkpoint. Capture staged/unstaged paths and hunks first; unrelated staged
work stops the flow without index changes. Compare the resulting diff with that
baseline and verify each docs path/hunk is within the reserved task hints and
commit-group ownership. Unclear, overlapping, or out-of-scope ownership stops
all deferred commits; do not widen the group.

Persist terminal documentation outcomes before proceeding. On the documentation
task line, use
`<!-- aif:task-outcome:skipped reason="documentation-skipped" -->` for user
Skip or `<!-- aif:task-outcome:skipped reason="documentation-unchanged" -->`
when `/aif-docs` makes no changes. For an omitted docs-only commit task, retain
its commit-kind marker and add the matching
`<!-- aif:commit-outcome:skipped-no-op reason="..." -->` marker to the task
line; mark both tasks complete in TaskUpdate and with `[x]` checkboxes. This
explicit outcome is distinct from a commit, cancellation, failure, or pending
work. Do not emit a no-op marker for a `single-commit` group containing
implementation changes. If the docs checkpoint was already run during
finalization, do not repeat it at completion.

For a classic docs-only group omitted because docs were skipped or unchanged,
place a group-level marker immediately after the exact `## Commit Plan` entry:

```markdown
<!-- aif:classic-group-outcome:skipped-no-op group="<exact group name or number>" reason="documentation-skipped" -->
```

Use `reason="documentation-unchanged"` when `/aif-docs` made no changes, and
persist the matching documentation outcome and completed checkbox/status in
the same plan update. On resume, validate this marker before searching Git
history; accept it only for a docs-only group with the matching documentation
outcome and completed task. Check live staged, unstaged, and untracked changes
against the docs task's hints and owned paths/hunks. Any group-owned live
change makes the marker stale and requires stopping without changing the
marker/task state. An absent, malformed, mismatched, or non-docs-only marker is
an integrity error; never dispatch an empty commit or infer a no-op from
missing history.

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
