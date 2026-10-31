# Example: Mixed Monorepo and Multiple Repositories

## One Repository

```text
product/             # One Git root
  backend/           # Composer/PHP component
  web/               # JS/TS component
```

Discover both manifests and their actual command definitions. Propose a repository
hook configuration with component-specific CWD and environment, preserving existing
commands. A frontend change must not be passed as a filename to backend analysis.
Explain when shared configuration changes require checking both components.

CI can call the selected full-project commands from backend/ and web/. Route pipeline
changes through the CI owner skill (`aif-ci`); do not create a central quality config just to list them.

## Multiple Repositories

```text
workspace/
  api/               # Independent Git root, PHP
  worker/            # Independent Git root, Python
  gateway/           # Independent Git root, Rust
```

The user explicitly supplies this workspace or these roots for discovery. Show the
three repositories and resolve the selected mutation scope; do not infer unrelated
siblings from the current api/ directory.

| Repository | Proposed local scope | Hook behavior |
| --- | --- | --- |
| api | Existing Composer style/analysis commands | Checks api only |
| worker | Existing Python environment and selected lint/types | Checks worker only |
| gateway | Selected Cargo members/features | Checks gateway only |

Resolve context separately: api may use custom description/rules paths and Russian
artifact prose, while worker uses English artifacts and `git.enabled:false`.
Keep the invocation's UI language stable. Worker receives selected native checks
without Git queries or hook setup; api's hook preference cannot override it.
Gateway with no config uses its own defaults, never api's custom paths or rules.
Respect each root's global/individual skill-context and applicable area instructions.

If api and worker are selected, gateway stays untouched. A requested workspace
verification runs their exact commands separately and reports each status; one
missing Python runtime makes that required check not_run, not aggregate success.

Cross-repository checks are a separate explicit choice. Resolve roots, missing
checkouts, dependency order and developer environment requirements before attaching
one repository's hook to others. No inferred global script, shared Git settings,
automatic repository creation or implicit commit across the workspace.

A linked worktree or nested submodule is not just another component directory.
Inspect Git paths and ownership; do not change its parent/sibling hook config by
assuming `.git` is a normal directory. Without Git, offer checks-only setup.
