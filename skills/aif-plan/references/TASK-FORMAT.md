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
- Commit strategy: incremental/incremental-at-end/single-commit  # how commits are structured
- Development methodology: implementation-first/tdd  # implementation-first or test-driven development
- TDD granularity: task-based/feature-based  # only shown when Development methodology: tdd

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

## Requirements Reconciliation
<!-- Include when multiple authoritative sources constrain behavior, a conflict was resolved, independent behavior dimensions exist, or a representative repository artifact is required. Keep this exact heading. -->
Authority: [declared source priority, or "none declared"]

| Decision / supported combination | Source path and section | Verification evidence |
|----------------------------------|-------------------------|-----------------------|
| [material rule or combination] | `[path]` — [section] | [test, command, or manual check] |

## Tasks

### Phase 1: Setup
- [ ] Task 1: [description]
- [ ] Task 2: [description]

### Phase 2: Core Implementation
- [ ] Task 3: [description] (depends on 1, 2)
- [ ] Task 4: [description]

### Phase 3: Integration
- [ ] Task 5: [description] (depends on 3, 4)
```

Keep `## Settings` and the `Commit strategy:`, `Development methodology:`,
and `TDD granularity:` labels exactly as shown in every artifact language;
these are untranslated control tokens read by `/aif-implement`. Keep values
canonical and untranslated as well.

Render exactly one commit layout in a generated plan; never combine these
formats. The common template above contains tasks and settings, but not the
optional commit layout:

- For `workflow.plan_structure: classic`, include a `## Commit Plan` section
  with ordered task ranges and messages when commits are planned. Classic is
  the only format that uses this section.
- For `workflow.plan_structure: task-based`, omit `## Commit Plan` and add
  explicit commit tasks to `## Tasks`. Put the stable marker on its own line
  immediately before the actual task checkbox; never create a checkbox for the
  marker itself.

**Classic layout example (`incremental`):**

```markdown
## Commit Plan
- **Commit 1** (after tasks 1-3): "feat: add user model"
- **Commit 2** (after tasks 4-6): "feat: implement auth service"
```

**Task-based layout example:**

```markdown
## Tasks
### Phase 1: User Authentication System
- [ ] Task 1: Implement user service
- [ ] Task 2: Write unit tests for user service (depends on 1)
- [ ] Task 3: Document user service API (depends on 1)
<!-- aif:task-kind:commit -->
- [ ] Task 4: Commit changes with message "feat: implement user service" (depends on 1,2,3)
```

For `incremental`, place each marked commit task after its related work. For
`incremental-at-end`, place all marked commit tasks after implementation tasks,
one per planned group. For `single-commit`, add one marked final task depending
on all work. TDD granularity changes test/implementation ordering only; every
commit task still uses the same marker placement and grouping contract.

For classic plans, `Commit strategy: incremental-at-end` means list each logical
group in `## Commit Plan` as deferred until all implementation/test/documentation
tasks are complete. Keep the task-range syntax and make deferral explicit, e.g.
`- **Commit 1** (after tasks 1-3; defer until all tasks complete): "feat: ..."`
`/aif-implement` commits those groups in listed order only during finalization.
`single-commit` means exactly one deferred group covering all
implementation/test/documentation tasks. Neither deferred strategy may commit
at an intermediate task-range boundary.

For either deferred strategy with `Docs: yes`, include a final documentation
task for the mandatory `/aif-docs` checkpoint and give it explicit `Files:`
hints. In classic `incremental-at-end`, place this task in a dedicated final
commit group; in `single-commit`, include it in the one group. In task-based
plans, the corresponding commit task must depend on the documentation task.
After `/aif-docs`, `/aif-implement` verifies every changed documentation
path/hunk is covered by that task's hints and selected group. If the diff
escapes the reserved scope or overlaps another group ambiguously, stop before
committing and ask the user to adjust the plan grouping.

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

    REQUIREMENT EVIDENCE (when the Requirements Reconciliation Gate applies):
    - Source: `docs/auth.md` — Login contract
    - Supported combinations: valid/invalid credentials × active/disabled user
    - Verification: exercise each supported combination through POST /api/auth/login
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

## TDD Task Pattern Examples

**Task-Based TDD Pattern:**
```text
TaskCreate:
  subject: "Write failing unit test for user login"
  description: |
    Write a unit test for the user login functionality that:
    - Tests successful login with valid credentials
    - Tests failed login with invalid credentials
    - Tests edge cases (empty email, missing password)

    LOGGING REQUIREMENTS:
    - Log test file creation
    - Log test execution results
    - Use format: [aif-plan.tdd] message {data}
    - Use log levels: INFO for test creation, DEBUG for test details

    Files: tests/auth/login.test.ts
  activeForm: "Writing failing unit test for user login"

TaskCreate:
  subject: "Implement user login to make test pass"
  description: |
    Implement the user login functionality to pass the login test:
    - Implement authentication logic
    - Handle valid credentials
    - Handle invalid credentials with appropriate error response
    - Ensure test from previous task passes

    LOGGING REQUIREMENTS:
    - Log implementation progress
    - Log test validation
    - Use format: [aif-plan.tdd] message {data}
    - Use log levels: INFO for progress, DEBUG for validation

    Files: src/services/auth.ts
  activeForm: "Implementing user login"
```

**Feature-Based TDD Pattern:**
```text
TaskCreate:
  subject: "Write failing unit tests for user authentication"
  description: |
    Write unit tests for the user authentication feature:
    - Test user login functionality
    - Test user registration functionality
    - Test password validation
    - Test session management

    LOGGING REQUIREMENTS:
    - Log test file creation
    - Log test suite composition
    - Use format: [aif-plan.tdd] message {data}
    - Use log levels: INFO for test creation, DEBUG for test details

    Files: tests/auth/user-auth.test.ts
  activeForm: "Writing failing unit tests for user authentication"

TaskCreate:
  subject: "Implement user authentication to make tests pass"
  description: |
    Implement the user authentication feature to pass all tests:
    - Implement user login
    - Implement user registration
    - Implement password validation
    - Implement session management

    LOGGING REQUIREMENTS:
    - Log implementation progress
    - Log test validation
    - Use format: [aif-plan.tdd] message {data}
    - Use log levels: INFO for progress, DEBUG for validation

    Files: src/services/auth.ts, src/middleware/auth.ts
  activeForm: "Implementing user authentication"
```
