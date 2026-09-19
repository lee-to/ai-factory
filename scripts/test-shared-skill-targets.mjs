#!/usr/bin/env node
// Regression coverage for #163: shared Codex app / Universal skills.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertCompatibleSkillTargets, getTransformer } from '../dist/core/transformer.js';
import { getAgentChoices, getBuiltinAgentConfigs } from '../dist/core/agents.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(path.join(tmpdir(), 'aif-shared-skills-'));

function cli(project, ...args) {
  const result = spawnSync(process.execPath, [path.join(root, 'dist/cli/index.js'), ...args], {
    cwd: project,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${args.join(' ')} failed:\n${result.stdout}${result.stderr}`);
  return result.stdout;
}

try {
  const choices = getAgentChoices();
  for (const id of ['codex', 'codex-app', 'universal']) {
    assert.ok(choices.some(choice => choice.value === id), `${id} must remain selectable in the wizard`);
  }
  const builtins = getBuiltinAgentConfigs();
  assertCompatibleSkillTargets(builtins);
  const targetsByDir = new Map();
  for (const agent of builtins) {
    const dir = path.normalize(agent.skillsDir);
    targetsByDir.set(dir, [...(targetsByDir.get(dir) ?? []), agent]);
  }
  for (const [dir, agents] of targetsByDir) {
    if (agents.length < 2) continue;
    const output = agents.map(agent => getTransformer(agent.id, builtins).transform('aif', 'Run /aif-plan.'));
    for (const result of output.slice(1)) {
      assert.deepEqual(result, output[0], `Agents sharing ${dir} must produce compatible skills`);
    }
  }

  const separateTargets = [
    { id: 'universal', skillsDir: '.other/skills' },
    { id: 'codex-app', skillsDir: '.agents/skills' },
  ];
  assertCompatibleSkillTargets(separateTargets);
  assert.equal(getTransformer('universal', separateTargets).transform('aif', '/aif-plan').content, '/aif-plan');
  assert.throws(() => assertCompatibleSkillTargets([
    { id: 'qwen', skillsDir: '.agents/skills' },
    { id: 'codex-app', skillsDir: '.agents/skills' },
  ]), /Incompatible agent skill targets/);

  const extension = path.join(temp, 'extension');
  const extensionSkills = ['shared-helper', 'shared-replacement'];
  for (const skill of extensionSkills) {
    const dir = path.join(extension, 'skills', skill);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${skill}\ndescription: Shared skills regression fixture\n---\nRun /aif-plan.\n`);
  }
  writeFileSync(path.join(extension, 'extension.json'), JSON.stringify({
    name: 'aif-ext-shared-test',
    version: '1.0.0',
    description: 'Shared skills regression fixture',
    skills: extensionSkills.map(skill => `skills/${skill}`),
    replaces: { 'skills/shared-replacement': 'aif' },
  }));

  for (const agents of ['codex-app,universal', 'universal,codex-app']) {
    const project = mkdtempSync(path.join(temp, 'project-'));
    cli(project, 'init', '--agents', agents, '--skills', 'aif', '--mcp', 'filesystem');
    const skillPath = path.join(project, '.agents/skills/aif/SKILL.md');
    const installed = readFileSync(skillPath, 'utf8');
    assert.match(installed, /\$aif-skill-generator/);
    assert.doesNotMatch(installed, /`\/aif-skill-generator`/);
    assert.match(readFileSync(path.join(project, '.codex/config.toml'), 'utf8'), /\[mcp_servers\.filesystem\]/);
    const mcp = JSON.parse(readFileSync(path.join(project, '.mcp.json'), 'utf8'));
    assert.ok(mcp.mcpServers.filesystem);
    const config = JSON.parse(readFileSync(path.join(project, '.ai-factory.json'), 'utf8'));
    assert.deepEqual(config.agents.map(agent => agent.id), agents.split(','));
    assert.deepEqual(config.agents[0].managedSkills, config.agents[1].managedSkills);
    for (const args of [['update'], ['update', '--force'], ['update']]) {
      const output = cli(project, ...args);
      assert.doesNotMatch(output, /local drift|Local modifications detected/, 'Shared runtimes must not cause repeated hash drift');
      assert.equal(readFileSync(skillPath, 'utf8'), installed, 'Updates must preserve the shared invocation format');
    }

    cli(project, 'extension', 'add', extension);
    assert.match(readFileSync(skillPath, 'utf8'), /Run \$aif-plan\./);
    assert.match(readFileSync(path.join(project, '.agents/skills/shared-helper/SKILL.md'), 'utf8'), /Run \$aif-plan\./);
    cli(project, 'extension', 'remove', 'aif-ext-shared-test');
    assert.equal(readFileSync(skillPath, 'utf8'), installed, 'Restored base skills must keep Codex invocations');

    const custom = path.join(project, '.agents/skills/local-helper/SKILL.md');
    mkdirSync(path.dirname(custom), { recursive: true });
    writeFileSync(custom, 'User-owned skill\n');
    const remainingAgent = agents.split(',')[0];
    cli(project, 'init', '--agents', remainingAgent, '--skills', 'aif');
    assert.equal(readFileSync(custom, 'utf8'), 'User-owned skill\n', 'Deselecting a shared runtime must preserve custom skills');
    const remainingSkill = readFileSync(skillPath, 'utf8');
    assert.match(remainingSkill, remainingAgent === 'codex-app' ? /\$aif-skill-generator/ : /`\/aif-skill-generator`/);
  }
  // Codex CLI also selects .agents/skills when .agents already exists.
  for (const agents of ['codex,universal', 'universal,codex', 'universal,codex-app,codex']) {
    const project = mkdtempSync(path.join(temp, 'codex-project-'));
    mkdirSync(path.join(project, '.agents'));
    cli(project, 'init', '--agents', agents, '--skills', 'aif');
    const config = JSON.parse(readFileSync(path.join(project, '.ai-factory.json'), 'utf8'));
    assert.ok(config.agents.every(agent => agent.skillsDir === '.agents/skills'));
    const skillPath = path.join(project, '.agents/skills/aif/SKILL.md');
    const installed = readFileSync(skillPath, 'utf8');
    assert.match(installed, /\$aif-skill-generator/);
    cli(project, 'update', '--force');
    assert.equal(readFileSync(skillPath, 'utf8'), installed);
  }
  console.log('shared Codex / Universal skill regression tests passed');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
