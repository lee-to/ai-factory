### Step 5: Completion

**Handoff sync (manual mode ONLY — skip entirely when `HANDOFF_MODE` is `1`):** If a Handoff task ID was extracted from the plan annotation AND `HANDOFF_MODE` is NOT `1`:
1. Call `handoff_push_plan` with `{ taskId: <id>, planContent: <final updated plan text> }`; serialize the complete bundle for ultra.
2. If `HANDOFF_SKIP_REVIEW` is `1`: call `handoff_sync_status` with `{ taskId: <id>, newStatus: "done", sourceTimestamp: "<current UTC time in ISO 8601 format>", direction: "aif_to_handoff", paused: false }`.
3. Otherwise: call `handoff_sync_status` with `{ taskId: <id>, newStatus: "review", sourceTimestamp: "<current UTC time in ISO 8601 format>", direction: "aif_to_handoff", paused: true }`.

When all tasks are done:

```
## Implementation Complete

All 8 tasks completed.

Branch: feature/product-search
Plan artifact: .ai-factory/plans/feature-product-search.md
Files modified:
- src/services/search.ts (created)
- src/api/products/search.ts (created)
- src/types/search.ts (created)
Documentation: updated existing docs | created docs/<feature-slug>.md | skipped by user | warn-only (Docs: no/unset)

What's next?

1. 🔍 /aif-verify — Verify nothing was missed (recommended)
2. 💾 /aif-commit — Commit the changes directly
```

**Check ROADMAP.md progress:**

If the resolved roadmap artifact exists:

1. Read it. Recognize clear localized equivalents of the plan's Roadmap Linkage, primary milestone and additional-milestone labels; ambiguous matches stay open for owner review.
   1.1. If the plan entrypoint includes `## Roadmap Linkage`, consider every non-`none` `Milestone:` and `Also completes:` entry; preserve quoted names/IDs, including embedded commas. Never reduce a group to its first milestone.
2. Check each linked unchecked milestone independently against the completed work; when no linkage exists, check for supported milestone matches
3. Mark a milestone `[x]` and add it to the Completed table with today's date only when its own scope is fully satisfied; finishing all plan tasks alone does not prove every linked milestone complete
4. Tell the user which milestones were marked done and which remain open; ambiguous/partial matches stay open with `WARN [roadmap]` and owner review

### Context Maintenance (Artifacts)

Only do this step when there is something concrete to capture.

**DESCRIPTION.md (allowed in this command):**

- If this plan introduced new dependencies/integrations or changed the stack, update the resolved description artifact with factual deltas only.
- Do not rewrite unrelated sections.

**ARCHITECTURE.md + AGENTS.md (allowed in this command):**

- If new modules/layers/folders were added (or dependency rules changed), update the resolved architecture artifact to reflect the new structure and constraints.
- If you maintain `AGENTS.md` structure maps or entry points, refresh them only when they are now incorrect.

**ROADMAP.md (allowed, limited):**

- This command may mark milestone completion when evidence is clear.
- If milestone mapping is ambiguous, emit `WARN [roadmap] ...` and suggest the owner command:
    - `/aif-roadmap check`
    - or `/aif-roadmap <short update request>`

**RULES.md (NOT allowed in this command):**

- Never edit the resolved `paths.rules_file` artifact from `/aif-implement`.
- If you discovered repeatable conventions/pitfalls during implementation, propose up to 3 candidate rules and ask the user to add them via `/aif-rules`.
- Do not invoke `/aif-rules` automatically (it is user-invoked).

If candidate rules exist:

```
AskUserQuestion: Capture new project rules in the resolved RULES.md artifact?

Options:
1. Yes — output `/aif-rules ...` commands (recommended)
2. No — skip
```

**Documentation policy checkpoint (after completion, before plan cleanup):**

Read the plan entrypoint setting `Docs: yes/no`.

If plan setting is `Docs: yes`:

```
AskUserQuestion: Documentation checkpoint — how should we document this feature?

Options:
1. Update existing docs (recommended) — invoke /aif-docs
2. Create a new feature doc page — invoke /aif-docs with feature-page context
3. Skip documentation
```

Handling:

- Option 1 → invoke `/aif-docs` to update README/docs based on completed work
- Option 2 → invoke `/aif-docs` with context to create `docs/<feature-slug>.md`, include sections (Summary, Usage/user-facing behavior, Configuration, API/CLI changes, Examples, Troubleshooting, See Also), and add a README docs-table link
- Option 3 → do not invoke `/aif-docs`; emit `WARN [docs] Documentation skipped by user`

If plan setting is `Docs: no` or setting is unset:

- Do **not** show a mandatory docs checkpoint prompt
- Do **not** invoke `/aif-docs` automatically
- Emit `WARN [docs] Docs policy is no/unset; skipping documentation checkpoint`

**Always include documentation outcome in the final completion output:**

- `Documentation: updated existing docs`
- `Documentation: created docs/<feature-slug>.md`
- `Documentation: skipped by user`
- `Documentation: warn-only (Docs: no/unset)`

**Handle plan artifact after completion:**

- **If the resolved fast plan path** (from `/aif-plan fast`):

  ```
  AskUserQuestion: Would you like to delete the resolved fast plan file? (It's no longer needed)

  Options:
  1. Yes, delete it
  2. No, keep it
  ```

  **Based on choice:**
    - "Yes, delete it" → delete the file:
      ```bash
      rm <resolved fast plan path>
      ```
    - "No, keep it" → leave the file as is, continue to the next step

- **If branch-named full file or ultra bundle directory**:
    - Keep it - documents what was done
    - User can delete before merging if desired

**Check if running in a git worktree:**

Detect worktree context:

```bash
# If .git is a file (not a directory), we're in a worktree
[ -f .git ]
```

**If we ARE in a worktree**, offer to merge back and clean up:

```
You're working in a parallel worktree.

  Branch:    <current-branch>
  Worktree:  <current-directory>
  Main repo: <main-repo-path>

AskUserQuestion: Would you like to merge this branch into the configured base branch and clean up?

Options:
1. Yes, merge and clean up (recommended)
2. No, I'll handle it manually
```

**Based on choice:**

- "Yes, merge and clean up" → follow the Worktree Merge procedure below
- "No, I'll handle it manually" → show a reminder:
  ```
  To merge and clean up later:
    cd <main-repo-path>
    git merge <branch>
    /aif-plan --cleanup <branch>
  ```

#### Worktree Merge

1. **Ensure everything is committed** — check `git status`. If uncommitted changes exist, suggest `/aif-commit` first and wait.

2. **Get repository root path:**

   ```bash
   MAIN_REPO=$(git rev-parse --git-common-dir | sed 's|/\.git$||')
   BRANCH=$(git branch --show-current)
   ```

3. **Switch to the repository root:**

   ```bash
   cd "${MAIN_REPO}"
   ```

4. **Merge the branch:**

   ```bash
   git checkout <configured-base-branch>
   git pull origin <configured-base-branch>
   git merge "${BRANCH}"
   ```

   If merge conflict occurs:

   ```
   ⚠️  Merge conflict detected. Resolve manually:
     cd <main-repo-path>
     git merge --abort   # to cancel
     # or resolve conflicts and git commit
   ```

   → STOP here, do not proceed with cleanup.

5. **Remove worktree and branch (only if merge succeeded):**

   ```bash
   git worktree remove <worktree-path>
   git branch -d "${BRANCH}"
   ```

6. **Confirm:**

   ```
   ✅ Merged and cleaned up!

     Branch <branch> merged into <configured-base-branch>.
     Worktree removed.

   You're now in: <main-repo-path> (<configured-base-branch>)
   ```

→ **STOP** — worktree merged and removed, no further steps needed.

### Final Step — Verify or Commit

```
AskUserQuestion: All tasks complete. What's next?

Options:
1. Verify first — Run /aif-verify to check completeness (recommended)
2. Skip to commit — Go straight to /aif-commit
```

**Based on choice:**

- "Verify first" → invoke `/aif-verify` → after it completes, continue to context cleanup below
- "Skip to commit" → invoke `/aif-commit` → after it completes, continue to context cleanup below

**Context cleanup (after verify or commit):**

Suggest the user to free up context space if needed: `/clear` (full reset) or `/compact` (compress history).

**IMPORTANT: NO summary reports, NO analysis documents, NO wrap-up tasks.**
