### Step 3: Execute Current Task

For each task:

**3.1: Fetch full details**

```
TaskGet(taskId) → Get description, files, context
```

For an ultra bundle, resolve the task's details link from `index.md`, then read
the entire linked phase file before marking the task in progress. Treat its
ordered implementation steps, interfaces, edge cases, logging, acceptance
criteria, and verification as requirements. Do not substitute a new approach
merely because TaskGet contains a shorter summary. If phase instructions conflict
with current code or project context, stop and report the concrete drift; do not
silently make the architectural choice that ultra was meant to pre-plan.

**3.1.1: Run the requirement consistency gate**

Before marking a behavior-changing task in progress:

1. Read the plan's `## Requirements Reconciliation` section when present.
   Resolve citations to the selected research source against the embedded
   `## Research Context`, which remains the committed requirements snapshot.
   Use the live research file only for the Step 0.2 drift warning; never use it
   to change task requirements without an explicit rebase. Re-read relevant
   passages from other cited authoritative sources.
2. Apply a source-priority hierarchy only when it is declared by the user or
   project. Treat roadmap text as scope rather than a detailed contract unless
   explicitly declared otherwise.
3. Compare the task's proposed behavior with the cited requirements. If they
   clearly conflict, emit `ERROR [requirement-conflict]`, leave the task pending,
   and STOP. In manual mode, ask for clarification. In `HANDOFF_MODE=1`, do not
   prompt; return `handoff_outcome: blocked_external` so the coordinator can
   route the task, and do not signal implementation completion or review.
   Do not implement first and rewrite a requirement artifact afterwards.
4. If behavior depends on independent selectors, states, modes, or input shapes,
   confirm that the task covers each applicable supported combination across
   validation, persistence, output/transition, and side effects. Do not infer a
   restriction on one dimension from a rule about another.

If an old plan lacks `## Requirements Reconciliation`, perform this gate from
the task, Original Request, committed Research Context, project rules, and any
authoritative sources they explicitly reference. The embedded Research Context
still wins over its live drift source. Do not expand into unrelated research.

**3.2: Mark as in_progress**

```
TaskUpdate(taskId, status: "in_progress")
```

**3.3: Implement the task**

- Read relevant files
- Make necessary changes
- Follow existing code patterns
- **NO tests unless plan includes test tasks**
- **NO reports or summaries**
- Treat requirement, research, roadmap, rules, and architecture artifacts as
  read-only unless the active task explicitly requires changing the owning
  artifact. This does not block the factual context maintenance explicitly
  allowed later in this workflow, but those updates must not change behavioral
  requirements merely to match the implementation.

**3.4: Verify implementation**

- Check code compiles/runs
- Verify functionality works
- Fix any immediate issues
- Run the verification scenarios assigned to the task. When a representative
  repository artifact defines the contract, exercise that artifact through the
  primary path rather than relying only on synthetic fixtures.

**3.5: Mark as completed**

```
TaskUpdate(taskId, status: "completed")
```

**3.6: Update checkbox in plan entrypoint**

**IMMEDIATELY** after completing a task, update the checkbox in the plan entrypoint
(`index.md` for ultra):

```markdown
# Before

- [ ] Task 1: Create user model

# After

- [x] Task 1: Create user model
```

**This is MANDATORY** — checkboxes must reflect actual progress:

- Use `Edit` tool to change `- [ ]` to `- [x]`
- Do this RIGHT AFTER each task completion
- Even if deletion will be offered later
- Plan entrypoint is the source of truth for progress
- Never add or update duplicate progress checkboxes in ultra phase files

**Handoff sync (manual mode ONLY — skip when `HANDOFF_MODE` is `1`):** If a Handoff task ID was extracted in Step 0.2, call `handoff_push_plan` with `{ taskId: <id>, planContent: <full updated plan text> }` to sync the checklist progress. For ultra, use the bundle serialization defined in Step 0.2.

**3.7: Update the resolved description artifact if needed**

If during implementation:

- New dependency/library was added
- Tech stack changed (e.g., added Redis, switched ORM)
- New integration added (e.g., Stripe, SendGrid)
- Architecture decision was made

→ Update the resolved description artifact (`paths.description`, default: `.ai-factory/DESCRIPTION.md`) to reflect the change:

```markdown
## Tech Stack

- **Cache:** Redis (added for session storage)
```

This keeps the resolved description artifact as the source of truth.

**3.7.1: Update AGENTS.md and ARCHITECTURE.md if project structure changed**

If during implementation:

- New directories or modules were created
- Project structure changed significantly (new `src/modules/`, new API routes directory, etc.)
- New entry points or key files were added

→ Update `AGENTS.md` — refresh the "Project Structure" tree and "Key Entry Points" table to reflect new directories/files.

→ Update the resolved architecture artifact — if new modules or layers were added that should be documented in the folder structure section.

**Only update if structure actually changed** — don't rewrite on every task. Check if new directories were created that aren't in the current structure map.

**3.8: Check for commit checkpoint**

If the plan has commit checkpoints and current task is at a checkpoint:

```
AskUserQuestion: ✅ Tasks <first>-<last> completed. This is a commit checkpoint. Ready to commit? Suggested message: "<conventional commit message>"

Options:
1. Yes, commit now (/aif-commit)
2. No, continue to next task
3. Skip all commit checkpoints
```

**Based on choice:**

- Yes, commit now → invoke `/aif-commit` with the suggested message, then continue to next task
- No, continue to next task → proceed to the next task without committing
- Skip all commit checkpoints → for all subsequent checkpoints within this `/aif-implement` run, skip the prompt automatically and proceed directly to the next task (as if user selected "No, continue to next task" each time). This is in-context memory — resets on `/clear` or new session

**3.9: Move to next task or pause**
