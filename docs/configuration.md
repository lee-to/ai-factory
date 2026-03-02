[← Extensions](extensions.md) · [Back to README](../README.md)

# Configuration

## `.ai-factory.json`

```json
{
  "version": "2.2.0",
  "agents": [
    {
      "id": "claude",
      "skillsDir": ".claude/skills",
      "installedSkills": ["aif", "aif-plan", "aif-improve", "aif-implement", "aif-commit", "aif-build-automation"],
      "mcp": {
        "github": true,
        "postgres": false,
        "filesystem": false,
        "chromeDevtools": false,
        "playwright": false
      }
    },
    {
      "id": "codex",
      "skillsDir": ".codex/skills",
      "installedSkills": ["aif", "aif-plan", "aif-implement"],
      "mcp": {
        "github": false,
        "postgres": false,
        "filesystem": false,
        "chromeDevtools": false,
        "playwright": false
      }
    }
  ],
  "extensions": [
    {
      "name": "aif-ext-example",
      "source": "https://github.com/user/aif-ext-example.git",
      "version": "1.0.0"
    }
  ],
  "subagents": {
    "enabled": true,
    "mode": "full",
    "maxParallelTasks": 3,
    "profiles": [
      {
        "id": "planner-scout",
        "role": "planner-scout",
        "description": "Returns planning-relevant findings only",
        "maxContextChars": 12000,
        "outputFormat": "markdown",
        "enabled": true
      },
      {
        "id": "implementer-a",
        "role": "implementer",
        "description": "Executes independent tasks in isolated context",
        "maxContextChars": 14000,
        "outputFormat": "markdown",
        "enabled": true
      }
    ],
    "routing": {
      "plan": ["planner-scout"],
      "implement": ["implementer-a"]
    }
  }
}
```

The `agents` array can include any supported agent IDs: `claude`, `cursor`, `windsurf`, `roocode`, `kilocode`, `antigravity`, `opencode`, `warp`, `zencoder`, `codex`, `copilot`, `gemini`, `junie`, or `universal`. Each agent keeps its own `skillsDir`, installed skills list, and MCP preferences.

The optional `extensions` array tracks installed extensions by name, original source, and version.

The optional `subagents` block enables orchestration for focused plan scouting and parallel execution of independent implementation tasks. Runs are persisted under `.ai-factory/subagents/` as markdown artifacts and `runs.json` status snapshots.

### Subagents Fields

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | `boolean` | Enables/disables subagent orchestration. |
| `mode` | `off \| plan-only \| implement-only \| full` | Which phases use subagents. |
| `maxParallelTasks` | `number` | Max number of independent tasks scheduled in one implement orchestration pass. |
| `profiles` | `array` | Subagent profiles (role, context cap, output format). |
| `routing.plan` | `array<string>` | Profile IDs used for plan scouting. |
| `routing.implement` | `array<string>` | Profile IDs used for implementation orchestration. |

## MCP Configuration

AI Factory can configure these MCP servers:

| MCP Server | Use Case | Env Variable |
|------------|----------|--------------|
| GitHub | PRs, issues, repo operations | `GITHUB_TOKEN` |
| Postgres | Database queries | `DATABASE_URL` |
| Filesystem | Advanced file operations | - |
| Chrome Devtools | Browser inspection, debugging, performance | - |
| Playwright | Browser automation, web testing | - |

Configuration saved to agent's settings file (e.g. `.mcp.json` for Claude Code, `.cursor/mcp.json` for Cursor, `.vscode/mcp.json` for GitHub Copilot, `.roo/mcp.json` for Roo Code, `.kilocode/mcp.json` for Kilo Code, `opencode.json` for OpenCode). GitHub Copilot uses `servers` as the root object in `mcp.json`; other standard agents use `mcpServers` (OpenCode uses `mcp`).

### Environment Variables

MCP configs use `${VAR}` placeholders for credentials (GitHub Copilot receives `${env:VAR}` in `.vscode/mcp.json`). Set them before launching the agent:

```bash
export GITHUB_TOKEN="ghp_your_token"
export DATABASE_URL="postgresql://user:pass@localhost:5432/db"
```

Or replace the placeholders with actual values directly in the config file:

```json
{
  "mcpServers": {
    "github": {
      "env": { "GITHUB_TOKEN": "ghp_your_token" }
    }
  }
}
```

## Project Structure

After initialization (example for Claude Code — other agents use their own directory):

```
your-project/
├── .claude/                   # Agent config dir (varies: .cursor/, .codex/, .ai/, etc.)
│   ├── skills/
│   │   ├── aif/
│   │   ├── aif-plan/
│   │   ├── aif-improve/
│   │   ├── aif-implement/
│   │   ├── aif-commit/
│   │   ├── aif-dockerize/
│   │   ├── aif-build-automation/
│   │   ├── aif-verify/
│   │   ├── aif-docs/
│   │   ├── aif-review/
│   │   └── aif-skill-generator/
│   └── settings.local.json    # Permissions config (gitignored)
├── .ai-factory/               # AI Factory working directory
│   ├── DESCRIPTION.md         # Project specification
│   ├── ARCHITECTURE.md        # Architecture decisions and guidelines
│   ├── PLAN.md                # Current plan (from /aif-plan fast)
│   ├── SECURITY.md            # Ignored security items (from /aif-security-checklist ignore)
│   ├── extensions/            # Installed extensions (from ai-factory extension add)
│   │   └── <extension-name>/
│   │       └── extension.json
│   ├── plans/                 # Plans from /aif-plan full
│   │   └── <branch-name>.md
│   ├── patches/               # Self-improvement patches (from /aif-fix)
│   │   └── 2026-02-07-14.30.md
│   ├── evolutions/            # Evolution logs (from /aif-evolve)
│   │   └── 2026-02-08-10.00.md
│   └── evolution/             # Active reflex loop state (from /aif-loop)
│       ├── current.json
│       └── <task-alias>/
│           ├── run.json
│           ├── history.jsonl
│           └── artifact.md
├── .mcp.json                  # MCP servers config (Claude Code project scope)
└── .ai-factory.json           # AI Factory config
```

## Reflex Loop Files

`/aif-loop` keeps state lean and resumable between sessions:

- `.ai-factory/evolution/current.json` — active loop pointer (to current run)
- `.ai-factory/evolution/<task-alias>/run.json` — current run snapshot (loop execution state)
- `.ai-factory/evolution/<task-alias>/history.jsonl` — append-only event history
- `.ai-factory/evolution/<task-alias>/artifact.md` — latest artifact output

For full phase contracts and stop conditions, see [Reflex Loop](loop.md).

## Best Practices

### Logging
All implementations include verbose, configurable logging:
- Use log levels (DEBUG, INFO, WARN, ERROR)
- Control via `LOG_LEVEL` environment variable
- Implement rotation for file-based logs

### Commits
- Commit checkpoints every 3-5 tasks for large features
- Follow conventional commits format
- Meaningful messages, not just "update code"

### Testing
- Always asked before creating plan
- If "no tests" - no test tasks created
- Never sneaks in test code

## See Also

- [Getting Started](getting-started.md) — installation, supported agents, first project
- [Development Workflow](workflow.md) — how to use the workflow skills
- [Reflex Loop](loop.md) — contracts and storage layout for `/aif-loop`
- [Extensions](extensions.md) — writing and installing extensions
- [Security](security.md) — how external skills are scanned before use
