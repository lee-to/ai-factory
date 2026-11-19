[← Instruction Manifests](instruction-manifests.md) · [Back to README](../README.md)

# AI Factory Architecture

AI Factory is a modular monolith. The CLI, skill installation, format transformation, and MCP configuration ship together in one npm package and share a release version. Within the package, commands, core logic, and shared utilities live in separate modules.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `src/cli/` | Command registration, option parsing, interactive prompts, and handlers |
| `src/core/` | Skill installation, the agent registry, MCP configuration, extensions, and workflow execution |
| `src/utils/` | Shared utilities independent of the CLI and individual runtimes |
| `skills/` | Bundled skill sources, references, examples, and helper scripts |
| `subagents/`, `mcp/` | Bundled agent files and MCP templates |
| `scripts/` | Repository, skill, and execution scenario checks |
| `docs/`, `README.md` | Topic guides and the project landing page |
| `bin/`, `dist/` | CLI launchers and compiled files |

## Module Boundaries

Dependencies flow from `src/cli` to `src/core` to `src/utils`. The CLI can also use shared utilities directly. Keep dependencies flowing toward the lower layers, and keep utilities framework-agnostic with as few dependencies as possible.

CLI handlers collect input and delegate work to core modules through explicit interfaces. Installation and MCP orchestration live in `src/core`. The transformer registry selects adapters that isolate runtime-specific behavior. Transformers depend on transformation contracts, and extensions plug in through dedicated interfaces.

`skills/` is the canonical source for bundled skills. The installer copies and transforms them for the selected runtime. Runtime code reads and copies content from `skills/`, `docs/`, and `mcp/`. Keep these assets independent of runtime modules. The build generates `dist/`. Never edit it by hand or import it from `src/`.

## Entry Points

| Task | Files |
| --- | --- |
| Command registration and prompts | `src/cli/index.ts`, `src/cli/commands/{init,update,upgrade}.ts`, `src/cli/wizard/prompts.ts` |
| Installation and physical paths | `src/core/installer.ts`, `src/core/agents.ts`, `src/core/skill-targets.ts`, `src/core/skill-symlinks.ts`, `src/core/skills-migration.ts` |
| Skill transformation and MCP | `src/core/template.ts`, `src/core/transformer.ts`, `src/core/transformers/`, `src/core/mcp.ts` |
| Extension composition | `src/core/extensions.ts`, `src/core/injections.ts`, `src/core/tool-permissions.ts` |
| Diagnostics | `src/core/command-catalog.ts`, `src/core/worktree-readiness.ts`, `src/core/completion-hook.ts` |
| Workflow execution | `src/core/dispatch.ts`, `src/core/dispatch-registry.ts`, `src/core/swarm/` |
| Instruction records | `src/core/instruction-manifest.ts`, `src/core/instruction-inventory.ts`, `schemas/instruction-manifest.schema.json` |
| Skills and checks | `skills/aif-*/SKILL.md`, `scripts/test-skills.sh`, `package.json` |

## CLI and Installation Contracts

| When changing | Read |
| --- | --- |
| Command discovery | [Project Command Catalog](configuration.md#project-command-catalog) |
| Swarm and Handoff integration | [Swarm Runtime](configuration.md#swarm-runtime) |
| External phase dispatch | [Cross-Agent Dispatch](configuration.md#cross-agent-dispatch), [Phase Dispatch and Resume](loop.md#phase-dispatch-and-resume) |
| Completion adapter and its evidence | [Project Completion Hook](configuration.md#project-completion-hook) |
| Worktree resource checks | [Worktree Readiness Diagnostic](configuration.md#worktree-readiness-diagnostic) |
| Recording and restoring instructions | [Instruction Composition Manifests](instruction-manifests.md) |
| Skill paths, shared directories, and migration | [Codex skill directories and migration](configuration.md#codex-skill-directories-and-migration), [Antigravity migration](configuration.md#antigravity-directory-layout-and-migration) |
| Extension permissions, files, and composition | [Extensions](extensions.md), [installation metadata](configuration.md) |
| Bundled agent files | [Subagents](subagents.md) |

- **Command catalog and worktrees.** The catalog reads declarations within configured bounds and records source hashes and directory identities. It leaves ambiguous inputs unresolved and avoids loading extension commands, including when serving help. The worktree diagnostic compares bounded static evidence and leaves isolation unverified. Its scope is read-only and excludes starting environments or modifying resource mappings. Shared resource use requires authorization beyond worktree creation.
- **Swarm.** Users explicitly opt in. The runtime owns state and Git resources under `aif/swarm/*`, while the user owns `.ai-factory/swarm.yaml`. SQLite and PostgreSQL share the same bounded scheduling logic. Handoff uses the API and events. Intermediate integration requires passing checks. Parent tasks wait for their children, and final completion requires independent verification and owner review. Worktrees share the host environment. Preserve uncertainty in resource accounting.
- **Dispatch.** User configuration lives in `.ai-factory.json`. Commands use argv templates and pass the prompt as a single argument. Loop routes from the versioned result and disregards child process output when routing. When resuming a manual phase handoff, continue with the pending handoff without redispatching it. Clear the handoff state once the result is accepted. See the references above for timeouts, silent no-ops, and fallback behavior.
- **Completion hook.** The adapter writes only the local project record it owns or bounded attempt and result records. It records the specification, executable, inputs, working directory, and source revision. Local records can establish observed execution and freshness. Authenticity and a runtime's ability to enforce a stop on failure require separate evidence.
- **Instruction records.** Create records only on explicit request. Resource declarations and caller-supplied load evidence establish only the visibility they describe. Mark incomplete runs explicitly. Budget accounting preserves the full instruction text. Only the `instructions` command owns run records and snapshots.
- **Shared skills.** With `init --symlinks`, share directories only for byte-identical skills with verified provenance. Preserve native paths, render profiles, and `useSymlinks` and `skillSymlinks` metadata. Materialize recorded links before the locked mutation and restore them after success. Preserve untracked links and shared directories with unverified provenance. `init --no-symlinks` restores copies.
- **Installation and Devin Desktop.** Selecting `aif` adds the managed `aif-skill-generator` dependency for scanning and cleaning up blocked skills. Update restores the dependency in older installations where it is missing. Other skills remain independent. Devin Desktop uses the `windsurf` runtime ID and `.devin/skills/` for new installations. Legacy and custom paths keep the saved Windsurf render profile. Cleanup supports both `.devin/skills` and `.windsurf/skills`.
- **Tool permissions.** Build `toolPermissions` only from declarations for the specific skill and runtime. Claude Code currently has the native adapter. Warn and skip requests for other runtimes. Preserve request ownership in records and during migration. Permission grants must come from declarations and stay within their requested scope. Bind original permissions to the applied skill source and native declaration. When removing a replacement or changing defaults, read the current source field and recompose the remaining requests so every grant has an owner.
- **Loop agents.** Bundled `loop-*` files require `aif-loop` to be selected in Claude Code and Codex. When the skill is absent, skip these files and remove previously managed loop files and records during init and update, including forced runs. Preserve user files and extension-owned helpers. Other agent files are independent of skill selection. Filter at installation time and retain all files in the inventory. The current Codex bundle contains zero loop roles. Smoke tests use isolated Markdown and TOML fixtures.

## See Also

- [Development Workflow](workflow.md) covers workflow stages, artifact ownership, and checks.
- [Configuration](configuration.md) covers user configuration, project layout, and CLI options.
- [Extensions](extensions.md) covers extension formats, permissions, and lifecycle.
