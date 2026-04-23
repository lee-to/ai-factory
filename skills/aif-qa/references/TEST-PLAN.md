# Reference: Test Plan (test-plan)

> **When to use:** When invoked with the `test-plan` argument (or as the second stage of `--all`).

---

## Step 1: Verify Previous Stage Artifact

Use the `resolved_branch` and `artifact_dir` resolved in SKILL.md Step 0.2.

Check for the file `<artifact_dir>/change-summary.md`.

**If the file is NOT found — STOP:**

```
AskUserQuestion: The change-summary artifact was not found. A test plan cannot be created without a change summary.

Options:
1. Run change summary first — /aif-qa change-summary <resolved_branch>
2. Cancel
```

→ Do not continue until the artifact is created.

**If the file is found** — read `<artifact_dir>/change-summary.md` and use it as the basis for the test plan. Proceed to Step 2.

---

## Step 2: Clarify Context

Ask the user only if something is not obvious from the code and change-summary:

- What feature or fix was implemented?
- Are there existing test cases for this area?
- What environment is available for testing?
- Are there constraints or dependencies to account for?

**Skip this step when `all_mode = true`** — proceed with what is available from the change-summary and codebase context.

## Step 3: Define Test Scope

Based on the change analysis, determine:

**In Scope** — what we test:

- Directly changed functionality
- Adjacent components with high regression risk
- Integration points affected by the changes

**Out of Scope** — what we don't test:

- Unrelated functionality
- Components without changes and without dependencies on changed ones

## Step 4: Define Test Types

| Type              | Priority   | When to apply                                            |
|-------------------|------------|----------------------------------------------------------|
| Functional        | 🔴 High    | Always — verify core logic of the changes                |
| Regression        | 🟡 Medium  | Adjacent functionality, potential breakage               |
| Edge cases        | 🟡 Medium  | Non-standard inputs, boundary data                       |
| Negative          | 🟡 Medium  | Invalid data, errors, service failures                   |
| Security          | 🔴 High    | When authorization or user data is affected              |
| Performance       | 🟢 Low     | When queries, algorithms, or caching were changed        |

## Step 5: Build the Verification Checklist

Describe checks as a checklist with priority labels (high / medium / low).

## Step 6: Generate the Test Plan

Use the template from `templates/TEST-PLAN.md`.

## Step 7: Save Artifact

Save the result to `<artifact_dir>/test-plan.md`.

## Step 8: Next Step

**If `all_mode = true`** — do NOT show the prompt. Proceed directly to `references/TEST-CASES.md`.

**Otherwise:**

```
AskUserQuestion: Test plan saved. Proceed to writing test cases?

Options:
1. Yes — run /aif-qa test-cases <resolved_branch>
2. No — stop here
```
