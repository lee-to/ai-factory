### Task-based commit tasks

Treat `## Settings`, `Commit strategy:`, `Development methodology:`, and
`TDD granularity:` as exact, untranslated plan-control tokens. Read their
canonical values literally; do not infer settings from translated prose.

For a marked commit task:

- Extract its exact commit message from the task description; if it is unclear,
  stop without guessing. A description-only fallback is allowed only for legacy
  plans without the stable marker.
- Read its dependency IDs and the associated task descriptions, `Files:` hints,
  and complete ultra task specifications to identify the exact commit group.
  If ownership is unclear, stop before invoking `/aif-commit`.
- For `incremental-at-end` or `single-commit`, do not dispatch any marked
  commit task until all implementation/test tasks are complete and the reserved
  documentation task and ownership gate below are complete when `Docs: yes`.
- Before dispatch, capture the complete outstanding group changes from index
  and worktree, including untracked paths/content. Enumerate untracked files
  with `git status --porcelain -uall` and
  `git ls-files --others --exclude-standard`; prove ownership at path and
  hunk/content level before staging, especially for files overlapping other
  work. Persist a receipt adjacent to the task in the plan before dispatch.
  Use the unique ID `task-<task-id>` and store the task ID, full pre-commit
  `HEAD`, `state: captured`, and a SHA-256 digest plus the complete canonical
  owned-change manifest. The lossless manifest must encode each path's
  pre-commit blob/mode, exact resulting bytes or owned patch, result mode, and
  staged/unstaged state, including untracked content; a digest or path list
  alone is insufficient. Store it losslessly (for example, base64 canonical
  JSON). Treat the receipt as plan control data, not part of the commit group
  unless explicitly assigned. Do not duplicate receipt IDs.

  ```markdown
  <!-- aif:commit-receipt:start id="task-<task-id>" -->
  {"task_id":"<task-id>","state":"captured","pre_head":"<full HEAD>","manifest_sha256":"<sha256>","manifest_b64":"<base64 canonical manifest>"}
  <!-- aif:commit-receipt:end id="task-<task-id>" -->
  ```
  After verification, retain all capture fields and add
  `"state":"verified","commit":"<full commit hash>"`.
- Invoke `/aif-commit` in task-bound mode with the exact plan path, marked task
  ID and message, dependency task IDs/descriptions, planned files or hunk
  ownership evidence, captured outstanding changes, and `HANDOFF_MODE`. Commit
  only this group; preserve unrelated staged and unstaged changes. If ownership
  is unclear or unrelated staged work exists, stop without changing the index.
- Log the invocation as `[aif-implement.commit] invoking /aif-commit for task
  {taskId}`. After it returns, independently verify a new local commit has the
  exact planned message and its diff exactly covers the complete captured
  group, at path and hunk/content level, with no omissions or unrelated
  changes; its parent must be the receipt's pre-commit `HEAD`. Update the
  receipt to `state: verified` with the full commit hash while preserving the
  captured fields, and persist it before marking the commit task complete in
  TaskUpdate and the plan entrypoint. The receipt is the durable resume source.
- On failure, cancellation, or unverified commit, leave the task incomplete and
  stop at the commit boundary. On resume, reconcile the checkbox, task status,
  and local history. A persisted no-op marker is accepted only for an omitted
  docs-only group, with matching documentation outcome markers and a complete
  checkbox; inspect live staged, unstaged, and untracked changes to confirm the
  group still has no outstanding changes. A stale/malformed marker or any
  current change attributable to that group is an integrity error; do not
  clear it, recommit, or absorb new work.
  If there is no receipt and the task is unchecked/incomplete, treat it as a
  first dispatch: capture and persist the manifest, including pre-commit
  `HEAD`, before invoking `/aif-commit`. Do not search arbitrary earlier
  history for the planned message; without a persisted execution boundary such
  a commit cannot be attributed to this task and does not block dispatch. A
  missing receipt when the task is checked/completed is an integrity error.
  Once a receipt exists, validate its canonical manifest and digest. A verified
  receipt must match exactly one commit with the planned message, the recorded
  `pre_head` as parent, and a tree delta exactly matching the manifest. If the
  receipt remains captured after a commit, prove the commit from that receipt,
  then persist its verified state/hash before task completion. If no commit
  proves it, compare current owned changes to the saved manifest before
  retrying; any mismatch or multiple candidates stops without replacing the
  receipt. Otherwise mark completion only when exactly one matching commit
  exactly covers the captured group. Before accepting a verified receipt or
  captured candidate, require
  `git merge-base --is-ancestor <commit-hash> HEAD`; failure is an integrity
  error, not a retry. Later descendants remain valid.

The canonical marker is a standalone comment immediately before the task
checkbox; it is not itself a task. A task without the marker is ordinary even if
its text mentions commits. Commit tasks are dependency boundaries, not
implementation work.

### Deferred commit strategies

Read `Commit strategy:` from the exact `## Settings` section; absent values in
classic plans mean `incremental`. For `incremental-at-end`, wait until all
implementation, test, and documentation tasks finish, then process classic
`## Commit Plan` groups in order. For `single-commit`, wait until those tasks
finish, then process the single group. Neither strategy offers intermediate
commit checkpoints. Begin finalization immediately after the final work task.
Ask before each group; skipping one or all remaining groups must be reported,
and completion must not imply skipped groups were committed.

For classic groups, invoke `/aif-commit classic-group` with the exact plan path,
group name/number, task range, exact message, every task's IDs/descriptions and
file/hunk ownership evidence, `HANDOFF_MODE`, and authorization for that group.
Capture the complete outstanding selected-group change set, including staged,
unstaged, and untracked changes, before dispatch. It must validate against the
saved `## Commit Plan` and commit only that group. Persist the same durable
capture receipt before dispatch, keyed by the exact classic group name/number;
after verification, persist the pre-commit `HEAD`, canonical manifest, and
verified commit hash before continuing. If there is no receipt and no durable
group state indicating prior dispatch or completion, capture and persist the
baseline before searching for or dispatching a commit. Do not treat arbitrary
older commits with the same message as candidates. Once the receipt exists,
reconcile only commits verifiable against its recorded pre-commit `HEAD`,
message, and exact manifest. A missing or invalid receipt is an integrity error
when durable plan state says the group was already dispatched or completed;
never synthesize one after the fact. Independently
verify that the local commit has the exact message and parent and its diff
exactly covers the captured group with no omissions or unrelated changes
before recording success. Before accepting a verified receipt or captured
candidate, require
`git merge-base --is-ancestor <commit-hash> HEAD`; failure is an integrity
error, not a retry. Later descendants remain valid. On resume,
reconcile from the saved receipt and local
history, never a newly inferred baseline. If no commit proves a captured
receipt, compare live owned changes to that exact manifest before retrying;
mismatch or multiple/ambiguous matches stops without guessing.
Use receipt ID `classic-<group-number>` and include the exact classic group
name in its canonical manifest/receipt data.

For deferred strategies with `Docs: yes`, require a reserved documentation
task with `Files:` hints that depends on all implementation/test tasks and
belongs to the final deferred group (a dedicated final group for
`incremental-at-end`, the single group for `single-commit`). After implementation
and test work but before any deferred commit, run the mandatory `/aif-docs`
checkpoint. Capture staged/unstaged paths and hunks and every untracked path
and its content first. Enumerate untracked files with
`git status --porcelain -uall` and `git ls-files --others --exclude-standard`;
inspect and snapshot their content. Unrelated staged work stops the flow without
index changes. Compare post-checkpoint staged/unstaged diffs and untracked
paths/content with that baseline to identify all checkpoint changes, including
created, modified, and removed files. Validate the complete docs change set
(checkpoint changes and pre-existing outstanding docs changes) against the
reserved task's `Files:` hints and commit-group ownership, including every
added/changed docs path, hunk, and untracked file's content. Unclear,
overlapping, or out-of-scope ownership stops all deferred commits; do not widen
the group.

Persist terminal documentation outcomes before proceeding. On the documentation
task line, use
`<!-- aif:task-outcome:skipped reason="documentation-skipped" -->` for user
Skip or `<!-- aif:task-outcome:skipped reason="documentation-unchanged" -->`
when `/aif-docs` makes no changes. For an omitted docs-only commit task, retain
its commit-kind marker and add the matching
`<!-- aif:commit-outcome:skipped-no-op reason="..." -->` marker to the task
line; mark both tasks complete in TaskUpdate and with `[x]` checkboxes. This
explicit outcome is distinct from a commit, cancellation, failure, or pending
work. Do not emit a no-op marker for a `single-commit` group containing
implementation changes. If the docs checkpoint was already run during
finalization, do not repeat it at completion.

For a classic docs-only group omitted because docs were skipped or unchanged,
place a group-level marker immediately after the exact `## Commit Plan` entry:

```markdown
<!-- aif:classic-group-outcome:skipped-no-op group="<exact group name or number>" reason="documentation-skipped" -->
```

Use `reason="documentation-unchanged"` when `/aif-docs` made no changes, and
persist the matching documentation outcome and completed checkbox/status in
the same plan update. On resume, validate this marker before searching Git
history; accept it only for a docs-only group with the matching documentation
outcome and completed task. Check live staged, unstaged, and untracked changes
against the docs task's hints and owned paths/hunks. Any group-owned live
change makes the marker stale and requires stopping without changing the
marker/task state. An absent, malformed, mismatched, or non-docs-only marker is
an integrity error; never dispatch an empty commit or infer a no-op from
missing history.
