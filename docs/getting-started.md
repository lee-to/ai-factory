[← Back to README](../README.md) · Next: [Development Workflow →](workflow.md)

# Getting Started

## What is AI Factory?

AI Factory is a **stack-agnostic** CLI tool and skill system that works with any language, framework, or platform:

1. **Analyzes your project** — understands your codebase structure and conventions
2. **Installs relevant skills** — downloads from [skills.sh](https://skills.sh) or generates custom ones
3. **Configures MCP servers** — GitHub, Postgres, Filesystem, Playwright based on your needs
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
| Qwen Code | `.qwen/` | `.qwen/skills/` |
| Universal / Other | `.agents/` | `.agents/skills/` |

MCP server configuration is supported for Claude Code, Cursor, GitHub Copilot, Roo Code, Kilo Code, OpenCode, and Qwen Code. Other agents get skills installed with correct paths but without MCP auto-configuration.

## Your First Project

```bash
# 1. Install AI Factory
npm install -g ai-factory

# 2. Go to your project
cd my-project

# 3. Initialize — pick agents, install skills, configure MCP
ai-factory init

# 4. Open your AI agent (Claude Code, Cursor, etc.) and run:
/aif

# 5. Optional discovery before planning
/aif-explore Add user authentication with OAuth

# 6. Start building
/aif-plan Add user authentication with OAuth
```

If scope is unclear, start with `/aif-explore` (optionally save results to `.ai-factory/RESEARCH.md`); if it is already clear, jump straight to `/aif-plan`. From there, AI Factory creates a branch (full mode), builds a plan, and you run `/aif-implement` to execute it step by step.

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

# Install an extension (local path, git URL, or npm package)
ai-factory extension add ./my-extension

# List installed extensions
ai-factory extension list

# Remove extension
ai-factory extension remove my-extension

# Initialize built-in subagent profiles (planner + parallel implementers)
ai-factory subagent init

# List subagent routing and profiles
ai-factory subagent list

# Run plan scouting subagent for focused discovery
ai-factory subagent run-plan "auth + billing impact"

# Run implement orchestration for independent tasks in .ai-factory/PLAN.md
ai-factory subagent run-implement

# Check recent subagent runs/artifacts
ai-factory subagent status
```

For v1 -> v2 migration, run both commands in order:
1. `npm install -g ai-factory@latest`
2. `ai-factory upgrade`

## Next Steps

- [Development Workflow](workflow.md) — understand the full flow from plan to commit
- [Reflex Loop](loop.md) — run iterative generate → evaluate → critique → refine cycles
- [Core Skills](skills.md) — all available slash commands
- [Configuration](configuration.md) — customize `.ai-factory.json` and MCP servers
