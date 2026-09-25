import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installSkills, installExtensionSkills, buildManagedSkillsState, updateSkills, removeOwnedSkills } from '../dist/core/installer.js';
import { saveConfig, loadConfig } from '../dist/core/config.js';
import { resolveSkillTargets, hasSurvivingConfigConsumer } from '../dist/core/skill-targets.js';
import { preflightSkillMigration, collectSkillOwners, applySkillMigration, recoverSkillMigration, withSkillProjectLock } from '../dist/core/skills-migration.js';
import { commitResolvedExtension, composeInstalledExtensionSkills, installExtensionAssetsForAllAgents, stripInjectionsForAllAgents } from '../dist/core/extension-ops.js';
import { getExtensionsDir } from '../dist/core/extensions.js';
import { applyInjection } from '../dist/core/injections.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const groups = new Set((process.argv.find(arg => arg.startsWith('--group='))?.slice(8) ?? 'control,targets,core,cli').split(','));
const cases = [];
const test = (group, name, run) => cases.push({ group, name, run });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// Raw custody evidence deliberately includes empty directories and links.
async function snapshot(directory) {
  const entries = {};
  async function visit(current, relative) {
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) entries[relative] = ['link', await fs.readlink(current)];
    else if (stat.isDirectory()) {
      entries[relative] = ['directory'];
      for (const name of (await fs.readdir(current)).sort()) await visit(path.join(current, name), `${relative}/${name}`);
    } else entries[relative] = ['file', digest(await fs.readFile(current))];
  }
  await visit(directory, '.');
  return entries;
}

const installation = (id, skillsDir, installedSkills = ['aif']) => ({
  id, skillsDir, installedSkills,
  mcp: { github: false, filesystem: false, postgres: false, chromeDevtools: false, playwright: false },
});

async function legacyProject(project) {
  const agent = installation('codex', '.codex/skills');
  await installSkills({ projectDir: project, agentId: agent.id, skillsDir: agent.skillsDir, skills: agent.installedSkills });
  agent.managedSkills = await buildManagedSkillsState(project, agent, agent.installedSkills);
  const config = { version: '2.19.0', agents: [agent] };
  await saveConfig(project, config, { hydrateAgentFileSources: false });
  await fs.mkdir(path.join(project, '.agents'), { recursive: true });
  return config;
}

function runInit(project, agents = 'codex') {
  const url = pathToFileURL(path.join(root, 'dist/cli/commands/init.js')).href;
  const code = `const { initCommand } = await import(${JSON.stringify(url)}); await initCommand({agents:${JSON.stringify(agents)},skills:'aif'});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: project, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, `init ${agents} failed: ${result.error?.message ?? result.stderr}`);
}

function runUpdate(project, force = false, expectSuccess = true) {
  const url = pathToFileURL(path.join(root, 'dist/cli/commands/update.js')).href;
  const code = `globalThis.fetch = async () => ({ok:true,status:200,headers:{get:()=>null},json:async()=>({version:'2.19.0'})}); const { updateCommand } = await import(${JSON.stringify(url)}); await updateCommand({force:${force}});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: project, encoding: 'utf8', timeout: 60000 });
  if (expectSuccess) assert.equal(result.status, 0, `update failed: ${result.error?.message ?? result.stderr}\n${result.stdout}`);
  else assert.notEqual(result.status, 0, 'update unexpectedly succeeded');
  return result.stdout;
}

test('control', 'raw snapshots detect empty directories and byte edits', async project => {
  await fs.writeFile(path.join(project, 'sample'), 'one');
  const before = await snapshot(project);
  await fs.mkdir(path.join(project, 'empty'));
  assert.notDeepEqual(await snapshot(project), before);
  await fs.writeFile(path.join(project, 'sample'), 'two');
  assert.notEqual((await snapshot(project))['./sample'][1], before['./sample'][1]);
});

test('control', 'empty project keeps the Codex legacy default', async project => {
  runInit(project);
  const config = JSON.parse(await fs.readFile(path.join(project, '.ai-factory.json'), 'utf8'));
  assert.equal(config.agents[0].skillsDir, '.codex/skills');
});

test('core', 'direct installer renders the actual override in helper paths', async project => {
  assert.deepEqual(await installSkills({ projectDir: project, agentId: 'codex', skillsDir: '.agents/skills', skills: ['aif'] }), ['aif']);
  const content = await fs.readFile(path.join(project, '.agents/skills/aif/SKILL.md'), 'utf8');
  assert.ok(content.includes('.agents/skills/'), 'effective skill paths missing');
  assert.ok(!content.includes('.codex/skills/'), 'legacy helper path remains');
  assert.ok(content.includes('$aif-'), 'Codex invocation syntax lost');
});

test('core', 'extension references receive the same effective context', async project => {
  const source = path.join(project, 'extension/demo');
  await fs.mkdir(path.join(source, 'references'), { recursive: true });
  await fs.writeFile(path.join(source, 'SKILL.md'), '---\nname: demo\ndescription: demo\n---\n{{skills_dir}} /aif-plan\n');
  await fs.writeFile(path.join(source, 'references/helper.md'), '{{skills_dir}}/demo/script.mjs');
  assert.deepEqual(await installExtensionSkills(project, installation('codex', '.agents/skills'), path.dirname(source), ['demo']), ['demo']);
  assert.equal(await fs.readFile(path.join(project, '.agents/skills/demo/references/helper.md'), 'utf8'), '.agents/skills/demo/script.mjs');
});

test('core', 'custom project overrides keep runtime home paths and singleton metadata', async project => {
  const source = path.join(project, 'extension/demo');
  await fs.mkdir(source, { recursive: true });
  await fs.writeFile(path.join(source, 'SKILL.md'), '---\nname: demo\n---\n{{skills_dir}} ~/{{skills_dir}} {{home_skills_dir}} {{config_dir}} {{skills_cli_agent_flag}} {{agent_name}}');
  await installExtensionSkills(project, installation('codex-app', '.team/skills'), path.dirname(source), ['demo']);
  const content = await fs.readFile(path.join(project, '.team/skills/demo/SKILL.md'), 'utf8');
  assert.ok(content.includes('.team/skills ~/.agents/skills ~/.agents/skills .agents  Codex app'));
});

test('core', 'shared CLI/App renders identically and receipts track profile changes', async project => {
  const agents = [installation('codex', '.agents/skills'), installation('codex-app', '.agents/skills')];
  const [group] = await resolveSkillTargets(project, agents, { select: false });
  await installSkills({ projectDir: project, agentId: 'codex', skillsDir: group.skillsDir, skills: ['aif'], renderContext: group.context });
  const before = await snapshot(path.join(project, group.skillsDir));
  await installSkills({ projectDir: project, agentId: 'codex-app', skillsDir: group.skillsDir, skills: ['aif'], renderContext: group.context });
  assert.deepEqual(await snapshot(path.join(project, group.skillsDir)), before);
  const agent = agents[0];
  agent.managedSkills = await buildManagedSkillsState(project, agent, ['aif'], group.context);
  agent.managedAgentFiles = { 'demo.toml': { sourceHash: 'source', installedHash: 'installed', renderContextHash: group.context.hash } };
  await saveConfig(project, { version: '2.19.0', agents: [agent] }, { hydrateAgentFileSources: false });
  const loaded = await loadConfig(project);
  assert.equal(loaded.agents[0].managedSkills.aif.renderContextHash, group.context.hash);
  assert.equal(loaded.agents[0].managedAgentFiles['demo.toml'].renderContextHash, undefined);
  const stable = await updateSkills(agent, project, { renderContext: group.context });
  assert.equal(stable.entries.find(entry => entry.skill === 'aif').status, 'unchanged');
  const singleton = await updateSkills(agent, project);
  assert.equal(singleton.entries.find(entry => entry.skill === 'aif').reason, 'render-context-changed');
});

test('core', 'shared custom targets have one home profile and survive lifecycle transitions', async project => {
  const agents = [installation('codex', '.team/skills'), installation('codex-app', '.team/skills')];
  const [group] = await resolveSkillTargets(project, agents);
  const [reversed] = await resolveSkillTargets(project, [...agents].reverse());
  assert.equal(group.context.hash, reversed.context.hash);
  const source = path.join(project, 'source/demo');
  await fs.mkdir(path.join(source, 'references'), { recursive: true });
  const template = '{{skills_dir}} ~/{{skills_dir}} {{home_skills_dir}} {{config_dir}} {{skills_cli_agent_flag}} {{agent_name}}';
  await fs.writeFile(path.join(source, 'SKILL.md'), `---\nname: demo\n---\n${template}`);
  await fs.writeFile(path.join(source, 'references/helper.md'), template);
  for (const agent of agents) {
    await installExtensionSkills(project, agent, path.dirname(source), ['demo'], undefined, group.context);
    const content = await fs.readFile(path.join(project, '.team/skills/demo/references/helper.md'), 'utf8');
    assert.equal(content, '.team/skills ~/.codex/skills ~/.codex/skills .codex --agent codex Codex');
  }
  await installSkills({ projectDir: project, agentId: 'codex', skillsDir: group.skillsDir, skills: ['aif'], renderContext: group.context });
  for (const agent of agents) agent.managedSkills = await buildManagedSkillsState(project, agent, ['aif'], group.context);
  await saveConfig(project, { version: '2.19.0', agents }, { hydrateAgentFileSources: false });
  const before = await snapshot(path.join(project, '.team/skills'));
  runUpdate(project);
  runUpdate(project);
  assert.deepEqual(await snapshot(path.join(project, '.team/skills')), before);
  runInit(project, 'codex-app');
  const saved = await loadConfig(project);
  assert.equal(saved.agents[0].skillsDir, '.team/skills');
  assert.notEqual(saved.agents[0].managedSkills.aif.renderContextHash, group.context.hash);
});

for (const legacy of [false, true]) {
  test('cli', `init prefers an existing empty .agents (legacy directory: ${legacy})`, async project => {
    await fs.mkdir(path.join(project, '.agents'));
    if (legacy) await fs.mkdir(path.join(project, '.codex'));
    runInit(project);
    const config = JSON.parse(await fs.readFile(path.join(project, '.ai-factory.json'), 'utf8'));
    assert.equal(config.agents[0].skillsDir, '.agents/skills');
    await fs.access(path.join(project, '.agents/skills/aif/SKILL.md'));
    await fs.access(path.join(project, '.codex/config.toml'));
    await fs.access(path.join(project, '.codex/agents'));
  });
}

test('cli', 'empty CLI/App init migrates on update and stays stable on repeated update', async project => {
  runInit(project, 'codex-app,codex');
  const first = await loadConfig(project);
  assert.equal(first.agents.find(agent => agent.id === 'codex').skillsDir, '.codex/skills');
  const nativeConfig = await fs.readFile(path.join(project, '.codex/config.toml'));
  runUpdate(project);
  const migrated = await loadConfig(project);
  assert.ok(migrated.agents.every(agent => agent.skillsDir === '.agents/skills'));
  await assert.rejects(fs.access(path.join(project, '.codex/skills/aif/SKILL.md')));
  const before = await snapshot(path.join(project, '.agents/skills'));
  const output = runUpdate(project);
  assert.ok(!output.includes('local drift'));
  assert.deepEqual(await snapshot(path.join(project, '.agents/skills')), before);
  runUpdate(project, true);
  assert.deepEqual(await fs.readFile(path.join(project, '.codex/config.toml')), nativeConfig);
  await assert.rejects(fs.access(path.join(project, '.codex/skills/aif/SKILL.md')));
});

test('cli', 'shared update preserves different per-runtime selections and their union', async project => {
  const agents = [installation('codex', '.agents/skills', ['aif']), installation('codex-app', '.agents/skills', ['aif-plan'])];
  const [group] = await resolveSkillTargets(project, agents, { select: false });
  await installSkills({ projectDir: project, agentId: 'codex', skillsDir: group.skillsDir, skills: ['aif', 'aif-plan'], renderContext: group.context });
  for (const agent of agents) agent.managedSkills = await buildManagedSkillsState(project, agent, agent.installedSkills, group.context);
  for (const order of [agents, [...agents].reverse()]) {
    await saveConfig(project, { version: '2.19.0', agents: order }, { hydrateAgentFileSources: false });
    const before = await snapshot(path.join(project, '.agents/skills'));
    runUpdate(project);
    const saved = await loadConfig(project);
    assert.deepEqual(saved.agents.find(agent => agent.id === 'codex').installedSkills, ['aif']);
    assert.deepEqual(saved.agents.find(agent => agent.id === 'codex-app').installedSkills, ['aif-plan']);
    assert.deepEqual(await snapshot(path.join(project, '.agents/skills')), before);
  }
});

for (const survivor of ['codex', 'codex-app']) {
  test('cli', `re-init retains shared skills/config when only ${survivor} remains`, async project => {
    await fs.mkdir(path.join(project, '.agents'));
    runInit(project, 'codex,codex-app');
    const native = await fs.readFile(path.join(project, '.codex/config.toml'));
    await fs.mkdir(path.join(project, '.agents/skills/user'));
    await fs.writeFile(path.join(project, '.agents/skills/user/SKILL.md'), 'private skill');
    runInit(project, survivor);
    const config = await loadConfig(project);
    assert.deepEqual(config.agents.map(agent => agent.id), [survivor]);
    assert.equal(config.agents[0].skillsDir, '.agents/skills');
    await fs.access(path.join(project, '.agents/skills/aif/SKILL.md'));
    assert.equal(await fs.readFile(path.join(project, '.agents/skills/user/SKILL.md'), 'utf8'), 'private skill');
    assert.deepEqual(await fs.readFile(path.join(project, '.codex/config.toml')), native);
  });
}

test('cli', 'first init defaults are independent of CLI/App selection order', async project => {
  for (const [index, agents] of ['codex,codex-app', 'codex-app,codex'].entries()) {
    const directory = path.join(project, String(index));
    await fs.mkdir(directory);
    runInit(directory, agents);
    const config = await loadConfig(directory);
    assert.equal(config.agents.find(agent => agent.id === 'codex').skillsDir, '.codex/skills');
    assert.equal(config.agents.find(agent => agent.id === 'codex-app').skillsDir, '.agents/skills');
  }
});

test('cli', 're-init restores persisted shared and custom paths without reverting', async project => {
  for (const [index, skillsDir] of ['.agents/skills', '.team/skills'].entries()) {
    const directory = path.join(project, String(index));
    await fs.mkdir(directory);
    await saveConfig(directory, { version: '2.19.0', agents: [installation('codex', skillsDir)] }, { hydrateAgentFileSources: false });
    runInit(directory);
    assert.equal((await loadConfig(directory)).agents[0].skillsDir, skillsDir);
    await fs.access(path.join(directory, skillsDir, 'aif/SKILL.md'));
  }
});

test('cli', 'extension mutations reject incompatible targets and list remains read-only', async project => {
  const config = { version: '2.19.0', agents: [installation('codex', '.agents/skills'), installation('universal', '.agents/skills')],
    extensions: [{ name: 'aif-ext-guard', version: '1.0.0', source: './extension-source' }] };
  await saveConfig(project, config, { hydrateAgentFileSources: false });
  await fs.mkdir(path.join(project, '.agents/skills/aif'), { recursive: true });
  await fs.writeFile(path.join(project, '.agents/skills/aif/SKILL.md'), 'existing user bytes');
  await fs.mkdir(path.join(project, 'extension-source'));
  await fs.writeFile(path.join(project, 'extension-source/extension.json'), JSON.stringify({ name: 'aif-ext-guard', version: '1.0.0' }));
  const before = await snapshot(path.join(project, '.agents'));
  const configBefore = await fs.readFile(path.join(project, '.ai-factory.json'));
  const url = pathToFileURL(path.join(root, 'dist/cli/commands/extension.js')).href;
  for (const [command, argument] of [['extensionAddCommand', './extension-source'], ['extensionUpdateCommand', 'aif-ext-guard'], ['extensionRemoveCommand', 'aif-ext-guard']]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `const m=await import(${JSON.stringify(url)}); await m[${JSON.stringify(command)}](${JSON.stringify(argument)});`], { cwd: project, encoding: 'utf8', timeout: 60000 });
    assert.notEqual(result.status, 0, `${command} should reject the incompatible target`);
    assert.match(result.stderr + result.stdout, /Incompatible/);
    assert.deepEqual(await snapshot(path.join(project, '.agents')), before);
    assert.deepEqual(await fs.readFile(path.join(project, '.ai-factory.json')), configBefore);
  }
  const beforeList = await snapshot(project);
  const listed = spawnSync(process.execPath, ['--input-type=module', '-e', `const m=await import(${JSON.stringify(url)}); await m.extensionListCommand();`], { cwd: project, encoding: 'utf8', timeout: 60000 });
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(await snapshot(project), beforeList);
});

let failures = 0;
test('upgrade', 'v1 Codex upgrade selects .agents before legacy cleanup', async project => {
  await fs.mkdir(path.join(project, '.agents'));
  await fs.mkdir(path.join(project, '.codex/skills/commit'), { recursive: true });
  await fs.copyFile(path.join(root, 'skills/aif-commit/SKILL.md'), path.join(project, '.codex/skills/commit/SKILL.md'));
  await fs.mkdir(path.join(project, '.codex/skills/user'));
  await fs.writeFile(path.join(project, '.codex/skills/user/SKILL.md'), 'user skill');
  await fs.writeFile(path.join(project, '.codex/config.toml'), 'user native config');
  await fs.writeFile(path.join(project, '.ai-factory.json'), JSON.stringify({ version: '1.0.0', agent: 'codex', skillsDir: '.codex/skills', installedSkills: ['commit'] }));
  const url = pathToFileURL(path.join(root, 'dist/cli/commands/upgrade.js')).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `const m=await import(${JSON.stringify(url)}); await m.upgradeCommand();`], { cwd: project, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal((await loadConfig(project)).agents[0].skillsDir, '.agents/skills');
  await fs.access(path.join(project, '.agents/skills/aif-commit/SKILL.md'));
  await assert.rejects(fs.access(path.join(project, '.codex/skills/commit/SKILL.md')));
  await assert.rejects(fs.access(path.join(project, '.codex/skills/aif-commit/SKILL.md')));
  assert.equal(await fs.readFile(path.join(project, '.codex/skills/user/SKILL.md'), 'utf8'), 'user skill');
  assert.equal(await fs.readFile(path.join(project, '.codex/config.toml'), 'utf8'), 'user native config');
});

test('upgrade', 'incompatible upgrade fails before legacy file/directory changes', async project => {
  const agents = [installation('codex', '.agents/skills', ['commit']), installation('universal', '.agents/skills', ['commit'])];
  await fs.mkdir(path.join(project, '.agents/skills/commit'), { recursive: true });
  await fs.writeFile(path.join(project, '.agents/skills/commit/SKILL.md'), 'legacy');
  await fs.mkdir(path.join(project, '.ai-factory/changes'), { recursive: true });
  await fs.writeFile(path.join(project, '.ai-factory/changes/task.md'), 'old plan');
  await saveConfig(project, { version: '1.0.0', agents }, { hydrateAgentFileSources: false });
  const before = await snapshot(path.join(project, '.agents'));
  const configBefore = await fs.readFile(path.join(project, '.ai-factory.json'));
  const url = pathToFileURL(path.join(root, 'dist/cli/commands/upgrade.js')).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `const m=await import(${JSON.stringify(url)}); await m.upgradeCommand();`], { cwd: project, encoding: 'utf8', timeout: 60000 });
  assert.notEqual(result.status, 0);
  assert.deepEqual(await snapshot(path.join(project, '.agents')), before);
  assert.deepEqual(await fs.readFile(path.join(project, '.ai-factory.json')), configBefore);
  await fs.access(path.join(project, '.ai-factory/changes/task.md'));
});

test('ownership', 'removing either runtime preserves surviving skills and shared native config', async project => {
  const agents = [installation('codex', '.agents/skills'), installation('codex-app', '.agents/skills')];
  const [group] = await resolveSkillTargets(project, agents, { select: false });
  await installSkills({ projectDir: project, agentId: 'codex', skillsDir: group.skillsDir, skills: ['aif'], renderContext: group.context });
  for (const agent of agents) agent.managedSkills = await buildManagedSkillsState(project, agent, ['aif'], group.context);
  const before = await snapshot(path.join(project, '.agents/skills'));
  for (const [removed, survivor] of [agents, [...agents].reverse()]) {
    assert.deepEqual(await removeOwnedSkills(project, removed, [survivor]), []);
    assert.deepEqual(await snapshot(path.join(project, '.agents/skills')), before);
    assert.equal(await hasSurvivingConfigConsumer(project, '.codex/config.toml', [survivor]), true);
  }
  await fs.mkdir(path.join(project, '.agents/skills/user'));
  await fs.writeFile(path.join(project, '.agents/skills/user/SKILL.md'), 'user skill');
  await fs.writeFile(path.join(project, '.agents/skills/aif/user-notes'), 'local notes');
  assert.deepEqual(await removeOwnedSkills(project, agents[0], []), []);
  await fs.access(path.join(project, '.agents/skills/aif/user-notes'));
  await fs.unlink(path.join(project, '.agents/skills/aif/user-notes'));
  assert.deepEqual(await removeOwnedSkills(project, agents[0], []), ['aif']);
  assert.equal(await fs.readFile(path.join(project, '.agents/skills/user/SKILL.md'), 'utf8'), 'user skill');
});

for (const change of ['edit-injection', 'remove-injection', 'line-endings']) {
  test('ownership', `runtime deselection preserves raw local changes: ${change}`, async project => {
    const agent = installation('codex', '.agents/skills');
    await installSkills({ projectDir: project, agentId: agent.id, skillsDir: agent.skillsDir, skills: ['aif'] });
    const extensionDir = path.join(getExtensionsDir(project), 'aif-ext-custody');
    await fs.mkdir(extensionDir, { recursive: true });
    const manifest = { name: 'aif-ext-custody', version: '1.0.0', injections: [{ target: 'aif', position: 'append', file: 'append.md' }] };
    await fs.writeFile(path.join(extensionDir, 'extension.json'), JSON.stringify(manifest));
    await fs.writeFile(path.join(extensionDir, 'append.md'), 'original injection');
    const skill = path.join(project, '.agents/skills/aif/SKILL.md');
    const base = await fs.readFile(skill, 'utf8');
    const installed = applyInjection(base, 'original injection', 'append', manifest.name, 'aif');
    await fs.writeFile(skill, installed);
    agent.managedSkills = await buildManagedSkillsState(project, agent, ['aif'], undefined,
      [{ name: manifest.name, version: manifest.version, source: extensionDir }]);
    assert.match(agent.managedSkills.aif.rawInstalledHash, /^[a-f0-9]{64}$/);
    await saveConfig(project, { version: '2.19.0', agents: [agent], extensions: [{ name: manifest.name, version: manifest.version, source: extensionDir }] }, { hydrateAgentFileSources: false });
    const changed = change === 'edit-injection' ? installed.replace('original injection', 'local user edit')
      : change === 'remove-injection' ? base : installed.replace(/\r?\n/g, '\r\n');
    await fs.writeFile(skill, changed);
    const before = await snapshot(path.join(project, '.agents/skills'));
    runInit(project, 'claude');
    assert.deepEqual(await snapshot(path.join(project, '.agents/skills')), before);
  });
}

test('ownership', 'legacy normalized receipts do not authorize deletion and raw receipts round-trip', async project => {
  const agent = installation('codex', '.agents/skills');
  await installSkills({ projectDir: project, agentId: agent.id, skillsDir: agent.skillsDir, skills: ['aif'] });
  agent.managedSkills = await buildManagedSkillsState(project, agent, ['aif']);
  assert.match(agent.managedSkills.aif.rawInstalledHash, /^[a-f0-9]{64}$/);
  agent.managedAgentFiles = { 'native.toml': { sourceHash: 'source', installedHash: 'installed', rawInstalledHash: agent.managedSkills.aif.rawInstalledHash } };
  await saveConfig(project, { version: '2.19.0', agents: [agent] }, { hydrateAgentFileSources: false });
  const saved = await loadConfig(project);
  assert.equal(saved.agents[0].managedSkills.aif.rawInstalledHash, agent.managedSkills.aif.rawInstalledHash);
  assert.equal(saved.agents[0].managedAgentFiles['native.toml'].rawInstalledHash, undefined);
  delete agent.managedSkills.aif.rawInstalledHash;
  const before = await snapshot(path.join(project, '.agents/skills'));
  assert.deepEqual(await removeOwnedSkills(project, agent, []), []);
  assert.deepEqual(await snapshot(path.join(project, '.agents/skills')), before);
});

for (const legacy of [false, true]) {
  test('ownership', `unchanged update does not adopt local bytes for later deletion (legacy receipt: ${legacy})`, async project => {
    const agent = installation('codex', '.agents/skills');
    await installSkills({ projectDir: project, agentId: agent.id, skillsDir: agent.skillsDir, skills: ['aif'] });
    agent.managedSkills = await buildManagedSkillsState(project, agent, ['aif']);
    if (legacy) delete agent.managedSkills.aif.rawInstalledHash;
    await saveConfig(project, { version: '2.19.0', agents: [agent] }, { hydrateAgentFileSources: false });
    const skill = path.join(project, '.agents/skills/aif/SKILL.md');
    await fs.writeFile(skill, applyInjection(await fs.readFile(skill, 'utf8'), 'LOCAL USER DATA', 'append', 'aif-ext-unknown', 'aif'));
    const before = await snapshot(path.join(project, '.agents/skills'));
    runUpdate(project);
    const saved = await loadConfig(project);
    assert.equal(saved.agents[0].managedSkills.aif.rawInstalledHash, undefined);
    runInit(project, 'claude');
    assert.deepEqual(await snapshot(path.join(project, '.agents/skills')), before);
  });
}

for (const scenario of ['unchanged', 'force', 'partial-failure']) {
  test('extensions', `update writes replacements once and preserves fallback: ${scenario}`, async project => {
    const agents = [installation('codex', '.agents/skills'), installation('codex-app', '.agents/skills')];
    if (scenario === 'partial-failure') agents.push(installation('claude', '.claude/skills'));
    for (const group of await resolveSkillTargets(project, agents, { select: false })) {
      await installSkills({ projectDir: project, agentId: group.targets[0].id, skillsDir: group.skillsDir, skills: ['aif'], renderContext: group.context });
    }
    const config = { version: '2.19.0', agents, extensions: [] };
    await saveConfig(project, config, { hydrateAgentFileSources: false });
    const source = path.join(project, 'extension-source');
    await fs.mkdir(path.join(source, 'replacement'), { recursive: true });
    await fs.mkdir(path.join(source, 'demo'));
    await fs.writeFile(path.join(source, 'replacement/SKILL.md'), '---\nname: replacement\n---\nReplacement');
    await fs.writeFile(path.join(source, 'replacement/helper.txt'), 'v1');
    await fs.writeFile(path.join(source, 'demo/SKILL.md'), '---\nname: demo\n---\nCustom');
    await fs.writeFile(path.join(source, 'demo/helper.txt'), 'custom helper');
    await fs.writeFile(path.join(source, 'append.md'), 'Append once');
    await fs.writeFile(path.join(source, 'prepend.md'), 'Prepend once');
    const manifest = { name: 'aif-ext-write-once', version: '1.0.0', skills: ['replacement', 'demo'], replaces: { replacement: 'aif' }, injections: [
      { target: 'aif', position: 'append', file: 'append.md' }, { target: 'aif', position: 'prepend', file: 'prepend.md' },
    ] };
    await fs.writeFile(path.join(source, 'extension.json'), JSON.stringify(manifest));
    await commitResolvedExtension(project, { config, source, resolved: { sourceDir: source, manifest, cleanup: async () => {} } });
    await saveConfig(project, config, { hydrateAgentFileSources: false });
    await fs.unlink(path.join(project, '.agents/skills/demo/SKILL.md'));
    if (scenario === 'force') {
      await fs.writeFile(path.join(source, 'replacement/helper.txt'), 'v2');
      await fs.writeFile(path.join(source, 'extension.json'), JSON.stringify({ ...manifest, version: '2.0.0' }));
    }
    const commandUrl = pathToFileURL(path.join(root, 'dist/cli/commands/update.js')).href;
    const code = `import fs from 'node:fs/promises';
      const original = fs.writeFile; let writes = 0, customWrites = 0, failed = false;
      fs.writeFile = async function(file, ...args) {
        const target = String(file).replaceAll('\\\\', '/');
        if (target.endsWith('/.agents/skills/aif/helper.txt')) writes++;
        if (target.endsWith('/.agents/skills/demo/helper.txt')) customWrites++;
        if (${scenario === 'partial-failure'} && !failed && target.endsWith('/.claude/skills/aif/helper.txt')) { failed = true; throw new Error('injected replacement failure'); }
        return original.call(this, file, ...args);
      };
      globalThis.fetch = async () => ({ok:true,status:200,headers:{get:()=>null},json:async()=>({version:'2.19.0'})});
      const m = await import(${JSON.stringify(commandUrl)}); await m.updateCommand({force:${scenario === 'force'}});
      console.log('WRITE_PROBE=' + JSON.stringify({writes,customWrites,failed}));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: project, encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const observed = JSON.parse(result.stdout.match(/WRITE_PROBE=(\{[^\n]+\})/)[1]);
    assert.equal(observed.writes, 1, 'replacement rendered more than once');
    assert.equal(observed.customWrites, 1, 'custom skill rendered more than once');
    assert.equal(observed.failed, scenario === 'partial-failure');
    const saved = await loadConfig(project);
    assert.deepEqual(saved.extensions[0].replacedSkills ?? [], scenario === 'partial-failure' ? [] : ['aif']);
    if (scenario === 'force') {
      assert.equal(saved.extensions[0].version, '2.0.0');
      assert.equal(await fs.readFile(path.join(project, '.agents/skills/aif/helper.txt'), 'utf8'), 'v2');
    }
    for (const target of new Set(agents.map(agent => agent.skillsDir))) {
      const content = await fs.readFile(path.join(project, target, 'aif/SKILL.md'), 'utf8');
      assert.equal(content.includes('Replacement'), scenario !== 'partial-failure');
      assert.equal(content.split('Append once').length - 1, 1);
      assert.equal(content.split('Prepend once').length - 1, 1);
      await fs.access(path.join(project, target, 'demo/SKILL.md'));
    }
  });
}

test('extensions', 'shared replacements project outcomes and apply one injection', async project => {
  const agents = [installation('codex', '.agents/skills'), installation('codex-app', '.agents/skills')];
  const [group] = await resolveSkillTargets(project, agents, { select: false });
  await installSkills({ projectDir: project, agentId: 'codex', skillsDir: group.skillsDir, skills: ['aif'], renderContext: group.context });
  for (const agent of agents) agent.managedSkills = await buildManagedSkillsState(project, agent, ['aif'], group.context);
  const config = { version: '2.19.0', agents, extensions: [] };
  await saveConfig(project, config, { hydrateAgentFileSources: false });
  const source = path.join(project, 'extension-source');
  await fs.mkdir(path.join(source, 'replacement'), { recursive: true });
  await fs.mkdir(path.join(source, 'demo'));
  await fs.writeFile(path.join(source, 'replacement/SKILL.md'), '---\nname: replacement\ndescription: replacement\n---\nReplacement {{skills_dir}} /aif-plan\n');
  await fs.writeFile(path.join(source, 'demo/SKILL.md'), '---\nname: demo\ndescription: demo\n---\nCustom\n');
  await fs.writeFile(path.join(source, 'injection.md'), 'Injected once');
  await fs.writeFile(path.join(source, 'prepend.md'), 'Prepended once');
  const manifest = { name: 'aif-ext-target-fixture', version: '1.0.0', skills: ['replacement', 'demo'], replaces: { replacement: 'aif' }, injections: [{ target: 'aif', position: 'append', file: 'injection.md' }, { target: 'aif', position: 'prepend', file: 'prepend.md' }] };
  const injectionOnly = { name: 'aif-ext-injection-failure', version: '1.0.0', injections: manifest.injections, mcpServers: [{ key: 'broken', template: {} }] };
  await fs.writeFile(path.join(source, 'extension.json'), JSON.stringify(injectionOnly));
  const beforeInjectionFailure = await snapshot(path.join(project, '.agents/skills'));
  await assert.rejects(commitResolvedExtension(project, { config, source, resolved: { sourceDir: source, manifest: injectionOnly, cleanup: async () => {} } }));
  assert.deepEqual(await snapshot(path.join(project, '.agents/skills')), beforeInjectionFailure);
  await fs.writeFile(path.join(source, 'extension.json'), JSON.stringify(manifest));
  const result = await commitResolvedExtension(project, { config, source, resolved: { sourceDir: source, manifest, cleanup: async () => {} } });
  await saveConfig(project, config, { hydrateAgentFileSources: false });
  assert.deepEqual(result.record.replacedSkills, ['aif']);
  const outcomes = await installExtensionAssetsForAllAgents(project, config.agents, result.extensionDir, manifest);
  assert.equal(outcomes.replacementOutcomes[0].successCount, 2);
  assert.equal(outcomes.replacementOutcomes[0].agentCount, 2);
  assert.equal(outcomes.injectionCount, 2);
  assert.equal(await composeInstalledExtensionSkills(project, config), 2);
  const content = await fs.readFile(path.join(project, '.agents/skills/aif/SKILL.md'), 'utf8');
  assert.ok(content.includes('Replacement .agents/skills $aif-plan'));
  assert.equal(content.split('Injected once').length - 1, 1);
  assert.equal(content.split('Prepended once').length - 1, 1);
  await fs.access(path.join(project, '.agents/skills/demo/SKILL.md'));
  const skillsBeforeFailure = await snapshot(path.join(project, '.agents/skills'));
  runInit(project, 'codex-app,codex');
  assert.deepEqual(await snapshot(path.join(project, '.agents/skills')), skillsBeforeFailure);
  const invalid = { ...manifest, version: '2.0.0', mcpServers: [{ key: 'broken', template: {} }] };
  await fs.writeFile(path.join(source, 'extension.json'), JSON.stringify(invalid));
  await fs.writeFile(path.join(source, 'replacement/SKILL.md'), '---\nname: replacement\n---\nChanged version');
  await assert.rejects(commitResolvedExtension(project, { config, source, resolved: { sourceDir: source, manifest: invalid, cleanup: async () => {} } }));
  assert.deepEqual(await snapshot(path.join(project, '.agents/skills')), skillsBeforeFailure);
  const upgradeUrl = pathToFileURL(path.join(root, 'dist/cli/commands/upgrade.js')).href;
  const upgraded = spawnSync(process.execPath, ['--input-type=module', '-e', `const m=await import(${JSON.stringify(upgradeUrl)}); await m.upgradeCommand();`], { cwd: project, encoding: 'utf8', timeout: 60000 });
  assert.equal(upgraded.status, 0, upgraded.stderr + upgraded.stdout);
  assert.ok((await fs.readFile(path.join(project, '.agents/skills/aif/SKILL.md'), 'utf8')).includes('Replacement'));
  await fs.unlink(path.join(getExtensionsDir(project), manifest.name, 'extension.json'));
  await stripInjectionsForAllAgents(project, config.agents, manifest.name);
  assert.ok(!(await fs.readFile(path.join(project, '.agents/skills/aif/SKILL.md'), 'utf8')).includes('Injected once'));
  await fs.writeFile(path.join(getExtensionsDir(project), manifest.name, 'extension.json'), JSON.stringify(manifest));
  const commandUrl = pathToFileURL(path.join(root, 'dist/cli/commands/extension.js')).href;
  const removed = spawnSync(process.execPath, ['--input-type=module', '-e', `const m=await import(${JSON.stringify(commandUrl)}); await m.extensionRemoveCommand(${JSON.stringify(manifest.name)});`], { cwd: project, encoding: 'utf8', timeout: 60000 });
  assert.equal(removed.status, 0, removed.stderr + removed.stdout);
  assert.deepEqual((await loadConfig(project)).extensions, []);
  await assert.rejects(fs.access(path.join(project, '.agents/skills/demo/SKILL.md')));
  assert.ok(!(await fs.readFile(path.join(project, '.agents/skills/aif/SKILL.md'), 'utf8')).includes('Replacement'));
});

for (const scenario of ['shared', 'singleton', 'mixed', 'mixed-absent']) {
  test('extensions', `failed replacement restores prior state without reverting successful siblings: ${scenario}`, async project => {
    const mixed = scenario.startsWith('mixed');
    const agents = scenario !== 'singleton' ? [installation('codex', '.agents/skills'), installation('codex-app', '.agents/skills')]
      : [installation('claude', '.claude/skills')];
    if (mixed) agents.push(installation('claude', '.claude/skills'));
    const groups = await resolveSkillTargets(project, agents, { select: false });
    const snapshots = new Map();
    for (const group of groups) {
      const absent = scenario === 'mixed-absent';
      await installSkills({ projectDir: project, agentId: group.targets[0].id, skillsDir: group.skillsDir, skills: absent ? ['aif'] : ['aif', 'aif-fix'], renderContext: group.context });
      const directory = path.join(project, group.skillsDir, 'aif-fix');
      if (!absent) {
        await fs.writeFile(path.join(directory, 'user-note.txt'), 'private local note');
        await fs.mkdir(path.join(directory, 'empty'));
        const main = path.join(directory, 'SKILL.md');
        await fs.writeFile(main, applyInjection(await fs.readFile(main, 'utf8'), 'local injected bytes', 'append', 'aif-ext-prior', 'aif-fix'));
      }
      snapshots.set(directory, absent ? null : await snapshot(directory));
    }
    const target = path.join(project, mixed ? '.claude/skills' : groups[0].skillsDir, 'aif-fix');
    const source = path.join(project, 'extension-source');
    for (const name of ['good', 'broken']) {
      await fs.mkdir(path.join(source, name), { recursive: true });
      await fs.writeFile(path.join(source, name, 'SKILL.md'), `---\nname: ${name}\n---\nReplacement ${name}`);
    }
    await fs.writeFile(path.join(source, 'broken/helper.txt'), 'fails after SKILL write');
    const manifest = { name: 'aif-ext-partial-write', version: '1.0.0', skills: ['good', 'broken'], replaces: { good: 'aif', broken: 'aif-fix' } };
    const writeFile = fs.writeFile;
    let failed = false;
    let result;
    fs.writeFile = async function(file, ...args) {
      if (!failed && path.resolve(String(file)) === path.join(target, 'helper.txt')) {
        failed = true;
        throw new Error('injected mid-copy failure');
      }
      return writeFile.call(this, file, ...args);
    };
    try { result = await installExtensionAssetsForAllAgents(project, agents, source, manifest); }
    finally { fs.writeFile = writeFile; }
    assert.equal(failed, true);
    assert.deepEqual(result.replacedSkills, ['aif']);
    assert.equal(result.replacementOutcomes[1].status, mixed ? 'rolled-back' : 'preserved-base');
    assert.equal(result.replacementOutcomes[1].successCount, mixed ? 2 : 0);
    assert.equal(result.replacementOutcomes[1].agentCount, agents.length);
    for (const [directory, before] of snapshots) {
      if (before === null) await assert.rejects(fs.access(directory));
      else assert.deepEqual(await snapshot(directory), before, 'failed replacement left partial writes');
      assert.ok((await fs.readFile(path.join(directory, '../aif/SKILL.md'), 'utf8')).includes('Replacement good'));
    }
  });
}

for (const failure of ['once', 'always']) {
  test('extensions', `force update retries only failed custom skill targets: ${failure}`, async project => {
    const agents = [installation('codex', '.agents/skills'), installation('codex-app', '.agents/skills'), installation('claude', '.claude/skills')];
    const config = { version: '2.19.0', agents, extensions: [] };
    const source = path.join(project, 'extension-source');
    await fs.mkdir(path.join(source, 'demo'), { recursive: true });
    await fs.writeFile(path.join(source, 'demo/SKILL.md'), '---\nname: demo\n---\nCustom');
    await fs.writeFile(path.join(source, 'demo/helper.txt'), 'custom helper');
    const manifest = { name: 'aif-ext-custom-retry', version: '1.0.0', skills: ['demo'] };
    await fs.writeFile(path.join(source, 'extension.json'), JSON.stringify(manifest));
    await commitResolvedExtension(project, { config, source, resolved: { sourceDir: source, manifest, cleanup: async () => {} } });
    await saveConfig(project, config, { hydrateAgentFileSources: false });
    const commandUrl = pathToFileURL(path.join(root, 'dist/cli/commands/update.js')).href;
    const code = `import fs from 'node:fs/promises';
      const original = fs.writeFile; let sharedWrites = 0, claudeWrites = 0;
      process.on('exit', () => console.log('CUSTOM_PROBE=' + JSON.stringify({sharedWrites,claudeWrites})));
      fs.writeFile = async function(file, ...args) {
        const target = String(file).replaceAll('\\\\', '/');
        if (target.endsWith('/.agents/skills/demo/helper.txt')) sharedWrites++;
        if (target.endsWith('/.claude/skills/demo/helper.txt')) {
          claudeWrites++;
          if (${failure === 'always'} || claudeWrites === 1) throw new Error('injected custom failure');
        }
        return original.call(this, file, ...args);
      };
      globalThis.fetch = async () => ({ok:true,status:200,headers:{get:()=>null},json:async()=>({version:'2.19.0'})});
      const m = await import(${JSON.stringify(commandUrl)}); await m.updateCommand({force:true});`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: project, encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, failure === 'once' ? 0 : 1, result.stderr + result.stdout);
    const observed = JSON.parse(result.stdout.match(/CUSTOM_PROBE=(\{[^\n]+\})/)[1]);
    assert.deepEqual(observed, { sharedWrites: 1, claudeWrites: 2 });
    if (failure === 'once') assert.equal(await fs.readFile(path.join(project, '.claude/skills/demo/helper.txt'), 'utf8'), 'custom helper');
  });
}

test('migration', 'migration preserves native bytes and metadata and is repeatable', async project => {
  const config = await legacyProject(project);
  delete config.agents[0].managedSkills.aif.rawInstalledHash;
  await fs.mkdir(path.join(project, '.codex/agents'), { recursive: true });
  await fs.writeFile(path.join(project, '.codex/agents/user.toml'), 'native bytes');
  await fs.writeFile(path.join(project, '.codex/config.toml'), 'native config');
  config.agents[0].managedAgentFiles = { 'user.toml': { sourceHash: 'source', installedHash: 'receipt', custom: true } };
  await fs.writeFile(path.join(project, '.ai-factory.json'), JSON.stringify(config));
  const native = await snapshot(path.join(project, '.codex/agents'));
  const plan = await preflightSkillMigration(project, config);
  await applySkillMigration(project, plan);
  const saved = JSON.parse(await fs.readFile(path.join(project, '.ai-factory.json'), 'utf8'));
  assert.equal(saved.agents[0].skillsDir, '.agents/skills');
  const proven = await buildManagedSkillsState(project, saved.agents[0], ['aif']);
  assert.equal(saved.agents[0].managedSkills.aif.rawInstalledHash, proven.aif.rawInstalledHash);
  assert.equal(saved.agents[0].managedSkills.aif.installedHash, proven.aif.installedHash);
  assert.ok((await fs.readdir(path.join(project, '.agents/skills/aif'))).includes('SKILL.md'));
  assert.deepEqual(saved.agents[0].managedAgentFiles, config.agents[0].managedAgentFiles);
  assert.deepEqual(await snapshot(path.join(project, '.codex/agents')), native);
  assert.equal(await fs.readFile(path.join(project, '.codex/config.toml'), 'utf8'), 'native config');
  await assert.rejects(fs.access(path.join(project, '.codex/skills/aif/SKILL.md')));
  await recoverSkillMigration(project);
  assert.equal((await preflightSkillMigration(project, await loadConfig(project))).files.length, 0);
});

test('migration', 'failed replacement keeps bundled ownership during later migration', async project => {
  const config = await legacyProject(project);
  await fs.rmdir(path.join(project, '.agents'));
  const source = path.join(project, 'failed-replacement-source');
  await fs.mkdir(source);
  const manifest = { name: 'aif-ext-failed-replacement', version: '1.0.0', skills: ['missing'], replaces: { missing: 'aif' } };
  await fs.writeFile(path.join(source, 'extension.json'), JSON.stringify(manifest));
  await commitResolvedExtension(project, { config, source, resolved: { sourceDir: source, manifest, cleanup: async () => {} } });
  await saveConfig(project, config, { hydrateAgentFileSources: false });
  assert.deepEqual(config.extensions[0].replacedSkills ?? [], []);
  await fs.mkdir(path.join(project, '.agents'));
  await applySkillMigration(project, await preflightSkillMigration(project, config));
  const saved = await loadConfig(project);
  assert.equal(saved.agents[0].skillsDir, '.agents/skills');
  assert.ok(saved.agents[0].managedSkills.aif);
  await assert.rejects(fs.access(path.join(project, '.codex/skills/aif/SKILL.md')));
});

test('migration', 'installed extension composition migrates without stale bundled receipts', async project => {
  const config = await legacyProject(project);
  await fs.rmdir(path.join(project, '.agents'));
  const source = path.join(project, 'extension-source');
  await fs.mkdir(path.join(source, 'replacement'), { recursive: true });
  await fs.mkdir(path.join(source, 'demo'));
  await fs.writeFile(path.join(source, 'replacement/SKILL.md'), '---\nname: replacement\n---\nReplace {{skills_dir}} /aif-plan');
  await fs.writeFile(path.join(source, 'demo/SKILL.md'), '---\nname: demo\n---\nCustom {{skills_dir}}');
  await fs.writeFile(path.join(source, 'append.md'), 'Extension injection');
  const manifest = { name: 'aif-ext-migration', version: '1.0.0', skills: ['replacement', 'demo'], replaces: { replacement: 'aif' }, injections: [{ target: 'aif', position: 'append', file: 'append.md' }] };
  await fs.writeFile(path.join(source, 'extension.json'), JSON.stringify(manifest));
  await commitResolvedExtension(project, { config, source, resolved: { sourceDir: source, manifest, cleanup: async () => {} } });
  await saveConfig(project, config, { hydrateAgentFileSources: false });
  await fs.mkdir(path.join(project, '.agents'));
  const helper = path.join(project, '.codex/skills/aif/references/config-template.yaml');
  const helperBytes = await fs.readFile(helper);
  await fs.appendFile(helper, '\nuser edit');
  const modified = await snapshot(path.join(project, '.codex'));
  await assert.rejects(preflightSkillMigration(project, config), /differs from its known source/);
  assert.deepEqual(await snapshot(path.join(project, '.codex')), modified);
  await fs.writeFile(helper, helperBytes);
  await applySkillMigration(project, await preflightSkillMigration(project, config));
  const saved = await loadConfig(project);
  assert.equal(saved.agents[0].skillsDir, '.agents/skills');
  assert.equal(saved.agents[0].managedSkills.aif, undefined);
  await assert.rejects(fs.access(path.join(project, '.agents/skills/aif/references/config-template.yaml')));
  const content = await fs.readFile(path.join(project, '.agents/skills/aif/SKILL.md'), 'utf8');
  assert.ok(content.includes('Replace .agents/skills $aif-plan'));
  assert.equal(content.split('Extension injection').length - 1, 1);
  await fs.access(path.join(project, '.agents/skills/demo/SKILL.md'));
  assert.equal((await preflightSkillMigration(project, saved)).files.length, 0);
  runUpdate(project);
  assert.ok((await fs.readFile(path.join(project, '.agents/skills/aif/SKILL.md'), 'utf8')).includes('Replace .agents/skills'));
});

for (const phase of ['prepared', 'destination']) {
  test('migration', `failure at ${phase} restores original file/config bytes`, async project => {
    const config = await legacyProject(project);
    const before = await snapshot(path.join(project, '.codex'));
    const configBytes = await fs.readFile(path.join(project, '.ai-factory.json'));
    await assert.rejects(applySkillMigration(project, await preflightSkillMigration(project, config), {
      onPhase: async current => { if (current === phase) throw new Error('injected failure'); },
    }), /rolled back/);
    assert.deepEqual(await snapshot(path.join(project, '.codex')), before);
    assert.deepEqual(await fs.readFile(path.join(project, '.ai-factory.json')), configBytes);
    await assert.rejects(fs.access(path.join(project, '.agents/skills/aif/SKILL.md')));
  });
}

test('migration', 'concurrent config edits survive commit and rollback attempts', async project => {
  const config = await legacyProject(project);
  const changed = Buffer.from(JSON.stringify({ ...config, userField: 'concurrent edit' }));
  await assert.rejects(applySkillMigration(project, await preflightSkillMigration(project, config), {
    onPhase: async phase => { if (phase === 'destination') await fs.writeFile(path.join(project, '.ai-factory.json'), changed); },
  }), /config revision|Config revision/);
  assert.deepEqual(await fs.readFile(path.join(project, '.ai-factory.json')), changed);
  await assert.rejects(recoverSkillMigration(project), /Config revision/);
  assert.deepEqual(await fs.readFile(path.join(project, '.ai-factory.json')), changed);
  await fs.access(path.join(project, '.codex/skills/aif/SKILL.md'));
  await fs.access(path.join(project, '.ai-factory/skill-migrations/active.json'));
});

for (const phase of ['destination', 'committed', 'cleanup']) {
  test('migration', `process interruption at ${phase} recovers idempotently`, async project => {
    await legacyProject(project);
    const migrationUrl = pathToFileURL(path.join(root, 'dist/core/skills-migration.js')).href;
    const configUrl = pathToFileURL(path.join(root, 'dist/core/config.js')).href;
    const code = `const m = await import(${JSON.stringify(migrationUrl)}); const c = await import(${JSON.stringify(configUrl)}); const p = process.cwd(); await m.applySkillMigration(p, await m.preflightSkillMigration(p, await c.loadConfig(p)), {onPhase: async phase => {if (phase === ${JSON.stringify(phase)}) process.exit(86);}});`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: project, encoding: 'utf8', timeout: 60000 });
    assert.equal(child.status, 86, child.stderr);
    await recoverSkillMigration(project);
    await recoverSkillMigration(project);
    const config = await loadConfig(project);
    assert.equal(config.agents[0].skillsDir, phase === 'destination' ? '.codex/skills' : '.agents/skills');
    await fs.access(path.join(project, config.agents[0].skillsDir, 'aif/SKILL.md'));
    await assert.rejects(fs.access(path.join(project, '.ai-factory/skill-migrations/active.json')));
  });
}

test('migration', 'project lock rejects concurrent independent operations', async project => {
  await fs.mkdir(path.join(project, '.ai-factory/skill-migrations'), { recursive: true });
  await fs.writeFile(path.join(project, '.ai-factory/skill-migrations/lock.json'), JSON.stringify({pid: process.pid, token: 'another-operation'}));
  await assert.rejects(withSkillProjectLock(project, async () => assert.fail('must not execute')), /Another AI Factory operation/);
});

test('migration', 'native failure after migration keeps the committed target', async project => {
  await legacyProject(project);
  await fs.mkdir(path.join(project, 'native-target'));
  await fs.writeFile(path.join(project, 'native-target/user.toml'), 'native user file');
  try {
    await fs.symlink(path.join(project, 'native-target'), path.join(project, '.codex/agents'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error;
    console.log(`CAPABILITY native failure integration unavailable (${error.code}); journal/config boundary checks still run`);
    return;
  }
  assert.ok((await fs.lstat(path.join(project, '.codex/agents'))).isSymbolicLink());
  runUpdate(project, false, false);
  assert.equal((await loadConfig(project)).agents[0].skillsDir, '.agents/skills');
  await fs.access(path.join(project, '.agents/skills/aif/SKILL.md'));
  await assert.rejects(fs.access(path.join(project, '.codex/skills/aif/SKILL.md')));
  assert.equal(await fs.readFile(path.join(project, 'native-target/user.toml'), 'utf8'), 'native user file');
  await assert.rejects(fs.access(path.join(project, '.ai-factory/skill-migrations/active.json')));
});

test('migration', 'force does not bypass an unproven migration baseline', async project => {
  const config = await legacyProject(project);
  config.agents[0].managedSkills = {};
  await saveConfig(project, config, { hydrateAgentFileSources: false });
  const before = await snapshot(path.join(project, '.codex'));
  const configBefore = await fs.readFile(path.join(project, '.ai-factory.json'));
  runUpdate(project, true, false);
  assert.deepEqual(await snapshot(path.join(project, '.codex')), before);
  assert.deepEqual(await fs.readFile(path.join(project, '.ai-factory.json')), configBefore);
});

for (const operation of ['destination-write', 'config-save']) {
  test('migration', `filesystem ${operation} failure restores the baseline`, async project => {
    const config = await legacyProject(project);
    const plan = await preflightSkillMigration(project, config);
    const before = await snapshot(path.join(project, '.codex'));
    const configBefore = await fs.readFile(path.join(project, '.ai-factory.json'));
    const originalRename = fs.rename;
    let failed = false;
    fs.rename = async (source, destination) => {
      const target = String(destination).replaceAll('\\', '/');
      const matches = operation === 'config-save' ? target.endsWith('/.ai-factory.json') : target.includes('/.agents/skills/') && !target.endsWith('.tmp');
      if (!failed && matches) { failed = true; throw Object.assign(new Error('injected filesystem failure'), { code: 'EACCES' }); }
      return originalRename(source, destination);
    };
    try { await assert.rejects(applySkillMigration(project, plan), /rolled back/); }
    finally { fs.rename = originalRename; }
    assert.ok(failed, 'fault injection did not exercise the filesystem operation');
    assert.deepEqual(await snapshot(path.join(project, '.codex')), before);
    assert.deepEqual(await fs.readFile(path.join(project, '.ai-factory.json')), configBefore);
  });
}

test('migration', 'concurrent source edits stop cleanup and remain recoverable', async project => {
  const config = await legacyProject(project);
  const source = path.join(project, '.codex/skills/aif/SKILL.md');
  await assert.rejects(applySkillMigration(project, await preflightSkillMigration(project, config), {
    onPhase: async phase => { if (phase === 'destination') await fs.appendFile(source, '\nconcurrent source edit'); },
  }), /Concurrent|concurrent/);
  assert.ok((await fs.readFile(source, 'utf8')).endsWith('concurrent source edit'));
  assert.equal((await loadConfig(project)).agents[0].skillsDir, '.codex/skills');
  await fs.access(path.join(project, '.ai-factory/skill-migrations/active.json'));
});

test('migration', 'verified duplicate consolidates while unknown empty directories survive', async project => {
  const config = await legacyProject(project);
  await fs.cp(path.join(project, '.codex/skills/aif'), path.join(project, '.agents/skills/aif'), { recursive: true });
  await fs.mkdir(path.join(project, '.codex/skills/aif/user-empty'));
  await applySkillMigration(project, await preflightSkillMigration(project, config));
  await fs.access(path.join(project, '.codex/skills/aif/user-empty'));
  await assert.rejects(fs.access(path.join(project, '.codex/skills/aif/SKILL.md')));
  assert.ok((await fs.readFile(path.join(project, '.agents/skills/aif/SKILL.md'), 'utf8')).includes('.agents/skills/'));
});

test('migration', 'same physical alias is rendered without deleting its target', async project => {
  const config = await legacyProject(project);
  await fs.rename(path.join(project, '.codex/skills'), path.join(project, '.agents/skills'));
  try {
    await fs.symlink(path.join(project, '.agents/skills'), path.join(project, '.codex/skills'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error;
    console.log(`CAPABILITY native alias migration unavailable (${error.code}); deterministic alias policy remains covered`);
    return;
  }
  assert.ok((await fs.lstat(path.join(project, '.codex/skills'))).isSymbolicLink());
  const plan = await preflightSkillMigration(project, config);
  assert.ok(plan.files.every(file => file.after !== null));
  await applySkillMigration(project, plan);
  await fs.access(path.join(project, '.agents/skills/aif/SKILL.md'));
  assert.ok((await fs.lstat(path.join(project, '.codex/skills'))).isSymbolicLink());
});

for (const linked of ['source', 'destination']) {
  test('migration', `linked ${linked} skill entry keeps its unmanaged target untouched`, async project => {
    const config = await legacyProject(project);
    const shared = linked === 'destination';
    if (shared) {
      await fs.mkdir(path.join(project, '.agents/skills'), { recursive: true });
      await fs.cp(path.join(project, '.codex/skills/aif'), path.join(project, '.agents/skills/user-owned-copy'), { recursive: true });
    } else {
      await fs.rename(path.join(project, '.codex/skills/aif'), path.join(project, '.codex/skills/user-owned-copy'));
    }
    const entry = path.join(project, shared ? '.agents/skills/aif' : '.codex/skills/aif');
    const target = path.join(project, shared ? '.agents/skills' : '.codex/skills', 'user-owned-copy');
    try {
      await fs.symlink(process.platform === 'win32' ? target : 'user-owned-copy', entry, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (shared) await fs.rm(path.join(project, '.agents/skills'), { recursive: true });
      else await fs.rename(target, entry);
      if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error;
      console.log(`CAPABILITY linked-entry migration unavailable (${error.code}); unmanaged-target preservation remains covered`);
      return;
    }
    assert.ok((await fs.lstat(entry)).isSymbolicLink());
    const roots = async () => ({ codex: await snapshot(path.join(project, '.codex')), agents: await snapshot(path.join(project, '.agents')) });
    const before = await roots();
    await assert.rejects(preflightSkillMigration(project, config), /linked entry/);
    assert.deepEqual(await roots(), before);
    runUpdate(project, false, false);
    assert.deepEqual(await roots(), before);
    assert.ok((await fs.lstat(entry)).isSymbolicLink());
    assert.ok((await fs.readFile(path.join(target, 'SKILL.md'), 'utf8')).length > 0);
  });
}

for (const linked of ['source', 'destination']) {
  test('migration', `linked ${linked} skill entry after preflight keeps target untouched`, async project => {
    const config = await legacyProject(project);
    const plan = await preflightSkillMigration(project, config);
    const shared = linked === 'destination';
    const entry = path.join(project, shared ? '.agents/skills/aif' : '.codex/skills/aif');
    const target = path.join(project, shared ? '.agents/skills' : '.codex/skills', 'user-owned-copy');
    if (shared) {
      await fs.mkdir(path.join(project, '.agents/skills'), { recursive: true });
      await fs.cp(path.join(project, '.codex/skills/aif'), target, { recursive: true });
    } else {
      await fs.rename(path.join(project, '.codex/skills/aif'), target);
    }
    try {
      await fs.symlink(process.platform === 'win32' ? target : 'user-owned-copy', entry, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (shared) await fs.rm(path.join(project, '.agents/skills'), { recursive: true });
      else await fs.rename(target, entry);
      if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error;
      console.log(`CAPABILITY post-preflight ${linked} link unavailable (${error.code}); linked-entry preservation remains covered`);
      return;
    }
    assert.ok((await fs.lstat(entry)).isSymbolicLink());
    const roots = async () => ({ codex: await snapshot(path.join(project, '.codex')), agents: await snapshot(path.join(project, '.agents')) });
    const before = await roots();
    await assert.rejects(applySkillMigration(project, plan), /linked entry|proven root|Untracked/);
    assert.deepEqual(await roots(), before);
    assert.ok((await fs.lstat(entry)).isSymbolicLink());
    assert.ok((await fs.readFile(path.join(target, 'SKILL.md'), 'utf8')).length > 0);
  });
}

test('migration', 'recovery refuses a tampered path outside recorded skill roots', async project => {
  const config = await legacyProject(project);
  await assert.rejects(applySkillMigration(project, await preflightSkillMigration(project, config), {
    onPhase: async phase => { if (phase === 'committed') throw new Error('leave cleanup pending'); },
  }), /pending cleanup/);
  const journalPath = path.join(project, '.ai-factory/skill-migrations/active.json');
  const journal = JSON.parse(await fs.readFile(journalPath, 'utf8'));
  journal.files[0].path = '.codex/config.toml';
  await fs.writeFile(journalPath, JSON.stringify(journal));
  const before = await snapshot(path.join(project, '.codex'));
  await assert.rejects(recoverSkillMigration(project), /Recovery path/);
  assert.deepEqual(await snapshot(path.join(project, '.codex')), before);
});

test('preflight', 'preflight plans a proven move without writing bytes', async project => {
  const config = await legacyProject(project);
  await fs.mkdir(path.join(project, '.codex/skills/user-skill'));
  await fs.writeFile(path.join(project, '.codex/skills/user-skill/notes'), 'preserve');
  const before = await snapshot(project);
  const plan = await preflightSkillMigration(project, config);
  assert.equal(plan.config.agents[0].skillsDir, '.agents/skills');
  assert.ok(plan.files.some(file => file.path.startsWith('.agents/skills/aif/') && file.after));
  assert.ok(plan.files.some(file => file.path.startsWith('.codex/skills/aif/') && !file.after));
  assert.ok(!plan.files.some(file => file.path.includes('user-skill')));
  assert.deepEqual(await snapshot(project), before);
});

for (const mode of ['missing-state', 'changed-source', 'missing-manifest', 'local-edit', 'unknown-file', 'injection-edit', 'destination-conflict']) {
  test('preflight', `preflight preserves all bytes on ${mode}`, async project => {
    const config = await legacyProject(project);
    const skill = path.join(project, '.codex/skills/aif');
    if (mode === 'missing-state') config.agents[0].managedSkills = {};
    if (mode === 'changed-source') config.agents[0].managedSkills.aif.sourceHash = 'unavailable-old-revision';
    if (mode === 'missing-manifest') config.extensions = [{ name: 'aif-ext-missing', version: '1.0.0', source: './missing' }];
    if (mode === 'local-edit') await fs.appendFile(path.join(skill, 'SKILL.md'), '\nlocal change');
    if (mode === 'unknown-file') await fs.writeFile(path.join(skill, 'local-note'), 'private notes');
    if (mode === 'injection-edit') await fs.appendFile(path.join(skill, 'SKILL.md'), '\n<!-- aif-ext:demo:aif:append:start -->\nchanged\n<!-- aif-ext:demo:aif:append:end -->\n');
    if (mode === 'destination-conflict') {
      await fs.mkdir(path.join(project, '.agents/skills/aif'), { recursive: true });
      await fs.writeFile(path.join(project, '.agents/skills/aif/SKILL.md'), 'user destination');
    }
    const before = await snapshot(project);
    await assert.rejects(preflightSkillMigration(project, config), /baseline|conflict|source|manifest/i);
    assert.deepEqual(await snapshot(project), before);
  });
}

test('preflight', 'source owner collisions require explicit replacement', async () => {
  const extension = (name, skills, replaces) => ({ dir: name, manifest: { name, version: '1', skills, replaces } });
  await assert.rejects(collectSkillOwners([extension('one', ['skills/demo']), extension('two', ['other/demo'])]), /Conflicting skill owners/);
  await assert.rejects(collectSkillOwners([extension('one', ['skills/aif'])]), /Conflicting skill owners/);
  const owners = await collectSkillOwners([extension('one', ['skills/demo'], { 'skills/demo': 'aif' })]);
  assert.equal(owners.get('aif').extension, true);
});

test('targets', 'resolver uses one snapshot and preserves persisted/custom targets', async project => {
  const inputs = [installation('codex', '.codex/skills'), installation('codex-app', '.agents/skills')];
  for (const order of [inputs, [...inputs].reverse()]) {
    const resolved = await resolveSkillTargets(project, order);
    assert.deepEqual(resolved.flatMap(group => group.targets).map(target => target.skillsDir).sort(), ['.agents/skills', '.codex/skills']);
  }
  await fs.mkdir(path.join(project, '.agents'));
  const shared = await resolveSkillTargets(project, inputs);
  assert.equal(shared.length, 1);
  assert.equal(shared[0].skillsDir, '.agents/skills');
  assert.equal(shared[0].context.agent.displayName, 'Codex');
  assert.equal((await resolveSkillTargets(project, [installation('codex', '.team/skills')]))[0].skillsDir, '.team/skills');
  assert.equal((await resolveSkillTargets(project, [installation('codex', '.team\\skills')]))[0].skillsDir, '.team/skills');
  await fs.rmdir(path.join(project, '.agents'));
  assert.equal((await resolveSkillTargets(project, [installation('codex', '.agents/skills')]))[0].skillsDir, '.agents/skills');
  await fs.writeFile(path.join(project, '.agents'), 'ordinary file');
  assert.equal((await resolveSkillTargets(project, [inputs[0]]))[0].skillsDir, '.codex/skills');
});

test('targets', 'resolver rejects escaping, nested, native and incompatible targets', async project => {
  for (const unsafe of ['../escape', 'C:/external/skills', '/absolute/skills', '.codex', '.codex/agents', '.ai-factory/skill-migrations/work']) {
    await assert.rejects(resolveSkillTargets(project, [installation('codex', unsafe)]));
  }
  await assert.rejects(resolveSkillTargets(project, [installation('codex', '.agents/skills'), installation('codex-app', '.agents/skills/child')]));
  await assert.rejects(resolveSkillTargets(project, [installation('codex', '.agents/skills'), installation('universal', '.agents/skills')]), /Incompatible/);
  await assert.rejects(resolveSkillTargets(project, [{ ...installation('codex', '.team/skills'), agentsDir: '.team/skills/native' }]), /overlap/);
  await assert.rejects(resolveSkillTargets(project, [{ ...installation('codex', '.codex/custom'), configFiles: ['custom/config.toml'] }]), /overlap/);
});

test('targets', 'physical aliases share a target without a separate cleanup source', async project => {
  await fs.mkdir(path.join(project, '.agents/skills'), { recursive: true });
  await fs.mkdir(path.join(project, '.codex'));
  try {
    await fs.symlink(path.join(project, '.agents/skills'), path.join(project, '.codex/skills'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error;
    console.log(`CAPABILITY native links unavailable (${error.code}); deterministic overlap/escape cases remain mandatory`);
    return;
  }
  assert.ok((await fs.lstat(path.join(project, '.codex/skills'))).isSymbolicLink());
  const [group] = await resolveSkillTargets(project, [installation('codex', '.codex/skills')]);
  assert.equal(group.targets[0].sourcePhysicalPath, group.targets[0].physicalPath);
  await assert.rejects(resolveSkillTargets(project, [installation('codex', '.codex/skills'), installation('codex-app', '.agents/skills/missing')]));
});

for (const { group, name, run } of cases) {
  if (!groups.has(group)) continue;
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'aif-codex-target-'));
  try {
    await run(project);
    console.log(`PASS [${group}] ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL [${group}] ${name}: ${error.message}`);
  } finally {
    await fs.rm(project, { recursive: true, force: true, maxRetries: 3 });
  }
}
process.exitCode = failures ? 1 : 0;
