[← Extensions](extensions.md) · [Back to README](../README.md) · [Config Reference →](config-reference.md)

# Configuration

## `.ai-factory.json`

```json
{
  "version": "2.8.0",
  "agents": [
    {
      "id": "claude",
      "skillsDir": ".claude/skills",
      "agentsDir": ".claude/agents",
      "installedSkills": ["aif", "aif-plan", "aif-improve", "aif-implement", "aif-commit", "aif-build-automation"],
      "installedAgentFiles": [
        "best-practices-sidecar.md",
        "commit-preparer.md",
        "docs-auditor.md",
        "implement-coordinator.md",
        "implement-worker.md",
        "loop-critic.md",
        "loop-evaluator.md",
        "loop-invariant-prep.md",
        "loop-orchestrator.md",
        "loop-perf-prep.md",
        "loop-planner.md",
        "loop-producer.md",
        "loop-refiner.md",
        "loop-test-prep.md",
        "plan-coordinator.md",
        "plan-polisher.md",
        "review-sidecar.md",
        "security-sidecar.md"
      ],
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
      "agentsDir": ".codex/agents",
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
  ]
}
```

The `agents` array can include any built-in agent IDs plus runtime IDs provided by installed extensions. Each agent keeps its own `skillsDir`, installed skills list, and MCP preferences. Runtimes that support custom agent files also persist `agentsDir` and `installedAgentFiles`, so `ai-factory update` can refresh package-managed agent files alongside skills. AI Factory additionally stores internal `managedSkills` and `managedAgentFiles` hash maps in `.ai-factory.json`; they are omitted from the example above for brevity. `loadConfig()` still reads legacy Claude-only `subagentsDir`, `installedSubagents`, and `managedSubagents` keys for backward compatibility, but new saves use the universal field names.

The optional `extensions` array tracks installed extensions by name, original source, and version. `ai-factory update` now refreshes these extensions from their saved sources before base-skill updates, and `ai-factory extension update [name] --force` refreshes them without running the full base-skill update flow.

Extension refresh uses the saved `source` field:

- npm sources are checked against the npm registry and skipped when the published version is unchanged
- GitHub sources fetch `extension.json` through the GitHub API before cloning
- local paths and non-GitHub git sources require `--force` for refresh

When GitHub-backed extension refreshes are frequent, set `GITHUB_TOKEN` to raise the GitHub API rate limit used by these checks.

## `.ai-factory/config.yaml` — User Preferences

User-editable configuration file for language, paths, workflow settings, and rules hierarchy. Created by `/aif` during project setup.

For the complete key-by-key schema plus the built-in skill read/write matrix, see [Config Reference](config-reference.md).

**Two-file architecture:**
- `.ai-factory.json` — CLI state (agents, installed skills, MCP config) — managed by ai-factory package
- `config.yaml` — User preferences (language, paths, workflow) — edited by developers

```yaml
# AI Factory Configuration
# All sections are optional — defaults are used when not specified.

# Language Settings
language:
  # Language for AI-agent communication (prompts, questions, explanations)
  # Options: en, ru, de, fr, es, zh, ja, ko, pt, it
  ui: en

  # Language for generated artifacts (plans, specs, documentation)
  artifacts: en

  # How to handle technical terms: keep | translate
  technical_terms: keep

# Path Configuration (all relative to project root)
paths:
  description: .ai-factory/DESCRIPTION.md
  architecture: .ai-factory/ARCHITECTURE.md
  docs: docs/
  roadmap: .ai-factory/ROADMAP.md
  research: .ai-factory/RESEARCH.md
  rules_file: .ai-factory/RULES.md
  plan: .ai-factory/PLAN.md
  plans: .ai-factory/plans/
  fix_plan: .ai-factory/FIX_PLAN.md
  security: .ai-factory/SECURITY.md
  references: .ai-factory/references/
  patches: .ai-factory/patches/
  evolutions: .ai-factory/evolutions/
  evolution: .ai-factory/evolution/
  specs: .ai-factory/specs/
  rules: .ai-factory/rules/

# Workflow Settings
workflow:
  auto_create_dirs: true           # Create .ai-factory/ directories when missing
  plan_id_format: slug             # slug | timestamp | uuid
  analyze_updates_architecture: true
  architecture_updates_roadmap: true
  verify_mode: normal              # strict | normal | lenient

# Git Settings
git:
  enabled: true                    # Set false for non-git repositories
  base_branch: main                # Diff / review / merge target when git is enabled
  create_branches: true            # Full plans may create branches when enabled
  branch_prefix: feature/          # Prefix for auto-created plan branches
  skip_push_after_commit: false    # If true, /aif-commit skips push prompt after commit

# Rules Configuration
rules:
  base: .ai-factory/rules/base.md  # Base rules file
  # api: .ai-factory/rules/api.md
  # frontend: .ai-factory/rules/frontend.md
  # backend: .ai-factory/rules/backend.md
  # database: .ai-factory/rules/database.md
```

**Current config-aware skills** read `config.yaml` at Step 0. This currently includes:
- Core workflow and quality commands: `/aif`, `/aif-plan`, `/aif-implement`, `/aif-verify`, `/aif-commit`, `/aif-review`, `/aif-roadmap`, `/aif-explore`, `/aif-loop`, `/aif-rules`
- Additional utility commands: `/aif-architecture`, `/aif-docs`, `/aif-fix`, `/aif-improve`, `/aif-evolve`, `/aif-reference`, `/aif-security-checklist`

Other skills are config-agnostic for now and rely on repository context, explicit arguments, or fixed non-configurable paths such as `skill-context`.

Current config-agnostic built-ins include `/aif-best-practices`, `/aif-build-automation`, `/aif-ci`, `/aif-dockerize`, `/aif-grounded`, and `/aif-skill-generator`.

**Git workflow semantics:**
- `git.enabled: false` disables branch/worktree assumptions entirely. `/aif-plan full` still creates a rich full plan, but it stores it in `paths.plans/<slug>.md` without running git commands.
- `git.base_branch` is the branch used for diff, review, verify, and merge guidance. Skills must not hardcode `main`.
- `git.create_branches: false` keeps git awareness enabled but disables automatic branch creation. This lets teams keep full plans without forcing branch-per-feature flow.
- `git.skip_push_after_commit: true` makes `/aif-commit` stop after local commit without showing push prompt.
- `paths.plan` remains the default fast-plan file. If you prefer fast plans inside `paths.plans/`, change `paths.plan` manually in `config.yaml`.
- `paths.docs` controls where `/aif-docs` writes the detailed documentation pages. `README.md` remains the landing page in the project root.

**Current schema limits:** `config.yaml` still leaves `.ai-factory/skill-context/` fixed by command contract. `README.md` and `docs-html/` remain fixed by current documentation workflow.

### Rules Hierarchy

AI Factory supports a three-level rules hierarchy:

1. **paths.rules_file** — Axioms (universal project rules)
   - Short, flat list of hard requirements
   - Managed by `/aif-rules`

2. **rules/base.md** — Project-specific base conventions
   - Naming conventions, module boundaries, error handling
   - Created by `/aif` from codebase analysis

3. **rules.<area>** — Area-specific rule file paths in `config.yaml`
   - Examples: `api`, `frontend`, `backend`, `database`
   - Created by `/aif-rules area:<name>`

Each area is a named config key whose value is the rule file path. Example: `rules.api: .ai-factory/rules/api.md`.

**Priority:** More specific rules win. `rules.api` > `rules/base.md` > `paths.rules_file`

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

After initialization (example for Claude Code — other agents use their own directory). Paths shown below are the default locations; many AI Factory artifacts can be relocated via `config.yaml`.

```
your-project/
├── .claude/                   # Agent config dir (varies: .cursor/, .codex/, .ai/, etc.)
│   ├── agents/
│   │   ├── best-practices-sidecar.md
│   │   ├── commit-preparer.md
│   │   ├── docs-auditor.md
│   │   ├── implement-coordinator.md
│   │   ├── implement-worker.md
│   │   ├── loop-critic.md
│   │   ├── loop-evaluator.md
│   │   ├── loop-invariant-prep.md
│   │   ├── loop-orchestrator.md
│   │   ├── loop-perf-prep.md
│   │   ├── loop-planner.md
│   │   ├── loop-producer.md
│   │   ├── loop-refiner.md
│   │   ├── loop-test-prep.md
│   │   ├── plan-coordinator.md
│   │   ├── plan-polisher.md
│   │   ├── review-sidecar.md
│   │   └── security-sidecar.md
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
│   │   ├── aif-reference/
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
│   ├── references/            # Knowledge references from external sources (from /aif-reference)
│   │   └── <topic>.md
│   ├── plans/                 # Plans from /aif-plan full
│   │   └── <branch-name>.md
│   ├── skill-context/         # Project-specific rules for built-in skills (from /aif-evolve)
│   │   ├── aif-fix/
│   │   │   └── SKILL.md
│   │   └── aif-review/
│   │       └── SKILL.md
│   ├── patches/               # Self-improvement patches (from /aif-fix)
│   │   └── 2026-02-07-14.30.md
│   ├── evolutions/            # Evolution logs (from /aif-evolve)
│   │   ├── 2026-02-08-10.00.md
│   │   └── patch-cursor.json  # Incremental evolve cursor (latest processed patch)
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

`/aif-loop` keeps state lean and resumable between sessions. Defaults are shown below; the base loop directory can be relocated via `paths.evolution`.

- `.ai-factory/evolution/current.json` — active loop pointer (to current run)
- `.ai-factory/evolution/<task-alias>/run.json` — current run snapshot (loop execution state)
- `.ai-factory/evolution/<task-alias>/history.jsonl` — append-only event history
- `.ai-factory/evolution/<task-alias>/artifact.md` — latest artifact output

For full phase contracts and stop conditions, see [Reflex Loop](loop.md).

## Evolution Cursor File

`/aif-evolve` uses a lightweight cursor to process patches incrementally. Defaults are shown below; patch and evolution-log directories can be relocated via `paths.patches` and `paths.evolutions`.

- `.ai-factory/evolutions/patch-cursor.json` — last processed patch marker
- First run (no cursor): evolve reads all patches
- Subsequent runs: evolve reads patches newer than the cursor (plus a small overlap window to catch missed points)
- To force a full rescan: delete `patch-cursor.json` and run `/aif-evolve` again

## Best Practices

### Artifact Ownership and Context Gates
- Keep context artifact ownership command-scoped (roadmap by `/aif-roadmap`, rules by `/aif-rules`, architecture by `/aif-architecture`, research by `/aif-explore`).
- Treat `/aif-commit`, `/aif-review`, and `/aif-verify` as read-only consumers of context artifacts by default.
- Use `WARN` for non-blocking gate findings (missing optional files, ambiguous mapping) and `ERROR` for blocking violations.

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
- [Config Reference](config-reference.md) — full `config.yaml` schema and skill usage matrix
- [Reflex Loop](loop.md) — contracts and storage layout for `/aif-loop`
- [Extensions](extensions.md) — writing and installing extensions
- [Security](security.md) — how external skills are scanned before use
