[← Security](security.md) · [Back to README](../README.md)

# Configuration

## `.ai-factory.json`

```json
{
  "version": "2.0.0",
  "agents": [
    {
      "id": "claude",
      "skillsDir": ".claude/skills",
      "installedSkills": ["aif", "aif-plan", "aif-improve", "aif-implement", "aif-commit", "aif-build-automation"],
      "mcp": {
        "github": true,
        "postgres": false,
        "filesystem": false,
        "chromeDevtools": false
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
        "chromeDevtools": false
      }
    }
  ]
}
```

The `agents` array can include any supported agent IDs: `claude`, `cursor`, `windsurf`, `roocode`, `kilocode`, `antigravity`, `opencode`, `warp`, `zencoder`, `codex`, `copilot`, `gemini`, `junie`, or `universal`. Each agent keeps its own `skillsDir`, installed skills list, and MCP preferences.

## MCP Configuration

AI Factory can configure these MCP servers:

| MCP Server | Use Case | Env Variable |
|------------|----------|--------------|
| GitHub | PRs, issues, repo operations | `GITHUB_TOKEN` |
| Postgres | Database queries | `DATABASE_URL` |
| Filesystem | Advanced file operations | - |
| Chrome Devtools | Browser inspection, debugging, performance | - |

Configuration saved to agent's settings file (e.g. `.mcp.json` for Claude Code, `.cursor/mcp.json` for Cursor, `.roo/mcp.json` for Roo Code, `.kilocode/mcp.json` for Kilo Code, `opencode.json` for OpenCode).

### Environment Variables

MCP configs use `${VAR}` placeholders for credentials. Set them before launching the agent:

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
- [Security](security.md) — how external skills are scanned before use
