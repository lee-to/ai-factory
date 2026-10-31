# Rust Profile

Inspect Cargo.toml workspace/members/default-members, Cargo.lock policy,
rust-toolchain files, edition/MSRV, .cargo config/aliases, target/features, rustfmt
and Clippy settings. Read manifests as data during audit: Cargo commands can run
build scripts, compile dependencies, update caches/locks and access the network.

## Recommendation Rules

- Reuse established cargo aliases, task commands, format/lint rules and CI feature
  matrices. Prefer rustfmt/Clippy/compiler checks available for the actual toolchain.
- Propose separate format check, lint and compiler check where useful. Explain
  duplicated compilation work so the user can select an appropriate local/CI split.
- Infer the intended package/member scope from explicit project data and confirm
  uncertainty. Do not add `--workspace`, `--all-targets` or `--all-features` by habit:
  default members differ and some features cannot be enabled together.
- Keep MSRV/toolchain policy intact. Installing a missing toolchain component or
  moving to nightly is an explicit dependency change, not audit.
- A selected warnings-as-errors policy can use the native lint threshold. Preserve
  existing allow/deny policy and do not enable every pedantic lint automatically.

## Commands and Scope

Use the component/workspace's selected Cargo CWD and actual manifest/toolchain.
`cargo fmt --check` is a check; ordinary `cargo fmt` modifies working-tree files.
`cargo clippy` and `cargo check` are project/member checks, not staged-file commands.
Do not append staged paths to them or claim a full Cargo check verifies only index
contents. Respect target/features and the existing locked/offline dependency policy.

Offer full-component non-mutating checks on pre-push/CI when correct staged-format
isolation is unavailable. Direct rustfmt file execution needs correct edition/config
and a verified staging mechanism before it can be described as staged-aware.
No new Node requirement merely for hooks; compare suitable existing/system managers.

Adapt [the Rust example](../../examples/rust.md) and [hooks](hooks.md).
Report the exact member/feature/target coverage of verification.

Sources: [cargo check](https://doc.rust-lang.org/cargo/commands/cargo-check.html),
[Clippy usage](https://doc.rust-lang.org/clippy/usage.html),
[rustfmt](https://github.com/rust-lang/rustfmt).
