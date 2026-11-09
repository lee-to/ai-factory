# Quality Setup Tests

`npm run build` then `npm run test:quality-setup` exercises the real installer and
npm package inventory. `npm test` includes this offline suite. It checks discovery,
all built-in agent transforms, supporting links, reinstall/repair, preservation of
unrelated installed files and exclusion of authoring tests. It does not install
project quality tools, call models or run the example hooks.

The suite also restores all six real fixture sets and checks names, identical
bytes, nested roots, hidden contexts and inert imports/CLI. Invalid inputs, links,
restored-path collisions and partial-copy cleanup must preserve existing data.
Unavailable link creation is reported as NOTRUN for that case.

[Acceptance cases](acceptance.spec.md) are specifications for running the actual
skill in a user-facing runtime. They are not an executable replay suite. Creating
a fixture or asserting that an instruction exists does not prove agent behavior.

## Preparing runtime fixtures

[Fixtures](fixtures/) store manifests, build configs and source files with a final
`.stub` suffix, keeping their real project/source names out of the checkout.
These stubs are complete fixture files; their contents are not interpolated.
From the AI Factory repository root, prepare a new disposable project:

```sh
node skills/aif-quality-setup/tests/prepare-fixture.mjs js-ts
```

Choose `js-ts`, `php`, `python`, `rust`, `mixed` or `multirepo`. The helper prints
the absolute project path to stdout and diagnostics to stderr. It creates a new
directory in the system temporary directory, outside the source checkout, copies
all files including hidden `.ai-factory` contexts, and removes one final
`.stub` from file names while preserving their bytes. It does not execute
fixture code, Git, package scripts, dependency installs or hooks. Do not restore
real names inside this checkout or use a plain copy of the stubs as a project.

In the prepared `mixed` directory, `backend` and `web` retain their original
relationship to the root workspace. In `multirepo`, use the `api`, `worker` and
`gateway` directories as separate project roots; their supplied contexts and
missing-context defaults remain independent. `DEBUG=1` enables per-file copying
diagnostics; `LOG_LEVEL=debug|info|error|silent` explicitly controls stderr logging.

Initialize Git repositories/worktrees only in the prepared project; do not use
the AI Factory source checkout or a user's existing repository. Review fixture
code before execution.
Record the skill revision, agent/runtime, OS, native versions, selected scope,
commands, actual file/index evidence and PASS/FAIL/NOTRUN. Retain an earlier failure
when a changed candidate is retested.

Before runtime acceptance, state whether inference, network, dependency installs,
toolchain changes or lifecycle scripts may run; use existing authorization and
runtime permissions. Ordinary offline tests cannot establish Windows/Linux hook
execution, staged-content preservation or recommendation quality. Unavailable
environments remain NOTRUN rather than producing a fabricated passing transcript.

## IDE indexing acceptance

Open the source checkout in the IDE that exhibited the indexing problem and
refresh its index. Check that the renamed fixture manifests no longer introduce
projects and that the renamed source files are no longer indexed as source units.
Record the IDE/version, inspected paths and actual observations. The offline
suite proves storage and restoration behavior; it does not prove this IDE result.
If the IDE is unavailable, retain NOTRUN for this issue acceptance criterion.

## Opt-in native staging regression

`npm run test:quality-setup:native` without arguments reports NOTRUN (exit 2) and
does not execute tools. It is deliberately absent from `npm test` and the offline
installation suite. Use Node ^22.22.1 or >=24, Git with POSIX shell hook support,
and exactly Husky 9.1.7, lint-staged 17.6.0 and Prettier 3.9.10:

```sh
# Reuse an existing disposable project's pinned dependencies, without downloads:
npm run test:quality-setup:native -- --run --dependencies "/path/to/dependency-project"
# Or explicitly allow downloading pinned dev tools into the sandbox (no scripts):
npm run test:quality-setup:native -- --run --install-dependencies
```

The script copies dependencies to a newly owned temporary directory, creates real
Git repositories/commits, installs Husky there and executes real formatter hooks.
It verifies check/fix-and-stop/fix-and-stage with staged and unstaged hunks, paths
with spaces, unrelated bytes, HEAD/index/worktree and failure causes. A separate
negative probe records actual LF/CRLF restoration under local autocrlf conflict;
passing that probe does not certify conflicting policy as safe. It never changes
the source checkout's dependencies/hooks/index or global/system Git configuration.

Use `--sandbox-parent <existing-dir>` to keep runs in thread storage. Each run
prints its evidence path (`result.json` plus real hook logs and fixtures), platform,
versions, source revision and skill fingerprint. Retain failures. `--cleanup`
removes only its verified owned sandbox on success, after printing the evidence;
omit it when receipts must be retained. Missing tools/dependencies or denied
preflight execution are NOTRUN (exit 2), as are unsupported Node or an unselected
run. Wrong dependency versions and violated assertions fail (exit 1).

Run independently on Windows and Linux. These native results establish only the
tested manager combination and policy, not the agent's recommendations or actual
skill invocation. A01–A17 still require the separate acceptance procedure above.
