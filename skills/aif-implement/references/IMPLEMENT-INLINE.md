### Step 0.inline: Inline Implementation Mode (`--without-plan`)

If `$ARGUMENTS` contains `--without-plan`, execute a single scoped task from the description WITHOUT creating or reading any plan file. This is the lightweight path for small `feat`/`chore` tasks that do not justify a full plan but are not bug fixes either (use `/aif-fix` for bugs).

**Argument parsing:**

```
1. description = everything after `--without-plan`, excluding any recognized flag tokens (`--docs=...`).
2. docs_policy = value of `--docs=yes|no|warn` if present, else `warn` (default).
3. Validation:
   - description is empty →
     ERROR: "Usage: /aif-implement --without-plan <description> [--docs=yes|no|warn]"
     → STOP
   - arguments also contain `@<path>`, `status`, or a bare task id number →
     ERROR: "`--without-plan` is mutually exclusive with @plan-file, status, and task id."
     → STOP
   - `--docs=<value>` where <value> not in {yes, no, warn} →
     ERROR: "Invalid --docs value. Expected yes|no|warn."
     → STOP
```

**Scope guard (prevent silent mega-tasks):**

Before executing, assess the description. If it looks too broad for a one-shot inline task — multiple unrelated imperatives joined by "and"/"и", references to multiple subsystems, or roughly more than ~300 characters of scope — do NOT attempt to guess a plan. Instead print:

```
Description looks too broad for inline implementation. Recommended:
  /aif-plan fast <description>
```

→ STOP.

Small, focused descriptions (e.g. "add GET /healthz returning 200 with {status:\"ok\"}") proceed.

**Surprise-warn on existing plan artifacts (non-blocking):**

Inline mode ignores plan files by design. If any of these exist on disk, emit a `WARN [inline]` line so the user notices the intentional skip (do NOT read them, do NOT redirect):

- `<configured plans dir>/<branch>.md` or
  `<configured plans dir>/<branch>/index.md` (git mode only) — or their
  `[0-9]{4}_<branch>` sequential forms
- resolved fast plan path (`paths.plan`)
- resolved fix plan path (`paths.fix_plan`)

Example: `WARN [inline] paths.plan exists but is ignored in --without-plan mode.`

**Load project context (same as regular implement):**

Use the resolved config from Step 0:

- `paths.description` (DESCRIPTION.md) if present
- `paths.architecture` (ARCHITECTURE.md) if present
- `paths.rules_file` (RULES.md) + `rules.base` + named `rules.<area>` entries
- `.ai-factory/skill-context/aif-implement/SKILL.md` — MANDATORY if the file exists (same precedence and enforcement as regular mode in Step 0.1)
- `language.ui`, `language.artifacts`

**Plan artifact policy:** inline mode does NOT load or use plan/fix-plan files. Plan files are never read, parsed, or executed. A minimal existence probe is permitted (see the surprise-warn section above) solely to emit the `WARN [inline]` line — nothing is read from disk. Also skip: resume/recovery reconciliation, TaskList loading, checkbox state comparison.

**Execute the task (one-shot):**

1. Announce: `Inline implementation: <description>`
2. Read only files relevant to the described scope
3. Apply changes following existing code patterns and skill-context rules
4. Apply verbose logging per `references/LOGGING-GUIDE.md`
5. Do not add tests by default. Add them only if the description explicitly requests tests (e.g. "with tests", "add tests for X") OR if existing project conventions / touched code paths clearly require them (e.g. a test file mirrors every source file in the area being changed, or a RULES.md / skill-context rule mandates test coverage for this kind of change). When in doubt, prefer NO tests and let the user follow up via `/aif-plan` if wider test coverage is needed.
6. Verify the change compiles/runs and the described behavior works

**Prohibited in inline mode:**

- Do NOT create or read `paths.plan` / `paths.plans/*` / `paths.fix_plan`.
- Do NOT invoke `/aif-plan` or `/aif-fix`.
- Do NOT create entries under `paths.patches` (no `[FIX]` self-improvement patch — this is not a bugfix flow).
- Do NOT call `TaskList` / `TaskGet` / `TaskUpdate` (no plan = no persisted tasks).
- Do NOT search for or modify plan checkboxes on disk.
- Do NOT trigger the roadmap milestone completion check, docs checkpoint-from-plan-setting, plan-file cleanup prompt, or worktree merge prompt (those belong to the plan-backed workflow).

**Handoff inline support:**

> Naming clarification: `--without-plan` means "without a **local** plan artifact on disk" (no `paths.plan` / `paths.plans/*` / `paths.fix_plan`). When a Handoff task is linked, the task is still represented as a synthetic plan **inside Handoff** via `handoff_push_plan` — that's a remote representation, not a local file. The local-no-plan contract is preserved; only the remote sync surface is unchanged.

**When `HANDOFF_MODE` is `1` (autonomous Handoff agent invoked inline mode):**

- Do NOT call any `mcp__handoff__*` tool (the coordinator manages status/sync directly — same rule as Step 0 (pre)).
- Do NOT create local plan artifacts (the regular Prohibited list above still applies).
- Do NOT switch branches, create worktrees, merge worktrees, or otherwise alter the branch/worktree the coordinator set up — inline mode operates on the working tree it was invoked in.
- Proceed with the one-shot execution; the coordinator marks the task complete after the skill returns.

**When `HANDOFF_MODE` is NOT `1` and `HANDOFF_TASK_ID` is set (manual Claude Code session linked to a Handoff task):**

1. Build synthetic plan content:

   ```markdown
   # Inline implementation
   - [ ] <description>
   ```

2. Call `handoff_sync_status` with `{ taskId: <HANDOFF_TASK_ID>, newStatus: "implementing", sourceTimestamp: "<current UTC ISO 8601>", direction: "aif_to_handoff", paused: true }`.
3. Call `handoff_push_plan` with `{ taskId: <HANDOFF_TASK_ID>, planContent: <synthetic content above> }`.
4. After successful execution, flip the checkbox to `- [x]` in the synthetic content and call `handoff_push_plan` again with the updated text.
5. Finalize sync:
   - If `HANDOFF_SKIP_REVIEW` is `1` → `handoff_sync_status` → `"done"` with `paused: false`.
   - Otherwise → `handoff_sync_status` → `"review"` with `paused: true`.

If `HANDOFF_TASK_ID` is missing → skip all MCP sync for this run.

**Docs policy (inline mode, driven by `--docs`):**

- `--docs=yes` → after completion, show the docs checkpoint (same AskUserQuestion as `Docs: yes` in regular mode) and route changes through `/aif-docs`.
- `--docs=no` → suppress the documentation checkpoint, emit `WARN [docs] --docs=no in inline mode; documentation checkpoint skipped`.
- `--docs=warn` (default) → emit `WARN [docs] Inline mode default is warn-only; documentation checkpoint skipped. Pass --docs=yes to enable.`

**Context maintenance in inline mode:**

- Resolved description artifact updates: allowed, same rules as regular mode (only factual deltas for new deps/integrations).
- Resolved architecture artifact + `AGENTS.md`: allowed only if new modules/folders were actually created.
- Resolved roadmap artifact: NOT updated in inline mode (no milestone linkage available without a plan).
- Resolved rules file: NOT edited in inline mode (same as regular).

**Completion output (inline mode):**

```
## Inline Implementation Complete

Task: <description>

Files modified:
- <file> (created|modified)
Documentation: <outcome per --docs>

What's next?

1. 🔍 /aif-verify — Verify the change (recommended)
2. 💾 /aif-commit — Commit directly
```

Then offer:

```
AskUserQuestion: Inline task complete. What's next?

Options:
1. Verify first — Run /aif-verify (recommended)
2. Skip to commit — Go straight to /aif-commit
```

→ **STOP** after the chosen follow-up completes. No summary document, no report file.
