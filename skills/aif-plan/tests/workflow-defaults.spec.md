# Workflow defaults — behavioral regression matrix

These are instruction/behavior scenarios, separate from the deterministic
config-helper tests in `scripts/test-workflow-defaults-config.mjs`. A passing
`npm test` does not mean a model executed these scenarios. The two accompanying
`configured-ultra-*.yaml` files provide runnable ai-tester fixtures for the
reported blocker; the remaining rows are manual scenario specifications.

Use an isolated project, `git.enabled: false`, `git.create_branches: false`,
English UI/artifacts, and no skill-context overrides. Provide a minimal Node
package and, for research cases, `.ai-factory/RESEARCH.md` with an active summary
whose topic is `Add GET /health`. Answer ordinary tests/logging/docs preferences
when asked; distinguish those from mode-selection questions. Observe tool calls
and saved artifacts, not just the final summary.

## Planning

Run each configured mode (`fast`, `full`, `ultra`) with both an explicit
`Add GET /health` description and no description (usable research present).

| Input/config | Expected behavior |
|--------------|-------------------|
| Configured fast/full/ultra, description supplied, no mode token | Use that mode without a mode question; save fast file/full file/ultra bundle respectively; Original Request is exactly the supplied description |
| Same three defaults, no description, usable research | Reuse the topic, retain the mode without mode/description questions; save the corresponding artifact; commit Research Context and omit Original Request |
| Configured ultra, explicit `fast Add GET /health` | Save only the fast plan; no mode question |
| Configured ultra, explicit `full` with usable research | Save a full plan, not an ultra bundle; no mode question |
| `ask`, missing key, missing config, invalid string `deep`, wrong type `true` | Interactively ask full/fast once; research topic reuse never asks again; only invalid values warn |
| Same fallback cases with `HANDOFF_MODE=1` and usable research | Use fast with no interactive questions; invalid values warn |
| Valid configured fast/full/ultra with `HANDOFF_MODE=1` | Retain configured mode; no interactive questions |
| Configured ultra, request `Add  full text\nsearch, keeping ultra as prose.` | Preserve the two spaces, newline, casing, punctuation, and non-leading mode words in Original Request; no configured token is injected |

Also run `--list` and `--cleanup feature/demo` with git enabled in a disposable
git fixture and configured ultra: execute only the selected subcommand and
stop before mode selection, description prompts, or plan creation.

## Exploration

With `workflow.explore_mode: ultra`, run `/aif-explore Compare cache options`:
keep the topic exact; persist the selected marked bundle once evidence is
sufficient, without the regular save prompt. Run again in a clean fixture with
`/aif-explore regular Compare cache options`: ask permission before saving;
declining must produce no research writes. Accepting may write only the
configured single research file. Repeat with `ultra` inside (not at the start
of) the topic and verify that it remains ordinary topic text.

## Improvement

Provide an existing plan with an Original Request containing repeated spaces,
line breaks, and a non-English sentence. Set `workflow.improve_check: true`.
Keep validation tools available; lack of a tool is not evidence that a flag was
honored. Distinguish the findings validator from ordinary exploration helpers.

| Arguments | Expected behavior |
|-----------|-------------------|
| `Tighten rollback` | Refine, then validate; improvement prompt is exactly `Tighten rollback` |
| `--no-check Tighten rollback` | Refine without findings validation |
| `+check Tighten rollback --no-check` | Last explicit flag disables validation |
| `--no-check Tighten rollback +check` | Last explicit flag enables validation |
| `--list`, `--list +check`, `--no-check --list +check` | Read-only listing; no refinement, validation, task mutation, or writes |
| `@.ai-factory/plans/no-check.md Tighten rollback --no-check` | Strip only the standalone control token; retain the path and improvement text |

All refinement cases must preserve the existing Original Request byte for byte.
Defaults never appear in the topic, improvement prompt, or Original Request.
