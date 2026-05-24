# `aif-improve` worked examples

This file collects the worked examples that previously lived inline in `SKILL.md`. The parent skill defers to this document so the main file stays under the soft skill-size budget; the examples themselves are non-normative and exist as a reading aid.

The `--list` mode example lives in `references/LIST-MODE.md`. The `+check` mode example lives in `references/CHECK-MODE.md` — these two are not duplicated here.

## Example 1: Auto-review (no arguments)

```
User: /aif-improve

→ Found plan: .ai-factory/plans/feature-user-auth.md
→ 6 tasks in plan
→ Deep codebase analysis...
→ Found: project uses middleware pattern for auth, plan misses middleware task
→ Found: Task #3 description doesn't mention existing UserService
→ Found: Task #5 depends on Task #3 but no dependency set

Report:
- 1 missing task (auth middleware)
- 1 task to improve (reference UserService)
- 1 dependency to fix

Apply? → Yes → Changes applied
```

## Example 2: With user prompt

```
User: /aif-improve добавь обработку ошибок и валидацию входных данных

→ Found plan: <resolved fast plan path>
→ 4 tasks in plan
→ User wants: error handling + input validation
→ Analyzing each task for missing error handling...
→ Found: none of the tasks mention input validation
→ Found: error handling is inconsistent

Report:
- 2 tasks improved (added validation details to descriptions)
- 1 new task (create shared validation utils)
- Updated task descriptions with error handling patterns from codebase

Apply? → Yes → Changes applied
```

## Example 3: No plan found

```
User: /aif-improve

→ Branch: <current-branch-or-empty>
→ No matching branch-based full plan found
→ No resolved fast plan found
→ No resolved fix plan found
→ No plan file found

"No active plan found. Create one first:
- /aif-plan full <description>
- /aif-plan fast <description>
- /aif-fix <bug description>"
```

## Example 4: Explicit plan file

```
User: /aif-improve @my-custom-plan.md add rollback and edge-case handling

→ Explicit plan override: my-custom-plan.md
→ Found plan: my-custom-plan.md
→ User wants: rollback + edge-case handling
→ Deep codebase analysis...
→ Report prepared
```

## Example 5: Plan already looks good

```
User: /aif-improve

→ Found plan: .ai-factory/plans/feature-product-search.md
→ 5 tasks in plan
→ Deep analysis... all tasks well-defined, dependencies correct
→ No significant improvements found

"Plan looks solid! Ready to implement:
/aif-implement"
```
