#!/usr/bin/env node
// Regression coverage for #163: shared Codex app / Universal skills.
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertCompatibleSkillTargets, getTransformer } from '../dist/core/transformer.js';
import { getAgentChoices, getBuiltinAgentConfigs } from '../dist/core/agents.js';
import { commitResolvedExtension } from '../dist/core/extension-ops.js';
import { preflightSkillMigration } from '../dist/core/skills-migration.js';
import { resolveSkillTargets } from '../dist/core/skill-targets.js';

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

function snapshot(directory) {
  if (!existsSync(directory)) return null;
  return Object.fromEntries(readdirSync(directory).sort().map(name => {
    const file = path.join(directory, name);
    const stat = statSync(file);
    return [name, stat.isDirectory() ? snapshot(file) : {
      bytes: readFileSync(file), mode: stat.mode & 0o7777,
    }];
  }));
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

  for (const agents of ['codex,codex-app', 'codex-app,universal', 'codex,universal', 'codex,codex-app,universal']) {
    const project = mkdtempSync(path.join(temp, 'rollback-'));
    mkdirSync(path.join(project, '.agents'));
    cli(project, 'init', '--agents', agents, '--skills', 'aif');
    const configPath = path.join(project, '.ai-factory.json');
    const configBefore = readFileSync(configPath);
    const config = JSON.parse(configBefore);
    const skillRoot = path.join(project, '.agents/skills/aif');
    writeFileSync(path.join(skillRoot, 'executable.sh'), '#!/bin/sh\nexit 0\n');
    writeFileSync(path.join(skillRoot, 'private.txt'), 'local content\n');
    mkdirSync(path.join(skillRoot, 'empty'));
    if (process.platform !== 'win32') {
      chmodSync(path.join(skillRoot, 'SKILL.md'), 0o640);
      chmodSync(path.join(skillRoot, 'executable.sh'), 0o755);
      chmodSync(path.join(skillRoot, 'private.txt'), 0o600);
    }
    const before = snapshot(path.join(project, '.agents/skills'));
    const manifest = {
      name: 'aif-ext-shared-rollback', version: '1.0.0',
      skills: ['skills/shared-replacement'], replaces: { 'skills/shared-replacement': 'aif' },
      mcpServers: [{ key: 'broken', template: {} }],
    };
    await assert.rejects(commitResolvedExtension(project, {
      config, source: extension,
      resolved: { sourceDir: extension, manifest, cleanup: async () => {} },
    }), error => {
      assert.deepEqual(error.partialResult?.replacedSkills, ['aif'], 'Replacement must succeed before the next resource fails');
      assert.match(error.message, /MCP/);
      return true;
    });
    assert.deepEqual(snapshot(path.join(project, '.agents/skills')), before, `${agents}: failed first extension install must restore bytes, modes and directories`);
    assert.deepEqual(readFileSync(configPath), configBefore);
    console.log(`PASS rollback after successful replacement: ${agents}`);
  }

  for (const [from, to] of [
    ['universal', 'universal,codex-app'], ['codex-app', 'universal,codex-app'],
    ['universal,codex-app', 'universal'], ['universal,codex-app', 'codex-app'],
  ]) {
    const project = mkdtempSync(path.join(temp, 'registered-custom-'));
    cli(project, 'init', '--agents', from, '--skills', 'aif');
    const configPath = path.join(project, '.ai-factory.json');
    const config = JSON.parse(readFileSync(configPath));
    // Include a basename collision: custom/aif is not the managed root-level aif.
    for (const name of ['custom/local-helper', 'custom/aif', 'local-helper']) {
      const directory = path.join(project, '.agents/skills', name);
      mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(directory, 'SKILL.md'), `User-owned ${name}: /aif-plan\n`);
      if (process.platform !== 'win32') chmodSync(path.join(directory, 'SKILL.md'), 0o600);
      for (const agent of config.agents) agent.installedSkills.push(name);
    }
    writeFileSync(configPath, JSON.stringify(config));
    const before = snapshot(path.join(project, '.agents/skills/custom'));
    const flatBefore = snapshot(path.join(project, '.agents/skills/local-helper'));
    cli(project, 'init', '--agents', to, '--skills', 'aif');
    assert.deepEqual(snapshot(path.join(project, '.agents/skills/custom')), before, `${from} -> ${to}: custom skills must remain unchanged`);
    assert.deepEqual(snapshot(path.join(project, '.agents/skills/local-helper')), flatBefore);
    const saved = JSON.parse(readFileSync(configPath));
    for (const agent of saved.agents.filter(agent => from.split(',').includes(agent.id))) {
      assert.ok(agent.installedSkills.includes('custom/local-helper'));
      assert.ok(agent.installedSkills.includes('custom/aif'));
      assert.ok(agent.installedSkills.includes('local-helper'));
    }
    const content = readFileSync(path.join(project, '.agents/skills/aif/SKILL.md'), 'utf8');
    assert.match(content, to === 'universal' ? /`\/aif-skill-generator`/ : /\$aif-skill-generator/);
    console.log(`PASS registered custom skills: ${from} -> ${to}`);
  }

  for (const scenario of ['local-edit', 'missing-baseline', 'unknown-managed-source', 'physical-move']) {
    const project = mkdtempSync(path.join(temp, 'custom-guards-'));
    cli(project, 'init', '--agents', 'universal', '--skills', 'aif');
    const config = JSON.parse(readFileSync(path.join(project, '.ai-factory.json')));
    const agent = config.agents[0];
    agent.installedSkills.push('custom/local-helper');
    const skill = path.join(project, '.agents/skills/aif/SKILL.md');
    let expected;
    if (scenario === 'local-edit') {
      writeFileSync(skill, readFileSync(skill, 'utf8') + '\nLocal changes\n');
      expected = /Skill migration conflict/;
    } else if (scenario === 'missing-baseline') {
      delete agent.managedSkills.aif;
      expected = /Missing or changed managed baseline/;
    } else if (scenario === 'unknown-managed-source') {
      agent.installedSkills.push('missing-managed');
      agent.managedSkills['missing-managed'] = { ...agent.managedSkills.aif };
      expected = /Unknown source for "missing-managed"/;
    } else {
      expected = /Unknown source for "local-helper"/;
    }
    const groups = await resolveSkillTargets(project, scenario === 'physical-move'
      ? [{ id: 'universal', skillsDir: '.other/skills' }]
      : [{ id: 'universal', skillsDir: '.agents/skills' }, { id: 'codex-app', skillsDir: '.agents/skills' }]);
    const before = snapshot(path.join(project, '.agents/skills'));
    await assert.rejects(preflightSkillMigration(project, config, groups), expected);
    assert.deepEqual(snapshot(path.join(project, '.agents/skills')), before, 'Rejected preflight must not mutate skills');
    console.log(`PASS managed migration guard: ${scenario}`);
  }

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
