# JS/TS Profile

First inspect package.json, packageManager/runtime constraints, lockfiles,
workspace declarations, framework versions and existing scripts/configs. Multiple
lockfiles or missing manager information are uncertainties, not permission to
choose npm. Use project-local binaries through the selected manager; do not use a
command that downloads a missing tool during a hook.

## Recommendation Rules

- Preserve existing ESLint legacy/flat, Prettier or Biome setups and framework
  presets. Identify duplicate formatter rules before suggesting a change.
- For a new compatible JS/TS setup, consider ESLint flat config plus Prettier;
  explain the independent lint/format roles. Use eslint-config-prettier where
  needed to disable conflicting lint formatting rules.
- Offer Biome where its current language/framework capabilities cover the
  project. Retain any checks it cannot replace. Do not migrate existing tools
  automatically or promise plugin parity/performance without evidence.
- Choose parser/plugins from the actual framework, not a blanket React/Next/Vue
  package list. Use the project's framework-specific typechecker/build contract
  when appropriate; otherwise use a separate project-configured TypeScript check.
- Verify compatible versions against the target Node/framework/plugin constraints.
  In particular, ESLint v10 does not support Node 18; latest is not a version policy.

## Commands and Scope

Inspect existing script contents before adding anything. Keep `lint`, build,
`prepare`, test and lifecycle behavior intact. Add distinct check and fix scripts
only where missing; an existing `lint` need not be renamed or replaced.

Typecheck uses the project configuration and exact component CWD. Do not append
staged paths to `tsc --noEmit`, framework typecheck or a project-wide npm script.
For a multi-config TS project, follow its references/build semantics instead of
creating an unrelated tsconfig.

Use staged-aware execution only after reading [hooks](hooks.md). Check-only lint
and formatting are the initial choice. Enabling zero-warning enforcement or
changing existing rules is a separate strictness selection; `--quiet` is not a
replacement for a warning threshold. Config/internal errors remain failures.

Adapt [the JS/TS example](../../examples/js-ts.md) to the discovered project.
Record selected tool versions and validate actual exits after setup.

Sources: [ESLint config](https://eslint.org/docs/latest/use/configure/configuration-files),
[v10 compatibility](https://eslint.org/docs/latest/use/migrate-to-10.0.0),
[Prettier integration](https://prettier.io/docs/integrating-with-linters),
[Biome capabilities](https://biomejs.dev/introduction/language-support/).
