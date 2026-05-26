---
name: aif-archive
description: "Archive completed plans and roadmap milestones. Moves finished plans to the archive directory and optionally trims closed milestones from ROADMAP.md. Use when user says \"archive plans\", \"clean up plans\", \"archive completed\", or \"trim roadmap\"."
argument-hint: "[list | --roadmap | --all | <plan-name>]"
allowed-tools: Read Write Edit Glob Grep Bash(mv *) Bash(mkdir *) Bash(git *) AskUserQuestion
disable-model-invocation: false
metadata:
  author: AI Factory
  version: "1.0"
  category: workflow
---

# Archive — Move completed plans and roadmap snapshots

Archive completed plans from `paths.plans/` into `paths.archive/plans/` and
optionally trim closed milestones from `ROADMAP.md` into dated snapshots
under `paths.archive/roadmap/`.

## Workflow

### Step 0: Load Config

Read `.ai-factory/config.yaml` if it exists to resolve:

- `paths.plans` (default: `.ai-factory/plans/`)
- `paths.archive` (default: `.ai-factory/archive/`)
- `paths.plan` (default: `.ai-factory/PLAN.md`)
- `paths.fix_plan` (default: `.ai-factory/FIX_PLAN.md`)
- `paths.roadmap` (default: `.ai-factory/ROADMAP.md`)
- `workflow.plan_id_format` (default: `slug`) — active values: `slug` and
  `sequential`. `timestamp` and `uuid` are **reserved** and behave like `slug`.
  Treat any unknown value as `slug`.
- `language.ui` for user-facing prompts

If config doesn't exist, use defaults listed above.

Read `.ai-factory/skill-context/aif-archive/SKILL.md` if it exists —
project-specific overrides take priority over general instructions.

### Step 1: Parse Arguments

Extract mode from arguments:

```
(no args)        → interactive mode: scan, show completable plans, ask which to archive
list             → show archive contents, then STOP
--roadmap        → trim closed milestones from ROADMAP.md into a snapshot
--all            → archive ALL completed plans (ask confirmation first)
<plan-name>      → archive a specific plan by filename or partial stem match
```

Parsing rules:

- `list` and `--roadmap` are mutually exclusive with `<plan-name>` and `--all`
- If multiple conflicting modes are given, emit error and STOP
- `<plan-name>` can be:
  - full filename: `0005_feature-auth.md`
  - stem without extension: `0005_feature-auth`
  - partial match: `feature-auth` (must match exactly one plan)

### Step 2: Execute Mode

---

#### Mode: Interactive (no arguments)

1. Scan `paths.plans/` for all `*.md` files using `Glob`.
2. For each plan file, read the `## Tasks` section.
3. Determine completion: a plan is **completed** when ALL task checkboxes
   are `- [x]`. Plans with any `- [ ]` are incomplete.
4. If no completed plans found:
   ```
   No completed plans found in <paths.plans/>.
   ```
   → STOP.
5. Display completed plans:
   ```
   Completed plans ready to archive:

     1. 0001_feature-alpha.md (completed 2026-05-20)
     2. 0003_feature-gamma.md (completed 2026-05-24)

   Incomplete plans (skipped):
     - 0005_feature-delta.md (3/7 tasks done)
   ```
6. Ask which to archive:
   ```
   AskUserQuestion: Which plans to archive?

   Options:
   1. All completed plans listed above
   2. Select specific plans (enter numbers)
   3. Cancel
   ```
7. Execute archive operation for selected plans (see **Archive Operation**).

---

#### Mode: `list`

1. Check if `<paths.archive>/plans/` exists.
2. If not: `Archive is empty. No plans have been archived yet.` → STOP.
3. Glob `<paths.archive>/plans/*.md`.
4. For each archived plan, read the YAML frontmatter to extract `archived` date.
5. Display:
   ```
   Archived plans (<paths.archive>/plans/):

     1. 0001_feature-alpha.md  (archived: 2026-05-20)
     2. 0003_feature-gamma.md  (archived: 2026-05-24)

   Total: 2 archived plans
   ```
6. Check `<paths.archive>/roadmap/` for snapshots and list them if present:
   ```
   Roadmap snapshots (<paths.archive>/roadmap/):

     1. 2026-05-20_roadmap-snapshot.md (3 milestones)
   ```
7. STOP.

---

#### Mode: `<plan-name>`

1. Resolve `<plan-name>` to a file in `paths.plans/`:
   - Try exact filename match first
   - Then try with `.md` extension appended
   - Then try partial stem match (grep for `<plan-name>` in filenames)
2. If no match: `Plan not found: <plan-name>` with suggestions → STOP.
3. If multiple matches: list them and ask user to be more specific → STOP.
4. Read the matched plan file and check completion status.
5. If incomplete:
   ```
   Plan <filename> is not completed (5/8 tasks done).
   Only completed plans can be archived.
   ```
   → STOP.
6. Execute archive operation (see **Archive Operation**).

---

#### Mode: `--all`

1. Scan `paths.plans/` for completed plans (same logic as interactive mode).
2. If no completed plans: inform and STOP.
3. Display list and ask confirmation:
   ```
   AskUserQuestion: Archive ALL completed plans?

     1. 0001_feature-alpha.md
     2. 0003_feature-gamma.md

   Options:
   1. Yes, archive all 2 plans
   2. Cancel
   ```
4. Execute archive operation for all confirmed plans.

---

#### Mode: `--roadmap`

1. Read the resolved `paths.roadmap` file.
2. If it doesn't exist: `No ROADMAP.md found at <path>.` → STOP.
3. Find milestones with `- [x]` checkbox (completed milestones).
4. If no completed milestones: `No closed milestones to archive.` → STOP.
5. Display and ask confirmation:
   ```
   Closed milestones found in ROADMAP.md:

     - [x] MVP Launch — core features shipped
     - [x] Beta Testing — user feedback round

   AskUserQuestion: Trim these milestones from ROADMAP.md into a snapshot?

   Options:
   1. Yes, create snapshot and trim
   2. Cancel
   ```
6. Create snapshot:
   - `mkdir -p <paths.archive>/roadmap/`
   - Determine snapshot filename: `YYYY-MM-DD_roadmap-snapshot.md`
   - **Collision check.** Before writing, verify the destination does not already exist:
     ```
     Read <paths.archive>/roadmap/YYYY-MM-DD_roadmap-snapshot.md
     ```
     If the file exists, append a counter suffix to produce a non-colliding name:
     `YYYY-MM-DD_roadmap-snapshot-2.md`, `YYYY-MM-DD_roadmap-snapshot-3.md`, etc.
     Check each candidate until a free name is found.
   - Write the resolved snapshot path with:
     ```markdown
     # Roadmap Snapshot — YYYY-MM-DD

     Archived from: <paths.roadmap>

     ## Archived Milestones

     - [x] MVP Launch — core features shipped
     - [x] Beta Testing — user feedback round
     ```
7. Edit `paths.roadmap`: remove the archived `- [x]` lines from the
   `## Milestones` section. Keep the `## Completed` table if it exists.
   **Do NOT edit `paths.roadmap` unless the snapshot write in step 6 succeeded.**
8. Logging: `INFO [aif-archive] roadmap snapshot: <resolved-path> (<N> milestones archived)`

---

### Archive Operation (plans)

For each plan to archive:

1. `mkdir -p <paths.archive>/plans/`

2. **Collision check.** Before moving, verify the destination does not already exist:
   ```
   Read <paths.archive>/plans/<original-filename>
   ```
   If the file exists:
   - **Single plan** (interactive or `<plan-name>`): STOP with an error:
     ```
     ERROR [aif-archive] destination already exists: <paths.archive>/plans/<filename>
     A previously archived plan has the same filename. This can happen when
     sequential numbering reuses a freed number after archiving.
     To resolve: rename the existing archive file, or delete it if it is no
     longer needed.
     ```
   - **Batch** (`--all`): SKIP this plan with a warning, continue to the next:
     ```
     WARN [aif-archive] skipped: <filename> — destination already exists
     ```
   Do NOT overwrite in either case.

3. **Move the source file** into the archive path first:
   ```bash
   mv <paths.plans>/<filename> <paths.archive>/plans/<filename>
   ```
   This atomically removes the plan from the active directory.

4. **Add archive metadata** to the moved file using `Edit`:

   If the file already has YAML frontmatter (between `---` markers at the top):
   - Use `Edit` to add `archived: YYYY-MM-DD` field inside the existing frontmatter block.

   If the file has no YAML frontmatter:
   - Use `Edit` to prepend a minimal frontmatter block before the first line:
     ```yaml
     ---
     archived: YYYY-MM-DD
     ---
     ```

   The original filename is preserved exactly, including any sequential `NNNN_` prefix.

5. Logging: `INFO [aif-archive] archived: <filename> -> <paths.archive>/plans/<filename>`

6. After all plans are processed, display summary:
   ```
   ## Archive Complete

   Archived N plan(s) to <paths.archive>/plans/:
     - 0001_feature-alpha.md
     - 0003_feature-gamma.md

   Skipped: K (destination already exists)
     - 0002_feature-beta.md

   Plans directory: <paths.plans/> (M plans remaining)
   ```
   Omit the "Skipped" section when K is 0.

### Completion Detection Algorithm

A plan is **completed** when:

1. The file contains a `## Tasks` section (case-insensitive header match).
2. ALL lines matching the pattern `- [x]` or `- [ ]` within the Tasks section
   (and its subsections) are checked: every checkbox is `- [x]`.
3. If the Tasks section contains zero checkboxes, the plan is considered
   **not completed** (empty plans are not archivable).

Edge cases:

- Checkboxes outside `## Tasks` (e.g., in `## Settings` or `## Commit Plan`)
  are NOT counted for completion.
- Nested checkboxes (indented `  - [x]`) ARE counted.
- Plans without a `## Tasks` section are not archivable — emit
  `WARN [aif-archive] <filename> has no ## Tasks section; skipping`.

### Completion Date Inference

When displaying "completed" dates in interactive mode:

1. Check YAML frontmatter for a `completed` field — use if present.
2. Fall back to git: `git log -1 --format=%ai -- <plan-file>` to get last
   modification date.
3. Fall back to filesystem: file modification time.

## Important Rules

1. **Never archive incomplete plans** — all tasks must be `- [x]`
2. **Always ask confirmation** before `--all` and `--roadmap` operations
3. **Preserve original filenames** — including sequential `NNNN_` prefix
4. **Add archive metadata** — `archived: YYYY-MM-DD` in YAML frontmatter
5. **Do not modify fast plans** (`paths.plan`) or fix plans (`paths.fix_plan`) —
   those are single-file artifacts managed by `/aif-implement` and `/aif-fix`
6. **Do not count archived plans for sequential numbering** — archived plans
   live in `paths.archive/plans/`, not `paths.plans/`, so `/aif-plan`
   sequential scan does not include them

## Artifact Ownership

- **Owns:** `paths.archive/plans/*.md`, `paths.archive/roadmap/*.md`
- **Reads:** `paths.plans/*.md`, `paths.roadmap`
- **Modifies:** `paths.roadmap` (only with `--roadmap`, only after confirmation)
- **Does NOT touch:** `paths.plan`, `paths.fix_plan`, `paths.description`,
  `paths.architecture`, `paths.rules_file`
