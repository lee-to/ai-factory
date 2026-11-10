# Rule Candidate Validation

Read during `/aif-evolve` Step 6.5. This is a comparison contract for rule changes,
not a separate scenario runner. Reuse the project's scenario mechanism if available;
otherwise postpone until a reproducible evaluator and cases are available.

## Prepare the Comparison

For each candidate × target skill, carry the frozen scope, canonical base entrypoint,
owner/evidence, and exact destination from Step 0.1. A different physical skill or
write destination is a different candidate, even when the name matches. Do not test
or propose writes to skipped managed or unknown targets. Global user-owned edits
must state their effect on other projects in the approval request.

For each eligible candidate × target skill:

For a shared destination, repeat this comparison for every frozen consumer from
`SHARED-CONTEXT.md`, including consumers without the originating failure. Freeze
global/build/individual layers in both compositions and include duplicate removals
and retained exceptions. No partial shared acceptance: one missing comparison or
regression makes the shared candidate ineligible. Record equivalence plus measured
duplicate reduction as maintenance evidence for consolidation; never label unchanged
behavior a behavioral improvement or infer token savings from fewer files.

1. Assign a stable candidate ID and revision. Link the prevention point to its patch,
   convention, or verified tech fact. Preserve the original problem as a reproducible
   case with input, initial state, and observable expected behavior.
2. State exactly when the instruction applies. Add at least one control case outside
   that condition, with an explicit forbidden effect and expected unchanged behavior.
   Include relevant existing regression cases; record why this set covers the risk.
3. Freeze the baseline: base skill plus all effective project instructions, including
   current skill-context. Freeze the candidate as that same baseline with only the
   exact proposed instruction diff. For a merge/rewrite, include the replaced text.
4. Freeze case IDs, inputs/fixtures, initial state, expected outcomes, and checks before
   observing results. Retain exact instruction/fixture snapshots in the log or use
   immutable, resolvable source revisions; record their content digests. A digest
   alone cannot reconstruct missing content. Both versions and cases must be recoverable.
5. Record the evaluator/command, model and settings when relevant, tool access, reset
   procedure, and agreed run/cost limit. Keep them equal for both versions. Use fresh
   isolated contexts and reset disposable state between runs so one version cannot
   see the other's output or modify its inputs. Do not temporarily install the rule
   in active skill-context to test it.

Original problem and control must be runnable, not just anecdotes. Missing fixtures,
missing evaluator, inaccessible output, or an unrepeatable initial state mean
`postpone`, with the missing evidence named. Proposed cases may be recorded as
`NOTRUN`; do not invent a baseline failure or candidate success.

For `/aif-transfer`, reconstruct cases from verified current-project equivalents or
neutral fixtures. Use only `experience-NNN` provenance and apply transfer's privacy
preflight to cards, fixture descriptions, and output evidence before presenting or
persisting them. Do not embed original source-project data in the card.

## Run and Assess

Execute both versions against every frozen case and apply the same predeclared checks.
An agent's explanation of what it *would* do is not execution evidence. Retain actual
outputs or durable references with digests, plus per-check observed pass/fail/error.
Preserve failed attempts; do not retry selectively until the candidate looks better.
For variable model behavior, use the same predeclared repetition policy for each
version and report variation. Inconclusive or incomplete pairs cannot establish benefit.

Evaluation stays within the user's permitted resources and side effects. If the
necessary run is unavailable or outside that scope, record `NOTRUN` and `postpone`.
Stop at the agreed limit; additional runs require a new agreed comparison budget.

Compare:

- **Benefit:** which observable original-case failure was corrected or existing
  behavior improved under the same checks?
- **Regressions:** did a previously passing check fail, or did the rule trigger on a
  control where it must not apply? Record all affected cases, not only the original.
- **Extra cost:** report baseline → candidate context size, calls/tool steps, duration,
  and tokens/money when available, with units and deltas. Mark unavailable metrics
  `UNKNOWN`; never treat them as zero. Distinguish measured cost from estimates.

## Outcome

| Outcome | Meaning and next action |
|---------|-------------------------|
| `accept` | Observed benefit, complete comparable runs, no detected regression, and extra cost justified by the benefit. Eligible for user approval of the exact tested text. State evidence limits. |
| `narrow` | The condition is too broad, especially if a control triggered. Propose a narrower condition as a new revision and rerun both versions on the same set before acceptance. |
| `refine` | The instruction needs a different action or wording. Revise it and repeat the comparison before acceptance. |
| `keep_old` | No useful improvement, unjustified cost, or an unresolved regression. Preserve the current instructions and record the evidence. |
| `postpone` | Missing data, unavailable runs, or inconclusive results. Preserve the current instructions and name the evidence needed to resume. |

If the versions behave equally under the checks, explicitly record **the new rule did
not improve behavior** and choose `keep_old`. If evidence is incomplete, choose
`postpone` rather than claiming equality. Approval cannot convert an untested or
unsuccessful revision into `accept`. Changed text, baseline, or cases invalidate the
previous comparison; retain it and record a new comparison with its reason.

For an equivalent consolidation under `SHARED-CONTEXT.md`, distinguish unchanged
behavior from the measured maintenance benefit: fewer duplicate copies, all consumers
and exceptions covered, and no behavioral regression. Only a complete comparison
showing that benefit may be accepted as consolidation; it adds no new instruction.

When multiple accepted candidates will be applied together, compare the exact combined
instructions with the baseline on the union of their cases and record the batch result.
The final user-selected set must match a tested combination. On a batch regression or
inconclusive run, keep active instructions unchanged and refine or postpone that batch.

## Candidate Card

Embed this card in the Step 7 report and saved evolution log. Keep every revision's
outcome, including rejected and inconclusive revisions, after narrowing/refinement.
Do not put comparison history or rejected instructions into active skill-context.

```markdown
### Candidate <ID> / revision <N> — <rule name>
- Target skill, scope, canonical base entrypoint, owner/evidence, and exact output path:
- Context layer and complete affected-consumer records (shared changes only):
- Provenance / prevention point:
- Original problem case (input, initial state, expected behavior):
- Exact applicability condition:
- Baseline effective instructions (snapshot/revision/digest):
- Proposed instruction change (exact diff, including replaced text):
- Candidate effective instructions (snapshot/revision/digest):
- Shared case set (IDs, frozen inputs/checks, revision/digest):
- Control where the rule must NOT apply (condition, forbidden effect, expectation):
- Evaluator and reproduction command/procedure:
- Environment/model/settings/tool access and state reset:
- Run/cost limit and repetition policy:

| Case / check | Baseline observed result | Candidate observed result | Output evidence / digest | Regression |
|--------------|--------------------------|---------------------------|--------------------------|------------|
| <original> | <pass/fail/error/NOTRUN> | <pass/fail/error/NOTRUN> | <evidence or missing data> | <yes/no/UNKNOWN> |
| <control> | <pass/fail/error/NOTRUN> | <pass/fail/error/NOTRUN> | <evidence or missing data> | <yes/no/UNKNOWN> |

- Extra cost (baseline → candidate, delta/units; measured/estimated/UNKNOWN):
- Detected regressions and evidence limits:
- Outcome: accept / narrow / refine / keep_old / postpone
- Reason (retain "the new rule did not improve behavior" when observed):
- Next revision or missing evidence:
- User decision: pending / apply exact accepted revision / skip / save report only
```

## Scope Example

A patch suggests "always wrap writes in a transaction" after a failure between two
related writes. The original case can check that a failure in the second write leaves
no partial update. A control can use a single independent write whose contract needs
no multi-write transaction; applying the new blanket instruction there is a scope
failure. Narrow the candidate to related writes requiring atomicity and compare again.
This illustrates case design only; it is not a claimed successful evaluation.
