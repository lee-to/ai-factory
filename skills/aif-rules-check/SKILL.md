---
name: aif-rules-check
description: Run a standalone read-only rules compliance gate against changed files or a git ref. Use when you need a dedicated project-rules check without a full review or verify pass.
argument-hint: "[git ref | empty]"
allowed-tools: Read Glob Grep Bash(git *) AskUserQuestion
disable-model-invocation: false
metadata:
  author: AI Factory
  version: "1.0"
  category: quality
---

# Rules Compliance Gate

Run a standalone read-only rules gate for project rules. This command checks rule compliance only; it does not replace `/aif-review` or `/aif-verify`.

## Step 0: Load Contract

- Read `references/RULES-CHECK-CONTRACT.md` first.
- Treat it as the canonical source for verdict semantics and report structure.
- If examples in this file drift from the reference, follow the reference.

## Step 1: Load Config

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:
- `paths.rules_file`
- `paths.rules`
- `paths.plan`
- `paths.plans`
- `language.ui`
- `git.enabled`
- `git.base_branch`
- `rules.base`
- named `rules.<area>` entries

If config is missing or partial, use defaults:
- `paths.rules_file`: `.ai-factory/RULES.md`
- `paths.rules`: `.ai-factory/rules/`
- `paths.plan`: `.ai-factory/PLAN.md`
- `paths.plans`: `.ai-factory/plans/`
- `git.enabled`: `true`
- `git.base_branch`: detect the repo default branch from git metadata; fall back to `main` only when detection is unavailable
- `rules.base`: `.ai-factory/rules/base.md`

If `paths.rules_file` is missing from config, default to `.ai-factory/RULES.md` instead of treating config as incomplete.
If `git.base_branch` is missing from config, resolve the repository default branch from git metadata when possible; use `main` only as the final fallback.

### Step 1.1: Load Skill Context

**Read `.ai-factory/skill-context/aif-rules-check/SKILL.md`** - MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**
- Treat them as project-level overrides for this skill's general instructions.
- When a skill-context rule conflicts with a general rule in this file, the skill-context rule wins.
- When there is no conflict, apply both.
- Skill-context rules apply to all outputs of this skill, including verdict wording and report structure.

**Enforcement:** Before presenting the final report, verify it against all skill-context rules and fix any drift.

## Step 2: Resolve Inputs

Resolve two inputs before checking any rule:

1. **Changed scope** - the diff and file list you are evaluating
2. **Resolved rule sources** - the rule artifacts that may apply to that scope

### Step 2.1: Resolve Changed Scope

**If the user provided a git ref:**

1. Validate it first:
   ```bash
   git rev-parse --verify <argument>
   ```
2. If valid, use:
   ```bash
   git diff --name-only <argument>...HEAD
   git diff <argument>...HEAD
   ```
3. If invalid, ask:

   ```
   AskUserQuestion: `<argument>` is not a valid git ref. What should I check instead?

   Options:
   1. Check staged / working-tree changes
   2. Cancel
   ```

**Without arguments:**

1. Prefer staged work:
   ```bash
   git diff --cached --name-only
   git diff --cached
   ```
2. If nothing is staged, fall back to working tree:
   ```bash
   git diff --name-only
   git diff
   ```
3. If there is still no local diff and `git.enabled = true`, fall back to branch diff:
   ```bash
   git diff --name-only <resolved-base-branch>...HEAD
   git diff <resolved-base-branch>...HEAD
   ```

If there are still no changed files, return `WARN` rather than a hard failure.

### Step 2.2: Resolve Rule Sources

Load rule sources in this order:

1. The resolved `paths.rules_file` artifact
2. The resolved `rules.base` file
3. Any named `rules.<area>` files from config that clearly match the changed scope

Area rules are optional and scoped:
- Use changed file paths, folder names, and optional plan context to judge relevance.
- If relevance is ambiguous, mention the rule source as uncertain and keep the outcome at `WARN`, not `FAIL`.

If no rules sources resolve, return `WARN` rather than a hard failure.

### Step 2.3: Optional Plan Context

Optional plan context: use the active plan file only when it helps interpret scope or area relevance; absence of a plan is never a failure.

Plan resolution order:
1. Branch-based `paths.plans/<current-branch>.md`
2. A single named full plan in `paths.plans`
3. The fast plan at `paths.plan`

Do not fail the rules check because a plan file is missing or ambiguous.

## Step 3: Evaluate Rules

Read the changed files from the resolved scope and compare them against the resolved rules.

Classification rules:
- `PASS` when at least one applicable rule was checked and no clear violations were found.
- `WARN` when no applicable rules were resolved, the evidence is ambiguous, or there are no changed files to evaluate.
- `FAIL` when an explicit hard rule is clearly violated by the inspected diff or changed files.

Only return `FAIL` when an explicit hard rule is clearly violated by the inspected diff or changed files.

Evidence rules:
- Tie every blocking violation to specific rule text and at least one concrete file/path or diff hunk.
- If a rule sounds like a preference, is too vague, or cannot be verified confidently from the diff, do not escalate it past `WARN`.
- Missing optional files or partially configured rules hierarchy are `WARN`, not `FAIL`.

## Step 4: Read-Only Boundary

This command is read-only: do not edit `RULES.md`, `rules/base.md`, `rules.<area>`, plan files, or source code.

If rules are missing, stale, or need refinement:
- Suggest `/aif-rules <rule text>` for axioms
- Suggest `/aif-rules area:<name>` for area-specific rules

## Step 5: Output

Use the exact verdict semantics and section order from `references/RULES-CHECK-CONTRACT.md`.

Required content:
- overall verdict
- files checked
- gate results
- blocking violations
- suggested fixes
- suggested rule updates

When useful, suggest the next best workflow:
- `/aif-review` for broader code review
- `/aif-verify` for full plan-completeness verification
- `/aif-rules` when the underlying rules need to be captured or corrected
