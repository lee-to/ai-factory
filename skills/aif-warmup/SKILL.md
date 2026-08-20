---
name: aif-warmup
description: Load the essential AI Factory project context before work begins. Reads configured DESCRIPTION, ARCHITECTURE, ROADMAP, RESEARCH, RULES, and applicable AGENTS.md files, then returns a compact session handoff suitable for continuing or forking. Use at the start of a new session or after context loss.
allowed-tools: Read Glob Grep
disable-model-invocation: true
---

# Warm Up the Session

Load project context without changing the repository. Finish with a compact,
self-contained handoff that can start the next task or a forked session.

## Step 0: Resolve Context Paths

Use the nearest ancestor containing `.ai-factory/` as the project root; otherwise
use the current working directory. Read `.ai-factory/config.yaml` from that root
first when it exists. Resolve:

- `paths.description` (default `.ai-factory/DESCRIPTION.md`)
- `paths.architecture` (default `.ai-factory/ARCHITECTURE.md`)
- `paths.roadmap` (default `.ai-factory/ROADMAP.md`)
- `paths.research` (default `.ai-factory/RESEARCH.md`)
- `paths.rules_file` (default `.ai-factory/RULES.md`)
- `paths.rules` (default `.ai-factory/rules/`)
- `rules.base` (default `.ai-factory/rules/base.md`)
- every named `rules.<area>` entry
- `warmup.paths` (default `[]`)
- `language.ui` (default `en`)

Also retain these configured preferences for the handoff because they affect
later workflow commands, even though warmup does not act on them:

- `language.artifacts` and `language.technical_terms`
- `git.enabled`, `git.base_branch`, `git.create_branches`,
  `git.branch_prefix`, and `git.skip_push_after_commit`
- `workflow.plan_id_format` and `workflow.verify_mode`

Resolve relative artifact and rule paths from the project root; keep absolute
paths absolute. If config is missing or a required value is missing or empty,
use its documented default. If config cannot be parsed confidently, report that
and use defaults; do not modify it or invent semantics for unknown keys.

All user-facing output MUST use `language.ui`.

## Step 1: Read Applicable Instructions

Read, when present:

- the repository-root `AGENTS.md`
- each `AGENTS.md` between the repository root and current working directory,
  from broadest to most specific
- `.ai-factory/skill-context/aif-warmup/SKILL.md`

Nested `AGENTS.md` files outside the current working-directory chain are scoped
to future work in those directories. Do not load all of them during warmup.
More specific `AGENTS.md` instructions override broader ones. The warmup
skill-context file overrides this general skill when they conflict.

## Step 2: Read Core Artifacts

Read every resolved file that exists, in this order:

1. DESCRIPTION
2. ARCHITECTURE
3. ROADMAP
4. RESEARCH
5. RULES: load from broadest to most specific: the top-level rules file,
   `rules.base`, then every named `rules.<area>` entry. Later, more specific
   rules override earlier ones:
   `rules.<area>` > `rules.base` > `paths.rules_file`. Keep every area rule
   tied to its configured area; never present it as a global rule.

Missing artifacts are normal. Record them as missing and continue.

For ultra research, derive `research_bundles_dir` as
`<parent(paths.research)>/research/`. Read marked direct-child `INDEX.md` files
only when they contain `<!-- aif:research-mode:ultra -->` exactly once. For
bundles with `Status: active`, load the linked `RESEARCH.md` Active Summary and
open questions. Do not load C4, ADR, dependency, or session-history details
until a concrete task needs them.

Do not scan application code, plans, git history, external sources, or unrelated
artifacts during warmup. The next task can load those on demand.

### Additional Warmup Paths

Process `warmup.paths` in configured order after the core artifacts. Each entry
may point to a file or directory:

- Require a sequence of non-empty strings. Report and ignore invalid entries;
  treat entries as literal paths, not glob patterns.
- Resolve entries from the project root and require the resolved path to remain
  inside it. Report and skip absolute paths and `..` escapes.
- Read a file once when it is readable text, even if another entry or core
  artifact resolves to the same file.
- For a directory, recursively read text files in lexical path order.
- Do not follow symlinks. Skip binary files and VCS, dependency, build, cache,
  and coverage directories unless such a directory is itself the explicit entry.
- Never load likely secrets, credentials, tokens, or private keys from an extra
  path. Report the skipped path; an explicitly listed `.env.example` may be read.
- If an entry is missing, unreadable, or too large to load without crowding out
  the handoff, report it. For a large directory, inventory it, prioritize its
  root `README*` and `INDEX*` files, and list what was not loaded instead of
  silently truncating.

An absent or empty `warmup.paths` means no additional scan.

## Step 3: Produce the Handoff

Return a concise summary with these sections:

- **Configuration** — resolved custom paths and configured language, git, and
  workflow preferences that can affect the next command, including
  `warmup.paths`
- **Project** — purpose, stack, and current state
- **Architecture** — important boundaries and entry points
- **Direction** — active roadmap priorities and research conclusions
- **Rules** — non-negotiable instructions and conventions
- **Gaps** — missing artifacts, contradictions, or open research questions
- **Loaded** — exact paths read
- **Ready** — state that context is loaded and the session can continue or be forked

Prefer facts that will affect later decisions. Do not reproduce whole artifacts.
When two sources conflict, name both sources and the conflict instead of silently
choosing one.

## Artifact Ownership

- Primary ownership: none.
- All project files and AI Factory artifacts are read-only.

## Boundaries

- Read-only: never create or modify files, code, branches, plans, or config.
- Do not start implementation in the same invocation.
- Do not ask setup questions unless the project root itself cannot be identified.
- Stop after the handoff so it remains a clean session fork point.
