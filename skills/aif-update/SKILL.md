---
name: aif-update
description: Updates ai-factory CLI to the latest version with version checking and confirmation. Checks if CLI and project are already up to date before prompting. Performs skills migration. Use when user says "update ai-factory", "ai-factory update" or asks to update ai-factory.
model: haiku
---

# ai-factory CLI Update

Skill updates ai-factory CLI to the latest version with smart version checking:
1. First checks if CLI is already up to date — reports status without prompting
2. Then checks if project version matches CLI version — if equal, reports everything is current
3. Only prompts for updates when actually needed

## Workflow

### 1. Check current version

Get currently installed version:
```bash
ai-factory --version
```

If ai-factory is not installed, report it and exit.

### 2. Get latest version from npm

```bash
npm view ai-factory version
```

Also get version information for comparison:
```bash
npm view ai-factory versions --json
```

### 3. Compare versions

- If current version == latest version:
  - Report: "**✓ CLI is up to date** — you have the latest version ({version})"
  - Skip npm install, continue to "Check project version and agent config" step

- If new version is available:
  - Show: "**Current CLI version:** {current}"
  - Show: "**Available version:** {latest}"
  - Show list of versions between current and latest
  - Use `AskUserQuestion` to request confirmation:
    ```json
    {
      "questions": [{
        "question": "Update ai-factory to version {latest}?",
        "header": "Confirmation",
        "options": [
          {"label": "Update", "description": "Install latest version"},
          {"label": "Skip", "description": "Cancel update"}
        ],
        "multiSelect": false
      }]
    }
    ```

- If user selected "Skip":
  - Report: "Update cancelled, but running upgrade for consistency..."
  - Continue to "Perform CLI update" step (skip npm install, but run ai-factory upgrade)

### 4. Perform CLI update

If user confirmed OR if CLI was already up to date:

- If CLI update was needed and user confirmed:
  ```bash
  npm install -g ai-factory@latest
  ```
  Wait for installation to complete.

- If CLI was already up to date (from step 3):
  - Skip npm install
  - Report: "CLI update skipped — already on latest version"

### 5. Verify update result

```bash
ai-factory --version
```

Confirm that version is updated.

### 6. Check project version and agent config

Read project configuration from `.ai-factory.json` in current directory:

```bash
cat .ai-factory.json
```

Extract:
- `version` — current project version
- `agent` — agent ID (e.g., "claude", "universal")
- `skillsDir` — skills directory path

Compare project version with installed CLI version:
- If project version < CLI version: project needs upgrade → continue to step 7
- If project version == CLI version: **project is up to date** → skip to "Completion" step
- If project version > CLI version: unusual, warn user → continue to step 7

### 7. Ask for project upgrade confirmation

**IMPORTANT: Only ask if project version != CLI version**

Use `AskUserQuestion` to request confirmation:

```json
{
  "questions": [{
    "question": "Run project upgrade (ai-factory upgrade)?\n\nCurrent project version: {projectVersion}\nCLI version: {cliVersion}\nAgent: {agentId}\nSkills directory: {skillsDir}",
    "header": "Project Upgrade",
    "options": [
      {"label": "Upgrade", "description": "Run ai-factory upgrade to update project"},
      {"label": "Skip", "description": "Skip project upgrade"}
    ],
    "multiSelect": false
  }]
}
```

- If user selected "Skip":
  - Report: "Project upgrade skipped"
  - Continue to "Completion" step

### 8. Perform project upgrade

If user confirmed:

```bash
ai-factory upgrade
```

Wait for upgrade to complete and capture output to identify what was updated.

### 9. Completion

Report completion summary with agent information:

**If everything is already up to date (CLI == project version):**
- "✓ **Everything is up to date!**"
- "**CLI version:** {cliVersion}"
- "**Project version:** {projectVersion}"
- "**Agent:** {agentId}"
- "**Skills directory:** {skillsDir}"
- "No restart required."

**If CLI was updated:**
- "✓ **CLI updated** from {oldVersion} to {newVersion}"

**If project upgrade was performed:**
- "✓ **Project upgraded** from version {oldProjectVersion} to {newProjectVersion}"
- "**Agent:** {agentId}"
- "**Skills directory:** {skillsDir}"
- List what was updated (from upgrade output):
  - Skills migrated/updated
  - Configuration changes
  - MCP server changes

**If project upgrade was skipped (but versions differ):**
- "Project upgrade skipped"
- "**Agent:** {agentId} (version {projectVersion})"

**If CLI was updated or project was upgraded:**
- "**Restart the agent to apply changes.**"

## Command sequence (summary)

```bash
# 1. Check CLI version
ai-factory --version

# 2. Get latest version
npm view ai-factory version

# 3. Compare versions
#    - If CLI == latest: report CLI is up to date, continue
#    - If CLI < latest: show versions and ask for confirmation

# 4. Update CLI (only if needed and confirmed)
npm install -g ai-factory@latest

# 5. Verify update
ai-factory --version

# 6. Check project version and agent config
cat .ai-factory.json

# 7. Compare project version with CLI version
#    - If project == CLI: report everything is up to date, DONE
#    - If project != CLI: ask for project upgrade confirmation

# 8. Run project upgrade (only if confirmed)
ai-factory upgrade
```

## Error handling

- If `.ai-factory.json` not found — warn user that project is not initialized
- If `npm install` failed — show error and suggest trying manually
- If `ai-factory upgrade` failed — show error, but note that CLI is updated (if applicable)
- If project version > CLI version — warn user that project is newer than CLI (unusual state)

## Exit scenarios

| Scenario | Action |
|----------|--------|
| CLI not installed | Report error and exit |
| CLI == latest | Report CLI is up to date, continue |
| CLI < latest, user confirms | Update CLI, continue |
| CLI < latest, user skips | Skip CLI update, continue |
| Project == CLI | Report everything is up to date, DONE |
| Project != CLI, user confirms | Run project upgrade |
| Project != CLI, user skips | Report skipped, DONE |
