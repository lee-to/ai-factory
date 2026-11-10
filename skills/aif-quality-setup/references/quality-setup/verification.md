# Verification and Results

Verify the selected change set in its real environment. Config files existing on
disk are evidence of configuration, not successful checks or functioning hooks.

## Verification Sequence

1. Review exact manifest/config/lock/hook diffs against the user's selected scope;
   preserve unrelated work and existing lifecycle behavior.
2. Confirm the selected runtime/tool binaries and versions. Avoid download-on-miss
   command wrappers. Missing binaries remain unavailable/not_run.
3. Execute selected commands in their recorded CWD/environment and coverage.
   Account for config execution, build scripts, caches/locks and network before
   running; a check flag does not guarantee absence of all side effects.
4. Verify installed hook paths/events and ordering in a disposable matching layout.
   Do not create a commit/push in the user's project merely to test a hook. Native
   manager invocation alone does not prove Git installed the hook correctly.
5. For autofix, compare index and working tree independently before/after success
   and failure, including partial staging and unrelated changes. Preserve original
   unstaged hunks and disclose agreed fixes.
6. Repeat setup against the resulting fixture to check idempotence; validate
   Windows and Linux separately before claiming both platforms.

Use disposable cases with reviewed project inputs. Do not run unreviewed fixture
scripts from another repository or initialize hooks in sibling/user worktrees.
Agent/model acceptance may require inference; declare whether inference, installation
or network is involved before starting such a run. Ordinary packaging tests do not
prove an agent's recommendations or mutations.

## Result Per Check

Report in chat: repository/component, selected tool/version, exact command/CWD,
checked content scope, exit/result and any effects. Distinguish:

- **installed/configured** — dependency/config/hook written or installed;
- **verified** — the described check actually ran successfully in the stated scope;
- **not_run** — missing runtime/permission/environment or execution not selected;
- **failed** — command, installation, hook or configuration failed, with cause.

Keep root-local context/rules/Git preference and artifact language attached to each
result. Distinguish candidate validation from project activation and installed
verification; scratch PASS never supplies a missing project check or sibling result.

An aggregate result is verified only if every selected required check passed.
Mandatory not_run is incomplete, not success. Do not treat config errors as source
findings, silently downgrade required checks or replace missing execution with
prompt-text assertions. Deselected checks are outside the selected mandatory set.

On failure, report partial changes, preserved user state and a focused next step.
Do not manufacture rollback, hide a failing result with ignore rules or automatically
retry commits/pushes. `/aif-commit` handles a failed hook by re-reading current index;
after successful fix-and-stage it inspects actual committed content before proposing
push. Setup itself creates no commits or pushes.
