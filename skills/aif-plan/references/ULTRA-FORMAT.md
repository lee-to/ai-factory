# aif-plan Ultra Bundle Format

Use this reference only for `ultra` mode. The bundle is designed so a strong
planning model can commit implementation decisions and a smaller implementation
model can execute them without reconstructing intent.

## Bundle Layout

```text
paths.plans/<plan-directory>/
├── index.md
├── phase-01-<phase-slug>.md
├── phase-02-<phase-slug>.md
└── phase-NN-<phase-slug>.md
```

`<plan-directory>` uses the same canonical stem and optional sequential prefix
as a full plan:

- `slug`: `<plan_file_stem>/`
- `sequential`: `<NNNN>_<plan_file_stem>/`
- `timestamp` / `uuid`: reserved; behave like `slug`
- `HANDOFF_BRANCH_PREPARED=1`: force-disable the sequential prefix

The bundle must contain only `index.md` plus direct child phase markdown files.
Do not create nested phase directories. Use zero-padded phase numbers so lexical
and execution order agree.

## Sources of Truth

- `index.md` is the manifest, scope anchor, and only progress source.
- `index.md` contains the exact machine-readable marker
  `<!-- aif:plan-mode:ultra -->`. Consumers use this marker rather than the
  localized `Mode` label. The marker is never translated or rewritten.
- Task checkboxes exist only in `index.md`.
- Phase files contain implementation detail and must not duplicate task
  checkboxes.
- The ordered links under `## Phase Index` define the files that belong to the
  plan. Consumers ignore unlinked markdown files and warn about them as orphans.
- Every task has a stable `Task N` identifier in `index.md` and a matching
  `## Task N: ...` section in exactly one linked phase file.

This split prevents checkbox drift while preserving enough detail for
implementation after `/clear` or handoff to a smaller model.

## `index.md` Template

```markdown
<!-- handoff:task:<HANDOFF_TASK_ID> -->
<!-- aif:plan-mode:ultra -->
# Ultra Implementation Plan: [Feature Name]

Mode: ultra
Branch: [current branch or "none"]
Created: [date]

## Original Request
[exact user-provided planning request]

## Settings
- Testing: yes/no
- Logging: verbose/standard/minimal
- Docs: yes/no

## Roadmap Linkage (optional)
Milestone: "[milestone name or none]"
Rationale: [one sentence]

## Research Context (optional)
Source: `.ai-factory/RESEARCH.md` (Active Summary, Updated: ..., SHA256: ...)
[committed Active Summary copy]

## Architecture and Decisions
- [Cross-phase boundary, contract, or implementation decision]

## Phase Index
1. [Phase 1: Foundation](phase-01-foundation.md) — Tasks 1-2
2. [Phase 2: Integration](phase-02-integration.md) — Task 3

## Cross-Phase Dependencies
- Task 3 depends on Tasks 1 and 2 because ...

## Tasks

### Phase 1: Foundation
- [ ] Task 1: [deliverable] ([details](phase-01-foundation.md#task-1-deliverable))
- [ ] Task 2: [deliverable] ([details](phase-01-foundation.md#task-2-deliverable))

### Phase 2: Integration
- [ ] Task 3: [deliverable] ([details](phase-02-integration.md#task-3-deliverable)) (depends on 1, 2)

## Commit Plan
- **Commit 1** (after tasks 1-2): "feat: ..."
- **Commit 2** (after task 3): "feat: ..."

## Definition of Done
- [Non-task, non-checkbox completion criteria]
```

Omit the first Handoff line unless `HANDOFF_MODE=1` and `HANDOFF_TASK_ID` is
non-empty. The ultra marker is therefore always the first line or immediately
follows the optional Handoff annotation.

The source example may instead be a selected ultra research file such as
`.ai-factory/research/<slug>/RESEARCH.md`; always record the exact source.

Apply the standard `Original Request`, `Research Context`, roadmap, settings,
language, Handoff annotation, and commit-plan contracts from `SKILL.md`. Keep
`## Tasks` checkbox lines concise: they are the durable progress ledger and link
to the detailed execution procedure.

## Phase File Template

```markdown
# Phase [N]: [Name]

Plan: [index.md](index.md)
Tasks: [N-M]
Depends on: none | Phase N / Task N

## Objective
[Observable outcome this phase must produce.]

## Current-Code Evidence

| Path | Symbols / lines | Why it matters |
|------|-----------------|----------------|
| `src/...` | `Class.method` | Existing pattern or integration point |

## Files to Change

| Path | Action | Required change |
|------|--------|-----------------|
| `src/...` | create/modify/delete | Exact responsibility |

## Task 1: [Deliverable]

### Intent
[Why this task exists and what later work depends on it.]

### Implementation Steps
1. [Concrete edit in a named file and symbol.]
2. [Exact control/data flow.]
3. [Integration or migration step.]

### Required Interfaces and Contracts
- Types, signatures, routes, schemas, events, environment variables, or config.
- Compatibility requirements and invariants.
- Include concise pseudocode when prose leaves meaningful ambiguity.

### Error Handling and Logging
- Failure modes and expected behavior.
- Log events, levels, safe fields, and sensitive fields that must not be logged.
- Follow the plan's selected logging policy.

### Tests
- When `Testing: yes`: exact cases, fixture/setup, test files, and commands.
- When `Testing: no`: state `Not planned by user preference`; do not add tests.

### Acceptance Criteria
- [Observable, independently verifiable result.]

### Verification
- `[exact command or manual check]`
- Expected result: [...]

## Phase Risks and Mitigations
- Risk: ...
  Mitigation: ...

## Phase Completion Checklist
- Every Task N in this phase satisfies its acceptance criteria.
- Required verification commands pass.
- `index.md` task checkboxes are updated immediately after verified completion.
```

## Required Detail Gate

Before saving an ultra bundle, verify every task has all of the following:

1. Exact file paths and relevant existing symbols, or an explicit statement
   that a new path/symbol will be introduced.
2. Ordered edits detailed enough to implement without choosing an architecture.
3. Inputs, outputs, contracts, data flow, and dependency effects.
4. Error handling, edge cases, and logging behavior.
5. Tests and commands when testing is enabled; an explicit no-test statement
   when testing is disabled.
6. Observable acceptance criteria and verification commands/checks.
7. No unresolved implementation choice hidden behind words such as "handle",
   "support", "wire up", "as needed", or "etc." If a decision truly cannot be
   made during planning, record it as a blocking open question in `index.md`
   instead of delegating the guess to the implementer.

Also verify bundle integrity:

- Every Phase Index link exists and is relative to the bundle directory.
- The exact marker `<!-- aif:plan-mode:ultra -->` exists once in `index.md`.
- Every indexed task maps to exactly one phase task section.
- Every phase task appears exactly once in the index checklist.
- Dependency references point to existing task IDs.
- No phase file is orphaned.
- No phase file contains task progress checkboxes.
- Task and commit groupings are consistent across all files.

## Consumer Contract

Treat the plan as `index.md` plus every phase file linked from `## Phase Index`
in order.

- Read `index.md` first.
- Read a task's complete phase file before implementing or deeply validating
  that task.
- Update progress checkboxes only in `index.md`.
- For a whole-plan validation or rewrite, read all linked phase files.
- For Handoff `planContent`, serialize `index.md`, then append every linked phase
  in order with a separator `<!-- ultra-phase:<relative-path> -->`.
- An explicit `@<path>` may point to the bundle directory or its `index.md`;
  normalize both to the same bundle.
