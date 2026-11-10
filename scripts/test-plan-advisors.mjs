#!/usr/bin/env node
// Deterministic formatter/config/installation checks, not model decision tests.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { getAvailableSkills, installSkills } from '../dist/core/installer.js';
import { getBuiltinAgentConfigs } from '../dist/core/agents.js';
import { getTransformer } from '../dist/core/transformer.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'aif-plan-advisors-'));
const names = ['aif-plan-overview', 'aif-roadmap-next'];
const python = [['python3'], ['python'], ['py', '-3']].find(([command, ...args]) => {
  const result = spawnSync(command, [...args, '-I', '--version'], { encoding: 'utf8' });
  return !result.error && /^Python 3\./m.test(`${result.stdout}${result.stderr}`);
});
const treeRelative = 'references/plan-overview/file_tree.py';
const sources = new Map(await Promise.all(names.map(async name => [name,
  await fs.readFile(path.join(root, 'skills', name, 'SKILL.md'), 'utf8')])));
try {
  for (const name of names) assert((await getAvailableSkills()).includes(name));
  if (python) execFileSync(python[0], [...python.slice(1), '-I', '-B', path.join(root, 'skills/aif-plan-overview/tests/test_file_tree.py')], { stdio: 'inherit' });
  else console.log('SKIP Python formatter execution: Python 3 unavailable; installation/config checks continue.');

  for (const agent of getBuiltinAgentConfigs()) {
    const project = path.join(temp, agent.id);
    const options = { projectDir: project, agentId: agent.id, skillsDir: agent.skillsDir, skills: names };
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.deepEqual(await installSkills(options), names);
      for (const name of names) {
        const transformed = getTransformer(agent.id).transform(name, sources.get(name));
        const entry = transformed.flat
          ? path.join(project, agent.configDir, transformed.targetDir, transformed.targetName)
          : path.join(project, agent.skillsDir, transformed.targetDir, transformed.targetName);
        const body = await fs.readFile(entry, 'utf8');
        assert(body.includes(`.ai-factory/skill-context/${name}/SKILL.md`));
        const command = name === 'aif-plan-overview' ? 'aif-implement' : 'aif-plan';
        const planInvocation = ['codex', 'codex-app'].includes(agent.id) ? `$${command}`
          : agent.id === 'kilocode' ? `/aif:${command.slice(4)}`
            : agent.id === 'qwen' ? `/skills ${command}` : `/${command}`;
        assert(body.includes(planInvocation), `${agent.id}/${name}: handoff invocation missing`);
        if (name === 'aif-plan-overview') {
          const discovery = path.join(path.dirname(entry), 'references/PLAN-OVERVIEW-DISCOVERY.md');
          assert((await fs.readFile(discovery, 'utf8')).includes('<!-- aif:plan-mode:ultra -->'));
          const helper = path.join(path.dirname(entry), treeRelative);
          assert.deepEqual(await fs.readFile(helper), await fs.readFile(path.join(root, 'skills/aif-plan-overview', treeRelative)));
          if (python && repeat === 0) {
            const tree = execFileSync(python[0], [...python.slice(1), '-I', '-B', helper], {
              cwd: project, input: JSON.stringify([{ path: 'src/{A,B}.ts', action: 'create', refs: ['P1'] }]), encoding: 'utf8',
            });
            assert(tree.includes('planned paths: 2'));
          }
          assert.equal(await fs.stat(path.join(path.dirname(entry), 'tests')).then(() => true, () => false), false);
        }
      }
    }
    console.log(`PASS ${agent.id}: both advisors and tree helper survive install/reinstall with correct invocation paths`);
  }

  const helper = path.join(root, 'skills/aif/references/update-config.mjs');
  const template = path.join(root, 'skills/aif/references/config-template.yaml');
  const target = path.join(temp, 'config.yaml');
  const payload = path.join(temp, 'payload.json');
  await fs.writeFile(payload, JSON.stringify({ mode: 'create', set: {}, fillMissing: {} }));
  execFileSync(process.execPath, [helper, '--template', template, '--target', target, '--payload', payload]);
  const fresh = await fs.readFile(target, 'utf8');
  assert(fresh.includes('# roadmap_next_capacity:'));
  assert.equal(parse(fresh).workflow.roadmap_next_mode, undefined, 'Optional override must not hide plan_mode fallback');
  const manual = 'workflow:\r\n  explore_mode: regular\r\n  plan_mode: full\r\n  improve_check: false\r\n'
    + '  roadmap_next_mode: fast # keep my mode\r\n  roadmap_next_capacity:\r\n'
    + '    fast: 2 # keep custom capacity\r\n    full: 5\r\n    ultra: 8\r\n  custom: keep-me\r\n';
  await fs.writeFile(target, manual);
  await fs.writeFile(payload, JSON.stringify({ mode: 'merge', set: {}, fillMissing: {
    'workflow.explore_mode': 'regular', 'workflow.plan_mode': 'ask', 'workflow.improve_check': false,
  } }));
  await fs.utimes(target, new Date('2000-01-01'), new Date('2000-01-01'));
  const before = (await fs.stat(target)).mtimeMs;
  for (let run = 0; run < 2; run++) {
    execFileSync(process.execPath, [helper, '--template', template, '--target', target, '--payload', payload]);
    assert.equal(await fs.readFile(target, 'utf8'), manual);
    assert.equal((await fs.stat(target)).mtimeMs, before);
  }
  console.log('PASS config: optional defaults, concrete plan_mode fallback and byte-preserved user-owned nested settings');
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
