### Step 0.list: List Available Plans (`--list`)

If `$ARGUMENTS` contains `--list`, run read-only plan discovery and stop.

```
1. Get current branch:
   git branch --show-current (git mode only)
2. Convert branch to canonical stem: replace "/" with "-" (git mode only)
3. Check existence of:
   - <configured plans dir>/<branch-stem>.md and
     <configured plans dir>/<branch-stem>/index.md (git mode only); Read the
     directory entrypoint and report it only when it contains exactly one
     `<!-- aif:plan-mode:ultra -->`
   - when `workflow.plan_id_format = sequential`: also glob
     `<configured plans dir>/[0-9][0-9][0-9][0-9]_<branch-stem>.md` and
     `<configured plans dir>/[0-9][0-9][0-9][0-9]_<branch-stem>/index.md`;
     Read every directory entrypoint, discard those without exactly one marker,
     and report all valid matches (highest-numbered first)
   - if git mode is off or branch creation is disabled: any root `*.md` full
     plan or declared-ultra direct child `*/index.md` entrypoint in
     `<configured plans dir>/`; exclude the resolved fast/fix plan paths
   - <resolved fast plan path>
   - <resolved fix plan path>
4. Print plan availability summary and usage hints
5. STOP.
```

**Important:** In `--list` mode:

- Do not execute tasks
- Do not modify files
- Do not update TaskList statuses

## Listing output

Check which files exist and print:

```
## Available Plans
Current branch: <branch>
- [x| ] <branchPlan>   (current-branch plan)
- [x| ] <namedPlan>    (full/ultra plan without branch)
- [x| ] <fastPlan>     (fast plan)
- [x| ] <fixPlan>      (fix plan)

Use:
- /aif-implement @<path>  to execute a specific plan
- /aif-implement          to use automatic priority
```

If no plans exist, print:

```
No plan files found. Create one with:
- /aif-plan full <description>
- /aif-plan ultra <description>
- /aif-plan fast <description>
- /aif-fix <bug description>
```

### Constraints

- Do not execute implementation tasks
- Do not modify files
- Do not call `TaskUpdate`
