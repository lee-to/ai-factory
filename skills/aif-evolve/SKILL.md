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

## Workflow

### Step 0: Load Context

**Read `.ai-factory/DESCRIPTION.md`** to understand:
- Tech stack
- Architecture
- Conventions

### Step 1: Collect Intelligence

**1.1: Read all patches**

```
Glob: .ai-factory/patches/*.md
```

Read every patch. For each one, extract:
- **Problem category** (null-check, async, validation, types, API, DB, etc.)
- **Root cause pattern** (what class of mistake was made)
- **Prevention rule** (what should be done differently)
- **Tags**

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

### Step 2: Read Current Skills

**Determine which skills to evolve:**

- If `$ARGUMENTS` contains a specific skill name → evolve only that skill
- If `$ARGUMENTS` is "all" or empty → evolve all installed skills
- **ALWAYS exclude `aif-*` skills** — skills matching the `aif-*` pattern are managed by AI Factory and will be overwritten on upgrade. Never read, analyze, or modify them during evolution.

**Read each target skill's SKILL.md:**

```
Glob: {{skills_dir}}/*/SKILL.md
```

**Skip any skill whose directory name starts with `aif-`** (e.g., `aif-evolve`, `aif-fix`, `aif-plan`, `aif-review`). Do NOT read, analyze, or modify these files — they are managed by AI Factory.

If skills are not installed yet (no `{{skills_dir}}/`), read from source:
```
Glob: skills/*/SKILL.md
```

Same rule applies: **skip any `aif-*` directories**.

### Step 3: Analyze Gaps

For each skill, identify what's missing based on collected intelligence:

**3.1: Patch-driven gaps**

Compare patch patterns against skill instructions:
- Does the skill mention the most common error categories from patches? If not → add them
- Does the skill warn about the pitfalls found in patches? If not → add guards
- Does the skill include logging/validation requirements for problem areas? If not → enhance
- Does the skill check for the patterns that caused bugs? If not → add checklist items

**3.2: Tech-stack gaps**

Compare project tech stack against skill instructions:
- Skills reference generic patterns but project uses specific framework? → Add framework-specific guidance
- Project uses TypeScript but skills show JS examples? → Update examples
- Project uses specific ORM (Prisma, Eloquent)? → Add ORM-specific patterns

**3.3: Convention gaps**

Compare project conventions against skill instructions:
- Project has specific error handling pattern? → Skills should enforce it
- Project uses specific logger? → Skills should reference it
- Project has specific file structure? → Skills should follow it

### Step 4: Generate Improvements

For each gap found, create a concrete improvement:

```markdown
## Improvement: [skill-name]

### What
[Specific change to make]

### Why
[Which patches/patterns drove this change]

### Where
[Exact section in SKILL.md to modify]

### Change
[The actual text to add/modify]
```

**Quality rules for improvements:**
- Each improvement must be traceable to a patch, convention, or tech-stack fact
- No generic advice — only project-specific enhancements
- Improvements must be minimal and focused — don't rewrite entire skills
- Preserve existing skill structure — add, don't replace

### Step 5: Present & Apply

**5.1: Present improvements to user**

```
## Skill Evolution Report

Based on:
- X patches analyzed
- Y recurring patterns found
- Z tech-stack specific insights

### Proposed Improvements

#### /my-fix-skill
1. **Add null-check guard** — 5 patches involved null references
   → Add to Step 2: "Check for optional/nullable fields before accessing nested properties"

2. **Add async/await pattern** — 3 patches involved unhandled promises
   → Add to Important Rules: "Always use try/catch with async/await"

#### /my-codegen-skill
1. **Add ORM-specific warning** — 2 patches from incorrect queries
   → Add to Logging: "Log all ORM queries in DEBUG mode"

#### /my-review-skill
1. **Add checklist item** — optional chaining not checked
   → Add to Correctness: "Optional chaining for nullable relations"

Apply these improvements?
- [ ] Yes, apply all
- [ ] Let me pick which ones
- [ ] No, just save the report
```

**5.2: Apply approved improvements**

For each approved improvement:
1. Read the target SKILL.md
2. Apply the change using `Edit`
3. Keep changes minimal and surgical

**5.3: Save evolution log**

Create `.ai-factory/evolutions/YYYY-MM-DD-HH.mm.md`:

```bash
mkdir -p .ai-factory/evolutions
```

```markdown
# Evolution: YYYY-MM-DD HH:mm

## Intelligence Summary
- Patches analyzed: X
- Recurring patterns: [list]
- Tech stack: [from DESCRIPTION.md]

## Improvements Applied

### [skill-name]
- [change description] ← driven by patches: [patch filenames]

### [skill-name]
- [change description] ← driven by: [tech stack / convention]

## Patterns Identified
- [pattern]: [frequency] occurrences
- [pattern]: [frequency] occurrences
```

### Step 6: Suggest Next Actions

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

Context is heavy after reading all patches and skills. All improvements are saved — suggest freeing space:

```
AskUserQuestion: Free up context before continuing?

Options:
1. /clear — Full reset (recommended)
2. /compact — Compress history
3. Continue as is
```

## Important Rules

1. **Traceable** — every improvement must link to a patch, convention, or tech fact
2. **Minimal** — add rules, don't rewrite skills
3. **Reversible** — user approves before changes are applied
4. **Cumulative** — each evolution builds on previous ones
5. **No hallucination** — only suggest improvements backed by evidence
6. **Preserve structure** — don't change skill workflow, only enrich it

## Examples

### Example 1: After 10 fixes with null-reference patterns

```
/aif-evolve my-fix-skill

→ Found 6/10 patches tagged #null-check
→ Improvement: Add to /my-fix-skill Step 2:
  "PRIORITY CHECK: Look for optional/nullable fields accessed
   without null guards. This is the #1 source of bugs in this project."
→ Improvement: Add to /my-review-skill checklist:
  "- [ ] All nullable DB fields have null checks in UI/API layer"
```

### Example 2: Laravel project with N+1 issues

```
/aif-evolve all

→ Stack: Laravel + Eloquent (from DESCRIPTION.md)
→ Found 3 patches tagged #n-plus-one #database
→ Improvement: Add to /my-codegen-skill logging:
  "Enable query logging: DB::enableQueryLog() in DEBUG mode"
→ Improvement: Add to /my-review-skill checklist:
  "- [ ] Eager loading used for related models (no N+1)"
→ Improvement: Add to /my-planning-skill descriptions:
  "Include 'use ->with() for relations' in DB-related tasks"
```

### Example 3: First run with no patches

```
/aif-evolve

→ No patches found (first run)
→ Analyzing project context only...
→ Stack: Next.js 14 + Prisma + TypeScript
→ Improvement: Add to /my-codegen-skill:
  "Use server actions for mutations, API routes for external APIs"
→ Improvement: Add to /my-fix-skill:
  "For Prisma errors, check schema.prisma for field types first"
→ Improvement: Add to /my-review-skill:
  "- [ ] Server components don't use client-only hooks"
```

## DO NOT:
- Do not rewrite entire skills
- Do not remove existing rules
- Do not add generic advice ("write clean code")
- Do not create new skills (suggest using `/aif-skill-generator` instead)
- Do not apply changes without user approval
- Do not evolve skills not installed in the project
- Do not touch `aif-*` skills — they are managed by AI Factory and reset on upgrade
