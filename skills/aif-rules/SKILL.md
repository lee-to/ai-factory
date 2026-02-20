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
