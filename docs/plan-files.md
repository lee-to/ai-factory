[← Skill Evolution](evolve.md) · [Back to README](../README.md) · [Security →](security.md)

# Plan Files

AI Factory uses markdown files to track implementation plans:

Paths below show the default `.ai-factory/` layout. `config.yaml` can relocate plan, fix, patch, reference, security, evolution, and loop-state artifacts while keeping the same ownership.

| Source | Plan File | After Completion |
|--------|-----------|------------------|
| `/aif-plan fast` | `paths.plan` (default: `.ai-factory/PLAN.md`) | Offer to delete |
| `/aif-plan full` | `paths.plans/<stem>.md` (default; `stem` = Handoff branch → git branch → description slug, per `/aif-plan` Step 1.2.a) | Keep (user decides) |
| `/aif-plan full` (`workflow.plan_id_format: sequential`) | `paths.plans/<NNNN>_<stem>.md` (4-digit, capped at `9999`; `NNNN` is derived from existing numbered plans in the directory) | Keep (user decides) |

## Archive Lifecycle

When plans accumulate, `/aif-archive` moves completed plans to `paths.archive/plans/` (default: `.ai-factory/archive/plans/`):

```
paths.plans/<plan>.md  →  (all tasks [x])  →  paths.archive/plans/<plan>.md
```

- Original filenames are preserved (including sequential `NNNN_` prefix)
- An `archived: YYYY-MM-DD` field is added to the plan's YAML frontmatter
- Archived plans are excluded from plan discovery by `/aif-implement`, `/aif-verify`, `/aif-improve`
- Sequential numbering in `/aif-plan` only counts files in `paths.plans/`, not the archive

Roadmap snapshots: `/aif-archive --roadmap` trims closed milestones from `ROADMAP.md` into dated snapshots under `paths.archive/roadmap/`.

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
| `paths.archive/plans/*.md`, `paths.archive/roadmap/*.md`                  | `/aif-archive`        | archived plan files and dated roadmap snapshots                                                |

Quality commands (`/aif-commit`, `/aif-review`, `/aif-verify`) treat these files as read-only context by default.

## Artifact Metadata

`ai-factory audit-artifacts` reads lightweight YAML frontmatter from markdown artifacts. The schema is intentionally small: it gives teams enough traceability to catch broken links and stale downstream artifacts without requiring a full artifact-management system.

```markdown
---
id: spec-auth-login
type: spec
status: accepted
owners: [platform]
depends_on:
  - adr-auth-session
affects:
  - plan-auth-login
  - docs-auth
supersedes:
  - adr-auth-jwt
---
```

Supported fields:

| Field | Required | Meaning |
|-------|----------|---------|
| `id` | Yes | Stable unique identifier. Prefer lowercase kebab-case with a type prefix, for example `spec-auth-login`, `adr-auth-session`, `plan-password-reset`, `docs-api-auth`, or `tests-checkout-flow`. Keep it stable when files move. |
| `type` | Recommended | Artifact kind. Recommended values: `spec`, `requirement`, `plan`, `adr`, `architecture`, `roadmap`, `docs`, `tests`, `qa`, `code`, `rules`, `research`, `patch`. |
| `status` | Recommended | Lifecycle state. Recommended values: `draft`, `proposed`, `accepted`, `active`, `in_progress`, `done`, `deprecated`, `obsolete`, `superseded`. |
| `owners` / `owner` | Recommended | Team, role, or person responsible for review when the artifact is affected. Prefer team owners such as `platform`, `frontend`, `backend`, `security`, `infra`, `qa`, `docs`, or `product`. |
| `depends_on` | Optional | Upstream artifacts this artifact relies on. Use it when the current artifact cannot be safely changed without checking another artifact. `audit-artifacts` checks for unknown references and dependency cycles. |
| `affects` | Optional | Downstream artifacts that should be reviewed when this artifact changes. Use it to make PR impact review explicit. |
| `implements` | Optional | Requirements, specs, or decisions implemented by this artifact. Common for `code` and `plan` artifacts. |
| `verifies` | Optional | Requirements, specs, or decisions verified by this artifact. Common for `tests` and `qa` artifacts. |
| `documents` | Optional | Requirements, specs, or decisions described by this artifact. Common for `docs` artifacts. |
| `supersedes` | Optional | Older artifacts replaced by this artifact. Common for ADRs and specs. Mark the older artifact `status: superseded` when possible. |

Relationship guidance:

- `depends_on` points upstream: a plan may depend on a spec, an ADR, and architecture guidance.
- `affects` points downstream: a changed ADR may affect architecture, plans, tests, and docs that need review.
- `implements`, `verifies`, and `documents` provide reverse traceability for implementation, test, and documentation coverage.
- `supersedes` keeps history while making the newer source of truth explicit.

The command accepts scalar values, inline arrays, or YAML-style lists:

```markdown
depends_on: adr-auth-session
affects: [plan-auth-login, docs-auth]
verifies:
  - spec-auth-login
```

Run the audit locally before opening a PR:

```bash
ai-factory audit-artifacts
ai-factory audit-artifacts .ai-factory docs/requirements.md
ai-factory audit-artifacts --strict
ai-factory audit-artifacts --json
```

Default discovery scans `.ai-factory`, `docs`, `README.md`, and `AGENTS.md` when those paths exist. Recursive default discovery skips noisy or generated subdirectories such as `qa`, `evolution`, and `evolutions`; pass those paths explicitly when you want to audit them. This default is intentionally default-layout first; projects that relocate artifact directories through `config.yaml` should pass those paths explicitly until the command becomes config-aware.

Positional paths are explicit audit targets. Missing or outside-project explicit targets are failures so CI cannot pass after a typo or file rename. Missing default targets are skipped because many projects do not have every default file. Symlinked targets are canonicalized with `realpath`; a symlink that resolves outside the project is not scanned. For default targets this is a warning, and for explicit targets it is a failure.

Finding severity and exit behavior:

| Finding | Severity |
|---------|----------|
| Explicit missing or outside-project target | Fail |
| Duplicate `id` | Fail |
| Unknown relation target | Fail |
| Self-reference | Fail |
| `depends_on` cycle | Fail |
| Missing `type`, `status`, or `owner` / `owners` | Warn |
| Spec with no dependency/impact links | Warn |
| Spec without incoming `implements`, `verifies`, or `documents` coverage | Warn |
| Accepted ADR without `affects` links | Warn |
| Default symlink target resolving outside the project | Warn |

Exit codes:

- `pass` exits `0`.
- `warn` exits `0` by default.
- `fail` exits non-zero.
- `--strict` treats warnings as failures and exits non-zero.

`--json` is intended for CI or future PR automation. Its output shape is:

```json
{
  "status": "pass|warn|fail",
  "artifacts": 2,
  "markdown_without_metadata": 0,
  "findings": [
    {
      "level": "fail|warn",
      "file": ".ai-factory/spec.md",
      "id": "spec-auth-login",
      "message": "depends_on references unknown artifact \"adr-missing\"."
    }
  ]
}
```

When a PR changes an artifact with downstream links, include an impact note that records the decision for each affected artifact:

```markdown
## Artifact Impact

Changed:
- adr-auth-session

Reviewed:
- architecture-auth: updated
- spec-auth-login: reviewed-ok
- tests-auth-session: deferred, follow-up #123

Audit:
- ai-factory audit-artifacts: pass
```

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
  3. Security scan → detect Python 3, then run security-scan.py <path>
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
