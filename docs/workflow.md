[← Getting Started](getting-started.md) · [Back to README](../README.md) · [Reflex Loop →](loop.md)

# Development Workflow

AI Factory has two phases: **configuration** (one-time project setup) and the **development workflow** (repeatable loop of explore → plan → improve → implement → verify → commit → evolve).

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

Path examples below show the default `.ai-factory/` locations. `config.yaml` can relocate plan, fix, reference, security, patch, evolution, and loop artifacts while keeping the same ownership flow.

Optional discovery step: use `/aif-explore` before planning to investigate ideas, compare options, and clarify requirements.

Reliability gate: use `/aif-grounded` when the main problem is not discovery but certainty - high-stakes answers, changeable facts, version-sensitive behavior, or any request where the model must refuse to guess.

If you want exploration results to survive `/clear` and feed directly into planning, ask `/aif-explore` to save them to `paths.research` (default: `.ai-factory/RESEARCH.md`).

Optional conventions step: use `/aif-rules` to append or refine project-wide axioms in `paths.rules_file`, or `/aif-rules area:<name>` to create or update `<configured rules dir>/<area>.md` and register `rules.<area>` in `.ai-factory/config.yaml`. Downstream workflow skills resolve rules with the same hierarchy: `rules.<area>` > `rules/base.md` > `paths.rules_file`.

![workflow](https://github.com/lee-to/ai-factory/raw/2.x/art/workflow.png)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       DEVELOPMENT WORKFLOW                              │
└─────────────────────────────────────────────────────────────────────────┘

   Need to think first?                         Need certainty first?
          │                                             │
          ▼                                             ▼
   ┌───────────────┐                            ┌────────────────┐
   │ /aif-explore  │                            │ /aif-grounded  │
   │ clarify scope │                            │ verify facts   │
   │ compare paths │                            │ reject guesses │
   └───────┬───────┘                            └────────┬───────┘
           │                                             │
           └──────────────────────┬──────────────────────┘
                                  ▼

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
                             │                      │◀── skill-context  ────┘
                             │ /aif-implement       │       (+limited patch fallback)
                             │ ──── error?          │
                             │  ──▶ /aif-fix        │
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
                                             │ Reads new patches + │
                                             │ project context     │
                                             │       ↓             │
                                             │ Improves skills     │
                                             │                     │
                                             └─────────────────────┘

```

## When to Use What?

| Command | Use Case | Creates Branch? | Creates Plan? |
|---------|----------|-----------------|---------------|
| `/aif-explore` | Discovery, option comparison, and requirements clarification before planning | No | No (optional `paths.research` on request) |
| `/aif-grounded` | Evidence-only answers, strict verification, and high-stakes questions where guessing is unacceptable | No | No |
| `/aif-roadmap` | Strategic planning, milestones, long-term vision | No | `paths.roadmap` (default: `.ai-factory/ROADMAP.md`) |
| `/aif-rules` | Capture project conventions or add area-specific rules before planning and implementation | No | No (`paths.rules_file` or `paths.rules/<area>.md`) |
| `/aif-plan fast` | Small tasks, quick fixes, experiments | No | `paths.plan` (default: `.ai-factory/PLAN.md`) |
| `/aif-plan full` | Full features, stories, epics | Optional (`git.enabled` + `git.create_branches`) | `paths.plans/<branch-or-slug>.md` |
| `/aif-plan full --parallel` | Concurrent features via worktrees | Yes + worktree (`git.enabled` + `git.create_branches`) | Autonomous end-to-end |
| `/aif-improve` | Refine plan before implementation | No | No (improves existing) |
| `/aif-loop` | Iterative generation with quality gates and phase-based cycles | No | No (uses `paths.evolution`, default `.ai-factory/evolution/`) |
| `/aif-reference` | Create knowledge refs from URLs/docs for AI agents | No | No (`paths.references`, default `.ai-factory/references/`) |
| `/aif-fix` | Bug fixes, errors, hotfixes | No | Optional (`paths.fix_plan`, default `.ai-factory/FIX_PLAN.md`) |
| `/aif-verify` | Post-implementation quality check | No | No (reads existing) |

## Artifact Ownership and Context Gates

Ownership is command-scoped to avoid conflicting writers:

| Command                                   | Primary artifact ownership                                                                               | Notes                                                   |
|-------------------------------------------|----------------------------------------------------------------------------------------------------------|---------------------------------------------------------|
| `/aif`                                    | `.ai-factory/DESCRIPTION.md`, setup `AGENTS.md`                                                          | invokes `/aif-architecture` for architecture file       |
| `/aif-architecture`                       | `paths.architecture` (default: `.ai-factory/ARCHITECTURE.md`)                                           | may update architecture pointer in DESCRIPTION/AGENTS   |
| `/aif-roadmap`                            | `paths.roadmap` (default: `.ai-factory/ROADMAP.md`)                                                      | `/aif-implement` may mark completed milestones          |
| `/aif-rules`                              | `paths.rules_file` (default: `.ai-factory/RULES.md`), `paths.rules/<area>.md`, `rules.<area>`           | top-level axioms plus area-rule files and registration  |
| `/aif-plan`                               | `paths.plan`, `paths.plans/<branch-or-slug>.md`                                                           | `/aif-improve` refines existing plans                   |
| `/aif-explore`                            | `paths.research` (default: `.ai-factory/RESEARCH.md`)                                                    | all other artifacts are read-only in explore mode       |
| `/aif-reference`                          | `paths.references/*`, `paths.references/INDEX.md`                                                        | knowledge references from external sources              |
| `/aif-fix`                                | `paths.fix_plan`, `paths.patches/*.md`                                                                   | bug-fix learning loop artifacts                         |
| `/aif-evolve`                             | `paths.evolutions/*.md`, `paths.evolutions/patch-cursor.json`, `.ai-factory/skill-context/*`            | skill-context overrides + evolution logs + cursor state |
| `/aif-commit` `/aif-review` `/aif-verify` | read-only context by default                                                                             | gate and report, no default context-file writes         |

Context-gate defaults for `/aif-commit`, `/aif-review`, `/aif-verify`:
- Check architecture, roadmap, and rules alignment as read-only context.
- Missing optional files (`ROADMAP.md`, `RULES.md`) are `WARN`, not immediate failures.
- In strict verification, clear architecture/rules violations and clear roadmap mismatch are blocking failures.

## Workflow Skills

These skills form the development pipeline. Each one feeds into the next.

### `/aif-explore [topic or plan name]` — discovery before planning

```
/aif-explore real-time collaboration
/aif-explore the auth system is getting unwieldy
/aif-explore add-auth-system
```

Thinking-partner mode for exploring ideas, constraints, and trade-offs without implementing code. Reads the resolved description, architecture, rules, and research artifacts plus active plan files for context. If you want the context to persist across sessions (or after `/clear`), save it to `paths.research`. When direction is clear, transition to `/aif-plan fast` or `/aif-plan full`.

### `/aif-grounded [question or task]` — certainty before action

```
/aif-grounded Does this repo already support feature flags?
/aif-grounded Which command should I use if I need a fully verified answer?
```

Reliability-gate mode for evidence-backed answers. Use it when the task is already clear but the answer must be strictly verified: high-stakes requests, version-sensitive facts, current-state questions, or any prompt that says "no assumptions". Unlike `/aif-explore`, it is not for brainstorming or open-ended trade-off mapping; it either answers from evidence with `Confidence: 100/100` or stops with `INSUFFICIENT INFORMATION` and tells you what is missing.

### `/aif-roadmap [check | vision]` — strategic planning

```
/aif-roadmap                              # Create or update roadmap
/aif-roadmap SaaS for project management  # Create from vision
/aif-roadmap check                        # Auto-scan: find completed milestones
```

High-level project planning. Creates `paths.roadmap` (default: `.ai-factory/ROADMAP.md`) — a strategic checklist of major milestones (not granular tasks). Use `check` to automatically scan the codebase and mark milestones that appear done. `/aif-implement` also checks the roadmap after completing all tasks.

### `/aif-plan [fast|full] <description>` — plan the work

```
/aif-plan Add user authentication with OAuth       # Asks which mode
/aif-plan fast Add product search API              # Quick plan, no branch
/aif-plan full Add user authentication with OAuth  # Full plan; branch is optional
/aif-plan full --parallel Add Stripe checkout      # Parallel worktree
```

Two modes — **fast** (no branch, saves to `paths.plan`) and **full** (asks about testing/logging/docs policy and optional roadmap milestone linkage when the roadmap artifact exists, saves to `paths.plans/<branch-or-slug>.md`, and optionally creates a git branch/worktree when `git.enabled=true` and `git.create_branches=true`). Analyzes requirements, explores codebase for patterns, creates tasks with dependencies. For 5+ tasks, includes commit checkpoints. For parallel work on multiple features, use `full --parallel` to create isolated worktrees.

### `/aif-improve [--list] [@plan-file] [prompt]` — refine the plan

```
/aif-improve
/aif-improve --list
/aif-improve @my-custom-plan.md
/aif-improve add validation and error handling
```

Second-pass analysis. Finds missing tasks (migrations, configs, middleware), fixes dependencies, removes redundant work. Plan source priority: `@plan-file` argument, then branch-based `paths.plans/<branch>.md`, then a single named full plan in `paths.plans`, then `paths.plan`, then `paths.fix_plan`. `--list` is a read-only discovery mode that shows available plan files and exits. Shows a diff-like report before applying changes.

### `/aif-loop [new|resume|status|stop|list|history|clean] [task or alias]` — iterative quality loop

```
/aif-loop new OpenAPI 3.1 spec + DDD notes + JSON examples
/aif-loop resume
/aif-loop status
/aif-loop list
/aif-loop history courses-api-ddd
/aif-loop clean courses-api-ddd
```

Runs a strict Reflex Loop with 6 phases: PLAN -> PRODUCE||PREPARE -> EVALUATE -> CRITIQUE -> REFINE. PRODUCE and PREPARE run in parallel via `Task` tool; EVALUATE runs check groups in parallel. Before iteration 1, it always asks for explicit confirmation of success criteria and max iterations (even if both are already in task text). Keeps one active loop pointer under `paths.evolution/current.json` and per-task run state in `paths.evolution/<alias>/run.json` with append-only events in `history.jsonl` and latest output in `artifact.md`. Stops on threshold reached, no major issues, stagnation, or max iterations (default: 4). If loop stops on max iterations without passing criteria, final summary includes distance-to-success metrics (threshold gap + remaining blocking fail-rules). Use `list` to see all loop runs, `history` to view events, `clean` to remove old loop runs.

For full contracts and state transition rules, see [Reflex Loop](loop.md).

### `/aif-implement` — execute the plan

```
/aif-implement        # Continue from where you left off
/aif-implement --list # Show available plans only (no execution)
/aif-implement @my-custom-plan.md # Execute using an explicit plan file
/aif-implement 5      # Start from task #5
/aif-implement status # Check progress
```

Reads skill-context rules first, then uses limited recent patch fallback when needed. Executes tasks one by one with commit checkpoints. Plan source priority: `@plan-file` argument, then branch-based `paths.plans/<branch>.md`, then a single named full plan in `paths.plans`, then `paths.plan`, then `paths.fix_plan` (redirects to `/aif-fix`). `--list` is a read-only discovery mode that shows available plan files and exits. Docs policy after completion: `Docs: yes` → mandatory docs checkpoint (update docs / create feature page / skip, routed via `/aif-docs`), `Docs: no` or unset → `WARN [docs]` only.

### `/aif-verify [--strict]` — check completeness

```
/aif-verify          # Verify implementation against plan
/aif-verify --strict # Strict mode — zero tolerance for gaps
```

Optional step after `/aif-implement`. Goes through every task in the plan and verifies the code actually implements it. Checks build, tests, lint, looks for leftover TODOs, undocumented env vars, and plan-vs-code drift. If gaps are found, it first suggests `/aif-fix <issue summary>` (recommended). If verification is clean, it suggests `/aif-security-checklist` and `/aif-review`. Use `--strict` before merging to the configured base branch.

Also runs read-only context gates against the resolved architecture, roadmap, and RULES.md artifacts. In normal mode, roadmap/milestone linkage gaps are warnings; in strict mode, clear roadmap mismatch is a failure, while missing `feat`/`fix`/`perf` milestone linkage remains a warning.

### `/aif-review` — code review with read-only context gates

Reviews staged changes or PR diff and reports correctness/security/performance findings. Includes read-only architecture/roadmap/rules gate notes in review output (`WARN` for non-blocking inconsistencies, `ERROR` only for explicitly blocking criteria).

### `/aif-commit` — conventional commit with read-only context gates

Creates conventional commits from staged changes and runs read-only architecture/roadmap/rules checks before finalizing the message. By default this remains warning-first (no implicit strict mode). For `feat`/`fix`/`perf` commits, missing roadmap milestone linkage is reported as warning.

### `/aif-fix [bug description]` — fix and learn

```
/aif-fix TypeError: Cannot read property 'name' of undefined
```

Two modes — choose when you invoke:
- **Fix now** — investigates and fixes immediately with logging
- **Plan first** – creates `paths.fix_plan` with analysis and fix steps, then stops for review

When a plan exists, run without arguments to execute:
```
/aif-fix    # reads the configured fix plan → applies fix → deletes plan
```

Every fix creates a **self-improvement patch** in `paths.patches` (default: `.ai-factory/patches/`). Patches improve future workflow runs primarily through `/aif-evolve` (which distills them into `.ai-factory/skill-context/*`).

### `/aif-evolve` — improve skills from experience

```
/aif-evolve          # Evolve all skills
/aif-evolve fix      # Evolve only the fix skill
```

Reads patches incrementally using an evolve cursor, analyzes project patterns, and proposes targeted skill improvements. Closes the learning loop: **fix → patch → evolve → better skills → fewer bugs**.

---

For full details on all skills including utility commands (`/aif-docs`, `/aif-dockerize`, `/aif-build-automation`, `/aif-ci`, `/aif-commit`, `/aif-skill-generator`, `/aif-reference`, `/aif-security-checklist`), see [Core Skills](skills.md).

## Why Spec-Driven?

- **Predictable results** - AI follows a plan, not random exploration
- **Resumable sessions** - progress saved in plan files, continue anytime
- **Commit discipline** - structured commits at logical checkpoints
- **No scope creep** - AI does exactly what's in the plan, nothing more

## See Also

- [Reflex Loop](loop.md) — strict iterative loop contracts and state transitions
- [Core Skills](skills.md) — detailed reference for all workflow and utility skills
- [Plan Files](plan-files.md) — how plan artifacts are stored and managed
