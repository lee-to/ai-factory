![logo](https://github.com/lee-to/ai-factory/raw/main/art/promo.png)

# AI Factory

> **Stop configuring. Start building.**

You want to build with AI, but setting up the right context, prompts, and workflows takes time. AI Factory handles all of that so you can focus on what matters — shipping quality code.

**One command. Full AI-powered development environment.**

```bash
ai-factory init
```

---

## Why AI Factory?

- **Zero configuration** — detects your stack, installs relevant skills, configures integrations
- **Best practices built-in** — logging, commits, code review, all following industry standards
- **Spec-driven development** — AI follows plans, not random exploration. Predictable, resumable, reviewable
- **Community skills** — leverage [skills.sh](https://skills.sh) ecosystem or generate custom skills
- **Works with your stack** — Next.js, Laravel, Django, Express, and more

---

## What is AI Factory?

AI Factory is a CLI tool and skill system that:

1. **Analyzes your project** - detects tech stack from package.json, composer.json, requirements.txt, etc.
2. **Installs relevant skills** - downloads from [skills.sh](https://skills.sh) or generates custom ones
3. **Configures MCP servers** - GitHub, Postgres, Filesystem based on your needs
4. **Provides spec-driven workflow** - structured feature development with plans, tasks, and commits

## Installation

```bash
npm install -g ai-factory
```

## Quick Start

```bash
# In your project directory
ai-factory init
```

This will:
- Detect your project stack
- Ask which base skills to install
- Configure MCP servers (optional)
- Set up `.claude/skills/` directory

Then open Claude Code and start working:

```
/ai-factory
```

## Development Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AI FACTORY WORKFLOW                             │
└─────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐      ┌──────────────┐      ┌──────────────────────────┐
  │              │      │    claude    │      │                          │
  │ ai-factory   │ ───▶ │ (or any AI   │ ───▶ │      /ai-factory         │
  │    init      │      │    agent)    │      │   (setup context)        │
  │              │      │              │      │                          │
  └──────────────┘      └──────────────┘      └────────────┬─────────────┘
                                                           │
                          ┌────────────────────────────────┼────────────────┐
                          │                                │                │
                          ▼                                ▼                ▼
               ┌──────────────────┐            ┌─────────────────┐  ┌──────────────┐
               │                  │            │                 │  │              │
               │ /ai-factory.task │            │/ai-factory.     │  │/ai-factory.  │
               │                  │            │    feature      │  │    fix       │
               │  Small tasks     │            │                 │  │              │
               │  No git branch   │            │ Full features   │  │ Bug fixes    │
               │  Quick work      │            │ Git branch      │  │ No plans     │
               │                  │            │ Full plan       │  │ With logging │
               └────────┬─────────┘            └────────┬────────┘  └──────────────┘
                        │                               │                   ▲
                        │                               │                   │
                        └───────────────┬───────────────┘                   │
                                        │                                   │
                                        ▼                                   │
                             ┌─────────────────────┐                        │
                             │                     │                        │
                             │ /ai-factory.implement│                       │
                             │                     │ ──── error? ───────────┘
                             │  Execute tasks      │
                             │  Commit checkpoints │
                             │                     │
                             └──────────┬──────────┘
                                        │
                                        ▼
                             ┌─────────────────────┐
                             │                     │
                             │ /ai-factory.commit  │
                             │                     │
                             └──────────┬──────────┘
                                        │
                        ┌───────────────┴───────────────┐
                        │                               │
                        ▼                               ▼
                   More work?                        Done!
                   Loop back ↑

```

### When to Use What?

| Command | Use Case | Creates Branch? | Creates Plan? |
|---------|----------|-----------------|---------------|
| `/ai-factory.task` | Small tasks, quick fixes, experiments | No | `.ai-factory/PLAN.md` |
| `/ai-factory.feature` | Full features, stories, epics | Yes | `.ai-factory/<branch>.md` |
| `/ai-factory.fix` | Bug fixes, errors, hotfixes | No | No (direct fix) |

### Why Spec-Driven?

- **Predictable results** - AI follows a plan, not random exploration
- **Resumable sessions** - progress saved in plan files, continue anytime
- **Commit discipline** - structured commits at logical checkpoints
- **No scope creep** - AI does exactly what's in the plan, nothing more

## Core Skills

### `/ai-factory`
Analyzes your project and sets up context:
- Scans project files to detect stack
- Searches [skills.sh](https://skills.sh) for relevant skills
- Generates custom skills via `/ai-factory.skill-generator`
- Configures MCP servers

When called with a description:
```
/ai-factory e-commerce platform with Stripe and Next.js
```
- Creates `.ai-factory/DESCRIPTION.md` with enhanced project specification
- Transforms your idea into a structured, professional description

**Does NOT implement your project** - only sets up context.

### `/ai-factory.feature <description>`
Starts a new feature:
```
/ai-factory.feature Add user authentication with OAuth
```
- Creates git branch (`feature/user-authentication`)
- Asks about testing and logging preferences
- Creates plan file (`feature-user-authentication.md`)
- Invokes `/ai-factory.task` to create implementation plan

### `/ai-factory.task <description>`
Creates implementation plan:
```
/ai-factory.task Add product search API
```
- Analyzes requirements
- Explores codebase for patterns
- Creates tasks with dependencies
- Saves plan to `.ai-factory/PLAN.md` (or branch-named file)
- For 5+ tasks, includes commit checkpoints

### `/ai-factory.implement`
Executes the plan:
```
/ai-factory.implement        # Continue from where you left off
/ai-factory.implement 5      # Start from task #5
/ai-factory.implement status # Check progress
```
- Finds plan file (.ai-factory/PLAN.md or branch-based)
- Executes tasks one by one
- Prompts for commits at checkpoints
- Offers to delete .ai-factory/PLAN.md when done

### `/ai-factory.fix <bug description>`
Quick bug fix without plans:
```
/ai-factory.fix TypeError: Cannot read property 'name' of undefined
```
- Investigates codebase to find root cause
- Applies fix WITH logging (`[FIX]` prefix for easy filtering)
- Suggests test coverage for the bug
- NO plans, NO reports - just fix and move on

### `/ai-factory.commit`
Creates conventional commits:
- Analyzes staged changes
- Generates meaningful commit message
- Follows conventional commits format

### `/ai-factory.skill-generator`
Generates new skills:
```
/ai-factory.skill-generator api-patterns
```
- Creates SKILL.md with proper frontmatter
- Follows [Agent Skills](https://agentskills.io) specification
- Can include references, scripts, templates

**Learn Mode** — pass URLs to generate skills from real documentation:
```
/ai-factory.skill-generator https://fastapi.tiangolo.com/tutorial/
/ai-factory.skill-generator https://react.dev/learn https://react.dev/reference/react/hooks
/ai-factory.skill-generator my-skill https://docs.example.com/api
```
- Fetches and deeply studies each URL
- Enriches with web search for best practices and pitfalls
- Synthesizes a structured knowledge base
- Generates a complete skill package with references from real sources
- Supports multiple URLs, mixed sources (docs + blogs), and optional skill name hint

## Plan Files

AI Factory uses markdown files to track implementation plans:

| Source | Plan File | After Completion |
|--------|-----------|------------------|
| `/ai-factory.task` (direct) | `.ai-factory/PLAN.md` | Offer to delete |
| `/ai-factory.feature` | `.ai-factory/<branch-name>.md` | Keep (user decides) |

**Example plan file:**

```markdown
# Implementation Plan: User Authentication

Branch: feature/user-authentication
Created: 2024-01-15

## Settings
- Testing: no
- Logging: verbose

## Commit Plan
- **Commit 1** (tasks 1-3): "feat: add user model and types"
- **Commit 2** (tasks 4-6): "feat: implement auth service"

## Tasks

### Phase 1: Setup
- [ ] Task 1: Create User model
- [ ] Task 2: Add auth types

### Phase 2: Implementation
- [x] Task 3: Implement registration
- [ ] Task 4: Implement login
```

## MCP Configuration

AI Factory can configure these MCP servers:

| MCP Server | Use Case | Env Variable |
|------------|----------|--------------|
| GitHub | PRs, issues, repo operations | `GITHUB_TOKEN` |
| Postgres | Database queries | `DATABASE_URL` |
| Filesystem | Advanced file operations | - |

Configuration saved to `.claude/settings.local.json` (gitignored).

## Skill Acquisition Strategy

AI Factory follows this strategy for skills:

```
For each recommended skill:
  1. Search skills.sh: npx skills search <name>
  2. If found → Install: npx skills install <name>
  3. If not found → Generate: /ai-factory.skill-generator <name>
  4. Has reference docs? → Learn: /ai-factory.skill-generator <url1> [url2]...
```

**Never reinvent existing skills** - always check skills.sh first. When reference documentation is available, use **Learn Mode** to generate skills from real sources.

## CLI Commands

```bash
# Initialize project
ai-factory init

# Update skills to latest version
ai-factory update
```

## Project Structure

After initialization:

```
your-project/
├── .claude/
│   ├── skills/
│   │   ├── ai-factory/
│   │   ├── feature/
│   │   ├── task/
│   │   ├── implement/
│   │   ├── commit/
│   │   ├── review/
│   │   └── skill-generator/
│   └── settings.local.json    # MCP config (gitignored)
├── .ai-factory/               # AI Factory working directory
│   ├── DESCRIPTION.md         # Project specification
│   ├── PLAN.md                # Current plan (from /task)
│   └── feature-*.md           # Feature plans (from /feature)
└── .ai-factory.json           # AI Factory config
```

## Best Practices

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

## Configuration

`.ai-factory.json`:
```json
{
  "version": "1.0.0",
  "agent": "claude",
  "skillsDir": ".claude/skills",
  "installedSkills": ["ai-factory", "feature", "task", "implement", "commit"],
  "mcp": {
    "github": true,
    "postgres": false,
    "filesystem": false
  }
}
```

## Links

- [skills.sh](https://skills.sh) - Skill marketplace
- [Agent Skills Spec](https://agentskills.io) - Skill specification
- [Claude Code](https://claude.ai/code) - AI coding assistant

## License

MIT
