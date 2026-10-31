# Example: Python Package

Discovery: project-managed environment, Python support range already declared,
no lint/formatter, optional mypy requested. Propose compatible Ruff plus a separate
type policy; keep the existing environment/dependency manager.

Merge selected settings into pyproject.toml, preserving other tables:

```toml
[tool.ruff]
line-length = 88

[tool.ruff.lint]
select = ["E4", "E7", "E9", "F"]
```

Set target-version only from the project's declared support policy. If Black or
Flake8 is already configured, propose extending its setup rather than migrating it.

Commands, executed through the detected environment and component CWD:

```text
ruff check .
ruff format --check .
mypy src
```

The source directory and optional typechecker are example choices; change them
to the actual package paths/policy. Fix commands (`ruff check --fix`, `ruff format`)
are separate from the above checks.

If the project already uses pre-commit and the chosen environment exposes these
binaries, local check-only hooks can be merged into its configuration:

```yaml
repos:
  - repo: local
    hooks:
      - id: python-lint
        name: Python lint
        entry: ruff check
        language: system
        types: [python]
      - id: python-format-check
        name: Python format check
        entry: ruff format --check
        language: system
        types: [python]
      - id: python-types
        name: Project typecheck
        entry: mypy src
        language: system
        pass_filenames: false
        always_run: true
        stages: [pre-push]
```

Install only the selected hook types after reviewing existing hooks; configure
the actual project environment in entrypoints when system PATH is insufficient.
`language: system` does not provision these tools. Managed remote hooks instead
need reviewed compatible revisions and may create separate environments.
Verify the installed manager's treatment of partial staging before autofix.
