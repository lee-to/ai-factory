---
name: aif-rules
description: Add project-specific rules and conventions to the configured RULES.md artifact. Each invocation appends new rules. These rules are automatically loaded by /aif-implement before execution. Use when user says "add rule", "remember this", "convention", or "always do X".
argument-hint: "[rule text or topic]"
allowed-tools: Read Write Edit Glob Grep AskUserQuestion Questions
disable-model-invocation: true
---

# AI Factory Rules - Project Conventions

Add short, actionable rules and conventions for the current project. Rules are saved to the configured RULES.md artifact (default: `.ai-factory/RULES.md`) and automatically loaded by `/aif-implement` before task execution.

## Rules Hierarchy

AI Factory supports a three-level rules hierarchy:

1. **RULES.md** - Axioms (universal project rules)
   - Managed by this skill (`/aif-rules`)
   - Short, flat list of hard requirements
   - Loaded by all skills

2. **rules/base.md** - Project-specific base conventions
   - Created by `/aif` during project setup
   - Naming conventions, module boundaries, error handling patterns
   - Auto-detected from codebase analysis

3. **rules.<area>** - Area-specific conventions
   - Created by this skill (Mode C)
   - Registered in `.ai-factory/config.yaml` as named keys such as `rules.api`
   - Area-specific patterns and constraints

**Priority:** More specific rules win. `rules.<area>` > `rules/base.md` > `RULES.md`

## Workflow

### Step 0: Load Config

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:
- **Paths:** `paths.rules_file` and `paths.rules`
- **Language:** `language.ui` for prompts

If config.yaml doesn't exist, use defaults:
- RULES.md: `.ai-factory/RULES.md`
- rules/: `.ai-factory/rules/`
- Language: `en` (English)

### Step 0.1: Load Skill Context

**Read `.ai-factory/skill-context/aif-rules/SKILL.md`** - MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**
- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority - same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults -
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill - including the RULES.md
  format and rule formulation. If a skill-context rule says "rules MUST follow format X" or
  "RULES.md MUST include section Y" - you MUST comply. Generating rules that violate skill-context
  is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated - fix the output before presenting it to the user.

### Step 1: Determine Mode

```text
Check $ARGUMENTS:
- Starts with "area:" or "area "? -> Mode C: Area rules
- Has text? -> Mode A: Direct add
- No arguments? -> Mode B: Interactive
```

### Mode A: Direct Add

User provided rule text as argument:

```text
/aif-rules Always use DTO classes instead of arrays
```

Skip to Step 2 with the provided text as the rule.

### Mode B: Interactive

No arguments provided:

```text
/aif-rules
```

Ask via AskUserQuestion:

```text
What rule or convention would you like to add?

Examples:
- Always use DTO classes instead of arrays for data transfer
- Routes must use kebab-case
- All database queries go through repository classes
- Never use raw SQL, always use the query builder
- Log every external API call with request/response
```

### Mode C: Area Rules

User wants to create or update area-specific rules:

```text
/aif-rules area:api
/aif-rules area frontend
```

**Workflow:**

1. **Parse area name** from argument (e.g., `api`, `frontend`, `backend`, `database`)

2. **Resolve the area file path** inside the configured rules directory.
   Default: `.ai-factory/rules/<area>.md`

3. **Check if area file exists:**
   ```text
   Glob: <resolved rules dir>/<area>.md
   ```

4. **If file does NOT exist** -> create it with header:

   ```markdown
   # <Area> Rules

   > Area-specific conventions for <area>. Loaded after rules/base.md.

   ## Rules

   - [first rule]
   ```

5. **If file exists** -> ask user what rule to add:

   ```text
   AskUserQuestion: What rule would you like to add to <area>.md?

   Current rules in <area>.md:
   - [existing rule 1]
   - [existing rule 2]

   Options:
   1. Add new rule - specify below
   2. View full file
   3. Cancel
   ```

6. **Append rule** using `Edit` at the end of the `## Rules` section.

7. **Register the area in `.ai-factory/config.yaml`:**
   - Ensure `rules.<area>` points to the resolved area rules file path
   - If `config.yaml` does not exist yet, create a minimal config scaffold using defaults plus the new `rules.<area>` entry
   - Preserve existing `rules.base` and any other named `rules.<other-area>` entries

8. **Confirm:**
   ```text
   Rule added to <resolved area rules file> and registered as `rules.<area>` in config.yaml:

   - [the rule]

   Total <area> rules: [count]
   ```

9. **STOP after Mode C completes.**
   - Do **not** continue to Step 2 / Step 3 / Step 4 below.
   - Those steps apply only to top-level axioms rules in the resolved `paths.rules_file` artifact.
   - Area rules belong only in `<resolved rules dir>/<area>.md` plus the matching `rules.<area>` registration in `config.yaml`.

**Common areas:**
- `api` - REST/GraphQL API conventions
- `frontend` - UI components, state management
- `backend` - Services, business logic
- `database` - Queries, migrations, schemas
- `testing` - Test patterns, coverage
- `security` - Auth, validation, sanitization

### Step 2: Read or Create RULES.md

**Check if the resolved RULES.md path exists:**

```text
Glob: <resolved RULES.md path>
```

**If file does NOT exist** -> create it with the header and first rule:

```markdown
# Project Rules

> Short, actionable rules and conventions for this project. Loaded automatically by /aif-implement.

## Rules

- [new rule here]
```

**If file exists** -> read it, then append the new rule at the end of the rules list.

### Step 3: Write Rule

Use `Edit` to append the new rule as a `- ` list item at the end of the `## Rules` section.

**Formatting rules:**
- Each rule is a single `- ` line
- Keep rules short and actionable (one sentence)
- No categories, headers, or sub-lists - flat list only
- No duplicates - if rule already exists (same meaning), tell user and skip
- If user provides multiple rules at once (separated by newlines or semicolons), add each as a separate line

### Step 4: Confirm

```text
Rule added to <resolved RULES.md path>:

- [the rule]

Total rules: [count]
```

## Rules

1. **One rule per line** - flat list, no nesting
2. **No categories** - keep it simple, no headers inside the rules section
3. **No duplicates** - check for existing rules with the same meaning before adding
4. **Actionable language** - rules should be clear directives ("Always...", "Never...", "Use...", "Routes must...")
5. **RULES.md location** - use the resolved `paths.rules_file` path (default: `.ai-factory/RULES.md`)
6. **Area registration** - every area rules file must be mirrored in `config.yaml` as `rules.<area>`
7. **Ownership boundary** - this command owns the configured RULES.md artifact and may update the `rules.*` subset of `.ai-factory/config.yaml`; other context artifacts stay read-only unless explicitly requested by the user
