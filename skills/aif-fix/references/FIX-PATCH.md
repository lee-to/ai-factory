### Step 6: Create Self-Improvement Patch

**Read this reference only after a completed fix when the resolved patch policy is enabled.** Create a learning patch to build a knowledge base for future fixes. When disabled, skip this step without creating the patches directory or modifying existing patches.

**Create the patch:**

1. Create directory if it doesn't exist:

   ```bash
   mkdir -p <resolved patches dir>
   ```

2. Create a patch file with the current timestamp as filename.
   **Format:** `YYYY-MM-DD-HH.mm.md` (e.g., `2026-02-07-14.30.md`)

3. Use this template:

Write the patch artifact in `artifact_language`. The template below is the required structure only; translate human-readable headings, labels, root-cause text, solution text, and prevention text before saving when `artifact_language` is not `en`, while preserving stable technical tokens from Step 0.

```markdown
# [Brief title describing the fix]

**Date:** YYYY-MM-DD HH:mm
**Files:** list of modified files
**Severity:** low | medium | high | critical

## Problem

What was broken. How it manifested (error message, wrong behavior).
Be specific — include the actual error or symptom.

## Root Cause

WHY the problem occurred. This is the most valuable part.
Not "what was wrong" but "why it was wrong":

- Logic error? Why was the logic incorrect?
- Missing check? Why was it missing?
- Wrong assumption? What was assumed?
- Race condition? What sequence caused it?

## Solution

How the fix was implemented. Key code changes and reasoning.
Include the approach, not just "changed line X".

## Prevention

How to prevent this class of problems in the future:

- What pattern/practice should be followed?
- What should be checked during code review?
- What test would catch this?

## Tags

Space-separated tags for categorization, e.g.:
`#null-check` `#async` `#validation` `#typescript` `#api` `#database`
```

For a worked patch example only when needed, read `references/FIX-EXAMPLES.md`.

Patch creation is required when the resolved policy is enabled (the default). Plan-first, failed, and blocked runs do not create completed-fix patches.
