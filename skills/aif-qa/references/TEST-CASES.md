# Reference: Test Cases (test-cases)

> **When to use:** When invoked with the `test-cases` argument (or as the third stage of `--all`).

---

## Step 1: Verify Previous Stage Artifacts

Use the `resolved_branch`, `artifact_dir`, `ui_language`, `artifact_language`, and `technical_terms_policy` resolved in SKILL.md Step 0 and Step 0.2.

Check for both files:

- `<artifact_dir>/change-summary.md`
- `<artifact_dir>/test-plan.md`

**If `change-summary.md` is NOT found — STOP:**

Use AskUserQuestion in `ui_language`.
Meaning: explain that the `change-summary.md` artifact was not found and test cases cannot be written without it.
Options meaning:
1. Run change summary first with `/aif-qa change-summary <resolved_branch>`
2. Cancel

**If `test-plan.md` is NOT found — STOP:**

Use AskUserQuestion in `ui_language`.
Meaning: explain that the `test-plan.md` artifact was not found and test cases cannot be written without it.
Options meaning:
1. Create the test plan first with `/aif-qa test-plan <resolved_branch>`
2. Cancel

Do not continue until both artifacts are present.

**If both files are found** — read them and use as the basis. Proceed to Step 2.

---

## Step 2: Determine What to Test

Prioritize:

1. Core business logic of the changes
2. Edge cases and non-standard inputs
3. Negative scenarios (errors, invalid data)
4. Regression checks on adjacent functionality

Use the evidence and assumptions from `change-summary.md` and `test-plan.md` to keep test cases grounded.

## Step 3: Coverage Strategy

For each changed area, write test cases grouped as follows:

**Positive scenarios (Happy path):**

- Standard usage with valid data
- Main user scenarios
- Different variants of valid inputs

**Negative scenarios:**

- Invalid or incorrect input data
- Missing required fields or parameters
- Business rule violations and constraint breaches
- Unavailable dependencies (if applicable)

**Edge cases:**

- Minimum and maximum values
- Empty strings, zero values, null/undefined
- Very long strings or large data volumes
- Special characters and different encodings
- Concurrent requests (if applicable)

**Regression checks:**

- Adjacent functionality that might have broken
- Integrations with other system components

Render these group headings and descriptions in `artifact_language` in the saved artifact.

## Step 4: Write Test Cases

Use the canonical English template `templates/TEST-CASES.md` as the structure source. If `artifact_language` is not `en`, translate all human-readable headings, labels, placeholders, enum labels, priority labels, test names, steps, expected results, and explanatory text into `artifact_language` before saving.

Write test cases following these rules:

- Fill in all placeholders with actual data for the current change.
- Optional fields in the template may be omitted when not applicable.
- Negative tests are optional but recommended.
- High-priority tests are mandatory.
- Test case IDs such as `TC-001` stay unchanged across languages.
- Human-readable titles, preconditions, steps, expected results, priorities, and test data notes must be written in `artifact_language`.
- Technical identifiers, code names, branch names, API names, CLI commands, file paths, config keys, and raw error messages may remain unchanged.

Apply `technical_terms_policy` from SKILL.md.

## Step 5: Save Artifact

Before saving:
- Verify that the document is written in `artifact_language`.
- If most headings or body text are in another language, rewrite it before saving.
- For `artifact_language = ru`, human-readable prose, headings, priorities, test names, preconditions, steps, expected results, and test data explanations must be in Russian.
- Technical identifiers, code names, branch names, API names, CLI commands, file paths, config keys, and raw error messages may remain unchanged.

Save the result to `<artifact_dir>/test-cases.md`.

## Step 6: Context Cleanup

After saving, offer to free up context.

Use AskUserQuestion in `ui_language`.
Meaning: tell the user that test cases were saved and ask whether to clear, compact, or continue.
Options meaning:
1. `/clear` — full reset (recommended)
2. `/compact` — compress history
3. Continue as-is
