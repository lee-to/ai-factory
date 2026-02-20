[← Core Skills](skills.md) · [Back to README](../README.md) · [Security →](security.md)

# Plan Files

AI Factory uses markdown files to track implementation plans:

| Source | Plan File | After Completion |
|--------|-----------|------------------|
| `/aif-plan fast` | `.ai-factory/PLAN.md` | Offer to delete |
| `/aif-plan full` | `.ai-factory/plans/<branch-name>.md` | Keep (user decides) |

**Example plan file:**

```markdown
# Implementation Plan: User Authentication

Branch: feature/user-authentication
Created: 2024-01-15

## Settings
- Testing: no
- Logging: verbose
- Docs: yes          # /aif-implement will run /aif-docs after completion

## Commit Plan
- **Commit 1** (tasks 1-3): "feat: add user model and types"
- **Commit 2** (tasks 4-6): "feat: implement auth service"

## Tasks

### Phase 1: Setup
- [ ] Task 1: Create User model
- [ ] Task 2: Add auth types

### Phase 2: Implementation
- [x] Task 3: Implement registration
- [ ] Task 4: Implement login
```

## Self-Improvement Patches

AI Factory has a built-in learning loop. Every bug fix creates a **patch** — a structured knowledge artifact that helps AI avoid the same mistakes in the future.

```
/aif-fix → finds bug → fixes it → creates patch → next /aif-fix or /aif-implement reads all patches → better code
```

**How it works:**

1. `/aif-fix` fixes a bug and creates a patch file in `.ai-factory/patches/YYYY-MM-DD-HH.mm.md`
2. Each patch documents: **Problem**, **Root Cause**, **Solution**, **Prevention**, and **Tags**
3. Before any `/aif-fix` or `/aif-implement`, AI reads all existing patches
4. AI applies lessons learned — avoids patterns that caused bugs, follows patterns that prevented them

**Example patch** (`.ai-factory/patches/2026-02-07-14.30.md`):

```markdown
# Null reference in UserProfile when user has no avatar

**Date:** 2026-02-07 14:30
**Files:** src/components/UserProfile.tsx
**Severity:** medium

## Problem
TypeError: Cannot read property 'url' of undefined when rendering UserProfile.

## Root Cause
`user.avatar` is optional in DB but accessed without null check.

## Solution
Added optional chaining: `user.avatar?.url` with fallback.

## Prevention
- Always null-check optional DB fields in UI
- Add "empty state" test cases

## Tags
`#null-check` `#react` `#optional-field`
```

The more you use `/aif-fix`, the smarter AI becomes on your project. Patches accumulate and create a project-specific knowledge base.

**Periodic evolution** -- run `/aif-evolve` to analyze all patches and automatically improve skills:

```
/aif-evolve      # Analyze patches + project → improve all skills
```

This closes the full learning loop: **fix → patch → evolve → better skills → fewer bugs → smarter fixes**.

## Skill Acquisition Strategy

AI Factory follows this strategy for skills:

```
For each recommended skill:
  1. Search skills.sh: npx skills search <name>
  2. If found → Install: npx skills install --agent <agent> <name>
  3. Security scan → python3 security-scan.py <path>
     - BLOCKED? → remove, warn user, skip
     - WARNINGS? → show to user, ask confirmation
  4. If not found → Generate: /aif-skill-generator <name>
  5. Has reference docs? → Learn: /aif-skill-generator <url1> [url2]...
```

**Never reinvent existing skills** - always check skills.sh first. **Never trust external skills blindly** - always scan before use. When reference documentation is available, use **Learn Mode** to generate skills from real sources.

## See Also

- [Development Workflow](workflow.md) — how plan files fit into the development loop
- [Core Skills](skills.md) — full reference for `/aif-fix`, `/aif-evolve`, and other skills
- [Security](security.md) — how external skills are scanned before use
