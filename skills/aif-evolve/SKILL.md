---
name: aif-evolve
description: Self-improve AI Factory skills based on project context, accumulated patches, and codebase patterns. Analyzes what went wrong, what works, and enhances skills to prevent future issues. Use when you want to make AI smarter for your project.
argument-hint: '[skill-name or "all"]'
allowed-tools: Read Write Edit Glob Grep Bash(git *) AskUserQuestion Questions
disable-model-invocation: true
---

# Evolve - Skill Self-Improvement

Analyze project context, patches, and codebase to improve existing skills. Makes AI Factory smarter with every run.

## Core Idea

```
patches (past mistakes) + project context + codebase patterns
    ↓
analyze recurring problems, tech-specific pitfalls, project conventions
    ↓
enhance skills with project-specific rules, guards, and patterns
```

## Patch Consumption Policy

Use a two-layer learning model:

1. **Raw patches** (`paths.patches`, default: `.ai-factory/patches/*.md`) are the source material.
2. **Skill-context rules** (`.ai-factory/skill-context/*`) are the compact, reusable output.

Policy across workflow skills:
- `/aif-evolve` is the primary raw-patch analyzer. It processes patches **incrementally** using a cursor.
- `/aif-implement`, `/aif-fix`, and `/aif-improve` should prefer skill-context first; raw patches are fallback context only.
- Force full re-analysis only when needed (e.g., reset cursor and rerun evolve).

## Critical: Never Edit Built-in Skills Directly

**NEVER modify any files inside built-in `aif-*` skill directories** (`skills/aif-*/`).
All files in these directories are owned by ai-factory and will be overwritten on update — any direct edits will be lost.

**ALWAYS write project-specific rules to skill-context:**
```
.ai-factory/skill-context/<skill-name>/SKILL.md
```

This is the ONLY correct target for built-in skill improvements. No exceptions.

## Workflow

### Step 0: Resolve Target & Load Context

#### Step 0.1: Resolve Target

**Normalize skill name from `$ARGUMENTS`:**

| User input         | Resolved skill name |
|--------------------|---------------------|
| `plan`             | `aif-plan`          |
| `aif-plan`         | `aif-plan`          |
| `/aif-plan`        | `aif-plan`          |
| `my-custom-skill`  | `my-custom-skill`   |

Rule: first, strip any leading `/` from the argument. Then: if the argument does not start with `aif-` AND a skill named `aif-<argument>` exists — use `aif-<argument>`. Otherwise use as-is.

**After resolving the skill name:** verify that the resolved skill actually exists
(check `{{skills_dir}}/<resolved-name>/SKILL.md` or `skills/<resolved-name>/SKILL.md`).
If the skill is not found → report an error to the user and stop:
"Skill '<resolved-name>' not found. Use `/aif-evolve` without arguments to evolve
all skills, or specify a valid skill name."

**Determine which skills to evolve from `$ARGUMENTS`:**
- If `$ARGUMENTS` contains a specific skill name → evolve only that skill
- If `$ARGUMENTS` is "all" or empty → evolve all installed skills

#### Step 0.2: Load Context

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:
- **Paths:** `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.rules`, `paths.patches`, and `paths.evolutions`
- **Language:** `language.ui` for prompts and `language.artifacts` for generated reports
- **Rules hierarchy:** `rules.base` plus any named `rules.<area>` entries

If config.yaml doesn't exist, use defaults:
- DESCRIPTION.md: `.ai-factory/DESCRIPTION.md`
- ARCHITECTURE.md: `.ai-factory/ARCHITECTURE.md`
- RULES.md: `.ai-factory/RULES.md`
- rules/: `.ai-factory/rules/`
- patches/: `.ai-factory/patches/`
- evolutions/: `.ai-factory/evolutions/`
- Language: `en` (English)

**Note:** `.ai-factory/skill-context/` remains a fixed internal AI Factory path in the current schema. Patch and evolution-log locations are configurable via `paths.patches` and `paths.evolutions`.

**THEN:** Read `.ai-factory/DESCRIPTION.md` (use path from config) to understand:
- Tech stack
- Architecture
- Conventions

**Also read `.ai-factory/ARCHITECTURE.md`** (use path from config) and the configured rules hierarchy when present. This context informs convention analysis and gap detection but does not change artifact ownership.

**Read skill-context files for target skills:**

- If evolving a **specific skill** (e.g., `/aif-evolve plan`) → read only:
  1. `.ai-factory/skill-context/aif-plan/SKILL.md` (target skill's context)
  2. `.ai-factory/skill-context/aif-evolve/SKILL.md` (evolve's own context, if exists
     **and** target skill is not `aif-evolve` itself)
- If evolving **all skills** (`/aif-evolve` or `/aif-evolve all`) → read all context files:
  `Glob: .ai-factory/skill-context/*/SKILL.md` (this already includes evolve's own context — do NOT read it separately)

These contain previously accumulated project-specific rules for built-in skills.
Keep them in memory — they affect gap analysis in Step 5.

Skill-context rules are **project-level overrides** — when they conflict with the base SKILL.md of the target skill, skill-context wins (same principle as nested CLAUDE.md files).

**How to apply evolve's own skill-context rules (`aif-evolve`):**
- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including the evolution
  report, proposed improvements, skill-context file edits, and stale rule analysis. If a
  skill-context rule says "evolve MUST prioritize X" or "report MUST include Y" — you MUST comply.
  Producing evolution output that ignores skill-context rules is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

### Step 1: Collect Intelligence

**1.1: Read patches incrementally (cursor-based)**

```
Glob: <resolved patches dir>/*.md
```

Cursor file:

```
<resolved evolutions dir>/patch-cursor.json
```

Recommended shape:

```json
{
  "last_processed_patch": "YYYY-MM-DD-HH.mm.md",
  "updated_at": "YYYY-MM-DD HH:mm"
}
```

Processing rules:

1. Glob patch files and sort by filename ascending (timestamp format is lexical-friendly).
2. If no cursor file exists → first run: read all patches.
3. If cursor file exists and referenced patch is present → read only patches with filename `>` `last_processed_patch`.
4. If cursor file exists but referenced patch is missing (deleted/renamed) → emit `WARN [evolve]` and do a full rescan.
5. Historical edits/deletes for patches older than cursor are not reliably detectable without a saved baseline (snapshot/hash manifest). Do NOT emit this warning by default.
6. Emit `WARN [evolve]` for historical drift only when a reliable baseline exists and drift is actually detected.
7. Full rescan procedure: delete `<resolved evolutions dir>/patch-cursor.json`, then run `/aif-evolve` again.
8. **Do not advance cursor in Step 1.1.** Cursor is updated only after successful apply/log write in Step 7.3.

**Overlap window (anti-miss guard):**

LLMs may miss prevention points on a single pass. To reduce the chance of "permanently skipping" a patch when running incrementally:

9. When running in incremental mode (cursor exists and referenced patch is present), ALSO read the newest 5 patches by filename (tail-5 of the sorted patch list), then de-duplicate by filename.
10. Track these separately in your own notes:
   - "New patches" = patches with filename `>` `last_processed_patch`
   - "Overlap patches" = tail-5 patches
   - "Processed patches" = union(New, Overlap)
11. Cursor updates in Step 7.3 MUST be based on "New patches" only (never advance cursor when only overlap patches were processed).

Read every patch. For each one, extract:
- **Problem categories** (null-check, async, validation, types, API, DB, etc.)
- **Root cause patterns** (what classes of mistake were made)
- **Prevention points** — each independent actionable rule from the Prevention/Solution section.
  A single patch often contains **multiple independent prevention points targeting different skills**.
  Extract EACH one separately with its target skill(s). Do NOT treat a patch as a single unit.
- **Tags**

**Build a Prevention Point Registry** — a flat list of ALL extracted prevention points across
the processed patch set in this run. This registry is the primary input for Step 5 gap analysis.

```
| # | Patch | Prevention Point (specific action) | Target Skill(s) |
|---|-------|------------------------------------|-----------------|
| 1 | <patch-file> | <concrete action to enforce> | <skill-1> |
| 2 | <patch-file> | <different action from same patch> | <skill-1>, <skill-2> |
| 3 | <other-patch> | <action> | <skill-3> |
```

**CRITICAL:** A patch with 5 prevention points produces 5 rows, not 1.
If a prevention point targets 2 skills, it appears once but with both skills listed —
and EACH skill must be checked independently in Step 5.

When the run is incremental, this registry reflects the processed patch set for this run (new + overlap). Use full rescan when you need full historical backfill.

**1.2: Aggregate patterns**

Group patches by tags and categories. Identify:
- **Recurring problems** — same tag appears 3+ times? This is a systemic issue
- **Tech-specific pitfalls** — problems tied to the stack (e.g., React re-renders, Laravel N+1)
- **Missing guards** — what checks/patterns could have prevented these bugs

**1.3: Read codebase conventions**

Scan the project for patterns:
- Linter configs (`.eslintrc`, `phpstan.neon`, `ruff.toml`, etc.)
- Existing test patterns (test file structure, assertions used)
- Error handling patterns (try/catch style, error types)
- Logging patterns (logger used, format, levels)
- Import conventions, file structure

**When evolving a specific skill**, focus convention scanning on areas relevant to that skill
(e.g., for `/aif-plan` — focus on file structure and naming; for `/aif-fix` — error handling and testing).

### Step 2: Read Target Skills

**Read ONLY the base SKILL.md files for target skills — not all skills.**

- If evolving a **specific skill** (e.g., `/aif-evolve plan`) → read only that one:
  `Read: {{skills_dir}}/aif-plan/SKILL.md` (or `skills/aif-plan/SKILL.md` if not installed)
- If evolving **all skills** (`/aif-evolve` or `/aif-evolve all`) → read all:
  `Glob: {{skills_dir}}/*/SKILL.md` (or `Glob: skills/*/SKILL.md` if not installed)

Keep loaded SKILL.md content in memory — Step 3 needs it for comparison (do NOT re-read).

### Step 3: Check for Stale Rules in Skill-Context

**When:** Run this step for every **target** `aif-*` skill that has a skill-context file.

**For each rule in `.ai-factory/skill-context/<skill-name>/SKILL.md`:**

**Scope constraint:** Step 3 can ONLY modify or remove skill-context files.
It must NEVER propose editing, deleting, or reverting base `skills/aif-*/` files.
Even if the base file contains errors or incomplete rules — that is outside evolve's scope.

1. Use the base `SKILL.md` already loaded in Step 2 (do NOT re-read the file).
2. Compare each skill-context rule against the base SKILL.md content:

   **Case A — Base fully covers skill-context rule (equivalent or superset):**
   The base SKILL.md now contains a rule that is equivalent to or MORE complete than
   the skill-context rule.
   This includes:
   - Exact equivalent — same rule, same content
   - Base is a superset — base has everything skill-context has, plus more
     (e.g., skill-context has Wave 1+3, base now has Wave 1+2+3)
   → Do NOT auto-remove. Do NOT ask the user yet.
   → Collect for the report in Step 4 — include both rules and mark as
     "Fully covered by base — recommend removing from skill-context".
   Note: if user chooses to keep the skill-context rule, this is valid —
   skill-context has priority over base, so keeping it acts as a guarantee
   that the complete/correct version is always applied.

   **Case B — Contradicting rule found in base SKILL.md:**
   The base skill now has a rule that directly contradicts the skill-context rule.
   → Do NOT auto-remove. Do NOT ask the user yet.
   → Collect this conflict for the report in Step 4 — include both rules and mark as "Conflict — user decision required".

   **Case C — Partial overlap (in either direction):**
   The base SKILL.md and skill-context rule overlap, but NEITHER fully covers the other.
   This includes:
   - Base covers part of skill-context, but skill-context has unique parts too
   - Skill-context covers part of base, but base has unique parts too
     (e.g., skill-context has A→B→C, base has A→C→D — both have unique parts)
   → Do NOT auto-narrow. Analyze whether parts depend on each other
     (ordering, prerequisites, data flow).
   → Collect this overlap for the report in Step 4 — include both rules, analysis, and mark as "Partial overlap — user decision required".
   **Priority warning:** skill-context has priority over base on the same topic.
   If user keeps skill-context as-is, the base's unique parts will likely be LOST
   (AI uses skill-context version, ignores base version of the same rule).
   Always explain this consequence in option descriptions.

   **Case D — No overlap:**
   The rule is still unique to the project context.
   → Keep as-is, no action needed.

### Step 4: Present & Resolve Stale Rules

**Skip this step** if no Case A/B/C rules were found in Step 3.

Present all stale rule findings using the stale rules report format
(Case A/B/C sections with base vs skill-context comparison).

**IMPORTANT: All decisions here affect ONLY skill-context files.**
Never propose editing, deleting, or reverting base `skills/aif-*/` files —
they are outside of evolve's scope.

#### Stale Rules Report Format

For each stale rule, present:

##### /aif-plan — Fully covered: [Rule Name]
- **Base SKILL.md says:** [base rule text]
- **Skill-context says:** [project rule text]
- **Decision required:** Keep in skill-context (has priority over base — ensures
  the complete version is always applied) / Remove from skill-context (trust base) /
  Rewrite skill-context rule

##### /aif-plan — Conflict: [Rule Name]
- **Base SKILL.md says:** [base rule text]
- **Skill-context says:** [project rule text]
- **Decision required:** Keep skill-context rule (has priority — base version will
  be ignored) / Remove skill-context rule (trust base) / Rewrite skill-context rule

##### /aif-fix — Partial overlap: [Rule Name]
- **Base SKILL.md says:** [base rule text]
- **Skill-context says:** [project rule text]
- **Analysis:** [explain overlap and whether parts are independent or sequential]
- **Decision required:** Rewrite skill-context to include both unique parts
  (recommended when parts are sequential) / Keep skill-context as-is (WARNING:
  base's unique parts will be lost — skill-context has priority) / Narrow
  skill-context to uncovered part / Remove from skill-context (trust base —
  skill-context's unique parts will be lost)

#### Collecting Decisions

Use `AskUserQuestion` to collect stale rule decisions. Process in batches
of up to 3 decisions per `AskUserQuestion` call:

- Present first batch (up to 3 stale rules) → `AskUserQuestion`
- Get answers → apply decisions
- If more stale rules remain → present next batch → `AskUserQuestion`
- Repeat until all stale rules are resolved

**Do NOT proceed to Step 5 until all stale rule decisions are collected
and applied.** This determines the actual skill-context state for gap analysis.

### Step 5: Analyze Gaps

**Before analyzing gaps:** re-read skill-context files for target skills that were
modified in Step 4 (stale rule removals/rewrites). Do NOT use the version loaded
in Step 0.2 — it is outdated after Step 4 changes.

For each skill, consider the base SKILL.md AND its **current** skill-context file
(after stale rule decisions from Step 4 have been applied).
A gap only exists if NEITHER source covers it.

For each skill, identify what's missing based on collected intelligence:

**5.1: Patch-driven gaps (prevention-point-exhaustive)**

**CRITICAL: Check each prevention point × each target skill independently.**

Iterate over the Prevention Point Registry built in Step 1.1. For each row:
1. For EACH target skill listed in that row:
   - Check if the base SKILL.md already covers this **specific** prevention action
   - Check if the skill-context already has a rule covering this **specific** prevention action
2. A prevention point is "covered" for a skill ONLY when there is a rule that addresses
   the **specific action described** — not merely when the same patch filename appears in
   a Source field.
3. Mark uncovered (prevention_point, skill) pairs as gaps → these become inputs for Step 6.

**Common trap — Source reference ≠ full coverage:**
Finding `Source: <patch-filename>` in a skill-context rule means ONE rule was derived
from that patch. It does **NOT** mean ALL prevention points from that patch are covered.
A patch with 5 prevention points may have only 1 covered. Always verify the **content**
of the existing rule against each prevention point individually.

**Verification:** After completing the registry scan, count: total prevention points,
covered, uncovered. If uncovered > 0 — these are gaps for Step 6.

Note: in incremental mode, counts represent this run's processed patch set. For full historical recount, run a full rescan.

**5.2: Tech-stack gaps**

Compare project tech stack against skill instructions:
- Skills reference generic patterns but project uses specific framework? → Add framework-specific guidance
- Project uses TypeScript but skills show JS examples? → Update examples
- Project uses specific ORM (Prisma, Eloquent)? → Add ORM-specific patterns

**5.3: Convention gaps**

Compare project conventions against skill instructions:
- Project has specific error handling pattern? → Skills should enforce it
- Project uses specific logger? → Skills should reference it
- Project has specific file structure? → Skills should follow it

### Step 6: Generate Improvements

For each gap found, create a concrete improvement:

**Quality rules for improvements:**
- **One prevention point = one rule.** A single patch may contain multiple independent prevention
  items. Each one becomes a separate rule — do NOT merge them into a single vague summary.
- **Preserve concrete formats and patterns** from patches. If a patch specifies an exact format,
  syntax, or template — the rule MUST include it verbatim. Do NOT paraphrase specifics into
  vague descriptions.
- Each improvement must be traceable to a patch, convention, or tech-stack fact
- No generic advice — only project-specific enhancements
- Improvements must be minimal and focused — don't rewrite entire skills
- Preserve existing skill structure — add, don't replace

### Step 7: Present & Apply

**7.1: Present improvements to user**

Each improvement MUST explicitly state the target file path.
Use the following target labels:

- **`skill-context`** → `.ai-factory/skill-context/<skill-name>/SKILL.md`
- **`SKILL.md`** → direct edit of the skill's own `SKILL.md` (only for custom/non-aif skills)
- **Nested file** → if the skill directory contains additional files (e.g., `templates/`, `checklists/`),
  specify the exact relative path within the skill directory

Format:

```
## Skill Evolution Report

Based on:
- X patches analyzed
- Y recurring patterns found
- Z tech-stack specific insights

### Proposed Improvements

#### /aif-fix (N rules)
**Target:** `.ai-factory/skill-context/aif-fix/SKILL.md`

1. **Add null-check guard**
   - **Source:** patch-2026-02-10.md, patch-2026-02-12.md (5 patches involved null references)
   - **Why:** Recurring null-reference errors on optional DB relations
   - **Rule:** "Check for optional/nullable fields before accessing nested properties"

2. **Add async/await pattern**
   - **Source:** patch-2026-02-11.md (3 patches involved unhandled promises)
   - **Why:** Unhandled promise rejections in API layer
   - **Rule:** "Always use try/catch with async/await"

#### /aif-implement (N rules)
**Target:** `.ai-factory/skill-context/aif-implement/SKILL.md`

1. **Add Prisma-specific warning**
   - **Source:** patch-2026-02-13.md (2 patches from incorrect Prisma queries)
   - **Why:** Silent data loss from wrong Prisma query methods
   - **Rule:** "Log all Prisma queries in DEBUG mode"

#### /my-custom-skill (N rules)
**Target:** `skills/my-custom-skill/SKILL.md` (direct edit — custom skill)

1. **Add pattern**
   - **Source:** codebase convention
   - **Why:** Missing guard in Step 2
   - **Rule:** "..."
```

**After presenting the full report, use `AskUserQuestion` to collect decisions:**

For improvements — ask:
- Yes, apply all improvements
- Let me pick
- No, just save report (no changes applied)

**Based on choice:**
- "Yes, apply all improvements" → proceed to 7.2 with all improvements
- "Let me pick" → present improvements in batches of up to 4
  per `AskUserQuestion` call (same approach as Step 4 stale rules). For each
  improvement, options: Apply / Skip. Continue until all improvements are resolved.
  Then proceed to 7.2 with only approved improvements.
- "No, just save report" → no changes applied, **STOP**

**Do NOT apply any changes until the user answers.**

**7.2: Apply approved improvements**

For each approved improvement, determine the target:

**If the skill is a built-in `aif-*` skill** (its SKILL.md is inside the package `skills/` directory):

1. Create directory if needed:
   mkdir -p .ai-factory/skill-context/<skill-name>
2. If `.ai-factory/skill-context/<skill-name>/SKILL.md` doesn't exist — create it with the header template
3. If it exists — read it first, then for each improvement decide:
   - **Update existing rule** — when a rule on the same topic already exists (e.g., a null-check rule
     exists from 3 patches, and 5 new null-check patches arrived → strengthen the existing rule,
     update its Source list, adjust severity/wording based on new evidence)
   - **Add new rule** — when no existing rule covers this topic
   - **Merge rules** — when multiple narrow rules can be combined into one broader rule
     (e.g., three separate "check field X" rules → one "always null-check optional DB relations" rule)
4. Update the `> Last updated:` and `> Based on:` lines in the header
5. **NEVER edit any files inside the skill's `skills/aif-*/` directory** — all files there are owned by ai-factory and WILL be overwritten on update. All improvements go to skill-context only.
6. After applying all changes (including stale rule removals), if a skill-context file has no rules left
   (only the header remains), delete the file and its directory:
   `rm .ai-factory/skill-context/<skill-name>/SKILL.md`
   `rmdir .ai-factory/skill-context/<skill-name>` (only if empty)
7. Update the `> Based on:` count and `> Last updated:` in skill-context files that were
   only affected by stale rule removals (Step 4) but did NOT receive new improvements
   (those were already updated in item 4).

**If the skill is a custom/project skill** (not `aif-*`):
1. Edit the skill's `SKILL.md` directly (existing behavior, unchanged)

**Context file template:**

**IMPORTANT: All skill-context files MUST be written in English**, regardless of the user's language or the language used in patches/RULES.md. Skill-context rules are consumed by AI agents — English ensures consistent interpretation across all skills and sessions.

```
# Project Rules for /<skill-name>

> Auto-generated by `/aif-evolve`. Do not edit manually.
> Last updated: YYYY-MM-DD HH:mm
> Based on: N analyzed patches

## Rules

### [Rule Name]
**Source**: [patch filenames or "codebase convention"]
**Rule**: [Specific, actionable instruction in English]
```

**7.3: Save evolution log**

Create `<resolved evolutions dir>/YYYY-MM-DD-HH.mm.md`:

```bash
mkdir -p <resolved evolutions dir>
```

After saving the evolution log, update cursor state:

Definitions:
- "New patches processed" = patches with filename `>` `last_processed_patch`.
  - If no cursor exists (first run): "New patches" is the full patch list.
  - Overlap patches do NOT count as "New patches".
- "Improvements applied" = at least one approved improvement was written to disk
  (skill-context updated and/or custom skill SKILL.md edited).

Cursor update rules:

1. If no new patches were processed, keep cursor unchanged.
2. If new patches were processed:
   - If improvements were applied: advance the cursor to the newest "New patch" filename.
   - If no improvements were applied (e.g., user chose "No, just save report" or skipped all):
     - Do NOT advance cursor by default.
     - Ask the user whether to advance cursor anyway.
       - Recommended: keep cursor unchanged to allow reruns (LLMs may miss prevention points).
       - If the user explicitly chooses to advance anyway, write the cursor as usual.
3. If execution fails before changes are finalized, do not advance cursor.

```markdown
# Evolution: YYYY-MM-DD HH:mm

## Intelligence Summary
- Patches analyzed: X
- Recurring patterns: [list]
- Tech stack: [from DESCRIPTION.md]

## Improvements Applied

### [skill-name] → skill-context
- [change description] ← driven by patches: [patch filenames]
  **File:** `.ai-factory/skill-context/[skill-name]/SKILL.md`

### [skill-name] → SKILL.md (custom skill)
- [change description] ← driven by: [tech stack / convention]
  **File:** `skills/[skill-name]/SKILL.md`

## Patterns Identified
- [pattern]: [frequency] occurrences
- [pattern]: [frequency] occurrences
```

### Step 8: Suggest Next Actions

```
## Evolution Complete

Skills improved: X
Improvements applied: Y

### Recommendations

1. **Run `/aif-review`** on recent code to verify improvements
2. **Next evolution** — run `/aif-evolve` again after 5-10 more fixes
3. **Consider new skill** — if pattern X keeps recurring, create a dedicated skill:
   `/aif-skill-generator <skill-name>`
```

### Context Cleanup

## Artifact Ownership

- Primary ownership: `.ai-factory/skill-context/*`, `<resolved evolutions dir>/*.md`, and `<resolved evolutions dir>/patch-cursor.json`.
- Config use is partial here: `config.yaml` resolves description, rules, patches, and evolution-log paths, but skill-context remains a fixed AI Factory internal path.
- Read-only context: roadmap, rules, research, and plan artifacts unless the user explicitly requests otherwise.

After completing evolution, suggest `/clear` or `/compact` — context is heavy after patch analysis and skill processing.

## Rules

1. **Traceable** — every improvement must link to a patch, convention, or tech fact
2. **Minimal** — add rules to skill-context, don't rewrite base skills
3. **Reversible** — user approves before changes are applied
4. **Cumulative** — each evolution builds on previous ones
5. **No hallucination** — only suggest improvements backed by evidence
6. **Preserve structure** — don't change base skill workflow, only enrich via skill-context
7. **Skill-context only** — all improvements for built-in `aif-*` skills go to `.ai-factory/skill-context/`, never to `skills/aif-*/`. **NEVER edit any files inside `skills/aif-*/`** — they are overwritten on update. No exceptions.
8. **English only** — all skill-context files must be written in English, regardless of user's language
9. **No generic advice** — "write clean code" is not an improvement; only project-specific enhancements
10. **No new skills** — suggest `/aif-skill-generator` instead
11. **No losing coverage** — do not remove rules unless they are stale (Steps 3-4).
    Merges in Step 7 (combining narrow rules into a broader one) are allowed as long
    as all prevention points are preserved in the merged rule.
12. **Installed only** — do not evolve skills not installed in the project
13. **Ownership boundary** — this command owns `<resolved evolutions dir>/*.md`, `<resolved evolutions dir>/patch-cursor.json`, and `.ai-factory/skill-context/*`; treat roadmap/rules/research/plan artifacts as read-only context unless explicitly asked

## Example

```
/aif-evolve fix

→ Found 6/10 patches tagged #null-check
→ Improvement for /aif-fix (2 rules):
  Target: .ai-factory/skill-context/aif-fix/SKILL.md
  1. "PRIORITY CHECK: Look for optional/nullable fields accessed
      without null guards. This is the #1 source of bugs in this project."
  2. "When fixing nullable relation errors, check ALL usages of that
      relation in the same file — same bug often repeats nearby."
```
