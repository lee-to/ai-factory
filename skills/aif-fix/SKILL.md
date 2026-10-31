---
name: aif-fix
description: Fix a bug or problem. Supports fix-now or plan-first; no args executes FIX_PLAN.md. When a regression check is needed, reproduce first, then implement and rerun it. Adds logging and suggests extra coverage.
argument-hint: <bug description or error message>
allowed-tools: Read Write Edit Glob Grep AskUserQuestion Questions Task mcp__handoff__handoff_sync_status mcp__handoff__handoff_push_plan mcp__handoff__handoff_get_task mcp__handoff__handoff_list_tasks mcp__handoff__handoff_update_task
disable-model-invocation: false
---

# Fix - Bug Fix Workflow

Shell commands are not pre-approved by this skill. Use an exposed execution tool
under the runtime's existing permissions for the authorized command and CWD.
Reuse applicable authorization; request native approval only when required.
Unavailable or denied commands remain blockers/not_run in delegated runs too.
Never broaden permissions, use another path to bypass a denial, or report an
unexecuted check as passed.

## Shared project skill-context

Before mode routing or work, read existing files relative to the current project root in this order (reuse them if already loaded):

1. `.ai-factory/skill-context/global-skill-context.md` — all bundled skills.
2. `.ai-factory/skill-context/build-skill-context.md` — only fix, implement, plan, verify, improve.
3. `.ai-factory/skill-context/aif-fix/SKILL.md` — this skill.

Missing files are skipped; an existing unreadable file stops dependent work with its path.
Precedence: individual > build (when applicable) > global > skill defaults; retain non-conflicting instructions and check all outputs against the effective rules.
These layers customize workflow; they do not replace the project's rules/architecture hierarchy or relax explicit requirements, ownership, scope, safety/privacy, validation, or approval boundaries. Report conflicts with those boundaries instead of overriding them.
`global` is a project-local layer, not home-directory configuration. Custom/extension skills do not automatically use it.

Fix a specific bug or problem in the codebase. Supports two modes: immediate fix or plan-first approach. The default workflow is regression-first whenever a regression check is needed: reproduce the problem, confirm the reported behavior, implement the fix, then verify the same check passes.

## Selective reference loading

Resolve reference paths beside this installed entrypoint, including flat workflows. Read a reference in full only when its stated condition applies, before the dependent step; do not preload all references. If a selected reference is missing or unreadable, STOP before that step and report its path. The entrypoint dispatch and hard boundaries apply to every reference. Project skill-context overrides and managed extension injections retain their existing precedence. Keep managed `aif-ext` blocks in the entrypoint; never move them into references.

## Workflow

### Canonical Regression-First Policy

A **regression check** is the smallest useful test, command, fixture, API call, browser scenario, script, or documented manual/runtime reproduction that proves the reported bug or validates the expected behavior.

When a bug needs regression coverage, every workflow path (fix-now, plan-first, and existing-plan execution) follows this policy:

1. Identify the minimal regression check that should reproduce the issue or encode the expected behavior.
2. Execute the check before implementation and confirm it fails or reproduces the reported problem.
3. Implement the smallest fix addressing the root cause.
4. Re-run the exact same check and confirm it passes.
5. Only after that, run related existing checks when practical and suggest broader coverage if useful.

Fallback behavior:

- If no automated/executable check is available, document the narrowest manual/runtime reproduction and why no executable check exists. Treat that documented reproduction as the regression check for Step 4 when it can be rerun.
- If no useful regression check exists at all, record the reason before implementation. In `HANDOFF_MODE=1`, continue only when investigation found a plausible root cause that can be fixed safely; otherwise report the task as blocked/unreproducible and stop without changing implementation code. In manual mode, ask whether to proceed with the likely fix, adjust reproduction, or investigate further.
- If the pre-fix regression check passes unexpectedly, treat it as a reproduction mismatch: record the command/check, inputs, environment assumptions, and observed result. Then use the same `HANDOFF_MODE=1` or manual-mode fallback above.

Do not duplicate or weaken this policy in later workflow sections. Later steps should reference this section and add only local execution details.

### Step 0 (pre): Detect Handoff Mode

Determine Handoff mode, task ID, and skip-review flag. If the caller passed `HANDOFF_MODE`, `HANDOFF_TASK_ID`, and `HANDOFF_SKIP_REVIEW` as explicit text in the prompt, use those values. Otherwise, use the Bash tool:

```
Bash: printenv HANDOFF_MODE || true
Bash: printenv HANDOFF_TASK_ID || true
Bash: printenv HANDOFF_SKIP_REVIEW || true
```

**Then check `HANDOFF_MODE`:**

#### When `HANDOFF_MODE` is `1` (autonomous Handoff agent)

The Handoff coordinator already manages status transitions and DB writes directly. Do NOT call MCP tools. Instead:

- **No interactive questions:** Do not use `AskUserQuestion`. If `$ARGUMENTS` contains `--plan-first`, use "Plan first" mode. Otherwise default to "Fix now" mode. When a regression check is needed for the bug, include regression-first handling and logging.
- **Plan annotation (MANDATORY):** If `HANDOFF_TASK_ID` is non-empty, you MUST insert `<!-- handoff:task:<HANDOFF_TASK_ID> -->` as the very first line of the fix plan file, before the title. **Omitting this annotation when HANDOFF_TASK_ID is set is a bug — verify before completing.** This applies to both Step 1.1 (creating new plan) and any plan rewrite.

#### When `HANDOFF_MODE` is NOT `1` (manual Claude Code session)

Handoff sync is handled inline — see **Step 0.1** (after reading the fix plan file) for the task ID extraction and MCP sync trigger. The sync points are:

- **Plan first (Step 1.1):** `"planning"` → `"plan_ready"` (after save)
- **Fix now (Step 2→5):** `"implementing"` (Step 2 entry) → `"done"` if `HANDOFF_SKIP_REVIEW=1`, else `"review"` (Step 5)
- **Execute existing plan (Step 0.1→5):** `"implementing"` (Step 0.1) → `"done"` if `HANDOFF_SKIP_REVIEW=1`, else `"review"` (Step 5)

**CRITICAL:** Always pass `paused: true` with every `handoff_sync_status` call except `done`.

When creating a new FIX_PLAN.md: if there is no existing annotation and no Handoff context, do not add the annotation.

### Step 0: Load Config and Resolve Paths

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:

- **Paths:** `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.rules`, `paths.research`, `paths.fix_plan`, and `paths.patches`; derive `research_bundles_dir = <parent directory of paths.research>/research/`
- **Language:** `language.ui` for prompts and summaries, `language.artifacts` for `FIX_PLAN.md` and patch artifacts, and `language.technical_terms` for human-readable technical terminology in artifacts
- **Rules:** `rules.base` plus any named `rules.<area>` entries

If config.yaml doesn't exist, use defaults:

- DESCRIPTION.md: `.ai-factory/DESCRIPTION.md`
- ARCHITECTURE.md: `.ai-factory/ARCHITECTURE.md`
- RULES.md: `.ai-factory/RULES.md`
- rules/: `.ai-factory/rules/`
- RESEARCH.md: `.ai-factory/RESEARCH.md`
- FIX_PLAN.md: `.ai-factory/FIX_PLAN.md`
- patches/: `.ai-factory/patches/`
- `ui_language`: `en`
- `artifact_language`: `en`
- `technical_terms_policy`: `keep`

Resolved language values:
- `ui_language = language.ui || "en"`
- `artifact_language = language.artifacts || language.ui || "en"`
- `technical_terms_policy = language.technical_terms || "keep"`

If `technical_terms_policy` is not one of `keep`, `translate`, or `mixed`, treat it as `keep`. Legacy values such as `english` also behave like `keep`.

All AskUserQuestion prompts, progress updates, fix summaries, test prompts, and next-step guidance MUST be written in `ui_language`.

Generated `FIX_PLAN.md` and self-improvement patch files under `paths.patches` MUST be written in `artifact_language`.

Templates and examples define structure, not fixed English output. If `artifact_language` is not `en`, translate human-readable headings, labels, analysis text, fix checklist entries, risks, prevention notes, and patch prose before saving. Preserve Handoff annotations, markdown structure, checkbox syntax, paths, commands, config keys, code identifiers, package names, API names, raw error messages, code snippets, log prefixes such as `[FIX]`, and patch tags unchanged. Keep `## Research Context`, `Source:`, `Active Summary`, `Updated:`, and `SHA256:` exact because downstream research drift checks parse them as compatibility tokens. Apply `technical_terms_policy` to other human-readable terminology.

### Step 0.1: Check for Existing Fix Plan

**BEFORE anything else after config resolution**, check the resolved fix plan path (default: `.ai-factory/FIX_PLAN.md`).

**If the file EXISTS:**

- Read the resolved fix plan file
- If the fix plan contains `## Research Context`, treat its embedded copy as the committed requirements snapshot. Parse the first `Source:` / `Reference:` line with canonical `^(?:Source|Reference):\s+\x60([^\x60]+)\x60\s+\(` syntax; for older bare-path lines, fall back to `^(?:Source|Reference):\s+(.+?)\s+\(`. Fall back to configured `paths.research` only when neither form identifies a usable path.
- If the parsed source is inside `research_bundles_dir`, require its sibling `INDEX.md` to contain `<!-- aif:research-mode:ultra -->` exactly once and link that `RESEARCH.md` from `## Artifact Index`; otherwise emit `WARN [research-drift]`. Valid sibling C4/ADR/dependency artifacts are rationale only.
- When `SHA256:` is present, extract the current source text strictly between `<!-- aif:active-summary:start -->` and `<!-- aif:active-summary:end -->`, remove HTML comment blocks, preserve line order and leading whitespace, trim trailing spaces from every line, use LF endings, and end with one newline. Hash through stdin with `shasum -a 256` or `sha256sum`; the digest is authoritative. Use `Updated:` only as a legacy fallback when `SHA256:` is absent. A missing/invalid source or revision mismatch emits `WARN [research-drift]`; execute against the embedded Research Context unless the user explicitly requests a rebase.
- **Immediately check the first line for `<!-- handoff:task:<uuid> -->`:**
  - If found AND `HANDOFF_MODE` is NOT `1` (manual session): extract the task ID. Call `handoff_sync_status` with `{ taskId: <extracted-id>, newStatus: "implementing", sourceTimestamp: "<current UTC time in ISO 8601 format>", direction: "aif_to_handoff", paused: true }`. (Status is `"implementing"` because we are executing an existing plan, not creating one.)
  - If found AND `HANDOFF_MODE` is `1`: the Handoff coordinator handles sync — do nothing.
  - If NOT found: no linked Handoff task — skip all MCP sync for the rest of this session.
- Inform the user: "Found existing fix plan. Executing fix based on the plan."
- Skip **Step 1** (problem intake/mode choice), but still run **Step 0.2** to load context
- Then continue to **Step 2: Investigate the Codebase**, using the plan as your guide
- Apply the **Canonical Regression-First Policy** before changing implementation code when a regression check is needed for the bug, even if the existing plan did not include that policy
- Follow the plan sequentially, but preserve the canonical order: confirm the problem first, implement the fix, then rerun the same regression check
- After the fix is fully applied and verified in Step 4, delete the resolved fix plan file **only when it is the default fix plan path** `.ai-factory/FIX_PLAN.md`:
  ```bash
  rm .ai-factory/FIX_PLAN.md
  ```
- If the fix plan came from a custom `paths.fix_plan` value, an explicitly supplied custom plan path, or any non-default fix plan location, do **not** delete it. Leave it in place and mention in the final summary that the custom fix plan was preserved.
- Continue to Step 5 (Additional Test Coverage) and Step 6 (Patch)

**If the file DOES NOT exist AND `$ARGUMENTS` is empty:**

- Tell the user: "No fix plan found and no problem description provided. Please either provide a bug description (`/aif-fix <description>`) or create a fix plan first."
- **STOP.**

**If the file DOES NOT exist AND `$ARGUMENTS` is provided:**

- Continue to Step 0.2 below.

### Step 0.2: Load Project Context & Past Experience

**THEN:** Read `.ai-factory/DESCRIPTION.md` (use path from config) if it exists to understand:

- Tech stack (language, framework, database)
- Project architecture
- Coding conventions

**Also read `.ai-factory/ARCHITECTURE.md`** (use path from config), the resolved RULES.md path, and the configured rules hierarchy when present to avoid fixes that violate project structure or local conventions.

**Read `.ai-factory/skill-context/aif-fix/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**

- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including the FIX_PLAN.md
  template and patch files. The FIX_PLAN.md template in Step 1.1 is a **base structure**. If a
  skill-context rule says "steps MUST include X" or "plan MUST have section Y" — you MUST augment
  the template accordingly. Generating a FIX_PLAN.md or patch that violates skill-context rules is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

**Patch fallback (limited, only when individual skill-context is missing):**

- If `.ai-factory/skill-context/aif-fix/SKILL.md` is absent and the resolved patches dir exists (even when global/build context exists):
  - Use `Glob` to find `*.md` files in `<resolved patches dir>`
  - Sort patch filenames ascending (lexical), then select the last **10** (or fewer if less exist)
  - Read those selected patch files only
  - Prioritize recurring **Root Cause** and **Prevention** patterns
- If the individual skill-context exists, do **not** read all patches by default.
  - Optionally inspect a small, targeted subset of recent patches when tags/files clearly match the current bug.

### Step 1: Understand the Problem & Choose Mode

From `$ARGUMENTS`, identify:

- Error message or unexpected behavior
- Where it occurs (file, function, endpoint)
- Steps to reproduce (if provided)

If unclear, ask:

```
To fix this effectively, I need more context:

1. What is the expected behavior?
2. What actually happens?
3. Can you share the error message/stack trace?
4. When did this start happening?
```

**After understanding the problem, ask the user to choose a mode using `AskUserQuestion`:**

Question: "How would you like to proceed with the fix?"

Options:

1. **Fix now** — Investigate and apply the fix immediately
2. **Plan first** — Create a fix plan for review, then fix later

**Based on choice:**

- "Plan first" → Proceed to **Step 1.1: Create Fix Plan**
- "Fix now" → Skip Step 1.1, proceed directly to **Step 2: Investigate the Codebase**

### Plan-first route

Only when plan-first is selected, read [fix-plan creation](references/FIX-PLAN.md), investigate enough to define the fix, preserve Research Context revisions and the first-line Handoff annotation, save the configured fix plan, synchronize manual Handoff to `plan_ready` when linked, then STOP. Do not apply the fix in this route.

### Investigation

Before investigating in any fix-now, plan-first, or existing-plan route, read [investigation and manual Handoff start](references/FIX-INVESTIGATION.md). Its manual `implementing` sync applies only to fix-now execution, not plan-first. Identify the root cause, affected callers, side effects, and related patterns. Use the defined direct fallback when delegation is unavailable.

### Step 2.5: Capture a Regression Check

Apply the **Canonical Regression-First Policy** before changing implementation code. Prefer a regression check for behavior bugs, parsing/validation bugs, API/data bugs, crashes, and regressions. If the change is a non-bug cleanup, purely static correction, or investigation-only request, record why the policy does not apply and continue with the normal fix workflow.

**Anti-gaming rule:** Do not tailor the test to the implementation you plan to write. The test must describe the externally expected behavior or the reported failure condition. If the test passes before any fix, either the reproduction is wrong, the bug is stale, or the environment differs; handle that mismatch through the fallback behavior in the Canonical Regression-First Policy before changing implementation code.

Record the selected regression check, pre-fix result, and any fallback decision in your working notes so Step 4 can rerun or revisit the same check after the fix.

### Apply the fix

After the Canonical Regression-First Policy permits implementation, read [fix implementation and logging](references/FIX-IMPLEMENTATION.md). Apply the smallest root-cause fix with configurable `[FIX]` or `[FIX:<issue-id>]` logging; do not add unrelated features or refactoring.

### Step 4: Verify the Fix

- Check the code compiles/runs
- If Step 2.5 created, identified, or documented a regression check, rerun or revisit the same check and confirm the fixed behavior
- Verify the logic is correct
- Ensure no regressions introduced
- When practical, run the closest existing related test suite after the regression check passes

### Coverage and completion

After verification, read [completion, manual Handoff final sync, and extra coverage](references/FIX-COMPLETION.md). Always suggest additional coverage beyond the regression check and respect the user's choice. Autonomous Handoff never calls MCP; manual linked tasks use `done` only with `HANDOFF_SKIP_REVIEW=1`, otherwise `review`, with the existing paused contract. Render the result in `ui_language` and continue to mandatory patch creation.

## Logging contract

Read [logging patterns](references/FIX-LOGGING.md) before editing fix code. Every fix logs inputs, success, and errors with configurable `[FIX]`/`[FIX:<issue-id>]` logging; context-gate outputs use `WARN`/`ERROR` without changing other skills' policies.

## Worked examples

Read [fix examples](references/FIX-EXAMPLES.md) only when a worked example is needed. They never override the Canonical Regression-First Policy.

## Important Rules

1. **Check the fix plan first** - Always check the resolved fix plan path before anything else
2. **Plan mode = plan only** - When user chooses "Plan first", create the plan and STOP. Do NOT fix.
3. **Execute mode = follow the plan** - When the resolved fix plan exists, follow it step by step. Delete it after verified execution only if it is the default `.ai-factory/FIX_PLAN.md`; preserve custom/non-default fix plan files.
4. **NO reports** - Don't create summary documents (patches are learning artifacts, not reports)
5. **ALWAYS log** - Every fix must have logging for feedback
6. **Regression-first when checks are needed** - When a bug needs regression coverage, follow the Canonical Regression-First Policy before changing implementation code, confirm the problem when reproducible, then verify the same regression check after the fix
7. **Do not fit tests to implementation** - Regression tests encode the reported/expected behavior, not the internal implementation shape
8. **ALWAYS suggest additional tests** - Help prevent nearby regressions beyond the required regression check
9. **Root cause** - Fix the actual problem, not symptoms
10. **Minimal changes** - Don't refactor unrelated code
11. **One fix at a time** - Don't scope creep
12. **Clean up** - Delete only the default fix plan after verified execution; preserve custom/non-default fix plan files
13. **Ownership boundary** - `/aif-fix` owns `paths.fix_plan` and `paths.patches`; treat `.ai-factory/DESCRIPTION.md`, roadmap, rules, and architecture context artifacts as read-only unless the user explicitly requests otherwise
14. **Logging scope** - Keep `[FIX]` logging requirements for fixes; context-gate outputs in this command should use `WARN`/`ERROR` and must not change global logging policy in other skills

## Result format

Before displaying the fix summary, read [result template](references/FIX-OUTPUT.md). Report the cause, fix, files, logging, and actual regression check/result or its explicit absence; do not create a report file.

### Mandatory learning patch

After every completed fix, read [self-improvement patch creation](references/FIX-PATCH.md) and write the timestamped learning artifact under configured `paths.patches` in `artifact_language`. Include problem, root cause, solution, prevention, and tags. This is mandatory and is not a summary report. Plan-first runs stop before execution and never create a completed-fix patch.

### Context Cleanup

Suggest the user to free up context space if needed: `/clear` (full reset) or `/compact` (compress history).

---

**DO NOT:**

- ❌ Apply a fix when user chose "Plan first" - only create the fix plan and stop
- ❌ Skip the fix-plan check at the start
- ❌ Leave the default `.ai-factory/FIX_PLAN.md` after successful fix execution
- ❌ Delete custom/non-default fix plan files after execution
- ❌ Generate reports or summaries (patches are NOT reports — they are learning artifacts)
- ❌ Refactor unrelated code
- ❌ Add features while fixing
- ❌ Skip logging
- ❌ Skip test suggestion
- ❌ Skip patch creation
