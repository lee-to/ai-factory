---
name: aif-plan
description: Plan a feature or task in fast, full, or ultra mode. Ultra creates an indexed multi-file bundle with deeply specified phases for execution by a smaller model. Use for "plan", "new feature", "start feature", "create tasks", or exhaustive implementation planning.
argument-hint: "[fast | full | ultra] [--parallel | --list | --cleanup <branch>] <description>"
allowed-tools: Read Write Glob Grep Bash(git *) Bash(cd *) Bash(cp *) Bash(mkdir *) Bash(basename *) Bash(shasum -a 256 *) Bash(sha256sum *) TaskCreate TaskUpdate TaskList AskUserQuestion Questions Task mcp__handoff__handoff_sync_status mcp__handoff__handoff_push_plan mcp__handoff__handoff_get_task mcp__handoff__handoff_list_tasks mcp__handoff__handoff_update_task
disable-model-invocation: false
version: 1.0.0
---

# Plan - Implementation Planning

Create an implementation plan for a feature or task. Three modes:

- **Fast** – quick plan, no git branch, saves to the configured fast plan path (default: `.ai-factory/PLAN.md`)
- **Full** — richer plan, asks preferences, saves to the configured full-plan directory, and optionally creates a git branch/worktree when git is enabled and branch creation is allowed
- **Ultra** — exhaustive multi-file plan bundle under the configured full-plan directory: `index.md` is the manifest/progress ledger and every implementation phase is a separate, deeply specified markdown file. Use it when planning with a stronger model for later execution by a smaller model.

For ultra layout, detail requirements, integrity checks, and consumer behavior,
read `references/ULTRA-FORMAT.md` before creating or modifying the bundle.

## Workflow

### Step 0 (pre): Detect Handoff Mode

Determine Handoff mode, task ID, and branch contract. Resolve each value independently so legacy callers that pass only `HANDOFF_MODE` and `HANDOFF_TASK_ID` still enter Handoff mode correctly:

- `HANDOFF_MODE`: explicit prompt value if present; otherwise environment value; otherwise empty string.
- `HANDOFF_TASK_ID`: explicit prompt value if present; otherwise environment value; otherwise empty string.
- `HANDOFF_BRANCH_PREPARED`: explicit prompt value if present; otherwise environment value; otherwise `0`.
- `HANDOFF_BRANCH_NAME`: explicit prompt value if present; otherwise environment value; otherwise empty string.

Use the Bash tool only for values that were not passed explicitly in the prompt:

```
Bash: printenv HANDOFF_MODE || true
Bash: printenv HANDOFF_TASK_ID || true
Bash: printenv HANDOFF_BRANCH_PREPARED || true
Bash: printenv HANDOFF_BRANCH_NAME || true
```

**Then check `HANDOFF_MODE`:**

#### When `HANDOFF_MODE` is `1` (autonomous Handoff agent)

The Handoff coordinator already manages status transitions and DB writes directly. Do NOT call MCP tools (`handoff_sync_status`, `handoff_push_plan`). Instead:

- **No interactive questions:** Do not use `AskUserQuestion` — use sensible defaults (verbose logging, yes to tests, yes to docs, skip roadmap linkage).
- **Mode default:** If mode is not specified, default to `fast`.
- **Plan annotation (MANDATORY):** If `HANDOFF_TASK_ID` is non-empty, you MUST insert `<!-- handoff:task:<HANDOFF_TASK_ID> -->` as the very first line of the plan entrypoint (`index.md` for ultra; the plan file otherwise), before the title. This annotation links the plan to its Handoff task for bidirectional sync. **Omitting this annotation when HANDOFF_TASK_ID is set is a bug — verify before completing.**

##### Branch ownership under Handoff (CRITICAL)

Handoff owns branch creation at the agent-code level. The skill must NOT create or switch branches when Handoff has prepared one. Apply these rules:

**If `HANDOFF_BRANCH_PREPARED` is `1`:**

- Do **NOT** execute `git checkout`, `git pull`, or `git checkout -b`.
- Treat `--parallel` as disabled for all downstream behavior.
- Do **NOT** create a worktree.
- Read `HANDOFF_BRANCH_NAME` from the prompt / env.
- Validate strict equality:
  ```
  Bash: git rev-parse --abbrev-ref HEAD
  ```
  The output must equal `HANDOFF_BRANCH_NAME` exactly. Do **not** accept partial matches, prefix matches, or "branch contains `/`" heuristics.
- If the current branch does **not** match `HANDOFF_BRANCH_NAME`, STOP. Report a blocker in the plan summary:
  > `Branch drift: expected <HANDOFF_BRANCH_NAME>, actual <current>.`
  Do **NOT** "fix" drift by switching or creating a branch — Handoff classifies that as `BranchIsolationError` / `blocked_external`.
- Use `HANDOFF_BRANCH_NAME` (with `/` replaced by `-`) as the full/ultra plan identifier stem. Full writes `<configured plans dir>/<stem>.md`; ultra writes `<configured plans dir>/<stem>/index.md`. Skip the slug derivation in Step 1.2.

**If `HANDOFF_MODE` is `1` but `HANDOFF_BRANCH_PREPARED` is unset or `0`:**

- Fallback path for older Handoff clients that have not adopted the prepared-branch contract.
- Execute Step 1.4 branch creation normally per `git.create_branches` config.

#### When `HANDOFF_MODE` is NOT `1` (manual Claude Code session)

If polishing an existing plan, extract the Handoff task ID from the `<!-- handoff:task:<id> -->` annotation on the first line of the plan entrypoint (if present). If creating a new plan and no annotation context exists, skip all MCP sync — there is no linked Handoff task.

If a task ID IS found in the plan annotation, sync with Handoff via MCP tools:

- **On start:** Call `handoff_sync_status` with `{ taskId: <extracted-id>, newStatus: "planning", sourceTimestamp: "<current UTC time in ISO 8601 format>", direction: "aif_to_handoff", paused: true }`.
- **On completion:** Call `handoff_push_plan` with `{ taskId: <extracted-id>, planContent: <full plan text> }`. For ultra, serialize the bundle as `index.md` followed by every Phase Index file in order, each prefixed with `<!-- ultra-phase:<relative-path> -->`. Then call `handoff_sync_status` with `{ taskId: <extracted-id>, newStatus: "plan_ready", sourceTimestamp: "<current UTC time in ISO 8601 format>", direction: "aif_to_handoff", paused: true }`.

**CRITICAL:** Always pass `paused: true` with every `handoff_sync_status` call except `done`. This prevents the autonomous Handoff agent from picking up the task while you work manually. Only `done` passes `paused: false`.

Preserve the `<!-- handoff:task:<id> -->` annotation on the first line when rewriting the plan entrypoint.

### Step 0: Load Project Context

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:

- **Paths:** `paths.description`, `paths.architecture`, `paths.roadmap`, `paths.research`, `paths.rules_file`, `paths.plan`, `paths.plans`, `paths.patches`, `paths.evolutions`, `paths.specs`, `paths.rules`, and `paths.archive`
  - Derive `research_bundles_dir = <parent directory of paths.research>/research/` for opt-in ultra research bundles. No additional config key is required.
- **Language:** `language.ui` for AskUserQuestion prompts, `language.artifacts` for generated plan files, and `language.technical_terms` for human-readable technical terminology in plan artifacts
- **Git:** `git.enabled`, `git.base_branch`, `git.create_branches`, and `git.branch_prefix`
- **Workflow:** `workflow.plan_id_format` — controls the full/ultra plan identifier shape. Allowed values: `slug` (default), `timestamp`, `uuid`, `sequential`. Only `slug` and `sequential` are active; `timestamp` and `uuid` are **reserved** and currently behave like `slug` (with an `INFO` log). The `sequential` value writes a full plan as `<NNNN>_<plan_file_stem>.md` and an ultra bundle as `<NNNN>_<plan_file_stem>/index.md` (see Step 1.2 for the canonical stem and algorithm). Treat any unknown value as `slug` and emit `WARN [aif-plan] unknown workflow.plan_id_format=<value>; falling back to slug`.

If config.yaml doesn't exist, use defaults:

- Paths: `.ai-factory/` for all artifacts
- `ui_language`: `en`
- `artifact_language`: `en`
- `technical_terms_policy`: `keep`
- Git: `enabled: true`, `base_branch: main`, `create_branches: true`, `branch_prefix: feature/`
- Workflow: `plan_id_format: slug`

Resolved language values:
- `ui_language = language.ui || "en"`
- `artifact_language = language.artifacts || language.ui || "en"`
- `technical_terms_policy = language.technical_terms || "keep"`

If `technical_terms_policy` is not one of `keep`, `translate`, or `mixed`, treat it as `keep`. Legacy values such as `english` also behave like `keep`.

All AskUserQuestion prompts, progress updates, summaries, and next-step guidance MUST be written in `ui_language`.

Generated plan artifacts under `paths.plan` or `paths.plans` MUST be written in `artifact_language`.
For ultra this applies to `index.md` and every linked phase file.

Templates and examples define structure, not fixed English output. If `artifact_language` is not `en`, translate human-readable headings, labels, task prose, roadmap rationale, research summaries, settings explanations, and dependency notes before saving. Preserve markdown structure, checkbox syntax, task IDs, branch names, commit messages, commands, file paths, config keys, package names, API names, `WARN`/`INFO` labels, raw errors, and the exact ultra marker `<!-- aif:plan-mode:ultra -->` unchanged. Keep `## Research Context`, `Source:`, `Active Summary`, `Updated:`, and `SHA256:` exact because downstream research drift checks parse them as compatibility tokens. Apply `technical_terms_policy` to other human-readable terminology.

Exception: the section heading and body of `## Original Request` are fixed raw-source structure and must not be translated, summarized, normalized, or rewritten.

**THEN:** Read `.ai-factory/DESCRIPTION.md` (use path from config) if it exists to understand:

- Tech stack (language, framework, database, ORM)
- Project architecture
- Coding conventions
- Non-functional requirements

**ALSO:** Read the resolved architecture artifact if it exists (`paths.architecture`, default: `.ai-factory/ARCHITECTURE.md`) to understand:

- Chosen architecture pattern
- Folder structure conventions
- Layer/module boundaries
- Dependency rules

Use this context when:

- Exploring codebase (know what patterns to look for)
- Writing task descriptions (use correct technologies)
- Planning file structure (follow project conventions)
- **Follow architecture guidelines from the resolved architecture artifact when planning file structure and task organization**

**Read `.ai-factory/skill-context/aif-plan/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**

- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including the PLAN.md
  template, ultra bundle, and task format. The templates from TASK-FORMAT.md and
  ULTRA-FORMAT.md are a **base structure**. If a
  skill-context rule says "tasks MUST include X" or "plan MUST have section Y" — you MUST augment
  the template accordingly. Generating a plan that violates skill-context rules is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

**OPTIONAL (recommended):** Read the resolved roadmap artifact if it exists (`paths.roadmap`, default: `.ai-factory/ROADMAP.md`):

- Use it to link this plan to a specific milestone (when applicable)
- This reduces ambiguity in `/aif-implement` milestone completion and `/aif-verify` roadmap gates

**OPTIONAL (recommended):** Resolve at most one relevant research source:

- A legacy source is the configured `paths.research` file.
- An ultra source is `research_bundles_dir/<english-slug>/RESEARCH.md`, but only when the sibling `INDEX.md` contains `<!-- aif:research-mode:ultra -->` exactly once and its `## Artifact Index` links that `RESEARCH.md`. Do not treat arbitrary directories as research bundles.
- When the user supplied a topic or request, source priority is: an explicitly referenced bundle/file; then one clearly topic-matching marked `Status: active` bundle; then the relevant legacy file. An explicit source means a concrete `RESEARCH.md` or bundle path named in the request or follow-up; it is user content, not a stripped command token.
- Resolve a topic match by exact English slug first, then a normalized `Topic:` match, then a unique semantic match against `Purpose` / Active Summary. Never pick by recency. If no single match is clear or multiple sources would change scope, ask instead of merging or guessing. An explicitly referenced `paused` or `superseded` bundle requires a warning before use.
- Read an ultra `INDEX.md` first, then its linked `RESEARCH.md`. Read C4/ADR/dependency artifacts only for rationale needed by this plan. They are not independent requirement sources; material conclusions must already be reflected in the Active Summary.
- Store the chosen file as `selected_research_path`. Treat its `## Active Summary (input for /aif-plan)` as an additional requirements source.
- Carry over constraints/decisions into tasks and plan settings.
- Prefer the summary over raw notes; use `## Sessions` and linked optional artifacts only when you need deeper rationale.
- No-description fallback is the deliberate backward-compatibility exception to the topic-based priority: use the configured `paths.research` Active Summary topic when available. Otherwise use a single active marked ultra bundle; if several active bundles exist, ask the user to choose rather than guessing.
- Track whether research content influenced this plan. Set `research_influenced_plan = true` only when the Active Summary supplies the default description or when constraints, decisions, goals, open questions, or session rationale from the research artifact shape the plan scope, tasks, settings, or tradeoffs. If the research artifact exists but is stale or unrelated to the user's requested task, leave `research_influenced_plan = false`, ignore it for plan requirements, and do not add `## Research Context`.
- If any research content influences the plan, the generated plan MUST include `## Research Context` with canonical ``Source: `<selected_research_path>` (Active Summary, Updated: <timestamp>, SHA256: <digest>)`` metadata. Omitting this plan-owned research copy is a bug because downstream skills treat the embedded Research Context as the plan's authoritative requirements and use the source research file only for drift checks.
- Normalize the copied Active Summary before hashing: include exactly the text that will be pasted under `## Research Context` after the `Source:` line, remove HTML comment blocks, preserve line order and leading whitespace, trim trailing spaces from every line, use LF line endings, and end with exactly one final newline. Calculate the digest without writing any temporary file or repository artifact: feed the normalized text through stdin / inline shell input to `shasum -a 256`; if `shasum` is unavailable, feed the same normalized text to `sha256sum`. Use the first output field as the `SHA256:` value.

### Step 0.1: Resolve Git State

Do **not** auto-run `git init`.

Resolve the current git mode from config first:

- `git.enabled: true` → git-aware workflow is allowed
- `git.enabled: false` → no-git workflow only
- `git.base_branch` → target branch for diffs/merge guidance (default: detected branch or `main`)
- `git.create_branches: true` → full/ultra mode may create a branch/worktree
- `git.create_branches: false` → full/ultra mode still creates its plan artifact, but stays on the current branch / repository state

If `git.enabled = false`:

- Skip all branch/worktree commands
- Save full plans under `paths.plans/<slug>.md` and ultra bundles under `paths.plans/<slug>/index.md`
- Treat `--parallel`, `--list`, and `--cleanup` as unavailable

If `git.enabled = true` but the repository is not actually inside a git work tree:

- Warn the user that git-aware actions are unavailable until the repository is initialized
- Fall back to the same no-git behavior as above

### Step 0.2: Parse Arguments & Select Mode

Extract flags and mode from `$ARGUMENTS`:

```
--parallel  → Enable parallel worktree mode (full/ultra only; requires `git.enabled=true` and `git.create_branches=true`)
--list      → Show all active worktrees, then STOP (git-only)
--cleanup <branch> → Remove worktree and optionally delete branch, then STOP (git-only)
fast        → Fast mode (first word)
full        → Full mode (first word)
ultra       → Ultra mode (first word)
```

**Parsing rules:**

- Strip only recognized command tokens in command positions from `$ARGUMENTS`:
  - `fast`, `full`, or `ultra` only when used as the leading mode token
  - recognized control flags `--parallel`, `--list`, and `--cleanup <branch>`
  - do not remove matching words inside the user's actual request text
- Remaining text becomes the description
- Preserve the remaining text as `original_user_request` when it is non-empty: trim only outer whitespace introduced by command parsing, but keep internal whitespace, line breaks, wording, casing, and punctuation exactly. This is the user's original planning request and MUST be saved into the plan entrypoint later.
- `--list` and `--cleanup` execute immediately and **STOP** (do NOT continue to Step 1+)
- If `git.enabled = false`, reject `--parallel`, `--list`, and `--cleanup` with a short explanation instead of trying git commands
- If `--parallel` is set while `git.create_branches = false`, reject it with a short explanation because parallel mode requires branch creation

**If the description is empty:**

- If the configured `paths.research` file exists and its Active Summary has a non-empty `Topic:`, default the description to that topic (no extra user input required), set it as `selected_research_path`, and leave `original_user_request` empty.
- Otherwise, if exactly one marked active ultra bundle exists and its linked `RESEARCH.md` has a non-empty `Topic:`, use that topic and file. If multiple marked active bundles exist, ask the user to select a topic/source.
- Plans created from a selected `RESEARCH.md` without an explicit user request MUST NOT include an `Original Request` section.
- Otherwise, ask the user for a short feature description. Preserve the user's answer verbatim as `original_user_request` and save it into the plan entrypoint later.

**Original request contract:**

- If the user explicitly supplied a planning request (for example `/aif-plan ТУТ ЗАПРОС НА ПЛАН`, `/aif-plan full ТУТ ЗАПРОС НА ПЛАН`, `/aif-plan ultra ТУТ ЗАПРОС НА ПЛАН`, or an answer to the description prompt), the generated plan entrypoint MUST include `## Original Request`.
- `## Original Request` contains the exact user-provided request text after only recognized command tokens are removed and only outer whitespace is trimmed. Do not rewrite, summarize, translate, or normalize its wording, even when `artifact_language` differs.
- If the description was derived only from a selected `RESEARCH.md` because the user did not provide a request, omit `## Original Request`; the committed source is `## Research Context` instead.
- If the user supplied a request and selected research also influenced the plan, include both `## Original Request` and `## Research Context`.

**If `--list` is present**, jump to [--list Subcommand](#--list-subcommand).
**If `--cleanup` is present**, jump to [--cleanup Subcommand](#--cleanup-subcommand).

**Mode selection:**

- `fast` keyword → fast mode
- `full` keyword → full mode
- `ultra` keyword → ultra mode
- Neither → preserve the pre-ultra interactive contract and ask only between
  full and fast. Ultra is strictly opt-in and is selected only by the explicit
  leading `ultra` mode token:

```
AskUserQuestion: Which planning mode?

Options:
1. Full (Recommended) — richer plan, asks preferences, optional branch/worktree flow when git settings allow it
2. Fast – quick plan, no branch, saves to the resolved fast plan path
```

If the user did not provide a description and a research source was selected:

- Mention that you will default the description to the `Active Summary` topic
- Only ask for `full` vs `fast` (no description prompt needed)
- Do not mention, recommend, or auto-select ultra unless the caller used the
  explicit leading `ultra` token

For concrete parsing examples and expected behavior per command shape, read `references/EXAMPLES.md` (Argument Parsing).

---

## Full and Ultra Modes

### Step 1: Parse Description & Reconnaissance

From the description, extract:

- Core functionality being added
- Key domain terms
- Type (feature, enhancement, fix, refactor)

**Use `Task` tool with `subagent_type: Explore` to understand the relevant parts of the codebase.** This runs as a subagent and keeps the main context clean.

Based on the parsed description, launch 1-2 Explore agents in parallel:

```
Task(subagent_type: Explore, model: sonnet, prompt:
  "In [project root], find files and modules related to [feature domain keywords].
   Report: key directories, relevant files, existing patterns, integration points.
   Thoroughness: quick. Be concise — return a structured summary, not file contents.")
```

**Rules:**

- Full: 1-2 agents max, "quick" thoroughness — this is reconnaissance, not deep analysis
- Ultra: 2-3 focused agents when available; cover architecture, existing patterns, integration/side effects, and test/operations surfaces. This reconnaissance feeds the deeper evidence required by `ULTRA-FORMAT.md`.
- Deep exploration happens later in Step 3
- If `.ai-factory/DESCRIPTION.md` already provides sufficient context, this step can be skipped

### Step 1.2: Generate Full/Ultra Plan Identifier

This step produces two distinct values:

- `branch_name` — the git branch (only when `git.enabled = true` and `git.create_branches = true`)
- `plan_file_stem` — the canonical unprefixed plan stem under `<configured plans dir>/`
- `plan_identifier` — `plan_file_stem` with an optional `NNNN_` prefix; it becomes the full-plan filename stem or ultra directory name

These are derived in a fixed order so the producer here and the branch-based consumers in `/aif-implement` / `/aif-improve` / `/aif-verify` / `/aif-rules-check` always agree on either the full-plan file or ultra entrypoint.

#### 1.2.a — Resolve the canonical `plan_file_stem`

Pick the first matching case:

1. **`HANDOFF_BRANCH_PREPARED = 1`** → `plan_file_stem = HANDOFF_BRANCH_NAME` with every `/` replaced by `-`. Skip slug generation entirely. No `branch_name` is created here (Handoff already owns the branch).
2. **`git.enabled = true` AND `git.create_branches = true`** → generate a description slug, then `branch_name = <git.branch_prefix><slug>` (default prefix: `feature/`). Set `plan_file_stem = branch_name` with every `/` replaced by `-` (for example `feature-user-authentication`).
3. **Otherwise** (`git.enabled = false` OR `git.create_branches = false`) → `plan_file_stem = <description slug>`. No `branch_name` is created.

Slug rules (cases 2 and 3):

- Lowercase, hyphen-separated, max 50 characters
- No special characters except hyphens
- Descriptive but concise

Branch examples (case 2):

- `feature/user-authentication`
- `fix/cart-total-calculation`
- `refactor/api-error-handling`
- `chore/upgrade-dependencies`

**Invariant:** branch-based consumer skills compute their lookup stem as `current-branch-with-slashes-replaced`. Cases 1 and 2 above already match that. Case 3 never has a branch, so consumers fall back to the lone full/ultra plan artifact in `<configured plans dir>/` (see `aif-implement` Step 0.2). Producing a `plan_file_stem` outside these rules breaks discovery.

#### 1.2.b — Apply the `workflow.plan_id_format` prefix

Default: no prefix. Set `plan_identifier = plan_file_stem`. Full writes
`<configured plans dir>/<plan_identifier>.md`; ultra writes
`<configured plans dir>/<plan_identifier>/index.md`.

Format-specific handling:

- `slug` (default) → no prefix.
- `timestamp` / `uuid` → **reserved values; treat as `slug` for now.** Emit `INFO [aif-plan] workflow.plan_id_format=<value> is reserved and behaves like slug; numbering is not applied`. Do NOT invent a stem shape — branch-based consumers do not know how to discover non-`sequential` prefixes.
- Unknown values → already handled in Step 0: emit `WARN [aif-plan] unknown workflow.plan_id_format=<value>; falling back to slug`. Behaves like `slug` here.
- `sequential` → apply the algorithm in 1.2.c to `plan_file_stem` to produce
  `plan_identifier`.

Sequential is **force-disabled** when `HANDOFF_BRANCH_PREPARED = 1`. In that case keep the bare `plan_file_stem` and emit `INFO [aif-plan] sequential numbering disabled under HANDOFF_BRANCH_PREPARED=1`.

#### 1.2.c — Sequential numbering algorithm

Prepend a 4-digit numeric prefix to `plan_file_stem` to produce
`plan_identifier`. Compute the prefix from existing numbered full-plan files and
numbered directories whose `index.md` contains the exact ultra marker in
`<configured plans dir>`. The branch name (when one exists) stays unchanged so
existing git tooling, CI, and PR conventions are unaffected.

```
1. Find existing numbered plans in <configured plans dir>:
     Glob A: <configured plans dir>/[0-9][0-9][0-9][0-9]_*.md
     Glob B: <configured plans dir>/[0-9][0-9][0-9][0-9]_*/index.md
2. Every Glob A match is a numbered full-plan candidate.
   For every Glob B match, Read index.md and keep it only when it contains the
   exact marker <!-- aif:plan-mode:ultra -->. Ignore numbered directories whose
   index.md lacks the marker; they are not plans and cannot consume an ID.
3. Parse the leading 4 digits from each retained full-plan filename or marked
   ultra directory
   basename into an integer. Deduplicate equal prefixes.
   Filter out entries whose relevant basename does not match
   ^[0-9]{4}_.+(\.md)?$.
4. If any matches exist:
     max_existing = max(prefixes)
     If max_existing >= 9999:
       ABORT with error:
         "sequential cap reached: a plan numbered 9999 already exists in <configured plans dir>."
         "Switch workflow.plan_id_format back to slug, or move the 9999-numbered file out of the directory (note: doing so will free 9999 for the next plan to reuse)."
     next = max_existing + 1
   Else:
     next = 1
5. prefix = zero-padded 4-digit string of next   (e.g. 1 → "0001", 42 → "0042")
6. Set plan_identifier = <prefix>_<plan_file_stem>
7. Final artifact:
     full  → <configured plans dir>/<plan_identifier>.md
     ultra → <configured plans dir>/<plan_identifier>/index.md
```

Implementation notes:

- **Use `Glob` to enumerate candidates and `Read` to validate every numbered
  ultra candidate's marker.** Do NOT shell out to `ls` — `aif-plan`'s
  frontmatter does not grant `Bash(ls *)`, so the `ls` path would fail in production.
- The 4-digit `[0-9][0-9][0-9][0-9]` glob is **strict by contract**: the format supports `0001`..`9999` only. The error in step 4 enforces this.
- **`--parallel` scope (TL;DR — source-worktree scoped):**
  - **Where the prefix is computed:** the source worktree's `<configured plans dir>`
    (the repo where `/aif-plan` was invoked) — i.e. exactly here, in Step 1.2.c.
  - **When it is computed:** **before** the optional `cd <WORKTREE>` in Step 1.4.
  - **Where the plan artifact is written:** the same relative full file or ultra
    directory path inside the target worktree, so the prefix and destination
    directory stay consistent.
  - **What you must NOT do:** never recompute the prefix from the target worktree's
    plans dir after `cd <WORKTREE>`. The target dir is typically empty and would
    re-allocate `0001` on every parallel run, breaking the cross-worktree numbering
    contract on merge.

Rules:

- Numbering is **derived from existing full-plan files and marked ultra directories** in `<configured plans dir>`. Unmarked numbered directories are ignored. Deleting or moving a numbered plan out of the directory can free that number for reuse on the next run — keep plans in place if you rely on stable cross-references.
- **Archived plans are excluded from numbering.** Plans moved to `paths.archive/plans/` by `/aif-archive` are not in `<configured plans dir>` and therefore not counted. Archiving the highest-numbered plan frees that number for reuse.
- Numbering is **bounded** — 9999 is a hard cap; the algorithm errors instead of writing `10000_…` so consumer globs (also 4-digit) cannot drift out of contract.
- The prefix lives only on the full-plan filename or ultra directory. The git branch (when present) stays `<branch_prefix><slug>` without a number.
- This setting is ignored for fast plans (`paths.plan` is a single file) and fix plans (`paths.fix_plan` is a single file).

Logging: `INFO [aif-plan] resolved plan artifact: <path> (mode=<mode>, format=<value>)`.

### Step 1.3: Ask About Preferences

**IMPORTANT: Always ask the user before proceeding:**

```
AskUserQuestion: Before we start, a few questions:

1. Should I write tests for this feature?
   a. Yes, write tests
   b. No, skip tests

2. Logging level for implementation:
   a. Verbose (recommended) - detailed DEBUG logs for development
   b. Standard - INFO level, key events only
   c. Minimal - only WARN/ERROR

3. Documentation policy after implementation?
   a. Yes — mandatory docs checkpoint at completion (recommended)
   b. No — warn-only (`WARN [docs]`), no mandatory checkpoint

4. Roadmap milestone linkage (only if the resolved roadmap artifact exists):
   a. Link this plan to a milestone
   b. Skip — no linkage (allowed; `/aif-verify --strict` should report WARN, not fail, for missing linkage alone)

5. Any specific requirements or constraints?
```

**Default to verbose logging.** AI-generated code benefits greatly from extensive logging because:

- Subtle bugs are common and hard to trace without logs
- Users can always remove logs later
- Missing logs during development wastes debugging time

Store all preferences — they will be used in the plan entrypoint and passed to `/aif-implement`.

Docs policy semantics:

- `Docs: yes` → `/aif-implement` MUST show a mandatory documentation checkpoint and route docs changes through `/aif-docs`
- `Docs: no` (or unset) → `/aif-implement` emits `WARN [docs]` and continues without a mandatory docs checkpoint

**If the resolved roadmap artifact exists and the user chose milestone linkage:**

- Read the resolved roadmap artifact and list candidate milestones (prefer unchecked items)
- Ask the user to pick one milestone (or type a custom one)
- Store the selected milestone name and a 1-sentence rationale for inclusion in the plan entrypoint

### Step 1.4: Optional Branch / Worktree Setup

**If `HANDOFF_BRANCH_PREPARED = 1` (Handoff owns the branch):**

- Skip this entire step. Branch validation already happened in Step 0.
- The plan artifact path uses `HANDOFF_BRANCH_NAME` (slashes replaced by `-`) as the stem.
- Do **NOT** run `git checkout`, `git pull`, `git checkout -b`, or `git worktree add`.
- Treat `--parallel` as disabled: do not create a worktree and do not auto-invoke `/aif-implement`.

**If `git.enabled = false` or `git.create_branches = false`:**

- Skip all branch/worktree creation
- Continue with the generated full file or ultra directory under `paths.plans`

**If `--parallel` flag is set → create worktree:**

> **Sequential prefix is already locked in.** Step 1.2.c computed the `NNNN_`
> prefix from the source worktree's `<configured plans dir>` before this step.
> Do NOT recompute it after `cd <WORKTREE>` — the target worktree's plans dir
> is typically empty and would re-allocate `0001`, breaking the numbering
> contract on merge.

#### Worktree Creation

```bash
DIRNAME=$(basename "$(pwd)")
git branch <branch-name> <configured-base-branch>
git worktree add ../${DIRNAME}-<branch-name-with-hyphens> <branch-name>
```

Convert branch name for directory: replace `/` with `-`.

**Example:**

```
Project dir: my-project
Branch: feature/user-auth
Worktree: ../my-project-feature-user-auth
```

Copy context files so the worktree has full AI context:

- Create the parent directories for the resolved DESCRIPTION, ARCHITECTURE, RESEARCH, plan, patch, and evolution paths inside the worktree.
- Copy the resolved DESCRIPTION, ARCHITECTURE, and RESEARCH artifacts into the same configured relative locations inside the worktree.
- Copy `.ai-factory/skill-context/` as-is into the worktree.
- Copy only the latest 10 patch files from the resolved `paths.patches` directory into the same configured relative path inside the worktree.
- Do **not** copy `patch-cursor.json` when you copied only a truncated patch set; that cursor is valid only with the full patch history.
- Copy agent settings (for example `.claude/`) and untracked `CLAUDE.md` when present.

Create changes directory and switch:

```bash
cd "${WORKTREE}"
```

Display confirmation:

```
Parallel worktree created!

  Branch:    <branch-name>
  Directory: <worktree-path>

To manage worktrees later:
  /aif-plan --list
  /aif-plan --cleanup <branch-name>
```

Continue to Step 2.

**If no `--parallel` → create branch normally:**

```bash
git checkout <configured-base-branch>
git pull origin <configured-base-branch>
git checkout -b <branch-name>
```

If branch already exists, ask user:

- Switch to existing branch?
- Create with different name?

---

## Ultra Mode Detail Contract

Ultra uses the full-mode preferences and optional branch/worktree setup above,
then applies a stricter planning gate:

1. Read `references/ULTRA-FORMAT.md` completely.
2. Resolve all cross-cutting decisions that an implementer would otherwise have
   to infer: file placement, public interfaces, data/control flow, compatibility,
   migrations, failure behavior, observability, tests, docs, and rollout where
   applicable.
3. Partition the work into dependency-ordered phases. A phase must be a coherent
   implementation checkpoint, not merely a category heading.
4. Create one phase markdown file per phase. Every task section must satisfy the
   Required Detail Gate in `ULTRA-FORMAT.md`.
5. Create `index.md` last, after phase contents are stable, so its Phase Index,
   task links, dependencies, and commit groups exactly match the phase files.
6. Run the bundle-integrity checks from `ULTRA-FORMAT.md` before presenting the
   plan. Fix broken links, missing/duplicate task IDs, orphan phase files, and
   inconsistent dependencies.

Ultra must not defer material implementation decisions to the smaller model.
If evidence is insufficient for a safe decision, record a blocking open question
in `index.md` and stop the plan as not implementation-ready instead of hiding the
gap behind vague instructions.

---

## Fast Mode

### Step 1: Ask About Preferences

Ask a shorter set of questions:

```
AskUserQuestion: Before we start:

1. Should I include tests in the plan?
   a. Yes, include tests
   b. No, skip tests

2. Any specific requirements or constraints?

3. Roadmap milestone linkage (only if the resolved roadmap artifact exists):
   a. Link this plan to a milestone
   b. Skip — no linkage (allowed; `/aif-verify --strict` should report WARN, not fail, for missing linkage alone)
```

**Plan file:** Always the resolved `paths.plan` file (default: `.ai-factory/PLAN.md`).

---

## Shared Steps (all modes)

### Step 2: Analyze Requirements

From the description, identify:

- Core functionality to implement
- Components/files that need changes
- Dependencies between tasks
- Edge cases to handle

If requirements are ambiguous, ask clarifying questions:

```
I need a few clarifications before creating the plan:
1. [Specific question about scope]
2. [Question about approach]
```

### Step 3: Explore Codebase

Before planning, understand the existing code through **parallel exploration**.

**Use `Task` tool with `subagent_type: Explore` to investigate the codebase in parallel.** This keeps the main context clean and speeds up research.

Launch 2-3 Explore agents simultaneously, each focused on a different aspect:

```
Agent 1 — Architecture & affected modules:
Task(subagent_type: Explore, model: sonnet, prompt:
  "Find files and modules related to [feature domain]. Map the directory structure,
   key entry points, and how modules interact. Thoroughness: medium.")

Agent 2 — Existing patterns & conventions:
Task(subagent_type: Explore, model: sonnet, prompt:
  "Find examples of similar functionality already implemented in the project.
   Show patterns for [relevant patterns: API endpoints, services, models, etc.].
   Thoroughness: medium.")

Agent 3 — Dependencies & integration points (if needed):
Task(subagent_type: Explore, model: sonnet, prompt:
  "Find all files that import/use [module/service]. Identify integration points
   and potential side effects of changes. Thoroughness: medium.")
```

**If full/ultra mode passed codebase reconnaissance** from Step 1 — use it as a starting point. Focus Explore agents on areas that need deeper understanding.

For ultra, continue until the plan has code-level evidence for every phase:

- relevant existing paths and symbols
- callers/consumers and side effects
- exact integration and configuration points
- existing tests, fixtures, commands, logging, migration, and documentation patterns

Do not paste entire source files into phase plans; cite only the evidence needed
to make implementation steps deterministic.

**After agents return, synthesize:**

- Which files need to be created/modified
- What patterns to follow (from existing code)
- Dependencies between components
- Potential risks or edge cases

**Fallback:** If Task tool is unavailable, use Glob/Grep/Read directly.

### Step 4: Create Task Plan

Create tasks using `TaskCreate` with clear, actionable items.

**Task Guidelines:**

- Each task should be completable in one focused session
- Tasks should be ordered by dependency (do X before Y)
- Include file paths where changes will be made
- Be specific about what to implement, not vague
- In ultra, keep TaskCreate descriptions concise but include the matching phase
  file link; the bundle remains the durable detailed source after context resets

Use `TaskUpdate` to set `blockedBy` relationships:

- Task 2 blocked by Task 1 if it depends on Task 1's output
- Keep dependency chains logical

### Step 5: Save Plan Artifact

**Determine plan artifact path:** the values were already resolved in Step 1.2.

- **Fast mode** → the resolved `paths.plan`.
- **Full mode** → `<configured plans dir>/<plan_identifier>.md`.
- **Ultra mode** → `<configured plans dir>/<plan_identifier>/index.md` plus
  `phase-NN-<slug>.md` files in the same directory.
- For `slug`, reserved `timestamp` / `uuid`, or Handoff-prepared branches,
  `plan_identifier = plan_file_stem`.
- For active `sequential`, `plan_identifier = <NNNN>_<plan_file_stem>`.

The `plan_file_stem` is **always** the canonical stem from Step 1.2.a (Handoff branch / git branch / description slug — in that order). Branch-based consumers reproduce the same stem at lookup time, so the producer must not deviate.

Before writing any unprefixed full/ultra target (default/reserved slug behavior
or a Handoff-prepared branch), check for the sibling representation
with the same stem: `<plan_identifier>.md` versus `<plan_identifier>/index.md`.
If either already exists, do not silently create a second active representation
or overwrite it. Ask the user to refine the existing plan, choose another
identifier, or explicitly replace it.

**Before saving, ensure directory exists:**

```bash
mkdir -p <configured plans dir>
```

For ultra also create the resolved bundle directory before writing its files.

**Full/fast plan file or ultra `index.md` must include:**

- For ultra only, the exact machine-readable marker
  `<!-- aif:plan-mode:ultra -->` exactly once near the top of `index.md`
  (immediately after the optional first-line Handoff annotation). Never
  translate, rewrite, or omit it. Consumers identify bundles by this marker,
  not by localized human-readable labels such as `Mode`.
- Title with feature name
- Branch and creation date
- `Original Request` section (required when the user explicitly supplied a planning request; omitted when the plan is created solely from `RESEARCH.md`)
- `Settings` section (Testing, Logging, Docs)
- `Roadmap Linkage` section (optional, only if the resolved roadmap artifact exists)
- `Research Context` section (optional, only if research content influenced this plan)
- `Tasks` section grouped by phases; in ultra this is the only task-checkbox source
- `Commit Plan` section when there are 5+ tasks

If `original_user_request` is non-empty:

- Write `## Original Request` before `## Settings`
- Preserve the exact user-provided request text after only recognized command tokens are removed and only outer whitespace is trimmed
- Do not translate the saved request; it is raw source input, not generated artifact prose

If the resolved roadmap artifact exists:

- If the user linked a milestone, write `## Roadmap Linkage` with `Milestone: "..."` and `Rationale: ...`
- If the user skipped linkage, write `## Roadmap Linkage` with `Milestone: "none"` and `Rationale: "Skipped by user"`

If research content influenced this plan:

- Include `## Research Context` by copying only the `Active Summary` (do not paste full `Sessions`)
- Include ``Source: `<selected_research_path>` (Active Summary, Updated: <research Updated timestamp>, SHA256: <sha256 of copied Active Summary>)`` so `/aif-implement`, `/aif-verify`, `/aif-improve`, and related consumers know the exact committed research revision
- Compute the hash from the normalized copied Active Summary exactly as described in Step 0: remove HTML comment blocks, preserve line order and leading whitespace, trim trailing spaces from every line, use LF line endings, and end with exactly one final newline. Feed the normalized text to `shasum -a 256` or `sha256sum` through stdin / inline shell input, never through a temp file, and copy the first output field.
- Treat the copied `Research Context` as the plan-owned authoritative requirements copy. A later change to the selected `RESEARCH.md` must not override these requirements without an explicit drift warning and user-requested rebase/refinement.
- Keep it compact; it should be readable as a one-screen requirements snapshot

If research exists but did not influence this plan, do not include `## Research Context`. An existing `RESEARCH.md` for topic A plus an explicit `/aif-plan` request for unrelated topic B must produce an unlinked plan for topic B.

Use the canonical template in `references/TASK-FORMAT.md` for fast/full.
Use `references/ULTRA-FORMAT.md` for ultra and verify every Phase Index link,
task mapping, dependency, and phase file before completion.

The canonical template defines the required sections and ordering only. Render all human-readable plan content in `artifact_language` before writing the file, applying `technical_terms_policy` and preserving stable tokens as described in Step 0.

**Commit Plan Rules:**

- **5+ tasks** → add commit checkpoints every 3-5 tasks
- **Less than 5 tasks** → single commit at the end, no commit plan needed
- Group logically related tasks into one commit
- Suggest meaningful commit messages following conventional commits

### Step 6: Next Steps

**Full/ultra mode + parallel (`--parallel`):** Automatically invoke `/aif-implement` — the whole point of parallel is autonomous end-to-end execution in an isolated worktree. If `HANDOFF_BRANCH_PREPARED = 1`, treat `--parallel` as disabled and do not auto-invoke `/aif-implement`.

```
/aif-implement

CONTEXT FROM /aif-plan:
- Plan artifact: <resolved plan file or ultra directory>      # see Step 1.2 / Step 5
- Testing: yes/no
- Logging: verbose/standard/minimal
- Docs: yes/no  # yes => mandatory docs checkpoint, no => warn-only
```

**Full/ultra mode normal:** STOP after planning. The user reviews the plan and decides when to implement.

The next-step templates below define structure only. Render all human-readable text in these user-facing responses in `ui_language`. Preserve command names, configured paths, task counts, and TaskList references unchanged.

```
Plan created with [N] tasks.
Plan artifact: <resolved plan file or ultra directory>

To start implementation, run:
/aif-implement

To view tasks:
/tasks (or use TaskList)
```

**Fast mode:** STOP after planning.

```
Plan created with [N] tasks.
Plan file: <resolved fast plan path>

To start implementation, run:
/aif-implement

To view tasks:
/tasks (or use TaskList)
```

### Context Cleanup

Suggest the user to free up context space if needed: `/clear` (full reset) or `/compact` (compress history).

---

## --list Subcommand

When `--list` is passed, show all active worktrees and their feature status. Then **STOP**.

```bash
git worktree list
```

For each worktree path:

1. Check whether the resolved plans directory exists under that worktree (`<worktree>/<resolved paths.plans>`, default: `<worktree>/.ai-factory/plans/`) and contains any root `*.md` plans or direct child `*/index.md` entrypoints containing `<!-- aif:plan-mode:ultra -->`
2. Show name and whether it looks complete (has tasks) or is still in progress

**Output format:**

```
Active worktrees:

  /path/to/my-project          (<configured-base-branch>)        <- you are here
  /path/to/my-project-feature-user-auth  (feature/user-auth)  -> Plan: feature-user-auth.md
  /path/to/my-project-feature-billing    (feature/billing)    -> Ultra: feature-billing/index.md
  /path/to/my-project-fix-cart-bug       (fix/cart-bug)        -> No plan yet
```

When `workflow.plan_id_format = sequential`, the displayed file or directory
includes the numeric prefix, e.g. `Plan: 0042_feature-user-auth.md` or
`Ultra: 0042_feature-user-auth/index.md`. Pick the highest-numbered match across
both representations for the worktree's branch stem.

## --cleanup Subcommand

When `--cleanup <branch>` is passed, remove the worktree and optionally delete the branch. Then **STOP**.

```bash
DIRNAME=$(basename "$(pwd)")
BRANCH_DIR=$(echo "<branch>" | tr '/' '-')
WORKTREE="../${DIRNAME}-${BRANCH_DIR}"

git worktree remove "${WORKTREE}"
git branch -d <branch>  # -d (not -D) will fail if unmerged, which is safe
```

If `git branch -d` fails because the branch is unmerged:

```
Branch <branch> has unmerged changes.
To force-delete: git branch -D <branch>
To merge first: git checkout <configured-base-branch> && git merge <branch>
```

If the worktree path doesn't exist, check `git worktree list` and suggest the correct path.

---

## Task Description Requirements

Every `TaskCreate` item MUST include:

- Clear deliverable and expected behavior
- File paths to change/create
- Logging requirements (what to log, where, and levels)
- Dependency notes when applicable

**Never create tasks without logging instructions.**

Use canonical examples in `references/TASK-FORMAT.md`:

- TaskCreate Example
- Logging Requirements Checklist

## Important Rules

1. **NO tests if user said no** — Don't sneak in test tasks
2. **NO reports** — Don't create summary/report tasks at the end
3. **Actionable tasks** — Each task should have clear deliverable
4. **Right granularity** — Not too big (overwhelming), not too small (noise)
5. **Dependencies matter** — Order tasks so they can be done sequentially
6. **Include file paths** — Help implementer know where to work
7. **Commit checkpoints for large plans** — 5+ tasks need commit plan with checkpoints every 3-5 tasks
8. **Plan artifact location** – Fast: `paths.plan`. Full:
   `paths.plans/<plan_identifier>.md`. Ultra:
   `paths.plans/<plan_identifier>/index.md` plus phase files.
   `plan_identifier` uses the canonical handoff/branch/slug stem and optional
   sequential prefix from Step 1.2; `timestamp` and `uuid` fall back to `slug`.
9. **Ownership boundary** – This command owns plan artifacts only (the resolved fast plan path and full/ultra artifacts under `paths.plans`). Use owner commands (`/aif-roadmap`, `/aif-rules`, `/aif-explore`) for their artifacts.
10. **Roadmap linkage (when available)** — If the resolved roadmap artifact exists, include a `## Roadmap Linkage` section in the plan (or explicitly state it was skipped).

## Plan File Handling

**Fast mode (`paths.plan`, default: `.ai-factory/PLAN.md`)**

- Temporary plan for quick work
- `/aif-implement` may offer deletion after completion

**Full mode (`paths.plans/<plan_identifier>.md` — default)**

- Long-lived plan for feature delivery
- The canonical `plan_file_stem` comes from Step 1.2.a: Handoff branch name (slashes replaced) → git branch name (slashes replaced) → description slug, in that order
- When `workflow.plan_id_format = sequential`, the filename becomes
  `paths.plans/<NNNN>_<plan_file_stem>.md` — the prefix is the next 4-digit
  number after the highest existing numbered plan in the directory, capped at
  `9999`. Numbers are derived from currently existing files: deleting or moving
  a numbered plan out of the directory can free that number for reuse on the
  next run. The Handoff branch contract force-disables the prefix (see Step
  1.2.b–c).
- `timestamp` and `uuid` are reserved values; both currently behave like
  `slug` (no prefix is applied)

**Ultra mode (`paths.plans/<plan_identifier>/index.md`)**

- Long-lived plan bundle for high-fidelity delegation
- Uses the same canonical stem, branch/worktree behavior, and optional
  sequential prefix as full mode; the prefix is on the directory
- `index.md` is the manifest and progress source; direct child phase files are
  implementation specifications
- Consumers must read the bundle using `references/ULTRA-FORMAT.md`; do not
  flatten it into a local single-file plan

For concrete end-to-end flows (fast/full/ultra/parallel/interactive), read `references/EXAMPLES.md` (Flow Scenarios).
