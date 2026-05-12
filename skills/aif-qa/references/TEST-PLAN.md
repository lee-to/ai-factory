# Reference: Test Plan (test-plan)

> **When to use:** When invoked with the `test-plan` argument (or as the second stage of `--all`).

---

## Step 1: Verify Previous Stage Artifact

Use the `resolved_branch`, `artifact_dir`, `ui_language`, `artifact_language`, and `technical_terms_policy` resolved in SKILL.md Step 0 and Step 0.2.

Check for the file `<artifact_dir>/change-summary.md`.

**If the file is NOT found — STOP:**

Use AskUserQuestion in `ui_language`.
Meaning: explain that the `change-summary.md` artifact was not found and a test plan cannot be created without it.
Options meaning:
1. Run change summary first with `/aif-qa change-summary <resolved_branch>`
2. Cancel

Do not continue until the artifact is created.

**If the file is found** — read `<artifact_dir>/change-summary.md` and use it as the basis for the test plan. Proceed to Step 2.

---

## Step 2: Clarify Context

Ask the user in `ui_language` only if something is not obvious from the code and change-summary:

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

Render these headings and descriptions in `artifact_language` in the saved artifact.

## Step 4: Define Test Types

Use functional, regression, edge-case, negative, security, and performance categories when relevant. Translate human-readable type labels and priority labels into `artifact_language`, unless `technical_terms_policy` indicates that the term should remain in English.

## Step 5: Build the Verification Checklist

Describe checks as a checklist with priority labels (high / medium / low). Write the checklist in `artifact_language`.

## Step 6: Generate the Test Plan

Use the canonical English template `templates/TEST-PLAN.md` as the structure source. If `artifact_language` is not `en`, translate all human-readable headings, labels, checklist items, placeholders, enum labels, priority labels, and explanatory text into `artifact_language` before saving.

The generated test plan must be written in `artifact_language`. Apply `technical_terms_policy` from SKILL.md. Keep file paths, commands, code identifiers, branch names, config keys, API names, package names, and raw error messages unchanged.

Use the change summary evidence when prioritizing checks. If a high-priority test is based on an assumption rather than observed code/diff evidence, mark that assumption explicitly.

## Step 7: Save Artifact

Before saving:
- Verify that the document is written in `artifact_language`.
- If most headings or body text are in another language, rewrite it before saving.
- For `artifact_language = ru`, human-readable prose, headings, risks, priorities, checklist items, and acceptance criteria must be in Russian.
- Technical identifiers, code names, branch names, API names, CLI commands, file paths, config keys, and raw error messages may remain unchanged.

Save the result to `<artifact_dir>/test-plan.md`.

## Step 8: Next Step

**If `all_mode = true`** — do NOT show the prompt. Proceed directly to `references/TEST-CASES.md`.

**Otherwise:**

Use AskUserQuestion in `ui_language`.
Meaning: tell the user that the test plan was saved and ask whether to proceed to writing test cases.
Options meaning:
1. Proceed by running `/aif-qa test-cases <resolved_branch>`
2. Stop here
