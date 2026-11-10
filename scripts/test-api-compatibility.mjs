#!/usr/bin/env node
// Check original example data and installed references; no model or network calls.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBuiltinAgentConfigs } from '../dist/core/agents.js';
import { installSkills } from '../dist/core/installer.js';
import { getTransformer } from '../dist/core/transformer.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const review = await readFile(path.join(root, 'skills/aif-review/SKILL.md'), 'utf8');
const reference = await readFile(path.join(root, 'skills/aif-review/references/API-COMPATIBILITY.md'));
assert.ok(review.includes('references/API-COMPATIBILITY.md'), 'Review must route API changes to the reference');

const before = { id: 'job-1', name: 'ready' };
const reader = response => response.name.toUpperCase();
assert.equal(reader(before), 'READY');
assert.throws(() => reader({ id: 'job-1' }), TypeError, 'removed-field must break this reader');
assert.throws(() => reader({ ...before, name: null }), TypeError, 'nullable-response must break this reader');
const additive = { ...before, displayLabel: 'Ready job' };
assert.equal(reader(additive), 'READY', 'additive-tolerant must remain compatible');
const closedReader = response => {
  assert.deepEqual(Object.keys(response).sort(), ['id', 'name']);
  return reader(response);
};
assert.equal(closedReader(before), 'READY');
assert.throws(() => closedReader(additive), assert.AssertionError, 'additive-closed has a different consumer contract');

// Synthetic timeout-after-commit observations: same request key, different effects.
const repeatedKeys = ['request-1', 'request-1'];
const oldResponses = [{ id: 'job-1' }, { id: 'job-1' }];
const newResponses = [{ id: 'job-1' }, { id: 'job-2' }];
assert.equal(new Set(repeatedKeys).size, 1);
assert.ok([...oldResponses, ...newResponses].every(value => typeof value.id === 'string'));
assert.equal(new Set(oldResponses.map(value => value.id)).size, 1);
assert.equal(new Set(newResponses.map(value => value.id)).size, 2, 'retry-dedup changes effects without changing wire shape');

const project = await mkdtemp(path.join(tmpdir(), 'aif-api-reference-'));
try {
  for (const agent of getBuiltinAgentConfigs()) {
    const directory = path.join(project, agent.id);
    const installed = await installSkills({ projectDir: directory, agentId: agent.id, skillsDir: agent.skillsDir, skills: ['aif-review'] });
    assert.deepEqual(installed, ['aif-review']);
    const transformed = getTransformer(agent.id).transform('aif-review', review);
    const skillRoot = path.join(directory, agent.skillsDir, transformed.flat ? '' : transformed.targetDir);
    const installedSkill = await readFile(path.join(skillRoot, transformed.targetName), 'utf8');
    assert.ok(installedSkill.includes('references/API-COMPATIBILITY.md'), `${agent.id}: routing link missing`);
    assert.deepEqual(await readFile(path.join(skillRoot, 'references/API-COMPATIBILITY.md')), reference, `${agent.id}: reference missing or changed`);
    console.log(`PASS ${agent.id}: standalone review includes the API compatibility reference`);
  }
} finally {
  await rm(project, { recursive: true, force: true });
}
console.log('PASS API example data: removal, nullability, retry effects, tolerant and closed readers');
