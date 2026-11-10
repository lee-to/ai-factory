#!/usr/bin/env node
// Installation smoke coverage, not execution of the model's ownership decisions.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBuiltinAgentConfigs } from '../dist/core/agents.js';
import { installSkills } from '../dist/core/installer.js';
import { getTransformer } from '../dist/core/transformer.js';
import { buildTemplateVars, processTemplate } from '../dist/core/template.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = await readFile(path.join(root, 'skills/aif-evolve/SKILL.md'), 'utf8');
const references = ['TARGET-OWNERSHIP.md', 'CANDIDATE-VALIDATION.md', 'SHARED-CONTEXT.md'];
const expected = new Map(await Promise.all(references.map(async name => [
  name, await readFile(path.join(root, 'skills/aif-evolve/references', name), 'utf8'),
])));
const project = await mkdtemp(path.join(tmpdir(), 'aif-evolve-ownership-'));
try {
  for (const agent of getBuiltinAgentConfigs()) {
    const directory = path.join(project, agent.id);
    const options = { projectDir: directory, agentId: agent.id, skillsDir: agent.skillsDir, skills: ['aif-evolve'] };
    const transformer = getTransformer(agent.id);
    const transformed = transformer.transform('aif-evolve', source);
    const skillRoot = path.join(directory, agent.skillsDir, transformed.flat ? '' : transformed.targetDir);
    // Reinstallation must retain both the ownership gate and candidate validation.
    for (let run = 0; run < 2; run++) {
      assert.deepEqual(await installSkills(options), ['aif-evolve']);
      const entrypoint = await readFile(path.join(skillRoot, transformed.targetName), 'utf8');
      assert.ok(entrypoint.includes('--global'), `${agent.id}: scope option missing`);
      assert.ok(entrypoint.includes('Bash(realpath *)'), `${agent.id}: canonicalization permission missing`);
      for (const name of references) {
        assert.ok(entrypoint.includes(`references/${name}`), `${agent.id}: ${name} routing missing`);
        const reference = transformer.transformReference?.('aif-evolve', expected.get(name)) ?? expected.get(name);
        assert.equal(await readFile(path.join(skillRoot, 'references', name), 'utf8'), processTemplate(reference, buildTemplateVars(agent)), `${agent.id}: ${name} missing or changed`);
      }
    }
    console.log(`PASS ${agent.id}: evolve scope/validation references survive installation and reinstallation`);
  }
} finally {
  await rm(project, { recursive: true, force: true });
}
