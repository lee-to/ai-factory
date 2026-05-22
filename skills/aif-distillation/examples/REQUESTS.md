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

## Create Several Focused Skills from One Material Set

```text
/aif-distillation ./books/code-quality.pdf ./examples --split --name code-quality
```

Expected behavior:

- infer focused child skills from distinct practices rather than creating one broad skill
- use `code-quality` as the required shared namespace prefix
- prefer clear child names such as `code-quality-readability-refactor`, `code-quality-naming-cleanup`, `code-quality-condition-simplifier`, or `code-quality-testability-pass`
- write each child directly under `{{skills_dir}}/<prefix>-<child-scope>/`
- give every child a distinct frontmatter description and activation trigger
- include source attribution for every child unless `--redact-source-map` is present
- merge or skip candidates whose triggers overlap too much

## Save to a Custom Output Root

```text
/aif-distillation ./books/domain-driven-design.pdf --name ddd-practices --path ./distilled-skills
```

Expected output:

- `./distilled-skills/ddd-practices/SKILL.md`
- `./distilled-skills/ddd-practices/references/SOURCE-MAP.md`
- no writes to the current agent `{{skills_dir}}`
- resolved destination stays inside the resolved `--path` output root

## Split into a Custom Output Root

```text
/aif-distillation ./books/code-quality.pdf --split --name code-quality --path ./distilled-skills
```

Expected behavior:

- create direct child package directories under `./distilled-skills/`
- name every child with the shared `code-quality-` prefix
- do not create a parent `code-quality/` wrapper directory unless explicitly requested as an index/router skill

## Split by a Specific Strategy

```text
/aif-distillation ./docs/review-playbook --split-by workflow --name review
```

Expected behavior:

- split by recurring actions an agent performs, not by arbitrary file count
- name every child with the shared `review-` prefix, such as `review-triage` or `review-findings`
- create a boundary map before writing
- update matching existing child skills when `--update` is also present
- report created, updated, merged, and skipped candidates

## Split Non-Code Material by User Goals

```text
/aif-distillation ./books/decision-making.pdf --split-by goal --name decisions
```

Expected behavior:

- split by jobs the user wants help with, not by chapter titles
- create names such as `decisions-decision-brief`, `decisions-risk-review`, or `decisions-stakeholder-analysis`
- make every child explain what it does, when to use it, and what output it should produce
- avoid vague children such as `decisions-principles`, `decisions-mindset`, or `decisions-chapter-2`

## Redact Source Map Paths and Links

```text
/aif-distillation ./books/internal-review-guide.pdf --name review-guide --redact-source-map
```

Expected behavior:

- generate the skill normally
- do not create `references/SOURCE-MAP.md`
- do not create a "Source Map" section in `SKILL.md` or any reference file
- omit exact book titles, URLs, local paths, repository paths, filenames, and link reference definitions from generated files
- keep source coverage only in private working notes while still producing useful distilled instructions, references, and examples

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
- confirm the resolved target path would stay under the resolved output root (`{{skills_dir}}` by default, or `--path` when present)

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
- source-map all URLs used unless `--redact-source-map` is present; with redaction, do not create `SOURCE-MAP.md`
- summarize rules and examples without long quoted passages
