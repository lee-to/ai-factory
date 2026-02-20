# Agent Skills Specification Reference

Complete specification from https://agentskills.io/specification

## Directory Structure

```
skill-name/
├── SKILL.md          # Required: Main instructions
├── scripts/          # Optional: Executable code
├── references/       # Optional: Additional docs
└── assets/           # Optional: Static resources
```

## SKILL.md Format

### Required Frontmatter

```yaml
---
name: skill-name
description: A description of what this skill does and when to use it.
---
```

### All Frontmatter Fields

| Field | Required | Constraints |
|-------|----------|-------------|
| `name` | Yes | Max 64 chars, lowercase, hyphens only, no consecutive hyphens |
| `description` | Yes | Max 1024 chars, non-empty |
| `license` | No | License name or file reference |
| `compatibility` | No | Max 500 chars, environment requirements |
| `metadata` | No | Key-value pairs for custom data |
| `allowed-tools` | No | Space-delimited tool list |

### Claude Code Extensions

| Field | Description |
|-------|-------------|
| `argument-hint` | Shown in autocomplete: `[issue-number]` |
| `disable-model-invocation` | `true` = only user can invoke |
| `user-invocable` | `false` = only model can invoke |
| `context` | `fork` = run in subagent |
| `agent` | Subagent type: Explore, Plan, general-purpose |
| `model` | Model override: sonnet, opus, haiku |
| `hooks` | Lifecycle hooks configuration |

## Name Field Rules

Valid:
- `pdf-processing`
- `data-analysis`
- `code-review`

Invalid:
- `PDF-Processing` (uppercase)
- `-pdf` (starts with hyphen)
- `pdf--processing` (consecutive hyphens)
- `pdf_processing` (underscores)

## Description Best Practices

Good:
```yaml
description: Extracts text and tables from PDF files, fills PDF forms, and merges multiple PDFs. Use when working with PDF documents or when the user mentions PDFs, forms, or document extraction.
```

Bad:
```yaml
description: Helps with PDFs.
```

## Tool Specification Syntax

```yaml
# Basic tools
allowed-tools: Read Write Grep Glob

# Bash with patterns
allowed-tools: Bash(git *) Bash(npm run *) Bash(docker *)

# Combined
allowed-tools: Read Write Bash(git *) Bash(python scripts/*.py)
```

## String Substitutions

| Variable | Description |
|----------|-------------|
| `$ARGUMENTS` | All arguments passed to skill |
| `$ARGUMENTS[N]` | Argument by index (0-based) |
| `$N` | Shorthand for $ARGUMENTS[N] |
| `${CLAUDE_SESSION_ID}` | Current session ID |
| exclamation+backtick+cmd+backtick | Shell command output injection |

## Progressive Disclosure

Token budgets:
1. **Metadata** (~100 tokens): name + description loaded at startup
2. **Instructions** (<5000 tokens): Full SKILL.md when activated
3. **Resources** (as needed): Supporting files on demand

Keep SKILL.md under 500 lines.

## Validation Checklist

- [ ] `name` matches directory name
- [ ] `name` follows naming rules
- [ ] `description` is 1-1024 characters
- [ ] `description` explains what AND when
- [ ] Frontmatter YAML is valid
- [ ] Body under 500 lines
- [ ] File references are relative
- [ ] Scripts are executable
