# Skill Development Best Practices

Guidelines for creating professional, maintainable skills.

## Design Principles

### 1. Single Responsibility
Each skill should do one thing well. If a skill does multiple unrelated things, split it.

Bad:
```yaml
name: utils
description: Various utilities for development
```

Good:
```yaml
name: format-json
description: Format and validate JSON files
```

### 2. Clear Invocation Model

Decide upfront:
- **User-only** (`disable-model-invocation: true`): Dangerous actions, side effects
- **Model-only** (`user-invocable: false`): Background knowledge, context
- **Both** (default): Safe, useful actions

### 3. Progressive Disclosure

```
SKILL.md (< 500 lines)
├── Essential instructions
├── Quick reference
└── Links to detailed docs

references/
├── REFERENCE.md (detailed API)
├── EXAMPLES.md (extensive examples)
└── FAQ.md (troubleshooting)
```

### 4. Fail Gracefully

Include error handling guidance:
```markdown
## Error Handling

If X fails:
1. Check Y
2. Verify Z
3. Fall back to W
```

## Description Writing

### Formula
```
[Action verb] [what it does]. [When to use it]. [Keywords for discovery].
```

### Examples

**Good descriptions:**
```yaml
# Clear action + when + keywords
description: Generates TypeScript interfaces from JSON Schema. Use when defining API contracts, creating type definitions, or converting schemas.

# Specific trigger conditions
description: Reviews pull request changes for security vulnerabilities, checking for injection attacks, authentication issues, and data exposure. Use when reviewing PRs or before merging code.

# Multiple use cases
description: Formats code according to project style guide. Use when cleaning up code, before commits, or when fixing linting errors.
```

**Bad descriptions:**
```yaml
# Too vague
description: Helps with code

# No "when to use"
description: Formats JSON files

# Too long, buried keywords
description: This skill is designed to help developers who are working with JSON files and need to format them properly according to the JSON specification while also validating the structure and providing helpful error messages when the JSON is invalid.
```

## Tool Permissions

### Be Specific
```yaml
# Bad: too broad
allowed-tools: Bash

# Good: specific commands
allowed-tools: Bash(git status) Bash(git diff *) Bash(npm test)
```

### Common Patterns
```yaml
# Read-only exploration
allowed-tools: Read Grep Glob

# Git operations
allowed-tools: Bash(git *)

# Build tools
allowed-tools: Bash(npm *) Bash(yarn *) Bash(pnpm *)

# Docker
allowed-tools: Bash(docker build *) Bash(docker push *)
```

## Argument Handling

### Single Argument
```yaml
argument-hint: [filename]
---
Process file: $ARGUMENTS
```

### Multiple Arguments
```yaml
argument-hint: [source] [target]
---
Convert $0 to $1 format
```

### Optional Arguments
```yaml
argument-hint: [path] [--verbose]
---
Analyze $0
Options: $ARGUMENTS
```

## Subagent Skills

### When to Use `context: fork`
- Long-running analysis
- Need isolation from conversation
- Heavy tool usage
- Research/exploration tasks

### Agent Selection
```yaml
# For exploration
context: fork
agent: Explore

# For planning
context: fork
agent: Plan

# For general tasks
context: fork
agent: general-purpose
```

## File Organization

### Small Skill
```
skill-name/
└── SKILL.md
```

### Medium Skill
```
skill-name/
├── SKILL.md
└── references/
    └── REFERENCE.md
```

### Large Skill
```
skill-name/
├── SKILL.md
├── references/
│   ├── REFERENCE.md
│   ├── API.md
│   └── EXAMPLES.md
├── scripts/
│   ├── main.py
│   └── helpers.py
├── templates/
│   └── output.md
└── assets/
    └── schema.json
```

## Testing Your Skill

### Manual Testing
1. Invoke with `/skill-name`
2. Invoke with arguments: `/skill-name arg1 arg2`
3. Let model invoke naturally
4. Test edge cases

### Validation
```bash
# Structure check
ls -la skill-name/

# Frontmatter validation
npx skills-ref validate ./skill-name

# Integration test
# Ask Claude to use the skill in various contexts
```

## Publishing Checklist

- [ ] Name follows convention (lowercase, hyphens)
- [ ] Description is clear and complete
- [ ] Body under 500 lines
- [ ] Supporting files organized
- [ ] Examples included
- [ ] Error handling documented
- [ ] Tested in multiple scenarios
- [ ] License specified (if sharing)
- [ ] Version in metadata

## Common Mistakes

### 1. Overly Broad Description
```yaml
# Bad
description: Helps with development tasks

# Good
description: Generates React components with TypeScript, tests, and Storybook stories
```

### 2. Missing Trigger Conditions
```yaml
# Bad
description: Analyzes code for issues

# Good
description: Analyzes code for issues. Use when reviewing code, debugging problems, or before commits.
```

### 3. Monolithic SKILL.md
```markdown
# Bad: 2000 lines in SKILL.md

# Good: Split into files
See [references/COMPLETE-GUIDE.md](references/COMPLETE-GUIDE.md) for full documentation.
```

### 4. Hardcoded Paths
```yaml
# Bad
Run: python /Users/me/skills/my-skill/scripts/run.py

# Good (relative from skill directory)
Run: python scripts/run.py
```

### 5. No Error Guidance
```yaml
# Bad
Run the command and check output.

# Good
Run the command. If it fails:
- Error X: Check Y
- Error Z: Verify W
```
