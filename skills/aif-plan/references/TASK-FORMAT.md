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

## Commit Plan
<!-- For plans with 5+ tasks, define commit checkpoints -->
- **Commit 1** (after tasks 1-3): "feat: add base models and types"
- **Commit 2** (after tasks 4-6): "feat: implement core service logic"

## Tasks

### Classic Format (separate Commit Plan section)

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

### Task-Based Format (commits as explicit tasks)

### Phase 1: User Authentication System
- [ ] Task 1: Implement user service with login/logout
- [ ] Task 2: Write unit tests for user service (depends on 1)
- [ ] Task 3: Document user service API (depends on 1)
- [ ] Task 4: Commit changes with message "feat: implement user service" (depends on 2,3)
- [ ] Task 5: Implement auth middleware
- [ ] Task 6: Write integration tests for auth flow (depends on 5)
- [ ] Task 7: Document auth middleware usage (depends on 5)
- [ ] Task 8: Commit changes with message "feat: implement auth middleware" (depends on 6,7)

### TDD Task-Based Format (test before each implementation task)

### Phase 1: User Authentication System (TDD)
- [ ] Task 1: Write failing unit test for user login functionality
- [ ] Task 2: Implement user login to make test pass (depends on 1)
- [ ] Task 3: Write failing unit test for user registration functionality
- [ ] Task 4: Implement user registration to make test pass (depends on 3)
- [ ] Task 5: Refactor authentication logic (ensure all tests still passing) (depends on 2,4)
- [ ] Task 6: Write failing integration test for complete auth flow
- [ ] Task 7: Implement auth middleware to make test pass (depends on 6)
- [ ] Task 8: Commit changes with message "feat: implement user authentication with TDD" (depends on 5,7)

### TDD Feature-Based Format (test batch before implementation)

### Phase 1: User Authentication System (TDD)
- [ ] Task 1: Write failing unit test for user login functionality
- [ ] Task 2: Write failing unit test for user registration functionality
- [ ] Task 3: Write failing integration test for complete auth flow
- [ ] Task 4: Implement user login to make test pass (depends on 1)
- [ ] Task 5: Implement user registration to make test pass (depends on 2)
- [ ] Task 6: Implement auth middleware to make test pass (depends on 3)
- [ ] Task 7: Refactor authentication logic (ensure all tests still passing) (depends on 4,5,6)
- [ ] Task 8: Commit changes with message "feat: implement user authentication with TDD" (depends on 7)

### Incremental at End Commit Strategy

### Phase 1: User Authentication System
- [ ] Task 1: Implement user service with login/logout
- [ ] Task 2: Write unit tests for user service (depends on 1)
- [ ] Task 3: Document user service API (depends on 1)
- [ ] Task 4: Implement auth middleware
- [ ] Task 5: Write integration tests for auth flow (depends on 4)
- [ ] Task 6: Document auth middleware usage (depends on 4)
- [ ] Task 7: Commit changes with message "feat: implement user service" (depends on 2,3)
- [ ] Task 8: Commit changes with message "feat: implement auth middleware" (depends on 5,6)

### Single Commit at End Strategy

### Phase 1: User Authentication System
- [ ] Task 1: Implement user service with login/logout
- [ ] Task 2: Write unit tests for user service (depends on 1)
- [ ] Task 3: Document user service API (depends on 1)
- [ ] Task 4: Implement auth middleware
- [ ] Task 5: Write integration tests for auth flow (depends on 4)
- [ ] Task 6: Document auth middleware usage (depends on 4)
- [ ] Task 7: Commit all changes with message "feat: implement user authentication system" (depends on 2,3,5,6)
```

**Note:** The examples above show all three commit strategies and both TDD granularity options:
- **Commit strategies**: incremental (commits interspersed), incremental at end (commits grouped at end), single commit at end (one final commit)
- **TDD granularity**: task-based (test before each implementation task), feature-based (test batch before implementation per phase)
- **Classic format**: preserved for backward compatibility with separate Commit Plan section
- **Task-based format**: commits as explicit tasks with dependencies on related implementation/test/doc tasks

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
