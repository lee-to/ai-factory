# Reference: Test Cases (test-cases)

> **When to use:** When invoked with the `test-cases` argument (or as the third stage of `--all`).

---

## Step 1: Verify Previous Stage Artifacts

Use the `resolved_branch` and `artifact_dir` resolved in SKILL.md Step 0.2.

Check for both files:

- `<artifact_dir>/change-summary.md`
- `<artifact_dir>/test-plan.md`

**If `change-summary.md` is NOT found — STOP:**

```
AskUserQuestion: The change-summary artifact was not found. Test cases cannot be written without a change summary.

Options:
1. Run change summary first — /aif-qa change-summary <resolved_branch>
2. Cancel
```

**If `test-plan.md` is NOT found — STOP:**

```
AskUserQuestion: The test-plan artifact was not found. Test cases cannot be written without a test plan.

Options:
1. Create test plan first — /aif-qa test-plan <resolved_branch>
2. Cancel
```

→ Do not continue until both artifacts are present.

**If both files are found** — read them and use as the basis. Proceed to Step 2.

---

## Step 2: Determine What to Test

**Prioritize:**

1. Core business logic of the changes
2. Edge cases and non-standard inputs
3. Negative scenarios (errors, invalid data)
4. Regression checks on adjacent functionality

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

## Step 4: Write Test Cases

Write test cases following these rules:

- Use the test case and test data templates from `templates/TEST-CASES.md`
- Fill in all `[...]` placeholders with the actual data for your test cases
- Optional fields in the template may be omitted when not applicable
- Negative tests are optional but recommended
- High-priority tests are mandatory

## Step 5: Save Artifact

Save the result to `<artifact_dir>/test-cases.md`.

## Step 6: Context Cleanup

After saving, offer to free up context:

```
AskUserQuestion: Test cases saved. Free up context?

Options:
1. /clear — Full reset (recommended)
2. /compact — Compress history
3. Continue as-is
```
