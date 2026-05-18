---
name: aif-commit
description: Create conventional commit messages by analyzing staged changes. Generates semantic commit messages following the Conventional Commits specification. Use when user says "commit", "save changes", or "create commit".
argument-hint: "[scope or context]"
allowed-tools: Read Glob Bash(git *) AskUserQuestion Questions
disable-model-invocation: false
---

# Conventional Commit Generator

Generate commit messages following the [Conventional Commits](https://www.conventionalcommits.org/) specification.

## Workflow

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:
- **Paths:** `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.rules`, `paths.plan`, and `paths.plans`
- **Language:** `language.ui` for prompts and commit message conventions
- **Workflow:** `workflow.plan_id_format` for read-only active plan discovery (`slug` default; `sequential` uses numbered full-plan lookup)
- **Git preference:** `git.enabled`, `git.create_branches`, and `git.skip_push_after_commit` for active plan discovery and post-commit push behavior
- **Rules hierarchy:** `rules.base` plus any named `rules.<area>` entries

If config.yaml doesn't exist, use defaults:
- Paths: `.ai-factory/` for context artifacts, `.ai-factory/PLAN.md` for `paths.plan`, `.ai-factory/plans/` for `paths.plans`
- Language: `en` (English)
- Workflow: `workflow.plan_id_format: slug`
- Git: `git.enabled: true`, `git.create_branches: true`
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

2. **Resolve Active Plan Context (Read-Only, Optional)**
   - Resolve active plan using this read-only priority:
     1. `@<plan-file>` argument, when the argument starts with `@`
     2. branch-based full plan in `paths.plans`
     3. single full plan in `paths.plans`
     4. fast plan at `paths.plan`
   - If the argument does not start with `@`, keep treating it as commit scope/context.
   - For branch-based full plan lookup:
     - get current branch with `git branch --show-current` when `git.enabled = true`
     - replace every `/` with `-` to get `<branch-stem>`
     - when `workflow.plan_id_format = sequential`, use `Glob` for `paths.plans/[0-9][0-9][0-9][0-9]_<branch-stem>.md` first
     - if multiple sequential matches exist, use the highest-numbered match and emit `WARN [aif-commit] multiple sequential plans for <branch>: <list>; using <chosen>`
     - if no sequential match exists, fall back to `paths.plans/<branch-stem>.md`
   - If git mode is off, branch lookup cannot resolve, or no branch-based plan exists, check whether `paths.plans` contains exactly one full-plan markdown file.
   - If no active plan resolves or the active plan has no `## Commit Plan`, keep current staged-diff behavior unchanged.
   - Never modify the active plan from this command.

3. **Use Commit Plan Grouping When Available**
   - If active plan contains `## Commit Plan`, parse:
     - commit group number/name
     - task range, such as `after tasks 1-3` or `tasks 4-6`
     - suggested conventional commit message
   - Read the plan's `## Tasks` or `## Implementation Tasks` section to map task ranges to task descriptions and any `Files:` hints.
   - Compare staged files/hunks with planned groups before changing staging:
     - use staged file paths from `git diff --cached --name-only`
     - use staged hunk evidence from `git diff --cached` when a file may span multiple groups
     - task ranges and `Files:` hints are guidance, not executable instructions
   - If files cannot be mapped to groups, stop and ask the user to adjust grouping.
   - Before using whole-file staging, compare grouped files with unstaged worktree paths from `git diff --name-only`.
   - Only use `git add <files>` when each planned group has a disjoint file set and no grouped file appears in `git diff --name-only`.
   - When one file spans multiple planned groups, use hunk-level staging (`git add -p` or `git apply --cached`) for each group.
   - If grouped files overlap unstaged worktree paths, preserve and apply the original cached patch per group (`git diff --cached` + `git apply --cached`), use hunk-level staging, or stop before changing staging.
   - If hunk-level staging cannot be applied confidently, stop before changing staging and ask the user to adjust grouping or commit everything together.
   - When a usable grouping exists, ask:

     ```
     AskUserQuestion: Active plan contains a Commit Plan. How should these staged changes be committed?

     Options:
     1. Follow Commit Plan
     2. Commit everything together
     3. Adjust grouping
     ```

   - **Follow Commit Plan** → confirm the planned groups and messages, then proceed through user-confirmed multi-commit staging/commit flow.
   - **Commit everything together** → ignore plan grouping for this run and continue with the current single-message flow.
   - **Adjust grouping** → ask the user for the adjusted grouping, then validate it against staged files before committing.

4. **Run Context Gates (Read-Only)**
   - Check the resolved architecture and description artifacts (use paths from config) to catch obvious scope/boundary drift
   - Check the resolved RULES.md and roadmap artifacts (use paths from config) to catch rule and milestone alignment issues
   - Check rules hierarchy (resolved `paths.rules_file` + `rules.base` + named `rules.<area>`) for commit conventions
   - Missing optional files (`ROADMAP.md`, `RULES.md`) are `WARN`, not blockers
   - Never modify context artifacts from this command
   - If the user wants a standalone rules-only pass, suggest `/aif-rules-check`; keep `/aif-commit` gate labels at `WARN` / `ERROR`

5. **Determine Commit Type**
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

6. **Identify Scope**
   - From file paths (e.g., `src/auth/` → `auth`)
   - From argument if provided
   - Optional - omit if changes span multiple areas

7. **Generate Message**
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
3. Resolve optional active plan context and use `## Commit Plan` grouping when available
4. Run read-only context gates and summarize findings as `WARN`/`ERROR`
5. If commit type is `feat`/`fix`/`perf` and roadmap exists, check milestone linkage; if missing, warn and suggest adding linkage in commit body/footer
6. Propose a commit message
7. Confirm with the user before committing:

   ```
   AskUserQuestion: Proposed commit message:

   <type>(<scope>): <subject>

   Options:
   1. Commit as is
   2. Edit message
   3. Cancel
   ```

8. Handle user response:
   - **Commit as is** → proceed to step 9
   - **Edit message** → ask the user for the corrected message via `AskUserQuestion`, then return to step 7 with the new message
   - **Cancel** → stop, do NOT commit. End the workflow

9. Execute `git commit` with the confirmed message
10. Post-commit push handling:
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
- Treat the resolved architecture, roadmap, RULES.md, description, and plan artifacts as read-only context in this command
- If no active plan resolves or the active plan has no `## Commit Plan`, keep current staged-diff behavior unchanged.
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
  4. Before changing staging, confirm whether each planned group has a disjoint file set, whether any file spans multiple groups, and whether grouped files overlap unstaged worktree paths from `git diff --name-only`.
  5. If every group has a disjoint file set and no grouped file appears in `git diff --name-only`, unstage all with `git reset HEAD`, then stage and commit each group separately using `git add <files>` + `git commit`.
  6. If grouped files overlap unstaged worktree paths, preserve each group's original cached patch before unstaging and re-apply only that patch with `git apply --cached`; otherwise use hunk-level staging or stop before changing staging.
  7. If one file spans multiple groups, use hunk-level staging for each group: stage only that group's hunks with `git add -p` or `git apply --cached`, commit, then repeat for the next group.
  8. If hunk-level staging or cached-patch application cannot be applied confidently, stop before changing staging and ask the user to adjust grouping or commit everything together.
  9. Offer to push only after all commits are done
- NEVER add `Co-Authored-By` or any other trailer attributing authorship to the AI. Commits must not contain AI co-author lines
