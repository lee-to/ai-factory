---
name: aif-verify
description: >-
  Verify completed implementation against the plan. Checks that all tasks were fully implemented,
  nothing was forgotten, code compiles, tests pass, and quality standards are met.
  Use after "/aif-implement" completes, or when user says "verify", "check work", "did we miss anything".
argument-hint: "[--strict]"
allowed-tools: Read Edit Glob Grep Bash(git *) Bash(npm *) Bash(npx *) Bash(yarn *) Bash(pnpm *) Bash(bun *) Bash(go *) Bash(python *) Bash(php *) Bash(composer *) Bash(cargo *) Bash(make *) Bash(task *) Bash(just *) Bash(mage *) TaskList TaskGet AskUserQuestion Questions
disable-model-invocation: false
metadata:
  author: AI Factory
  version: "1.0"
  category: quality
---

# Verify — Post-Implementation Quality Check

Verify that the completed implementation matches the plan, nothing was missed, and the code is production-ready.

**This skill is optional** — invoked after `/aif-implement` finishes all tasks, or manually at any time.

---

## Step 0: Load Context

### 0.0 Load config.yaml

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:
- **Paths:** `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.plan`, `paths.plans`, `paths.fix_plan`, `paths.specs`, and `paths.rules`
- **verify_mode:** default verification strictness (`strict` | `normal` | `lenient`)
- **Git:** `git.enabled`, `git.base_branch`, `git.create_branches`
- **Rules hierarchy:** the resolved RULES.md path + `rules.base` + named `rules.<area>` entries

**verify_mode priority:**
1. `--strict` CLI flag → always use `strict`
2. config.yaml `workflow.verify_mode` → use configured value
3. Default → `normal`

If config.yaml doesn't exist, use defaults:
- Paths: `.ai-factory/` for all artifacts
- verify_mode: `normal`
- Rules: RULES.md only

### 0.1 Load Ownership and Gate Contract

- Read `references/CONTEXT-GATES-AND-OWNERSHIP.md` first.
- Treat it as the canonical source for:
  - command-to-artifact ownership,
  - read-only behavior for `aif-commit`/`aif-review`/`aif-verify`,
  - normal vs strict context-gate thresholds.
- If this contract conflicts with older examples in this file, follow the contract.

### 0.2 Find Plan File

Same logic as `/aif-implement`:

```
1. Check current git branch:
   git branch --show-current
   → Look for <configured plans dir>/<branch-name>.md
2. If the branch-based plan is missing or git mode is off:
   → Check whether the configured plans dir contains exactly one `*.md` full-mode plan
   → If exactly one exists, use it
   → If multiple exist, ask the user to choose or use `@<path>` via `/aif-implement`
3. No full-mode plan → Check the resolved fast plan path
4. No full-mode plan and no resolved fast plan → fall back to standalone verification choices
```

**If no plan file found:**
```
AskUserQuestion: No plan file found. What should I verify?

Options:
1. Verify last commit — Check the most recent commit for completeness
2. Verify branch diff — Compare current branch against the configured base branch
3. Cancel
```

### 0.2 Read Plan & Tasks

- Read the plan file to understand what was supposed to be implemented
- `TaskList` → get all tasks and their statuses
- Read `.ai-factory/DESCRIPTION.md` (use path from config) for project context (tech stack, conventions)
- Read `.ai-factory/ARCHITECTURE.md` (use path from config) for dependency and boundary rules (if present)
- Read **rules hierarchy** (use paths from config):
  1. **RULES.md** — axioms (universal project rules)
  2. **rules/base.md** — project-specific base conventions
  3. **rules.<area>** — area-specific rule entries resolved from config (for example `rules.api`, `rules.frontend`)
- Read `.ai-factory/ROADMAP.md` (use path from config) for milestone alignment checks (if present)

**Read `.ai-factory/skill-context/aif-verify/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**
- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including the Verification
  Report template. If a skill-context rule says "verification MUST check X" or "report MUST include
  section Y" — you MUST augment the report accordingly. Generating a verification that ignores
  skill-context rules is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

### 0.3 Gather Changed Files

```bash
# All files changed during this feature/plan
git diff --name-only <configured-base-branch>...HEAD
# Or if on the base branch / in no-git mode, check recent commits
git diff --name-only HEAD~$(number_of_tasks)..HEAD
```

If `git.enabled = false`, skip branch diffing entirely and gather changed files from:
- the working tree (if uncommitted changes exist), or
- the recent commit window that corresponds to the implemented tasks.

Store as `CHANGED_FILES`.

---

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

## Step 3: Consistency Checks

### 3.1 Plan vs Code Drift

Check for discrepancies between what the plan says and what was built:

- **Naming**: Do variable/function/endpoint names match what the plan specified?
- **File locations**: Are files where the plan said they should be?
- **API contracts**: Do endpoint paths, request/response shapes match the plan?

### 3.2 Leftover Artifacts

Search for things that should have been cleaned up:

```
Grep in CHANGED_FILES: [T][O][D][O]|[F][I][X][M][E]|HACK|[X][X][X]|TEMP|PLACEHOLDER|console\.log\(.*debug|print\(.*debug
```

Report any found — they might be intentional, but flag them.

### 3.3 Configuration & Environment

Check if the implementation introduced any new config requirements:

- New environment variables referenced but not documented
- New config files mentioned in code but not created
- Database migrations created but not documented in README/docs

```
Grep in CHANGED_FILES: process\.env\.|os\.Getenv\(|os\.environ|env\(|getenv\(|config\(
```

Cross-reference with `.env.example`, `.env.local`, README, or docs to ensure they're documented.

### 3.4 DESCRIPTION.md Sync

Check if `.ai-factory/DESCRIPTION.md` reflects the current state:

- New dependencies/libraries added during implementation → should be listed
- Architecture changes → should be reflected
- New integrations → should be documented

### 3.5 Context Gates (Architecture / Roadmap / Rules)

Apply the canonical contract from `references/CONTEXT-GATES-AND-OWNERSHIP.md`.

Evaluate and report each gate explicitly:

- **Architecture gate**
  - Pass: implementation follows documented boundaries and dependency rules
  - Warn: architecture mapping is ambiguous or stale
  - Fail: clear violation of explicit architecture constraints

- **Rules gate**
  - Pass: implementation follows explicit project rules
  - Warn: relevance/verification is ambiguous
  - Fail: clear violation of explicit rule text

- **Roadmap gate**
  - Pass: work aligns with existing milestone direction (prefer `## Roadmap Linkage` from the plan when present)
  - Warn: `.ai-factory/ROADMAP.md` missing, ambiguous mapping, or no milestone linkage for `feat`/`fix`/`perf` scope
  - Fail (strict mode): clear roadmap contradiction after all available roadmap context is considered

Normal mode behavior:
- Architecture/rules clear violations fail verification.
- Roadmap mismatch and missing milestone linkage are warnings unless contradiction is explicit and severe.

Strict mode behavior:
- Architecture and rules clear violations fail verification.
- Clear roadmap mismatch fails verification.
- Missing milestone linkage for `feat`/`fix`/`perf` remains a warning (even when `.ai-factory/ROADMAP.md` exists).

Logging/reporting format:
- Non-blocking findings: `WARN [gate-name] ...`
- Blocking findings: `ERROR [gate-name] ...`

### 3.6 Context Drift (Optional Remediation)

`/aif-verify` is **read-only** for context artifacts. Do not edit or regenerate `.ai-factory/*` files here.

If you detect that a context artifact is stale, missing, or ambiguous, report it as a drift finding and provide the owner-command remediation:

- `DESCRIPTION.md` drift → suggest `/aif` (or note that `/aif-implement` should have updated it during implementation)
- `ARCHITECTURE.md` drift → suggest `/aif-architecture`
- `ROADMAP.md` drift → suggest `/aif-roadmap check` (or `/aif-roadmap <update request>`)
- `RULES.md` drift → suggest `/aif-rules <rule text>`

Ask the user a single optional question **only if** drift was detected and fixing it now would materially improve correctness:

```
AskUserQuestion: Context drift detected. Capture updates now?

Options:
1. Yes — show the exact commands to run (recommended)
2. No — proceed without updating context
```

---

## Step 4: Verification Report

### 4.1 Display Results

```
## Verification Report

### Task Completion: 7/8 (87%)
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Create user model | ✅ Complete | |
| 2 | Add registration endpoint | ✅ Complete | |
| 3 | Add password reset | ⚠️ Partial | Missing: email sending |
| 4 | Add JWT auth middleware | ✅ Complete | |
| 5 | Add rate limiting | ✅ Complete | |
| 6 | Add input validation | ✅ Complete | |
| 7 | Add error handling | ✅ Complete | |
| 8 | Update API docs | ❌ Not found | No changes in docs/ |

### Code Quality
- Build: ✅ Passes
- Tests: ✅ 42 passed, 0 failed
- Lint: ⚠️ 2 warnings in src/api/auth/reset.ts

### Issues Found
1. **Task #3 incomplete** — Password reset endpoint created but email sending not implemented (SendGrid integration missing)
2. **Task #8 not done** — API documentation not updated despite plan requirement
3. **2 unfinished markers found** — src/services/auth.ts:45, src/middleware/rate-limit.ts:12
4. **New env var undocumented** — `SENDGRID_API_KEY` referenced but not in .env.example

### No Issues
- All imports resolved
- No unused dependencies
- DESCRIPTION.md up to date
- No leftover debug logs
```

### 4.2 Determine Overall Status

- **All Green** — everything verified, no issues
- **Minor Issues** — small gaps that can be fixed quickly
- **Significant Gaps** — tasks missing or partially done, needs re-implementation

### 4.3 Action on Issues

If issues were found:

```
AskUserQuestion: Verification found issues. What should we do?

Options:
1. Fix now (recommended) — Use /aif-fix to address all issues
2. Fix critical only — Use /aif-fix for incomplete tasks, skip warnings
3. Fix directly here — Address issues in this session without /aif-fix
4. Accept as-is — Mark everything as done, move on
```

**If "Fix now" or "Fix critical only":**
- First suggest using `/aif-fix` and pass a concise issue summary as argument
- Example:
  - `/aif-fix complete Task #3 password reset email flow, implement Task #8 docs update, remove unfinished markers in src/services/auth.ts and src/middleware/rate-limit.ts, document SENDGRID_API_KEY in .env.example`
- If user agrees, proceed via `/aif-fix`
- If user declines `/aif-fix`, continue with direct implementation in this session
- For each incomplete/partial task — implement the missing pieces (follow the same implementation rules as `/aif-implement`)
- For unfinished markers/debug artifacts — clean them up
- For undocumented config — update `.env.example` and docs
- After fixing, re-run the relevant verification checks to confirm

**If "Accept as-is":**
- Note the accepted issues in the plan file as a comment
- Continue to Step 5

---

## Step 5: Suggest Follow-Up Skills

After verification is complete, suggest next steps based on result:

- If unresolved issues remain (accepted or deferred), suggest `/aif-fix` first
- If all green, suggest security/review/commit flow

```
## Verification Complete

Suggested next steps:

1. 🛠️ /aif-fix [issue summary] — Fix remaining verification issues
2. 🔒 /aif-security-checklist — Run security audit on the new code
3. 👀 /aif-review — Code review of the implementation
4. 💾 /aif-commit — Commit the changes

Which would you like to run? (or skip all)
```

```
AskUserQuestion: Run additional checks?

Options:
1. Fix issues — Run /aif-fix with verification findings
2. Security check — Run /aif-security-checklist on changed files
3. Code review — Run /aif-review on the implementation
4. Both — Run security check, then code review
5. Skip — Proceed to commit
```

**If fix issues selected** → suggest invoking `/aif-fix <issue summary>`
**If security check selected** → suggest invoking `/aif-security-checklist`
**If code review selected** → suggest invoking `/aif-review`
**If both** → suggest security first, then review
**If skip** → suggest `/aif-commit`

### Context Cleanup

Suggest the user to free up context space if needed: `/clear` (full reset) or `/compact` (compress history).

---

## Strict Mode

When invoked with `--strict`:

```
/aif-verify --strict
```

- **All tasks must be COMPLETE** — no partial or skipped allowed
- **Build must pass** — fail verification if build fails
- **Tests must pass** — fail verification if any test fails (tests are required in strict mode)
- **Lint must pass** — zero warnings, zero errors
- **No unfinished task markers** in changed files
- **No undocumented environment variables**
- **Architecture gate must pass** — fail on clear boundary/dependency violations
- **Rules gate must pass** — fail on clear rule violations
- **Roadmap gate must pass** — fail on clear roadmap mismatch
- Missing milestone linkage for `feat`/`fix`/`perf` is a warning even in strict mode
- Do not fail strict verification solely because milestone linkage is missing

Strict mode is recommended before merging to the configured base branch or creating a pull request.

---

## Usage

### After implement (suggested automatically)
```
/aif-verify
```

### Strict mode before merge
```
/aif-verify --strict
```

### Standalone (no plan, verify branch diff)
```
/aif-verify
→ No plan found → verify branch diff against the configured base branch
```
