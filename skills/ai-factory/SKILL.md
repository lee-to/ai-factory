---
name: ai-factory
description: Set up Claude Code context for a project. Analyzes tech stack, installs relevant skills from skills.sh, generates custom skills, and configures MCP servers. Use when starting new project, setting up AI context, or asking "set up project", "configure AI", "what skills do I need".
argument-hint: [project description]
allowed-tools: Read Glob Grep Write Bash(mkdir *) Bash(npx skills *) Skill WebFetch AskUserQuestion
---

# AI Factory - Project Setup

Set up Claude Code for your project by:
1. Analyzing the tech stack
2. Installing skills from [skills.sh](https://skills.sh)
3. Generating custom skills via `/ai-factory.skill-generator`
4. Configuring MCP servers for external integrations

## Skill Acquisition Strategy

**Always search skills.sh before generating:**

```
For each recommended skill:
  1. Search: npx skills search <name>
  2. If found → Install: npx skills install <name>
  3. If not found → Generate: /ai-factory.skill-generator <name>
  4. Has reference URLs? → Learn: /ai-factory.skill-generator <url1> [url2]...
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

### Mode 1: Analyze Existing Project

**Trigger:** `/ai-factory` (no arguments) + project has config files

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

**Step 2: Generate .ai-factory/DESCRIPTION.md**

Based on analysis, create project specification:
- Detected stack
- Identified patterns
- Architecture notes

**Step 3: Recommend Skills & MCP**

| Detection | Skills | MCP |
|-----------|--------|-----|
| Next.js/React | `nextjs-patterns` | - |
| Express/Fastify/Hono | `api-patterns` | - |
| Laravel/Symfony | `php-patterns` | `postgres` |
| Prisma/PostgreSQL | `db-migrations` | `postgres` |
| MongoDB | `mongo-patterns` | - |
| GitHub repo (.git) | - | `github` |
| Stripe/payments | `payment-flows` | - |

**Step 4: Search skills.sh**

```bash
npx skills search nextjs
npx skills search prisma
```

**Step 5: Present Plan & Confirm**

```markdown
## 🏭 Project Analysis

**Detected Stack:** Next.js 14, TypeScript, PostgreSQL (Prisma)

## Setup Plan

### Skills
**From skills.sh:**
- nextjs-app-router ✓

**Generate custom:**
- project-api (specific to this project's routes)

### MCP Servers
- [x] GitHub
- [x] Postgres

Proceed? [Y/n]
```

**Step 6: Execute**

1. Create directory: `mkdir -p .ai-factory`
2. Save `.ai-factory/DESCRIPTION.md`
3. Install from skills.sh
4. Generate custom skills via `/ai-factory.skill-generator` (pass URLs for Learn Mode when docs are available)
5. Configure MCP in `.claude/settings.local.json`

---

### Mode 2: New Project with Description

**Trigger:** `/ai-factory e-commerce with Stripe payments`

**Step 1: Interactive Stack Selection**

Based on project description, ask user to confirm stack choices.
Show YOUR recommendation with "(Recommended)" label.

```
Based on your project, I recommend:

1. Language:
   - [ ] TypeScript (Recommended) — type safety, great tooling
   - [ ] JavaScript — simpler, faster start
   - [ ] Python — good for ML/data projects
   - [ ] PHP — Laravel ecosystem
   - [ ] Go — high performance APIs
   - [ ] Other: ___

2. Framework:
   - [ ] Next.js (Recommended) — full-stack React, great DX
   - [ ] Express — minimal, flexible
   - [ ] Fastify — fast, schema validation
   - [ ] Hono — edge-ready, lightweight
   - [ ] Laravel — batteries included (PHP)
   - [ ] Django/FastAPI — Python web
   - [ ] Other: ___

3. Database:
   - [ ] PostgreSQL (Recommended) — reliable, feature-rich
   - [ ] MySQL — widely supported
   - [ ] MongoDB — flexible schema
   - [ ] SQLite — simple, file-based
   - [ ] Supabase — Postgres + auth + realtime
   - [ ] Other: ___

4. ORM/Query Builder:
   - [ ] Prisma (Recommended) — type-safe, great DX
   - [ ] Drizzle — lightweight, SQL-like
   - [ ] TypeORM — decorator-based
   - [ ] Eloquent — Laravel default
   - [ ] None — raw queries
```

**Why these recommendations:**
- Explain WHY you recommend each choice based on project type
- E-commerce → PostgreSQL (transactions), Next.js (SEO)
- API-only → Fastify/Hono, consider Go for high load
- Startup/MVP → Next.js + Prisma + Supabase (fast iteration)

**Step 2: Create .ai-factory/DESCRIPTION.md**

After user confirms choices, create specification:

```markdown
# Project: [Project Name]

## Overview
[Enhanced, clear description of the project in English]

## Core Features
- [Feature 1]
- [Feature 2]
- [Feature 3]

## Tech Stack
- **Language:** [user choice]
- **Framework:** [user choice]
- **Database:** [user choice]
- **ORM:** [user choice]
- **Integrations:** [Stripe, etc.]

## Architecture Notes
[High-level architecture decisions based on the stack]

## Non-Functional Requirements
- Logging: Configurable via LOG_LEVEL
- Error handling: Structured error responses
- Security: [relevant security considerations]
```

Save to `.ai-factory/DESCRIPTION.md`.

```bash
mkdir -p .ai-factory
```

**Step 3: Search & Install Skills**

Based on confirmed stack:
1. Search skills.sh for matching skills
2. Plan custom skills for domain-specific needs
3. Configure relevant MCP servers

**Step 4: Setup Context**

Install skills and configure MCP as in Mode 1.

---

### Mode 3: Interactive New Project (Empty Directory)

**Trigger:** `/ai-factory` (no arguments) + empty project (no package.json, composer.json, etc.)

**Step 1: Ask Project Description**

```
I don't see an existing project here. Let's set one up!

What kind of project are you building?
(e.g., "e-commerce platform", "REST API for mobile app", "SaaS dashboard")

> ___
```

**Step 2: Interactive Stack Selection**

After getting description, proceed with same stack selection as Mode 2:
- Language (with recommendation)
- Framework (with recommendation)
- Database (with recommendation)
- ORM (with recommendation)

**Step 3: Create .ai-factory/DESCRIPTION.md**

Same as Mode 2.

**Step 4: Setup Context**

Install skills and configure MCP as in Mode 1.

---

## MCP Configuration

### GitHub
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

### Postgres
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

### Filesystem
**When:** Needs advanced file operations

```json
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
  }
}
```

---

## Rules

1. **Search before generating** — Don't reinvent existing skills
2. **Ask confirmation** — Before installing or generating
3. **Check duplicates** — Don't install what's already there
4. **MCP in settings.local.json** — Project-level, gitignored
5. **Remind about env vars** — For MCP that need credentials

## CRITICAL: Do NOT Implement

**This skill ONLY sets up context (skills + MCP). It does NOT implement the project.**

After completing setup, tell the user:

```
✅ Project context configured!

Project description: .ai-factory/DESCRIPTION.md (if created from prompt)
Skills installed: [list]
MCP configured: [list]

To start development:
- /ai-factory.feature <description> — Start a new feature (creates branch + plan)
- /ai-factory.task <description> — Create implementation plan only
- /ai-factory.implement — Execute existing plan

Ready when you are!
```

**DO NOT:**
- ❌ Start writing project code
- ❌ Create project files (src/, app/, etc.)
- ❌ Implement features
- ❌ Set up project structure beyond skills/MCP

**Your job ends when skills and MCP are configured.** The user decides when to start implementation.
