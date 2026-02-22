---
name: aif-update
description: Updates ai-factory CLI and project with confirmation.
---

# ai-factory Update

## Update Script

scripts/update-cli.mjs

## Step 1: Check

Run the script with the `--check` flag. Parse the JSON response. If `error` — report and exit.

## Step 2: Confirmation and Execution

**If `cliNeedsUpdate: true`:**
→ Ask: "Update CLI from {cliVersion} to {latestVersion}?"
→ If confirmed: run the script with `--execute --step=cli`

**If `projectNeedsUpdate: true`:**
→ Ask: "Update project? Project: {projectVersion}, CLI: {cliVersion}"
→ If confirmed: run the script with `--execute --step=project`

## Step 3: Result

Report the result and current versions. If updated: "Restart the agent to apply changes".

## Script JSON Response (--check)

```json
{
  "cliNeedsUpdate": true,
  "projectNeedsUpdate": false,
  "cliVersion": "1.2.3",
  "latestVersion": "1.2.4",
  "projectVersion": "1.2.2"
}
```
