# Hook Selection and Staging Contract

## Select a Manager from the Actual Environment

Preserve the existing manager and hook order. For a new setup, explain only suitable
choices; check current manager/tool versions before generating installation commands.

| Candidate | Consider when | Resolve before setup |
| --- | --- | --- |
| Husky + lint-staged | Node already belongs to the project and compatible local dependencies fit | Runtime constraints, existing prepare, staged task semantics, dev-dependency availability |
| pre-commit | Existing Python/polyglot hook workflow or explicit preference | Selected hook types, environment provisioning, pinned remote revisions versus local system tools |
| Lefthook | Existing or desired native/polyglot manager | Installation channel, effective Git paths, command ordering and actual staging guarantees |
| Simple/native hook | Few stable commands and explicit maintenance preference | Installation/update ownership, portable entrypoint, filename handling and lack of staged isolation |

Do not install Node only for hooks in another stack. Installing another runtime,
manager or managed hook environment is a disclosed option, not an automatic default.
A manager's ability to run file lists is not proof it protects unstaged hunks.

Check the discovered EOL policy before using backup/stash restoration: conflicting
formatter endings, Git attributes, autocrlf and actual file bytes can cause a failed
check hook to rewrite line endings. Do not promise byte preservation in that state.
Explain the conflict and propose either an explicitly authorized policy resolution
followed by revalidation, or a clearly labelled working-tree/component check without
staged isolation. Do not auto-change Git config/attributes or disable backups to
force a passing staging test. Verify source bytes as well as Git diffs.

## Event and Scope

Propose quick staged lint/format checks on pre-commit where the chosen runner
provides correct index-content isolation. Project-wide types/static analysis and
heavier checks generally fit pre-push/CI. Explain full component checks honestly if
staged isolation is unavailable; the user may choose that cost or CI-only execution.

Never append filenames to project-wide tsc/framework typecheck, Composer analysis,
Python typecheck or Cargo commands. Use the selected repository/component CWD and
correct environment. Deleted/renamed files and names containing spaces or shell
characters need safe argv/path handling; do not invent shell loops or interpolate
unquoted Git output. Run fixers on overlapping files sequentially.

## Autofix Modes

| Mode | Contract |
| --- | --- |
| check (initial choice) | No source fixes or lasting index changes; findings stop the relevant hook. Temporary isolation must restore original index/worktree. |
| fix-and-stop | Apply only agreed fixes, preserve original staged scope/unstaged hunks, stop commit for review/restaging; no automatic retry. |
| fix-and-stage | Only explicitly selected staged fixes can enter index; preserve unrelated unstaged hunks; successful checks may let Git finish commit. |

Before claiming a mutating mode is supported, verify the selected runner/version
with a partially staged disposable case. If it cannot preserve the required state,
offer check-only or another event/runner instead. No extra broad git add, automatic
stash drop, blanket reset or disabling isolation to force success.
For fresh setups, first resolve tool/candidate selection and the concrete validation
effects via [setup](setup.md). Scratch installation is separate from activating a
project hook; a failed/not_run candidate stays unactivated. Revalidate when the
actual runner version, platform, scope or checkout policy changes.

lint-staged has its own staging/backup behavior; use that instead of adding git add
tasks. Its supported failure-on-change mode can implement fix-and-stop, but confirm
version/restore behavior and explain remaining working-tree fixes. Test failure and
restoration paths. Do not infer equivalent protections for another manager.

## Git Topology and Environment

Resolve Git paths, effective hooksPath and scope before installation; `.git` may
be a file. Repository-local config is often shared by worktrees. Preserve existing
hooks and do not change global config or sibling worktree behavior implicitly.
When ownership is unclear, stop installation and resolve it; checks-only can continue.

One repository's hook checks that repository. Multirepo cross-checks require an
explicit selection with roots/CWD and dependency order. Submodules have separate
ownership. In monorepos route by component while keeping the correct Git root.

Check Windows/POSIX entrypoints, executable mode/line endings, paths with spaces,
GUI PATH and CI installs without dev dependencies. Hooks run locally and can be
bypassed by users; required enforcement belongs in selected CI checks, too.
Do not auto-bypass hooks on failure or describe a disabled CI hook as a passed check.

Sources: [Husky setup](https://typicode.github.io/husky/get-started.html),
[Husky environments](https://typicode.github.io/husky/how-to.html),
[lint-staged](https://github.com/lint-staged/lint-staged),
[pre-commit](https://pre-commit.com/), [Lefthook](https://lefthook.dev/),
[Git hooks](https://git-scm.com/docs/githooks),
[Git worktree configuration](https://git-scm.com/docs/git-worktree#_configuration_file).
