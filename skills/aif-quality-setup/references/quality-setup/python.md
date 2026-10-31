# Python Profile

Inspect pyproject.toml, lockfiles, requirements, setup/tox/nox files, Python
constraints, existing virtual environment/tool entrypoints, framework and tool
configs. Keep uv/Poetry/PDM/pip or the established environment workflow. Do not
replace it or create a second dependency management system for this skill.

## Recommendation Rules

- Reuse existing Ruff/Black/isort/Flake8 and mypy/Pyright choices. Do not migrate
  Black/Flake8 simply because a unified option exists.
- For a new compatible setup, Ruff can supply lint and formatting with distinct
  check/fix commands. Check current rule compatibility, target Python and include/
  exclude scope before proposing a combined configuration.
- Offer a typechecker separately according to annotations, framework plugins,
  existing policy and environment. Ruff lint is not a typecheck. Explain a
  limited initial type scope if relevant; do not silently ignore diagnostics.
- Match tool versions and configured target version to the supported Python
  range. Dev dependencies belong in the project's established mechanism.

## Commands and Scope

Run tools in the selected component environment, not an arbitrary global Python.
Separate `ruff check`, formatter check, optional typecheck and mutating fix commands.
Determine the actual package/source paths; do not assume every project uses src/.

For hooks, an existing pre-commit setup is often suitable to extend; explain that
managed hook environments may provision dependencies and differ from the project's
typecheck environment. A project-wide typechecker should use that project environment
and must not receive staged filenames. For local hooks using it, explicitly choose
no filename passing and show full-project scope.

Without a staged-content runner, file arguments read working-tree contents,
including unstaged edits. Explain the limitation before choosing an event/autofix
mode. Do not install Node solely for hooks in a Python project.

Adapt [the Python example](../../examples/python.md) and the common
[hook contract](hooks.md). Preserve existing interpreter paths and local overrides.

Sources: [Ruff configuration](https://docs.astral.sh/ruff/configuration/),
[linter](https://docs.astral.sh/ruff/linter/),
[formatter](https://docs.astral.sh/ruff/formatter/),
[mypy on existing projects](https://mypy.readthedocs.io/en/stable/existing_code.html),
[pre-commit](https://pre-commit.com/).
