# Dynamic Context Skill Template

Use for skills that need live data from external sources.

```yaml
---
name: {{SKILL_NAME}}
description: {{DESCRIPTION}}
context: fork
agent: {{AGENT_TYPE}}
allowed-tools: {{ALLOWED_TOOLS}}
metadata:
  author: {{AUTHOR}}
  version: "1.0"
---

# {{TITLE}}

## Live Context

The following data is fetched when this skill is invoked:

### Data Source 1
# Use: exclamation mark + backtick + command + backtick
# Example: (exclamation)(backtick)gh pr view(backtick)

### Data Source 2
# Replace with your command using dynamic syntax

### Data Source 3
# Replace with your command using dynamic syntax

## Task

Based on the context above, perform the following:

1. Step 1
2. Step 2
3. Step 3

## Output Format

Provide output in this format:

### Summary
Brief summary of findings.

### Details
Detailed analysis.

### Recommendations
1. Recommendation 1
2. Recommendation 2
```

---

## Common Dynamic Context Commands

The syntax is: exclamation mark + backtick + command + backtick

### GitHub Examples
```
gh pr view
gh pr diff
gh pr checks
gh issue view $0
gh issue list --limit 10
gh repo view
```

### Git Examples
```
git status --short
git log --oneline -10
git diff --stat
git branch --show-current
git remote -v
```

### System Examples
```
node --version
python --version
uname -a
cat package.json | jq '.name, .version'
```

Wrap any of these with the dynamic context syntax to inject output at skill load time.
