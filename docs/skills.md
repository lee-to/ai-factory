[← Development Workflow](workflow.md) · [Back to README](../README.md) · [Skill Evolution →](evolve.md)

# Core Skills

**Config-aware skills read `.ai-factory/config.yaml` at startup** to resolve paths, language settings, workflow preferences, and rules hierarchy. The current config-aware set is `/aif`, `/aif-plan`, `/aif-implement`, `/aif-verify`, `/aif-commit`, `/aif-review`, `/aif-roadmap`, `/aif-explore`, `/aif-loop`, `/aif-rules`, `/aif-architecture`, `/aif-docs`, `/aif-fix`, `/aif-improve`, `/aif-evolve`, `/aif-reference`, and `/aif-security-checklist`.

Config-agnostic built-ins in the current model: `/aif-best-practices`, `/aif-build-automation`, `/aif-ci`, `/aif-dockerize`, `/aif-grounded`, and `/aif-skill-generator`.

Other skills are intentionally config-agnostic for now and rely on repository context, explicit arguments, or fixed non-configurable paths such as `skill-context`. See [Configuration](configuration.md) for the current schema and its limits.

## Workflow Skills

These skills form the core development loop. See [Development Workflow](workflow.md) for the full diagram and how they connect.

### `/aif-explore [topic or plan name]`
Explore ideas, constraints, and trade-offs before planning:
```
/aif-explore real-time collaboration
/aif-explore the auth system is getting unwieldy
/aif-explore add-auth-system
```
- Uses a thinking-partner mode: open questions, option mapping, and ASCII visualization
- Reads project context from the resolved description, architecture, rules, and research artifacts plus active plan files when present
- Does **not** implement code in this mode; when direction is clear, move to `/aif-plan`
- Can optionally persist exploration context to `paths.research` (default: `.ai-factory/RESEARCH.md`) so you can `/clear` and still feed results into `/aif-plan`
- Best when the problem is still fuzzy: requirements unclear, trade-offs unresolved, or you want to inspect the codebase before choosing a direction

### `/aif-plan [fast|full] <description>`
Plans implementation for a feature or task:
```
/aif-plan Add user authentication with OAuth       # Asks which mode
/aif-plan fast Add product search API              # Quick plan, no branch
/aif-plan full Add user authentication with OAuth  # Full plan; branch is optional
```

Two modes:
- **Fast** — no git branch, saves plan to `paths.plan` (default: `.ai-factory/PLAN.md`), asks fewer questions
- **Full** — asks about testing/logging/docs policy, saves plan to `paths.plans/<branch-or-slug>.md`, and creates a git branch only when `git.enabled=true` and `git.create_branches=true`

Both modes explore your codebase for patterns, create tasks with dependencies, and include commit checkpoints for 5+ tasks.

If the resolved research artifact exists, `/aif-plan` reads the `Active Summary` and includes it as `Research Context` in the plan.

If the resolved roadmap artifact exists, `/aif-plan` may also capture a `Roadmap Linkage` section (milestone name + brief rationale) to make milestone alignment explicit.

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

### `/aif-improve [--list] [@plan-file] [prompt]`
Refine an existing plan with a second iteration:
```
/aif-improve                                    # Auto-review: find gaps, missing tasks, wrong deps
/aif-improve --list                             # Show available plans only (no refinement)
/aif-improve @my-custom-plan.md                 # Improve an explicit plan file
/aif-improve добавь валидацию и обработку ошибок # Improve based on specific feedback
```
- Plan source priority: `@plan-file` argument, then branch-based `paths.plans/<branch>.md`, then a single named full plan in `paths.plans`, then `paths.plan`, then `paths.fix_plan`
- Reads `.ai-factory/config.yaml` for `paths.plan`, `paths.plans`, `paths.fix_plan`, `paths.research`, `paths.description`, `paths.patches`, and `language.ui`
- `--list` mode is read-only: shows available plan files and exits
- Performs deeper codebase analysis than the initial `/aif-plan` planning
- Finds missing tasks (migrations, configs, middleware)
- Fixes task dependencies and descriptions
- Removes redundant tasks
- Shows improvement report and asks for approval before applying
- If no plan found — suggests running `/aif-plan` (feature/task) or `/aif-fix` (bugfix) first

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
- Before iteration 1, always explicitly confirms success criteria and max iterations with the user (even if already provided in task text)
- Stops on threshold reached, no major issues, iteration limit, stagnation, or explicit user stop
- If stopped by `iteration_limit` with unmet criteria, final summary includes distance-to-success (threshold gap + remaining fail-rule blockers)
- Full protocol and schemas: [Reflex Loop](loop.md)

### `/aif-implement`
Executes the plan:
```
/aif-implement        # Continue from where you left off
/aif-implement --list # Show available plans only (no execution)
/aif-implement @my-custom-plan.md # Execute using an explicit plan file
/aif-implement 5      # Start from task #5
/aif-implement status # Check progress
```
- **Reads skill-context first** (`.ai-factory/skill-context/aif-implement/SKILL.md`) and only uses limited recent patch fallback when needed
- Finds plan file (`@plan-file` if provided; otherwise branch-based `paths.plans/<branch>.md`, then a single named full plan in `paths.plans`, then `paths.plan`, then `paths.fix_plan` → redirects to `/aif-fix`)
- `--list` mode is read-only: shows available plan files and exits
- Executes tasks one by one
- Prompts for commits at checkpoints
- Docs policy after completion:
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
- **Build & test check** — runs the project's build command, test suite, and linters on changed files
- **Consistency checks** — searches for leftover `TODO`/`FIXME`/`HACK`, undocumented environment variables, missing dependencies, plan-vs-code naming drift
- **Context gates (read-only)** — checks architecture/roadmap/rules alignment before final status; missing optional roadmap/rules files are warnings
- **Git-aware diffing** — uses `git.base_branch` for branch-diff verification; no-git repositories fall back to recent commits / working tree instead of assuming `main`
- **Issue remediation** — if issues found, first suggests `/aif-fix <issue summary>` (recommended), with optional direct fix in-session
- **Follow-up suggestions** — if all green, suggests `/aif-security-checklist`, `/aif-review`, then `/aif-commit`

**Strict mode** (`--strict`) is recommended before merging: requires all tasks complete, build passing, tests passing, lint clean, zero TODOs in changed files, and passing architecture/rules/roadmap gates. For `feat`/`fix`/`perf`, missing roadmap milestone linkage is reported as a warning, not a failure.

### `/aif-fix [bug description]`
Bug fix with optional plan-first mode:
```
/aif-fix TypeError: Cannot read property 'name' of undefined
```
- Asks to choose mode: **Fix now** (immediate) or **Plan first** (review before fixing)
- Reads `.ai-factory/config.yaml` for `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.rules`, `paths.fix_plan`, `paths.patches`, named `rules.<area>` entries, and `language.ui`
- Investigates codebase to find root cause
- Applies fix WITH logging (`[FIX]` prefix for easy filtering)
- Suggests test coverage for the bug
- Creates a **self-improvement patch** in `paths.patches` (default: `.ai-factory/patches/`)

**Plan-first mode** — for complex bugs or when you want to review the approach:
```
/aif-fix Something is broken    # Choose "Plan first" when asked
```
- Investigates the codebase, creates `paths.fix_plan` with analysis, fix steps, risks
- Stops after creating the plan — you review it at your own pace
- When ready, run without arguments to execute the plan:
```
/aif-fix                        # Detects the configured fix plan, executes the fix, deletes the plan
```

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

### `/aif-architecture [clean|ddd|microservices|monolith|layers]`
Generates architecture guidelines tailored to your project:
```
/aif-architecture           # Analyze project and recommend
/aif-architecture clean     # Use Clean Architecture
/aif-architecture monolith  # Use Modular Monolith
```
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

**Stays in sync with your code** — when `/aif-plan full` asks for docs policy and you choose `Docs: yes`, `/aif-implement` shows a mandatory docs checkpoint and routes changes through `/aif-docs`. If `Docs: no` (or unset), `/aif-implement` emits `WARN [docs]` so potential drift is visible without blocking the flow.

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
- **No build file exists?** — analyzes your project (language, framework, package manager, Docker, DB, linters) and generates a complete, best-practice build file from scratch
- **Build file already exists?** — scans for gaps (missing targets, no help command, no Docker targets despite Dockerfile, missing preamble) and enhances it surgically, preserving your existing structure

**Docker-aware** — when Dockerfile or docker-compose is detected:
- Generates container lifecycle targets (`docker-build`, `docker-push`, `docker-logs`)
- Separates dev vs production (`docker-dev`, `docker-prod-build`)
- Adds `infra-up`/`infra-down` for dependency services (postgres, redis)
- Creates container-exec variants (`docker-test`, `docker-lint`, `docker-shell`) for Docker-first projects

**Post-generation integration:**
- Updates README and existing docs with quick command reference
- Suggests creating `AGENTS.md` with build commands for AI agents
- Finds and updates any markdown files that already list project commands

Supports Go, Node.js, Python, and PHP with framework-specific targets (Laravel artisan, Next.js, FastAPI, etc.).

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
- Use for coding conventions, naming rules, architectural constraints

### `/aif-commit`
Creates conventional commits:
- Analyzes staged changes
- Generates meaningful commit message
- Follows conventional commits format
- Runs read-only architecture/roadmap/rules gate checks before commit proposal
- Warning-first by default (no implicit strict mode)
- For `feat`/`fix`/`perf`, warns when roadmap milestone linkage is missing

### `/aif-review [PR number or URL]`
Reviews staged changes or PR diffs:
```
/aif-review
/aif-review 123
/aif-review https://github.com/org/repo/pull/123
```
- Checks correctness, security, performance, and maintainability
- Adds read-only context-gate findings (architecture/roadmap/rules) to review output
- Uses `WARN` for non-blocking context drift and `ERROR` only for explicitly blocking review criteria

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
- Reads `.ai-factory/config.yaml` for `paths.references`, `paths.rules_file`, and `language.ui`
- `--update` re-fetches sources and refreshes an existing reference
- `list` / `show <name>` / `delete <name>` for managing existing references
- References are available to all AI Factory skills — `/aif-plan`, `/aif-implement`, `/aif-grounded` can read them for domain context
- Best when AI needs knowledge it wasn't trained on: new libraries, internal APIs, project-specific specs, or rapidly changing documentation

- Config policy: config-aware; reference storage uses `paths.references`

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

Each category includes a checklist, vulnerable/safe code examples (TypeScript, PHP), and an automated audit script.

**Ignoring items** — if a finding is intentionally accepted, mark it as ignored:
```
/aif-security-checklist ignore no-csrf
```
- Asks for a reason, saves to `paths.security`
- Future audits skip these items but still show them in an **"Ignored Items"** section for transparency
- Review ignored items periodically — risks change over time
- Reads `.ai-factory/config.yaml` for `paths.security` and `language.ui`

- Config policy: config-aware; persistent ignore state uses `paths.security`

## See Also

- [Development Workflow](workflow.md) — how workflow skills connect end-to-end
- [Reflex Loop](loop.md) — strict loop protocol for iterative quality gating
- [Plan Files](plan-files.md) — where workflow artifacts are stored
