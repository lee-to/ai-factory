# Swarm Runtime contract

The Runtime runs locally with one scheduler per project, independently of Handoff.
The supported autonomous process cleanup platform is POSIX. It runs one lead,
up to five concurrent worker processes, deterministic Git integration and a final
independent verifier. Integration is implemented by the Runtime rather than an
additional model process; failed merges/checks retry the original task with a
bounded attempt count and failure context.
Each integration attempt has its own worktree. A failed attempt retains its
worktree and submitted ref in an `integration-failure` artifact; a subsequent
attempt starts from the last accepted integration ref, without prior reports or
other generated files. Successful integration worktrees are removed; refs remain.

## Storage and recovery

Default: SQLite at `.ai-factory/swarm/state.sqlite`, Node.js >=22.13, WAL,
busy timeout, immediate transactions, local disk. A SQLite file is not a shared
network database. `AIF_SWARM_DATABASE_URL` selects PostgreSQL. The same bounded
run transaction contains tasks, DAG, budgets, idempotency and sequenced events.
Run state is a bounded JSON document; PostgreSQL uses a transaction advisory lock
per run. It does not use a row-per-task `SKIP LOCKED` scheduler. This is intended
for five workers, not large distributed queues. Both backends share the same API.

Do not switch backends expecting automatic migration. PostgreSQL does not enable
multi-host execution: local Git and worktree ownership still apply. A project
runner lease prevents a second cooperative scheduler. This is not a distributed
filesystem fence or a security boundary against another local process.

Project instructions, including ignored context artifacts, are captured at creation
with source hashes and supplied to every role. Public snapshots expose only their
identities/hashes. Configured paths must stay inside the project.

Every claim has a unique fencing token and lease. Heartbeats extend only the
current claim. The Runtime stages and commits worker edits on their assigned branches so Git
metadata writes do not depend on model sandbox permissions. Submitted commits
are immutable hashes. Parent completion waits
for required children; dependencies and parent completion edges must be acyclic.
Subtask creation/result submission require stable idempotency keys. Agents use
the API through stdio MCP and do not receive database credentials.

After an interrupted provider process, the new Runtime revokes old API access,
charges unknown usage conservatively and sets `needs_attention`. Inspect and
resume explicitly; retained Git refs and expired claims are reused. Completed
merges are reconciled against the submitted commit before database acceptance.

## Commands

`ai-factory swarm start --spec <project-relative-yaml-or-json>` creates a run.
`serve [--port 4317]` executes existing runs and serves the loopback API.
`status [id]`, `inspect <id>`, `logs <id> [--after sequence]`,
`pause <id>`, `resume <id>`, `cancel <id>`, `approve <id> <approval>`,
and `reject <id> <approval>` operate on existing runs.
`retry <id> <task> --reason <resolution>` releases a resolved blocker within the
original attempt limit; resume the run separately when it needs attention. Local CLI access relies
on the OS user's project/database permissions.

Pause stops new claims and integrations; in-flight operations may finish.
Cancel revokes work and kills managed process groups. Dirty worktrees are retained
to prevent data loss. Integration branches remain for review; the source branch
is never merged or pushed automatically. Runs need checks plus a final verifier
and owner approval; idle workers alone never mean completion.
Rejecting final completion ends the run as `failed` and records `finishedAt`.
It cannot be resumed; a revised goal needs a new run. An individual integration
rejection instead blocks the task and can use the existing resolved-blocker retry.

## Handoff API v1

HTTP binds only to `127.0.0.1`. Configure distinct environment credentials:
`AIF_SWARM_OWNER_TOKEN`, optional `AIF_SWARM_OPERATOR_TOKEN`,
`AIF_SWARM_VIEWER_TOKEN` (each at least 32 characters). Without these credentials
only the internally authorized agents can access HTTP. Handoff connects from its
backend; browser Origin requests are rejected. TLS/remote runner connectivity is
outside this local implementation; do not expose the port publicly.

All public envelopes include `schema_version: 1`. Endpoints:

```text
POST /v1/swarm/runs                          owner, Idempotency-Key
GET  /v1/swarm/runs
GET  /v1/swarm/runs/{id}
POST /v1/swarm/runs/{id}/pause|resume|cancel   owner/operator, Idempotency-Key
GET  /v1/swarm/runs/{id}/tasks|agents|artifacts
GET  /v1/swarm/runs/{id}/events?after=0
GET  /v1/swarm/runs/{id}/events/stream?after=0
POST /v1/swarm/approvals/{id}/decision        owner, {"decision":"approve"|"reject"}
```

Events include `event_id`, `sequence`, `run_id`, `type`, `timestamp`, `actor`,
`payload`, `schema_version`. Sequence is contiguous per run. Poll pages contain
at most 500 events; continue from the last sequence. SSE accepts `after` or
`Last-Event-ID`, sends the sequence as `id`, and ends slow connections rather
than buffering indefinitely. Deduplicate by run/sequence; reconnect and compare
snapshots. Transport loss does not stop the Runtime. Handoff must mark stale
state itself and must not access the database directly or duplicate scheduling.

## Security and budget limits

Worktrees are not security sandboxes. Agents run as the OS user and may access
CLI authentication stored in their home directory. Only a small environment
allowlist plus a short-lived agent token reaches child processes. Codex uses
workspace-write/read-only with network disabled; Claude uses explicit native tool
grants. Configured checks may include explicitly authorized dependency bootstrap commands
for fresh worktrees; no dependencies or shared runtime services are copied or
started automatically. Project and global CLI settings remain subject to the provider's own
trust model. Native hooks and authorized check commands can execute local code.
Use trusted repositories or run the whole Runtime in a separately provisioned
container/VM. The Runtime does not claim to enforce arbitrary tool/network policy.

Raw stdout/stderr traces are not persisted. Bounded structured reports/events
redact known credential patterns and secret environment values before export.
This is best-effort redaction, not proof that arbitrary source text is secret-free.
There is no automatic log retention cleanup in this release.

The scheduler reserves `tokensPerAttempt` before a model call, records reported
usage and stops new work when the budget is exhausted. Missing telemetry charges
the reservation and requires attention. CLI providers do not expose a uniform
hard token ceiling: an in-flight call can exceed its reservation. Timeouts and
parallelism are enforced by the Runtime; exact token/cost enforcement and
subscription cost calculation are not available. `AIF_SWARM_LOG_LEVEL=silent`
disables operational stderr logs; structured audit events remain enabled.
