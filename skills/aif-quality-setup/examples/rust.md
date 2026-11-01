# Example: Rust Crate or Workspace

Discovery: stable toolchain, existing Cargo.lock policy, rustfmt and Clippy already
available. Recommend native commands with the project's actual member/features.

For a single crate with default features:

```text
cargo fmt --check
cargo clippy -- -D warnings
cargo check
```

Warnings-as-errors is a selected policy, not an automatic change to an existing
project. For a workspace that explicitly selects every member, commands may use
`cargo fmt --all --check`, `cargo clippy --workspace -- -D warnings` and
`cargo check --workspace`. Confirm those scopes; do not add all-features/targets
without examining the supported matrix. Native commands can create build caches
and execute build scripts.

Keep existing aliases. If the user wants missing convenience aliases, merge them
into .cargo/config.toml:

```toml
[alias]
quality-lint = "clippy -- -D warnings"
quality-types = "check"
```

For an existing appropriate Lefthook installation, a selected full-crate pre-push
configuration can be merged into lefthook.yml:

```yaml
pre-push:
  commands:
    rust-format:
      run: cargo fmt --check
    rust-lint:
      run: cargo clippy -- -D warnings
```

These commands operate on the working tree and whole selected crate. They are
not staged-only checks and receive no filename substitution. Keep existing hook
ordering; decide whether concurrency is appropriate for commands sharing Cargo
artifacts. Do not introduce Node solely to install a hook manager.
