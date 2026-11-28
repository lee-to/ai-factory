---
name: aif-grill
description: Interview the user in rounds over a tree of dependent decisions until no user-owned decision is left open. Facts are found by the agent; decisions are made by the user. Writes no artifact and returns a confirmed decision list to the caller or the user. Use for "grill me", "interview me", "stress-test this idea", or when clarifying decisions depend on each other.
argument-hint: "<idea, plan, or question to grill>"
allowed-tools: Read Glob Grep AskUserQuestion Questions Task
disable-model-invocation: false
---

# Grill - Rounds Over a Decision Tree

## Runtime-aware questions

Apply this contract whenever the workflow asks the user to decide:

- `AskUserQuestion` and `Questions` below describe the intended interaction, not a required tool name. Use only a question tool actually exposed and permitted in the current session/mode, with its advertised schema. Do not guess aliases, probe unavailable tools, or assume `questionnaire` exists. A frontmatter entry alone does not make a tool available.
- Ask one focused question at a time with clearly labelled options. Batch independent questions only if the actual tool schema supports it; respect its field names, limits, and selection semantics. For open-ended input, use native free-text support or plain text if the schema cannot represent the question. Use the resolved UI language.
- If no usable question tool exists (or it reports unavailable in this mode), ask the same question in plain text with numbered options and allow a free-text answer. Pause work that depends on that answer; independent read-only investigation may continue. Missing UI does not make the session autonomous.
- An empty/cancelled response, a preselected option, or elapsed time is not an answer or approval. Reuse an answer already given in the session instead of asking again.
- In a subagent/background run or explicit non-interactive mode (including `HANDOFF_MODE=1`), do not prompt the user directly. Use declared defaults only for optional preferences within the authorized scope and report assumptions. If a required decision, approval, or material scope/behavior choice remains unresolved, stop dependent work and return the missing decision and options to the parent/caller using its existing blocked/failure contract. Never invent consent or select a new scope to avoid blocking.

This delivery policy applies to this skill and its linked references. Preserve workflow-specific question scope, required confirmations, approval boundaries, and blocked-result rules. This skill is config-agnostic: use the conversation language for questions; do not read config.yaml just for question delivery.

One round of this skill is one logical batch of independent decisions. Deliver
it under the contract above: use native batching only when the actual tool
supports it; otherwise ask the round as plain numbered text.

Shell commands are not pre-approved by this skill. If command evidence is needed,
use an exposed shell tool under the runtime's existing permissions and request
approval when required. Never broaden permissions or use another execution path
to work around a denied command; report missing command evidence explicitly.

## Shared project skill-context

Before mode routing or work, read existing files relative to the current project root in this order (reuse them if already loaded):

1. `.ai-factory/skill-context/global-skill-context.md` — all bundled skills.
2. `.ai-factory/skill-context/aif-grill/SKILL.md` — this skill.

Missing files are skipped; an existing unreadable file stops dependent work with its path.
Precedence: individual > build (when applicable) > global > skill defaults; retain non-conflicting instructions and check all outputs against the effective rules.
These layers customize workflow; they do not replace the project's rules/architecture hierarchy or relax explicit requirements, ownership, scope, safety/privacy, validation, or approval boundaries. Report conflicts with those boundaries instead of overriding them.
`global` is a project-local layer, not home-directory configuration. Custom/extension skills do not automatically use it.

Close every decision the user owns before work that depends on it starts. This
skill asks; it does not plan, implement, or write files.

## When to grill

- Explicit `/aif-grill` → always.
- Called from another skill → only when the open user-owned decisions contain at
  least one **dependency edge** (the answer to B depends on the answer to A) or
  clearly need more than one round.
- One simple fork → an ordinary question. Several independent questions that fit
  one round → an ordinary batch of questions. Do not grill a clear request.

Routing between neighbours: facts about the system are missing → `/aif-explore`;
user decisions are missing → this skill; both → explore gathers the facts, then
this skill closes the decisions; everything is defined → `/aif-plan`.

## Resolve the mode first

Before asking anything, determine whether the run is interactive. If the caller
passed `HANDOFF_MODE` as explicit text in the prompt, use that value; when called
from another skill, inherit the caller's resolved value. Otherwise read the
environment with an exposed shell tool (`printenv HANDOFF_MODE`). A value that is
only in the environment is invisible until it is read.

## Workflow

Read [the grilling contract](references/GRILL-CONTRACT.md) in full before the
first round and follow it. If it is missing or unreadable, STOP and report its
path. In short:

1. Build the tree of material decisions the user owns, each with its prerequisites.
2. Find every fact yourself; never ask the user for a fact.
3. Ask the whole frontier — every decision whose prerequisites are closed — in
   one numbered round, each with a recommended answer and one line of why.
4. Rebuild the tree after the answers and repeat.
5. Stop when the frontier is empty, show the normalized result, and ask for
   explicit confirmation.

## Non-interactive runs

In `HANDOFF_MODE=1`, a subagent/background run, or another non-interactive mode:
do not ask and do not guess answers. Still do steps 1-2, then return the
unanswered frontier, each question with its recommended answer, and stop:

```
BLOCKED [aif-grill] <n> user decisions open:
Q1. <decision> — recommended: <answer> (<why>)
Q2. ...
```

The caller maps this to its own blocked/failure contract. A recommended answer
is not a decision and must not be applied as one.

## Output contract

Return to the caller, or show the user after an explicit `/aif-grill`:

```
Decisions:
D1. <decision> → <answer>
D2. ...
Open: <decisions the user deferred, or "none">
Facts used: <fact> (<path or source>)
```

Write nothing to disk. The caller owns its artifact (plan, research, fix plan)
and decides where the decisions are recorded. Do not act on the result before
the user has confirmed it.
