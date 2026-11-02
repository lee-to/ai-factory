# Planning with architectural coupling (opt-in)

Read only when the leading `+coupling` option is selected. This reference is
self-contained; installing aif-review is not required.

For the boundary touched by the requested change, identify the producer, the
shared knowledge/model/contract, and the consumer using actual paths/revisions.
Separate observed relationships, inferred risks, and unknown consumers or team
facts. Show a concrete change-propagation example. Assess strength, distance,
and volatility qualitatively, without scores or using commit counts as domain
evidence. Multiple repositories do not imply distinct bounded contexts.

Compare the smallest useful alternatives: keep the existing dependency, expose
a stable public operation, introduce an adapter, or use a local representation.
Explain compatibility, migration, duplication, indirection, and coordination
costs. A justified dependency should remain; do not prescribe decomposition
merely because two modules share a contract.

Promote only relevant decisions into existing scope/tasks/acceptance sections.
Name affected producer/consumer files and tests that would detect the cited
propagation or preserve the supported boundary. Missing external sources and
unknown revisions remain explicit; never describe local copies as versioned
evidence. Read available code before asking the user for facts. Use the current
question contract for material decisions; unresolved decisions in a background
run remain blockers.

Preserve the selected fast/full/ultra mode, exact Original Request, research
snapshot, branch ownership, rules, and architecture contracts. Do not add a new
plan schema, quality gate, config key, report, graph crawl, agent, automatic
review, or refactor. This methodology grants no commands or broader access.
When off, skip it entirely and preserve the existing planning flow.

## Argument examples (instruction contracts, not an executable parser)

| Arguments | Mode | Exact Original Request after option removal |
| --- | --- | --- |
| `fast +coupling Add receipt` | fast | `Add receipt` |
| `full +coupling +coupling Add receipt` | full | `Add receipt` |
| `ultra +coupling Add receipt` | ultra | `Add receipt` |
| `+coupling Add receipt` | existing configured/interactive default | `Add receipt` |
| `full Add +coupling receipt` | full, lens off | `Add +coupling receipt` |
| `full +coupling Add +coupling receipt` | full, lens on | `Add +coupling receipt` |
| `full Add https://example.test/+coupling` | full, lens off | `Add https://example.test/+coupling` |

After removing recognized options, trim outer whitespace only; for example,
`full +coupling Add  receipt` retains the two spaces in `Add  receipt`.
Do not normalize line breaks, case, punctuation, or wording. These examples
specify expected agent behavior; static checks do not prove a model followed it.
