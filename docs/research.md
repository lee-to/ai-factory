[← Development Workflow](workflow.md) · [Back to README](../README.md) · [Reflex Loop →](loop.md)

# Research and System Analysis

`/aif-explore` supports two persistence shapes while keeping exploration separate
from implementation:

```text
/aif-explore <topic>         configured mode (regular by default)
/aif-explore regular <topic> optional single-file research
/aif-explore ultra <topic>   adaptive topic bundle
```

Ultra is opt-in through a leading `ultra` token or `workflow.explore_mode: ultra`.
Without that setting, existing projects keep using the configured `paths.research`
file (default `.ai-factory/RESEARCH.md`). A leading `regular` overrides a configured
ultra default and restores the save prompt. See [Command defaults](config-reference.md#command-defaults).

## Storage

Ultra derives its bundle root from the parent of `paths.research`; no second
config key is needed:

```text
paths.research: .ai-factory/RESEARCH.md
                       ↓
.ai-factory/research/<english-topic-slug>/
```

The slug is concise English lowercase-kebab-case, such as
`partner-order-sync` or `billing-ledger`. This makes research paths stable across
projects even when UI and artifact prose use another language.

Every bundle starts with only:

```text
research/<topic-slug>/
├── INDEX.md
└── RESEARCH.md
```

`INDEX.md` contains `<!-- aif:research-mode:ultra -->`, the table of contents,
reading order, and the evidence-based reason for every optional artifact.
`RESEARCH.md` retains the existing Active Summary and Sessions markers, so plan
linking and SHA256 drift checks work the same way as single-file research.
Automatic consumers consider only indexes with `Status: active`; `paused` and
`superseded` bundles remain available through an explicit reference with a warning.

## Adaptive Artifacts

Ultra does not generate a documentation checklist. It adds an artifact only when
the research has the corresponding complexity signal:

| Artifact | Add when |
|----------|----------|
| `C4-CONTEXT.md` | Users, external systems, partners, trust boundaries, or system scope must be made explicit |
| `C4-CONTAINER.md` | Several applications, services, data stores, queues, or deployable units participate |
| `C4-COMPONENT-<scope>.md` | Responsibilities among at least three components inside a container are materially unclear |
| `ADR-NNNN-<decision>.md` | A material, selected, hard-to-reverse decision has credible alternatives |
| `DEPENDENCY-GRAPH.md` | At least three relevant nodes have non-linear dependencies, cycles, critical ordering, or coupling risk |

A local reversible change therefore remains a two-file bundle. A cross-system
integration may use the complete set. Empty C4 levels, speculative ADRs, generic
graphs, and C4 code-level diagrams are deliberately omitted.

## Sources of Truth

- `INDEX.md` owns navigation and coverage rationale.
- `RESEARCH.md` owns the planning input: goal, scope, constraints, requirements,
  decisions, risks, open questions, success signals, and session history.
- C4 files own system boundaries and relationships.
- ADR files own accepted or proposed material decisions and alternatives.
- `DEPENDENCY-GRAPH.md` owns dependency direction and change-impact findings.

Every persisted regular or ultra update runs a coherence gate before it is
presented or appended to `Sessions`. `/aif-explore` re-reads only the saved
research scope, checks that the Active Summary is self-contained, and rejects
silent contradictions with durable research. Content findings require verbatim
excerpts from both sides. Mismatches must be corrected, qualified, or recorded
in `Open questions` before the session closes.

This common check does not require subagents. A runtime with fresh-context
subagents delegates the read-only pass; other runtimes perform it directly with
the same evidence and pass criteria.

Ultra adds bundle traceability: every material Active Summary claim needs a
self-contained supporting passage, and every material C4, ADR, or dependency
conclusion must be represented in the summary. Supporting artifacts therefore do
not silently become plan requirements.

## Analyst-Friendly Traceability

When a bundle has several artifacts or will be handed to another team, its index
may add stable IDs such as `REQ-001`, `NFR-001`, `RISK-001`, and `DEC-001`:

| ID | Finding / requirement | Evidence | Resolved in |
|----|-----------------------|----------|-------------|
| `REQ-001` | Partner retries must be idempotent | API contract + `src/orders/...` | `ADR-0001-idempotency-key.md` |

IDs are optional. The two-file case does not need a miniature requirements
management system.

All diagram relationships and dependency edges include evidence. Unknowns remain
explicit open questions instead of guessed boxes and arrows. Mermaid flowcharts
keep diagrams readable in GitHub while adjacent tables preserve C4 semantics for
tools that do not render Mermaid.

## Language and Compatibility

- Prompts, progress, summaries, and next-step guidance use `language.ui`.
- Persisted `INDEX.md`, `RESEARCH.md`, C4, ADR, and dependency prose uses
  `language.artifacts`, falling back to `language.ui` and then `en`.
- `language.technical_terms` controls human-readable terminology.
- English slugs, filenames, links, markers, Mermaid syntax, IDs, paths,
  commands, metadata keys such as `Status:` and `Updated:`, and status values
  such as `active` remain stable so discovery and drift checks work in every
  artifact language.

## From Research to Planning

`/aif-plan` resolves at most one research source:

1. An explicitly referenced `RESEARCH.md` or marked bundle.
2. One clearly matching marked ultra bundle.
3. The relevant configured single research file.

An explicit reference is a concrete file or bundle path named in the request or
a follow-up. Topic matching checks exact English slug, normalized `Topic:`, then
a unique semantic match against Purpose / Active Summary. It never chooses by
recency or merges ambiguous studies. With no description at all, legacy
compatibility is the documented exception: configured `paths.research` is tried
first, then a single active marked bundle.

If the selected research affects the plan, the plan embeds the Active Summary as
`Research Context` and records the source path in backticks plus timestamp and
hash. `SHA256:` is authoritative for Active Summary drift; `Updated:` is only the
fallback for older linked plans without a hash.

`/aif-implement`, `/aif-improve`, `/aif-verify`, and `/aif-fix` read that exact
source path for drift checks. They continue to execute against the committed
Research Context; newer diagrams or ADR notes do not expand an older plan.

## Optional Project Hypotheses

When you explicitly ask `/aif-explore` to formulate or track a hypothesis from
a source, it can add a card inside the selected `RESEARCH.md`, before Sessions
and outside the Active Summary markers. Selecting ultra alone does not enable
cards. Regular mode keeps its save prompt; ultra keeps its two-file minimum.
No command, runner, sidecar, config key, or mandatory workflow stage is added.

The [card template and rules](../skills/aif-explore/references/PROJECT-HYPOTHESES.md)
connect the source actually read to an agent's project interpretation, a causal
hypothesis, baseline evidence (or `unknown`), decision criterion/window,
balancing constraints, plan/task references, and revision-bound observations.
Source conditions remain explicit. Restricted source identifiers, including
those removed by `--redact-source-map`, must not reappear through a new card or
summary; public provenance is marked `redacted` when it cannot be disclosed.

Planning status and outcome are independent. An `accepted` experiment is an
approved planning input, not a confirmed claim. Outcome remains `not_evaluated`
after implementation or green tests unless actual evaluation evidence measures
the agreed criterion. Valid observations can produce `supported`,
`not_supported`, or `inconclusive`, with limits on the conclusion. Observations
record exact hypothesis/experiment revisions and target identity. Changed
claims or recipes get new revisions; old negative and inconclusive results stay
intact instead of being reassigned to a new experiment.

`/aif-explore` owns the cards and records supplied observations; experiment
execution belongs to a separately authorized task using an existing runner.
Saving a recipe grants no additional execution permissions. Missing access or
a runner is `not_run`/`blocked`, not evidence of success or failure.
`/aif-distillation` and `/aif-reference` may suggest this handoff while retaining
their existing artifact ownership.

Only explicitly accepted actions/experiments become planning requirements.
Material planning facts are promoted into a self-contained Active Summary with
their hypothesis/source/experiment revisions, criterion, conditions, status,
and outcome. Existing coherence checks compare the summary with the card;
linked plans retain their committed Research Context and warn on summary drift.
SHA256 still hashes only Active Summary, not the whole card. An observation
append with no planning impact need not change that hash.

The [local retry example](../skills/aif-explore/references/RETRY-HYPOTHESIS.md)
demonstrates a synthetic source, an unproven hypothesis, and an in-memory recipe
that drops a reply after an action. Its independent effect count exposes the
negative result of naive retries; a revised deduplication hypothesis starts
unevaluated. Expected output becomes evidence only after an actual run.

## Example

```text
/aif-explore ultra синхронизация заказов с партнёром

.ai-factory/research/partner-order-sync/
├── INDEX.md
├── RESEARCH.md
├── C4-CONTEXT.md          # partner boundary
├── C4-CONTAINER.md        # API, worker, queue, database
├── DEPENDENCY-GRAPH.md    # retry/order dependencies
└── ADR-0001-idempotency-key.md
```

For a contained validation-rule investigation, the same command may produce only
`INDEX.md` and `RESEARCH.md`.

## See Also

- [Development Workflow](workflow.md) — where exploration fits before planning
- [Core Skills](skills.md) — complete `/aif-explore` and `/aif-plan` reference
- [Plan Files](plan-files.md) — committed Research Context and drift semantics
