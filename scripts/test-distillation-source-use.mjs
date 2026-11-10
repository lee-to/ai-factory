#!/usr/bin/env node
// Synthetic traces check assertion sensitivity, not live model behavior.
// shortcut: matching calls do not prove final file state, use final-file assertions when the runner supports them.
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScenarioFile } from '../node_modules/@cutcode/ai-tester/dist/scenario/loader.js';
import { evaluateAssertions } from '../node_modules/@cutcode/ai-tester/dist/assertions/index.js';

const root = new URL('../', import.meta.url);
const sandboxPath = path.join(os.tmpdir(), 'aif-source-use-assertions');
const load = async file => (await loadScenarioFile(fileURLToPath(new URL(file, root)))).scenario.assertions;
const passes = (assertions, calls) => evaluateAssertions(assertions, {
  runner: { sandboxPath }, finalOutput: '', toolCallSummary: { unansweredQuestions: 0 },
  turns: [{ toolCalls: calls }],
}).every(result => result.pass);
const write = (file_path, content) => ({ name: 'Write', input: { file_path, content } });
const edit = new_string => ({ name: 'Edit', input: { file_path: 'output/incident-triage/references/SOURCE-MAP.md', new_string } });

const updated = await load('skills/aif-distillation/tests/updated-source-terms.yaml');
const currentTerms = [
  'Metadata revision: 2 (current; supersedes 1)',
  'Terms: known — https://example.test/triage/TERMS',
  'Export restrictions: local use only; no public export.',
  'Metadata revision: 1 (superseded — terms changed)',
  'Historical terms: CC-BY-4.0 at https://example.test/triage/LICENSE.',
].join('\n');
assert.ok(passes(updated, [edit(currentTerms)]), 'Complete terms update must pass');
assert.ok(passes(updated, currentTerms.split('\n').map(edit)), 'Separate edits retaining all metadata must pass');
assert.equal(passes(updated, [edit(currentTerms.replace('revision: 2', 'revision: 12'))]), false,
  'A different current revision must fail');
assert.equal(passes(updated, [edit('Metadata revision: 2 (current; supersedes 1)')]), false,
  'A revision-only edit must fail');
for (const missing of ['https://example.test/triage/TERMS', 'local use only', 'no public export',
  'Metadata revision: 1 (superseded — terms changed)', 'CC-BY-4.0']) {
  assert.equal(passes(updated, [edit(currentTerms.replace(missing, 'omitted'))]), false, `Missing ${missing} must fail`);
}
assert.equal(passes(updated, [edit(currentTerms.replace('Historical terms: CC-BY-4.0 at https://example.test/triage/LICENSE.', '')
  .replace('Metadata revision: 2', 'Current terms: CC-BY-4.0\nMetadata revision: 2'))]), false,
  'Old terms cannot remain only in the current record');
console.log('PASS updated terms: new reference, both restrictions and superseded history are required');

const redacted = await load('skills/aif-distillation/tests/redacted-source-terms.yaml');
const childMetadata = 'Metadata revision: 1 (current)\nTerms reference: redacted\nLocal use only.\nReduced public traceability: source identifiers withheld.';
const children = ['incident-triage', 'incident-retrospective'].map(scope =>
  write(`output/operations-${scope}/SKILL.md`, childMetadata));
assert.ok(passes(redacted, children), 'Both complete children must pass');
for (const index of [0, 1]) {
  assert.equal(passes(redacted, children.filter((_, child) => child !== index)), false, 'A missing child must fail');
  for (const missing of ['Metadata revision: 1 (current)', 'redacted', 'Local use only', 'Reduced public traceability']) {
    const calls = children.map((call, child) => child === index
      ? write(call.input.file_path, childMetadata.replace(missing, 'omitted')) : call);
    assert.equal(passes(redacted, calls), false, `Child ${index}: missing ${missing} must fail`);
  }
}
assert.equal(passes(redacted, [...children, write('output/operations-extra/SKILL.md', childMetadata)]), false,
  'An unexpected child must fail');
assert.equal(passes(redacted, [children[0], write(children[1].input.file_path, `${childMetadata}\nHidden Atlas`)]), false,
  'An identifying notice in either child must fail');
console.log('PASS split redaction: each expected child needs its own current metadata and restrictions');

const handoff = await load('skills/aif-explore/tests/source-use-handoff.yaml');
const research = [
  'HYP-001\nMetadata revision: 2 (current)\nTerms: https://example.test/triage/TERMS',
  'Local use only; no public export.\nNotice: Credit Example Author.\nOwner decisions: unresolved.',
  'HYP-002\nMetadata revision: 3 (current)\nTerms reference: redacted',
  'Notice: redacted; preserve attribution.',
  'Local use only.\nReduced public traceability: source identifiers withheld.\nOwner decisions: unresolved.',
].join('\n');
const handoffWrite = content => [write('.ai-factory/RESEARCH.md', content)];
assert.ok(passes(handoff, handoffWrite(research)), 'Complete known and redacted handoffs must pass');
for (const [before, after] of [
  ['Metadata revision: 2', 'Metadata revision: 1'],
  ['https://example.test/triage/TERMS', 'https://example.test/triage/LICENSE'],
  ['no public export', 'omitted'], ['Credit Example Author', 'omitted'],
  ['Metadata revision: 3', 'Metadata revision: 2'], ['redacted', 'omitted'],
  ['Reduced public traceability', 'omitted'],
  ['Notice: redacted', 'Notice: omitted'],
]) {
  assert.equal(passes(handoff, handoffWrite(research.replace(before, after))), false, `Handoff: ${before} must be retained`);
}
for (const card of ['HYP-001', 'HYP-002']) {
  const start = research.indexOf(card);
  const restriction = research.indexOf('Local use only', start);
  const missingRestriction = research.slice(0, restriction) + research.slice(restriction).replace('Local use only', 'omitted');
  assert.equal(passes(handoff, handoffWrite(missingRestriction)), false, `${card} must retain its own restriction`);
  const owner = research.indexOf('Owner decisions: unresolved', start);
  const missingOwner = research.slice(0, owner) + research.slice(owner).replace('Owner decisions: unresolved', 'omitted');
  assert.equal(passes(handoff, handoffWrite(missingOwner)), false, `${card} must retain its own owner decision`);
}
for (const identifier of ['Hidden Atlas', 'hidden-atlas.md', 'https://hidden.example.test/terms', 'Secret Author']) {
  assert.equal(passes(handoff, handoffWrite(`${research}\n${identifier}`)), false, `Handoff must not restore ${identifier}`);
  assert.equal(passes(handoff, [...handoffWrite(research), {
    name: 'Edit', input: { file_path: '.ai-factory/RESEARCH.md', new_string: identifier },
  }]), false, `Edits must not restore ${identifier}`);
}
assert.equal(passes(handoff, [...handoffWrite(research), write('.ai-factory/PLAN.md', research)]), false,
  'Handoff cannot write a plan');
assert.equal(passes(handoff, [...handoffWrite(research), {
  name: 'Edit', input: { file_path: '.ai-factory/RULES.md', new_string: research },
}]), false, 'Handoff cannot edit rules');
console.log('PASS handoff: current terms/revisions and per-source disclosure restrictions are required');
