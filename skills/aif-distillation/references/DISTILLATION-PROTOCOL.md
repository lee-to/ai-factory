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

## 5. Existing-File Merge

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

## 6. Traceability

Every distilled skill should include a source map in a reference:

```markdown
## Source Map

| Source | Used for |
|--------|----------|
| <path-or-url> | <principles, workflow, examples, checks> |
```

Do not imply that every rule is a direct quote. Distillation is synthesis; source maps explain provenance.

## 7. Quality Gate

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
- Temporary extraction files were removed.
- No long copyrighted passages were copied.
