# Read-Only Plan Discovery

Use configured paths, not hardcoded locations after config resolution. This shares
the selection order with implementation, but none of its mutation/handoff steps.
Do not invoke another workflow merely to discover or explain a plan.

## Explicit selection

Accept no selector, one `@path`, one quoted plan name, or `--archived`. Reject
conflicting/extra selectors; a path/name can contain spaces. Treat input as data,
never shell code. `--archived` lists only `<paths.archive>/plans` and summarizes a
sole candidate, or asks the user to choose among several. Empty archive → report it.

An explicit file must exist and be Markdown; an explicit directory or `index.md`
must declare exactly one `<!-- aif:plan-mode:ultra -->`. Resolve paths relative to
project root (an explicit absolute path is also accepted). Do not follow symbolic
links or read outside the selected artifact through a Phase Index link.

For a name, search root Markdown files and marked direct-child ultra entrypoints
in **both** `paths.plans` and `<paths.archive>/plans`. Try exact filename/directory,
then `.md`/`index.md`, then unique partial stem (including sequential names).
Include fast/fix files when their basename/stem matches. Deduplicate the same
physical candidate; if active/archive copies or several numbered matches remain,
show their full entrypoints and ask. Do not silently pick the active or newest copy.
No match → show searched roots and stop; do not fall back to another plan.

## Automatic order

1. When git is enabled and current branch is available, replace `/` with `-` to
   form the canonical branch stem. Do not create/switch/fetch/pull anything.
   - For `workflow.plan_id_format: sequential`, check both
     `<paths.plans>/NNNN_<stem>.md` and `NNNN_<stem>/index.md`, with exactly four
     digits. Retain directory candidates only with exactly one ultra marker.
     Choose the highest numeric prefix across both shapes; ties prefer ultra.
     Warn with the chosen path when multiple matches exist.
   - Otherwise, or when no sequential match exists, check `<stem>/index.md`
     then `<stem>.md`. Warn/prefer valid ultra when both shapes exist.
   - `slug` is the default; unknown/reserved formats behave like `slug`.
2. If no branch artifact resolves, inventory active named artifacts:
   root `paths.plans/*.md` (excluding resolved fast/fix paths) and direct child
   `*/index.md` with exactly one ultra marker. One candidate → select it;
   several → ask for an exact selection; none → continue.
3. Existing `paths.plan`.
4. Existing `paths.fix_plan` (summarize it, never redirect/invoke fix).
5. No plan → report the searched paths and suggest `/aif-plan` or `/aif-fix`.

Never count phase files as standalone plans or include the configured archive in
automatic active discovery, even if it is nested under `paths.plans`. Unmarked
directories are not ultra plans. Avoid symlink aliases and report unreadable roots
instead of claiming the inventory is complete.

## Selected ultra entrypoint

Read its entire `index.md`; require exactly one exact ultra marker and a non-empty
`## Phase Index` (or its clear localized equivalent). Resolve its ordered Markdown links as **direct child** phase
files; allow heading fragments, reject absolute/URL/traversal, broken links and
symlink escapes. Validate paths with filesystem metadata/canonical containment;
do not infer containment from a string prefix. Use available filesystem metadata
or quoted literal `realpath` operands; if containment cannot be verified, report
that missing capability and stop the dependent bundle read. A malformed selected bundle is an
integrity failure, not a reason to silently fall back to an unrelated plan.

Read only phase title/Objective/Files to Change sections as directed in SKILL.md.
Do not import implementation's requirement to load full task bodies or sync Handoff.
An unlinked file is outside this overview; note it only if encountered, without
loading it or merging its proposed changes. Missing summary sections stay explicit.
