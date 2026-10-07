# Local Synthetic Example: Retrying a Lost Response

This is original synthetic material, not a citation to a book or a claim about
an existing project. Use it to demonstrate one card and its revision history.
Paths below are examples; use the resolved research path and artifact language.

## Source SYN-001, revision 1, section 1

A lost response does not tell the caller whether an action happened. Retrying
can recover a response, but duplicate delivery must be handled by the receiver.

## HYP-001, revision 1: proposed interpretation

| Field | Value |
|-------|-------|
| Project scope | Disposable in-memory client/service; one benign action, one lost response, at most one retry |
| Source | This example, SYN-001 revision 1, section 1 |
| Source claim and conditions | A retry can recover a response; the receiver must handle duplicate delivery |
| Project interpretation | Agent inference to challenge: a bounded client retry alone might suffice. The source does not establish this; receiver handling is still unknown. |
| Hypothesis | If the client retries once after losing the response, it will receive a reply with exactly one action recorded, because the interruption might have occurred before the action. |
| Baseline | unknown until the control is measured; no existing-project baseline |
| Decision criterion and window | During EXP-001 revision 1, control and fault cases each record exactly one action, and the client receives a reply within two attempts |
| Balancing constraints / stop conditions | In-memory simulation only; no network, files, secrets, paid services, or real effects; stop on unexpected faults, more than two attempts, or 1000 ms budget |
| Planning status | accepted only if the user approves this experiment; the claim remains unproven |
| Plan/task references | Add the actual experiment task reference after planning; none yet |
| Experiment | EXP-001 revision 1: control without loss, then identical fresh service with first response dropped after the effect; independent effect sink counts actions |
| Implementation / verification | not started; completing the client change would not evaluate the hypothesis |
| Outcome | not_evaluated |
| Decision and limits | Evaluate the source qualifier; no claim about production retries or other fault models |

If accepted for planning, Active Summary should contain a self-contained input
such as:

> HYP-001 revision 1, source SYN-001 revision 1 section 1: accepted action is
> the local EXP-001 revision 1 evaluation, not adoption of the claim. The source
> requires receiver handling of duplicate delivery. Measure whether one lost
> response after an action and one client retry leave exactly one action and a
> received reply, against a fresh no-loss control. Two attempts and a 1000 ms
> budget bound the simulation; no external effects. Outcome: not_evaluated.

`/aif-plan` commits this input through its existing Research Context. The detailed
card alone does not add implementation requirements.

## EXP-001 revision 1 recipe

Outside explore mode, once the local experiment is authorized, run the following
JavaScript through an existing Node runner (for example `node` with stdin). It
requires only Node's built-in assertion module. It does not write artifacts or
introduce a new AI Factory runner. Keep the code's content revision with the
observation; these expected counts are not observations until it runs.

```javascript
const assert = require('node:assert/strict');
const deadline = Date.now() + 1000;

function runCase(dropFirstReply) {
  // Independent effect sink: client responses do not determine this count.
  const effects = [];
  const faults = [];
  let attempts = 0;
  let receivedReply = false;
  const replyLost = new Error('simulated lost reply');
  const recordAction = operation => effects.push({ operation });
  function fakeService() {
    recordAction('benign-001');
    if (dropFirstReply && faults.length === 0) {
      // Apply loss after the action, not before it or only in a log message.
      faults.push({ kind: 'reply_dropped', afterEffectCount: effects.length });
      throw replyLost;
    }
    return 'ok';
  }
  try {
    for (; attempts < 2 && !receivedReply;) {
      if (Date.now() > deadline) throw new Error('budget exceeded');
      attempts++;
      try {
        receivedReply = fakeService() === 'ok';
      } catch (error) {
        if (error !== replyLost) throw error;
      }
    }
    return { attempts, receivedReply, effectCount: effects.length,
      faultCount: faults.length, faultAfterEffect: faults[0]?.afterEffectCount ?? null };
  } finally {
    // Each case owns fresh state; no timers, external effects, or files survive.
    effects.length = 0;
    faults.length = 0;
  }
}

const control = runCase(false);
const lostReply = runCase(true);
assert.deepEqual(control, { attempts: 1, receivedReply: true, effectCount: 1,
  faultCount: 0, faultAfterEffect: null });
assert.equal(lostReply.faultCount, 1);
assert.equal(lostReply.faultAfterEffect, 1);
assert.equal(lostReply.attempts, 2);
assert.equal(lostReply.receivedReply, true);
// This assertion validates the demonstration's counterexample, not HYP-001.
assert.equal(lostReply.effectCount, 2);
console.log(JSON.stringify({ control, lostReply,
  hypothesis: 'HYP-001', hypothesisRevision: 1,
  experiment: 'EXP-001', experimentRevision: 1,
  execution: 'completed', outcome: 'not_supported' }, null, 2));
```

If the control, fault proof, or budget checks fail, execution is `invalid` and
the expected negative conclusion cannot be recorded as an observed result.
If the runner is unavailable, use `blocked` / `not_evaluated`.

## Recording the negative result and a successor

After a real run, append `OBS-001` through `/aif-explore`, using the actual
timestamp, Node version, experiment code revision/digest, and captured output.
The expected result above is one action in the control, two after a dropped
reply, and a reply received in both. The fault record proves loss happened after
the first action. For HYP-001 revision 1 this is `completed` / `not_supported`:
client retries alone fail the agreed single-action criterion in this model.
It does not establish rates of production failures or cover concurrency,
crashes, persistence, expiry, or other fault locations.

Update the baseline with this dated evidence in a successor revision, keeping
revision 1 and OBS-001 intact. If the user chooses to investigate receiver
deduplication, append HYP-001 revision 2 and EXP-001 revision 2: a stable
operation key is recognized by the receiver, so the repeated delivery returns
the recorded reply without repeating the action. Record that as a new inference
with the same source qualifier, criterion, and scope, plus the changed recipe
and baseline evidence. Its planning status starts `proposed`; its outcome starts
`not_evaluated`.

Implementing deduplication or passing ordinary tests does not move OBS-001 to
revision 2 or confirm the new hypothesis. A new evaluation must supply its own
observation bound to both new revisions. Promote the supersession and accepted
next action, if any, into Active Summary; existing linked plans see research
drift and keep their committed scope until explicitly refined.
