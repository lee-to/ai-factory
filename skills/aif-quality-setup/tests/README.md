# Quality Setup Tests

`npm run build` then `npm run test:quality-setup` exercises the real installer and
npm package inventory. `npm test` includes this offline suite. It checks discovery,
all built-in agent transforms, supporting links, reinstall/repair, preservation of
unrelated installed files and exclusion of authoring tests. It does not install
project quality tools, call models or run the example hooks.

[Acceptance cases](acceptance.spec.md) are specifications for running the actual
skill in a user-facing runtime. They are not an executable replay suite. Creating
a fixture or asserting that an instruction exists does not prove agent behavior.

Copy [fixtures](fixtures/) into a disposable owned sandbox before a runtime case.
Initialize Git repositories/worktrees only there; do not use the AI Factory source
checkout or a user's existing repository. Review fixture code before execution.
Record the skill revision, agent/runtime, OS, native versions, selected scope,
commands, actual file/index evidence and PASS/FAIL/NOTRUN. Retain an earlier failure
when a changed candidate is retested.

Before runtime acceptance, state whether inference, network, dependency installs,
toolchain changes or lifecycle scripts may run; use existing authorization and
runtime permissions. Ordinary offline tests cannot establish Windows/Linux hook
execution, staged-content preservation or recommendation quality. Unavailable
environments remain NOTRUN rather than producing a fabricated passing transcript.

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
