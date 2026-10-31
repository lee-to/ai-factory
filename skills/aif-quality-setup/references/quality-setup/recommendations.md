# Recommendations and Selection

Build options from the evidence record, not a language-only preset. Account for
repository rules, existing tools, runtime/framework compatibility, developer
environment, CI and the selected component boundary.

## Proposal

Present a compact proposal in UI language:

1. **Detected:** repository/components, stack/runtime/environment evidence and uncertainty.
2. **Already covered:** exact commands/configs and their actual coverage.
3. **Gaps/conflicts:** missing checks, overlapping tools, incompatible versions or unclear scope.
4. **Recommended:** smallest coherent change set, with reasons specific to this project.
5. **Alternatives:** only options with a real tradeoff, stating when each is preferable.
6. **Effects:** changed files/entries, dependency versions, install/lifecycle effects,
   command/CWD/scope, hook events, strictness and autofix mode.
7. **Choice:** full recommendation, selected parts, another suitable option or cancel.

For each check state whether it runs against index contents, selected working-tree
files or a whole component/workspace. Distinguish formatter, lint, syntax/compiler
and type/static analysis; do not claim one covers the others without evidence.

Explain extra runtimes and maintenance costs. Existing infrastructure may make a
different manager better than a language's common default. One clear option needs
an explanation, not fabricated alternatives. When a compatible recipe is unknown,
investigate current official docs or ask; never synthesize unsupported flags.

## Strictness

For existing projects preserve current policy and show tightening separately.
For new checks propose a blocking threshold, coverage and exceptions openly.
Warnings-as-errors is one available policy; enabling every rule or maximum type
strictness is not an implied requirement. Existing findings are a baseline result
to discuss, not authority to generate suppressions or weaken CI.

## Resolve Before Applying

Resolve selected repositories/components, checks and versions, manager, events,
command scope, strictness, autofix mode and whether CI/build handoff is wanted.
For a fresh mutating setup, distinguish a documented candidate from a verified
mode: select tools and authorize the concrete scratch validation first, validate
matching versions/platform/staging/EOL, then activate only the supported selected
mode. Follow [setup](setup.md); neither tool selection nor an audit authorizes
installation or an unverified mutating hook.
Reuse specific choices already provided. Ask a focused question only for a material
gap; do not re-ask conventional defaults or facts inspectable in the project.

Audit ends here without writes/install/command execution. Setup/enhance can apply
a selected proposal. Cancellation leaves the project unchanged. Partial selection
updates both files and the set of mandatory checks. Install only selected checks;
deselected checks stay outside the required set and are not reported as failures.

If a user asks for setup of several repositories, show the per-repository plan
and resolve its scope. A shared workspace view does not grant a repository hook
permission to invoke sibling repositories.
