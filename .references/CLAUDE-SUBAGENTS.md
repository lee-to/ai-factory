# REFERENCE: Claude Code Subagents

Updated: 2026-03-18

Purpose: internal working reference for designing and maintaining custom Claude Code subagents for this repo, especially multi-role and higher-complexity flows.

Primary official sources:
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/agent-teams

## 1. What To Use

Use a skill when:
- The workflow should run in the main conversation context.
- The task depends heavily on existing conversation state.
- We want reusable instructions, not isolated execution.

Use a subagent when:
- The task is self-contained and can return a summary/result.
- We want a separate context window.
- We want a different model, toolset, permission mode, hooks, memory, or MCP scope.
- We want noisy work (tests, logs, docs scraping, analysis) kept out of the main context.

Use an agent team when:
- Workers must communicate directly with each other.
- Parallel work needs independent coordination, not just "do work and report back".
- The task spans multiple owners/layers and benefits from live collaboration.

Important distinction:
- Subagents report back only to the caller.
- Agent teams are separate Claude Code sessions with teammate-to-teammate communication.
- Agent teams are experimental and disabled by default.

## 2. Hard Constraints And Facts

- Normal subagents cannot spawn other subagents.
- If we need nested delegation, orchestration must happen from the main conversation, or from a custom agent started as the main thread via `claude --agent <name>`.
- The markdown body of the agent file becomes the agent's system prompt.
- A subagent does not receive the full default Claude Code system prompt.
- Only `name` and `description` are required frontmatter fields.
- If `tools` is omitted, the subagent inherits all tools from the parent, including MCP tools.
- Subagents do not inherit skills from the parent conversation.
- If skills are listed in `skills:`, the full skill content is injected into the subagent context at startup.
- Manual subagent files are loaded at session start. After creating/editing manually, restart the session or use `/agents` to load immediately.
- Duplicate agent names are resolved by priority. Higher-priority location wins.
- The old `Task(...)` naming still works as an alias, but official docs now use `Agent(...)`. Prefer `Agent` in new definitions and docs.

## 3. Scope, Storage, Priority

| Scope | Location | Priority | Best use |
|---|---|---:|---|
| Session | `claude --agents '{...}'` | 1 | quick experiments, automation, temporary agents |
| Project | `.claude/agents/` | 2 | repo-shared agents under version control |
| User | `~/.claude/agents/` | 3 | personal agents reused across projects |
| Plugin | plugin `agents/` dir | 4 | distributed agents from plugins |

Rules:
- For this repo, team-shared agents belong in `.claude/agents/`.
- User-level agents are for personal tooling, not repo behavior.
- Plugin agents have restrictions: `hooks`, `mcpServers`, and `permissionMode` are ignored there.

Useful commands:
- `/agents` - interactive browser/editor for agents
- `claude agents` - list configured agents in CLI
- `claude --agent <name>` - run whole session as that agent
- `claude --agents '{...}'` - define temporary session-only agents

## 4. File Format

Minimal example:

```md
---
name: code-reviewer
description: Expert code review specialist. Use proactively after code changes.
tools: Read, Grep, Glob, Bash
model: sonnet
maxTurns: 6
---

You are a code reviewer.

When invoked:
1. Inspect the relevant changes.
2. Focus on concrete issues.
3. Return prioritized findings only.
```

Naming rules:
- `name` should use lowercase letters and hyphens.
- `description` should explain when Claude should delegate to this agent.
- Add phrases like `Use proactively` when we want automatic delegation to happen more often.

Prompt design rules:
- State exact input assumptions.
- State exact output contract.
- State what the agent must not do.
- Prefer deterministic output for machine-consumed steps.
- For orchestrators/evaluators, require JSON-only output.

## 5. Supported Frontmatter Fields

| Field | Meaning | Notes |
|---|---|---|
| `name` | unique identifier | required; lowercase + hyphens |
| `description` | delegation trigger text | required; critical for auto-routing |
| `tools` | allowlist of tools | if omitted, inherits all |
| `disallowedTools` | denylist | removes from inherited/specified set |
| `model` | `haiku`, `sonnet`, `opus`, full model id, or `inherit` | default is `inherit` |
| `permissionMode` | permission behavior | `default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, `plan` |
| `maxTurns` | max agentic turns | important safety valve |
| `skills` | preloaded skills | full skill content injected; not inherited automatically |
| `mcpServers` | extra or scoped MCP servers | strings reuse existing servers; inline defs stay agent-scoped |
| `hooks` | lifecycle/tool hooks | all hook events supported |
| `memory` | persistent memory scope | `user`, `project`, `local` |
| `background` | always run in background | default `false` |
| `isolation` | isolated execution mode | `worktree` creates temp git worktree |

## 6. Model Selection Heuristics

Use `haiku` for:
- fast read-only exploration
- prep/check agents
- routing/planning when reasoning depth is modest

Use `sonnet` for:
- evaluators
- writers/refiners
- debuggers
- agents that transform research into decisions or edits

Use `opus` only when:
- the reasoning is unusually hard
- the cost/latency tradeoff is justified

Use `inherit` when:
- the parent session model choice should control quality/cost

## 7. Tools, Permissions, And Safety

Default rule:
- For serious agents, explicitly set `tools:`. Do not rely on full inheritance unless there is a clear reason.

Recommended splits:
- Reader/researcher: `Read`, `Glob`, `Grep`, maybe `Bash`
- Writer/refiner: `Read`, `Write`, `Edit`, maybe `Glob`, `Grep`
- Evaluator/critic: usually read-only
- Browser/MCP specialist: minimal built-in tools plus scoped `mcpServers`

Permission guidance:
- `plan` for planning-only agents
- `default` for most agents
- `acceptEdits` for trusted editors when edit approval noise is a problem
- `dontAsk` for background/read-mostly agents that should fail closed
- `bypassPermissions` only with deliberate trust and strong guardrails

Important behavior:
- If the parent runs with `bypassPermissions`, the child cannot override that.
- Background agents get permissions approved up front, then inherit them.
- Background agents auto-deny anything not pre-approved.
- If a background agent needs clarifying questions, that tool call fails and the agent continues.

## 8. Complex-Agent Architecture Patterns

### 8.1 Single-responsibility agents

Best practice from the docs and from this repo:
- one role per file
- one clear input/output contract
- narrow toolset
- `maxTurns` kept small

Good roles:
- `researcher`
- `planner`
- `evaluator`
- `critic`
- `writer`
- `refiner`
- `test-runner`
- `db-reader`
- `browser-tester`

### 8.2 Coordinator pattern

If we need an orchestrator that decides which worker runs next:
- make the orchestrator a custom agent
- start the whole session with `claude --agent orchestrator`
- allow only explicit worker types with `tools: Agent(worker-a, worker-b), Read, ...`

Do not expect this to work when the orchestrator itself is invoked as a normal subagent:
- ordinary subagents cannot spawn subagents
- nested delegation must happen from the main thread

### 8.3 Read-only evaluation chain

Reliable pattern:
1. `producer` creates artifact
2. `evaluator` returns strict pass/fail JSON
3. `critic` converts failures into minimal fix instructions
4. `refiner` edits only what is required

This is already the dominant pattern in this repo's loop agents.

### 8.4 Noisy-task isolation

Use subagents for:
- large test runs
- log processing
- documentation fetching
- broad codebase scans

Reason:
- verbose output stays in the agent context
- only the summary returns to the parent

### 8.5 Worktree isolation

Use `isolation: worktree` when:
- the agent may make risky edits
- we want a clean isolated copy of the repo
- parallel edit collision risk is high

Notes:
- Claude Code creates a temporary git worktree.
- If the subagent makes no changes, the worktree is cleaned up automatically.
- `WorktreeCreate` / `WorktreeRemove` hooks let us customize creation/removal for non-git flows.

## 9. Hooks Reference For Subagents

Hooks can be defined:
- in agent frontmatter, scoped only to that agent lifetime
- in `settings.json`, scoped to the main session

Most relevant events for subagents:
- `PreToolUse`
- `PostToolUse`
- `Stop` in frontmatter, which is converted to `SubagentStop`
- `SubagentStart` and `SubagentStop` in project/user settings
- `WorktreeCreate` and `WorktreeRemove` when using isolation

Hook matcher facts:
- Matchers are regex.
- Tool events match tool names.
- MCP tool names look like `mcp__<server>__<tool>`.
- Some events ignore matchers entirely, including `Stop`, `WorktreeCreate`, and `WorktreeRemove`.

Hook handler types:
- `command`
- `http`
- `prompt`
- `agent`

Important hook details:
- Command hooks receive JSON on stdin.
- HTTP hooks receive the same JSON as POST body.
- `PreToolUse` can return structured permission control such as allow/deny/ask.
- `PreToolUse` can also modify the tool input before execution.
- `once: true` is supported for skills, not agents.
- Use `"$CLAUDE_PROJECT_DIR"` when referencing project-local hook scripts.

Useful `PreToolUse` pattern:

```yaml
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/validate-command.sh"
```

Important `WorktreeCreate` fact:
- the hook must print the absolute worktree path to stdout
- other output should go to stderr

## 10. MCP Strategy

Use `mcpServers` when:
- the agent needs tools the parent session should not carry
- we want to avoid consuming parent context with MCP tool descriptions

Patterns:
- String entry like `github` reuses an already configured MCP server.
- Inline entry creates an agent-scoped server definition.

Example:

```yaml
mcpServers:
  - playwright:
      type: stdio
      command: npx
      args: ["-y", "@playwright/mcp@latest"]
  - github
```

Recommendation:
- keep heavy MCP servers inline on the specific agent that needs them
- do not expose browser/db/tooling MCPs to every session by default

## 11. Persistent Memory

Memory scopes:
- `user` -> `~/.claude/agent-memory/<agent-name>/`
- `project` -> `.claude/agent-memory/<agent-name>/`
- `local` -> `.claude/agent-memory-local/<agent-name>/`

What memory does:
- gives the agent a persistent directory across sessions
- injects instructions for reading/writing memory
- includes the first 200 lines of `MEMORY.md` in the prompt
- automatically enables `Read`, `Write`, and `Edit`

Use `user` by default when:
- the learnings apply across many repos

Use `project` when:
- the knowledge is repo-specific and should be shared

Use `local` when:
- the knowledge is repo-specific but should not be committed

Good memory use cases:
- code reviewers tracking recurring issues
- debuggers remembering known failure modes
- architecture reviewers mapping major codepaths

## 12. Invocation And Session Modes

Ways to invoke:
- natural language mention: Claude decides whether to delegate
- `@` mention: forces that agent for one task
- `claude --agent <name>`: makes that agent the main thread for the whole session
- `.claude/settings.json` with `"agent": "<name>"`: project-wide default agent

Important `--agent` behavior:
- the agent prompt replaces the default Claude Code system prompt for that session
- this is the right mode for coordinator-style agents that must spawn other workers

Background vs foreground:
- foreground blocks and can surface permission prompts and clarifying questions
- background runs concurrently, but must rely on pre-approved permissions

If background execution becomes a problem:
- re-run the same task in foreground mode

## 13. Context, Resume, And Long Runs

Context facts:
- each subagent invocation starts fresh
- completed agents can be resumed instead of restarted
- resumed agents retain prior conversation history, tool calls, and results

Transcript location:
- `~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl`

Lifecycle facts:
- subagent transcripts are separate from the main conversation transcript
- main conversation compaction does not erase subagent transcripts
- transcript cleanup defaults to 30 days

Compaction:
- auto-compaction triggers at about 95% capacity
- `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` can lower that threshold

## 14. Current Repo Inventory

Existing project agents in `.claude/agents/`:

| Agent | Role | Model | Tools |
|---|---|---|---|
| `plan-coordinator` | iterative plan refinement coordinator — launches `plan-polisher` in a critique→improve loop until plan passes or iteration budget exhausted. Accepts `tests`/`docs` params (`yes`/`no`/`infer`; default `infer`) and passes them to each `plan-polisher` invocation. Run as `claude --agent plan-coordinator` | `inherit` | `Agent(plan-polisher), Read, Glob, Grep, Bash` |
| `implement-coordinator` | parallel execution coordinator — parses plan dependency graph, implements single tasks directly with sidecars, dispatches `implement-worker` workers for parallel tasks, merges results. Run as `claude --agent implement-coordinator` | `inherit` | `Agent(implement-worker, best-practices-sidecar, commit-preparer, docs-auditor, review-sidecar, security-sidecar), Read, Write, Edit, Glob, Grep, Bash` |
| `implement-worker` | isolated worktree worker for parallel task execution — implements one task, runs local quality checks, returns results to coordinator | `inherit` | `Read, Write, Edit, Glob, Grep, Bash` |
| `best-practices-sidecar` | background read-only best-practices worker | `inherit` | `Read, Glob, Grep` |
| `commit-preparer` | background read-only commit preparation worker | `sonnet` | `Read, Glob, Grep` |
| `docs-auditor` | background read-only docs drift worker | `sonnet` | `Read, Glob, Grep` |
| `loop-orchestrator` | routes next loop role | `sonnet` | `Read, Glob, Grep` |
| `loop-planner` | short iteration plan | `haiku` | `Read, Glob, Grep` |
| `loop-producer` | produce artifact | `inherit` | `Read, Write, Edit, Glob, Grep` |
| `loop-evaluator` | strict verdict JSON | `inherit` | `Read, Glob, Grep` |
| `loop-critic` | turn failures into fixes | `sonnet` | `Read` |
| `loop-refiner` | minimal artifact edits | `inherit` | `Read, Write, Edit, Glob, Grep` |
| `loop-test-prep` | lightweight test prep | `haiku` | `Read, Glob, Grep` |
| `loop-perf-prep` | performance prep | `haiku` | `Read, Glob, Grep` |
| `loop-invariant-prep` | invariants/consistency prep | `haiku` | `Read, Glob, Grep` |
| `plan-polisher` | run `/aif-plan`, critique the result, and loop `/aif-improve` until stable. Accepts `tests`/`docs` params (`yes`/`no`/`infer`; default `infer` — auto-detects from project) | `inherit` | `Read, Write, Edit, Glob, Grep, Bash` |
| `review-sidecar` | background read-only review worker | `inherit` | `Read, Glob, Grep` |
| `security-sidecar` | background read-only security worker | `inherit` | `Read, Glob, Grep` |

Patterns already worth preserving here:
- role-specific agents
- strict output contracts
- read-only prep/evaluation roles
- cheap model for prep, stronger model for transformation/judgment
- small `maxTurns`
- no hidden delegation inside workers
- use `skills:` for domain injection when a worker must follow existing AI Factory workflows
- keep multi-skill workers explicit about which findings are blocking vs non-blocking
- use background workers only for read-only noisy checks that can fail closed

## 15. Recommended Conventions For New Agents In This Repo

- Put repo-shared agents in `.claude/agents/`.
- Use one file per role, one concern per agent.
- Prefer explicit `tools:` allowlists.
- Put output schemas directly in the prompt.
- For machine-consumed results, require JSON only.
- Keep readers read-only.
- Split "judge" from "writer".
- Add `maxTurns` deliberately; do not leave complex agents unbounded.
- Use `skills:` for domain injection instead of copying long instructions into every agent.
- Use `memory:` only when we want durable learning, not by default.
- Use `isolation: worktree` for risky editor agents.
- Prefer `Agent(...)` terminology in new docs/prompts.

## 16. Ready-To-Copy Templates

### 16.1 Read-only evaluator

~~~~md
---
name: strict-evaluator
description: Evaluate output against explicit rules and return machine-readable verdicts. Use proactively after generation steps.
tools: Read, Glob, Grep
model: sonnet
maxTurns: 5
---

You are a strict evaluator.

Input:
- candidate artifact
- explicit rules

Output JSON only:
```json
{
  "passed": false,
  "failed": [],
  "warnings": [],
  "notes": []
}
```

Rules:
- Evaluate only against explicit rules.
- No redesign advice.
- No file edits.
~~~~

### 16.2 Trusted isolated editor

~~~~md
---
name: isolated-editor
description: Implement contained code changes in isolation and report the final diff summary.
tools: Read, Edit, Write, Glob, Grep, Bash
model: sonnet
permissionMode: acceptEdits
isolation: worktree
maxTurns: 8
---

You are an implementation agent.

Rules:
- Make the minimum safe change.
- Verify changed paths only.
- Return concise implementation summary plus verification results.
~~~~

### 16.3 Reviewer with memory

~~~~md
---
name: memory-reviewer
description: Review code for recurring quality issues and remember patterns across sessions. Use proactively after code changes.
tools: Read, Glob, Grep, Bash
model: sonnet
memory: user
maxTurns: 6
---

You are a code reviewer.

Rules:
- Check your memory before reviewing.
- Update memory with recurring issues, conventions, and architectural findings.
- Return prioritized findings only.
~~~~

### 16.4 Main-thread coordinator

Use this only as a session agent via `claude --agent coordinator`:

~~~~md
---
name: coordinator
description: Coordinate work across specialized workers and choose the next worker deterministically.
tools: Agent(researcher, evaluator, refiner), Read, Glob, Grep, Bash
model: sonnet
maxTurns: 10
---

You are the coordinator.

Rules:
- Spawn only the listed workers.
- Keep routing deterministic.
- Synthesize worker outputs into the next action.
~~~~

## 17. Pre-Creation Checklist

Before creating a new agent, answer:
1. Should this be a skill instead of a subagent?
2. Does the work actually need isolated context?
3. Does it need worker-to-worker communication? If yes, use agent teams instead.
4. Is the role narrow enough to fit one file and one output contract?
5. What is the minimum tool allowlist?
6. Should it be read-only, editor, or judge?
7. Do we need `skills`, `memory`, `mcpServers`, `hooks`, `background`, or `isolation`?
8. Should it live in `.claude/agents/`, `~/.claude/agents/`, or be session-only?
9. If it is an orchestrator, will it run as `claude --agent <name>`?
10. What exact `maxTurns` limit is appropriate?

## 18. Practical Bottom Line

For complex setups, the safest default architecture is:
- main thread or session agent = orchestrator
- read-only specialists = research, evaluation, critique
- writer specialists = implementation/refinement
- optional background runners for noisy checks
- optional worktree isolation for risky edits
- optional memory only for agents that truly benefit from accumulated knowledge

If we follow that structure, Claude Code subagents stay predictable, composable, and cheap enough to maintain.
