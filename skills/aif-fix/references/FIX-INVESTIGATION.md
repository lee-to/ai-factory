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
