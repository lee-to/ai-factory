---
name: aif-rules
description: Add project-specific rules and conventions to .ai-factory/RULES.md. Each invocation appends new rules. These rules are automatically loaded by /aif-implement before execution. Use when user says "add rule", "remember this", "convention", or "always do X".
argument-hint: "[rule text or topic]"
allowed-tools: Read Write Edit Glob Grep AskUserQuestion Questions
disable-model-invocation: true
---

# AI Factory Rules - Project Conventions

Add short, actionable rules and conventions for the current project. Rules are saved to `.ai-factory/RULES.md` and automatically loaded by `/aif-implement` before task execution.

## Workflow

### Step 0: Load Skill Context

**Read `.ai-factory/skill-context/aif-rules/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**
- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including the RULES.md
  format and rule formulation. If a skill-context rule says "rules MUST follow format X" or
  "RULES.md MUST include section Y" — you MUST comply. Generating rules that violate skill-context
  is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

### Step 1: Determine Mode

```
Check $ARGUMENTS:
├── Has text? → Mode A: Direct add
└── No arguments? → Mode B: Interactive
```

### Mode A: Direct Add

User provided rule text as argument:

```
/aif-rules Always use DTO classes instead of arrays
```

→ Skip to Step 2 with the provided text as the rule.

### Mode B: Interactive

No arguments provided:

```
/aif-rules
```

→ Ask via AskUserQuestion:

```
What rule or convention would you like to add?

Examples:
- Always use DTO classes instead of arrays for data transfer
- Routes must use kebab-case
- All database queries go through repository classes
- Never use raw SQL, always use the query builder
- Log every external API call with request/response

> ___
```

### Step 2: Read or Create RULES.md

**Check if `.ai-factory/RULES.md` exists:**

```
Glob: .ai-factory/RULES.md
```

**If file does NOT exist** → create it with the header and first rule:

```markdown
# Project Rules

> Short, actionable rules and conventions for this project. Loaded automatically by /aif-implement.

## Rules

- [new rule here]
```

**If file exists** → read it, then append the new rule at the end of the rules list.

### Step 3: Write Rule

Use `Edit` to append the new rule as a `- ` list item at the end of the `## Rules` section.

**Formatting rules:**
- Each rule is a single `- ` line
- Keep rules short and actionable (one sentence)
- No categories, headers, or sub-lists — flat list only
- No duplicates — if rule already exists (same meaning), tell user and skip
- If user provides multiple rules at once (separated by newlines or semicolons), add each as a separate line

### Step 4: Confirm

```
✅ Rule added to .ai-factory/RULES.md:

- [the rule]

Total rules: [count]
```

## Rules

1. **One rule per line** — flat list, no nesting
2. **No categories** — keep it simple, no headers inside the rules section
3. **No duplicates** — check for existing rules with the same meaning before adding
4. **Actionable language** — rules should be clear directives ("Always...", "Never...", "Use...", "Routes must...")
5. **RULES.md location** — always `.ai-factory/RULES.md`, create `.ai-factory/` directory if needed
