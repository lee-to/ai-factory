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
| Codex app | `.agents/` | `.agents/skills/` |
| GitHub Copilot | `.github/` | `.github/skills/` |
| Gemini CLI | `.gemini/` | `.gemini/skills/` |
| Junie | `.junie/` | `.junie/skills/` |
| Qwen Code | `.qwen/` | `.qwen/skills/` |
| Universal / Other | `.agents/` | `.agents/skills/` |

When Claude Code is selected, AI Factory installs bundled Claude agent files into `.claude/agents/` and tracks them in `.ai-factory.json` with the universal `agentsDir`, `installedAgentFiles`, and `managedAgentFiles` fields. When Codex CLI is selected, AI Factory also installs bundled Codex native agent TOML files into `.codex/agents/` plus a managed `.codex/config.toml`. That Codex bundle is currently the baseline planning / implementation / review layer, not full parity with the broader Claude bundle, and `.codex/config.toml` is intentionally AI-Factory-managed. Extensions can additionally provide agent files for Codex or extension-defined runtimes through the same generic agent-files mechanism, but the bundled Claude/Codex package inventory is documented separately in [Subagents](subagents.md).

Codex CLI and Codex app receive Codex-style skill content and use `$aif-*` invocations. Slash-command runtimes keep `/aif-*` examples. Because Codex app and Universal both write to `.agents/skills/` with different invocation styles, select one of those runtimes per project.

MCP server configuration is supported for Claude Code, Cursor, GitHub Copilot, Roo Code, Kilo Code, OpenCode, Qwen Code, and Codex app. Other agents get skills installed with correct paths but without MCP auto-configuration.

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
# Codex CLI and Codex app use: $aif

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

# Audit artifact metadata links (frontmatter id/depends_on/affects/etc.)
ai-factory audit-artifacts

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

See [Plan Files](plan-files.md) for the artifact frontmatter schema, default scan paths, `--json` output, `--strict` exit behavior, and path boundary rules.

### `ai-factory init` Flags

- `--agents` - Comma-separated target agents (for example `claude,codex`)
- `--skills` - Comma-separated skill set to install instead of full defaults
- `--no-skills` - Skip base skill installation (useful when only MCP setup is needed)
- `--mcp` - Comma-separated MCP servers to configure (`github`, `postgres`, `filesystem`, `chrome-devtools`, `playwright`)

### Upgrade from v1 to v2

Run `ai-factory upgrade` to migrate old bare-named skills (`commit`, `feature`, etc.) to `aif-*` names. Custom skills are preserved.

`ai-factory update` now:
- Checks whether a newer `ai-factory` package is available and prints the exact global install command when package-level CLI features require an npm package update
- Checks for extension updates from their sources (npm, GitHub, etc.) before updating base skills
- Prints per-agent status buckets for base skills (`changed`, `unchanged`, `skipped`, `removed`)
- For runtimes with managed agent files, refreshes bundled package-managed agent files and prints a separate `Agent files` status block
- For Codex CLI, also refreshes managed `.codex/config.toml` and prints a separate `Config files` status block; drift in that file may be overwritten to restore AI-Factory-managed defaults
- Skills newly available in the package but not previously installed are shown as `skipped` (not auto-installed)

### Documentation Commands

```bash
/aif-docs
/aif-docs --web
```

`/aif-docs` refreshes README + `docs/` from the current project context. `--web` additionally emits a static documentation site (`docs-html/`).

## Next Steps

- [Development Workflow](workflow.md) — understand the full flow from plan to commit
- [Reflex Loop](loop.md) — run iterative generate → evaluate → critique → refine cycles
- [Core Skills](skills.md) — all available slash commands
- [Configuration](configuration.md) — customize `.ai-factory.json` and MCP servers
