# Planning Advisor Forward Check

Date: 2026-10-29. One independent background agent received the two skills,
their routed resources and disposable projects materialized from
`advisor-project.json`. It did not receive expected answers or this task's history.
Five requests were exercised, followed by three bounded repeats after a fixture
layout correction and grouped-handoff wording refinement. These were not five
fresh model contexts or a broad model/runtime benchmark.

## Observed outputs

| Request | Observed result |
|---------|-----------------|
| Explicit ultra overview | 1/3 task progress, Task 2 next, dependencies and both roadmap links; 2 create + 3 modify = 5 planned paths. Repeated login path retained both phase references. The fenced phantom row and unlinked phase were excluded. No verification or implementation was invoked. |
| `shared-name` after fixture correction | Two distinct active/archive entrypoints reported; selection returned to the parent, no automatic choice or overview. |
| Roadmap-next without mode | Concrete `plan_mode: full`, capacity 2; Footer personalization + Subject previews, S/1 each. Active claims and dependent work excluded, completed-plan documentation pending reconciliation, unlinked unfinished work noted as possible overlap. Start remained pending. |
| Explicit fast | Capacity 1; only the first ready email milestone recommended, second email milestone offered as an alternative. Start remained pending. |
| Invalid configured override/capacity | Warnings for `roadmap_next_mode: spaceship` and boolean ultra capacity; built-in ultra/3 used rather than `plan_mode: fast`. Two related S milestones fit without packing unrelated XL work. Start remained pending. |

The final grouped commands were:

```text
/aif-plan full "Footer personalization + Subject previews"
/aif-plan ultra "Footer personalization + Subject previews"
```

The first archive fixture incorrectly placed its historical copy directly under
`paths.archive`, rather than `<paths.archive>/plans`. Discovery correctly excluded
that file. The fixture was corrected and only that selection request repeated.
The grouped-handoff refinement made ` + ` and primary/secondary Roadmap Linkage
context explicit; the full and invalid-config recommendations were repeated.

Parent-side SHA-256 snapshots verified that every fixture file byte stayed unchanged
after both the initial pass and final repeats. The actor reported using read-only
inventory/metadata/section extraction and the trusted formatter in isolated mode.
An initial roadmap case read its full ultra index instead of only the requested
metadata; later repeats used section extraction. Read minimality and native tool
allowlists were not enforced or comprehensively traced by this check.

## Revisions

| Input | SHA-256 |
|-------|---------|
| `aif-plan-overview/SKILL.md` | `48c88c7e61ce0f4b227106b162eb6f1aad08f73b14d219e34d3241a12c0042ea` |
| `references/PLAN-OVERVIEW-DISCOVERY.md` | `dd381cf480ee19f5494acda06facd141c30737a1c536aa04219f94f69f98dc41` |
| `references/plan-overview/file_tree.py` | `9f40926f868d2b24046d5d7ee1f1c87f966e2d134c6658dc22b152bae6a94f2c` |
| `aif-roadmap-next/SKILL.md` (final repeated cases) | `1508c28e9a76ff47bf9c7ddcee53015865803217d5ece08ad4b02a01011b355a` |
| `advisor-project.json` (corrected fixture) | `6029587003a8c9e81e2ea555e62470b92f0f8ae1714007d70ce02a41d6481bb6` |

The invalid variant changes `plan_mode` to fast, adds `roadmap_next_mode: spaceship`
and changes ultra capacity to false. The explicit-fast result precedes the final
handoff-only wording refinement; other input-selection/estimate rules were unchanged.

After execution, ownership headings were split/capitalized to match the developer
guide, without changing instruction text. The resulting shipped SKILL.md hashes are
`ab22be7a46996bd3ec7edae274e7080d00a63e47ef9b062c1e5c63a9381b9445`
(overview) and `17fb24a8414ed2801115979f3a7889511bef0853dad199c0c7104a78dedd68ce`
(roadmap-next).
The formatter subsequently gained explicit UTF-8 stdout for legacy host encodings,
covered by a separate subprocess test; rendered content and project-access behavior
did not change. Its shipped hash is
`93b87b1651ad8340f1659f4a3f4a56f1c31b2e172ea9a0572e37437a6058adaf`.

## Limits and separate checks

The post-selection plan-writing handoff, native question UIs, Python-unavailable
manual rendering, sequential branch tie-breaking, malformed bundles/cycles and
other unlisted model scenarios were not executed. No runtime-wide or cost/token
savings claim follows from these examples. The actual `/aif-plan` writer retains
its own permissions and policies.

`scripts/test-plan-advisors.mjs` separately exercises real install/reinstall and
formatter delivery/execution across all 16 renderers and real config merge
preservation. `test_file_tree.py` covers braces, duplicates, action unions,
placeholders, bounds, invalid input and zero project-import/glob/write effects.
Those deterministic checks do not validate the model's planning decisions.

Both sources pass the repository's native skill validator. The generic Codex
skill-creator quick validator rejects this repository's supported `argument-hint`
and `disable-model-invocation` frontmatter extensions; those runtime metadata fields
were retained rather than removed to fit a different validator profile.

## Review follow-up

The writer/completion contract now explicitly preserves grouped milestone selection
in fast/full/ultra plans and checks completion per milestone. Roadmap-next also reads
archived completed linkage before recommending open work. The model observations
and hashes above predate these changes; no new live-model validation is claimed.
Regression scenarios to exercise: select a two-milestone scope through each mode
and inspect the saved linkage; complete only one milestone and keep the other open;
archive that completed plan while its second milestone is open and ensure the
advisor reports pending reconciliation rather than recommending it again.

A second review follow-up adds localized heading/label discovery and replaces the
standalone grouped prose command with a multiline request carrying the roadmap
source and an explicit ordered milestone list. The original recorded commands
above are historical observations, not the current copyable-request format.
Additional unexecuted model scenarios: Russian full/ultra and archived plans retain
progress and both claims; ambiguous translated labels keep readiness uncertain;
copy the complete grouped request into a fresh fast/full/ultra planning session
and verify that every selected milestone is saved without splitting prose on `+`.
