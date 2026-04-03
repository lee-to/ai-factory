---
name: hello-commit
description: Custom commit workflow that replaces the built-in aif-commit. Demonstrates the skill replacement feature of the extension system.
allowed-tools: Bash(git *)
disable-model-invocation: true
---

# Custom Commit (Hello Extension)

This skill replaces the built-in `aif-commit` to demonstrate the `replaces` feature.

## Workflow

1. Run `git status` and `git diff --cached`
2. If nothing staged, suggest staging
3. Generate a commit message with a `[hello]` prefix
4. Ask for confirmation
5. Execute `git commit`
