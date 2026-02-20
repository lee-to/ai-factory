[← Back to README](../README.md) · Next: [Development Workflow →](workflow.md)

# Getting Started

## What is AI Factory?

AI Factory is a CLI tool and skill system that:

1. **Analyzes your project** — detects tech stack from package.json, composer.json, requirements.txt, etc.
2. **Installs relevant skills** — downloads from [skills.sh](https://skills.sh) or generates custom ones
3. **Configures MCP servers** — GitHub, Postgres, Filesystem based on your needs
4. **Provides spec-driven workflow** — structured feature development with plans, tasks, and commits

## Supported Agents

AI Factory works with any AI coding agent. During `ai-factory init`, you choose one or more target agents and skills are installed to each agent's correct directory with paths adapted automatically:

| Agent | Config Directory | Skills Directory |
|-------|-----------------|-----------------|
| Claude Code | `.claude/` | `.claude/skills/` |
| Cursor | `.cursor/` | `.cursor/skills/` |
| Windsurf | `.windsurf/` | `.windsurf/skills/` |
| Roo Code | `.roo/` | `.roo/skills/` |
| Kilo Code | `.kilocode/` | `.kilocode/skills/` |
| Antigravity | `.agent/` | `.agent/skills/`, `.agent/workflows/` |
| OpenCode | `.opencode/` | `.opencode/skills/` |
| Warp | `.warp/` | `.warp/skills/` |
| Zencoder | `.zencoder/` | `.zencoder/skills/` |
| Codex CLI | `.codex/` | `.codex/skills/` |
| GitHub Copilot | `.github/` | `.github/skills/` |
| Gemini CLI | `.gemini/` | `.gemini/skills/` |
| Junie | `.junie/` | `.junie/skills/` |
| Universal / Other | `.agents/` | `.agents/skills/` |

MCP server configuration is supported for Claude Code, Cursor, Roo Code, Kilo Code, and OpenCode. Other agents get skills installed with correct paths but without MCP auto-configuration.

## Your First Project

```bash
# 1. Install AI Factory
npm install -g ai-factory

# 2. Go to your project
cd my-project

# 3. Initialize — pick one or more agents, detect stack, install skills
ai-factory init

# 4. Open your AI agent (Claude Code, Cursor, etc.) and run:
/aif

# 5. Start building
/aif-plan Add user authentication with OAuth
```

From here, AI Factory creates a branch, builds a plan, and you run `/aif-implement` to execute it step by step.

## CLI Commands

```bash
# Update npm package to latest version
npm install -g ai-factory@latest

# Initialize project
ai-factory init

# Update skills to latest version
ai-factory update

# Migrate existing skills from v1 naming to v2 naming
ai-factory upgrade
```

For v1 -> v2 migration, run both commands in order:
1. `npm install -g ai-factory@latest`
2. `ai-factory upgrade`

## Next Steps

- [Development Workflow](workflow.md) — understand the full flow from plan to commit
- [Reflex Loop](loop.md) — run iterative generate → evaluate → critique → refine cycles
- [Core Skills](skills.md) — all available slash commands
- [Configuration](configuration.md) — customize `.ai-factory.json` and MCP servers
