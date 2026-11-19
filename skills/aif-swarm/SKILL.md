---
name: aif-swarm
description: Start, inspect, pause, resume or cancel a bounded local Swarm run with a lead, parallel Claude/Codex workers, isolated Git worktrees and verified integration. Use when the user explicitly wants autonomous parallel implementation through the Swarm Runtime.
argument-hint: '[start <goal> | status | pause | resume | cancel | inspect | logs] [run-id]'
disable-model-invocation: true
allowed-tools: Read Write Edit Glob Grep Bash(ai-factory swarm *) Bash(git status *) AskUserQuestion Questions
---

# Swarm

## Runtime-aware questions

Apply this contract whenever the workflow asks the user to decide:

- `AskUserQuestion` and `Questions` below describe the intended interaction, not a required tool name. Use only a question tool actually exposed and permitted in the current session/mode, with its advertised schema. Do not guess aliases, probe unavailable tools, or assume `questionnaire` exists. A frontmatter entry alone does not make a tool available.
- Ask one focused question at a time with clearly labelled options. Batch independent questions only if the actual tool schema supports it; respect its field names, limits, and selection semantics. For open-ended input, use native free-text support or plain text if the schema cannot represent the question. Use the resolved UI language.
- If no usable question tool exists (or it reports unavailable in this mode), ask the same question in plain text with numbered options and allow a free-text answer. Pause work that depends on that answer; independent read-only investigation may continue. Missing UI does not make the session autonomous.
- An empty/cancelled response, a preselected option, or elapsed time is not an answer or approval. Reuse an answer already given in the session instead of asking again.
- In a subagent/background run or explicit non-interactive mode (including `HANDOFF_MODE=1`), do not prompt the user directly. Use declared defaults only for optional preferences within the authorized scope and report assumptions. If a required decision, approval, or material scope/behavior choice remains unresolved, stop dependent work and return the missing decision and options to the parent/caller using its existing blocked/failure contract. Never invent consent or select a new scope to avoid blocking.

This delivery policy applies to this skill and its linked references. Preserve workflow-specific question scope, required confirmations, approval boundaries, and blocked-result rules.


## Shared project skill-context

Before mode routing or work, read existing files relative to the current project root in this order (reuse them if already loaded):

1. `.ai-factory/skill-context/global-skill-context.md` — all bundled skills.
2. `.ai-factory/skill-context/aif-swarm/SKILL.md` — this skill.

Missing files are skipped; an existing unreadable file stops dependent work with its path.
Precedence: individual > build (when applicable) > global > skill defaults; retain non-conflicting instructions and check all outputs against the effective rules.
These layers customize workflow; they do not replace the project's rules/architecture hierarchy or relax explicit requirements, ownership, scope, safety/privacy, validation, or approval boundaries. Report conflicts with those boundaries instead of overriding them.
`global` is a project-local layer, not home-directory configuration. Custom/extension skills do not automatically use it.


## 0. Resolve context

Read `.ai-factory/config.yaml` if present. Resolve `paths.description`,
`paths.architecture`, `paths.rules_file`, `paths.rules`, `rules.*`,
`language.ui`, `language.artifacts`, `language.technical_terms`, and `git.enabled`.
Use the existing default context paths when absent. Read applicable AGENTS.md,
description, architecture and rules. Existing unreadable context blocks startup.
Swarm requires Git; `git.enabled: false` blocks startup with an explanation.
No new config.yaml keys. Swarm settings live in `.ai-factory/swarm.yaml`.

Read [the runtime contract](references/SWARM-RUNTIME.md) before startup or recovery.
This skill delegates execution to `ai-factory swarm`; never implement a second
scheduler through native subagents or directly edit the database.
Shell commands use the current runtime's actual permissions. Missing executables,
access or approvals remain blockers; never substitute a different execution path.

## 1. Route the request

- `status`, `inspect`, `logs`: run the matching CLI command. Omit ID only for
  `status`; if several runs exist, ask which one for other operations.
- `pause`, `resume`, `cancel`: execute the user's selected action against the
  exact run. Reuse explicit authorization; cancellation kills active processes
  and preserves dirty worktrees and commits. Report preserved resources.
- Start/new goal: continue below. No goal and no action → show existing status,
  then ask whether to inspect a run or start a new goal.

## 2. Prepare a concrete run

Reuse an existing `.ai-factory/swarm.yaml` only after checking that its goal,
criteria, commands, provider choices, tool grants and budgets match this request.
Preserve user edits; never replace an existing spec with the example wholesale.
Use [swarm-spec.yaml](references/swarm-spec.yaml) as an example, not authorization.

Resolve the goal, global acceptance criteria and explicit check argv from the
user's request and verified project conventions. A command catalog is discovery,
not permission to execute. Checks and agent tools must be authorized for this run.
Ask for missing material choices, including acceptance criteria, verification,
provider choice, tool grants or external side effects. CLI defaults are optional
preferences; they never replace missing authorization.

Present the exact goal, criteria, commands, providers, approval policy and limits
before starting unless these exact choices were already authorized. Never infer
permission to publish, push, merge the source branch, access secrets, use shared
runtime resources, or start containers from permission to use Swarm. Worktrees
separate files and do not establish safe parallel use of databases or services.

Write only the resolved Swarm spec. Require a clean source checkout and a local
filesystem for SQLite. PostgreSQL is selected through `AIF_SWARM_DATABASE_URL`;
keep credentials out of the spec, prompts and reports. Do not install or start a
DB server automatically. SQLite requires Node.js >=22.13; other CLI commands
retain the package's Node.js requirement.

## 3. Start and observe

Run `ai-factory swarm start --spec .ai-factory/swarm.yaml`; save the returned ID
in the conversation, without rewriting project plans. Start `ai-factory swarm
serve` through an available background process/session capability. If unavailable,
provide that command and report **created, not executing**. Do not claim execution
from successful creation alone. Never start a second Runtime for the same project.

Use `status`, `inspect` and cursor-based `logs` to observe. Report blockers,
approvals and failed checks with task IDs and immutable Git refs. A pending
integration approval needs review of that exact submitted commit before
`ai-factory swarm approve <run-id> <approval-id>`. Rejection uses `reject`.
Rejecting final completion ends the run as `failed`; revisions need a new run.
An individual integration rejection blocks its task and retains the retry path.
Final completion requires independent verification and owner approval of the
integration ref. Merge or push to the source branch remains a separate action.

## 4. Recovery and honest completion

Restart the existing Runtime and inspect the same run; never create a duplicate
run to hide a failure. Expired claims are fenced and retried within limits.
Unknown token usage, interrupted processes, exhausted limits and failed global
verification require attention. Ask for a material policy/budget change rather
than silently raising limits. Do not mark tasks done from CLI exit or agent prose.
Report configured checks separately from observed checks and model review.

## Artifact Ownership

This skill owns an explicitly authorized `.ai-factory/swarm.yaml` spec only.
The Runtime owns `.ai-factory/swarm/`, its database records, event stream and
`aif/swarm/<run>/...` branches/worktrees. User-owned specs retain their edits.
DESCRIPTION, architecture, rules, roadmap, plans, config.yaml, native MCP settings
and other workflow artifacts remain with their existing owner commands.
