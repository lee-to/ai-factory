[← Subagents](subagents.md) · [Back to README](../README.md) · [Quality Gates →](quality-gates.md)

# Core Skills

**Config-aware skills read `.ai-factory/config.yaml` at startup** to resolve paths, language settings, workflow preferences, and rules hierarchy. The current config-aware set is `/aif`, `/aif-plan`, `/aif-implement`, `/aif-verify`, `/aif-commit`, `/aif-review`, `/aif-rules-check`, `/aif-roadmap`, `/aif-explore`, `/aif-loop`, `/aif-rules`, `/aif-architecture`, `/aif-docs`, `/aif-fix`, `/aif-improve`, `/aif-evolve`, `/aif-transfer`, `/aif-reference`, `/aif-distillation`, `/aif-security-checklist`, `/aif-qa`, `/aif-qa-check`, `/aif-archive`, and `/aif-warmup`.

`/aif` is also the primary writer for `config.yaml`: the initial file comes from the commented template, and setup reruns update only managed keys while preserving comments, unrelated manual edits, and `rules.<area>` entries owned by `/aif-rules`.

Config-agnostic built-ins in the current model: `/aif-best-practices`, `/aif-build-automation`, `/aif-ci`, `/aif-dockerize`, `/aif-grounded`, and `/aif-skill-generator`.

Other skills are intentionally config-agnostic for now and rely on repository context, explicit arguments, or fixed non-configurable paths such as `skill-context`. See [Configuration](configuration.md) for the current schema and its limits.

## Workflow Skills

These skills form the core development loop. See [Development Workflow](workflow.md) for the full diagram and how they connect.

### `/aif-warmup`
Load the essential project context before starting work:
```
/aif-warmup
```
- Reads configured DESCRIPTION, ARCHITECTURE, ROADMAP, RESEARCH, and the complete scoped rules hierarchy, plus applicable `AGENTS.md` files
- Resolves custom paths from project root and carries relevant language, git, and workflow preferences into the handoff
- Loads extra engineer-selected files or directories from `warmup.paths`; directory scans are recursive and text-only
- Summarizes active research bundles without loading unrelated supporting artifacts
- Changes nothing and stops at a self-contained handoff, making the warmed session suitable for continuing or forking

### `/aif-explore [ultra] [topic or plan name]`
Explore ideas, constraints, and trade-offs before planning:
```
/aif-explore real-time collaboration
/aif-explore the auth system is getting unwieldy
/aif-explore add-auth-system
/aif-explore ultra partner order synchronization
```
- Uses a thinking-partner mode: open questions, option mapping, and ASCII visualization
- Reads project context from the resolved description, architecture, rules, and research artifacts plus active plan files when present
- Uses `language.ui` for user-facing exploration responses, `language.artifacts` for persisted `paths.research` snapshots and derived ultra bundles, and `language.technical_terms` to preserve commands, paths, identifiers, config keys, and machine-readable research metadata where required
- Does **not** implement code in this mode; when direction is clear, move to `/aif-plan`
- Can optionally persist exploration context to `paths.research` (default: `.ai-factory/RESEARCH.md`) so you can `/clear` and still feed results into `/aif-plan`
- Before presenting any persisted regular or ultra update, checks the saved research without relying on chat memory: the Active Summary must be self-contained, must not silently contradict durable research, and quoted mismatches must be resolved or made explicit in `Open questions`. Runtimes with fresh-context delegation use it; direct checking is the portable fallback.
- Explicit `ultra` is opt-in and persists `<parent(paths.research)>/research/<english-topic-slug>/`. Every bundle has `INDEX.md` + compatible `RESEARCH.md`; C4 Context/Container/Component, ADR, and dependency graph files are added only when evidence meets their complexity signals.
- Keeps `RESEARCH.md` Active Summary as the sole planning input. In ultra mode, summary claims need self-contained supporting passages, and supporting diagrams and decisions must promote material conclusions into that summary instead of silently expanding plan scope.
- Best when the problem is still fuzzy: requirements unclear, trade-offs unresolved, or you want to inspect the codebase before choosing a direction

### `/aif-plan [fast|full|ultra] <description>`
Plans implementation for a feature or task:
```
/aif-plan Add user authentication with OAuth       # Asks which mode
/aif-plan fast Add product search API              # Quick plan, no branch
/aif-plan full Add user authentication with OAuth  # Full plan; branch is optional
/aif-plan ultra Rebuild billing around a ledger    # Exhaustive multi-file plan bundle
```

Three modes:
- **Fast** — no git branch, saves plan to `paths.plan` (default: `.ai-factory/PLAN.md`), asks fewer questions
- **Full** — asks about testing/logging/docs policy, saves plan to `paths.plans/<branch-or-slug>.md` (or `paths.plans/<NNNN>_<branch-or-slug>.md` when `workflow.plan_id_format: sequential` is enabled — see [Plan Files](plan-files.md)), and creates a git branch only when `git.enabled=true` and `git.create_branches=true`
- **Ultra** — uses the full-mode preferences and optional branch/worktree flow,
  but writes `paths.plans/<id>/index.md` plus one deeply specified
  `phase-NN-*.md` file per phase. It is designed for a stronger planning model
  to remove implementation ambiguity before a smaller model writes code.
  Its entrypoint contains the stable untranslated
  `<!-- aif:plan-mode:ultra -->` discovery marker.

Ultra is strictly opt-in: it is selected only by the explicit leading `ultra`
token. A call without a mode keeps the pre-ultra full/fast question and defaults.

All modes explore your codebase for patterns, create tasks with dependencies,
and include commit checkpoints for 5+ tasks. In ultra, `index.md` is the only
task-progress source; phase files own implementation detail, not checkboxes.

If the user supplied a planning request, `/aif-plan` saves it verbatim in the
plan entrypoint as `Original Request`. This block is raw source input, not
generated artifact prose; downstream plan rewrites must preserve it exactly
even when `language.artifacts` differs. It is omitted only when the plan is
created solely from `RESEARCH.md` without an explicit user request.

If a relevant configured or marked ultra-bundle `RESEARCH.md` exists, `/aif-plan` may read its `Active Summary` as optional context. It selects at most one source, never by recency alone. It includes `Research Context` only when research content influenced the generated plan. Linked plans include the exact `Source:` path with revision metadata so downstream skills treat the embedded context as committed requirements and warn if live research has drifted.

If the resolved roadmap artifact exists, `/aif-plan` may also capture a `Roadmap Linkage` section (milestone name + brief rationale) to make milestone alignment explicit.

Plan prompts and summaries use `language.ui`; saved plan artifacts use `language.artifacts` and preserve commands, paths, branch names, identifiers, config keys, and raw errors according to `language.technical_terms`.

**Parallel mode** — work on multiple features simultaneously using `git worktree`:
```
/aif-plan full --parallel Add Stripe checkout
```
- Creates a separate working directory (`../my-project-feature-stripe-checkout`)
- Copies AI context files (`.ai-factory/`, `.claude/`, `CLAUDE.md`)
- Each feature gets its own Claude Code session — no branch switching, no conflicts

**Manage parallel features:**
```
/aif-plan --list                          # Show all active worktrees
/aif-plan --cleanup feature/stripe-checkout # Remove worktree and branch
```

### `/aif-roadmap [check | vision or requirements]`
Creates or updates a strategic project roadmap:
```
/aif-roadmap                              # Analyze project and create roadmap
/aif-roadmap SaaS for project management  # Create roadmap from vision
/aif-roadmap                              # Update existing roadmap (interactive)
/aif-roadmap check                        # Auto-scan codebase, mark done milestones
```
- Reads the resolved description and architecture artifacts for context
- **First run** — explores codebase, asks for major goals, generates `paths.roadmap` (default: `.ai-factory/ROADMAP.md`)
- **Subsequent runs** — review progress, add milestones, reprioritize, mark completed
- **`check`** — automated progress scan: analyzes codebase for evidence of completed milestones, reports done/partial/not started, marks completed with confirmation
- Milestones are high-level goals (not granular tasks — that's `/aif-plan`)
- `/aif-implement` automatically marks roadmap milestones done when work completes

### `/aif-improve [--list] [+check] [@plan-file-or-directory] [prompt]`
Refine an existing plan with a second iteration:
```
/aif-improve                                    # Auto-review: find gaps, missing tasks, wrong deps
/aif-improve --list                             # Show available plans only (no refinement)
/aif-improve +check                             # Validate refinements via fresh-context subagent
/aif-improve @my-custom-plan.md                 # Improve an explicit plan file
/aif-improve @.ai-factory/plans/feature-billing # Improve an ultra bundle
/aif-improve добавь валидацию и обработку ошибок # Improve based on specific feedback
```
- Plan source priority: explicit `@plan-file-or-directory`, branch-based full
  file or ultra bundle, a single named full/ultra artifact, `paths.plan`, then
  `paths.fix_plan`
- Reads `.ai-factory/config.yaml` for `paths.plan`, `paths.plans`, `paths.fix_plan`, `paths.research`, `paths.description`, `paths.patches`, `language.ui`, `language.artifacts`, and `language.technical_terms`
- `--list` mode is read-only: shows available plan files and exits
- Performs deeper codebase analysis than the initial `/aif-plan` planning
- Treats `## Original Request` as the immutable original intent / scope anchor, preserves it verbatim on every plan edit or regeneration, and does not translate it when `language.artifacts` differs
- Preserves embedded `Research Context` as committed requirements, checks its exact legacy or bundled `RESEARCH.md` source for revision drift, and adds a source revision when research informs a previously unlinked plan
- Finds missing tasks (migrations, configs, middleware)
- Fixes task dependencies and descriptions
- Removes redundant tasks
- Surfaces useful-but-out-of-scope tasks in a separate "💡 Out of scope" report section (the skill does not save them anywhere — the user decides what to do with the idea)
- Shows improvement report and asks for approval before applying
- If no plan found — suggests running `/aif-plan` (feature/task) or `/aif-fix` (bugfix) first

**Optional validation (`+check`)**
- After Step 4 the skill dispatches a single fresh-context `general-purpose` subagent that re-reads cited files and judges each finding from the `missing`, `improvements`, `removals`, and `out_of_scope` groups
- Invented findings disappear, partially-correct ones are rewritten in place, real findings stay untouched; the `🔗 Dependency Fixes` group is recomputed against the filtered task list afterwards and is not sent to the validator
- The Step 5 Summary block gains two extra lines — `Hidden by +check: N` and `Adjusted by +check: M`; if the validator call fails entirely, no counters are printed and a single `WARN [+check]` line is appended instead
- `+check` together with `--list` is silently ignored (no refinement to validate)

### `/aif-loop [new|resume|status|stop|list|history|clean] [task or alias]`
Runs a strict iterative Reflex Loop with phase-based execution and quality gates:
```
/aif-loop new OpenAPI 3.1 spec + DDD notes + JSON examples
/aif-loop resume
/aif-loop status
/aif-loop stop
/aif-loop list
/aif-loop history courses-api-ddd
/aif-loop clean courses-api-ddd
```
- Uses 6 phases: PLAN -> PRODUCE||PREPARE -> EVALUATE -> CRITIQUE -> REFINE (PRODUCE and PREPARE run in parallel)
- Evaluation uses weighted rules with score formula and severity levels (`fail`, `warn`, `info`)
- Persists state between sessions in `paths.evolution` (default: `.ai-factory/evolution/`):
  - `current.json` (active loop pointer to current run)
  - `<alias>/run.json` (single source of truth for current state)
  - `<alias>/history.jsonl` (append-only event log)
  - `<alias>/artifact.md` (latest artifact output)
- `list` shows all loop runs, `history` shows event timeline, `clean` removes stopped/completed/failed loop runs
- Default `max_iterations` is `4`
- Optional completed-phase time budget: `run.json.max_completed_phase_seconds` (default: none) stops the loop with `budget_exceeded` once time from completed phase segments crosses the cap. The limit is soft — checked only at phase boundaries, it never interrupts a running phase — and only completed segments count, so interrupted phases and idle time add nothing
- Before iteration 1, always explicitly confirms success criteria, max iterations, and a non-`none` time budget with the user (even if already provided in task text)
- Stop conditions follow a fixed precedence contract — `threshold_reached`, `no_major_issues`, `user_stop`, `stagnation`, `budget_exceeded`, `iteration_limit` — so completion always outranks a resource guard that trips at the same boundary
- If stopped by `iteration_limit` or `budget_exceeded` with unmet criteria, final summary includes distance-to-success (threshold gap + remaining fail-rule blockers)
- Full protocol and schemas: [Reflex Loop](loop.md)

### `/aif-implement`
Executes the plan:
```
/aif-implement        # Continue from where you left off
/aif-implement --list # Show available plans only (no execution)
/aif-implement @my-custom-plan.md # Execute using an explicit plan file
/aif-implement @.ai-factory/plans/feature-billing # Execute an ultra bundle
/aif-implement 5      # Start from task #5
/aif-implement status # Check progress
/aif-implement --without-plan add GET /healthz returning {"status":"ok"} # Inline one-shot task, no plan file
```
- **Reads skill-context first** (`.ai-factory/skill-context/aif-implement/SKILL.md`) and only uses limited recent patch fallback when needed
- Finds a plan artifact (`@path` may name a file, ultra directory, or its
  `index.md`; otherwise branch-based full/ultra, then a single named artifact,
  then `paths.plan`, then `paths.fix_plan` → redirects to `/aif-fix`)
- For ultra, reads `index.md` and the complete phase file for the active task;
  updates task progress only in `index.md`
- Treats `## Original Request` as useful original scope context while executing the task list and committed `Research Context` as the executable plan inputs
- Uses embedded `Research Context` as committed scope and checks the exact legacy or bundled `RESEARCH.md` source only for revision drift
- `--list` mode is read-only: shows available plan files and exits
- `--without-plan <description>` mode (inline):
  - Executes exactly one small task from the description — no plan file created, read, or updated
  - Mutually exclusive with `@plan-file`, `status`, and task id
  - Skips `TaskList` / checkbox updates, does **not** create `FIX_PLAN.md` or `paths.patches` entries (use `/aif-fix` for bugs, not this flag)
  - Loads the same project context as regular mode (config, `DESCRIPTION.md`, `ARCHITECTURE.md`, rules, skill-context)
  - Tests are written only if the description explicitly asks for them, or if existing project conventions / touched code paths clearly require them
  - Redirects to `/aif-plan fast <description>` when the description looks too broad for a one-shot task
  - Optional `--docs=yes|no|warn` (default: `warn`) — `yes` runs the docs checkpoint via `/aif-docs`, `no` silences the warn line, `warn` emits `WARN [docs]` only
  - Supports Handoff via `HANDOFF_TASK_ID` env var with a synthetic `- [ ] <description>` plan pushed through `handoff_push_plan`; when `HANDOFF_TASK_ID` is unset, MCP sync is skipped entirely
- Executes tasks one by one
- Prompts for commits at checkpoints
- Docs policy after completion (plan-backed modes):
  - `Docs: yes` → mandatory documentation checkpoint (update docs / create feature page / skip)
  - `Docs: no` or unset → `WARN [docs]` only (no mandatory checkpoint)
  - Docs updates are always routed through `/aif-docs`
- Offers to delete the resolved fast plan path when done

### `/aif-verify [--strict]`
Verifies completed implementation against the plan:
```
/aif-verify          # Check all tasks were fully implemented
/aif-verify --strict # Strict mode — zero tolerance before merge
```

**Optional step after `/aif-implement`** — when implementation finishes, you'll be asked if you want to verify.

- **Task completion audit** — goes through every task in the plan, uses `Glob`/`Grep`/`Read` to confirm the code actually implements each requirement. Reports `COMPLETE`, `PARTIAL`, or `NOT FOUND` per task
- **Original request context** — uses `## Original Request` as the original scope context when present, while the task list and committed `Research Context` remain the executable verification inputs
- **Research-backed plan audit** — verifies against embedded `Research Context` when present, checks its exact legacy or bundled source for revision drift, and emits `WARN [research-drift]` instead of applying newer Active Summary requirements silently
- **Build & test check** — runs the project's build command, test suite, and linters on changed files
- **Consistency checks** — searches for leftover `TODO`/`FIXME`/`HACK`, undocumented environment variables, missing dependencies, plan-vs-code naming drift
- **Context gates (read-only)** — checks architecture/roadmap/rules alignment before final status; missing optional roadmap/rules files are warnings
- **Git-aware diffing** — uses `git.base_branch` for branch-diff verification; no-git repositories fall back to recent commits / working tree instead of assuming `main`
- **Issue remediation** — if issues found, first suggests `/aif-fix <issue summary>` (recommended), with optional direct fix in-session
- **Follow-up suggestions** — if all green, suggests `/aif-security-checklist`, `/aif-review`, then `/aif-commit`
- **Machine-readable result** — appends a final `aif-gate-result` JSON block with `status: pass|warn|fail`, `blocking`, `blockers`, `affected_files`, and `suggested_next`
- Uses `language.ui` for prompts, verification reports, context-gate summaries, issue remediation prompts, and follow-up guidance; machine-readable JSON values stay stable

**Strict mode** (`--strict`) is recommended before merging: requires all tasks complete, build passing, tests passing, lint clean, zero TODOs in changed files, and passing architecture/rules/roadmap gates. For `feat`/`fix`/`perf`, missing roadmap milestone linkage is reported as a warning, not a failure.

### `/aif-fix [bug description]`
Bug fix with optional plan-first mode:
```
/aif-fix TypeError: Cannot read property 'name' of undefined
```
- Asks to choose mode: **Fix now** (immediate) or **Plan first** (review before fixing)
- Reads `.ai-factory/config.yaml` for `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.rules`, `paths.research`, `paths.fix_plan`, `paths.patches`, named `rules.<area>` entries, `language.ui`, `language.artifacts`, and `language.technical_terms`
- Investigates codebase to find root cause
- When a bug needs regression coverage, follows the Canonical Regression-First Policy before implementation: create or identify a regression check, handle no-regression-check or non-reproducible fallbacks, then preserve the same check for verification
- The Canonical Regression-First Policy is defined in `skills/aif-fix/SKILL.md`
- Applies fix WITH logging (`[FIX]` prefix for easy filtering)
- Reruns the same regression check after the fix when available, then suggests any useful extra coverage
- Creates a **self-improvement patch** in `paths.patches` (default: `.ai-factory/patches/`)
- User-facing fix summaries use `language.ui`; `FIX_PLAN.md` and patch artifacts use `language.artifacts` while preserving `[FIX]`, commands, paths, identifiers, raw errors, and patch tags according to `language.technical_terms`

**Plan-first mode** — for complex bugs or when you want to review the approach:
```
/aif-fix Something is broken    # Choose "Plan first" when asked
```
- Investigates the codebase, creates `paths.fix_plan` with analysis, fix checklist, risks
- Includes `Research Context` only when research content influenced the fix plan, records the exact legacy or bundled source revision, and checks that source only for drift before executing the plan
- Stops after creating the plan — you review it at your own pace
- When ready, run without arguments to execute the plan:
```
/aif-fix                        # Detects the configured fix plan, executes the fix, deletes only the default FIX_PLAN.md
```
- After successful execution, `/aif-fix` deletes only the default `.ai-factory/FIX_PLAN.md`; custom/non-default fix plan files are preserved.

### `/aif-evolve [skill-name|"all"]`
Self-improve skills based on project experience:
```
/aif-evolve          # Evolve all skills
/aif-evolve fix      # Evolve only /aif-fix skill
/aif-evolve all      # Evolve all skills
```
- Reads patches incrementally from `paths.patches` using `paths.evolutions/patch-cursor.json` (first run reads all)
- Reads `.ai-factory/config.yaml` for description, architecture, rules, patches, and evolution-log paths plus language settings; `.ai-factory/skill-context/` remains fixed
- Analyzes project tech stack, conventions, and codebase patterns
- Identifies gaps in existing skills (missing guards, tech-specific pitfalls)
- Proposes targeted improvements with user approval
- Writes project-specific overrides to `.ai-factory/skill-context/<skill>/SKILL.md` (skills treat these as higher-priority rules)
- Saves evolution log to `paths.evolutions` (default: `.ai-factory/evolutions/`)
- The more `/aif-fix` patches you accumulate, the smarter `/aif-evolve` becomes

### `/aif-transfer <source-project-path> [skill-name|"all"]`
Reuse relevant fix experience from another AI Factory project without identifying it:
```
/aif-transfer /path/to/reference-project
/aif-transfer /path/to/reference-project fix
```
- Reads only the source project's AI Factory description, architecture, config, and patch files; the source stays read-only
- Predicts applicability from verified current stack, architecture, and code patterns
- Drops speculative and source-only lessons instead of adding generic rules
- Removes source paths, names, patch filenames, repository metadata, and source-only identifiers before proposals or writes
- Runs the installed `/aif-evolve` workflow in the same invocation, including its explicit approval step
- Writes no imported patches and does not advance the current evolve cursor
- Rechecks every changed current-project artifact for source identity after evolution

---

## Utility Skills

### `/aif`
Analyzes your project and sets up context:
- Scans project files to understand the codebase
- Searches [skills.sh](https://skills.sh) for relevant skills
- Generates custom skills via `/aif-skill-generator`
- Configures MCP servers
- Generates architecture document via `/aif-architecture`

When called with a description:
```
/aif project management tool with GitHub integration
```
- Creates the resolved description artifact (default: `.ai-factory/DESCRIPTION.md`) with enhanced project specification
- Creates the resolved architecture artifact (default: `.ai-factory/ARCHITECTURE.md`) with architecture decisions and guidelines
- Transforms your idea into a structured, professional description

**Does NOT implement your project** - only sets up context.

### `/aif-grounded <question or task>`
Reliability gate that prevents guessing:
```
/aif-grounded Explain how feature flags work in this codebase
/aif-grounded Update dependencies to the latest secure versions (no assumptions)
```
- Only provides a final answer if confidence is **100/100** based on evidence (repo files, command output, provided docs)
- If confidence is < 100, returns **INSUFFICIENT INFORMATION** with a concrete checklist of what’s needed to reach 100
- Forces verification for changeable facts (“latest”, “current”, version-specific behavior)
- Best when the task is already clear but the answer must be strictly verified: high-stakes questions, version-sensitive facts, or any prompt that says “no assumptions”

- Config policy: config-agnostic; this skill uses evidence sources, not `config.yaml`

#### `/aif-explore` vs `/aif-grounded`

| Skill | Use it for | Output style | If things are unclear |
|-------|------------|--------------|------------------------|
| `/aif-explore` | discovery, requirement shaping, trade-off discussion, repo investigation before planning | open-ended thinking partner | keeps exploring, reframing, and comparing options |
| `/aif-grounded` | evidence-only answers, strict verification, high-stakes or changeable facts | confidence-gated answer with explicit evidence | stops and returns `INSUFFICIENT INFORMATION` |

Typical sequence when both are useful:
1. `/aif-explore` — figure out what problem you are really solving.
2. `/aif-grounded` — verify the important claims or current-state facts.
3. `/aif-plan` — turn the clarified, verified direction into executable tasks.

For the workflow view of where these fit, see [Development Workflow](workflow.md).

### `/aif-architecture [explicit|structured|microservices|layers]`
Generates architecture guidelines tailored to your project:
```
/aif-architecture           # Analyze project and recommend
/aif-architecture explicit-layers # Use Explicit Architecture (Technical Layer)
/aif-architecture explicit-vertical # Use Explicit Architecture (Vertical Slices By Entity)
/aif-architecture explicit-flat # Use Explicit Architecture (Flat Vertical Slice - Simplified)
/aif-architecture explicit  # Asks the user which folder structure variant to use (3 options)
/aif-architecture structured-layers # Use Structured Modules (Technical Layer)
/aif-architecture structured-vertical # Use Structured Modules (Vertical Slices By Entity)
/aif-architecture structured # Asks the user which folder structure variant to use
```
*Note: `clean`, `ddd`, `monolith`, and `vertical` are legacy aliases mapped to current patterns for backward compatibility.*
- Reads the resolved description artifact for project context
- Recommends architecture pattern based on team size, domain complexity, and tech stack
- Reads `.ai-factory/config.yaml` for `paths.description`, `paths.architecture`, `language.ui`, and `language.artifacts`
- Generates the resolved architecture artifact (default: `.ai-factory/ARCHITECTURE.md`) with folder structure, dependency rules, code examples
- All examples adapted to your project's language and framework
- Called automatically by `/aif` during setup, but can also be used standalone

### `/aif-docs [--web]`
Generates and maintains project documentation:
```
/aif-docs          # Generate or improve documentation
/aif-docs --web    # Also generate HTML version in docs-html/
```

**Smart detection** - adapts to your project's current state:
- **No README?** - analyzes your codebase and creates a lean README (~100 lines) as a landing page + the resolved `paths.docs` directory with topic pages
- **Long README?** - proposes splitting into a landing-page README with detailed content moved to the resolved `paths.docs` directory
- **Docs exist?** - audits for stale content, broken links, missing topics, and outdated formatting
- Reads `.ai-factory/config.yaml` for `paths.description`, `paths.architecture`, `paths.docs`, `language.ui`, and `language.artifacts`; `README.md` stays fixed, while detailed docs are written under `paths.docs`

**Scattered .md cleanup** — finds loose markdown files in your project root (CONTRIBUTING.md, ARCHITECTURE.md, SETUP.md, DEPLOYMENT.md, etc.) and proposes consolidating them into the resolved `paths.docs` directory. No more documentation scattered across 10 root-level files.

**Stays in sync with your code** — when `/aif-plan full` or `/aif-plan ultra`
asks for docs policy and you choose `Docs: yes`, `/aif-implement` shows a
mandatory docs checkpoint and routes changes through `/aif-docs`. If `Docs: no`
(or unset), `/aif-implement` emits `WARN [docs]` so potential drift is visible
without blocking the flow.

**Documentation website** — `--web` flag generates a complete static HTML site in `docs-html/` with navigation bar, dark mode support, and clean typography. Ready to host on GitHub Pages or any static hosting.

**Quality checks:**
- Every doc page in `paths.docs` gets prev/next navigation header + "See Also" cross-links
- Technical review — verifies links, structure, code examples, no content loss
- Readability review — "new user eyes" checklist: is it clear, scannable, jargon-free?

### `/aif-dockerize [--audit]`
Generates, enhances, or audits Docker configuration for your project:
```
/aif-dockerize          # Auto-detect mode based on existing files
/aif-dockerize --audit  # Force audit mode on existing Docker files
```

**Three modes** (auto-detected):
1. **Generate** — no Docker files exist → interactive setup (choose DB, reverse proxy, cache), then create everything from scratch
2. **Enhance** — only local Docker exists (no production files) → audit & improve local, then create production config with deploy scripts
3. **Audit** — full Docker setup exists → run security checklist, fix gaps, add missing best practices

**Generated file structure:**
- Root: `Dockerfile`, `compose.yml`, `compose.override.yml`, `compose.production.yml`, `.dockerignore`, `.env.example` — only files Docker expects by convention
- `docker/` — service configs (angie/, postgres/, php/, redis/) — only directories that are needed
- `deploy/scripts/` — 6 production ops scripts: deploy, update, logs, health-check, rollback, backup (with tiered retention)

**Interactive setup** — when generating from scratch, asks about infrastructure: database (PostgreSQL, MySQL, MongoDB), reverse proxy (Angie preferred over Nginx, Traefik), cache (Redis, Memcached), queue (RabbitMQ).

**Security audit** — production checklist (OWASP Docker Security Cheat Sheet):
- Container isolation (read-only, no-new-privileges, cap_drop, non-root, tmpfs)
- Port exposure (no ports on infrastructure in prod, only proxy exposes 80/443)
- Network security (internal backend, no host networking, no Docker socket)
- Health checks on every service, log rotation, stdout/stderr logging
- Resource limits (CPU, memory, PIDs), secrets management, image pinning
- Over-engineering check (don't add services the code doesn't use)

After completion, suggests `/aif-build-automation` and `/aif-docs`.

Supports Go, Node.js, Python, and PHP with framework-specific configurations.

- Config policy: config-agnostic; Docker artifacts and deploy scripts are driven by repo detection and explicit infrastructure choices, not `config.yaml`

### `/aif-build-automation [makefile|taskfile|justfile|mage]`
Generates or enhances build automation files:
```
/aif-build-automation              # Auto-detect or ask which tool
/aif-build-automation makefile     # Generate a Makefile
/aif-build-automation taskfile     # Generate a Taskfile.yml
/aif-build-automation justfile     # Generate a justfile
/aif-build-automation mage         # Generate a magefile.go
```

**Two modes — generate or enhance:**
- **No build file exists?** — analyzes your project and generates a complete, best-practice build file from scratch
- **Build file already exists?** — scans for gaps (missing targets, no help command, no Docker targets despite Dockerfile, missing preamble) and enhances it surgically, preserving your existing structure

**Project detection (all stacks):** The skill walks the repository in one **ordered pipeline** for every ecosystem: primary language → package manager / build entrypoints → frameworks → Docker → CI → migrations → tests → linters & formatters → monorepo signals, then builds a `PROJECT_PROFILE`. 

**Docker-aware** — when Dockerfile or docker-compose is detected:
- Generates container lifecycle targets (`docker-build`, `docker-push`, `docker-logs`)
- Separates dev vs production (`docker-dev`, `docker-prod-build`)
- Adds `infra-up`/`infra-down` for dependency services (postgres, redis)
- Creates container-exec variants (`docker-test`, `docker-lint`, `docker-shell`) for Docker-first projects

**Post-generation integration:**
- Updates README and existing docs with quick command reference
- Suggests creating `AGENTS.md` with build commands for AI agents
- Finds and updates any markdown files that already list project commands

**Stack support:** Go, Node.js, Python, PHP, `Cargo.toml` → Rust, `Gemfile` → Ruby, plus **Java/Kotlin (Gradle/Maven)** with `./gradlew` / `gradle` / `./mvnw` / `mvn` as detected.
- **PHP:** Laravel (`artisan`), Symfony (`bin/console`), Slim, CakePHP, and Composer-driven workflows when detected.
- **Node.js, Python, Go, Rust, Ruby:** framework-specific targets (e.g. Next.js, FastAPI, Gin, Axum/Actix/Rocket/Warp, `cargo`/`clippy`/`fmt`, Rails/Sinatra/Hanami, RuboCop/RSpec) per `PROJECT_PROFILE`.
- **Java/Kotlin:** Spring Boot (`bootRun`, `bootJar` / `spring-boot:run`, packaged JAR), gRPC/protobuf, Quarkus (`quarkus:dev`), Micronaut, Vert.x — from Gradle/Maven and repo layout; Liquibase/Flyway, JUnit-style tests, and JVM static analysis tie into the same pipeline as in **Project detection** above.

- Config policy: config-agnostic; build automation targets are derived from repo and tool detection, not `config.yaml`

### `/aif-ci [github|gitlab] [--enhance]`
Generates, enhances, or audits CI/CD pipeline configuration:
```
/aif-ci                   # Auto-detect platform and mode
/aif-ci github            # Generate GitHub Actions workflow
/aif-ci gitlab            # Generate GitLab CI pipeline
/aif-ci --enhance         # Force enhance mode on existing CI
```

**Three modes** (auto-detected):
1. **Generate** — no CI config exists → asks which platform (GitHub/GitLab), optional features (security, coverage, matrix), then creates pipeline from scratch
2. **Enhance** — CI exists but incomplete → analyzes gaps (missing lint/SA/security jobs), adds missing jobs
3. **Audit** — full CI setup exists → audits against best practices, reports issues, fixes gaps

**One workflow per concern** — separate files, not a monolith:
- `lint.yml` — code-style, static analysis, rector (PHPStan, ESLint, Clippy, golangci-lint)
- `tests.yml` — test suite with optional matrix builds and service containers
- `build.yml` — compilation/bundling verification
- `security.yml` — dependency audit + dependency review (composer audit, govulncheck, cargo deny)

**Per-language tools detected automatically:**
- **PHP**: PHP-CS-Fixer/Pint/PHPCS, PHPStan/Psalm, Rector, PHPUnit/Pest
- **Python**: Ruff/Black+isort+Flake8, mypy, pytest, bandit (supports both uv and pip)
- **Node.js/TypeScript**: ESLint/Prettier/Biome, tsc, Jest/Vitest
- **Go**: golangci-lint, go test, govulncheck
- **Rust**: cargo fmt, clippy, cargo test, cargo audit/deny
- **Java**: Checkstyle/PMD/SpotBugs, JUnit, OWASP (Maven and Gradle)

**CI best practices** built-in:
- Concurrency groups, `fail-fast: false`, dependency caching per language
- GitLab: `policy: pull` on downstream jobs, codequality/junit report integration, DAG with `needs:`
- GitHub: explicit `permissions`, `actions/dependency-review-action` for PR security
- Service containers (PostgreSQL, Redis) when tests need external dependencies

After completion, suggests `/aif-build-automation` and `/aif-dockerize`.

- Config policy: config-agnostic; CI generation uses repo analysis and explicit platform choices, not `config.yaml`

### `/aif-rules [rule text]`
Adds project-specific rules and conventions:
```
/aif-rules Always use DTO instead of arrays
/aif-rules                                    # Interactive — asks what to add
/aif-rules area:api                           # Create area-specific rules
```
- Rules are saved to `paths.rules_file` (default: `.ai-factory/RULES.md`) as the axioms artifact
- **Area rules:** `area:api`, `area:frontend`, `area:backend` - creates `<configured rules dir>/<area>.md` and registers it as `rules.<area>` in `.ai-factory/config.yaml`
- **Rules hierarchy:** `rules.<area>` > `rules/base.md` > `paths.rules_file`
- Rules are automatically loaded by `/aif-implement` before task execution
- Prompts and confirmations use `language.ui`; persisted rule artifacts use `language.artifacts` and preserve stable technical tokens according to `language.technical_terms`
- Use for coding conventions, naming rules, architectural constraints

### `/aif-commit`
Creates conventional commits:
- Analyzes staged changes
- Uses active plan `## Commit Plan` groups when available and asks whether to `Follow Commit Plan`, commit everything together, or adjust grouping
- For ultra plans, reads the relevant phase files and maps each commit-group task through its `Files to Change` table and task specification
- Stops for user input when staged files or hunks cannot be mapped to planned commit groups
- Uses hunk-level staging for planned groups that share a file, or stops before changing staging when hunks cannot be applied confidently
- Avoids whole-file staging when there is unstaged worktree overlap with grouped files
- Keeps current staged-diff behavior unchanged when no active plan or no `## Commit Plan` exists
- Generates meaningful commit message
- Follows conventional commits format
- Runs read-only architecture/roadmap/rules gate checks before commit proposal
- Warning-first by default (no implicit strict mode)
- For `feat`/`fix`/`perf`, warns when roadmap milestone linkage is missing

### `/aif-review [PR number or URL] [+check]`
Reviews staged changes or PR diffs:
```
/aif-review
/aif-review 123
/aif-review https://github.com/org/repo/pull/123
/aif-review +check                              # Validate findings via fresh-context subagent
/aif-review 123 +check
```
- Checks correctness, security, performance, and maintainability
- **Coverage-first finding stage** — the review reports every issue it finds, including uncertain and low-severity ones, instead of pre-filtering to "only important" issues; ranking and filtering happen downstream
- **Confidence markers** — an uncertain finding ends with `(confidence: low)` or `(confidence: medium)`; high confidence is the default and carries no marker. Confidence is independent of severity: the section still follows impact, so a potential merge-blocker you are unsure about is reported in "Critical Issues" with a marker
- **Markers are resolved before the gate** — a review that produced any marker runs the `+check` validation automatically, even without the flag, so the published gate never carries an unresolved finding (confirmed → ordinary blocker driving `fail`, refuted → dropped). Marker-free reviews dispatch nothing, keeping `+check` opt-in everywhere else
- Adds read-only context-gate findings (architecture/roadmap/rules) to review output
- Uses `WARN` for non-blocking context drift and `ERROR` only for explicitly blocking review criteria
- Appends a final `aif-gate-result` JSON block for Handoff/AIFHub and other orchestrators
- If you only need the rules gate, use `/aif-rules-check`

**Optional validation (`+check`)**
- After the review is drafted the skill dispatches a single fresh-context `general-purpose` subagent that re-reads cited files and judges each item from "Critical Issues" and "Suggestions"
- Invented findings are dropped, partially-correct ones are rewritten in place, real findings stay untouched — except confirmed marked findings, which come back through `modify` with the confidence marker removed
- Only actionable code findings are validated: context-gate findings, commit-structure findings, "Questions", and "Positive Notes" are not — the validator judges items against the reviewed diff, which is not evidence for those classes
- The subagent can also reclassify items between the two severity levels — promote a suggestion to "Critical Issues" if the underlying behavior is actually merge-blocking, or demote a critical finding to "Suggestions" if the framing was too harsh. The two levels and the promotion/demotion rules live in `references/SEVERITY.md`
- `aif-gate-result` is recomputed after filtering — `status` is the post-filter findings merged with the unchanged context-gate result, so a failing architecture/rules/roadmap gate still forces `fail` even when no Critical Issues remain; `suggested_next` is recomputed accordingly (`/aif-commit` when there are no blockers; otherwise `/aif-fix`, or the failing gate's own command — `/aif-rules`, `/aif-architecture`, `/aif-roadmap` — when a single context gate is the sole blocker)
- Confirming a marked critical is how a `warn` review becomes a `fail` one: the marker is gone, so the item counts as a normal blocker and `suggested_next.command` moves from `null` to `/aif-fix`
- The rendered review gains a final line `Filtered: N hidden, M adjusted, K reclassified by +check`; if the validator call fails entirely, the unfiltered review is kept and a single `WARN [+check]` line is appended instead (always above the `aif-gate-result` block — that block stays the last thing in the output)

### `/aif-rules-check [git ref]`
Runs a standalone read-only rules compliance gate:
```
/aif-rules-check
/aif-rules-check main
```
- Reads `.ai-factory/config.yaml` for `paths.rules_file`, `paths.rules`, `paths.plan`, `paths.plans`, `language.ui`, `git.enabled`, `git.base_branch`, `rules.base`, and any named `rules.<area>`
- Resolves rules with graceful fallback: if `paths.rules_file` is omitted, it defaults to `.ai-factory/RULES.md`
- Checks staged changes, working-tree diff, or a provided git ref against the resolved rules hierarchy
- Uses human standalone verdicts: `PASS` when checked rules are satisfied, `WARN` when rules are missing/ambiguous or no changed files are available, `FAIL` only for explicit hard-rule violations tied to rule text
- Output sections: overall verdict, files checked, gate results, blocking violations, suggested fixes, suggested rule updates, and a final `aif-gate-result` JSON block
- Remains read-only; if rules need to change, route that through `/aif-rules`

- Config policy: config-aware; reads rule paths, optional active plan context, and git diff defaults from `config.yaml`

### `/aif-archive [list | --roadmap | --all | <plan-name>]`
Archives completed plans and trims closed roadmap milestones:
```
/aif-archive                    # Scan for completed plans, ask which to archive
/aif-archive list               # Show archived plans and roadmap snapshots
/aif-archive --all              # Archive all completed plans (with confirmation)
/aif-archive --roadmap          # Trim closed milestones from ROADMAP.md into a snapshot
/aif-archive 0005_feature-auth  # Archive a specific plan by name or partial stem
```
- Reads `.ai-factory/config.yaml` for `paths.plans`, `paths.archive`, `paths.plan`, `paths.fix_plan`, `paths.roadmap`, `workflow.plan_id_format`, and `language.ui`
- A plan is "completed" when all checkboxes in its entrypoint `## Tasks` section are `- [x]`
- Preserves original full filenames or ultra directory names when moving to archive
- Adds `archived: YYYY-MM-DD` to full-plan YAML frontmatter or
  `<!-- aif:archived:YYYY-MM-DD -->` after the stable marker in ultra `index.md`
- Archived plans are excluded from plan discovery by `/aif-implement`, `/aif-verify`, `/aif-improve`
- Does not touch fast plans (`paths.plan`) or fix plans (`paths.fix_plan`)
- `--roadmap` creates a dated snapshot under `paths.archive/roadmap/` and removes closed milestones from the source roadmap (with confirmation)

### `/aif-reference <url|path> [url2|path2] [--name <ref-name>] [--update]`
Creates knowledge references from external sources for AI agents:
```
/aif-reference https://zod.dev --name zod-validation
/aif-reference https://docs.astro.build/en/getting-started/ https://docs.astro.build/en/guides/content-collections/
/aif-reference ./docs/api-spec.yaml --name internal-api
/aif-reference --update --name zod-validation
/aif-reference list
/aif-reference show zod-validation
```
- Fetches URLs (with automatic sub-page crawling, up to 8 pages per source), processes local files, or searches the web interactively
- Synthesizes structured reference documents: overview, core concepts, API/interface, usage patterns, configuration, best practices, pitfalls
- Saves to `paths.references/<name>.md` with source attribution and timestamps
- Maintains an index in `paths.references/INDEX.md`
- Reads `.ai-factory/config.yaml` for `paths.references`, `paths.rules_file`, `language.ui`, `language.artifacts`, and `language.technical_terms`
- `--update` re-fetches sources and refreshes an existing reference
- `list` / `show <name>` / `delete <name>` for managing existing references
- References are available to all AI Factory skills — `/aif-plan`, `/aif-implement`, `/aif-grounded` can read them for domain context
- Best when AI needs knowledge it wasn't trained on: new libraries, internal APIs, project-specific specs, or rapidly changing documentation

- Config policy: config-aware; reference storage uses `paths.references`, prompts use `language.ui`, and generated reference files plus `INDEX.md` use `language.artifacts` while preserving source quotes, code examples, API signatures, URLs, paths, and raw errors according to `language.technical_terms`

### `/aif-distillation <path|url> [path|url...] [--name <skill-name>] [--path <directory>] [--update] [--redact-source-map] [--split|--split-by <strategy>]`
Distills books, documents, folders, or URLs into one reusable Agent Skill or a split set of focused skills:
```
/aif-distillation ./books/software-craft.pdf --name construction-practices
/aif-distillation ./docs/internal-platform ./examples --name platform-operator
/aif-distillation https://example.com/guide --name example-api
/aif-distillation ./new-material --name platform-operator --update
/aif-distillation ./books/code-quality.pdf --split --name code-quality
/aif-distillation ./docs/review-playbook --split-by workflow --name review
/aif-distillation ./books/decision-making.pdf --split-by goal --name decisions
/aif-distillation ./books/internal-guide.pdf --name review-guide --redact-source-map
/aif-distillation ./books/domain-driven-design.pdf --name ddd-practices --path ./distilled-skills
```
- Accepts local files, directories, and URLs, including large PDFs through a chunking helper
- Saves the distilled package in the current agent's skills directory, for example `.codex/skills/<skill-name>/` for Codex CLI
- `--path <directory>` overrides the output root, so packages are saved under `<directory>/<skill-name>/` or `<directory>/<prefix>-<child-scope>/` in split mode
- Produces a compact `SKILL.md` plus detailed `references/` and practical `examples/`
- Converts source material into workflows, heuristics, checklists, pitfalls, and examples rather than a long summary
- `--redact-source-map` skips `SOURCE-MAP.md` and source-map sections entirely, so exact source titles, URLs, local paths, repository paths, filenames, and link reference definitions are not written to generated files
- `--split` creates several focused child skills directly under the resolved output root; `--split-by auto|goal|topic|workflow|audience` controls boundary selection
- Split children always share one namespace prefix to avoid collisions: `--name` when supplied, otherwise a prefix derived from the book or primary material title
- Split child suffixes should describe user goals and actions, not source themes; examples include `refactoring-review`, `test-design`, `argument-edit`, `decision-brief`, `incident-triage`, and `practice-drill`
- For programming material, creates adapted code examples such as before/after snippets or code patterns and maps major code-facing source areas to concrete examples
- Checks existing references/examples before writing and updates matching files instead of creating duplicates
- In split update mode, matches proposed child skills against existing sibling skills and updates matching ones instead of creating near-duplicates
- Uses temporary extraction artifacts for large material and removes them after generation
- Reads `.ai-factory/config.yaml` for `language.ui`, `language.artifacts`, and `language.technical_terms`
- Best when you want a durable single skill from focused material or a toolkit of narrow skills from broad material

- Config policy: config-aware for language only; generated skill package content uses `language.artifacts`, while prompts and summaries use `language.ui`

### `/aif-skill-generator`
Generates new skills:
```
/aif-skill-generator project-api
```
- Creates SKILL.md with proper frontmatter
- Follows [Agent Skills](https://agentskills.io) specification
- Can include references, scripts, templates

**Learn Mode** — pass URLs to generate skills from real documentation:
```
/aif-skill-generator https://docs.example.com/tutorial/
/aif-skill-generator https://docs.example.com/guide https://docs.example.com/reference
/aif-skill-generator my-skill https://docs.example.com/api
```
- Fetches and deeply studies each URL
- Enriches with web search for best practices and pitfalls
- Synthesizes a structured knowledge base
- Generates a complete skill package with references from real sources
- Supports multiple URLs, mixed sources (docs + blogs), and optional skill name hint

- Config policy: config-agnostic; generated skill packages are driven by user input and source material, not `config.yaml`

### `/aif-security-checklist [category]`
Security audit based on OWASP Top 10 and best practices:
```
/aif-security-checklist                  # Full audit
/aif-security-checklist auth             # Authentication & sessions
/aif-security-checklist injection        # SQL/NoSQL/Command injection
/aif-security-checklist xss              # Cross-site scripting
/aif-security-checklist csrf             # CSRF protection
/aif-security-checklist secrets          # Secrets & credentials
/aif-security-checklist api              # API security
/aif-security-checklist infra            # Infrastructure & headers
/aif-security-checklist prompt-injection # LLM prompt injection
/aif-security-checklist race-condition   # Race conditions & TOCTOU
```

Each category includes a checklist, vulnerable/safe code examples (TypeScript, PHP), and an automated audit script. API/client checks include production-only safeguards for browser logging and normalized client-safe UI errors instead of raw exception details.

Audit outputs append a final `aif-gate-result` JSON block for full and category audits. The `ignore <item>` writer flow updates the configured security ignored-item artifact and only reports a gate result when it also performs an audit.

**Ignoring items** — if a finding is intentionally accepted, mark it as ignored:
```
/aif-security-checklist ignore no-csrf
```
- Asks for a reason, saves to `paths.security`
- Future audits skip these items but still show them in an **"Ignored Items"** section for transparency
- Review ignored items periodically — risks change over time
- Reads `.ai-factory/config.yaml` for `paths.security`, `language.ui`, `language.artifacts`, and `language.technical_terms`

- Config policy: config-aware; audit summaries use `language.ui`, persistent ignore state uses `paths.security` and `language.artifacts`, and stable IDs/status values remain unchanged under `language.technical_terms`

### `/aif-qa [--all] [change-summary | test-plan | test-cases] [<branch>]`

Three-stage QA workflow for manual testing of a feature or fix:

```
/aif-qa change-summary          # Analyze what changed on current branch
/aif-qa change-summary feat/x   # Analyze a specific branch
/aif-qa test-plan               # Create test plan (requires change-summary artifact)
/aif-qa test-cases              # Write test cases (requires test-plan artifact)
/aif-qa --all                   # Run all three stages in sequence
/aif-qa --all feat/x            # Full pipeline for a specific branch
```

Each stage builds on the previous one and saves its artifact to `paths.qa/<branch-slug>/`:

| Stage            | Artifact            | What it produces                                    |
|------------------|---------------------|-----------------------------------------------------|
| `change-summary` | `change-summary.md` | Risk-annotated summary of git changes               |
| `test-plan`      | `test-plan.md`      | Scoped test plan with types and acceptance criteria |
| `test-cases`     | `test-cases.md`     | Concrete TC-NNN scenarios with steps and test data  |

For large branches the `change-summary` stage checks commit count (>20) and diff size (>1000 lines) before proceeding — both gates ask the user how to continue rather than silently truncating. When `git.enabled=false` or git refs cannot be resolved, `/aif-qa` asks for manual change context instead of failing on git commands.

The `--all` flag runs all three stages in sequence without inter-stage prompts. If any stage fails, the pipeline stops and reports the failing stage.

- Config policy: config-aware; reads `paths.description`, `paths.architecture`, `paths.qa`, `language.ui`, `language.artifacts`, `language.technical_terms`, `git.enabled`, `git.base_branch`

### `/aif-qa-check [human | agent] [<branch>]`

Executes test cases created by `/aif-qa test-cases` and records results:

```
/aif-qa-check human          # One manual test case at a time
/aif-qa-check agent          # Agent runs browser, CLI, API, test, or file checks
/aif-qa-check human feat/x   # Use QA artifacts for a specific branch
```

Modes:

| Mode | Behavior |
|------|----------|
| `human` | Shows one `TC-NNN` case at a time, asks whether it works, checks passed cases, and records failed comments from the user after mandatory redaction of sensitive values |
| `agent` | User-only automated execution through the appropriate surface for each case: browser, CLI, API, automated tests, or file/document checks. Browser/UI cases require live browser execution, preferring the in-app Browser and falling back to Playwright MCP; non-browser cases must not be blocked just because browser automation is unavailable. Reads reusable QA agent context/history first, asks the user for missing URL, login, access, setup, route, selector, command, test filter, or fixture information before blocking recoverable cases, offers human-mode continuation only for human-verifiable blocked cases, and requires explicit authorization for unknown/production targets and destructive or external-side-effect cases |

Results are saved to `paths.qa/<branch-slug>/qa-check.md`. Passed cases are checked, failed or blocked cases stay unchecked with comments. The source `test-cases.md` remains read-only. Current results are bound to the tested commit SHA plus working tree digest, or to a manual build/version identifier when git is unavailable, plus the full `test-cases.md` digest and per-case digests; stale results are not counted as current after the branch, dirty working tree, or source cases change. Browser evidence, command output summaries, API observations, file checks, and human-entered failure comments are redacted before they are persisted.

Agent mode also maintains `paths.qa/agent-context.md` and `paths.qa/agent-history.md` as cross-QA memory, not per-run logs. `agent-context.md` stores curated non-sensitive facts that unblock future automated QA runs, such as stable target URLs, safe command patterns, reusable test-filter conventions, login route, test account role, seed data patterns, stable selectors, and field IDs. `agent-history.md` is append-only reusable learning for recurring blockers, user answers, resolved friction, command patterns, navigation notes, and selector discoveries. Branch names, QA target paths, `TC-*` mappings, summary counts, assertion totals, one-off command transcripts, and plan-specific claims such as "browser automation is not required" stay in branch-specific `qa-check.md`. Secrets such as passwords, tokens, cookies, authorization headers, one-time codes, and token-bearing URLs must be redacted or omitted.

Internal deterministic checks, such as service-method outputs, cache/materialized data behavior, formula results, raw database invariants, and CLI internals, are treated as automated checks. `/aif-qa-check agent` should find and run an existing narrow test or command for them; when that test passes, the corresponding `TC-*` is marked `Passed` with the command/test evidence. If coverage is missing, it blocks with a missing-automated-coverage note instead of asking a human to manually verify arrays or database values. Human-mode continuation is offered only for blocked cases that are actually human-verifiable.

For browser/UI cases that need login or a specific user state, `/aif-qa-check agent` must resolve a browser test identity before blocking: reuse known safe test accounts, inspect local/test fixtures, create a disposable fixture when the environment is clearly local/test and tooling is available, or ask the user which test credentials/setup to use. Reusable test-only credentials may be saved to `agent-context.md` only with explicit user permission; production or personal credentials, cookies, sessions, and one-time codes are never persisted.

- Config policy: config-aware; reads `paths.description`, `paths.architecture`, `paths.qa`, `language.ui`, `language.artifacts`, `language.technical_terms`, `git.enabled`

## See Also

- [Development Workflow](workflow.md) — how workflow skills connect end-to-end
- [Quality Gates](quality-gates.md) - machine-readable gate summary contract
- [Reflex Loop](loop.md) — strict loop protocol for iterative quality gating
- [Plan Files](plan-files.md) — where workflow artifacts are stored
