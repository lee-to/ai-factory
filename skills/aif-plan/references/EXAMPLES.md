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

## Flow Scenarios

### Scenario 1: Fast mode

```text
/aif-plan fast Add product search API

-> mode=fast
-> Asks about tests (No)
-> Explores codebase
-> Creates 4 tasks
-> Saves plan to .ai-factory/PLAN.md
-> STOP
```

### Scenario 2: Full mode (normal)

```text
/aif-plan full Add user authentication with OAuth

-> mode=full
-> Quick reconnaissance
-> Branch: feature/user-authentication
-> Asks about tests (Yes), logging (Verbose), docs (Yes)
-> Creates branch
-> Explores codebase deeply
-> Creates 8 tasks with commit checkpoints
-> Saves plan to .ai-factory/plans/feature-user-authentication.md
-> STOP - user runs /aif-implement when ready
```

### Scenario 3: Full mode (parallel)

```text
/aif-plan full --parallel Add Stripe checkout

-> mode=full, parallel=true
-> Quick reconnaissance
-> Branch: feature/stripe-checkout
-> Asks about tests (No), logging (Verbose), docs (No)
-> Creates worktree ../my-project-feature-stripe-checkout
-> Copies context files, cd into worktree
-> Explores codebase deeply
-> Creates 6 tasks
-> Saves plan to .ai-factory/plans/feature-stripe-checkout.md
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
