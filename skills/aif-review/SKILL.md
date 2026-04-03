---
name: aif-review
description: Perform code review on staged changes or a pull request. Checks for bugs, security issues, performance problems, and best practices. Use when user says "review code", "check my code", "review PR", or "is this code okay".
argument-hint: "[PR number | branch/commit/tag | empty]"
allowed-tools: Bash(git *) Bash(gh *) Read Glob Grep AskUserQuestion
disable-model-invocation: false
---

# Code Review Assistant

Perform thorough code reviews focusing on correctness, security, performance, and maintainability.

## Step 0: Load Config

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:
- **Paths:** `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, and `paths.rules`
- **Language:** `language.ui` for review summary language
- **Git:** `git.base_branch` for branch comparison guidance

If config.yaml doesn't exist, use defaults:
- Paths: `.ai-factory/` for all artifacts
- Language: `en` (English)
- Git: `base_branch: main`

## Behavior

### Without Arguments (Review Staged Changes)

1. Run `git diff --cached` to get staged changes
2. If nothing staged, run `git diff` for unstaged changes
3. Analyze each file's changes

### With PR Number/URL

1. Use `gh pr view <number> --json` to get PR details
2. Use `gh pr diff <number>` to get the diff
3. Review all changes in the PR

### With Git Ref (Commits Mode)

Argument routing chain:
1. **Empty** → staged review (see above)
2. **Digits or `#N`** → PR mode (see above)
3. **Everything else** → validate via `git rev-parse --verify` → commits mode or ask user

Validation:
```bash
git rev-parse --verify <argument> 2>/dev/null
```

- **Valid ref** → enter commits mode (steps below)
- **Invalid ref** → do NOT fall back to staged review silently. Ask the user to clarify:

  ```
  AskUserQuestion: `<argument>` is not a valid git ref. What did you mean?

  Options:
  1. Review staged changes instead
  2. Cancel
  ```

  **Based on choice:**
  - "Review staged changes" → run staged review (default mode)
  - "Cancel" → inform the user that review was cancelled → **STOP**
  - "Other" → user provides corrected ref → re-validate via `rev-parse`

> Edge case: a branch with a purely numeric name (e.g. `123`) will be interpreted as a PR number — acceptable compromise.

**Steps:**

1. **Get commit list** between the ref and HEAD:
   ```bash
   git log --oneline --reverse <ref>..HEAD
   ```
   If no commits found (HEAD is at or behind `<ref>`), inform the user and **stop**.

2. **Check commit count:**
   If more than 20 commits, ask the user before proceeding:

   ```
   AskUserQuestion: Found <N> commits to review. Reviewing all of them will be slow and consume significant context. How to proceed?

   Options:
   1. Review all <N> commits
   2. Review only the last 20
   3. Cancel
   ```

   **Based on choice:**
   - "Review all" → continue with the full commit list
   - "Review only the last 20" → truncate the list to the 20 most recent commits (keep chronological order)
   - "Cancel" → inform the user that review was cancelled → **STOP**

3. **Review each commit:**
   ```bash
   git show <commit-hash> --stat
   git show <commit-hash>
   ```
   For each commit check:
   - Does the commit message match the actual changes?
   - Are changes atomic (single logical unit per commit)?
   - Are there any issues introduced in this specific commit?

4. **Provide combined summary** with per-commit notes

## Context Gates (Read-Only)

Before finalizing review findings, run read-only context gates:

- Check the resolved architecture artifact (if present) for boundary/dependency alignment issues.
- Check the resolved RULES.md artifact (if present) for explicit convention violations.
- Check the resolved roadmap artifact (if present) for milestone alignment and mention missing linkage for likely `feat`/`fix`/`perf` work.

Gate result severity:
- `WARN` for non-blocking inconsistencies or missing optional files.
- `ERROR` only for explicit blocking criteria requested by the user/review policy.

`/aif-review` is read-only for context artifacts by default. Do not modify context files unless user explicitly asks.

### Project Context

**Read `.ai-factory/skill-context/aif-review/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**
- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including the review
  summary format and the checklist criteria. If a skill-context rule says "review MUST check X"
  or "summary MUST include section Y" — you MUST augment the output accordingly. Producing a
  review that ignores skill-context rules is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

## Review Checklist

### Correctness
- [ ] Logic errors or bugs
- [ ] Edge cases handling
- [ ] Null/undefined checks
- [ ] Error handling completeness
- [ ] Type safety (if applicable)

### Security
- [ ] SQL injection vulnerabilities
- [ ] XSS vulnerabilities
- [ ] Command injection
- [ ] Sensitive data exposure
- [ ] Authentication/authorization issues
- [ ] CSRF protection
- [ ] Input validation

### Performance
- [ ] N+1 query problems
- [ ] Unnecessary re-renders (React)
- [ ] Memory leaks
- [ ] Inefficient algorithms
- [ ] Missing indexes (database)
- [ ] Large payload sizes

### Best Practices
- [ ] Code duplication
- [ ] Dead code
- [ ] Magic numbers/strings
- [ ] Proper naming conventions
- [ ] SOLID principles
- [ ] DRY principle

### Testing
- [ ] Test coverage for new code
- [ ] Edge cases tested
- [ ] Mocking appropriateness

## Output Format

```markdown
## Code Review Summary

**Files Reviewed:** [count]
**Risk Level:** 🟢 Low / 🟡 Medium / 🔴 High

### Context Gates
[Architecture / Rules / Roadmap gate results with WARN/ERROR labels]

### Critical Issues
[Must be fixed before merge]

### Suggestions
[Nice to have improvements]

### Questions
[Clarifications needed]

### Positive Notes
[Good patterns observed]
```

## Review Style

- Be constructive, not critical
- Explain the "why" behind suggestions
- Provide code examples when helpful
- Acknowledge good code
- Prioritize feedback by importance
- Ask questions instead of making assumptions

## Examples

**User:** `/aif-review`
Review staged changes in current repository.

**User:** `/aif-review 123`
Review PR #123 using GitHub CLI.

**User:** `/aif-review https://github.com/org/repo/pull/123`
Review PR from URL.

**User:** `/aif-review 2.x`
Review all commits on the current branch compared to branch `2.x`.

**User:** `/aif-review main`
Review all commits on the current branch compared to `main` (or to whatever branch is configured as `git.base_branch` in this repository).

**User:** `/aif-review v1.0.0`
Review all commits on the current branch compared to tag `v1.0.0`.

## Integration

If GitHub MCP is configured, can:
- Post review comments directly to PR
- Request changes or approve
- Add labels based on review outcome

> **Tip:** Context is heavy after code review. Consider `/clear` or `/compact` before continuing with other tasks.
