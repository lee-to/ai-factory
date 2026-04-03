<p align="center">
  <a href="https://www.npmjs.com/package/ai-factory">
    <img src="https://img.shields.io/npm/v/ai-factory?label=version" alt="Version" />
  </a>
  <a href="https://aif.cutcode.dev/">
    <img src="https://img.shields.io/badge/official%20site-aif.cutcode.dev-0ea5e9" alt="Official Site" />
  </a>
  <a href="https://github.com/lee-to/ai-factory/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/lee-to/ai-factory/ci.yml?branch=2.x&label=tests" alt="Tests" />
  </a>
</p>

![logo](https://github.com/lee-to/ai-factory/blob/2.x/art/aif1.jpg)

# AI Factory

> **Stop configuring. Start building.**

You want to build with AI, but setting up the right context, prompts, and workflows takes time. AI Factory handles all of that so you can focus on what matters — shipping quality code.

**One command. Full AI-powered development environment.**

```bash
ai-factory init
```

---

## Why AI Factory?

- **Zero configuration** — installs relevant skills, configures integrations
- **Best practices built-in** — logging, commits, code review, all following industry standards
- **Spec-driven development** — AI follows plans, not random exploration. Predictable, resumable, reviewable
- **Community skills** — leverage [skills.sh](https://skills.sh) ecosystem or generate custom skills
- **Stack-agnostic** — works with any language, framework, or platform
- **Multi-agent support** — Claude Code, Cursor, Windsurf, Roo Code, Kilo Code, Antigravity, OpenCode, Warp, Zencoder, Codex CLI, GitHub Copilot, Gemini CLI, Junie, Qwen Code, or [any agent](docs/getting-started.md#supported-agents)

---

## Installation

### Using npm

```bash
npm install -g ai-factory
```

### Using mise

```bash
mise use -g npm:ai-factory
```

## Quick Start

```bash
# In your project directory (interactive wizard)
ai-factory init

# Or non-interactive with flags
ai-factory init --agents claude,codex --mcp playwright,github
```

This will:
- Ask which AI agent you use (or use `--agents` flag)
- Install relevant skills (or use `--skills` flag)
- Configure MCP servers (or use `--mcp` flag)

Then open your AI agent and start working:

```
/aif
```

## Usage

If the package is installed:
```bash
ai-factory init
```

Or running without installation via `npx`:
```bash
npx ai-factory init
```

### Non-interactive mode

Pass `--agents` to skip the interactive wizard:

```bash
# Agents + MCP servers
ai-factory init --agents claude,cursor --mcp github,playwright

# With specific skills
ai-factory init --agents claude --skills commit,plan

# Without base skills
ai-factory init --agents codex --no-skills --mcp github
```

Available MCP servers: `github`, `postgres`, `filesystem`, `chrome-devtools`, `playwright`

### Upgrading from v1 to v2

```bash
ai-factory upgrade
```

`ai-factory upgrade` removes old bare-named skills (`commit`, `feature`, etc.) and installs new `aif-*` prefixed versions. Custom skills are preserved.

> **Note:** `ai-factory update` automatically checks npm for a newer CLI version and offers to install it before updating skills, then reports `changed/unchanged/skipped/removed` for installed base skills. Use `ai-factory update --force` for a clean reinstall of currently installed base skills.

### Example Workflow

```bash
# Explore options and requirements before planning (optional)
/aif-explore Add user authentication with OAuth

# Need a strictly verified answer before changing anything?
/aif-grounded Does this repo already support OAuth providers?

# Plan a feature — creates branch, analyzes codebase, builds step-by-step plan
/aif-plan Add user authentication with OAuth

# Optionally refine the plan with deeper analysis
/aif-improve

# Execute the plan — implements tasks one by one, commits at checkpoints
/aif-implement

# Create a knowledge reference from docs AI doesn't know about
/aif-reference https://docs.example.com/api-reference --name example-api

# Fix a bug — AI learns from every fix and gets smarter over time
/aif-fix TypeError: Cannot read property 'name' of undefined

# Set up CI pipeline — GitHub Actions or GitLab CI with linting, SA, tests
/aif-ci github

# Generate project documentation — README + docs/ with topics
/aif-docs
```

See the full [Development Workflow](docs/workflow.md) with diagram and decision table.

### Auto-Generated Documentation

AI Factory can generate and maintain your project docs with a single command:

```bash
/aif-docs          # Creates README + docs/ structure from your codebase
/aif-docs --web    # Also generates a static HTML documentation site
```

- **Generates docs from scratch** — analyzes your codebase and creates a lean README + detailed `docs/` pages by topic
- **Cleans up scattered files** — finds loose CONTRIBUTING.md, ARCHITECTURE.md, SETUP.md in your root and consolidates them into a structured `docs/` directory
- **Keeps docs in sync** — integrates with `/aif-implement` docs policy (`Docs: yes` = mandatory docs checkpoint routed to `/aif-docs`, `Docs: no` = visible `WARN [docs]`)
- **Builds a docs website** — `--web` generates a static HTML site with navigation and dark mode, ready to host

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | What is AI Factory, supported agents, CLI commands |
| [Development Workflow](docs/workflow.md) | Workflow diagram, when to use `explore` vs `grounded`, spec-driven approach |
| [Reflex Loop](docs/loop.md) | Iterative generate → evaluate → critique → refine workflow |
| [Subagents](docs/subagents.md) | Claude Code only: repo-local planning, implementation, and loop subagents with narrow role contracts |
| [Core Skills](docs/skills.md) | All slash commands — explore, grounded, plan, fix, implement, evolve, docs, and more |
| [Skill Evolution](docs/evolve.md) | How /aif-fix patches feed into /aif-evolve to generate smarter skill rules |
| [Plan Files](docs/plan-files.md) | Plan files, self-improvement patches, skill acquisition |
| [Security](docs/security.md) | Two-level security scanning for external skills |
| [Extensions](docs/extensions.md) | Writing and installing extensions — commands, injections, MCP, agents |
| [Configuration](docs/configuration.md) | `.ai-factory.json`, MCP servers, project structure, best practices |
| [Config Reference](docs/config-reference.md) | Full `config.yaml` key reference and skill read/write matrix |

---

![happy](https://github.com/ilhm344/ai-factory/blob/2.x/art/aif2.jpg)

## AIF Handoff

Looking for an **Autonomous Kanban board where AI agents plan, implement, and review your tasks**? Check out [aif-handoff](https://github.com/lee-to/aif-handoff) — a visual task management system built on top of AI Factory.

![ui-light](https://github.com/lee-to/aif-handoff/blob/main/art/ui-light.png)
![ui-dark](https://github.com/lee-to/aif-handoff/blob/main/art/ui-dark.png)
![ui-light-list](https://github.com/lee-to/aif-handoff/blob/main/art/ui-light-list.png)
![ui-dark-list](https://github.com/lee-to/aif-handoff/blob/main/art/ui-dark-list.png)

## Links

- [Official Website](https://aif.cutcode.dev) - AI Factory website
- If AI Factory feels too simple for your goals, try [HLV](https://github.com/lee-to/hlv)
- [skills.sh](https://skills.sh) - Skill marketplace
- [Agent Skills Spec](https://agentskills.io) - Skill specification
- [Claude Code](https://claude.ai/code) - Anthropic's AI coding agent
- [Cursor](https://cursor.com) - AI-powered code editor
- [OpenCode](https://opencode.ai) - Open-source AI coding agent
- [Roo Code](https://roocode.com) - AI coding agent for VS Code
- [Kilo Code](https://kilo.ai) - Open-source agentic coding platform
- [Windsurf](https://windsurf.com) - AI-powered code editor by Codeium
- [Warp](https://www.warp.dev) - Intelligent terminal with AI agent
- [Zencoder](https://zencoder.ai) - AI coding agent for VS Code and JetBrains
- [Codex CLI](https://github.com/openai/codex) - OpenAI's coding agent
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) - Google's coding agent
- [Antigravity](https://antigravity.dev) - AI coding agent
- [Junie](https://www.jetbrains.com/junie/) - JetBrains' AI coding agent

## License

MIT
