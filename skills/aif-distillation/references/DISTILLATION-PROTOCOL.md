# Distillation Protocol

Use this protocol to convert source material into a reusable Agent Skill.

## 1. Source Intake

Create a source inventory:

| Field | Meaning |
|-------|---------|
| Source | URL or local path |
| Type | book, docs, code, policy, tutorial, paper, notes |
| Scope | what the material covers |
| Signal | why it matters for the target skill |
| Gaps | missing context that may require another source |

For folders, group files by topic before reading deeply. For books, read the table of contents first, then sample each major part before deep extraction.

When the user passes `--redact-source-map`, keep any exact URLs, local paths,
repository paths, and source titles only in your private working inventory.
Generated skill files must use neutral source labels such as `Source A`,
`Book section 1`, or `Internal guide: authentication`, while preserving the
type, scope, and usage of each source.

## 2. Extraction

Extract only material that can drive agent behavior:

- concepts that change decisions
- named techniques, workflows, and checklists
- constraints and preconditions
- quality bars and failure modes
- examples that teach a reusable pattern
- code snippets, command examples, and worked examples that demonstrate a reusable decision or transformation
- terminology that prevents misunderstanding

For code-heavy sources, also build an example inventory:

| Source topic | Example type | Distilled example target |
|--------------|--------------|--------------------------|
| <topic> | snippet, before/after, test, debug trace, decision table | <examples file or "skip: reason"> |

This inventory is a planning tool. It does not need to be shipped verbatim, but
the final examples must visibly cover the major code-facing topics from it.

Skip:

- praise, marketing, introductions, and repetition
- historical context unless it changes practice
- examples that do not generalize
- long verbatim passages

## 3. Synthesis

Transform extracted material into:

- **Rules:** direct instructions an agent can follow
- **Heuristics:** judgment calls with conditions
- **Workflow:** ordered steps with inputs and outputs
- **Checklists:** gates for quality and completeness
- **Examples:** compact input/output or before/after cases
- **Pitfalls:** common mistakes and how to detect them

For programming material, do not stop at prose rules. If the source uses code
examples to teach a practice, create original snippets that preserve the lesson
without copying the source. Prefer small before/after examples, named code
patterns, decision tables, and test/refactoring examples that can be applied in
the target ecosystem. If the source examples are language-specific and the user
does not request a different language, keep the examples in that ecosystem.

For broad programming books or documentation sets, do not compress example
coverage into a handful of generic snippets. Cover the major example families:
abstraction/type design, routine/function shape, data/naming, control flow,
defensive boundaries, tests, debugging, refactoring, performance, comments, and
integration when the source covers them. A topic can be skipped only with a
specific reason, such as "covered by checklist only; no reusable code pattern."

When source material conflicts, keep both positions only if the context differs. Otherwise choose the stronger rule and note the reason in a reference.

## 4. Skill Design

Before writing, answer:

1. What task should trigger this skill?
2. Who benefits from it?
3. What should the agent produce?
4. What source-derived checks define success?
5. Which details belong in references instead of `SKILL.md`?

The target `SKILL.md` should fit in one screen when possible. It is the router and operating loop, not the knowledge base.

## 5. Split-Skill Design

Use this section only when the user passes `--split` or `--split-by <strategy>`.

Split source material into multiple skills when the material contains separate
capabilities that should activate on different user requests. A split set should
feel like a small toolkit of focused passes, not a chopped-up book summary.
If `--path <directory>` is present, create the split set under that output root
instead of the current agent `{{skills_dir}}`.

Supported strategies:

| Strategy | Use when | Boundary signal |
|----------|----------|-----------------|
| `auto` | the user wants several skills but did not prescribe boundaries | strongest distinct goals, triggers, workflows, examples, and target users |
| `goal` | the material supports several different jobs-to-be-done | each child helps the user accomplish a different outcome |
| `topic` | the source has clean domain or chapter boundaries | each topic produces different decisions or checks |
| `workflow` | the source teaches multiple actions | each action has a different input, output, or quality gate |
| `audience` | the source serves different roles or project contexts | each role/context needs different operating instructions |

Before writing split skills, create a boundary map:

| Child skill | User goal | Trigger | Source topics | References/examples | Merge risk |
|-------------|-----------|---------|---------------|---------------------|------------|
| <name> | <outcome it helps achieve> | <when it should activate> | <topics> | <files> | low/medium/high |

First resolve a shared split namespace prefix:

- use `--name` when the user supplied it
- otherwise derive the prefix from the book title or primary material title
- if source-map redaction is requested and the real title should stay private,
  use a neutral topic prefix instead of the exact title
- validate the prefix with the same skill-name rules as ordinary skills
- every generated child name must start with `<prefix>-`

Merge or drop a child candidate when:

- its trigger overlaps another candidate without a meaningful workflow
  difference
- it would contain only generic advice
- it depends on another child for basic operation
- it has no source-derived checks or examples

For broad code-quality material, good split candidates are often operation
passes such as readability refactoring, naming cleanup, condition
simplification, magic value extraction, exception-flow review, testability, and
framework-specific review. These names are examples, not required output.

For non-code material, use the same goal-first rule. Examples:

- writing or communication: `argument-edit`, `style-review`, `message-critique`
- strategy or management: `decision-brief`, `stakeholder-analysis`, `risk-review`
- operations or support: `incident-triage`, `runbook-review`, `escalation-plan`
- learning material: `concept-explainer`, `practice-drill`, `understanding-check`
- research material: `evidence-synthesis`, `claim-audit`, `literature-map`

Avoid source-theme children with unclear invocation intent.
If a candidate name makes a user ask "what does this do?", rename it around the
goal and expected output.

Every child skill must include its own source attribution unless
`--redact-source-map` is present. For small non-redacted children,
`references/SOURCE-MAP.md` may be the only reference; for larger children, add
focused references and examples. In redaction mode, do not create
`references/SOURCE-MAP.md`; keep source coverage in the private working
inventory and ship only the distilled instructions, references, and examples.

## 6. Existing-File Merge

Before creating any new reference or example:

1. List existing `references/`, `examples/`, `scripts/`, and `templates/`.
2. Compare intended topic names with existing file names and headings.
3. Update matching files when the new material fills gaps.
4. For code-heavy material, look for an existing code examples file such as
   `code-patterns.md`, `before-after.md`, or a topic-specific examples file and
   update it before creating a new one.
5. Create a new file only for a genuinely new topic.
6. Keep stable filenames so future updates do not fragment the skill.

For book-scale programming material, prefer multiple focused example files over
one shallow sampler, for example:

- `code-patterns.md` for local construction patterns
- `testing-debugging.md` for test and debugging examples
- `refactoring-optimization.md` for safe change and measurement examples
- `review-examples.md` for review findings and corrections

In split mode, perform this merge check across sibling skills too. A proposed
child should update an existing matching skill when the existing frontmatter
description and workflow already cover the same capability.

## 7. Traceability

Every distilled skill should include a source map in a reference unless
`--redact-source-map` is present:

```markdown
## Source Map

| Source | Used for |
|--------|----------|
| <path-or-url> | <principles, workflow, examples, checks> |
```

When `--redact-source-map` is present, do not create `references/SOURCE-MAP.md`
and do not add a "Source Map" section to any generated file. Do not write link
reference definitions, raw path fragments, repository paths, filenames that
reveal the source, exact URLs, or exact book/document titles anywhere as source
attribution. If a draft creates an empty `SOURCE-MAP.md`, remove it before
finishing. In `--update` mode, leave an existing non-empty `SOURCE-MAP.md`
unchanged unless the user explicitly asks to remove or rewrite it.

For non-redacted source maps, do not imply that every rule is a direct quote.
Distillation is synthesis; source maps explain provenance.

## 8. Quality Gate

Before finishing, check:

- `SKILL.md` explains what and when in frontmatter.
- `SKILL.md` stays concise and points to references/examples.
- References contain the dense knowledge.
- Examples are actionable and source-derived.
- Code-heavy sources have adapted code snippets in `examples/`; missing snippets
  are a blocking quality failure.
- Example coverage maps to the source areas. If references mention many
  code-facing topics but examples cover only a few, the skill is incomplete.
- Existing references/examples were updated instead of duplicated.
- Split mode only: each child skill has a distinct trigger, direct `<output-root>/<prefix>-<child>/` location, source attribution when not redacted, no `SOURCE-MAP.md` when redacted, and enough references/examples to operate independently.
- Split mode only: all generated child names share the same prefix derived from `--name`, the book title, or a neutral material namespace.
- Split mode only: no generated child is a near-duplicate of another generated or existing sibling skill.
- Temporary extraction files were removed.
- No long copyrighted passages were copied.
