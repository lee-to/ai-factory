# Task Skill Template

Use for specific workflows: deploy, commit, review, etc.

```yaml
---
name: {{SKILL_NAME}}
description: {{DESCRIPTION}}
disable-model-invocation: true
argument-hint: {{ARGUMENT_HINT}}
allowed-tools: {{ALLOWED_TOOLS}}
metadata:
  author: {{AUTHOR}}
  version: "1.0"
---

# {{TITLE}}

Execute {{TASK}} for $ARGUMENTS.

## Prerequisites

- Requirement 1
- Requirement 2

## Steps

### Step 1: Preparation
Description of preparation.

```bash
command
```

### Step 2: Execution
Description of execution.

```bash
command
```

### Step 3: Verification
Description of verification.

```bash
command
```

## Error Handling

### If X fails
1. Check Y
2. Verify Z
3. Fallback to W

### If A fails
1. Check B
2. Verify C

## Rollback

If something goes wrong:

```bash
rollback command
```
```
