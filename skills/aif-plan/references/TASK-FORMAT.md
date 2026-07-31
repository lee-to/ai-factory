# aif-plan Task and Plan Format

## Plan File Naming

`workflow.plan_id_format` (config) controls the full/ultra plan identifier shape:

| Value        | Full shape / Ultra shape                                    | Notes                                                                 |
|--------------|-------------------------------------------------------------|-----------------------------------------------------------------------|
| `slug`       | `paths.plans/<stem>.md` / `paths.plans/<stem>/index.md`     | Default. Derived from branch name (or description slug in no-git mode).|
| `timestamp`  | (reserved; behaves like `slug`)                             | Reserved value. Currently falls back to `slug` with an `INFO` log.    |
| `uuid`       | (reserved; behaves like `slug`)                             | Reserved value. Currently falls back to `slug` with an `INFO` log.    |
| `sequential` | `paths.plans/<NNNN>_<stem>.md` / `paths.plans/<NNNN>_<stem>/index.md` | `NNNN = max(existing 4-digit prefix across full files and directories whose `index.md` has the exact ultra marker) + 1`; other numbered directories are ignored; empty plans start at `0001`; capped at `9999`. Deleting the highest-numbered plan can free that number for reuse. Force-disabled under `HANDOFF_BRANCH_PREPARED=1`. |

Branch names always remain `<branch_prefix><slug>` regardless of the format —
the prefix lives only on the full-plan filename or ultra directory. Fast plans
(`paths.plan`) and fix plans (`paths.fix_plan`) are single files and ignore
`plan_id_format`.

This file defines the fast/full single-file format. For the ultra bundle,
including `index.md`, phase files, detail gates, and consumer rules, read
`ULTRA-FORMAT.md`.

## Plan File Template

```markdown
<!-- handoff:task:<HANDOFF_TASK_ID> -->
<!-- ↑ First line: only when HANDOFF_MODE=1 and HANDOFF_TASK_ID is non-empty -->

# Implementation Plan: [Feature Name]

Branch: [current branch or "none"]
Created: [date]

## Original Request
<!-- Required when the user explicitly supplied a planning request. Omit only when the plan was created solely from RESEARCH.md without an explicit user request. Preserve the request after only recognized command tokens in command positions are removed and only outer whitespace is trimmed; do not translate, summarize, normalize, or rewrite it. -->
[exact user-provided planning request]

## Settings
- Testing: yes/no
- Logging: verbose/standard/minimal
- Docs: yes/no  # yes => mandatory docs checkpoint in /aif-implement, no/unset => WARN [docs] only

## Roadmap Linkage (optional)
<!-- Only when .ai-factory/ROADMAP.md exists -->
Milestone: "[milestone name from ROADMAP.md]"  # or "none"
Rationale: [1 short sentence]

## Research Context (optional)
<!-- Only when a selected legacy or ultra-bundle RESEARCH.md influenced this plan, copy/paste the relevant Active Summary here -->
Source: `.ai-factory/RESEARCH.md` (Active Summary, Updated: YYYY-MM-DD HH:MM, SHA256: <active-summary-sha256>)
<!-- Required when any RESEARCH.md content influenced this plan. Replace the example source with the exact selected file, including research/<slug>/RESEARCH.md for ultra research. The copied context is the committed requirements snapshot; downstream skills use the live source file only to warn about revision drift. -->

Goal:
Constraints:
Decisions:
Open questions:

## Commit Plan
<!-- For plans with 5+ tasks, define commit checkpoints -->
- **Commit 1** (after tasks 1-3): "feat: add base models and types"
- **Commit 2** (after tasks 4-6): "feat: implement core service logic"

## Tasks

### Phase 1: Setup
- [ ] Task 1: [description]
- [ ] Task 2: [description]

### Phase 2: Core Implementation
- [ ] Task 3: [description] (depends on 1, 2)
- [ ] Task 4: [description]
<!-- Commit checkpoint: tasks 1-4 -->

### Phase 3: Integration
- [ ] Task 5: [description] (depends on 3, 4)
<!-- Commit checkpoint: tasks 5+ -->
```

## TaskCreate Example

```text
TaskCreate:
  subject: "Implement user login endpoint"
  description: |
    Create POST /api/auth/login endpoint that:
    - Accepts email and password
    - Validates credentials against database
    - Returns JWT token on success
    - Returns 401 on invalid credentials

    LOGGING REQUIREMENTS:
    - Log function entry with request context
    - Log validation result (pass/fail with reasons)
    - Log external service calls and responses
    - Log any errors with full context
    - Use format: [ServiceName.method] message {data}
    - Use log levels (DEBUG/INFO/WARN/ERROR)

    Files: src/api/auth/login.ts, src/services/auth.ts
  activeForm: "Implementing login endpoint"
```

## Logging Requirements Checklist

Every task description should specify:
- What to log: inputs, outputs, state changes, errors
- Where to log: key checkpoints and external boundaries
- Levels: DEBUG for verbose flow, INFO for major events, ERROR for failures
- Control: environment-driven (`LOG_LEVEL` or `DEBUG`)
- Safety: production log level can be reduced without code edits

Never create tasks without logging instructions.
