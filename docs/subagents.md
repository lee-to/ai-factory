[← Reflex Loop](loop.md) · [Back to README](../README.md) · [Core Skills →](skills.md)

# Subagents

> **Bundled package assets are Claude-only.** AI Factory ships bundled Claude subagents from the package `subagents/` directory and installs them into `.claude/agents/` during `ai-factory init` whenever Claude Code is selected. `ai-factory update` refreshes those managed files. Extensions may also provide agent files for Codex or extension-defined runtimes, but those are configured through the extension manifest rather than this bundled package inventory.

## Migration Note

If you have an existing AI Factory project that was initialized before subagent support was added, running `ai-factory update` will automatically install all bundled subagents into `.claude/agents/`. This is intentional migration behavior — `loadConfig()` reads legacy Claude-only `subagentsDir`, `installedSubagents`, and `managedSubagents`, but persists the universal `agentsDir`, `installedAgentFiles`, and `managedAgentFiles` fields on the next save. No opt-in is required; the bundled subagents remain part of the standard AI Factory package for Claude Code.

If you already have custom agents in `.claude/agents/`, they will not be touched — AI Factory only manages files listed in `installedAgentFiles` / `managedAgentFiles` in `.ai-factory.json`.

## Why This Exists

AI Factory supports many coding agents, but Claude Code has a native subagent system with isolated context, per-agent tool restrictions, model selection, and project-local agent files.

This repository uses that feature for six narrow purposes:
- splitting `/aif-loop` into small, single-responsibility roles so the Reflex Loop stays predictable, cheaper to run, and easier to reason about
- adding one planning specialist that can run `/aif-plan` and `/aif-improve` as a local critique/refinement loop before implementation
- adding one planning coordinator that iteratively launches the planning specialist until the plan passes critique or the iteration budget is exhausted
- adding one implementation coordinator that parses plan dependency graphs, implements single tasks directly with quality sidecars, and dispatches independent tasks in parallel via isolated workers
- exposing background execution sidecars for top-level Claude agent orchestration

The intended benefit is:
- keep noisy phase work out of the main conversation
- separate writer roles from judge roles
- use cheaper models for prep work and stronger models for evaluation/refinement
- make each phase return a strict contract instead of free-form reasoning

## Scope

Current scope is intentionally small:
- one planning subagent, one planning coordinator, one implementation coordinator with its worker, five execution sidecars, and the loop-related subagents are defined
- source files live in the package `subagents/` directory
- managed copies are installed into `.claude/agents/`
- all of them are project-local, not user-global
- all of them stay specialized for AI Factory internal workflows

If you edit these files manually, reload them in Claude Code with `/agents` or by restarting the session.

## Current Bundled Agents

| Agent | Purpose | Model | Tools |
|---|---|---|---|
| `plan-coordinator` | iteratively launch `plan-polisher` in a critique→improve loop until the plan passes or the iteration budget is exhausted. **Top-level agent only** | `inherit` | `Agent(plan-polisher), Read, Glob, Grep, Bash` |
| `implement-coordinator` | parse plan dependency graph, implement single tasks directly with quality sidecars, dispatch `implement-worker` workers for parallel tasks, merge results. **Top-level agent only** | `inherit` | `Agent(implement-worker, best-practices-sidecar, commit-preparer, docs-auditor, review-sidecar, security-sidecar), Read, Write, Edit, Glob, Grep, Bash` |
| `implement-worker` | isolated worktree worker for parallel task execution — implements one task, runs local quality checks, returns results to coordinator | `inherit` | `Read, Write, Edit, Glob, Grep, Bash` |
| `best-practices-sidecar` | background read-only best-practices sidecar for current implementation scope | `inherit` | `Read, Glob, Grep, Bash` |
| `plan-polisher` | create or refresh an `/aif-plan` artifact, critique it, and iterate with `/aif-improve` until the plan is stable | `inherit` | `Read, Write, Edit, Glob, Grep, Bash` |
| `commit-preparer` | background read-only commit preparation sidecar for current implementation scope | `sonnet` | `Read, Glob, Grep, Bash` |
| `docs-auditor` | background read-only documentation drift sidecar for current implementation scope | `sonnet` | `Read, Glob, Grep, Bash` |
| `review-sidecar` | background read-only code review sidecar for current implementation scope | `inherit` | `Read, Glob, Grep, Bash` |
| `security-sidecar` | background read-only security audit sidecar for current implementation scope | `inherit` | `Read, Glob, Grep, Bash` |
| `loop-orchestrator` | decide the next loop phase from `run.json` state | `sonnet` | `Read, Glob, Grep` |
| `loop-planner` | build a short 3-5 step iteration plan | `haiku` | `Read, Glob, Grep` |
| `loop-producer` | generate the current markdown artifact | `inherit` | `Read, Write, Edit` |
| `loop-evaluator` | return strict pass/fail JSON against active rules | `inherit` | `Read, Glob, Grep` |
| `loop-critic` | translate failed rules into minimal fix instructions | `sonnet` | `Read` |
| `loop-refiner` | apply minimal fixes to the artifact | `inherit` | `Read, Write, Edit` |
| `loop-test-prep` | prepare lightweight test-oriented checks | `haiku` | `Read, Glob, Grep` |
| `loop-perf-prep` | prepare latency/RPS/perf checks | `haiku` | `Read, Glob, Grep` |
| `loop-invariant-prep` | prepare invariant and consistency checks | `haiku` | `Read, Glob, Grep` |

## How `plan-polisher` and `plan-coordinator` Fit

`plan-polisher` is not part of `/aif-loop`. It is a self-contained planning worker for Claude Code that:
- runs an `/aif-plan`-compatible pass directly inside the subagent
- critiques the generated plan against implementation-readiness criteria
- applies at most one `/aif-improve`-compatible refinement pass
- returns `needs_further_refinement: yes/no` to the caller

To stay compatible with Claude Code subagent constraints, it does **not** try to spawn nested workers. When the injected skill instructions mention delegated exploration, the agent replaces that with direct `Read`/`Glob`/`Grep`/`Bash` work inside the same context.

`plan-coordinator` sits above `plan-polisher`. It is a **top-level agent** that must be started with `claude --agent plan-coordinator` because it needs to spawn `plan-polisher` as a subagent.

It automates the iterative refinement loop:

1. Launch `plan-polisher` to create the initial plan, critique it, and apply one improvement pass.
2. Check the result: if `needs_further_refinement: yes`, launch `plan-polisher` again to critique and improve the existing plan.
3. Repeat until the plan passes critique, the iteration budget is exhausted (default: 3), or stagnation is detected (2 consecutive iterations with no material change).

### Configuration

Both agents accept `tests` and `docs` parameters that control whether the generated plan includes testing and documentation tasks:

| Parameter | Default | Values | Description |
|-----------|---------|--------|-------------|
| `tests`   | `infer` | `yes`, `no`, `infer` | Include test tasks in the plan |
| `docs`    | `infer` | `yes`, `no`, `infer` | Include documentation tasks in the plan |

When set to `infer` (the default), `plan-polisher` auto-detects from the project structure:
- **tests** → `yes` if the project has a test suite (`tests/`, `__tests__/`, `*.test.*`, `*.spec.*`, test config files)
- **docs** → `yes` if the project has documentation infrastructure (`docs/`, structured `README.md`, docstring conventions)

Explicit values from the caller always take priority over inference.

This gives the user a fire-and-forget planning experience: start `claude --agent plan-coordinator "implement user auth with JWT"` and get back a polished, implementation-ready plan without manual re-runs.

## How `implement-coordinator` Fits

`implement-coordinator` is the execution-side companion to `plan-coordinator`. It is a **top-level agent** that must be started with `claude --agent implement-coordinator` because it needs to spawn subagents.

It combines coordination and implementation in one agent:

- **Single-task layers**: implements the task directly within the coordinator, using quality sidecars (`review-sidecar`, `security-sidecar`, `best-practices-sidecar`, `docs-auditor`, `commit-preparer`) as background workers. This avoids isolation overhead and gives full sidecar coverage.
- **Parallel-task layers**: dispatches `implement-worker` workers concurrently, one per task. Each worker gets its own worktree so file edits cannot collide. Workers run local quality checks (no sidecars — subagents cannot spawn children).

This design eliminates the previous `implementer` / `implementer-isolation` layer, which had a structural problem: when spawned as subagents of the coordinator, they could not spawn their own sidecar subagents. By merging implementation logic into the coordinator itself, single-task execution gets real sidecar support, and parallel execution stays cleanly isolated.

Workflow:

1. Parse the active plan and build a dependency graph from `(depends on X, Y)` annotations.
2. Identify layers of independent tasks — tasks whose dependencies are all satisfied.
3. If a layer has multiple tasks, launch one `implement-worker` per task concurrently.
4. If a layer has a single task, implement it directly with sidecar support.
5. After each layer completes, merge worktree results, run verification, and advance to the next layer.
6. Commits are handled centrally by the coordinator, not by individual workers.

Safety constraints:
- maximum 4 parallel workers per layer
- merge conflicts cause an immediate stop with a prompt to the user
- 2 consecutive layer failures stop the entire run
- workers are forbidden from creating commits

This agent is useful when the plan has clearly independent tasks. For simple linear plans where every task depends on the previous one, it falls back to sequential execution automatically.

### Plan annotation

The coordinator treats the plan file as a live status document and keeps it updated throughout execution:

1. **Before work starts** — after parsing the dependency graph, the coordinator adds `<!-- parallel: tasks N, M -->` comments above groups of independent tasks. This makes the dispatch plan visible before any code is written.
2. **When dispatching** — each task's checkbox changes from `[ ]` to `[~]` with an `<!-- in-progress -->` marker, so it is clear which tasks are currently in flight.
3. **After completion** — successful tasks become `[x]`, failed tasks become `[!]` with a `<!-- failed: reason -->` marker.

Example plan during execution:

```markdown
### Phase 1: Setup
<!-- parallel: tasks 1, 2 -->
- [x] Task 1: Create User model
- [~] Task 2: Add authentication types <!-- in-progress -->

### Phase 2: Core
- [ ] Task 3: Implement password hashing (depends on 1, 2)
- [ ] Task 4: Create auth service (depends on 3)
```

This gives crash recovery — if the session dies mid-run, the plan file shows exactly which tasks completed, which were in flight, and which are still pending.

### Which One To Use

| Situation | Preferred agent | Why |
|---|---|---|
| You want a polished plan without manual re-runs | `plan-coordinator` | Iterates critique→improve automatically until the plan is ready |
| Quick one-shot plan that you will review yourself | `plan-polisher` (as subagent) | Single cycle, less overhead |
| Plan already exists, ready to implement | `implement-coordinator` | Skips planning, goes straight to execution |
| Any implementation task (single or parallel) | `implement-coordinator` | Handles both modes — direct execution for single tasks, isolation workers for parallel |
| End-to-end from idea to code | `plan-coordinator` then `implement-coordinator` | Run sequentially — a single combined agent is impractical due to skill/prompt overload |

## Quality Sidecars

`best-practices-sidecar`, `commit-preparer`, `docs-auditor`, `review-sidecar`, and `security-sidecar` exist for the Claude-native case where a custom top-level orchestrator can legally delegate:
- all are `background: true`
- all are read-only
- all of them are intended to report concise blocker-focused findings back to `implement-coordinator`

This lets the execution loop keep noisy review, security, docs-drift, commit-analysis, and maintainability analysis work out of the main coordinator context when Claude is running in full custom-agent mode.

The loop prep workers are also good background candidates and are configured that way:
- `loop-test-prep`
- `loop-perf-prep`
- `loop-invariant-prep`

They are read-only, parallel by design, and produce short structured outputs that do not need user interaction.

## How They Fit Into `/aif-loop`

The loop has six logical phases:

1. `PLAN`
2. `PRODUCE`
3. `PREPARE`
4. `EVALUATE`
5. `CRITIQUE`
6. `REFINE`

The subagents map onto those phases like this:

| Loop phase | Subagent |
|---|---|
| `PLAN` | `loop-planner` |
| `PRODUCE` | `loop-producer` |
| `PREPARE` | `loop-test-prep`, `loop-perf-prep`, `loop-invariant-prep` |
| `EVALUATE` | `loop-evaluator` |
| `CRITIQUE` | `loop-critic` |
| `REFINE` | `loop-refiner` |
| routing between phases | `loop-orchestrator` |

This keeps responsibilities narrow:
- planner decides what to do next
- producer writes
- evaluator judges
- critic explains what failed
- refiner changes only what is needed
- `plan-polisher` stays outside the Reflex Loop and focuses only on plan quality
- `implement-coordinator` stays outside the Reflex Loop and focuses on implementation quality closure
- `best-practices-sidecar`, `commit-preparer`, `docs-auditor`, `review-sidecar`, and `security-sidecar` stay outside the Reflex Loop and support only the implementation coordinator

## Design Principles

### Read-only roles stay read-only where possible

The loop's planning, evaluation, critique, and prep roles do not need write access, so they are intentionally constrained. Most of them also use `permissionMode: plan`, which matches Claude Code's read-only exploration mode. `plan-polisher` and `implement-coordinator` are the exceptions because they own end-to-end refinement of their artifacts.

### Writer roles are limited

Only `loop-producer`, `loop-refiner`, `plan-polisher`, `implement-coordinator`, and `implement-worker` can modify content. `best-practices-sidecar`, `commit-preparer`, `docs-auditor`, `review-sidecar`, and `security-sidecar` are intentionally read-only. This reduces the chance of accidental state drift across phases and keeps write access tied to explicit artifact ownership.

### Cheap where possible, stronger where necessary

`haiku` is used for prep/planning roles where the output is short and structured. `sonnet` is used for generation, evaluation, critique, and refinement where quality matters more. The non-loop agents (`implement-coordinator`, `implement-worker`, `plan-polisher`) use `inherit` to match the session's model, since they handle complex multi-skill workflows where model choice should follow the user's preference.

### Output contracts are strict

Most loop agents return either:
- JSON only, for machine-consumed phases
- raw markdown only, for artifact-producing phases

That makes the overall loop easier to orchestrate and validate.

## Important Claude Code Constraints

These repo-local agents follow current Claude Code subagent behavior:

- ordinary subagents cannot spawn other subagents
- nested delegation must stay in the main flow
- subagents are selected partly from the `description` field, so descriptions should be explicit
- manual edits to `.claude/agents/*.md` are not always picked up until reload

Because of that, the loop design favors phase-specialized workers instead of deep agent trees. `plan-polisher` runs its critique/refine cycle locally instead of trying to delegate the improve pass again. `implement-coordinator` can spawn sidecars directly because it runs as a top-level agent. Its isolation workers (`implement-worker`) run local quality passes instead of trying to spawn nested sidecars.

## Top-Level Agent Sessions

Claude Code has two fundamentally different ways to use an agent:

1. **As a subagent** — the main conversation spawns the agent with `Agent(name, prompt)`. The agent runs in an isolated context, does its work, and returns a summary. This is the default and most common mode.
2. **As a top-level agent** — the entire Claude Code session runs as that agent via `claude --agent <name>`. The agent's prompt replaces the default system prompt for the session.

The critical difference: **top-level agents can spawn subagents, ordinary subagents cannot.** This is a hard constraint in Claude Code, not a convention.

### When to use a top-level agent

Use `claude --agent <name>` when:

- The agent needs to **coordinate other agents**. An orchestrator that dispatches work to multiple workers must be top-level because it needs `Agent(...)` tool access to spawn them. Example: `implement-coordinator` dispatches multiple `implement-worker` workers in parallel — this only works from the top level.
- The agent needs to **run background sidecars**. Background subagents are pre-approved for permissions at launch. This works cleanly from a top-level session but not from inside another subagent. Example: `implement-coordinator` running as top-level can launch `review-sidecar` and `security-sidecar` in background during single-task execution.
- The workflow is the **primary purpose of the session**. If you start Claude Code specifically to run an implementation plan from start to finish, launching the coordinator as top-level avoids an unnecessary wrapper layer.

### When NOT to use a top-level agent

Stay with ordinary subagent invocation when:

- The work is a **single self-contained task** that returns a result to the user. Most agents fall into this category.
- The agent does **not need to spawn other agents**. Read-only workers, evaluators, critics, and refiners have no reason to be top-level.
- You want the agent to run **alongside normal conversation**. Top-level agents replace the system prompt, so the session loses default Claude Code behavior.

### Current top-level agents in this repo

| Agent | Why top-level | Command |
|---|---|---|
| `plan-coordinator` | Must spawn `plan-polisher` iteratively for critique→improve loop | `claude --agent plan-coordinator` |
| `implement-coordinator` | Must spawn `implement-worker` workers and quality sidecars | `claude --agent implement-coordinator` |

All other agents in this repo are designed as ordinary subagents and do not benefit from top-level execution.

### Quick Start

**Full workflow (plan → implement):**

```bash
# Step 1: Polish the plan
claude --agent plan-coordinator "implement user authentication with JWT"

# With explicit tests/docs control
claude --agent plan-coordinator "implement user authentication with JWT, tests: yes, docs: yes"

# Step 2: Implement it (reads the plan created in step 1)
claude --agent implement-coordinator
```

A single combined agent is not feasible — Claude Code's single-responsibility constraint means planning and implementation skills in one prompt cause the LLM to skip delegation and take shortcuts.

**Plan only (iterative polish until ready):**

```bash
# Start the plan coordinator — it will loop critique→improve automatically
claude --agent plan-coordinator "implement user authentication with JWT"

# Force tests and docs inclusion
claude --agent plan-coordinator "implement user authentication with JWT, tests: yes, docs: yes"

# Polish an existing plan
claude --agent plan-coordinator "@.ai-factory/plans/feature-auth.md"
```

**Implement only (plan already exists):**

```bash
# Reads the active plan, builds dependency graph, dispatches workers
claude --agent implement-coordinator

# Implement a specific plan file
claude --agent implement-coordinator "@.ai-factory/plans/feature-auth.md"
```

**Simple single-task implementation (no coordinator needed):**

```bash
# Inside a normal Claude Code session, use /aif-implement directly
```

## Why Only Claude For Now

Other supported agents in AI Factory have their own skill formats and extension points, but they do not share Claude Code's `.claude/agents/` subagent mechanism. So this specific setup is intentionally documented as Claude-only instead of pretending it is portable.

If we later build an agent-agnostic abstraction for role-based loop workers, this page should be updated to separate:
- Claude-native subagents
- generic AI Factory workflow roles
- any cross-agent equivalent implementation

## See Also

- [Reflex Loop](loop.md) - the workflow these agents support
- [Core Skills](skills.md) - slash command reference including `/aif-loop`
- [Configuration](configuration.md) - project directories and agent config files
