# aif-plan Task and Plan Format

## Plan File Template

```markdown
# Implementation Plan: [Feature Name]

Branch: [current branch or "none"]
Created: [date]

## Settings
- Testing: yes/no
- Logging: verbose/standard/minimal
- Docs: yes/no

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
