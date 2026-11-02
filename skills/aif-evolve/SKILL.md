---
name: aif-evolve
description: Self-improve AI Factory skills based on project context, accumulated patches, and codebase patterns. Analyzes what went wrong, what works, and enhances skills to prevent future issues. Use when you want to make AI smarter for your project.
argument-hint: '[skill-name or "all"] [--global]'
allowed-tools: Read Write Edit Glob Grep Bash(git *) Bash(realpath *) AskUserQuestion Questions
disable-model-invocation: true
---

# Evolve - Skill Self-Improvement

## Runtime-aware questions

Apply this contract whenever the workflow asks the user to decide:

- `AskUserQuestion` and `Questions` below describe the intended interaction, not a required tool name. Use only a question tool actually exposed and permitted in the current session/mode, with its advertised schema. Do not guess aliases, probe unavailable tools, or assume `questionnaire` exists. A frontmatter entry alone does not make a tool available.
- Ask one focused question at a time with clearly labelled options. Batch independent questions only if the actual tool schema supports it; respect its field names, limits, and selection semantics. For open-ended input, use native free-text support or plain text if the schema cannot represent the question. Use the resolved UI language.
- If no usable question tool exists (or it reports unavailable in this mode), ask the same question in plain text with numbered options and allow a free-text answer. Pause work that depends on that answer; independent read-only investigation may continue. Missing UI does not make the session autonomous.
- An empty/cancelled response, a preselected option, or elapsed time is not an answer or approval. Reuse an answer already given in the session instead of asking again.
- In a subagent/background run or explicit non-interactive mode (including `HANDOFF_MODE=1`), do not prompt the user directly. Use declared defaults only for optional preferences within the authorized scope and report assumptions. If a required decision, approval, or material scope/behavior choice remains unresolved, stop dependent work and return the missing decision and options to the parent/caller using its existing blocked/failure contract. Never invent consent or select a new scope to avoid blocking.

This delivery policy applies to this skill and its linked references. Preserve workflow-specific question scope, required confirmations, approval boundaries, and blocked-result rules.

## Shared project skill-context

Before mode routing or work, read existing files relative to the current project root in this order (reuse them if already loaded):

1. `.ai-factory/skill-context/global-skill-context.md` — all bundled skills.
2. `.ai-factory/skill-context/aif-evolve/SKILL.md` — this skill.

Missing files are skipped; an existing unreadable file stops dependent work with its path.
Precedence: individual > build (when applicable) > global > skill defaults; retain non-conflicting instructions and check all outputs against the effective rules.
These layers customize workflow; they do not replace the project's rules/architecture hierarchy or relax explicit requirements, ownership, scope, safety/privacy, validation, or approval boundaries. Report conflicts with those boundaries instead of overriding them.
`global` is a project-local layer, not home-directory configuration. Custom/extension skills do not automatically use it.

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

## Critical: Respect Skill Ownership

Never edit AI Factory built-in or extension-managed skill files directly. Ownership
comes from the resolved path and installation provenance, never an `aif-*` name.
Project built-in improvements go only to approved files under `.ai-factory/skill-context/`.
User-owned skills may be edited at their verified entrypoint after validation and
approval. Global skills require explicit `--global`; managed global skills are skipped.

## Workflow

### Step 0: Resolve Target & Load Context

#### Step 0.1: Resolve Target

Read `references/TARGET-OWNERSHIP.md` and follow its argument parsing, canonical
scope checks, ownership classification, and failure handling before continuing.
Freeze the eligible target records (name, scope, canonical base entrypoint, owner
and evidence, exact write destination). Show any skipped targets and reasons.

- Empty arguments or `all`: project scope only.
- `plan`: exact user-owned `plan` first, otherwise verified built-in `aif-plan`.
- `all --global` and `--global all`: user-global scope only; identical selection.
- No eligible targets: report why and stop without changing rules, logs, or cursor.

Do not infer ownership or repeat target discovery in later steps. For a delegated
`/aif-transfer` run, keep project scope and transfer's narrower write allowlist;
`--global` and direct skill edits are not available through transfer.

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

Read [references/SHARED-CONTEXT.md](references/SHARED-CONTEXT.md) before target-context
analysis. Follow its consumer resolution, destination selection, shared stale-rule
checks, and consolidation policy throughout Steps 3–7. No shared file is created
or migrated automatically; existing individual contexts remain valid.

**THEN:** Read `.ai-factory/DESCRIPTION.md` (use path from config) to understand:
- Tech stack
- Architecture
- Conventions

**Also read `.ai-factory/ARCHITECTURE.md`** (use path from config) and the configured rules hierarchy when present. This context informs convention analysis and gap detection but does not change artifact ownership.

**Read all applicable layers for the frozen eligible project built-in records only**, plus
`.ai-factory/skill-context/aif-evolve/SKILL.md` once for evolve's own rules, when present.
Do not load unrelated same-name contexts for custom or global targets. Evolve's own
project context applies in either scope; it cannot grant permission to edit another scope.
These files contain previously accumulated project-specific rules for built-in skills.
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

Skill-context cannot authorize another scope, managed-file edits, or bypass validation/approval.

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

Read only the canonical base entrypoints from the frozen eligible target records.
Do not glob skills again, switch installed/source copies, or read a same-name skill
from another scope. A flat workflow entrypoint is the base instructions for that target.

Keep loaded SKILL.md content in memory — Step 3 needs it for comparison (do NOT re-read).

### Step 3: Check for Stale Rules in Skill-Context

**When:** Run this step only for **project built-in target records** with applicable context.
Shared rules require the complete frozen consumer set from `SHARED-CONTEXT.md`;
named or incomplete selections may report shared conflicts but cannot change shared files.

**For each rule in the applicable global, build, and individual layers:**

**Scope constraint:** Step 3 can ONLY modify or remove skill-context files.
It must NEVER propose editing, deleting, or reverting managed base files.
Recheck the frozen context destination and canonical project containment before deletion.
Even if the base file contains errors or incomplete rules — that is outside evolve's scope.

1. Use the base `SKILL.md` already loaded in Step 2 (do NOT re-read the file).
   For a shared rule, evaluate every consumer independently; one covered consumer
   does not justify shared deletion. Preserve the rule for every uncovered consumer.
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
Never propose editing, deleting, or reverting managed base files —
they are outside of evolve's scope.

Before collecting decisions, explain that Rewrite/Narrow queues a candidate for
Step 6.5 and may be postponed when execution or evidence is unavailable. The existing
rule remains active until the exact replacement reaches `accept` and is approved.
For a conflicting rule, explicitly state that the conflict remains active while the
replacement is pending. Keep/Remove retain their existing behavior.

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

Collect stale rule choices in logical batches of up to 3 independent decisions.
Deliver each batch under Runtime-aware questions: use native batching only when
the actual tool supports it; otherwise ask individually or in plain text.

- Present first batch (up to 3 stale rules) → `AskUserQuestion`
- Get answers → apply keep/remove decisions; queue rewrites/narrowing as exact candidates for Step 6.5
- If more stale rules remain → present next batch → `AskUserQuestion`
- Repeat until all stale rules are resolved

**Do NOT proceed to Step 5 until all stale rule decisions are collected.**
Apply keep/remove decisions first. Rewrites remain unapplied until comparison in
Step 6.5 and approval in Step 7; track them so gap analysis does not duplicate them.

### Step 5: Analyze Gaps

**Before analyzing gaps:** re-read skill-context files for target skills that were
modified in Step 4 (stale rule removals; rewrites are still queued). Do NOT use the version loaded
in Step 0.2 — it is outdated after Step 4 changes.

For each eligible target record, consider its base instructions AND its **current**
project built-in skill-context when applicable (none for custom/global targets)
(after stale rule decisions from Step 4 have been applied).
A gap only exists if neither the base nor any applicable context layer covers it.

For each skill, identify what's missing based on collected intelligence:

**5.1: Patch-driven gaps (prevention-point-exhaustive)**

**CRITICAL: Check each prevention point × each target skill independently.**

Iterate over the Prevention Point Registry built in Step 1.1. For each row:
1. For EACH target skill listed in that row, use only its frozen eligible target record.
   If it is outside this run's selection/scope or was skipped, mark it out of scope;
   do not discover a new target or create a candidate for it.
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

Choose its destination using `SHARED-CONTEXT.md`: individual by default; build or
global only with a complete verified consumer set in project `all` mode. Freeze
shared destinations and consumer records before comparison or approval. The same
rule in several files is a consolidation candidate, not permission to migrate it.

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

### Step 6.5: Validate Rule Candidates

Before presenting changes for approval, read
[references/CANDIDATE-VALIDATION.md](references/CANDIDATE-VALIDATION.md).
Use its card and comparison procedure for every added, rewritten, or merged rule,
including queued stale-rule rewrites. A candidate is a hypothesis, not an improvement yet.

- Freeze the current effective instructions (base + all applicable context layers) and the exact
  candidate change. Compare both versions on the same original problem and an explicit
  counterexample where the proposed rule must NOT apply.
- Reuse the project's scenario mechanism when available. Without a runnable evaluator
  or sufficient evidence, record `postpone` and the missing data; never substitute a
  predicted result for an observed run.
- Record per-case results, output evidence, extra cost, and regressions. Preserve
  `the new rule did not improve behavior` when observed, even if no rule is applied.
- Outcomes: `accept`, `narrow`, `refine`, `keep_old`, or `postpone`. Narrowed/refined
  text needs a new comparison before it can become `accept`.

Only `accept` candidates with demonstrated benefit and no detected regressions are
eligible for Step 7 approval. Validation does not authorize changing live instructions.
Evaluator commands may need execution permission beyond this skill's allowlist.
Reuse existing authorization; if required permission is unavailable, record `NOTRUN`
and `postpone` rather than widening the allowlist.

### Step 7: Present & Apply

**7.1: Present improvements to user**

Each improvement MUST explicitly state the target file path.
Include each candidate card, its comparison evidence, and its outcome in the report,
including non-accepted candidates. Separate validation outcome from the user's decision.
"Apply all" means only validated `accept` candidates, never untested proposals.
Use the following target labels:

- **`skill-context`** → exact frozen individual, build, or global path; list every affected consumer for shared changes
- **`User-owned skill`** → direct edit at the frozen canonical entrypoint, only for verified user-owned targets
- **Nested file** → if the skill directory contains additional files (e.g., `templates/`, `checklists/`),
  specify the exact canonical path within the verified user-owned skill directory; managed nested files remain read-only

Format:

```
## Skill Evolution Report

Based on:
- X patches analyzed
- Y recurring patterns found
- Z tech-stack specific insights

### Candidate Results

[One complete card per candidate/revision from references/CANDIDATE-VALIDATION.md,
including exact applicability, instruction diff, shared cases, comparison evidence,
cost, regressions, and outcome. Include negative and postponed results.]

### Eligible for Approval

| Candidate / revision | Target file | Demonstrated benefit | Extra cost |
|----------------------|-------------|----------------------|------------|
| <accepted revision> | <exact path> | <observed change> | <delta/units or UNKNOWN> |

### Not Eligible

[Candidate/revision, outcome, and next action; do not offer these for application.]
```

**After presenting the full report, use `AskUserQuestion` to collect decisions:**

For improvements — ask:
- Yes, apply all improvements
- Let me pick
- No, just save report (no changes applied)

**Based on choice:**
- "Yes, apply all improvements" → proceed to 7.2 with all improvements
- "Let me pick" → present improvements in logical batches of up to 4 independent
  decisions, delivered under Runtime-aware questions as in Step 4. For each
  improvement, options: Apply / Skip. Continue until all improvements are resolved.
  Then proceed to 7.2 with only approved improvements.
- "No, just save report" → skip 7.2; save all candidate outcomes in 7.3

If no candidate is eligible, present the outcomes and offer to save the report without
changing rules. Saving evaluation evidence does not mean approving a rule change.

**Do NOT apply any changes until the user answers.**

**7.2: Apply approved improvements**

For each approved improvement, use its frozen target record. Recheck canonical
containment and ownership evidence as required by `references/TARGET-OWNERSHIP.md`;
never choose a write destination from the skill name or prefix. Include scope, owner,
and exact output path in candidate approval and the saved log.

Apply only the exact validated text against the recorded baseline. If instructions
or cases changed since comparison, revalidate before applying. Updating or merging
rules is itself a candidate change; do not invent untested wording during this step.
For multiple approved rules, validate the exact combined change on the union of their
cases before applying; individual comparisons do not prove that the combination works.
On a batch regression or inconclusive run, keep active instructions unchanged and
refine or postpone the batch.

**If the target record is a project AI Factory built-in:**

For a frozen shared change record, apply only its approved exact file operations
and duplicate removals under `SHARED-CONTEXT.md`. Preserve originals on failure;
delete only an empty shared file, never its parent directory. Use the same header
format with the layer name and `Applies to:` consumers. The following directory
creation/cleanup instructions are for individual destinations only.

1. Create directory if needed:
   mkdir -p .ai-factory/skill-context/<skill-name>
2. If `.ai-factory/skill-context/<skill-name>/SKILL.md` doesn't exist — create it with the header template
3. If it exists — read it first and apply only the validated operation:
   - **Update existing rule** — when a rule on the same topic already exists (e.g., a null-check rule
     exists from 3 patches, and 5 new null-check patches arrived → strengthen the existing rule,
     update its Source list, adjust severity/wording based on new evidence)
   - **Add new rule** — when no existing rule covers this topic
   - **Merge rules** — when multiple narrow rules can be combined into one broader rule
     (e.g., three separate "check field X" rules → one "always null-check optional DB relations" rule)
4. Update the `> Last updated:` and `> Based on:` lines in the header
5. **NEVER edit any managed base or nested files.** All project built-in improvements go to the recorded skill-context destination only.
6. After applying all changes (including stale rule removals), if a skill-context file has no rules left
   (only the header remains), delete the file and its directory:
   `rm .ai-factory/skill-context/<skill-name>/SKILL.md`
   `rmdir .ai-factory/skill-context/<skill-name>` (only if empty)
7. Update the `> Based on:` count and `> Last updated:` in skill-context files that were
   only affected by stale rule removals (Step 4) but did NOT receive new improvements
   (those were already updated in item 4).

**If the target record is user-owned:**
1. Edit only the recorded canonical entrypoint or validated nested-file destination.
2. In global scope, approval must name the absolute path and explain that other
   projects using this skill will also receive the change.

Extension-managed, global built-in, unknown, and out-of-scope targets are never
eligible for writes, regardless of an "apply all" answer.

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
Use an unused filename suffix if this name already exists; do not overwrite prior evidence.
Save all candidate cards and outcomes, including `keep_old`, `postpone`, and observed
no-improvement results, even when zero improvements were applied (after report-save
approval in 7.1). Keep unaccepted instructions in the log, out of active skill-context.

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

## Candidate Validation
- [Full candidate cards from references/CANDIDATE-VALIDATION.md, with exact versions,
  shared cases, observed results/evidence or NOTRUN, cost, regressions, outcome,
  and user decision. Preserve negative and inconclusive results.]

## Improvements Applied

### [skill-name] → skill-context
- [change description] ← driven by patches: [patch filenames]
  **File:** `.ai-factory/skill-context/[skill-name]/SKILL.md`

### [skill-name] → user-owned skill ([project or global])
- [change description] ← driven by: [tech stack / convention]
  **File:** [exact canonical destination from target record]
  **Ownership evidence:** [verified source/record or explicit user confirmation]

## Patterns Identified
- [pattern]: [frequency] occurrences
- [pattern]: [frequency] occurrences
```

### Step 8: Suggest Next Actions

```
## Evolution Complete

Skills improved: X
Improvements applied: Y
Candidates: A accepted, B narrow/refine, C keep_old, D postponed
No-improvement and postponed results: [candidate IDs and reasons]

### Recommendations

1. **Run `/aif-review`** on recent code to verify improvements
2. **Next evolution** — run `/aif-evolve` again after 5-10 more fixes
3. **Consider new skill** — if pattern X keeps recurring, create a dedicated skill:
   `/aif-skill-generator <skill-name>`
```

### Context Cleanup

## Artifact Ownership

- Primary ownership: verified user-owned target files in the selected scope after validation/approval, `.ai-factory/skill-context/*`, `<resolved evolutions dir>/*.md`, and `<resolved evolutions dir>/patch-cursor.json`.
- Config use is partial here: `config.yaml` resolves description, rules, patches, and evolution-log paths, but skill-context remains a fixed AI Factory internal path.
- Read-only context: roadmap, rules, research, and plan artifacts unless the user explicitly requests otherwise.

After completing evolution, suggest `/clear` or `/compact` — context is heavy after patch analysis and skill processing.

## Rules

1. **Traceable** — every improvement must link to a patch, convention, or tech fact
2. **Minimal** — add targeted rules at the approved destination; preserve the skill workflow
3. **Reversible** — user approves before changes are applied
4. **Cumulative** — each evolution builds on previous ones
5. **No hallucination** — only suggest improvements backed by evidence
6. **Preserve structure** — enrich managed project skills only via skill-context; preserve user-owned skill structure
7. **Managed skills** — project built-in improvements go only to the recorded `.ai-factory/skill-context/` destination. Never edit package/extension-managed files; names do not establish ownership.
8. **English only** — all skill-context files must be written in English, regardless of user's language
9. **No generic advice** — "write clean code" is not an improvement; only project-specific enhancements
10. **No new skills** — suggest `/aif-skill-generator` instead
11. **No losing coverage** — do not remove rules unless they are stale (Steps 3-4).
    Merges in Step 7 (combining narrow rules into a broader one) are allowed as long
    as all prevention points are preserved in the merged rule.
12. **Selected scope only** — default to existing project skills; existing user-global skills require `--global`. No cross-scope fallback or installation.
13. **Ownership boundary** — write only frozen, verified user-owned destinations or project built-in skill-context, plus configured project logs/cursor. Treat roadmap/rules/research/plan artifacts as read-only context unless explicitly asked.
14. **Evidence before accumulation** — validate exact rule changes on the same cases and
    counterexamples before approval; retain no-improvement outcomes without adding rules.

## Example

Condensed illustration; actual reports use the complete candidate card from
[references/CANDIDATE-VALIDATION.md](references/CANDIDATE-VALIDATION.md).
This example records no observed execution result.

```text
/aif-evolve fix

Candidate C001 / revision 1 — Atomic related writes
Target: .ai-factory/skill-context/aif-fix/SKILL.md
Applicability: related database writes that must commit atomically
Original case: the second write fails after the first has succeeded
Control: an independent write with no multi-write atomicity requirement
Proposed instruction change: "Use a transaction for related writes that must commit atomically."
Comparison: NOTRUN — reproducible evaluator is unavailable
Extra cost: UNKNOWN
Outcome: postpone
Active instruction changes: none; keep the current version
Next evidence: paired original/control runs with output evidence and measured cost
User decision: pending; offer to save this report without applying the rule
```
