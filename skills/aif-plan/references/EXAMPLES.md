# aif-plan Examples

## Argument Parsing

### Fast mode explicit

```text
/aif-plan fast Add product search API
-> mode=fast, description="Add product search API"
```

### Full mode explicit

```text
/aif-plan full Add user authentication with OAuth
-> mode=full, description="Add user authentication with OAuth"
```

### Ultra mode explicit

```text
/aif-plan ultra Rebuild billing around an immutable ledger
-> mode=ultra, description="Rebuild billing around an immutable ledger"
```

### Full mode with description omitted (defaults from RESEARCH.md)

```text
/aif-plan full
-> mode=full
-> description defaults to .ai-factory/RESEARCH.md Active Summary Topic (if present)
```

### Full mode with parallel worktree

```text
/aif-plan full --parallel Add Stripe checkout
-> mode=full, parallel=true, description="Add Stripe checkout"
```

### List subcommand

```text
/aif-plan --list
-> show worktrees, STOP
```

### Cleanup subcommand

```text
/aif-plan --cleanup feature/user-auth
-> remove worktree, STOP
```

### No mode provided (interactive, `plan_mode: ask` or absent)

```text
/aif-plan Add user authentication
-> ask full/fast interactively, description="Add user authentication"
-> ultra is not shown or inferred; select it with a leading token or a configured ultra default
```

### No mode + no description (interactive, `plan_mode: ask` or absent)

Assume the configured research file has a usable Active Summary topic.

```text
/aif-plan
-> ask full/fast once
-> description defaults to .ai-factory/RESEARCH.md Active Summary Topic (if present)
-> keep the selected mode; omit Original Request and commit Research Context
```

### Configured mode, with or without a description

Each row assumes no explicit mode token and a valid `workflow.plan_mode`.
Preference questions (tests/logging/docs) still follow the selected mode.

| Config | Invocation | Result |
|--------|------------|--------|
| `fast` | `/aif-plan Add user authentication` | Fast plan; no mode question; exact description is Original Request |
| `full` | `/aif-plan Add user authentication` | Full plan; no mode question; exact description is Original Request |
| `ultra` | `/aif-plan Add user authentication` | Ultra bundle; no mode question; exact description is Original Request |
| `fast` | `/aif-plan` with a usable research topic | Fast plan from that topic; no mode question or Original Request |
| `full` | `/aif-plan` with a usable research topic | Full plan from that topic; no mode question or Original Request |
| `ultra` | `/aif-plan` with a usable research topic | Ultra bundle from that topic; no mode question or Original Request |

Research-backed rows include committed Research Context. Configured defaults
never become part of the description or Original Request.

### Explicit mode overrides configured ultra

```text
# workflow.plan_mode: ultra
/aif-plan fast Add user authentication
-> mode=fast; Original Request is exactly "Add user authentication"
/aif-plan full
-> mode=full; reuse the research topic if available; no mode question
```

### Non-interactive Handoff fallback

```text
# HANDOFF_MODE=1; no explicit mode; a usable research topic is available
# workflow.plan_mode: ask, absent, or invalid
/aif-plan
-> mode=fast; reuse a usable research topic; no questions
-> invalid config additionally emits WARN [config]; absent/ask do not
# With a valid configured fast/full/ultra, retain that mode instead.
```

An invalid `plan_mode` also falls back to `ask` in an interactive session and
emits `WARN [config]`; the interactive examples above then apply.

## Flow Scenarios

### Scenario 1: Fast mode

```text
/aif-plan fast Add product search API

-> mode=fast
-> Asks about tests (No)
-> Explores codebase
-> Creates 4 tasks
-> Saves plan to `paths.plan` (default: `.ai-factory/PLAN.md`)
-> STOP
```

### Scenario 2: Full mode (normal)

```text
/aif-plan full Add user authentication with OAuth

-> mode=full
-> Quick reconnaissance
-> Plan slug: user-authentication
-> Branch: feature/user-authentication (if git branch creation is enabled)
-> If ROADMAP.md exists: asks about milestone linkage, user picks one (or skips)
-> Asks about tests (Yes), logging (Verbose), docs (Yes)
-> Creates branch only when `git.enabled=true` and `git.create_branches=true`
-> Explores codebase deeply
-> Creates 8 tasks with commit checkpoints
-> Saves plan to `paths.plans/feature-user-authentication.md` (or `paths.plans/user-authentication.md` when no branch is created)
-> When `workflow.plan_id_format = sequential`, the filename gains a 4-digit prefix:
   `paths.plans/0007_feature-user-authentication.md`
-> STOP - user runs /aif-implement when ready
```

### Scenario 3: Full mode (parallel)

```text
/aif-plan full --parallel Add Stripe checkout

-> mode=full, parallel=true
-> Quick reconnaissance
-> Branch: feature/stripe-checkout
-> If ROADMAP.md exists: asks about milestone linkage, user picks one (or skips)
-> Asks about tests (No), logging (Verbose), docs (No)
-> Creates worktree ../my-project-feature-stripe-checkout
-> Copies context files, cd into worktree
-> Explores codebase deeply
-> Creates 6 tasks
-> Saves plan to `paths.plans/feature-stripe-checkout.md`
-> Auto-invokes /aif-implement (parallel = autonomous)
```

### Scenario 4: Interactive mode selection (`plan_mode: ask` or absent)

```text
/aif-plan Add user authentication

-> No mode keyword found; configured preference resolves to ask; session is interactive
-> Asks: Full (Recommended) or Fast?
-> User picks Full
-> Continues as full mode flow
```

### Scenario 5: Full mode with sequential numbering (`plan_id_format: sequential`)

```text
.ai-factory/plans/ already contains:
  0001_admin-auth.md
  0002_admin-design.md
  0003_admin-bootstrap.md

/aif-plan full Add user authentication with OAuth

-> mode=full
-> workflow.plan_id_format = sequential (resolved from .ai-factory/config.yaml)
-> Plan slug: user-authentication
-> Branch:    feature/user-authentication        # branch stays un-numbered
-> Next number: max(0001, 0002, 0003) + 1 = 0004 → "0004"
-> Saves plan to paths.plans/0004_feature-user-authentication.md
-> STOP - user runs /aif-implement when ready

# If the directory is empty, the same flow starts from 0001.
# Numbers are derived from existing files: deleting 0004_*.md frees the 0004
# slot, and the next /aif-plan run will reuse it. Keep prior plans in place
# if you rely on stable cross-references.
# When HANDOFF_BRANCH_PREPARED=1, sequential numbering is force-disabled and
# the filename equals the branch name (Handoff contract).
```

### Scenario 6: Ultra mode

```text
/aif-plan ultra Rebuild billing around an immutable ledger

-> mode=ultra
-> Performs full preferences and optional branch setup
-> Deeply maps current billing models, callers, persistence, tests, and operations
-> Resolves plan identifier: feature-rebuild-billing
-> Creates:
   paths.plans/feature-rebuild-billing/
     index.md
     phase-01-ledger-domain.md
     phase-02-persistence-migration.md
     phase-03-service-integration.md
     phase-04-rollout-and-observability.md
-> index.md owns Original Request, settings, research/roadmap context,
   phase table of contents, task checkboxes, dependencies, and commit plan
-> Every phase file contains exact paths/symbols, ordered edits, contracts,
   error/logging behavior, test policy, acceptance criteria, and verification
-> STOP - user can clear context and run /aif-implement with the bundle

# With workflow.plan_id_format=sequential, the directory would be:
# paths.plans/0007_feature-rebuild-billing/
```
