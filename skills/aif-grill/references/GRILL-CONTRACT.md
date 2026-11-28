# Grilling Contract

Shared reference for `/aif-grill` and for any skill or extension that needs the
same questioning mechanics. Consume this file instead of keeping a second copy
of the algorithm.

## Terms

- **User-owned decision** — a choice only the user can make: scope, priorities,
  trade-offs, what "done" means, what must not break.
- **Fact** — anything answerable from code, docs, git history, configuration, or
  tools. Facts are never questions.
- **Dependency edge** — decision B cannot be asked sensibly until decision A is
  answered.
- **Frontier** — every open decision whose prerequisites are all closed.

## 1. Build the tree

List the material user-owned decisions and give each its prerequisites.

- Stay inside the original scope. Do not add nodes the request does not imply.
- Put decisions that change the amount of work ("which screens or modules are
  in scope") at the root, so they are asked in the first rounds and never end up
  in the final `Open:` list by accident.
- Skip decisions with one reasonable answer and no cost of being wrong; state
  the assumption in the result instead.

## 2. Find facts yourself

Look up every fact before asking. Use `Task` with `subagent_type: Explore` for
broad sweeps when it is available; otherwise use Glob/Grep/Read directly.

A fact that is still pending blocks only the nodes below it, not the rest of the
frontier. A fact that cannot be found is reported as missing evidence; it does
not become a question to the user unless only the user can know it.

## 3. Ask the whole frontier in one round

Number the questions. Give each a recommended answer and one line of why, citing
the fact behind it:

```
Q1 — <decision>
Recommended: <answer> — <why, citing the fact you found>
```

Put the recommended option first when options are discrete.

- Never reveal a downstream question before its prerequisites are answered. Do
  not announce the topics of later rounds or how many rounds are left.
- Never re-ask a decision the user already answered, in this session or in the
  caller's input.
- Never recommend an answer wider than what the user said. "Only provider A"
  stays only provider A.
- An empty or cancelled reply is not an answer. A deferred decision is recorded
  as open, not guessed.

## 4. Rebuild after the answers

Answers can add, drop, or reshape nodes. Recompute the frontier and run the next
round. Do not carry over a question whose premise an answer removed.

## 5. Stop when the frontier is empty

Not when the picture "seems clear". Then show the normalized result — one line
per decision, `D<n>. <decision> → <answer>`, plus `Open:` for anything deferred —
and ask for explicit confirmation. A correction reopens only the affected nodes
and the nodes below them.

## Boundaries

- No artifacts: the result is returned, not written.
- No implementation, planning, or file edits during the session.
- In a non-interactive run, return the unanswered frontier with recommendations
  as a blocker; never assume the answers.
