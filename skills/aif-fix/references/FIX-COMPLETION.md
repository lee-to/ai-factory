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
  4. Then follow the entrypoint's **Learning patch policy** (Step 6 only when enabled).

- **If "No, skip for now":**
  - Follow the entrypoint's **Learning patch policy** (Step 6 only when enabled).
