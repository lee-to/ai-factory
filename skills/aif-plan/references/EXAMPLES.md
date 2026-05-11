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

### No mode provided

```text
/aif-plan Add user authentication
-> ask mode interactively, description="Add user authentication"
```

### No mode + no description (defaults from RESEARCH.md)

```text
/aif-plan
-> ask mode interactively
-> description defaults to .ai-factory/RESEARCH.md Active Summary Topic (if present)
```

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

### Scenario 4: Interactive mode selection

```text
/aif-plan Add user authentication

-> No mode keyword found
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
