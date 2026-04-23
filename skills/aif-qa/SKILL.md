---
name: aif-qa
description: QA workflow for testing a feature or task implementation. Analyzes changes, produces test plans, and describes concrete test scenarios. Use when user says "test this", "write test plan", "what should I test", or "QA this branch".
argument-hint: "[--all] [change-summary | test-plan | test-cases] [<branch>]"
allowed-tools: Read Write Grep Glob Bash(git *) Bash(mkdir *) AskUserQuestion Task
disable-model-invocation: false
---

# QA — Implementation Testing

Generates change summaries, produces test plans, and describes test scenarios for a feature or task implementation.

## Modes

The skill operates in three sequential modes.

| Argument         | Mode           | What you do                                                      |
|------------------|----------------|------------------------------------------------------------------|
| `change-summary` | Change summary | Analyze what changed, assess risks, produce a summary            |
| `test-plan`      | Test plan      | Create a structured test plan based on the change summary        |
| `test-cases`     | Test cases     | Describe concrete test scenarios based on the plan               |
| `--all`          | Full pipeline  | Run all three modes in sequence without prompting between stages |

---

## Workflow

### Step 0: Load Config

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:
- **Paths:** `paths.description`, `paths.architecture`, `paths.qa` (default: `.ai-factory/qa`)
- **Language:** `language.ui` for prompts
- **Git:** `git.base_branch` for branch comparison

If config.yaml doesn't exist, use defaults:
- DESCRIPTION.md: `.ai-factory/DESCRIPTION.md`
- ARCHITECTURE.md: `.ai-factory/ARCHITECTURE.md`
- QA artifacts: `.ai-factory/qa/`
- Language: `en` (English)
- Git base branch: `main`

### Step 0.1: Load Project Context

**Read** the resolved description path if the file exists, to understand:
- Tech stack (language, framework, database, ORM)
- Project architecture and coding conventions
- Non-functional requirements

**Read** the resolved architecture path if the file exists, to understand:
- Chosen architecture pattern
- Folder structure conventions
- Layer/module boundaries and dependency rules

Use this context when generating summaries, test plans, and test cases.

**Read `.ai-factory/skill-context/aif-qa/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**
- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins**
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context

### Step 0.2: Parse Arguments and Resolve Branch

Parse `$ARGUMENTS` fully before doing anything else:

1. **Detect `--all` flag** — if present, set `all_mode = true` and remove the flag from arguments
2. **Detect mode** — first word matching `change-summary`, `test-plan`, or `test-cases`; remove it from arguments
3. **Detect branch** — remaining text (if any) is the target branch name

**Resolve the working branch:**

```text
If branch was provided in arguments → use it as the resolved branch
Otherwise → run: git branch --show-current
```

Store both values for use in all reference files:
- `resolved_branch` — the branch being analyzed (used to locate/save artifacts)
- `artifact_dir` — `<resolved paths.qa>/<branch-slug>`, where `branch-slug` is a deterministic, filesystem-safe, collision-resistant slug derived from `resolved_branch`. Compute it in three steps:
  1. **Safe slug.** Take `resolved_branch` and replace every character that is not in `[A-Za-z0-9._-]` with `-`, collapse runs of consecutive `-` into a single `-`, and trim leading/trailing `-`. If the result is empty, use `branch`. Optionally truncate to 40 characters. Call this `safe_slug`.
  2. **Hash suffix.** Run `git hash-object --stdin <<< "<resolved_branch>"` and take the **first 8 hex characters** of the output. Call this `hash8`. The hash is derived from the **original, unnormalized** branch name so branches that collapse to the same `safe_slug` still produce different derived slugs in normal use.
  3. **Combine:** `branch-slug = "<safe_slug>-<hash8>"`.

  **Why the hash:** a readable slug alone is lossy — `feature/foo` and `feature-foo` normalize to the same `safe_slug` and would overwrite each other's artifacts. Appending a short hash of the full original name keeps the derived slug stable, readable, and collision-resistant for practical branch naming.

  **Examples:**
  - `feature/foo` → `safe_slug=feature-foo`, `hash8=a72ccce7` → `feature-foo-a72ccce7`
  - `feature-foo` → `safe_slug=feature-foo`, `hash8=6f80dfc6` → `feature-foo-6f80dfc6`
  - `main` → `safe_slug=main`, `hash8=<computed>` → `main-<hash8>`
- `all_mode` — whether to skip inter-stage prompts

**If no mode was provided and `all_mode = false` — ask the user:**

```text
AskUserQuestion: Which QA mode would you like to run?

Options:
1. Change summary (change-summary) — analyze what changed, assess risks, produce a summary
2. Test plan (test-plan) — create a structured test plan based on the change summary
3. Test cases (test-cases) — describe concrete test scenarios based on the plan
4. Full pipeline (--all) — run all three modes in sequence
```

### Step 1: Execute the Selected Mode

The skill runs **strictly sequentially** — each stage uses the artifact from the previous one:

```text
change-summary → test-plan → test-cases
```

Read the detailed instructions for the selected mode:

#### Change Summary (change-summary)

Read `references/CHANGE-SUMMARY.md`

#### Test Plan (test-plan)

Read `references/TEST-PLAN.md`

#### Test Cases (test-cases)

Read `references/TEST-CASES.md`

#### Full Pipeline (--all)

Run all three modes in sequence. After each stage completes successfully,
proceed to the next automatically — **do NOT show the inter-stage `AskUserQuestion`**.

```text
1. Execute change-summary (references/CHANGE-SUMMARY.md) → save artifact
2. Execute test-plan      (references/TEST-PLAN.md)      → save artifact
3. Execute test-cases     (references/TEST-CASES.md)     → save artifact
4. Show context cleanup prompt (Step 6 of TEST-CASES.md)
```

If any stage fails (e.g. git error, diff too large and user cancels) — stop the pipeline and report which stage failed.

---

## Principles

### DO:

- Understand the subject before writing test plans and test cases (analyze changes / test plan / merge request / task / text description)
- Use the repository code only to the extent needed for the change analysis, test plan, and test cases
- Write steps clearly enough that any tester can execute the test without knowledge of the codebase
- Specify concrete test data, not abstract "enter valid data"
- Prioritize — not everything is equally important
- Think about adjacent systems, integrations, and dependencies
- Include negative scenarios and edge cases — they catch most bugs
- Ask clarifying questions when business logic is not obvious from the code

### DO NOT:

- Suggest automated tests or mention testing frameworks
- Make assumptions about business logic without reading the code
- Skip negative scenarios
- Write test cases for everything — focus on risky areas
- Ignore data edge cases

---

## Priority Reference

| Priority | When to use                                                                     |
|----------|---------------------------------------------------------------------------------|
| High     | Core business logic, user data, payments, security, authorization               |
| Medium   | Supporting functionality, UI/UX, reports, integrations                          |
| Low      | Cosmetic changes, rare scenarios, nice-to-have                                  |

## Artifact Ownership and Config Policy

- Primary ownership: QA artifacts under `<paths.qa>/<branch-slug>/` — specifically `change-summary.md`, `test-plan.md`, and `test-cases.md`. The `--all` flag respects the same boundary.
- Write policy: persistent writes are limited to the three owned artifacts above; no other files are created or modified.
- Config policy: config-aware, read-only. Reads `paths.description`, `paths.architecture`, `paths.qa`, `language.ui`, and `git.base_branch`; never writes `config.yaml`.

## Critical Rules

1. MUST NOT create a `test-plan` without a `change-summary` artifact
2. MUST NOT create `test-cases` without a `test-plan` artifact
3. MUST NOT skip stages
