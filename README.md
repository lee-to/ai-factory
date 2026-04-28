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
- **Multi-agent support** — Claude Code, Cursor, Windsurf, Roo Code, Kilo Code, Antigravity, OpenCode, Warp, Zencoder, Codex CLI, GitHub Copilot, Gemini CLI, Junie, Qwen Code, or [any agent](https://aif.cutcode.dev/docs/getting-started#supported-agents)

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

Need CLI flags, update/upgrade details, or extension commands? See [Getting Started](https://aif.cutcode.dev/docs/getting-started) for CLI flags, update/upgrade details, extension commands, supported agents, and slash-command reference.

## Example Workflow

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

See the full [Development Workflow](https://aif.cutcode.dev/docs/essentials/development-workflow) with diagram and decision table.

---

## Documentation

Full documentation is available at [aif.cutcode.dev/docs](https://aif.cutcode.dev/docs/).

## Links
- [Official Website](https://aif.cutcode.dev) - AI Factory website
- [aif-handoff](https://github.com/lee-to/aif-handoff) - Autonomous Kanban board built on AI Factory
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
