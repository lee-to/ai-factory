### 0.2 Find Plan Artifact

Same logic as `/aif-implement` — produce the **canonical branch stem** before any plans-dir glob so producer and consumers agree by construction.

```
1. Check current git branch:
   git branch --show-current
2. Convert branch to filename stem (git mode only):
   branch_stem = current branch with every "/" replaced by "-"
   Example: feature/user-auth → feature-user-auth
3. Resolve the plan artifact using <branch_stem>:
   → When `workflow.plan_id_format = sequential`, glob both
       <configured plans dir>/[0-9][0-9][0-9][0-9]_<branch_stem>.md
       <configured plans dir>/[0-9][0-9][0-9][0-9]_<branch_stem>/index.md
     Read every directory candidate and retain it only when `index.md` contains
     exactly one <!-- aif:plan-mode:ultra -->. Choose the highest prefix across
     valid artifacts and warn when multiple valid candidates exist; prefer ultra
     if both shapes share the highest prefix.
   → Otherwise/fallback check the ultra entrypoint and full file:
       <configured plans dir>/<branch_stem>/index.md
       <configured plans dir>/<branch_stem>.md
     Read the directory entrypoint before selection and ignore it unless it
     contains exactly one <!-- aif:plan-mode:ultra -->. If both valid shapes
     exist, warn and prefer ultra.
4. If the branch-based plan is missing or git mode is off:
   → Count root `*.md` full plans and declared-ultra direct child `*/index.md`
     entrypoints as artifacts; exclude resolved fast/fix paths and do not count
     phase files
   → If exactly one exists, use it
   → If multiple exist, ask the user to choose or use `@<path>` via `/aif-implement`
5. No named full/ultra plan → Check the resolved fast plan path
6. No regular plan and no resolved fast plan → fall back to standalone verification choices
```

**Note:** Plan discovery scans `paths.plans/` only. Plans archived to `paths.archive/plans/` by `/aif-archive` are excluded from discovery. If a plan is found only in the archive, emit `WARN [aif-verify] plan <name> is archived; verifying archived plan`.

**If no plan artifact is found:**
```
AskUserQuestion: No plan artifact found. What should I verify?

Options:
1. Verify last commit — Check the most recent commit for completeness
2. Verify branch diff — Compare current branch against the configured base branch
3. Cancel
```
