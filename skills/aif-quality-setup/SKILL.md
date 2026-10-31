---
name: aif-quality-setup
description: Detect the project stack and configure suitable code checks and Git hooks when setting up or improving local quality tooling.
argument-hint: '[audit|setup|enhance] ["project-path" ...]'
allowed-tools: Read Glob Grep Write Edit Bash(git *) Bash(npm *) Bash(pnpm *) Bash(yarn *) Bash(bun *) Bash(composer *) Bash(php *) Bash(python *) Bash(python3 *) Bash(uv *) Bash(poetry *) Bash(pdm *) Bash(cargo *) Bash(rustup *) Bash(rustfmt *) Bash(ruff *) Bash(mypy *) Bash(pyright *) Bash(pre-commit *) Bash(lefthook *) AskUserQuestion Questions WebFetch WebSearch
disable-model-invocation: true
---

# Quality Checks and Git Hooks Setup

## Shared project skill-context

Before mode routing or work, read existing files relative to the current project root in this order (reuse them if already loaded):

1. `.ai-factory/skill-context/global-skill-context.md` — all bundled skills.
2. `.ai-factory/skill-context/aif-quality-setup/SKILL.md` — this skill.

Missing files are skipped; an existing unreadable file stops dependent work with its path.
Precedence: individual > build (when applicable) > global > skill defaults; retain non-conflicting instructions and check all outputs against the effective rules.
These layers customize workflow; they do not replace the project's rules/architecture hierarchy or relax explicit requirements, ownership, scope, safety/privacy, validation, or approval boundaries. Report conflicts with those boundaries instead of overriding them.
`global` is a project-local layer, not home-directory configuration. Custom/extension skills do not automatically use it.

Detect the actual project before proposing tools. Language profiles supply relevant
knowledge after discovery; they are not a menu the user must select manually.
Support existing and new JS/TS, PHP, Python and Rust setups, mixed monorepos and
multiple repositories. For other stacks, investigate native tools and current
official documentation; unresolved compatibility remains explicit.

## Step 0: Resolve Context and Scope

Read `.ai-factory/config.yaml` when present, without creating or updating it:

- `paths.description` → `.ai-factory/DESCRIPTION.md`
- `paths.architecture` → `.ai-factory/ARCHITECTURE.md`
- `paths.rules_file` → `.ai-factory/RULES.md`
- `paths.rules` → `.ai-factory/rules/`; `rules.base` → `.ai-factory/rules/base.md`
- named `rules.<area>` entries for the selected components
- `language.ui` → `en`; `language.artifacts` → UI language;
  `language.technical_terms` → `keep` (unknown/legacy values also use `keep`)
- `git.enabled` → `true`

Resolve relative context paths from their repository root; respect applicable
AGENTS/CLAUDE instructions and area rules > base > rules_file. Read existing
description/architecture for constraints, then verify stack facts from the actual
project. Missing AI Factory context is normal; an unreadable mandatory instruction
or ambiguous config stops dependent writes until resolved.

After discovering independent roots, repeat this context resolution and the shared
project skill-context load for **each** repository. Keep separate records; missing
context in B never inherits A's config, rules, language or skill-context. With
`git.enabled:false`, use filesystem boundaries and checks-only options for that
root; another root's Git preference cannot enable hooks there. See discovery for
component inheritance and uncertain root handling.

Use UI language for questions/results, artifact language for generated comments and
prose; preserve native syntax, paths, identifiers, versions and raw errors.
The invocation's UI language stays stable; each repository's artifact language
controls its own generated prose. Show conflicting repository preferences explicitly.

Parse arguments with quoted paths preserved:

```text
/aif-quality-setup                           # Audit current project and propose options
/aif-quality-setup setup                      # Propose, select, then configure
/aif-quality-setup enhance "./backend"        # Complement the existing setup
/aif-quality-setup audit "../api" "../worker" # Inspect explicitly selected repositories
```

Default mode: `audit`. Default read scope: current project. Explicit paths add read
scope, not permission to change every repository. Reject unknown flags, missing
paths and conflicting mode tokens before work. `audit` ends after recommendations;
applying them requires a setup/enhance request or equivalent explicit instruction.
`setup` and `enhance` both inspect existing files and preserve user work.

## Step 1: Discover Before Choosing

Read [discovery](references/quality-setup/discovery.md) in full. Inventory selected
roots, repositories, components, manifests, runtime constraints, environments,
frameworks, commands, tool configs, hooks and CI as data. Do not install, execute
project configs/scripts or modify files/index during discovery.

Record evidence, CWD, uncertainty and missing runtime separately. Use the existing
read-only command catalog when available/permitted; keep its command IDs/source
revision and unresolved states. It does not execute or authorize commands and
does not automatically discover Python/Cargo commands.

Load only profiles justified by discovered evidence, including every relevant
component of a mixed project:

- [JS/TS](references/quality-setup/js-ts.md) — package manager, framework and runtime compatibility.
- [PHP](references/quality-setup/php.md) — Composer, style/syntax/static analysis.
- [Python](references/quality-setup/python.md) — environment, lint/format/type policy.
- [Rust](references/quality-setup/rust.md) — Cargo members, toolchain, features/targets.

## Step 2: Explain Suitable Options

Read [recommendations](references/quality-setup/recommendations.md) before presenting
the proposal. Explain existing coverage and gaps, a recommended approach and only
meaningful alternatives, with reasons grounded in the discovered project.
Prefer extending existing tools. Confirm versions against target runtimes and
frameworks using current documentation; never upgrade a runtime as a side effect.

For each option show changed files, dependencies/install effects, exact commands
and CWD, scope/events, strictness, autofix mode and limitations. Do not generate
unrelated stacks' configs or select a hook manager solely by language name.

## Step 3: Resolve the User's Choices

Apply the runtime-aware questions contract below. Resolve repositories/components,
checks, commands, hook manager/events, strictness and autofix before dependent
changes. Accept a full choice, partial choice or cancellation. Reuse existing
specific authorization; ask only about material unresolved decisions.

Default autofix mode: **check**. Explain **fix-and-stop** and **fix-and-stage** as
candidates only where runner support is documented. Selection can authorize a
concrete disposable validation, including disclosed installs/execution, before tools
exist in the project. A candidate is not an available verified mode yet. Activate
it only after the matching staged-content/unstaged-hunk preservation checks pass;
follow the selection → validation → activation sequence in setup. Do not infer
approval from an unanswered question. Audit never executes validation.

## Step 4: Apply the Selected Change Set

For setup/enhance, read [setup](references/quality-setup/setup.md) and
[hooks](references/quality-setup/hooks.md) before writing/installing anything.
Apply only selected changes, respecting existing scripts, lockfiles, hook order,
Git paths and dirty state. Re-read files changed since the proposal and revise the
affected selection if its effects changed. A second run must not duplicate work.

Per repository, hand selected native commands/CWD/version constraints to `/aif-ci`
for requested CI edits and `/aif-build-automation` for requested build-file edits.
Do not rerun setup inside those owners. Ordinary commits remain `/aif-commit`'s
responsibility; hooks run through Git and must not be bypassed automatically.

## Step 5: Verify and Report the Actual Result

Read [verification](references/quality-setup/verification.md). Run only selected,
authorized checks with their real scope and effects understood. Report each
repository/component, command/CWD and configured/verified/not_run/failed status.
Missing tools and config errors are visible; all required selected checks must
pass before claiming verified success. Report partial changes and next steps on
failure. Do not create an automatic report file or machine-readable gate protocol.

## Runtime-aware questions

- `AskUserQuestion` and `Questions` describe interaction, not guaranteed tool names.
  Use only an exposed, permitted question tool with its advertised schema; do not
  guess aliases or probe unavailable tools. Frontmatter does not expose a tool.
- Ask focused questions with labelled options in UI language. Batch independent
  questions only when the tool supports it. Permit free text through native input
  or plain text.
- Without a usable question tool, ask in plain text with numbered options and a
  free-text answer. Pause dependent writes; independent read-only work may continue.
- Empty/cancelled responses, preselected options and elapsed time are not consent.
  Reuse decisions already given in this session.
- In delegated/background or explicit non-interactive runs, return unresolved
  material choices to the caller. Declared optional defaults do not authorize new
  scope, installs, writes or execution; required decisions remain blockers.

## Artifact Ownership and Config Policy

Own only selected native quality configs, relevant manifest/script entries and
dev-dependency lockfile changes, tracked hook configs/entrypoints and necessary
local hook installation artifacts in selected repositories. Source fixes follow
the separately chosen autofix scope/mode.

Treat AI Factory context/config/rules/research/plans and unrelated source changes
as read-only. No new config keys or central workspace policy file. CI/build/rules/
docs changes belong to their existing owner skills. No global Git config changes,
blanket stage/reset/clean, automatic commits/pushes or unrelated tool migrations.

Use brief INFO for scope/choices/changes/results, WARN for uncertainty/not_run,
ERROR for failed steps with remediation. DEBUG details are opt-in; do not expose
secrets, environment values or credential-bearing output.
Tool declarations do not create runtime capabilities or override permissions;
other native commands require an exposed permitted tool, not expanded grants.

Adaptable examples: [JS/TS](examples/js-ts.md), [PHP](examples/php.md),
[Python](examples/python.md), [Rust](examples/rust.md), [workspace](examples/workspace.md).
