# AI Factory Developer Guide

AI Factory is a TypeScript CLI and skill distribution system. It installs skills, configures MCP, and supports spec-driven development across agent runtimes. Use this file for repository rules and entry points. Follow the topic links when working on the corresponding feature.

## Agent Rules

- Keep dependencies one-way: `src/cli → src/core → src/utils`. CLI handlers collect input and delegate orchestration to core. Keep runtime-specific behavior in adapters. Use the existing extension interfaces, and keep `src/utils` framework-agnostic. Never import generated `dist/` into `src/` or edit `dist/` by hand.
- Edit bundled skill sources under `skills/`. Installed copies and runtime renderings are generated from those sources. Use `aif-*` names. Search skills.sh before creating a skill that may already exist.
- Resolve `.ai-factory/config.yaml` when present. Use the configured DESCRIPTION and ARCHITECTURE as the sources of truth for project scope and architecture. Follow area rules over base rules over the project-wide rules file. Keep plans under the configured AI Factory paths.
- Respect explicit scope and artifact ownership. `/aif` sets up project context and stops before implementation. Plan, explore, implement, verify, and commit each have their own scope.
- Add configurable verbose logging when implementing code. Use the existing logger and log levels, and give actionable errors. Add tests when requested or specified by the implementation plan. Run the existing checks applicable to the change. For plans with five or more tasks, define commit checkpoints.
- Preserve exact original request text, source revisions, statuses, and machine-readable markers wherever the workflow defines a compatibility contract. Preserve the boundary between discovered, authorized, executed, and verified work.

## Project Structure

- `src/cli/`, `src/core/`, and `src/utils/` contain the CLI, core logic, and shared utilities.
- `skills/`, `subagents/`, and `mcp/` contain bundled content. `scripts/` contains validation and tests.
- [Repository layout and module boundaries](docs/architecture.md#repository-layout) describes the full map.

## Key Entry Points

| Topic | Entry point |
| --- | --- |
| CLI | `src/cli/index.ts` |
| Skill installation | `src/core/installer.ts` |
| Bundled skills | `skills/aif-*/SKILL.md` |
| Repository checks | `scripts/test-skills.sh` |

See [entry points by subsystem](docs/architecture.md#entry-points) for other files.

## AI Context Files

| File or configured path | Purpose |
| --- | --- |
| `.ai-factory/config.yaml` | Artifact paths, workflow, Git, language, and registered rules |
| `paths.description` (default `.ai-factory/DESCRIPTION.md`) | Project description, stack, and requirements |
| `paths.architecture` (default `.ai-factory/ARCHITECTURE.md`) | Architecture, module boundaries, and dependency rules |
| `paths.rules_file`, `rules.base`, `rules.<area>` | Project axioms, base conventions, and area rules |
| `paths.roadmap`, `paths.research` | Milestones and exploration context |
| `paths.plan`, `paths.plans`, `paths.fix_plan` | Fast plan, named full/ultra plans, and fix plan |
| `.ai-factory/skill-context/` | Optional local workflow guidance for bundled skills |

`language.ui` / `language.artifacts` / `language.technical_terms` control UI language, artifact language, and how technical terms are preserved. Follow the applicable skill and the [config reference](docs/config-reference.md) for discovery, defaults, and read/write ownership. `.ai-factory.json` stores CLI installation metadata and user-owned dispatch settings. Setup reruns refresh only managed keys in `config.yaml` and preserve comments, manual settings, unknown sections, and existing `rules.<area>`. The skill-context root and the README and `docs-html/` locations remain fixed under the current schema.

Load applicable skill-context layers in global → build → individual order. Build applies only to fix, implement, plan, verify, and improve. Individual takes precedence over build and global while explicit requirements, project rules, architecture, and hard boundaries remain authoritative. For shared writes and transfer, see [shared skill context](skills/aif-evolve/references/SHARED-CONTEXT.md) and [evolution](docs/evolve.md). Shared writes require resolution and validation of every consumer. Named and global runs keep their own destinations. There is no automatic migration.

## Artifact Ownership

Apply [workflow ownership and context gates](docs/workflow.md#artifact-ownership-and-context-gates) and the [verification matrix](skills/aif-verify/references/CONTEXT-GATES-AND-OWNERSHIP.md). Configured paths relocate artifacts within the same ownership contract.

- `/aif` owns setup and managed context configuration. `/aif-rules` owns project and area rules and their registration. `/aif-architecture` and `/aif-roadmap` own their respective artifacts. Implementation may update description or architecture only for material factual or structural changes, and may mark roadmap work complete only with evidence.
- `/aif-explore` owns the selected research file or ultra bundle. `/aif-plan` writes fast/full/ultra plans. `/aif-improve` refines them, and `/aif-implement` tracks execution. `/aif-fix` owns the fix plan and learning patches, with context artifacts read-only by default. `/aif-archive` owns archived plans and roadmap snapshots.
- `/aif-docs` owns README and the configured documentation directory. `/aif-skills-audit` is read-only for installed skills and settings, with a new report only when `--output` is explicit.
- `/aif-quality-setup` owns selected native quality configuration, dependency and script entries, and hooks. CI, build, rules, and docs changes go through their owners. Preserve existing tools, scripts, and hooks. Source edits require the selected autofix mode and verified staging support.
- `/aif-loop` owns loop state. `/aif-evolve` owns skill-context changes and evolution records. Transfer can delegate approved writes there and never advances the patch cursor. Evolve must prove ownership, validate candidates, and obtain approval before writing user-owned skills. Global targets require `--global` and must already exist. Managed package/extension targets stay read-only.
- `/aif-qa` writes change summaries, test plans, and cases. `/aif-qa-check` owns execution results, reusable browser replay, and non-sensitive reusable QA context. Keep recurring learnings append-only and retain replaced replay versions.
- Quality commands read context without writing it by default. In strict verification, clear architecture and rules violations block. Clear roadmap mismatch blocks in strict mode and warns in normal mode. Missing `feat`/`fix`/`perf` milestone linkage is warning-first by default even in strict mode. `/aif-rules-check` reports `PASS`/`WARN`/`FAIL`. Verify, review, security-checklist, and rules-check end with the [quality gate contract](docs/quality-gates.md), an `aif-gate-result` JSON block.

## Workflow References

| When working on… | Read |
| --- | --- |
| Setup, config, and language precedence | [Setup skill](skills/aif/SKILL.md), [config reference](docs/config-reference.md) |
| Workflow routing and skill options | [Workflow](docs/workflow.md), [skills](docs/skills.md) |
| Research bundle structure, coherence, and promotion | [Research](docs/research.md), [exploration skill](skills/aif-explore/SKILL.md) |
| Fast/full/ultra plans, discovery, and plan IDs | [Plan files](docs/plan-files.md), [planning skill](skills/aif-plan/SKILL.md), [implementation discovery](skills/aif-implement/references/IMPLEMENT-DISCOVERY.md) |
| Read-only planning advisors | [Plan overview](skills/aif-plan-overview/SKILL.md), [roadmap next](skills/aif-roadmap-next/SKILL.md) |
| Workflow questions and native tool availability | [Questions Across Runtimes](docs/skills.md#questions-across-runtimes), [skill-generator guidance](skills/aif-skill-generator/references/BEST-PRACTICES.md) |
| Loop state, stop precedence, and dispatch resume | [Loop](docs/loop.md), [Phase Dispatch and Resume](docs/loop.md#phase-dispatch-and-resume) |
| Review evidence, API compatibility, and optional coupling | [PR source](skills/aif-review/references/PR-SOURCE.md), [API compatibility](skills/aif-review/references/API-COMPATIBILITY.md), [review coupling](skills/aif-review/references/COUPLING-REVIEW.md), [plan coupling](skills/aif-plan/references/COUPLING-PLAN.md) |
| Deferred commits and receipt recovery | [Implementation commits](skills/aif-implement/references/IMPLEMENT-COMMITS.md) |
| QA planning, execution modes, and blocked cases | [QA](skills/aif-qa/SKILL.md), [QA check](skills/aif-qa-check/SKILL.md) |
| Build-tool generation and JVM stack detection | [Build automation](skills/aif-build-automation/SKILL.md) |
| Native quality setup and staging/EOL validation | [Quality setup](skills/aif-quality-setup/SKILL.md), [quality setup reference](docs/skills.md) |

Planning advisors are read-only. Plan overview follows implementation discovery and reads only linked ultra phase summaries. Roadmap next estimates mode-sized scope and leaves writes to the selected planning invocation. Setup preserves its user-owned mode/capacity settings. Keep advisor output and any command catalog results as declarations, without authorizing execution.

Regular exploration writes research only on user selection. Ultra requires explicit mode or config. Include C4, ADR, or dependency artifacts only with evidence, promote material conclusions to the Active Summary, and run the bundle/coherence checks before appending a session. Source-linked hypotheses track revisions and supplied observations without authorizing experiments. Plan and fix consumers treat embedded `Research Context` as committed input and the exact source as a drift check. Ultra implementation reads the active phase and records progress only in `index.md`.

For interactive skills, embed the portable question contract, including clarification paths. Apply it before routing in the skill generator, including URL-based Learn Mode. Tool examples do not prove availability. Preserve workflow-specific confirmations, including loop setup/cleanup and supervised QA. Use the plain-text fallback when needed, and surface unresolved required decisions to the caller in delegated runs. `aif-best-practices` is a non-interactive reference.

For PR review, pin base/head/merge-base and diff hash. Load context from the pinned tree, record unavailable sources, and bind `+check` to that evidence package. API compatibility and `+coupling` are opt-in or conditional per their references. They preserve the existing review severity, evidence, validation and tool boundaries. Coupling PR dependency collection is same-repository and bounded at pinned revisions. External consumers require separate authorization. `npm run test:coupling` covers offline cases and packaging.

For deferred classic commits with `Docs: yes`, reserve and validate the docs group first. Invoke `/aif-commit` once for each selected classic group, with the saved range, message, and task ownership. Persist the change manifest and pre-commit `HEAD` before dispatch, then the verified commit hash. Reconcile against the saved receipt on resume. Validate docs-only no-op outcomes against both the task outcome and live owned changes.

## CLI and Installation Contracts

Read the [CLI and installation contracts](docs/architecture.md#cli-and-installation-contracts) before changing command discovery, Swarm, phase dispatch, completion hooks, worktree checks, instruction records, skill paths and migration, extension permissions, or bundled agent files.

## Common Changes

### Adding or changing a skill

- Create `skills/aif-<name>/SKILL.md`. Built-in discovery needs no TypeScript registry change unless UI hints or runtime-specific behavior require one. Follow neighboring frontmatter and choose invocation policy according to the skill's purpose.
- Keep the entrypoint focused on purpose, triggers, context, workflow, and ownership. Use `references/` for conditional detail, `examples/` for reusable examples, and `scripts/` for repeatable processing. If source material includes code, adapt examples across its major code-facing areas.
- For config-aware skills, read `config.yaml` first and document the exact keys. For config-agnostic skills, explain why. Keep human-language settings separate from identifiers. Declare artifact ownership and use the shared result contract for machine-readable gates.
- Use `{{skills_dir}}` or `{{home_skills_dir}}` for runtime paths. Generated user skills belong in the current runtime's skill directory, with lowercase hyphenated names, unless the command supports and receives a custom path.
- Update user docs according to the table below. Update this guide when workflow logic or project rules change. Rebuild, run `npm test`, and exercise `ai-factory update` in a disposable project for workflow changes.

### Adding an agent or changing prompts

- Register the runtime in `src/core/agents.ts` with its directories and settings path. Extend `src/core/mcp.ts` only when its MCP format differs. Let the template renderer substitute runtime paths. Add the agent to `package.json` keywords and update the agent docs below, including config IDs and runtime MCP support as applicable.
- Build and run `ai-factory init` in a disposable project with the new runtime. Check installed skills and native MCP settings where supported.
- Edit interactive prompts in `src/cli/wizard/prompts.ts` and corresponding types in `src/core/config.ts` when needed. Rebuild after changing TypeScript.

## Development Commands

- `npm run build` compiles TypeScript. Run it after changing `src/` and before tests that import compiled modules from `dist/`.
- `npm test` runs `scripts/test-skills.sh`. It checks skill validation, negative cases, repository integrity, and bundled regression suites. Run it after changing bundled skills. The root guide must fit within 32,768 bytes so Codex can load it at its default project instruction limit.
- `npm run test:review-check` also runs recorded review protocol scenarios on their own. They use recorded source/reviewer/validator responses. See [review test maintenance](skills/aif-review/tests/README.md).
- `npm run test:quality-setup` covers offline quality setup. `npm run test:quality-setup:native -- --run` is opt-in, tests native staging/EOL with pinned tools in disposable repositories, and is outside `npm test`. It does not establish model behavior or coverage for untested platforms.
- `npm link` is available for local CLI testing. Run install, update, or v1 upgrade smoke checks in a disposable project when touching those paths. For workflow changes, verify applicable interactive setup, fast/full/ultra plan discovery and branch/worktree behavior, implementation execution, and DESCRIPTION loading.

## Documentation

See [Architecture](docs/architecture.md) for the repository layout, module boundaries, and CLI contracts.

Keep `README.md` as the landing page: logo, tagline, rationale, installation, quick start, workflow example, documentation links, external links, and license. Put detailed, self-contained guidance in `docs/`, one topic per page. Link to canonical explanations. The install command may appear in README and Getting Started. Use relative links and follow the README documentation order for prev/back/next navigation. End each guide with “See Also” and two or three related links. Getting Started can use simpler first-page navigation and ends with “Next Steps.”

### When to Update What

| Change | Update |
| --- | --- |
| New skill | `docs/skills.md`, `docs/workflow.md` if workflow-related, README if the documented count changes |
| New agent | `docs/getting-started.md` (agent table), `docs/configuration.md` (config ID and MCP support as applicable), README (support list and links) |
| Workflow logic | `docs/workflow.md` and `docs/skills.md` |
| Research artifact format | `docs/research.md`, `docs/plan-files.md`, `docs/workflow.md`, `docs/skills.md` |
| Subagent or runtime-local agent files | `docs/subagents.md`, `docs/configuration.md`, README if navigation text changes |
| Skill evolution or patch learning | `docs/evolve.md`, `docs/plan-files.md` if patch lifecycle or skill-context flow changes |
| Extension lifecycle or runtime extensions | `docs/extensions.md` and `docs/configuration.md` |
| New config option | `docs/configuration.md` and `docs/config-reference.md` |
| Security scanning | `docs/security.md` |
| Plan file format | `docs/plan-files.md` |
| New CLI command | `docs/getting-started.md` (CLI Commands) |
| Repository layout or module boundaries | `docs/architecture.md` |
| Documentation conventions | `skills/aif-docs/SKILL.md` (principles and templates) |
