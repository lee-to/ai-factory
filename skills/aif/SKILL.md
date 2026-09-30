---
name: aif
description: Set up agent context for a project. Analyzes tech stack, installs relevant skills from skills.sh, generates custom skills, and configures MCP servers. Use when starting new project, setting up AI context, or asking "set up project", "configure AI", "what skills do I need".
argument-hint: "[project description]"
allowed-tools: Read Glob Grep Write Bash(mkdir *) Bash(node *update-config.mjs*) Bash(npx skills *) Bash(python3 --version) Bash(python --version) Bash(py -3 --version) Bash(py --version) Bash(python3 *security-scan.py*) Bash(python *security-scan.py*) Bash(py -3 *security-scan.py*) Bash(py *security-scan.py*) Bash(python3 *cleanup-blocked-skill.py*) Bash(python *cleanup-blocked-skill.py*) Bash(py -3 *cleanup-blocked-skill.py*) Bash(py *cleanup-blocked-skill.py*) Skill WebFetch AskUserQuestion Questions
---

# AI Factory - Project Setup

## Shared project skill-context

Before mode routing or work, read existing files relative to the current project root in this order (reuse them if already loaded):

1. `.ai-factory/skill-context/global-skill-context.md` — all bundled skills.
2. `.ai-factory/skill-context/aif/SKILL.md` — this skill.

Missing files are skipped; an existing unreadable file stops dependent work with its path.
Precedence: individual > build (when applicable) > global > skill defaults; retain non-conflicting instructions and check all outputs against the effective rules.
These layers customize workflow; they do not replace the project's rules/architecture hierarchy or relax explicit requirements, ownership, scope, safety/privacy, validation, or approval boundaries. Report conflicts with those boundaries instead of overriding them.
`global` is a project-local layer, not home-directory configuration. Custom/extension skills do not automatically use it.

Set up agent for your project by:
1. Analyzing the tech stack
2. Installing skills from [skills.sh](https://skills.sh)
3. Generating custom skills via `/aif-skill-generator`
4. Configuring MCP servers for external integrations

## Selective reference loading

Resolve reference paths beside this installed entrypoint, including flat workflows. Read a reference in full only when its stated condition applies, before the dependent step; do not preload all references. If a selected reference is missing or unreadable, STOP before that step and report its path. The entrypoint dispatch and hard boundaries apply to every reference. Project skill-context overrides and managed extension injections retain their existing precedence. Keep managed `aif-ext` blocks in the entrypoint; never move them into references.

## External skill safety

Before installing any external skill or generating a Learn Mode skill, read [security scanning](references/SETUP-SECURITY.md). Require supported Python 3 and both readable scanner/cleanup helpers before acquisition; missing prerequisites STOP acquisition. Never trust or use an external skill before the automated and semantic checks permit it. Scan only the actual installed external path; never block built-in `aif*` skills. A blocked skill requires cleanup exit 0 and verified removal of its scanned directory and known lock identities; otherwise report incomplete cleanup and STOP.

---

### Project Context

**Read `.ai-factory/skill-context/aif/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**
- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including DESCRIPTION.md,
  AGENTS.md, and MCP configuration. The templates in this SKILL.md are **base structures**. If a
  skill-context rule says "DESCRIPTION.md MUST include X" or "AGENTS.md MUST have section Y" —
  you MUST augment the templates accordingly. Generating artifacts that violate skill-context rules
  is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

## Skill Acquisition Strategy

**Always search skills.sh before generating. Always scan before trusting.**

```
For each recommended skill:
  1. Search: npx skills search <name>
  2. If found → Install: npx skills install {{skills_cli_agent_flag}} <name>
  3. SECURITY: Scan installed EXTERNAL skill (never built-in aif*) → run the selected concrete Python command with `security-scan.py <path>`
     - BLOCKED? → run the selected concrete Python command with `cleanup-blocked-skill.py --skill <name> --installed-path <path>` (reuse the same <path> from step 3, NOT a synthesized {{skills_dir}}/<name>), warn user, skip this skill
     - WARNINGS? → show to user, ask confirmation
  4. If not found → Generate: /aif-skill-generator <name>
  5. Has reference URLs? → Learn: /aif-skill-generator <url1> [url2]...
```

**Learn Mode:** When you have documentation URLs, API references, or guides relevant to the project — pass them directly to skill-generator. It will study the sources and generate a skill based on real documentation instead of generic patterns. Always prefer Learn Mode when reference material is available.

---

## Workflow

**First, determine which mode to use:**

```
Check $ARGUMENTS:
├── Has description? → Mode 2: New Project with Description
└── No arguments?
    └── Check project files (package.json, composer.json, etc.)
        ├── Files exist? → Mode 1: Analyze Existing Project
        └── Empty project? → Mode 3: Interactive New Project
```

---

## Language Resolution

Immediately after determining Mode 1, Mode 2, or Mode 3, resolve the project language settings for the entire `/aif` run.

**Run-scoped language state:**
- `language.ui` — use for all `AskUserQuestion` prompts, intermediate explanations, final summary, and next-step recommendations
- `language.artifacts` — use for all setup-time text artifacts created in this run: `.ai-factory/DESCRIPTION.md`, `.ai-factory/rules/base.md`, `AGENTS.md`, and `.ai-factory/ARCHITECTURE.md` via `/aif-architecture`
- `language.technical_terms` — preserve the existing value if it is already set; default to `keep` only when the key is missing

**Resolution order for each missing key:**
1. `.ai-factory/config.yaml`
2. `AGENTS.md`
3. `CLAUDE.md`
4. `RULES.md`
5. Ask the user

**Resolution workflow:**
1. Read `.ai-factory/config.yaml` if it exists and preserve any already-set `language.ui` / `language.artifacts` values.
2. If both keys are already set, reuse them and do not ask again.
3. If only one key is missing, resolve only that missing key via the priority order above. Ask the user only for the missing value if repository context is still insufficient.
4. If both keys are missing and repository context is insufficient, the first user question after mode detection MUST be about `UI language`, and the second language question MUST be about `Artifact language`.
5. Preserve `language.technical_terms` from existing config when present; otherwise set it to `keep` when writing config.
6. Keep the resolved language state fixed for the entire `/aif` run. Do not generate setup-time text artifacts in a different language later in the same run.

All user-facing text examples below are structure examples only. Ask them in resolved `language.ui`, never hard-code English when another UI language was resolved.

Before the first language question, config write, or generated artifact, read [setup configuration and base-rule templates](references/SETUP-CONFIG.md). Use the canonical `update-config.mjs` helper for create/merge; preserve comments, manual values, command defaults, `rules.<area>`, and user-owned `warmup.paths`. An unsafe structure or invalid payload stops setup; never fall back to free-form YAML. Persist resolved settings before any setup artifact or `/aif-architecture`.

## Existing project route

For Mode 1 only, read [existing-project setup](references/SETUP-EXISTING.md), analyze the real stack, persist config before artifacts, and confirm the installation/generation plan before executing it.

## Described project route

For Mode 2 only, read [new-project setup](references/SETUP-NEW.md). Resolve language and persist config before stack questions or artifacts; ask for relevant stack choices and obtain confirmation.

## Empty project route

For Mode 3 only, read [empty-project setup](references/SETUP-EMPTY.md). Resolve language and persist config before asking what to build, then read the new-project reference and follow its Steps 3–6 for stack selection and specification generation; do not repeat the completed language/config steps.

## MCP setup route

Only when configuring selected MCP servers, read [runtime formats and server templates](references/SETUP-MCP.md). Write the correct wrapper to `{{settings_file}}` and remind the user about required credential environment variables.

## Project map route

Before generating setup-time `AGENTS.md`, read [project-map generation](references/SETUP-AGENTS.md). Describe the actual project structure in `language.artifacts`; apply project skill-context requirements to the template.
```

---

### Mode 1: Analyze Existing Project

**Trigger:** `/aif` (no arguments) + project has config files

**Step 1: Scan Project**

Read these files (if they exist):
- `package.json` → Node.js dependencies
- `composer.json` → PHP (Laravel, Symfony)
- `requirements.txt` / `pyproject.toml` → Python
- `go.mod` → Go
- `Cargo.toml` → Rust
- `docker-compose.yml` → Services
- `prisma/schema.prisma` → Database schema
- Directory structure (`src/`, `app/`, `api/`, etc.)

**Step 2: Resolve Language Settings**

Resolve the run-scoped language state (see [Language Resolution](#language-resolution)) before generating any setup-time text artifact.

**Step 3: Persist config.yaml**

Immediately after language resolution, create `.ai-factory/` if needed and write `.ai-factory/config.yaml` via `update-config.mjs`.

**Step 4: Generate .ai-factory/DESCRIPTION.md**

Based on analysis, create project specification in resolved `language.artifacts`:
- Detected stack
- Identified patterns
- Architecture notes

**Step 5: Recommend Skills & MCP**

| Detection | Skills | MCP |
|-----------|--------|-----|
| Prisma/PostgreSQL | `db-migrations` | `postgres` |
| MongoDB | `mongo-patterns` | - |
| GitHub repo (.git) | - | `github` |
| Stripe/payments | `payment-flows` | - |

**Step 6: Search skills.sh**

```bash
npx skills search <relevant-keyword>
```

**Step 7: Present Plan & Confirm**

Present this setup analysis and confirmation prompt in resolved `language.ui`.

```markdown
## 🏭 Project Analysis

**Detected Stack:** [language], [framework], [database if any]

## Setup Plan

### Skills
**From skills.sh:**
- [matched skills] ✓

**Generate custom:**
- [project-specific skills]

### MCP Servers
- [x] [relevant MCP servers]

Proceed? [Y/n]
```

**Step 8: Execute**

1. Create directory: `mkdir -p .ai-factory`
2. Write `.ai-factory/config.update.json` with helper payload (`mode: "create"` if config is missing, `mode: "merge"` if it already exists)
3. Run `node {{shell_home_skills_dir}}/aif/references/update-config.mjs --template {{shell_home_skills_dir}}/aif/references/config-template.yaml --target .ai-factory/config.yaml --payload .ai-factory/config.update.json`
4. Delete `.ai-factory/config.update.json` after the helper succeeds
5. Save `.ai-factory/DESCRIPTION.md` in resolved `language.artifacts`
6. **Create rules/base.md**:
   - Ensure `.ai-factory/rules/` directory exists
   - Write `.ai-factory/rules/base.md` with detected conventions in resolved `language.artifacts`
7. For each external skill from skills.sh:
   ```bash
   npx skills install {{skills_cli_agent_flag}} <name>
   # AUTO-SCAN: immediately after install. Example for PYTHON_CMD=(python3).
   python3 {{shell_home_skills_dir}}/aif-skill-generator/scripts/security-scan.py <installed-path>
   ```
   - Exit 1 (BLOCKED) → run the selected concrete Python command with `{{shell_home_skills_dir}}/aif-skill-generator/scripts/cleanup-blocked-skill.py --skill <name> --installed-path <installed-path>` (reuse the same `<installed-path>` you passed to security-scan.py — upstream `skills` sanitizes the directory name, so synthesizing it from `<name>` can miss the real folder), warn user, skip this skill
   - Exit 2 (WARNINGS) → show to user, ask confirmation
   - Exit 0 (CLEAN) → read files yourself (Level 2), verify intent, proceed
8. Generate custom skills via `/aif-skill-generator` (pass URLs for Learn Mode when docs are available)
9. Configure MCP in `{{settings_file}}`
10. Generate `AGENTS.md` in project root in resolved `language.artifacts` (see [AGENTS.md Generation](#agentsmd-generation))
11. Generate architecture document via `/aif-architecture` only after config exists with resolved language settings (see [Architecture Generation](#architecture-generation))

---

### Mode 2: New Project with Description

**Trigger:** `/aif <project description>`

**Step 1: Resolve Language Settings**

Immediately after reading `$ARGUMENTS`, resolve the run-scoped language state. If repository context is insufficient, the first user question after mode detection MUST be about `UI language` / `Artifact language`.

**Step 2: Persist config.yaml**

Immediately after language resolution, create `.ai-factory/` if needed and write `.ai-factory/config.yaml` via `update-config.mjs`.

**Step 3: Interactive Stack Selection**

Based on project description, ask user to confirm stack choices.
Show YOUR recommendation with "(Recommended)" label, tailored to the project type.
Ask the stack questions in resolved `language.ui`.

Ask about:
1. **Programming language** — recommend based on project needs (performance, ecosystem, team experience)
2. **Framework** — recommend based on project type (if applicable — not all projects need one)
3. **Database** — recommend based on data model (if applicable)
4. **ORM/Query Builder** — recommend based on language and database (if applicable)

**Why these recommendations:**
- Explain WHY you recommend each choice based on the specific project type
- Skip categories that don't apply (e.g., no database for a CLI tool, no framework for a library)

**Step 4: Create .ai-factory/DESCRIPTION.md**

After user confirms choices, create specification in resolved `language.artifacts`:

```markdown
# [Localized project title in resolved artifacts language]

## [Localized heading: Overview]
[Enhanced, clear description of the project in resolved artifacts language]

## [Localized heading: Core Features]
- [Feature 1]
- [Feature 2]
- [Feature 3]

## [Localized heading: Tech Stack]
- **[Localized label: Programming language]:** [user choice]
- **[Localized label: Framework]:** [user choice]
- **[Localized label: Database]:** [user choice]
- **[Localized label: ORM]:** [user choice]
- **[Localized label: Integrations]:** [Stripe, etc.]

## [Localized heading: Architecture Notes]
[High-level architecture decisions based on the stack]

## [Localized heading: Non-Functional Requirements]
- [Localized label: Logging]: Configurable via LOG_LEVEL
- [Localized label: Error handling]: Structured error responses
- [Localized label: Security]: [relevant security considerations]
```

Save to `.ai-factory/DESCRIPTION.md`.

**Step 5: Search & Install Skills**

Based on confirmed stack:
1. Search skills.sh for matching skills
2. Plan custom skills for domain-specific needs
3. Configure relevant MCP servers

**Step 6: Setup Context**

Install skills, configure MCP, generate `AGENTS.md` in resolved `language.artifacts`, and generate architecture document via `/aif-architecture` after the earlier helper-driven config write, as in Mode 1.

---

### Mode 3: Interactive New Project (Empty Directory)

**Trigger:** `/aif` (no arguments) + empty project (no package.json, composer.json, etc.)

**Step 1: Resolve Language Settings**

Resolve the run-scoped language state before asking for the project description. If repository context is insufficient, the first user question after mode detection MUST be about `UI language` / `Artifact language`.

**Step 2: Persist config.yaml**

Immediately after language resolution, create `.ai-factory/` if needed and write `.ai-factory/config.yaml` via `update-config.mjs`.

**Step 3: Ask Project Description**

```
I don't see an existing project here. Let's set one up!

What kind of project are you building?
(e.g., "CLI tool for file processing", "REST API", "mobile app", "data pipeline")

> ___
```

Ask this prompt in resolved `language.ui`.

**Step 4: Interactive Stack Selection**

After getting description, proceed with same stack selection as Mode 2:
- Programming language (with recommendation)
- Framework (with recommendation)
- Database (with recommendation)
- ORM (with recommendation)

**Step 5: Create .ai-factory/DESCRIPTION.md**

Same as Mode 2, in resolved `language.artifacts`, including creating `.ai-factory` before writing `config.yaml` or `DESCRIPTION.md`.

**Step 6: Setup Context**

Install skills, configure MCP, generate `AGENTS.md` in resolved `language.artifacts`, and generate architecture document via `/aif-architecture` after the earlier helper-driven config write, as in Mode 1.

---

## MCP Configuration

AI Factory writes MCP config to `{{settings_file}}`, but the outer settings shape depends on the runtime.

### Runtime Format Matrix

| Runtime | Write under | Entry shape |
|---------|-------------|-------------|
| Standard MCP runtimes (Claude Code, Cursor, Roo Code, Kilo Code, Qwen Code, Universal / Other) | `mcpServers.<server>` | `{ "command": "...", "args": [...], "env": {...} }` |
| OpenCode | `mcp.<server>` | `{ "type": "local", "command": ["...", "..."], "environment": {...} }` |
| GitHub Copilot | `servers.<server>` | `{ "type": "stdio", "command": "...", "args": [...], "env": {...} }` |
| Codex app | `[mcp_servers.<server>]` in `.codex/config.toml` | `command = "..."`, optional `args = [...]`, credential placeholders as `env_vars = ["VAR"]`, literal values under `[mcp_servers.<server>.env]` |

Use the canonical server templates below as the source values, then wrap them using the runtime-specific format above.

### Canonical Server Templates

#### GitHub
**When:** Project has `.git` or uses GitHub

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
  }
}
```

#### Postgres
**When:** Uses PostgreSQL, Prisma, Drizzle, Supabase

```json
{
  "postgres": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres"],
    "env": { "DATABASE_URL": "${DATABASE_URL}" }
  }
}
```

#### Filesystem
**When:** Needs advanced file operations

```json
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
  }
}
```

#### Playwright
**When:** Needs browser automation, web testing, interaction via accessibility tree

```json
{
  "playwright": {
    "command": "npx",
    "args": ["-y", "@playwright/mcp@latest"]
  }
}
```

### Runtime-Specific Wrapper Examples

Standard MCP runtimes (`mcpServers`):

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

OpenCode (`mcp` + `type: "local"` + command array):

```json
{
  "mcp": {
    "filesystem": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

GitHub Copilot (`servers` + `type: "stdio"`):

```json
{
  "servers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

Codex app (`.codex/config.toml` + `mcp_servers` TOML tables):

```toml
[mcp_servers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "."]

[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
env_vars = ["GITHUB_TOKEN"]
```

For GitHub Copilot, convert credential placeholders from `${VAR}` to `${env:VAR}` in the final config file. For OpenCode, use `environment` instead of `env` when the server requires credentials. For Codex app, convert credential placeholders from `${VAR}` to `env_vars = ["VAR"]`; only literal values belong under `[mcp_servers.<server>.env]`.

---

## AGENTS.md Generation

**Generate `AGENTS.md` in the project root** as a structural map for AI agents. This file helps any AI agent (or new developer) quickly understand the project layout.

**Scan the project** to build the structure:
- Read directory tree (top 2-3 levels)
- Identify key entry points (main files, config files, schemas)
- Note existing documentation files
- Reference `.ai-factory/DESCRIPTION.md` for tech stack

Use resolved `language.artifacts` for all headings, notes, table descriptions, and rule text inside `AGENTS.md`. Keep the filename `AGENTS.md` unchanged.

**Template:**

```markdown
# AGENTS.md

> [Localized AGENTS.md maintenance note in resolved artifacts language]

## [Localized heading: Project Overview]
[1-2 sentence description from DESCRIPTION.md]

## [Localized heading: Tech Stack]
- **[Localized label: Programming language]:** [language]
- **[Localized label: Framework]:** [framework]
- **[Localized label: Database]:** [database]
- **[Localized label: ORM]:** [orm]

## [Localized heading: Project Structure]
\`\`\`
[directory tree with inline comments explaining each directory]
\`\`\`

## [Localized heading: Key Entry Points]
| [Localized header: File] | [Localized header: Purpose] |
|---------------------------|------------------------------|
| [main entry] | [description in resolved artifacts language] |
| [config file] | [description in resolved artifacts language] |
| [schema file] | [description in resolved artifacts language] |

## [Localized heading: Documentation]
| [Localized header: Document] | [Localized header: Path] | [Localized header: Description] |
|-------------------------------|-------------------------|--------------------------------|
| README | README.md | [Localized README description in resolved artifacts language] |
| [other docs if they exist] | | |

## [Localized heading: AI Context Files]
| [Localized header: File] | [Localized header: Purpose] |
|---------------------------|------------------------------|
| AGENTS.md | [Localized AGENTS.md description in resolved artifacts language] |
| .ai-factory/DESCRIPTION.md | [Localized DESCRIPTION.md description in resolved artifacts language] |
| .ai-factory/ARCHITECTURE.md | [Localized ARCHITECTURE.md description in resolved artifacts language] |
| CLAUDE.md | [Localized CLAUDE.md description in resolved artifacts language] |

## [Localized heading: Agent Rules]
- [Localized shell-command decomposition rule in resolved artifacts language]
  - [Localized example label for an incorrect combined command] `git checkout <configured-base-branch> && git pull`
  - [Localized example label for the correct decomposed command] First `git checkout <configured-base-branch>`, then `git pull origin <configured-base-branch>`
```

**Rules for AGENTS.md:**
- Keep it factual — only describe what actually exists in the project
- Update it when project structure changes significantly
- The Documentation section will be maintained by `/aif-docs`
- Do NOT duplicate detailed content from DESCRIPTION.md — reference it instead
- Keep the filename `AGENTS.md`, but localize the content inside it to resolved `language.artifacts`

---
>>>>>>> 2b84036 (fix: render home skill helper paths safely)

## Rules

1. **Search before generating** — Don't reinvent existing skills
2. **Ask confirmation** — Before installing or generating
3. **Check duplicates** — Don't install what's already there
4. **MCP in `{{settings_file}}`** — Project-level MCP configuration
5. **Remind about env vars** — For MCP that need credentials

## Artifact Ownership

- Primary ownership in this command: `.ai-factory/DESCRIPTION.md`, setup-time `AGENTS.md`, installed skills, and MCP configuration.
- Delegated ownership: invoke `/aif-architecture` to create/update `.ai-factory/ARCHITECTURE.md`.
- Read-only context in this command by default: the resolved roadmap, RULES.md, research, and plan artifacts.

## CRITICAL: Do NOT Implement

**This skill ONLY sets up context (skills + MCP). It does NOT implement the project.**

After setup artifacts are configured, read [completion and architecture handoff](references/SETUP-COMPLETION.md), invoke `/aif-architecture` only after config exists, and present next steps in `language.ui`. Stop after the selected setup follow-ups. Do not write application code, implement features, or create application structure.
