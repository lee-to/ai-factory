#!/usr/bin/env node
// Regression coverage for the aif-explore reference assets in directory and flat installs.
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installSkills } from '../dist/core/installer.js';
import { getAgentConfig } from '../dist/core/agents.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(tmpdir(), 'aif-explore-installation-'));
const referenceNames = ['PROJECT-HYPOTHESES.md', 'RETRY-HYPOTHESIS.md'];
const cases = [
  { agentId: 'claude', target: ['.claude', 'skills', 'aif-explore', 'references'] },
  { agentId: 'antigravity', target: ['.agents', 'skills', 'aif-explore', 'references'] },
  { agentId: 'kilocode', target: ['.kilocode', 'workflows', 'references'] },
];

async function readInstalledReferences(referenceDir) {
  const values = new Map();
  for (const name of referenceNames) {
    const file = path.join(referenceDir, name);
    await access(file);
    values.set(name, await readFile(file));
  }
  return values;
}

try {
  for (const { agentId, target } of cases) {
    const agent = getAgentConfig(agentId);
    const projectDir = path.join(temp, agentId);
    const referenceDir = path.join(projectDir, ...target);
    const sourceReferences = new Map();

    for (const name of referenceNames) {
      const source = await readFile(path.join(root, 'skills', 'aif-explore', 'references', name));
      // These references use backticked skill commands. Flat Kilo workflows
      // render those invocations while directory installs preserve these bytes.
      sourceReferences.set(name, agentId === 'kilocode'
        ? Buffer.from(source.toString('utf8').replaceAll('`/aif-', '`/aif:')) : source);
    }

    const firstInstall = await installSkills({
      projectDir,
      skillsDir: agent.skillsDir,
      skills: ['aif-explore'],
      agentId,
    });
    assert.deepEqual(firstInstall, ['aif-explore'], `${agentId}: initial install must report aif-explore`);
    const firstReferences = await readInstalledReferences(referenceDir);

    const reinstall = await installSkills({
      projectDir,
      skillsDir: agent.skillsDir,
      skills: ['aif-explore'],
      agentId,
    });
    assert.deepEqual(reinstall, ['aif-explore'], `${agentId}: reinstall must report aif-explore`);
    const secondReferences = await readInstalledReferences(referenceDir);

    for (const name of referenceNames) {
      assert.deepEqual(firstReferences.get(name), sourceReferences.get(name), `${agentId}: initial ${name} must match the source reference`);
      assert.deepEqual(secondReferences.get(name), sourceReferences.get(name), `${agentId}: reinstalled ${name} must match the source reference`);
      assert.deepEqual(secondReferences.get(name), firstReferences.get(name), `${agentId}: reinstall must preserve ${name}`);
    }

    console.log(`PASS ${agentId}: initial and reinstall reference assets are available`);
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
