# Project Documentation Integration

After writing the build file, integrate the quick commands into the project's documentation. This step ensures that developers can discover commands not just via `make help` / `task --list` / `just` / `mage -l`, but also in the docs they already read.

## Quick Reference Block

Build a `QUICK_REFERENCE` block — a compact markdown table or code block listing the most important commands:

```markdown
## Quick Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start development server |
| `make test` | Run tests |
| `make lint` | Run linters |
| `make build` | Build for production |
| `make docker-dev` | Start dev environment in Docker |
| `make docker-prod-build` | Build production Docker image |
| `make clean` | Remove build artifacts |
```

Adapt the command prefix (`make` / `task` / `just` / `mage`) to match `TARGET_TOOL`.

## 7.1 Update Existing Markdown Files

Scan for markdown files that already contain command/usage sections:

```
Grep in *.md: "## Commands\b|## Quick Start\b|## Usage\b|## Development\b|## Getting Started\b|## How to Run\b|```sh|```bash"
```

For each matching file:
- Read the file and find the relevant section
- Check if it already lists commands for the generated tool — if so, update the command list to match the new/enhanced build file
- If the section exists but doesn't mention our build tool, **append** the quick reference block after the existing commands
- Do NOT delete or rewrite existing content — only add or update the command references

**Be conservative**: only touch files that clearly have a "commands" or "getting started" section. Don't inject commands into unrelated markdown files.

## 7.2 Update Project README

```
Glob: README.md, README.rst, readme.md
```

If a README exists:
- Check if it has a commands/usage/development section (same grep patterns as 7.1)
- If yes → update/append the quick reference there
- If no → add a `## Quick Commands` section before the last section (typically "License" or "Contributing"), or at the end if no such section exists
- Keep it concise — link to the build file for the full list: `Run \`make help\` for all available targets.`

## 7.3 AGENTS.md Integration

```
Glob: AGENTS.md, agents.md, CLAUDE.md, claude.md, .github/copilot-instructions.md, .cursorrules, .cursor/rules/*.md
```

**If an agent instruction file exists** (AGENTS.md, CLAUDE.md, etc.):
- Read it and check if it already has a build/commands section
- If no build section → append a section with quick commands that AI agents should use:

```markdown
## Build & Development Commands

This project uses [Makefile|Taskfile|justfile|Magefile] for build automation.

Common commands:
- `make test` — always run tests before committing
- `make lint` — run linters, fix issues before pushing
- `make build` — verify the project builds cleanly
- `make docker-dev` — start the full dev environment

Run `make help` for all available targets.
```

- If a build section already exists → update it to reflect the current targets

**If NO agent instruction file exists**, suggest creating one:

```
AskUserQuestion: This project doesn't have an AGENTS.md (AI agent instructions). Should I create one with build commands?

Options:
1. Create AGENTS.md — Add build commands and basic project instructions for AI agents
2. Skip — Don't create agent instructions
```

If the user chooses to create it, generate a minimal `AGENTS.md` with:
- Project name and brief description (from `PROJECT_PROFILE` or `.ai-factory/DESCRIPTION.md`)
- Build commands section (as above)
- Key project conventions (language, test framework, linter — so AI agents run the right commands)

## 7.4 Summary of Documentation Changes

After all doc updates, append to the Step 6 summary:

```
### Documentation Updated
- README.md — Added Quick Commands section
- AGENTS.md — Created with build commands
- docs/getting-started.md — Updated command examples
```
