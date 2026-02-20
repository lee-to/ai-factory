[← Getting Started](getting-started.md) · [Back to README](../README.md) · [Reflex Loop →](loop.md)

# Development Workflow

AI Factory has two phases: **configuration** (one-time project setup) and the **development workflow** (repeatable loop of plan → implement → verify → commit → evolve).

## Project Configuration

Run once per project. Sets up context files that all workflow skills depend on.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       PROJECT CONFIGURATION                             │
└─────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐      ┌──────────────┐      ┌──────────────────────────┐
  │              │      │   claude     │      │                          │
  │ ai-factory   │ ───▶ │ (or any AI   │ ───▶│      /aif                │
  │    init      │      │    agent)    │      │   (setup context)        │
  │              │      │              │      │                          │
  └──────────────┘      └──────────────┘      │  DESCRIPTION.md          │
                                              │  AGENTS.md               │
                                              │  Skills + MCP configured │
                                              └────────────┬─────────────┘
                                                           │
                                                           ▼
                                              ┌──────────────────────────┐
                                              │ /aif-architecture        │
                                              │  (ARCHITECTURE.md)       │
                                              └────────────┬─────────────┘
                                                           │
                                         ┌─────────────────┼─────────────────┐
                                         │                 │                 │
                                         ▼                 ▼                 ▼
                                  ┌───────────────┐  ┌──────────────┐  ┌─────────────┐
                                  │ /aif-rules    │  │ /aif-roadmap │  │  /aif-docs  │
                                  │ (optional)    │  │(recommended) │  │ (optional)  │
                                  └───────────────┘  └──────────────┘  └─────────────┘

                                  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐
                                  │ /aif-dockerize│  │  /aif-ci     │  │ /aif-build-  │
                                  │ (optional)    │  │ (optional)   │  │  automation  │
                                  └───────────────┘  └──────────────┘  │ (optional)   │
                                                                       └──────────────┘
```

## Development Workflow

The repeatable development loop. Each skill feeds into the next, sharing context through plan files and patches.

![workflow](https://github.com/lee-to/ai-factory/raw/2.x/art/workflow.png)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       DEVELOPMENT WORKFLOW                               │
└─────────────────────────────────────────────────────────────────────────┘

               ┌──────────────────────────┐                         ┌──────────────┐
               │                          │                         │              │
               │    /aif-plan             │                         │ /aif-fix     │
               │                          │                         │              │
               │  fast → no branch,       │                         │              │
               │         PLAN.md          │                         │ Bug fixes    │
               │  full → git branch,      │                         │ Optional plan│
               │         plans/<br>.md    │                         │ With logging │
               │                          │                         │              │
               └────────────┬─────────────┘                         └───────┬──────┘
                            │                                               │
                            │                                               ▼
                            │                                      ┌──────────────────┐
                            │                                      │ .ai-factory/     │
                            │                                      │   patches/       │
                            │                                      │ Self-improvement │
                            └───────────┬──────────────────────────└────────┬─────────┘
                                        │                                   │
                                        ▼                                   │
                             ┌─────────────────────┐                        │
                             │                     │                        │
                             │ /aif-improve        │                        │
                             │    (optional)       │                        │
                             │                     │                        │
                             │ Refine plan with    │                        │
                             │ deeper analysis     │                        │
                             │                     │                        │
                             └──────────┬──────────┘                        │
                                        │                                   │
                                        ▼                                   │
                             ┌──────────────────────┐                       │
                             │                      │◀── reads patches ─────┘
                             │ /aif-implement       │
                             │ ──── error?          │
                             │  ──▶ /aif-fix       │
                             │  Execute tasks       │
                             │  Commit checkpoints  │
                             │                      │
                             └──────────┬───────────┘
                                        │
                                        ▼
                             ┌──────────────────────────────────────┐
                             │                                      │
                             │ /aif-verify                          │
                             │    (optional)                        │
                             │                                      │
                             │ Check completeness                   │
                             │ Build / test / lint                  │
                             │    ↓                                 │
                             │ → /aif-security-checklist            │
                             │ → /aif-review                        │
                             │                                      │
                             └──────────────────┬───────────────────┘
                                        │
                                        ▼
                             ┌─────────────────────┐
                             │                     │
                             │ /aif-commit         │
                             │                     │
                             └──────────┬──────────┘
                                        │
                        ┌───────────────┴───────────────┐
                        │                               │
                        ▼                               ▼
                   More work?                        Done!
                   Loop back ↑                          │
                                                        ▼
                                             ┌─────────────────────┐
                                             │                     │
                                             │ /aif-evolve         │
                                             │                     │
                                             │ Reads patches +     │
                                             │ project context     │
                                             │       ↓             │
                                             │ Improves skills     │
                                             │                     │
                                             └─────────────────────┘

```

## When to Use What?

| Command | Use Case | Creates Branch? | Creates Plan? |
|---------|----------|-----------------|---------------|
| `/aif-roadmap` | Strategic planning, milestones, long-term vision | No | `.ai-factory/ROADMAP.md` |
| `/aif-plan fast` | Small tasks, quick fixes, experiments | No | `.ai-factory/PLAN.md` |
| `/aif-plan full` | Full features, stories, epics | Yes | `.ai-factory/plans/<branch>.md` |
| `/aif-plan full --parallel` | Concurrent features via worktrees | Yes + worktree | Autonomous end-to-end |
| `/aif-improve` | Refine plan before implementation | No | No (improves existing) |
| `/aif-loop` | Iterative generation with quality gates and phase-based cycles | No | No (uses `.ai-factory/evolution/`) |
| `/aif-fix` | Bug fixes, errors, hotfixes | No | Optional (`.ai-factory/FIX_PLAN.md`) |
| `/aif-verify` | Post-implementation quality check | No | No (reads existing) |

## Workflow Skills

These skills form the development pipeline. Each one feeds into the next.

### `/aif-roadmap [check | vision]` — strategic planning

```
/aif-roadmap                              # Create or update roadmap
/aif-roadmap SaaS for project management  # Create from vision
/aif-roadmap check                        # Auto-scan: find completed milestones
```

High-level project planning. Creates `.ai-factory/ROADMAP.md` — a strategic checklist of major milestones (not granular tasks). Use `check` to automatically scan the codebase and mark milestones that appear done. `/aif-implement` also checks the roadmap after completing all tasks.

### `/aif-plan [fast|full] <description>` — plan the work

```
/aif-plan Add user authentication with OAuth       # Asks which mode
/aif-plan fast Add product search API              # Quick plan, no branch
/aif-plan full Add user authentication with OAuth  # Git branch + full plan
/aif-plan full --parallel Add Stripe checkout      # Parallel worktree
```

Two modes — **fast** (no branch, saves to `.ai-factory/PLAN.md`) and **full** (creates git branch, asks about testing/logging/docs, saves to `.ai-factory/plans/<branch>.md`). Analyzes requirements, explores codebase for patterns, creates tasks with dependencies. For 5+ tasks, includes commit checkpoints. For parallel work on multiple features, use `full --parallel` to create isolated worktrees.

### `/aif-improve [prompt]` — refine the plan

```
/aif-improve
/aif-improve add validation and error handling
```

Second-pass analysis. Finds missing tasks (migrations, configs, middleware), fixes dependencies, removes redundant work. Shows a diff-like report before applying changes.

### `/aif-loop [new|resume|status|stop|list|history|clean] [task or alias]` — iterative quality loop

```
/aif-loop new OpenAPI 3.1 + DDD notes + JSON examples + PHP controller
/aif-loop resume
/aif-loop status
/aif-loop list
/aif-loop history courses-api-ddd
/aif-loop clean courses-api-ddd
```

Runs a strict Reflex Loop with 6 phases: PLAN -> PRODUCE||PREPARE -> EVALUATE -> CRITIQUE -> REFINE. PRODUCE and PREPARE run in parallel via `Task` tool; EVALUATE runs check groups in parallel. Before iteration 1, it always asks for explicit confirmation of success criteria and max iterations (even if both are already in task text). Keeps one active loop pointer in `.ai-factory/evolution/current.json` and per-task run state in `.ai-factory/evolution/<alias>/run.json` with append-only events in `history.jsonl` and latest output in `artifact.md`. Stops on threshold reached, no major issues, stagnation, or max iterations (default: 4). If loop stops on max iterations without passing criteria, final summary includes distance-to-success metrics (threshold gap + remaining blocking fail-rules). Use `list` to see all loop runs, `history` to view events, `clean` to remove old loop runs.

For full contracts and state transition rules, see [Reflex Loop](loop.md).

### `/aif-implement` — execute the plan

```
/aif-implement        # Continue from where you left off
/aif-implement 5      # Start from task #5
/aif-implement status # Check progress
```

Reads past patches from `.ai-factory/patches/` to learn from previous mistakes, then executes tasks one by one with commit checkpoints. If the plan has `Docs: yes`, runs `/aif-docs` after completion.

### `/aif-verify [--strict]` — check completeness

```
/aif-verify          # Verify implementation against plan
/aif-verify --strict # Strict mode — zero tolerance for gaps
```

Optional step after `/aif-implement`. Goes through every task in the plan and verifies the code actually implements it. Checks build, tests, lint, looks for leftover TODOs, undocumented env vars, and plan-vs-code drift. If gaps are found, it first suggests `/aif-fix <issue summary>` (recommended). If verification is clean, it suggests `/aif-security-checklist` and `/aif-review`. Use `--strict` before merging to main.

### `/aif-fix [bug description]` — fix and learn

```
/aif-fix TypeError: Cannot read property 'name' of undefined
```

Two modes — choose when you invoke:
- **Fix now** — investigates and fixes immediately with logging
- **Plan first** — creates `.ai-factory/FIX_PLAN.md` with analysis and fix steps, then stops for review

When a plan exists, run without arguments to execute:
```
/aif-fix    # reads FIX_PLAN.md → applies fix → deletes plan
```

Every fix creates a **self-improvement patch** in `.ai-factory/patches/`. Every patch makes future `/aif-implement` and `/aif-fix` smarter.

### `/aif-evolve` — improve skills from experience

```
/aif-evolve          # Evolve all skills
/aif-evolve fix      # Evolve only the fix skill
```

Reads all accumulated patches, analyzes project patterns, and proposes targeted skill improvements. Closes the learning loop: **fix → patch → evolve → better skills → fewer bugs**.

---

For full details on all skills including utility commands (`/aif-docs`, `/aif-dockerize`, `/aif-build-automation`, `/aif-ci`, `/aif-commit`, `/aif-skill-generator`, `/aif-security-checklist`), see [Core Skills](skills.md).

## Why Spec-Driven?

- **Predictable results** - AI follows a plan, not random exploration
- **Resumable sessions** - progress saved in plan files, continue anytime
- **Commit discipline** - structured commits at logical checkpoints
- **No scope creep** - AI does exactly what's in the plan, nothing more

## See Also

- [Reflex Loop](loop.md) — strict iterative loop contracts and state transitions
- [Core Skills](skills.md) — detailed reference for all workflow and utility skills
- [Plan Files](plan-files.md) — how plan artifacts are stored and managed
