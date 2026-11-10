### Step 1.1: Create Fix Plan

**Handoff sync (manual mode only):** If a Handoff task ID is known (from `HANDOFF_TASK_ID` or an existing annotation) AND `HANDOFF_MODE` is NOT `1`, call `handoff_sync_status` with `{ taskId: <id>, newStatus: "planning", sourceTimestamp: "<current UTC time in ISO 8601 format>", direction: "aif_to_handoff", paused: true }`.

Investigate the codebase enough to understand the problem and create a plan.

**Use the same parallel exploration approach as Step 2** — launch Explore agents to investigate the problem area, related code, and past patterns simultaneously.

If the resolved research path exists, read it before creating the fix plan. Also check direct child bundles under `research_bundles_dir`, but recognize one as active only when `INDEX.md` contains `<!-- aif:research-mode:ultra -->` exactly once, declares `Status: active`, and links its `RESEARCH.md` from `## Artifact Index`. Select at most one clearly bug-relevant source: explicit concrete path, then exact slug, normalized `Topic:`, or unique semantic match, then the relevant legacy file; never use recency. When the selected Active Summary influences the planned fix, copy it into `## Research Context` and include ``Source: `<selected research path>` (Active Summary, Updated: <research Updated timestamp>, SHA256: <sha256 of copied Active Summary>)``. If research is unrelated, omit the section.

When adding `## Research Context` to a fix plan, use the same normalization algorithm as the drift check. Calculate the digest without a temporary repository artifact: feed the normalized text through stdin / inline shell input to `shasum -a 256`; if unavailable, use `sha256sum`. Use the first output field as `SHA256:`.

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
Source: `<selected research path>` (Active Summary, Updated: YYYY-MM-DD HH:MM, SHA256: <active-summary-sha256>)
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
