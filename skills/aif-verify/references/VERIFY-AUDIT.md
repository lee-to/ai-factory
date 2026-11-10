## Step 1: Task Completion Audit

Go through **every task** in the plan and verify it was actually implemented.

For each task:

### 1.1 Read Task Description

```
TaskGet(taskId) → Get full description, requirements, acceptance criteria
```

### 1.2 Verify Implementation Exists

For each requirement in the task description:
- Use `Glob` and `Grep` to find the code that implements it
- Read the relevant files to confirm the implementation is complete
- Check that the implementation matches what was described, not just that "something was written"

### 1.3 Build Checklist

For each task, produce a verification result:

```
✅ Task #1: Create user model — COMPLETE
   - User model created at src/models/user.ts
   - All fields present (id, email, name, createdAt, updatedAt)
   - Validation decorators added

⚠️ Task #3: Add password reset endpoint — PARTIAL
   - Endpoint created at src/api/auth/reset.ts
   - MISSING: Email sending logic (task mentioned SendGrid integration)
   - MISSING: Token expiration check

❌ Task #5: Add rate limiting — NOT FOUND
   - No rate limiting middleware detected
   - No rate-limit related packages in dependencies
```

Statuses:
- `✅ COMPLETE` — all requirements verified in code
- `⚠️ PARTIAL` — some requirements implemented, some missing
- `❌ NOT FOUND` — implementation not detected
- `⏭️ SKIPPED` — task was intentionally skipped by user during implement

---

## Step 2: Code Quality Verification

### 2.1 Build & Compile Check

Detect the build system and verify the project compiles:

| Detection | Command |
|-----------|---------|
| `go.mod` | `go build ./...` |
| `tsconfig.json` | `npx tsc --noEmit` |
| `package.json` with `build` script | `npm run build` (or pnpm/yarn/bun) |
| `pyproject.toml` | `python -m py_compile` on changed files |
| `Cargo.toml` | `cargo check` |
| `composer.json` | `composer validate` |

If build fails → report errors with file:line references.

### 2.2 Test Check

If the project has tests and they were part of the plan:

| Detection | Command |
|-----------|---------|
| `jest.config.*` or `vitest` | `npm test` |
| `pytest` | `pytest` |
| `go test` | `go test ./...` |
| `phpunit.xml*` | `./vendor/bin/phpunit` |
| `Cargo.toml` | `cargo test` |

If tests fail → report which tests failed and whether they relate to the implemented tasks.

If no tests exist or testing was explicitly skipped in the plan → note it but don't fail.

### 2.3 Lint Check

If linters are configured:

| Detection | Command |
|-----------|---------|
| `eslint.config.*` / `.eslintrc*` | `npx eslint [changed files]` |
| `.golangci.yml` | `golangci-lint run ./...` |
| `ruff` in pyproject.toml | `ruff check [changed files]` |
| `.php-cs-fixer*` | `./vendor/bin/php-cs-fixer fix --dry-run --diff` |

Only lint the changed files to keep output focused.

### 2.4 Import & Dependency Check

- Verify no unused imports were left behind
- Check that new dependencies mentioned in tasks were actually added (`package.json`, `go.mod`, `requirements.txt`, `composer.json`)
- Check for missing dependencies (imports that reference packages not in dependency files)

---
