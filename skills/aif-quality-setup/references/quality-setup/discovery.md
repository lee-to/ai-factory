# Discovery Contract

Perform one ordered investigation: roots → manifests/runtime/environment →
frameworks → existing quality commands/configs → Git hooks → CI → coverage/gaps.
Do this for each component, rather than taking a separate shortcut for one language.

## Roots and Boundaries

Start with the current project and explicit paths. Canonicalize roots; reject
unreadable paths and out-of-scope symlink/junction traversal. Do not scan home,
the whole disk or arbitrary sibling repositories. Exclude `.git` contents,
`node_modules`, `vendor`, virtual environments, `target`, caches and build outputs
from recursive source discovery. Inspect top-level manifest/lock/config names
directly; do not exclude a legitimate component solely because of its language.

Identify repository roots with read-only Git metadata queries when Git is enabled
and available. A `.git` file can identify a worktree or submodule. Query actual
Git paths instead of assuming `<root>/.git/hooks`; read effective `core.hooksPath`
and its origin/scope. Do not change it while discovering.

Distinguish:

- one repository, one component;
- one repository, several components (including native package/Cargo workspaces);
- several independent repositories inside explicit read roots;
- nested repositories/submodules and linked worktrees, listed separately.

Discovering a nested repository is not selecting it for modification. Show the
inventory and resolve mutation scope before setup. Workspace configuration cannot
override repository/area instructions. A shared Git common directory means some
local settings affect other worktrees; report that impact before any proposal.

## Context Per Repository

For every independent root, reload its own `.ai-factory/config.yaml` and resolve
the context paths/defaults listed in Step 0 from that root. Load its own global →
individual skill-context and applicable ancestor/repository/area instructions.
`global-skill-context.md` is local to that project. No config, custom path, missing
file fallback, language or learned rule is copied from a sibling repository.
Components inside one repository share its context, with applicable area rules;
an independent nested repository gets a separate record, retaining applicable
ancestor instructions without inheriting sibling config. Explicit user instructions
remain authoritative across the selected scope.

Record config source, resolved context paths, effective rules/skill-context,
artifact language and Git preference with each identity. Invocation UI language
comes from the caller's context or explicit choice; do not switch it while visiting
roots. Generated comments/prose use each target's artifact language. No context
files are written. Missing optional context uses that root's defaults; an unreadable
mandatory file or conflicting instructions block dependent changes for that root.

Read Git preference before Git metadata queries. With `git.enabled:false`, infer
boundaries from explicitly supplied roots and filesystem markers/manifests without
Git commands; do not install hooks or initialize Git. Do not assume an enclosing
root's preference applies inside a separately identified repository. If filesystem
evidence cannot establish an independent root, clarify that boundary before writes.
One blocked root does not authorize fallback to another root's settings.

## Evidence Record

Maintain an in-memory record per repository/component:

| Field | Evidence |
| --- | --- |
| Identity | Canonical repository root, component path, exact CWD; Git/no-Git |
| Context | Root-local config/defaults, resolved paths/rules/skill-context, artifact language, Git preference |
| Stack | Languages, framework signals and source manifest locations |
| Runtime | Declared constraints/toolchain versus actually available version |
| Environment | Package manager, lockfile, native environment or container entrypoint |
| Commands | Exact declaration/ID, argv or unresolved shell declaration, CWD and source revision |
| Quality | Tool/config paths, effective policy where statically knowable, gaps/conflicts |
| Hooks | Manager/config, hook order, effective Git path and ownership |
| CI | Existing workflow commands, version/scope differences and requested handoff |
| Uncertainty | Missing/unreadable files, dynamic config, competing managers/roots |

Read manifests/configuration as data. Do not import JS configs, require PHP files,
activate Python code, run Cargo/build scripts, load extension modules or execute
package scripts to find out what they do. Dynamic/inherited settings remain
unresolved until a scoped authorized validation step.

Inspect native inputs: package.json/lockfiles and framework configs; Composer
manifest/lock and PHP tool configs; pyproject/environment/requirements/tool files;
Cargo manifests/lock/toolchain/config. Existing Docker/CI commands may establish a
container-first environment; do not assume the host is the supported executor.

Include formatting/checkout policy: `.editorconfig`, `.gitattributes`, formatter
line endings and effective `core.autocrlf`/`core.eol` with origin when Git is enabled.
Compare the selected files' actual endings with that policy before recommending
stash-based staged isolation. Git restoration can convert inconsistent LF/CRLF
bytes even when a check-only formatter does not write source. Treat this as a
compatibility gap, not permission to change checkout policy automatically.

If the command catalog is available/permitted, reuse exact IDs, CWD, source hashes
and ambiguities for package/Composer scripts. `verification:not_run` and
`effects:unknown` remain true until actual execution. Do not expand its supported
formats or claim Python/Rust discovery from it. Inspect those native declarations
directly and retain uncertainty for shell/dynamic tasks.

## Exit from Discovery

Show facts with evidence, existing coverage and gaps. If manifests disagree, a
required environment is missing, or component ownership is unclear, ask a focused
question before dependent selection. A manifest alone does not prove an installed
tool, and a command named `lint` does not prove that it includes formatting/types.
Without Git or with `git.enabled:false`, continue with checks-only options.
