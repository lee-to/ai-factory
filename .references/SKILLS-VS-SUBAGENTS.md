# Skills (`context: fork`) vs Subagents

Updated: 2026-03-19

## Important: `context: true` does not exist

The option is called `context: fork` — it runs the skill in an isolated context (forked subagent).

## Comparison

| | Skill + `context: fork` | Subagent with `skills:` |
|---|---|---|
| System prompt | From agent type (`Explore`, `Plan`, etc.) | Agent's markdown body (custom) |
| Task | SKILL.md content | Claude's delegation message |
| Also loads | CLAUDE.md | Preloaded skills + CLAUDE.md |
| Tool control | `allowed-tools` | `tools:` (full control) |
| Model control | `model:` | `model:` |
| Permission control | None (inherited) | `permissionMode:` |
| Isolation (worktree) | No | `isolation: worktree` |
| Background | No | `background: true` |
| Memory | No | `memory: user/project/local` |
| MCP servers | No | `mcpServers:` |
| Hooks | Skill lifecycle only | Full hook events |
| Nested agents | No | `Agent(...)` in tools |
| `maxTurns` | No | Yes |

## Skills with `context: fork` are lightweight subagents

They receive a system prompt from a built-in agent type (Explore, Plan, general-purpose), not a custom one. No control over:

- `permissionMode` (critical for `dontAsk`/`acceptEdits` separation)
- `background: true` (sidecars depend on this)
- `isolation: worktree` (`implement-worker` depends on this)
- `maxTurns` (safety valve)
- `memory:` (when needed)
- nested delegation via `Agent(...)` (coordinators)

## Where `context: fork` could provide an advantage

1. **Simple read-only tasks** — e.g. `loop-test-prep`, `loop-perf-prep`, `loop-invariant-prep` could theoretically be skills with `context: fork` + `agent: Explore`. But we lose `background: true` and `maxTurns`.

2. **Inline skills (no fork)** — `aif-plan`, `aif-implement`, etc. already work as inline skills. They extend context rather than isolate — this is the correct approach.

## Conclusion

**`context: fork` provides no advantages over subagents for our architecture.** Required features (`permissionMode`, `background`, `isolation`, `maxTurns`, custom system prompts) are only available in subagents. The current approach — subagents with `skills:` for domain knowledge injection — is the documentation-recommended pattern for complex systems.

`context: fork` skills are useful for **ad-hoc one-off tasks** (quick explore, simple research) where role-based architecture and fine-grained control are not needed.
