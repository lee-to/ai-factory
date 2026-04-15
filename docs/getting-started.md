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
| Kilo Code | `.kilocode/` | `.kilocode/skills/`, `.kilocode/workflows/` |
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

When Claude Code is selected, AI Factory installs bundled Claude agent files into `.claude/agents/` and tracks them in `.ai-factory.json` with the universal `agentsDir`, `installedAgentFiles`, and `managedAgentFiles` fields. Extensions can also provide agent files for Codex or extension-defined runtimes. Claude-specific bundled roles are documented in [Subagents](subagents.md).

MCP server configuration is supported for Claude Code, Cursor, GitHub Copilot, Roo Code, Kilo Code, OpenCode, and Qwen Code. Other agents get skills installed with correct paths but without MCP auto-configuration.

## Your First Project

```bash
# 1. Install AI Factory
npm install -g ai-factory

# 2. Go to your project
cd my-project

# 3. Initialize — pick agents, install skills, configure MCP
ai-factory init
# Or non-interactively: ai-factory init --agents claude --mcp github,playwright

# 4. Open your AI agent (Claude Code, Cursor, etc.) and run:
/aif

# 5. Optional discovery before planning
/aif-explore Add user authentication with OAuth

# 6. Start building
/aif-plan Add user authentication with OAuth
```

If scope is unclear, start with `/aif-explore` (optionally save results to `paths.research`, default: `.ai-factory/RESEARCH.md`); if the task is clear but the answer must be strictly verified, use `/aif-grounded`; if the direction is already clear, jump straight to `/aif-plan`. From there, AI Factory builds a plan, optionally creates a branch/worktree when git settings allow it, and you run `/aif-implement` to execute it step by step.

## CLI Commands

```bash
# Initialize project (interactive wizard)
ai-factory init

# Initialize non-interactively with flags
ai-factory init --agents claude,codex --mcp playwright,github
ai-factory init --agents cursor --skills commit,plan
ai-factory init --agents claude --no-skills --mcp github

# Update skills to latest version (also checks for CLI updates)
ai-factory update

# Force clean reinstall of currently installed base skills
ai-factory update --force

# Migrate existing skills from v1 naming to v2 naming
ai-factory upgrade

# Install an extension (local path, git URL, or npm package)
ai-factory extension add ./my-extension

# List installed extensions
ai-factory extension list

# Update extensions from their sources
ai-factory extension update

# Update a specific extension (use --force to refresh unchanged versions)
ai-factory extension update my-extension --force

# Remove extension
ai-factory extension remove my-extension
```

For v1 -> v2 migration, run `ai-factory upgrade` to rename old skills to the new `aif-*` prefix.

`ai-factory update` now:
- Checks for extension updates from their sources (npm, GitHub, etc.) before updating base skills
- Prints per-agent status buckets for base skills (`changed`, `unchanged`, `skipped`, `removed`)
- For runtimes with managed agent files, also refreshes bundled package-managed agent files (Claude today) and prints a separate `Agent files` status block
- Skills newly available in the package but not previously installed are shown as `skipped` (not auto-installed)

## Next Steps

- [Development Workflow](workflow.md) — understand the full flow from plan to commit
- [Reflex Loop](loop.md) — run iterative generate → evaluate → critique → refine cycles
- [Core Skills](skills.md) — all available slash commands
- [Configuration](configuration.md) — customize `.ai-factory.json` and MCP servers
