---
name: aif-fix
description: Fix a specific bug or problem in the codebase. Supports two modes - immediate fix or plan-first. Without arguments executes existing FIX_PLAN.md. Always suggests test coverage and adds logging. Use when user says "fix bug", "debug this", "something is broken", or pastes an error message.
argument-hint: <bug description or error message>
allowed-tools: Read Write Edit Glob Grep Bash AskUserQuestion Questions Task
disable-model-invocation: false
---

# Fix - Bug Fix Workflow

Fix a specific bug or problem in the codebase. Supports two modes: immediate fix or plan-first approach.

## Workflow

### Step 0: Check for Existing Fix Plan

**BEFORE anything else**, check if `.ai-factory/FIX_PLAN.md` exists.

**If the file EXISTS:**
- Read `.ai-factory/FIX_PLAN.md`
- Inform the user: "Found existing fix plan. Executing fix based on the plan."
- **Skip Steps 0.1 through 1** — go directly to **Step 2: Investigate the Codebase**, using the plan as your guide
- Follow each step of the plan sequentially
- After the fix is fully applied and verified, **delete** `.ai-factory/FIX_PLAN.md`:
  ```bash
  rm .ai-factory/FIX_PLAN.md
  ```
- Continue to Step 4 (Verify), Step 5 (Test suggestion), Step 6 (Patch)

**If the file DOES NOT exist AND `$ARGUMENTS` is empty:**
- Tell the user: "No fix plan found and no problem description provided. Please either provide a bug description (`/aif-fix <description>`) or create a fix plan first."
- **STOP.**

**If the file DOES NOT exist AND `$ARGUMENTS` is provided:**
- Continue to Step 0.1 below.

### Step 0.1: Load Project Context & Past Experience

**Read `.ai-factory/DESCRIPTION.md`** if it exists to understand:
- Tech stack (language, framework, database)
- Project architecture
- Coding conventions

**Read all patches from `.ai-factory/patches/`** if the directory exists:
- Use `Glob` to find all `*.md` files in `.ai-factory/patches/`
- Read each patch file to learn from past fixes
- Pay attention to recurring patterns, root causes, and solutions
- If the current problem resembles a past patch — apply the same approach or avoid the same mistakes
- This is your accumulated experience. Use it.

### Step 1: Understand the Problem & Choose Mode

From `$ARGUMENTS`, identify:
- Error message or unexpected behavior
- Where it occurs (file, function, endpoint)
- Steps to reproduce (if provided)

If unclear, ask:
```
To fix this effectively, I need more context:

1. What is the expected behavior?
2. What actually happens?
3. Can you share the error message/stack trace?
4. When did this start happening?
```

**After understanding the problem, ask the user to choose a mode using `AskUserQuestion`:**

Question: "How would you like to proceed with the fix?"

Options:
1. **Fix now** — Investigate and apply the fix immediately
2. **Plan first** — Create a fix plan for review, then fix later

**If user chooses "Plan first":**
- Proceed to **Step 1.1: Create Fix Plan**

**If user chooses "Fix now":**
- Skip Step 1.1, proceed directly to **Step 2: Investigate the Codebase**

### Step 1.1: Create Fix Plan

Investigate the codebase enough to understand the problem and create a plan.

**Use the same parallel exploration approach as Step 2** — launch Explore agents to investigate the problem area, related code, and past patterns simultaneously.

After agents return, synthesize findings to:
1. Identify the root cause (or most likely candidates)
2. Map affected files and functions
3. Assess impact scope

Then create `.ai-factory/FIX_PLAN.md` with this structure:

```markdown
# Fix Plan: [Brief title]

**Problem:** [What's broken — from user's description]
**Created:** YYYY-MM-DD HH:mm

## Analysis

What was found during investigation:
- Root cause (or suspected root cause)
- Affected files and functions
- Impact scope

## Fix Steps

Step-by-step plan for implementing the fix:

1. [ ] Step one — what to change and why
2. [ ] Step two — ...
3. [ ] Step three — ...

## Files to Modify

- `path/to/file.ts` — what changes are needed
- `path/to/another.ts` — what changes are needed

## Risks & Considerations

- Potential side effects
- Things to verify after the fix
- Edge cases to watch for

## Test Coverage

- What tests should be added
- What edge cases to cover
```

**After creating the plan, output:**

```
## Fix Plan Created ✅

Plan saved to `.ai-factory/FIX_PLAN.md`.

Review the plan and when you're ready to execute, run:

/aif-fix
```

**STOP here. Do NOT apply the fix.**

### Step 2: Investigate the Codebase

**Use `Task` tool with `subagent_type: Explore` to investigate the problem in parallel.** This keeps the main context clean and allows simultaneous investigation of multiple angles.

Launch 2-3 Explore agents simultaneously:

```
Agent 1 — Locate the problem area:
Task(subagent_type: Explore, model: sonnet, prompt:
  "Find code related to [error location / affected functionality].
   Read the relevant functions, trace the data flow.
   Thoroughness: medium.")

Agent 2 — Related code & side effects:
Task(subagent_type: Explore, model: sonnet, prompt:
  "Find all callers/consumers of [affected function/module].
   Identify what else might break or be affected.
   Thoroughness: medium.")

Agent 3 — Similar past patterns (if patches exist):
Task(subagent_type: Explore, model: sonnet, prompt:
  "Search for similar error patterns or related fixes in the codebase.
   Check git log for recent changes to [affected files].
   Thoroughness: quick.")
```

**After agents return, synthesize findings to identify:**
- The root cause (not just symptoms)
- Related code that might be affected
- Existing error handling

**Fallback:** If Task tool is unavailable, investigate directly:
- Find relevant files using Glob/Grep
- Read the code around the issue
- Trace the data flow
- Check for similar patterns elsewhere

### Step 3: Implement the Fix

**Apply the fix with logging:**

```typescript
// ✅ REQUIRED: Add logging around the fix
console.log('[FIX] Processing user input', { userId, input });

try {
  // The actual fix
  const result = fixedLogic(input);
  console.log('[FIX] Success', { userId, result });
  return result;
} catch (error) {
  console.error('[FIX] Error in fixedLogic', {
    userId,
    input,
    error: error.message,
    stack: error.stack
  });
  throw error;
}
```

**Logging is MANDATORY because:**
- User needs to verify the fix works
- If it doesn't work, logs help debug further
- Feedback loop: user provides logs → we iterate

### Step 4: Verify the Fix

- Check the code compiles/runs
- Verify the logic is correct
- Ensure no regressions introduced

### Step 5: Suggest Test Coverage

**ALWAYS suggest covering this case with a test:**

```
## Fix Applied ✅

The issue was: [brief explanation]
Fixed by: [what was changed]

### Logging Added
The fix includes logging with prefix `[FIX]`.
Please test and share any logs if issues persist.

### Recommended: Add a Test

This bug should be covered by a test to prevent regression:

\`\`\`typescript
describe('functionName', () => {
  it('should handle [the edge case that caused the bug]', () => {
    // Arrange
    const input = /* the problematic input */;

    // Act
    const result = functionName(input);

    // Assert
    expect(result).toBe(/* expected */);
  });
});
\`\`\`

Would you like me to create this test?
- [ ] Yes, create the test
- [ ] No, skip for now
```

## Logging Requirements

**All fixes MUST include logging:**

1. **Log prefix**: Use `[FIX]` or `[FIX:<issue-id>]` for easy filtering
2. **Log inputs**: What data was being processed
3. **Log success**: Confirm the fix worked
4. **Log errors**: Full context if something fails
5. **Configurable**: Use LOG_LEVEL if available

```typescript
// Pattern for fixes
const LOG_FIX = process.env.LOG_LEVEL === 'debug' || process.env.DEBUG_FIX;

function fixedFunction(input) {
  if (LOG_FIX) console.log('[FIX] Input:', input);

  // ... fix logic ...

  if (LOG_FIX) console.log('[FIX] Output:', result);
  return result;
}
```

## Examples

### Example 1: Null Reference Error

**User:** `/aif-fix TypeError: Cannot read property 'name' of undefined in UserProfile`

**Actions:**
1. Search for UserProfile component/function
2. Find where `.name` is accessed
3. Add null check with logging
4. Suggest test for null user case

### Example 2: API Returns Wrong Data

**User:** `/aif-fix /api/orders returns empty array for authenticated users`

**Actions:**
1. Find orders API endpoint
2. Trace the query logic
3. Find the bug (e.g., wrong filter)
4. Fix with logging
5. Suggest integration test

### Example 3: Form Validation Not Working

**User:** `/aif-fix email validation accepts invalid emails`

**Actions:**
1. Find email validation logic
2. Check regex or validation library usage
3. Fix the validation
4. Add logging for validation failures
5. Suggest unit test with edge cases

## Important Rules

1. **Check FIX_PLAN.md first** - Always check for existing plan before anything else
2. **Plan mode = plan only** - When user chooses "Plan first", create the plan and STOP. Do NOT fix.
3. **Execute mode = follow the plan** - When FIX_PLAN.md exists, follow it step by step, then delete it
4. **NO reports** - Don't create summary documents (patches are learning artifacts, not reports)
5. **ALWAYS log** - Every fix must have logging for feedback
6. **ALWAYS suggest tests** - Help prevent regressions
7. **Root cause** - Fix the actual problem, not symptoms
8. **Minimal changes** - Don't refactor unrelated code
9. **One fix at a time** - Don't scope creep
10. **Clean up** - Delete FIX_PLAN.md after successful fix execution

## After Fixing

```
## Fix Applied ✅

**Issue:** [what was broken]
**Cause:** [why it was broken]
**Fix:** [what was changed]

**Files modified:**
- path/to/file.ts (line X)

**Logging added:** Yes, prefix `[FIX]`
**Test suggested:** Yes

Please test the fix and share logs if any issues.

To add the suggested test:
- [ ] Yes, create test
- [ ] No, skip
```

### Step 6: Create Self-Improvement Patch

**ALWAYS create a patch after every fix.** This builds a knowledge base for future fixes.

**Create the patch:**

1. Create directory if it doesn't exist:
   ```bash
   mkdir -p .ai-factory/patches
   ```

2. Create a patch file with the current timestamp as filename.
   **Format:** `YYYY-MM-DD-HH.mm.md` (e.g., `2026-02-07-14.30.md`)

3. Use this template:

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

**Example patch:**

```markdown
# Null reference in UserProfile when user has no avatar

**Date:** 2026-02-07 14:30
**Files:** src/components/UserProfile.tsx
**Severity:** medium

## Problem

TypeError: Cannot read property 'url' of undefined when rendering
UserProfile for users without an uploaded avatar.

## Root Cause

The `user.avatar` field is optional in the database schema but the
component accessed `user.avatar.url` without a null check. This was
introduced in commit abc123 when avatar display was added — the
developer tested only with users that had avatars.

## Solution

Added optional chaining: `user.avatar?.url` with a fallback to a
default avatar URL. Also added a null check in the Avatar sub-component.

## Prevention

- Always check if database fields marked as `nullable` / `optional`
  are handled with null checks in the UI layer
- Add test cases for "empty state" — user with minimal data
- Consider a lint rule for accessing nested optional properties

## Tags

`#null-check` `#react` `#optional-field` `#typescript`
```

**This is NOT optional.** Every fix generates a patch. The patch is your learning.

### Context Cleanup

Context is heavy after investigation, fix, and patch generation. All results are saved — suggest freeing space:

```
AskUserQuestion: Free up context before continuing?

Options:
1. /clear — Full reset (recommended)
2. /compact — Compress history
3. Continue as is
```

---

**DO NOT:**
- ❌ Apply a fix when user chose "Plan first" — only create FIX_PLAN.md and stop
- ❌ Skip the FIX_PLAN.md check at the start
- ❌ Leave FIX_PLAN.md after successful fix execution — always delete it
- ❌ Generate reports or summaries (patches are NOT reports — they are learning artifacts)
- ❌ Refactor unrelated code
- ❌ Add features while fixing
- ❌ Skip logging
- ❌ Skip test suggestion
- ❌ Skip patch creation
