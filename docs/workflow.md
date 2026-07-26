[← Getting Started](getting-started.md) · [Back to README](../README.md) · [Reflex Loop →](loop.md)

# Development Workflow

AI Factory has two phases: **configuration** (one-time project setup) and the **development workflow** (repeatable loop of explore → plan → improve → implement → verify → commit → evolve).

## Project Configuration

Run once per project. Sets up context files that all workflow skills depend on.

During `/aif`, the initial `.ai-factory/config.yaml` is created from the commented template, and setup reruns refresh only the managed keys so manual comments and unrelated customizations survive.

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

Path examples below show the default `.ai-factory/` locations. `config.yaml` can relocate plan, fix, reference, security, patch, evolution, loop, and qa artifacts while keeping the same ownership flow.

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
                                        ├─────────────────────────────────────────────────┐
                                        │                                                 │
                                        ▼                                                 ▼
                             ┌──────────────────────────────────────┐       ┌───────────────────────────┐
                             │                                      │       │                           │
                             │ /aif-verify                          │       │ /aif-qa                   │
                             │    (optional)                        │       │    (optional)             │
                             │                                      │       │                           │
                             │ Check completeness                   │       │ Manual QA artifacts:      │
                             │ Build / test / lint                  │       │ → change-summary          │
                             │    ↓                                 │       │ → test-plan               │
                             │ → /aif-security-checklist            │       │ → test-cases              │
                             │ → /aif-review                        │       │                           │
                             │                                      │       │ paths.qa/<branch-slug>/   │
                             └──────────────────┬───────────────────┘       └───────────────────────────┘
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
| `/aif-plan full` | Full features, stories, epics | Optional (`git.enabled` + `git.create_branches`) | `paths.plans/<branch-or-slug>.md` (or `paths.plans/<NNNN>_<branch-or-slug>.md` when `workflow.plan_id_format: sequential` — see [Plan Files](plan-files.md)) |
| `/aif-plan ultra` | Large/cross-cutting work delegated from a strong planner to a smaller implementer | Optional (`git.enabled` + `git.create_branches`) | `paths.plans/<id>/index.md` + one detailed file per phase |
| `/aif-plan full|ultra --parallel` | Concurrent features via worktrees | Yes + worktree (`git.enabled` + `git.create_branches`) | Autonomous end-to-end |
| `/aif-improve` | Refine plan before implementation | No | No (improves existing) |
| `/aif-loop` | Iterative generation with quality gates and phase-based cycles | No | No (uses `paths.evolution`, default `.ai-factory/evolution/`) |
| `/aif-reference` | Create knowledge refs from URLs/docs for AI agents | No | No (`paths.references`, default `.ai-factory/references/`) |
| `/aif-distillation` | Turn books, docs, folders, or URLs into one reusable Agent Skill or a split set of focused skills | No | No |
| `/aif-fix` | Bug fixes, errors, hotfixes | No | Optional (`paths.fix_plan`, default `.ai-factory/FIX_PLAN.md`) |
| `/aif-rules-check` | Standalone read-only rules compliance gate for staged work, working tree, or a git ref | No | No (reads existing rules and optional plan context) |
| `/aif-verify` | Post-implementation quality check | No | No (reads existing) |
| `/aif-qa` | Manual QA for a feature/fix: change summary → test plan → test cases | No | `paths.qa/<branch-slug>/*.md` (default: `.ai-factory/qa/<branch-slug>/`) |
| `/aif-qa-check` | Execute QA cases manually or through automated agent checks | No | `paths.qa/<branch-slug>/qa-check.md`; agent mode also maintains `paths.qa/agent-context.md` and `paths.qa/agent-history.md` |
| `/aif-archive` | Archive completed plans and trim closed roadmap milestones | No | `paths.archive/plans/*`, `paths.archive/roadmap/*.md` (default: `.ai-factory/archive/`) |

`/aif-qa change-summary` normally derives context from git diffs. When `git.enabled=false` or the target/base refs cannot be resolved locally or through `origin/<base_branch>`, it asks for manual change context instead of failing on git commands. `/aif-qa-check` consumes the resulting `test-cases.md`; human mode asks for one result at a time, and agent mode uses the appropriate execution surface for each case: browser, CLI, API, automated tests, or file/document checks. Browser/UI cases still require live browser execution, preferring the in-app Browser and falling back to Playwright MCP; non-browser cases are not blocked merely because browser automation is unavailable. Agent mode reads `agent-context.md` and `agent-history.md` first, asks the user for missing recoverable execution context before blocking, records only reusable non-sensitive cross-QA facts in those root-level files, and offers human-mode continuation only for human-verifiable blocked cases. Run-specific details stay in branch-specific `qa-check.md`. QA check results are bound to the tested commit plus worktree digest, or to a manual build identifier when git is unavailable, plus source/case digests, so stale passes are not counted after the branch, dirty working tree, or test cases change.

## Artifact Ownership and Context Gates

Ownership is command-scoped to avoid conflicting writers:

| Command                                   | Primary artifact ownership                                                                    | Notes                                                     |
|-------------------------------------------|-----------------------------------------------------------------------------------------------|-----------------------------------------------------------|
| `/aif`                                    | `.ai-factory/DESCRIPTION.md`, setup `AGENTS.md`                                               | invokes `/aif-architecture` for architecture file         |
| `/aif-architecture`                       | `paths.architecture` (default: `.ai-factory/ARCHITECTURE.md`)                                 | may update architecture pointer in DESCRIPTION/AGENTS     |
| `/aif-roadmap`                            | `paths.roadmap` (default: `.ai-factory/ROADMAP.md`)                                           | `/aif-implement` may mark completed milestones            |
| `/aif-rules`                              | `paths.rules_file` (default: `.ai-factory/RULES.md`), `paths.rules/<area>.md`, `rules.<area>` | top-level axioms plus area-rule files and registration    |
| `/aif-plan`                               | `paths.plan`, full `paths.plans/<id>.md`, ultra `paths.plans/<id>/`                            | `/aif-improve` refines existing plans/bundles             |
| `/aif-explore`                            | `paths.research` (default: `.ai-factory/RESEARCH.md`)                                         | all other artifacts are read-only in explore mode         |
| `/aif-reference`                          | `paths.references/*`, `paths.references/INDEX.md`                                             | knowledge references from external sources                |
| `/aif-distillation`                       | current agent skills directory by default, or `--path <directory>` as an output root (`<root>/<skill-name>/`, or prefixed child dirs in `--split` mode) | distilled skills from explicit source material            |
| `/aif-fix`                                | `paths.fix_plan`, `paths.patches/*.md`                                                        | bug-fix learning loop artifacts                           |
| `/aif-evolve`                             | `paths.evolutions/*.md`, `paths.evolutions/patch-cursor.json`, `.ai-factory/skill-context/*`  | skill-context overrides + evolution logs + cursor state   |
| `/aif-qa`                                 | `paths.qa/<branch-slug>/change-summary.md`, `test-plan.md`, `test-cases.md`                   | derived branch slug as subdirectory (see aif-qa SKILL.md) |
| `/aif-qa-check`                           | `paths.qa/<branch-slug>/qa-check.md`, `paths.qa/agent-context.md`, `paths.qa/agent-history.md` | executes `/aif-qa` test cases; source QA artifacts stay read-only; agent context/history are reusable automated-QA memory |
| `/aif-archive`                            | `paths.archive/plans/*`, `paths.archive/roadmap/*.md`                                         | moves completed plan files/bundles from `paths.plans/`; trims closed milestones from `paths.roadmap` |
| `/aif-rules-check`                        | read-only context by default                                                                  | standalone rules gate; no default context-file writes     |
| `/aif-commit` `/aif-review` `/aif-verify` | read-only context by default                                                                  | gate and report, no default context-file writes           |

Context-gate defaults for `/aif-commit`, `/aif-review`, `/aif-verify`:
- Check architecture, roadmap, and rules alignment as read-only context.
- Missing optional files (`ROADMAP.md`, `RULES.md`) are `WARN`, not immediate failures.
- In strict verification, clear architecture/rules violations and clear roadmap mismatch are blocking failures.
- `/aif-rules-check` is the standalone rules-only companion and uses human `PASS` / `WARN` / `FAIL` labels.
- `/aif-verify`, `/aif-review`, `/aif-security-checklist`, and `/aif-rules-check` append a final machine-readable `aif-gate-result` JSON block with lowercase `pass` / `warn` / `fail` status values. See [Quality Gates](quality-gates.md).

## Workflow Skills

These skills form the development pipeline. Each one feeds into the next.

### `/aif-explore [topic or plan name]` — discovery before planning

```
/aif-explore real-time collaboration
/aif-explore the auth system is getting unwieldy
/aif-explore add-auth-system
```

Thinking-partner mode for exploring ideas, constraints, and trade-offs without
implementing code. Reads resolved context plus relevant active plan artifacts.
If you want the context to persist after `/clear`, save it to `paths.research`.
When direction is clear, transition to `/aif-plan fast`, `full`, or `ultra`.

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

### `/aif-plan [fast|full|ultra] <description>` — plan the work

```
/aif-plan Add user authentication with OAuth       # Asks which mode
/aif-plan fast Add product search API              # Quick plan, no branch
/aif-plan full Add user authentication with OAuth  # Full plan; branch is optional
/aif-plan ultra Rebuild billing around a ledger    # Multi-file, implementation-complete plan
/aif-plan full --parallel Add Stripe checkout      # Parallel worktree
```

Three modes — **fast** (quick single file), **full** (rich single file), and
**ultra** (a directory whose `index.md` owns scope/progress and whose phase files
specify implementation in code-level detail). Full and ultra share testing,
logging, docs, roadmap, branch, and worktree preferences. Sequential IDs put
`NNNN_` on the full filename or ultra directory and count both active shapes.
Ultra is strictly opt-in through the explicit leading `ultra` token. Omitting
the mode preserves the existing interactive choice between full and fast.
All modes preserve an explicit `Original Request`; research-backed plans commit
a revisioned `Research Context`. Ultra additionally requires exact paths and
symbols, ordered edits, contracts, errors/logging, test policy, acceptance
criteria, verification, and bundle-integrity checks so a smaller model does not
have to reconstruct architecture. See [Plan Files](plan-files.md).

### `/aif-improve [--list] [+check] [@plan-file-or-directory] [prompt]` — refine the plan

```
/aif-improve
/aif-improve --list
/aif-improve +check
/aif-improve @my-custom-plan.md
/aif-improve @.ai-factory/plans/feature-billing
/aif-improve add validation and error handling
```

Second-pass analysis. Finds missing tasks, fixes dependencies, removes redundant
work, and reports useful-but-out-of-scope ideas. Discovery priority is explicit
file/ultra directory, branch-based full/ultra artifact, single named artifact,
fast plan, then fix plan. Ultra refinement reads and updates `index.md` plus all
linked phase files as one bundle, preserves task progress in the index, and
reruns link/task/dependency integrity checks. `Original Request` stays verbatim;
revisioned Research Context remains committed scope and drift produces
`WARN [research-drift]`. `--list` is read-only.

Optional `+check` runs a single fresh-context `general-purpose` subagent on the refinements (`missing` / `improvements` / `removals` / `out_of_scope` groups), drops invented items, rewrites partially-correct ones, and appends `Hidden by +check` / `Adjusted by +check` counters to the Step 5 Summary block. Dependency fixes are recomputed against the filtered list after validation. Combined with `--list`, the flag is silently ignored — there is no refinement to validate.

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
/aif-implement @.ai-factory/plans/feature-billing # Execute an ultra bundle
/aif-implement 5      # Start from task #5
/aif-implement status # Check progress
```

Reads skill-context rules first, then uses limited recent patch fallback when
needed. Executes tasks one by one with commit checkpoints. Discovery supports an
explicit plan file or ultra directory, branch/single named full or ultra
artifact, fast plan, then fix-plan redirect. For ultra, it reads the complete
phase file before executing a task and updates progress only in `index.md`.
`Original Request` supplies original scope; committed Research Context supplies
revisioned requirements. `--list` is read-only. Docs policy remains
`Docs: yes` → mandatory `/aif-docs` checkpoint; `no`/unset → `WARN [docs]`.
When executing through the Claude top-level `implement-coordinator`, the quality-gate sidecars include `review-sidecar`, `security-sidecar`, and `rules-sidecar` (`aif-rules-check`) after code changes, plus `best-practices-sidecar` for maintainability checks. In Handoff automation, `HANDOFF_SKIP_REVIEW=1` intentionally skips the review-family gates: `review-sidecar`, `security-sidecar`, and `rules-sidecar`.

### `/aif-verify [--strict]` — check completeness

```
/aif-verify          # Verify implementation against plan
/aif-verify --strict # Strict mode — zero tolerance for gaps
```

Optional step after `/aif-implement`. Goes through every task in the plan and verifies the code actually implements it. If the plan contains `Original Request`, `/aif-verify` uses it as original scope context while the task list and committed Research Context remain the executable verification inputs. If the plan references `RESEARCH.md`, `/aif-verify` verifies against the embedded Research Context and checks `paths.research` only for revision drift. Checks build, tests, lint, looks for leftover TODOs, undocumented env vars, and plan-vs-code drift. If gaps are found, it first suggests `/aif-fix <issue summary>` (recommended). If verification is clean, it suggests `/aif-security-checklist` and `/aif-review`. Use `--strict` before merging to the configured base branch.

Also runs read-only context gates against the resolved architecture, roadmap, and RULES.md artifacts. In normal mode, roadmap/milestone linkage gaps are warnings; in strict mode, clear roadmap mismatch is a failure, while missing `feat`/`fix`/`perf` milestone linkage remains a warning. The final output appends an `aif-gate-result` JSON block for orchestrators.

### `/aif-rules-check` — standalone rules gate

Checks only rules compliance for staged changes, working-tree changes, or a provided git ref. It reads the resolved rules hierarchy, uses optional active plan context only to disambiguate scope, and stays read-only. Human verdicts are `PASS` / `WARN` / `FAIL`: missing or ambiguous rules stay `WARN`, while `FAIL` is reserved for explicit hard-rule violations tied to concrete diff evidence. The final output appends an `aif-gate-result` JSON block with lowercase `pass` / `warn` / `fail`.

### `/aif-review [PR number or URL] [+check]` — code review with read-only context gates

Reviews staged changes or PR diff and reports correctness/security/performance findings. Includes read-only architecture/roadmap/rules gate notes in review output (`WARN` for non-blocking inconsistencies, `ERROR` only for explicitly blocking criteria), then appends an `aif-gate-result` JSON block.

Optional `+check` runs a single fresh-context `general-purpose` subagent on the drafted findings (Critical Issues and Suggestions only): drops invented items, rewrites partially-correct ones in place, and may reclassify items between the two severity levels — promote a suggestion to "Critical Issues" when the cited behavior is actually merge-blocking, or demote a critical finding to "Suggestions" when the framing was too harsh. Severity definitions and the promotion/demotion rules live in `skills/aif-review/references/SEVERITY.md`. The rendered review gains a final line `Filtered: N hidden, M adjusted, K reclassified by +check`. The `aif-gate-result` block is rebuilt **after** filtering — from the surviving findings merged with the unchanged context-gate result, so a failing context gate keeps `status` at `fail` even when no Critical Issues remain; `suggested_next` is recomputed (`/aif-commit` when no blockers remain; otherwise `/aif-fix`, or the failing gate's own command — `/aif-rules`, `/aif-architecture`, `/aif-roadmap` — when a single context gate is the sole blocker). If the validator call fails entirely the unfiltered review is kept and a single `WARN [+check]` line is appended above the `aif-gate-result` block (which always stays last).

### `/aif-commit` — conventional commit with read-only context gates

Creates conventional commits from staged changes and runs read-only architecture/roadmap/rules checks before finalizing the message. When an active plan contains `## Commit Plan`, it can use the planned commit groups first; unmapped staged files trigger a question before staging or committing, and no commit plan leaves staged-diff behavior unchanged. If the same file spans multiple groups, `/aif-commit` must use hunk-level staging or stop before changing staging. Whole-file staging is allowed only when grouped files do not overlap unstaged worktree paths. By default this remains warning-first (no implicit strict mode). For `feat`/`fix`/`perf` commits, missing roadmap milestone linkage is reported as warning.

### `/aif-fix [bug description]` — fix and learn

```
/aif-fix TypeError: Cannot read property 'name' of undefined
```

Two modes — choose when you invoke:
- **Fix now** — investigates, applies the Canonical Regression-First Policy when needed, fixes with logging, then reruns the same regression check when available
- **Plan first** – creates `paths.fix_plan` with analysis and fix checklist, then stops for review

The Canonical Regression-First Policy is defined in `skills/aif-fix/SKILL.md`.

When a plan exists, run without arguments to execute:
```
/aif-fix    # reads the configured fix plan → applies fix → deletes only default FIX_PLAN.md
```

After successful execution, `/aif-fix` deletes only the default `.ai-factory/FIX_PLAN.md`; custom/non-default fix plan files are preserved.

If a fix plan references `RESEARCH.md`, `/aif-fix` executes against the embedded Research Context and checks `paths.research` only for revision drift.

Every fix creates a **self-improvement patch** in `paths.patches` (default: `.ai-factory/patches/`). Patches improve future workflow runs primarily through `/aif-evolve` (which distills them into `.ai-factory/skill-context/*`).

### `/aif-evolve` — improve skills from experience

```
/aif-evolve          # Evolve all skills
/aif-evolve fix      # Evolve only the fix skill
```

Reads patches incrementally using an evolve cursor, analyzes project patterns, and proposes targeted skill improvements. Closes the learning loop: **fix → patch → evolve → better skills → fewer bugs**.

---

For full details on all skills including utility commands (`/aif-docs`, `/aif-dockerize`, `/aif-build-automation`, `/aif-ci`, `/aif-commit`, `/aif-rules-check`, `/aif-skill-generator`, `/aif-distillation`, `/aif-reference`, `/aif-security-checklist`, `/aif-qa`, `/aif-qa-check`), see [Core Skills](skills.md).

## Why Spec-Driven?

- **Predictable results** - AI follows a plan, not random exploration
- **Resumable sessions** - progress saved in plan files, continue anytime
- **Commit discipline** - structured commits at logical checkpoints
- **No scope creep** - AI does exactly what's in the plan, nothing more

## See Also

- [Reflex Loop](loop.md) — strict iterative loop contracts and state transitions
- [Core Skills](skills.md) — detailed reference for all workflow and utility skills
- [Plan Files](plan-files.md) — how plan artifacts are stored and managed
