# Request Examples

## Create a Skill from One Book

```text
/aif-distillation ./books/domain-driven-design.pdf --name ddd-practices
```

Expected output:

- `{{skills_dir}}/ddd-practices/SKILL.md`
- `{{skills_dir}}/ddd-practices/references/SOURCE-MAP.md`
- dense references for tactical patterns, modeling workflow, and pitfalls
- examples for aggregate boundaries and ubiquitous language checks

## Create a Skill from Programming Material

```text
/aif-distillation ./books/code-quality.pdf --name code-quality-practices
```

Expected behavior:

- inventory the source's code snippets and worked examples
- create or update `examples/code-patterns.md` with original, compact code examples
- add more focused example files when the material spans testing, debugging, refactoring, optimization, review, or integration patterns
- map major code-facing source areas to concrete examples
- include before/after snippets when the source teaches transformations
- link the code examples from the target `SKILL.md`
- avoid verbatim copying while preserving the programming lesson

## Create a Skill from a Docs Folder

```text
/aif-distillation ./docs/internal-platform --name platform-operator
```

Expected behavior:

- read current docs structure
- save to `{{skills_dir}}/platform-operator/`
- avoid duplicating existing examples
- turn operational docs into agent instructions and checks
- ignore hidden/config/sensitive files in the source folder unless the user explicitly opts in

## Reject Unsafe Skill Names

```text
/aif-distillation ./docs --name ../foo
/aif-distillation ./docs --name aif-review
/aif-distillation ./docs --name .hidden
/aif-distillation ./docs --name C:\temp\skill
/aif-distillation ./docs --name clean/code
```

Expected behavior:

- reject the request before writing files
- explain that skill names must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`
- reserve `aif-*` names unless the user explicitly says they are developing AI Factory itself
- confirm the resolved target path would stay under `{{skills_dir}}`

## Update an Existing Skill

```text
/aif-distillation ./new-material ./examples --name platform-operator --update
```

Expected behavior:

- compare existing references and examples
- update matching files in place
- add only missing topics
- report changed files

## Create a Skill from URLs

```text
/aif-distillation https://example.com/guide https://example.com/reference --name example-api
```

Expected behavior:

- fetch the pages
- follow only critical sub-pages
- source-map all URLs used
- summarize rules and examples without long quoted passages
