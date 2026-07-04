---
name: aif-fix
description: Fix a bug or problem. Supports fix-now or plan-first; no args executes FIX_PLAN.md. When a regression check is needed, reproduce first, then implement and rerun it. Adds logging and suggests extra coverage.
argument-hint: <bug description or error message>
allowed-tools: Read Write Edit Glob Grep Bash AskUserQuestion Questions Task mcp__handoff__handoff_sync_status mcp__handoff__handoff_push_plan mcp__handoff__handoff_get_task mcp__handoff__handoff_list_tasks mcp__handoff__handoff_update_task
disable-model-invocation: false
---

# Fix - Bug Fix Workflow

Fix a specific bug or problem in the codebase. Supports two modes: immediate fix or plan-first approach. The default workflow is regression-first whenever a regression check is needed: reproduce the problem, confirm the reported behavior, implement the fix, then verify the same check passes.

## Workflow

### Canonical Regression-First Policy

A **regression check** is the smallest useful test, command, fixture, API call, browser scenario, script, or documented manual/runtime reproduction that proves the reported bug or validates the expected behavior.

When a bug needs regression coverage, every workflow path (fix-now, plan-first, and existing-plan execution) follows this policy:

1. Identify the minimal regression check that should reproduce the issue or encode the expected behavior.
2. Execute the check before implementation and confirm it fails or reproduces the reported problem.
3. Implement the smallest fix addressing the root cause.
4. Re-run the exact same check and confirm it passes.
5. Only after that, run related existing checks when practical and suggest broader coverage if useful.

Fallback behavior:

- If no automated/executable check is available, document the narrowest manual/runtime reproduction and why no executable check exists. Treat that documented reproduction as the regression check for Step 4 when it can be rerun.
- If no useful regression check exists at all, record the reason before implementation. In `HANDOFF_MODE=1`, continue only when investigation found a plausible root cause that can be fixed safely; otherwise report the task as blocked/unreproducible and stop without changing implementation code. In manual mode, ask whether to proceed with the likely fix, adjust reproduction, or investigate further.
- If the pre-fix regression check passes unexpectedly, treat it as a reproduction mismatch: record the command/check, inputs, environment assumptions, and observed result. Then use the same `HANDOFF_MODE=1` or manual-mode fallback above.

Do not duplicate or weaken this policy in later workflow sections. Later steps should reference this section and add only local execution details.

### Step 0 (pre): Detect Handoff Mode

Determine Handoff mode, task ID, and skip-review flag. If the caller passed `HANDOFF_MODE`, `HANDOFF_TASK_ID`, and `HANDOFF_SKIP_REVIEW` as explicit text in the prompt, use those values. Otherwise, use the Bash tool:

```
Bash: printenv HANDOFF_MODE || true
Bash: printenv HANDOFF_TASK_ID || true
Bash: printenv HANDOFF_SKIP_REVIEW || true
```

**Then check `HANDOFF_MODE`:**

#### When `HANDOFF_MODE` is `1` (autonomous Handoff agent)

The Handoff coordinator already manages status transitions and DB writes directly. Do NOT call MCP tools. Instead:

- **No interactive questions:** Do not use `AskUserQuestion`. If `$ARGUMENTS` contains `--plan-first`, use "Plan first" mode. Otherwise default to "Fix now" mode. When a regression check is needed for the bug, include regression-first handling and logging.
- **Plan annotation (MANDATORY):** If `HANDOFF_TASK_ID` is non-empty, you MUST insert `<!-- handoff:task:<HANDOFF_TASK_ID> -->` as the very first line of the fix plan file, before the title. **Omitting this annotation when HANDOFF_TASK_ID is set is a bug — verify before completing.** This applies to both Step 1.1 (creating new plan) and any plan rewrite.

#### When `HANDOFF_MODE` is NOT `1` (manual Claude Code session)

Handoff sync is handled inline — see **Step 0.1** (after reading the fix plan file) for the task ID extraction and MCP sync trigger. The sync points are:

- **Plan first (Step 1.1):** `"planning"` → `"plan_ready"` (after save)
- **Fix now (Step 2→5):** `"implementing"` (Step 2 entry) → `"done"` if `HANDOFF_SKIP_REVIEW=1`, else `"review"` (Step 5)
- **Execute existing plan (Step 0.1→5):** `"implementing"` (Step 0.1) → `"done"` if `HANDOFF_SKIP_REVIEW=1`, else `"review"` (Step 5)

**CRITICAL:** Always pass `paused: true` with every `handoff_sync_status` call except `done`.

When creating a new FIX_PLAN.md: if there is no existing annotation and no Handoff context, do not add the annotation.

### Step 0: Load Config and Resolve Paths

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:

- **Paths:** `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.rules`, `paths.research`, `paths.fix_plan`, and `paths.patches`
- **Language:** `language.ui` for prompts and summaries, `language.artifacts` for `FIX_PLAN.md` and patch artifacts, and `language.technical_terms` for human-readable technical terminology in artifacts
- **Rules:** `rules.base` plus any named `rules.<area>` entries

If config.yaml doesn't exist, use defaults:

- DESCRIPTION.md: `.ai-factory/DESCRIPTION.md`
- ARCHITECTURE.md: `.ai-factory/ARCHITECTURE.md`
- RULES.md: `.ai-factory/RULES.md`
- rules/: `.ai-factory/rules/`
- RESEARCH.md: `.ai-factory/RESEARCH.md`
- FIX_PLAN.md: `.ai-factory/FIX_PLAN.md`
- patches/: `.ai-factory/patches/`
- `ui_language`: `en`
- `artifact_language`: `en`
- `technical_terms_policy`: `keep`

Resolved language values:
- `ui_language = language.ui || "en"`
- `artifact_language = language.artifacts || language.ui || "en"`
- `technical_terms_policy = language.technical_terms || "keep"`

If `technical_terms_policy` is not one of `keep`, `translate`, or `mixed`, treat it as `keep`. Legacy values such as `english` also behave like `keep`.

All AskUserQuestion prompts, progress updates, fix summaries, test prompts, and next-step guidance MUST be written in `ui_language`.

Generated `FIX_PLAN.md` and self-improvement patch files under `paths.patches` MUST be written in `artifact_language`.

Templates and examples define structure, not fixed English output. If `artifact_language` is not `en`, translate human-readable headings, labels, analysis text, fix checklist entries, risks, prevention notes, and patch prose before saving. Preserve Handoff annotations, markdown structure, checkbox syntax, paths, commands, config keys, code identifiers, package names, API names, raw error messages, code snippets, log prefixes such as `[FIX]`, and patch tags unchanged. Apply `technical_terms_policy` to other human-readable terminology.

### Step 0.1: Check for Existing Fix Plan

**BEFORE anything else after config resolution**, check the resolved fix plan path (default: `.ai-factory/FIX_PLAN.md`).

**If the file EXISTS:**

- Read the resolved fix plan file
- If the fix plan contains `## Research Context`, a `Source:` / `Reference:` line pointing to `RESEARCH.md`, or any path/link to the resolved `paths.research` artifact, treat the embedded Research Context as the committed fix requirements snapshot. Read the resolved research artifact before executing the plan only to verify the committed revision marker (`Updated:` and/or `SHA256:` in the source line) and to consult `## Sessions` for rationale when needed. If the source line lacks a revision marker or the current `Active Summary` revision differs, emit `WARN [research-drift]` and execute against the fix plan's embedded Research Context; do not apply requirements from the newer Active Summary unless the user explicitly asks to rebase the fix plan.
- **Immediately check the first line for `<!-- handoff:task:<uuid> -->`:**
  - If found AND `HANDOFF_MODE` is NOT `1` (manual session): extract the task ID. Call `handoff_sync_status` with `{ taskId: <extracted-id>, newStatus: "implementing", sourceTimestamp: "<current UTC time in ISO 8601 format>", direction: "aif_to_handoff", paused: true }`. (Status is `"implementing"` because we are executing an existing plan, not creating one.)
  - If found AND `HANDOFF_MODE` is `1`: the Handoff coordinator handles sync — do nothing.
  - If NOT found: no linked Handoff task — skip all MCP sync for the rest of this session.
- Inform the user: "Found existing fix plan. Executing fix based on the plan."
- Skip **Step 1** (problem intake/mode choice), but still run **Step 0.2** to load context
- Then continue to **Step 2: Investigate the Codebase**, using the plan as your guide
- Apply the **Canonical Regression-First Policy** before changing implementation code when a regression check is needed for the bug, even if the existing plan did not include that policy
- Follow the plan sequentially, but preserve the canonical order: confirm the problem first, implement the fix, then rerun the same regression check
- After the fix is fully applied and verified in Step 4, delete the resolved fix plan file **only when it is the default fix plan path** `.ai-factory/FIX_PLAN.md`:
  ```bash
  rm .ai-factory/FIX_PLAN.md
  ```
- If the fix plan came from a custom `paths.fix_plan` value, an explicitly supplied custom plan path, or any non-default fix plan location, do **not** delete it. Leave it in place and mention in the final summary that the custom fix plan was preserved.
- Continue to Step 5 (Additional Test Coverage) and Step 6 (Patch)

**If the file DOES NOT exist AND `$ARGUMENTS` is empty:**

- Tell the user: "No fix plan found and no problem description provided. Please either provide a bug description (`/aif-fix <description>`) or create a fix plan first."
- **STOP.**

**If the file DOES NOT exist AND `$ARGUMENTS` is provided:**

- Continue to Step 0.2 below.

### Step 0.2: Load Project Context & Past Experience

**THEN:** Read `.ai-factory/DESCRIPTION.md` (use path from config) if it exists to understand:

- Tech stack (language, framework, database)
- Project architecture
- Coding conventions

**Also read `.ai-factory/ARCHITECTURE.md`** (use path from config), the resolved RULES.md path, and the configured rules hierarchy when present to avoid fixes that violate project structure or local conventions.

**Read `.ai-factory/skill-context/aif-fix/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**

- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including the FIX_PLAN.md
  template and patch files. The FIX_PLAN.md template in Step 1.1 is a **base structure**. If a
  skill-context rule says "steps MUST include X" or "plan MUST have section Y" — you MUST augment
  the template accordingly. Generating a FIX_PLAN.md or patch that violates skill-context rules is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

**Patch fallback (limited, only when skill-context is missing):**

- If `.ai-factory/skill-context/aif-fix/SKILL.md` does not exist and the resolved patches dir exists:
  - Use `Glob` to find `*.md` files in `<resolved patches dir>`
  - Sort patch filenames ascending (lexical), then select the last **10** (or fewer if less exist)
  - Read those selected patch files only
  - Prioritize recurring **Root Cause** and **Prevention** patterns
- If skill-context exists, do **not** read all patches by default.
  - Optionally inspect a small, targeted subset of recent patches when tags/files clearly match the current bug.

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

**Based on choice:**

- "Plan first" → Proceed to **Step 1.1: Create Fix Plan**
- "Fix now" → Skip Step 1.1, proceed directly to **Step 2: Investigate the Codebase**

### Step 1.1: Create Fix Plan

**Handoff sync (manual mode only):** If a Handoff task ID is known (from `HANDOFF_TASK_ID` or an existing annotation) AND `HANDOFF_MODE` is NOT `1`, call `handoff_sync_status` with `{ taskId: <id>, newStatus: "planning", sourceTimestamp: "<current UTC time in ISO 8601 format>", direction: "aif_to_handoff", paused: true }`.

Investigate the codebase enough to understand the problem and create a plan.

**Use the same parallel exploration approach as Step 2** — launch Explore agents to investigate the problem area, related code, and past patterns simultaneously.

If the resolved research path exists, read it before creating the fix plan. When the current Active Summary is relevant to the bug or influenced the planned fix, copy the relevant Active Summary into `## Research Context` and include `Source: <resolved research path> (Active Summary, Updated: <research Updated timestamp>, SHA256: <sha256 of copied Active Summary>)`. If research is unrelated, omit the section.

When adding `## Research Context` to a fix plan, normalize the copied Active Summary before hashing: include exactly the text that will be pasted under `## Research Context` after the `Source:` line, exclude markdown comments and the `Source:` line itself, preserve line order, trim trailing spaces, use LF line endings, and end with exactly one final newline. Calculate the digest without writing any temporary file or repository artifact: feed the normalized text through stdin / inline shell input to `shasum -a 256`; if `shasum` is unavailable, feed the same normalized text to `sha256sum`. Use the first output field as the `SHA256:` value.

After agents return, synthesize findings to:

1. Identify the root cause (or most likely candidates)
2. Map affected files and functions
3. Assess impact scope

Then create the resolved fix plan file (default: `.ai-factory/FIX_PLAN.md`).

Write the fix plan in `artifact_language`. The template below is the required structure only; translate human-readable headings, labels, and prose before saving when `artifact_language` is not `en`, while preserving stable technical tokens from Step 0.

**Before writing:** If `HANDOFF_MODE` is `1` and `HANDOFF_TASK_ID` is non-empty, the very first line of the file MUST be `<!-- handoff:task:<HANDOFF_TASK_ID> -->` followed by a blank line, then the plan content below. If in manual mode and a task ID was extracted from an existing annotation, preserve it.

Structure:

```markdown
# Fix Plan: [Brief title]

**Problem:** [What's broken — from user's description]
**Created:** YYYY-MM-DD HH:mm

## Analysis

What was found during investigation:

- Root cause (or suspected root cause)
- Affected files and functions
- Impact scope

## Fix Checklist

Checklist entries for implementing the fix:

1. [ ] Apply the Canonical Regression-First Policy: add or identify the minimal regression check, or record why no useful check exists
2. [ ] Run the regression check and confirm it reproduces the reported problem, or record the fallback outcome from the policy
3. [ ] Implement the smallest fix for the root cause
4. [ ] Rerun the same regression check and confirm it passes when a rerunnable check exists
5. [ ] Run the closest related existing checks when practical

## Files to Modify

- `path/to/file.ts` — what changes are needed
- `path/to/another.ts` — what changes are needed

## Risks & Considerations

- Potential side effects
- Things to verify after the fix
- Edge cases to watch for

## Test Coverage

- Minimal regression check to confirm the bug before implementation
- Command/check to run before and after the fix
- Additional edge cases worth covering after the regression check passes

## Research Context (optional)

Include only when this fix plan is based on `RESEARCH.md`.
Source: <resolved research path> (Active Summary, Updated: YYYY-MM-DD HH:MM, SHA256: <active-summary-sha256>)
```

Use the normalization and stdin hashing rules from Step 1.1 when filling `SHA256:`.

**After creating the plan, output:**

```
## Fix Plan Created ✅

Plan saved to the resolved fix plan path.

Review the plan and when you're ready to execute, run:

/aif-fix
```

**Handoff sync (manual mode only):** If a Handoff task ID is known AND `HANDOFF_MODE` is NOT `1`, call `handoff_push_plan` with `{ taskId: <id>, planContent: <full fix plan text> }`, then `handoff_sync_status` with `{ taskId: <id>, newStatus: "plan_ready", sourceTimestamp: "<current UTC time in ISO 8601 format>", direction: "aif_to_handoff", paused: true }`.

**STOP here. Do NOT apply the fix.**

### Step 2: Investigate the Codebase

**Handoff sync (manual mode, "Fix now" path only):** If a Handoff task ID is known AND `HANDOFF_MODE` is NOT `1`, call `handoff_sync_status` with `{ taskId: <id>, newStatus: "implementing", sourceTimestamp: "<current UTC time in ISO 8601 format>", direction: "aif_to_handoff", paused: true }`.

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

### Step 2.5: Capture a Regression Check

Apply the **Canonical Regression-First Policy** before changing implementation code. Prefer a regression check for behavior bugs, parsing/validation bugs, API/data bugs, crashes, and regressions. If the change is a non-bug cleanup, purely static correction, or investigation-only request, record why the policy does not apply and continue with the normal fix workflow.

**Anti-gaming rule:** Do not tailor the test to the implementation you plan to write. The test must describe the externally expected behavior or the reported failure condition. If the test passes before any fix, either the reproduction is wrong, the bug is stale, or the environment differs; handle that mismatch through the fallback behavior in the Canonical Regression-First Policy before changing implementation code.

Record the selected regression check, pre-fix result, and any fallback decision in your working notes so Step 4 can rerun or revisit the same check after the fix.

### Step 3: Implement the Fix

**Apply the fix with logging:**

```typescript
// ✅ REQUIRED: Add logging around the fix
console.log("[FIX] Processing user input", { userId, input });

try {
  // The actual fix
  const result = fixedLogic(input);
  console.log("[FIX] Success", { userId, result });
  return result;
} catch (error) {
  console.error("[FIX] Error in fixedLogic", {
    userId,
    input,
    error: error.message,
    stack: error.stack,
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
- If Step 2.5 created, identified, or documented a regression check, rerun or revisit the same check and confirm the fixed behavior
- Verify the logic is correct
- Ensure no regressions introduced
- When practical, run the closest existing related test suite after the regression check passes

### Step 5: Suggest Additional Test Coverage

**Handoff sync (manual mode ONLY — skip entirely when `HANDOFF_MODE` is `1`):** If a Handoff task ID is known AND `HANDOFF_MODE` is NOT `1`:
1. Call `handoff_push_plan` with `{ taskId: <id>, planContent: <fix summary or updated plan> }`.
2. If `HANDOFF_SKIP_REVIEW` is `1`: call `handoff_sync_status` with `{ taskId: <id>, newStatus: "done", sourceTimestamp: "<current UTC time in ISO 8601 format>", direction: "aif_to_handoff", paused: false }`.
3. Otherwise: call `handoff_sync_status` with `{ taskId: <id>, newStatus: "review", sourceTimestamp: "<current UTC time in ISO 8601 format>", direction: "aif_to_handoff", paused: true }`.

**ALWAYS suggest additional test coverage:**

The Step 5 and After Fixing output templates define structure only. Render all human-readable text in these user-facing responses in `ui_language`. Preserve code snippets, commands, file paths, line references, log prefixes such as `[FIX]`, and AskUserQuestion option structure unchanged.

```
## Fix Applied ✅

The issue was: [brief explanation]
Fixed by: [what was changed]

### Logging Added
The fix includes logging with prefix `[FIX]`.
Please test and share any logs if issues persist.

### Recommended: Add More Test Coverage

If a regression check was created or identified in Step 2.5, this bug is now covered. Consider adding broader coverage to prevent nearby regressions:

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

AskUserQuestion: Would you like me to create the additional test coverage?

Options:
1. Yes, create the test
2. No, skip for now
```

**Handling the user's response:**

- **If "Yes, create the test":**
  1. Create the test file in the appropriate test directory (follow project conventions)
  2. Include the suggested additional test case and related edge cases
  3. Run the test to verify it passes
  4. Then proceed to **Step 6: Create Self-Improvement Patch**

- **If "No, skip for now":**
  - Proceed directly to **Step 6: Create Self-Improvement Patch**

## Logging Requirements

**All fixes MUST include logging:**

1. **Log prefix**: Use `[FIX]` or `[FIX:<issue-id>]` for easy filtering
2. **Log inputs**: What data was being processed
3. **Log success**: Confirm the fix worked
4. **Log errors**: Full context if something fails
5. **Configurable**: Use LOG_LEVEL if available

```typescript
// Pattern for fixes
const LOG_FIX = process.env.LOG_LEVEL === "debug" || process.env.DEBUG_FIX;

function fixedFunction(input) {
  if (LOG_FIX) console.log("[FIX] Input:", input);

  // ... fix logic ...

  if (LOG_FIX) console.log("[FIX] Output:", result);
  return result;
}
```

## Examples

### Example 1: Null Reference Error

**User:** `/aif-fix TypeError: Cannot read property 'name' of undefined in UserProfile`

**Actions:**

1. Search for UserProfile component/function
2. Find where `.name` is accessed
3. Add a regression check for the null user case and confirm it fails
4. Add null check with logging
5. Rerun the same regression check and confirm it passes

### Example 2: API Returns Wrong Data

**User:** `/aif-fix /api/orders returns empty array for authenticated users`

**Actions:**

1. Find orders API endpoint
2. Trace the query logic
3. Find the bug (e.g., wrong filter)
4. Add or identify an integration regression check for the authenticated user case and confirm it fails
5. Fix with logging
6. Rerun the same regression check and confirm it passes

### Example 3: Form Validation Not Working

**User:** `/aif-fix email validation accepts invalid emails`

**Actions:**

1. Find email validation logic
2. Check regex or validation library usage
3. Add a unit regression test for the invalid email case and confirm it fails
4. Fix the validation
5. Add logging for validation failures
6. Rerun the same regression test and confirm it passes

## Important Rules

1. **Check the fix plan first** - Always check the resolved fix plan path before anything else
2. **Plan mode = plan only** - When user chooses "Plan first", create the plan and STOP. Do NOT fix.
3. **Execute mode = follow the plan** - When the resolved fix plan exists, follow it step by step. Delete it after verified execution only if it is the default `.ai-factory/FIX_PLAN.md`; preserve custom/non-default fix plan files.
4. **NO reports** - Don't create summary documents (patches are learning artifacts, not reports)
5. **ALWAYS log** - Every fix must have logging for feedback
6. **Regression-first when checks are needed** - When a bug needs regression coverage, follow the Canonical Regression-First Policy before changing implementation code, confirm the problem when reproducible, then verify the same regression check after the fix
7. **Do not fit tests to implementation** - Regression tests encode the reported/expected behavior, not the internal implementation shape
8. **ALWAYS suggest additional tests** - Help prevent nearby regressions beyond the required regression check
9. **Root cause** - Fix the actual problem, not symptoms
10. **Minimal changes** - Don't refactor unrelated code
11. **One fix at a time** - Don't scope creep
12. **Clean up** - Delete the resolved fix plan file after successful fix execution
13. **Ownership boundary** - `/aif-fix` owns `paths.fix_plan` and `paths.patches`; treat `.ai-factory/DESCRIPTION.md`, roadmap, rules, and architecture context artifacts as read-only unless the user explicitly requests otherwise
14. **Logging scope** - Keep `[FIX]` logging requirements for fixes; context-gate outputs in this command should use `WARN`/`ERROR` and must not change global logging policy in other skills

## After Fixing

**Use this output template in Step 5** (before the AskUserQuestion about additional tests):

```
## Fix Applied ✅

**Issue:** [what was broken]
**Cause:** [why it was broken]
**Fix:** [what was changed]
**Regression check:** [command/check and result, manual/runtime reproduction result, or "not available: <reason>"]

**Files modified:**
- path/to/file.ts (line X)

**Logging added:** Yes, prefix `[FIX]`
```

### Step 6: Create Self-Improvement Patch

**ALWAYS create a patch after every fix.** This builds a knowledge base for future fixes.

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

Suggest the user to free up context space if needed: `/clear` (full reset) or `/compact` (compress history).

---

**DO NOT:**

- ❌ Apply a fix when user chose "Plan first" - only create the fix plan and stop
- ❌ Skip the fix-plan check at the start
- ❌ Leave the default `.ai-factory/FIX_PLAN.md` after successful fix execution
- ❌ Delete custom/non-default fix plan files after execution
- ❌ Generate reports or summaries (patches are NOT reports — they are learning artifacts)
- ❌ Refactor unrelated code
- ❌ Add features while fixing
- ❌ Skip logging
- ❌ Skip test suggestion
- ❌ Skip patch creation
