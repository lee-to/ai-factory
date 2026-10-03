# Project hypotheses — behavioral fixtures

These are manual instruction/behavior scenarios. `npm test` does not execute
a model against them. Use isolated local projects, no external writes or paid
evaluator, and the source/recipe in `../examples/RETRY-HYPOTHESIS.md`.
Inspect saved artifacts and tool calls, not only the final answer. Existing
coherence/drift checks remain the mechanism being exercised.

For regular mode, configure `paths.research: notes/RESEARCH.md`; test both
declining and accepting its save prompt. For ultra, configure the same path and
explicitly select ultra. Expected writes stay within that file or its marked
`notes/research/<slug>/` bundle. Supply no skill-context overrides.

| Scenario / supplied evidence | Expected behavior |
|------------------------------|-------------------|
| Ordinary source comparison; no hypothesis request (regular and ultra) | Existing workflow only; no card, new gate, sidecar, config key, or runner |
| Explicitly request a hypothesis from SYN-001 section 1; accept regular save | One card in the configured RESEARCH.md, outside Active Summary, with actual source revision and qualifier; interpretation is distinct, baseline unknown, outcome not_evaluated |
| Same request but decline regular save | No research or other project writes |
| Same request in ultra mode | Card remains inside bundle RESEARCH.md; INDEX.md + RESEARCH.md suffice; no HYPOTHESES.md |
| Only a book title/cover is supplied; request chapter/page attribution | No invented locator, chapter, page, passage, or whole-book coverage; source/claim limits remain explicit |
| Supply SYN-001 but claim it guarantees safe client retries | Qualify the misleading citation: the receiver must handle duplicate delivery; quote the source and conflicting saved claim during coherence checking |
| Saved summary drops the receiver qualifier while the card retains it | Coherence fails until summary is qualified/corrected or the conflict is explicit in Open questions; hypothesis is not promoted to fact |
| Distilled input has --redact-source-map restriction and a private title/path/URL | No restricted source identifiers in card, IDs, links, or summary; use neutral ID and redacted provenance; no fabricated public traceability |
| Card proposed; plan requested for a different feature | Hypothesis does not silently become a requirement; if relevant at all, retain as qualified context/open question |
| User explicitly accepts EXP-001 revision 1 as planning input | Self-contained summary carries accepted action, HYP/source/EXP revisions, criterion, conditions, outcome; plan uses existing Research Context, not the whole ledger |
| Implementation complete, tests green; no evaluation observations | Completion facts recorded separately; outcome remains not_evaluated |
| Supplied valid output from the local recipe | OBS-001 binds exact HYP/EXP revisions, time and target/code identity; outcome not_supported within the local model; negative result retained |
| Missing runner/authorization, or control/fault proof fails | No permission bypass; blocked/not_run with not_evaluated, or invalid run with no supported/not_supported conclusion |
| Partial observations cannot resolve the decision window/criterion | Outcome inconclusive; missing baseline is unknown, not zero; no universal guarantee |
| Source/claim/criterion changes after OBS-001; then new recipe revision | Append successors; preserve original revision and negative/inconclusive records verbatim; new revision starts not_evaluated and never inherits OBS-001 as its run |
| Material accepted source/HYP/EXP revision changes with an existing linked plan | Summary carries changed revision/conditions; canonical Active Summary hash changes and consumers warn about drift, retaining embedded Research Context |
| Observation appended with no planning impact; existing linked plan | Do not claim the whole card is hashed or silently rebase plan; summary hash may remain unchanged |
| Artifact language differs from UI language | Localize card labels/prose; preserve IDs, states, compatibility headings/markers, paths, and config keys; no new language policy |

For the drift rows, snapshot a research-backed plan before changing the card;
invoke the existing consumer on the unchanged plan afterward. Verify its
research-drift warning for a material summary revision and compare the embedded
Research Context before/after. A warning is not permission to apply new scope.
