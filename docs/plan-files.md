[← Skill Evolution](evolve.md) · [Back to README](../README.md) · [Security →](security.md)

# Plan Files

AI Factory uses markdown files to track implementation plans:

Paths below show the default `.ai-factory/` layout. `config.yaml` can relocate plan, fix, patch, reference, security, evolution, and loop-state artifacts while keeping the same ownership.

| Source | Plan File | After Completion |
|--------|-----------|------------------|
| `/aif-plan fast` | `paths.plan` (default: `.ai-factory/PLAN.md`) | Offer to delete |
| `/aif-plan full` | `paths.plans/<branch-or-slug>.md` | Keep (user decides) |

## Artifact Ownership Quick Map

To avoid ownership conflicts, artifact writers are command-scoped:

| Artifact                                                                  | Primary owner command | Notes                                                                                          |
|---------------------------------------------------------------------------|-----------------------|------------------------------------------------------------------------------------------------|
| `.ai-factory/DESCRIPTION.md`                                              | `/aif`                | `/aif-implement` may update only when implementation context actually changed                  |
| `.ai-factory/ARCHITECTURE.md`                                             | `/aif-architecture`   | `/aif-implement` may update structure notes when implementation changes structure              |
| `.ai-factory/ROADMAP.md`                                                  | `/aif-roadmap`        | `/aif-implement` may mark completed milestones with evidence                                   |
| `paths.rules_file` (default: `.ai-factory/RULES.md`), `paths.rules/<area>.md`, `rules.<area>` | `/aif-rules` | top-level conventions plus area-rule files and registration                         |
| `.ai-factory/RESEARCH.md`                                                 | `/aif-explore`        | explore-mode writable artifact                                                                 |
| `paths.plan` and `paths.plans/<branch-or-slug>.md`                        | `/aif-plan`           | defaults shown; `/aif-improve` refines existing plans                                          |
| `paths.fix_plan` and `paths.patches/*.md`                                 | `/aif-fix`            | defaults shown; actual paths come from `paths.fix_plan` and `paths.patches`                    |
| `.ai-factory/skill-context/*`                                             | `/aif-evolve`         | project-specific skill overrides derived from patches                                          |
| `paths.evolutions/*.md`, `paths.evolutions/patch-cursor.json`             | `/aif-evolve`         | defaults shown; actual evolution-log path comes from `paths.evolutions`                        |

Quality commands (`/aif-commit`, `/aif-review`, `/aif-verify`) treat these files as read-only context by default.

## Research File (Optional)

`.ai-factory/RESEARCH.md` is a persisted exploration artifact. Use it to capture constraints, decisions, and open questions during `/aif-explore` so you can `/clear` and still feed the same context into `/aif-plan`.

Typical structure:
- `## Active Summary (input for /aif-plan)` — compact, up-to-date snapshot
- `## Sessions` — append-only history (keep prior notes verbatim)

## Roadmap Linkage (Optional)

If `.ai-factory/ROADMAP.md` exists, `/aif-plan` may include a `## Roadmap Linkage` section in the plan file.
This makes milestone alignment explicit for `/aif-implement` completion marking and `/aif-verify` roadmap gates.

**Example plan file:**

```markdown
# Implementation Plan: User Authentication

Branch: feature/user-authentication
Created: 2024-01-15

## Settings
- Testing: no
- Logging: verbose
- Docs: yes          # /aif-implement shows mandatory docs checkpoint, then routes through /aif-docs

## Research Context (optional)
Source: .ai-factory/RESEARCH.md (Active Summary)
Goal: Add OAuth + email login
Constraints: Must support existing session middleware
Decisions: Use JWT for API auth
Open questions: Do we need refresh tokens?

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
/aif-fix → finds bug → fixes it → creates patch → /aif-evolve distills new patches into skill-context → smarter future runs
```

**How it works:**

1. `/aif-fix` fixes a bug and creates a patch file in `paths.patches/YYYY-MM-DD-HH.mm.md`
2. Each patch documents: **Problem**, **Root Cause**, **Solution**, **Prevention**, and **Tags**
3. `/aif-evolve` reads patches incrementally using `paths.evolutions/patch-cursor.json` (first run reads all)
4. Workflow skills (`/aif-implement`, `/aif-fix`, `/aif-improve`) prefer skill-context rules and use only limited recent patch fallback when needed

**Example patch** (`paths.patches/2026-02-07-14.30.md`):

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

**Periodic evolution** -- run `/aif-evolve` to analyze new patches and automatically improve skills:

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
