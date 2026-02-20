# Research/Exploration Skill Template

Use for codebase analysis, architecture review, pattern detection.

```yaml
---
name: {{SKILL_NAME}}
description: {{DESCRIPTION}}
context: fork
agent: Explore
user-invocable: false
metadata:
  author: {{AUTHOR}}
  version: "1.0"
---

# {{TITLE}}

Analyze $ARGUMENTS for {{ANALYSIS_GOAL}}.

## Analysis Steps

### 1. Discovery
- Find relevant files using Glob patterns
- Search for keywords with Grep
- Identify entry points

### 2. Analysis
- Read key files
- Map relationships
- Identify patterns

### 3. Evaluation
- Check against criteria
- Note issues
- Identify improvements

### 4. Report

Generate report with:

## Summary
Brief overview of findings.

## Findings
### Finding 1
- Location: file:line
- Description
- Recommendation

### Finding 2
- Location: file:line
- Description
- Recommendation

## Recommendations
1. Priority 1 recommendation
2. Priority 2 recommendation
3. Priority 3 recommendation
```
