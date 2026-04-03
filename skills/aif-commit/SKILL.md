---
name: aif-commit
description: Create conventional commit messages by analyzing staged changes. Generates semantic commit messages following the Conventional Commits specification. Use when user says "commit", "save changes", or "create commit".
argument-hint: "[scope or context]"
allowed-tools: Read Bash(git *) AskUserQuestion Questions
disable-model-invocation: false
---

# Conventional Commit Generator

Generate commit messages following the [Conventional Commits](https://www.conventionalcommits.org/) specification.

## Workflow

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:
- **Paths:** `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, and `paths.rules`
- **Language:** `language.ui` for prompts and commit message conventions
- **Git preference:** `git.skip_push_after_commit` for post-commit push behavior
- **Rules hierarchy:** `rules.base` plus any named `rules.<area>` entries

If config.yaml doesn't exist, use defaults:
- Paths: `.ai-factory/` for all artifacts
- Language: `en` (English)
- Git preference: `skip_push_after_commit: false`

**Read `.ai-factory/skill-context/aif-commit/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**
- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including the commit
  message format and conventions. If a skill-context rule says "commits MUST follow format X"
  or "message MUST include Y" — you MUST comply. Generating a commit message that violates
  skill-context rules is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

1. **Analyze Changes**
   - Run `git status` to see staged files
   - Run `git diff --cached` to see staged changes
   - If nothing staged, show warning and suggest staging

2. **Run Context Gates (Read-Only)**
   - Check the resolved architecture and description artifacts (use paths from config) to catch obvious scope/boundary drift
   - Check the resolved RULES.md and roadmap artifacts (use paths from config) to catch rule and milestone alignment issues
   - Check rules hierarchy (resolved `paths.rules_file` + `rules.base` + named `rules.<area>`) for commit conventions
   - Missing optional files (`ROADMAP.md`, `RULES.md`) are `WARN`, not blockers
   - Never modify context artifacts from this command

3. **Determine Commit Type**
   - `feat`: New feature
   - `fix`: Bug fix
   - `docs`: Documentation only
   - `style`: Code style (formatting, semicolons)
   - `refactor`: Code change that neither fixes a bug nor adds a feature
   - `perf`: Performance improvement
   - `test`: Adding or modifying tests
   - `build`: Build system or dependencies
   - `ci`: CI configuration
   - `chore`: Maintenance tasks

4. **Identify Scope**
   - From file paths (e.g., `src/auth/` → `auth`)
   - From argument if provided
   - Optional - omit if changes span multiple areas

5. **Generate Message**
   - Keep subject line under 72 characters
   - Use imperative mood ("add" not "added")
   - Don't capitalize first letter after type
   - No period at end of subject

## Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

## Examples

**Simple feature:**
```
feat(auth): add password reset functionality
```

**Bug fix with body:**
```
fix(api): handle null response from payment gateway

The payment API can return null when the gateway times out.
Added null check and retry logic.

Fixes #123
```

**Breaking change:**
```
feat(api)!: change response format for user endpoint

BREAKING CHANGE: user endpoint now returns nested profile object
```

## Behavior

When invoked:

1. Check for staged changes
2. Analyze the diff content
3. Run read-only context gates and summarize findings as `WARN`/`ERROR`
4. If commit type is `feat`/`fix`/`perf` and roadmap exists, check milestone linkage; if missing, warn and suggest adding linkage in commit body/footer
5. Propose a commit message
6. Confirm with the user before committing:

   ```
   AskUserQuestion: Proposed commit message:

   <type>(<scope>): <subject>

   Options:
   1. Commit as is
   2. Edit message
   3. Cancel
   ```

7. Handle user response:
   - **Commit as is** → proceed to step 8
   - **Edit message** → ask the user for the corrected message via `AskUserQuestion`, then return to step 6 with the new message
   - **Cancel** → stop, do NOT commit. End the workflow

8. Execute `git commit` with the confirmed message
9. Post-commit push handling:
   - If `git.skip_push_after_commit = true` in resolved config:
     - Skip push prompt entirely
     - End workflow after successful local commit
   - Otherwise (default behavior), offer to push:
     - Show branch/ahead status: `git status -sb`
     - If the branch has no upstream, use: `git push -u origin <branch>`
     - Otherwise: `git push`

     ```
     AskUserQuestion: Push to remote?

     Options:
     1. Push now
     2. Skip push
     ```

     - **Push now** → execute push command based on upstream status:
       - if branch has no upstream → `git push -u origin <branch>`
       - otherwise → `git push`
     - **Skip push** → end the workflow

If argument provided (e.g., `/aif-commit auth`):
- Use it as the scope
- Or as context for the commit message

## Important

- Never commit secrets or credentials
- Review large diffs carefully before committing
- `/aif-commit` has no implicit strict mode — context gates are warning-first unless user explicitly requests blocking behavior
- Treat the resolved architecture, roadmap, RULES.md, and description artifacts as read-only context in this command
- If staged changes contain unrelated work (e.g., a feature + a bugfix, or changes to independent modules), suggest splitting into separate commits:
  1. Show which files/hunks belong to which commit
  2. Confirm split plan with the user:

     ```
     AskUserQuestion: Split into separate commits?

     Options:
     1. Yes, split as suggested
     2. No, commit everything together
     3. Let me adjust the grouping
     ```

  3. Handle user response:
     - **Yes, split as suggested** → proceed to step 4
     - **No, commit everything together** → proceed to step 5 (propose single commit message)
     - **Let me adjust the grouping** → ask the user for the adjusted grouping via `AskUserQuestion`, then return to step 2 with the new plan
  4. Unstage all: `git reset HEAD`
  5. Stage and commit each group separately using `git add <files>` + `git commit`
  6. Offer to push only after all commits are done
- NEVER add `Co-Authored-By` or any other trailer attributing authorship to the AI. Commits must not contain AI co-author lines
