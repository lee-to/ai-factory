# AI Factory - Developer Guide

> This file is for AI agents working on this codebase. Read this first when starting a new session.

## What is this project?

**AI Factory** (v2) is an npm package + skill system that automates AI agent context setup for projects. It provides:

1. **CLI tool** (`ai-factory init/update/upgrade`) — installs skills and configures MCP
2. **Built-in skills** (21 skills, all `aif-*` prefixed) — workflow commands for spec-driven development
3. **Spec-driven workflow** — structured approach: plan → implement → commit
4. **Multi-agent support** — 14 agents (Claude Code, Cursor, Windsurf, Roo Code, Kilo Code, Antigravity, OpenCode, Warp, Zencoder, Codex CLI, GitHub Copilot, Gemini CLI, Junie, Universal)

## Project Structure

```
ai-factory/
├── src/                    # CLI source (TypeScript)
│   ├── cli/
│   │   ├── commands/       # init.ts, update.ts, upgrade.ts
│   │   └── wizard/         # prompts.ts, detector.ts
│   ├── core/               # installer.ts, config.ts, mcp.ts, agents.ts, template.ts, transformer.ts
│   │   └── transformers/   # default.ts, antigravity.ts, kilocode.ts
│   └── utils/              # fs.ts
├── skills/                 # Built-in skills (copied to user projects)
│   ├── aif/                           # Main setup skill
│   ├── aif-architecture/       # Architecture patterns
│   ├── aif-best-practices/     # Code quality guidelines
│   ├── aif-build-automation/   # Makefile/Taskfile/Justfile generator
│   ├── aif-ci/                 # GitHub Actions / GitLab CI generator
│   ├── aif-commit/             # Conventional commits
│   ├── aif-deploy/             # Deployment helper
│   ├── aif-dockerize/          # Docker/compose generator
│   ├── aif-docs/               # Documentation generation & maintenance
│   ├── aif-evolve/             # Self-improve skills based on context
│   ├── aif-fix/                # Quick bug fixes (no plans)
│   ├── aif-implement/          # Execute plan tasks
│   ├── aif-improve/            # Plan refinement (second iteration)
│   ├── aif-loop/               # Iterative reflex loop with quality gates
│   ├── aif-plan/               # Plan implementation (fast/full modes)
│   ├── aif-review/             # Code review
│   ├── aif-roadmap/            # Strategic project roadmap
│   ├── aif-rules/              # Project rules and conventions
│   ├── aif-security-checklist/ # Security audit
│   ├── aif-skill-generator/    # Generate new skills
│   ├── aif-verify/             # Verify implementation against plan
│   └── _templates/                    # Stack-specific templates
├── scripts/                # test-skills.sh
├── mcp/                    # MCP server templates
├── dist/                   # Compiled JS
└── bin/                    # CLI entry point
```

## Key Concepts

### Skills Location
- **Package skills**: `skills/` — source of truth, copied during install
- **User skills**: `<agent-config-dir>/skills/` (e.g. `.claude/skills/`, `.opencode/skills/`, `.agents/skills/`)
- **Agent transformer system**: `src/core/transformers/` adapts skill format per agent (e.g. Antigravity uses flat `.md` for workflow skills, KiloCode sanitizes dotted names)

### Working Directory
All AI Factory files in user projects go to `.ai-factory/`:
- `.ai-factory/DESCRIPTION.md` — project specification
- `.ai-factory/ARCHITECTURE.md` — architecture decisions and guidelines
- `.ai-factory/PLAN.md` — task plan (from /aif-plan fast)
- `.ai-factory/plans/<branch>.md` — plans (from /aif-plan full)
- `.ai-factory/evolution/current.json` — active loop pointer (from /aif-loop)
- `.ai-factory/evolution/<alias>/run.json` — current loop state
- `.ai-factory/evolution/<alias>/history.jsonl` — loop event history (append-only)
- `.ai-factory/evolution/<alias>/artifact.md` — latest loop artifact output

### Skill Naming (v2)
All skills use `aif-` prefix (v1 used bare names like `commit`, `feature`):
- `/aif` — main setup
- `/aif-plan`
- `/aif-implement`
- `/aif-roadmap`
- `/aif-rules`
- `/aif-commit`
- `/aif-docs`
- etc.

The `ai-factory upgrade` command migrates from v1 bare names to v2 prefixed names.

## Workflow Logic

```
/aif (3 scenarios)
    ↓
Check: has arguments? has project files?
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Mode 1: Existing project (no args + has package.json, etc.) │
│   → Analyze project → Generate DESCRIPTION.md → Setup       │
├─────────────────────────────────────────────────────────────┤
│ Mode 2: New project with description                        │
│   → Interactive stack selection → DESCRIPTION.md → Setup    │
├─────────────────────────────────────────────────────────────┤
│ Mode 3: Empty project (no args + no config files)           │
│   → Ask "What are you building?" → Stack selection → Setup  │
└─────────────────────────────────────────────────────────────┘
    ↓
/aif-architecture → Generate ARCHITECTURE.md
    ↓
STOP (does NOT implement)

/aif-roadmap [vision or requirements]
    ↓
Reads .ai-factory/DESCRIPTION.md + ARCHITECTURE.md for context
    ↓
First run → explores codebase, asks user for goals → generates .ai-factory/ROADMAP.md
Subsequent → review progress, add/reprioritize/mark milestones done
    ↓
ROADMAP.md = strategic checklist of high-level goals

/aif-plan [fast|full] <description>
    ↓
Reads .ai-factory/DESCRIPTION.md + ARCHITECTURE.md for context
    ↓
fast → no branch, saves to .ai-factory/PLAN.md
full → creates git branch, asks: tests? logging? docs?
       saves to .ai-factory/plans/<branch>.md
    ↓
Explores codebase
    ↓
Creates tasks with TaskCreate
    ↓
For 5+ tasks: includes commit checkpoints

/aif-loop [new|resume|status|stop|list|history|clean]
    ↓
Reads .ai-factory/DESCRIPTION.md + ARCHITECTURE.md + RULES.md for context
    ↓
Creates/loads .ai-factory/evolution/current.json
    ↓
Creates/loads .ai-factory/evolution/<alias>/run.json + history.jsonl + artifact.md
    ↓
Always asks explicit confirmation for success criteria and max iterations before iteration 1 (even if included in task prompt)
    ↓
Runs 6 phases: PLAN → PRODUCE||PREPARE → EVALUATE → CRITIQUE → REFINE
    ↓
PRODUCE and PREPARE run in parallel (Task tool); EVALUATE runs check groups in parallel
    ↓
Stops on: quality threshold, no major issues, stagnation, or max iterations (default 4)
    ↓
If stopped by max iterations without meeting criteria, final summary shows distance-to-success (score/threshold gap + remaining blocking fail rules)

/aif-implement
    ↓
Reads .ai-factory/DESCRIPTION.md + ARCHITECTURE.md for context
    ↓
Finds plan file (PLAN.md or branch-named)
    ↓
Executes tasks one by one
    ↓
Updates DESCRIPTION.md if stack changes
    ↓
Prompts for commits at checkpoints
    ↓
Checks .ai-factory/ROADMAP.md → marks completed milestones
    ↓
Offers to delete PLAN.md when done (keeps feature-*.md)

/aif-fix <bug description>
    ↓
Reads .ai-factory/DESCRIPTION.md + patches for context
    ↓
Investigates codebase (Glob, Grep, Read)
    ↓
Implements fix WITH logging ([FIX] prefix)
    ↓
Suggests test coverage for the bug
    ↓
Creates self-improvement patch in .ai-factory/patches/
    ↓
NO plans, NO reports

/aif-evolve [skill-name|"all"]
    ↓
Reads .ai-factory/DESCRIPTION.md + all patches
    ↓
Analyzes recurring patterns and tech-specific pitfalls
    ↓
Reads current skills → identifies gaps
    ↓
Proposes targeted improvements → user approves
    ↓
Applies improvements to skills
    ↓
Saves evolution log to .ai-factory/evolutions/
```

## Skill Frontmatter Patterns

### Action skills (user-only)
```yaml
disable-model-invocation: true  # User must invoke explicitly
allowed-tools: Bash(git *) Write Edit
```
Used by: plan, implement, commit, deploy

### Reference skills (model + user)
```yaml
# No disable-model-invocation - Claude can use automatically
allowed-tools: Read Glob Grep
```
Used by: best-practices, architecture, security-checklist, review

## Development Commands

```bash
# Build TypeScript
npm run build

# Run tests (validates all skills + negative tests + codebase integrity)
npm test

# Link globally for testing
npm link

# Test in a project
cd /some/project
ai-factory init

# Update skills after changes
ai-factory update

# Upgrade from v1 to v2 (removes old bare-named skills, installs aif-* prefixed)
ai-factory upgrade
```

## Key Files to Know

| File | Purpose |
|------|---------|
| `src/cli/index.ts` | CLI entry point, registers init/update/upgrade commands |
| `src/cli/commands/init.ts` | Interactive wizard: detect stack, select skills, configure MCP |
| `src/cli/commands/update.ts` | Re-install all skills, preserve custom skills |
| `src/cli/commands/upgrade.ts` | v1→v2 migration: remove old bare names, install prefixed |
| `src/cli/wizard/prompts.ts` | Interactive CLI questions |
| `src/cli/wizard/detector.ts` | Stack detection logic |
| `src/core/agents.ts` | Agent registry (14 agents) |
| `src/core/installer.ts` | Copies skills to project |
| `src/core/mcp.ts` | MCP server configuration |
| `src/core/template.ts` | `{{var}}` template substitution in SKILL.md |
| `src/core/transformer.ts` | AgentTransformer interface + registry |
| `src/core/transformers/` | Per-agent skill format adapters |
| `scripts/test-skills.sh` | Test suite (validate + negative tests + integrity) |
| `skills/aif-*/SKILL.md` | Skill instructions |

## Important Rules

1. **Skills don't implement** - `/aif` only sets up context
2. **DESCRIPTION.md is source of truth** - all skills read it for context
3. **Plans go to .ai-factory/** - keeps project root clean
4. **Search skills.sh first** - don't reinvent existing skills
5. **Verbose logging required** - all implementations must have configurable logging
6. **No tests unless asked** - respect user's testing preference
7. **Commit checkpoints** - for plans with 5+ tasks
8. **ARCHITECTURE.md is architecture source of truth** - all skills follow its folder structure and dependency rules

## Documentation Structure

User-facing documentation is split between a lean README and detailed `docs/` pages:

```
README.md                    # Landing page (~105 lines) — first impression, install, example workflow
docs/
├── getting-started.md       # What is AI Factory, supported agents table, first project walkthrough, CLI
├── workflow.md              # Workflow diagram, "When to Use What" table, workflow skills overview
├── loop.md                  # Reflex loop protocol: phases, rules, state, stop conditions
├── skills.md                # Full reference: Workflow Skills + Utility Skills
├── plan-files.md            # Plan files, self-improvement patches, skill acquisition strategy
├── security.md              # Two-level security scanning system
└── configuration.md         # .ai-factory.json, MCP config, project structure, best practices
```

### Principles

1. **README is a landing page, not a manual.** It should contain: logo, tagline, "Why?", install, quick start, example workflow, documentation links table, external links, license. Nothing else.
2. **Details go to `docs/`.** Each file is self-contained — one topic, one page. A user should be able to read a single doc file and get the full picture on that topic.
3. **No duplication.** If information lives in `docs/`, README links to it — does not repeat it. The only exception: installation command appears in both README and `docs/getting-started.md` (users expect it in README).
4. **Navigation.** Every docs/ file starts with `[← Back to README](../README.md)` and ends with a "See Also" section linking to 2-3 related pages. `getting-started.md` has "Next Steps" instead.
5. **Workflow skills vs utility skills.** `docs/workflow.md` describes the workflow skills (plan, loop, improve, implement, fix, evolve) with concise overviews. `docs/loop.md` is the source of truth for Reflex Loop contracts and state transitions. `docs/skills.md` has the full reference for ALL skills, split into "Workflow Skills" and "Utility Skills" sections.
6. **Cross-links use relative paths.** From README: `docs/workflow.md`. Between docs: `workflow.md` (same directory).

### When to Update What

| Change | Update |
|--------|--------|
| New skill added | `docs/skills.md` (add to appropriate section), `docs/workflow.md` (if it's a workflow skill), README Documentation table description (if skill count text changes) |
| New agent added | `docs/getting-started.md` (agents table), README (agent name in "Multi-agent support" bullet) |
| Workflow logic changed | `docs/workflow.md` (diagram + skill descriptions), `docs/skills.md` (detailed reference) |
| New config option | `docs/configuration.md` |
| Security scanning changed | `docs/security.md` |
| Plan file format changed | `docs/plan-files.md` |
| New CLI command | `docs/getting-started.md` (CLI Commands section) |
| Documentation conventions changed | `skills/aif-docs/SKILL.md` (principles and templates) |

## Common Changes

### Adding a new skill
1. Create `skills/aif-new-skill/SKILL.md` (must use `aif-` prefix)
2. Add to `getAvailableSkills()` if needed
3. Rebuild: `npm run build`
4. Validate: `npm test`

### Modifying workflow
1. Edit relevant skill in `skills/`
2. Update AGENTS.md if logic changes
3. Rebuild and test with `ai-factory update`
4. Validate: `npm test`

### Adding a new agent

To add support for a new AI coding agent:

1. **`src/core/agents.ts`** — add entry to `AGENT_REGISTRY`:
   ```ts
   newagent: {
     id: 'newagent',
     displayName: 'New Agent',
     configDir: '.newagent',          // where agent stores config
     skillsDir: '.newagent/skills',   // where skills are installed
     settingsFile: null,              // path to MCP settings file (null = no MCP)
     supportsMcp: false,              // true if agent supports MCP servers
   },
   ```
   - `settingsFile` is relative to project root (e.g. `.mcp.json` for Claude Code, `opencode.json` for OpenCode)
   - Set `supportsMcp: true` + provide `settingsFile` to enable MCP auto-configuration

2. **`src/core/mcp.ts`** — only if MCP format differs from Claude/Cursor standard:
   - Standard format: `{ mcpServers: { name: { command, args, env } } }`
   - If the agent uses a different structure (like OpenCode uses `{ mcp: { name: { type, command[], environment } } }`), add a branch in `configureMcp()` with format conversion
   - If MCP format matches standard — no changes needed

3. **Documentation** — update:
   - `docs/getting-started.md` — Supported Agents table
   - `docs/configuration.md` — MCP support mention (if applicable), agent IDs/entries in `.ai-factory.json` docs
   - `README.md` — agent name in "Multi-agent support" bullet, Links section

4. **`AGENTS.md`** — update Skills Location example if helpful

5. **`package.json`** — add agent name to `keywords`

6. **Build & test**: `npm run build && ai-factory init` — select the new agent, verify skills copy to correct dir and MCP config (if any) writes correct format

Template variables (`{{config_dir}}`, `{{skills_dir}}`, etc.) in skill `.md` files are substituted automatically by `src/core/template.ts` — no changes needed there.

### Changing CLI prompts
1. Edit `src/cli/wizard/prompts.ts`
2. Update types in `src/core/config.ts` if needed
3. Rebuild: `npm run build`

## Testing

### Automated tests

```bash
npm test
```

Runs `scripts/test-skills.sh` which validates:
1. **All skills pass validation** — runs `validate.sh` on every `skills/aif-*/`
2. **Negative tests** — ensures validator correctly rejects: dotted names, name/dir mismatch, missing name, consecutive hyphens, uppercase names, oversized frontmatter, unquoted bracket hints
3. **Codebase integrity** — no dotted `name:` fields in skills, no dotted slash-command invocations in docs

### Manual checklist

After changes, verify:
- [ ] `npm test` passes
- [ ] `ai-factory init` works in empty directory
- [ ] `ai-factory update` updates existing skills
- [ ] `ai-factory upgrade` migrates v1 → v2 correctly
- [ ] `/aif` in Claude Code shows interactive stack selection
- [ ] `/aif-plan` creates branch + plan file
- [ ] `/aif-implement` finds and executes plan
- [ ] Skills read `.ai-factory/DESCRIPTION.md`
