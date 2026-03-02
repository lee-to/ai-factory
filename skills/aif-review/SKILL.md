---
name: aif-review
description: Perform code review on staged changes or a pull request. Checks for bugs, security issues, performance problems, and best practices. Use when user says "review code", "check my code", "review PR", or "is this code okay".
argument-hint: "[PR number or empty]"
allowed-tools: Bash(git *) Bash(gh *) Read Glob Grep
disable-model-invocation: false
---

# Code Review Assistant

Perform thorough code reviews focusing on correctness, security, performance, and maintainability.

## Behavior

### Without Arguments (Review Staged Changes)

1. Run `git diff --cached` to get staged changes
2. If nothing staged, run `git diff` for unstaged changes
3. Analyze each file's changes

### With PR Number/URL

1. Use `gh pr view <number> --json` to get PR details
2. Use `gh pr diff <number>` to get the diff
3. Review all changes in the PR

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

## Integration

If GitHub MCP is configured, can:
- Post review comments directly to PR
- Request changes or approve
- Add labels based on review outcome

> **Tip:** Context is heavy after code review. Consider `/clear` or `/compact` before continuing with other tasks.
