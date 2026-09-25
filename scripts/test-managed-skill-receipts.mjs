import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installSkills, buildManagedSkillsState, removeOwnedSkills } from '../dist/core/installer.js';
import { saveConfig, loadConfig } from '../dist/core/config.js';
import { getExtensionsDir } from '../dist/core/extensions.js';
import { applyInjection } from '../dist/core/injections.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cases = [];
const test = (name, run) => cases.push({ name, run });

async function installedProject(project, id = 'codex', skillsDir = '.agents/skills') {
  const agent = { id, skillsDir, installedSkills: ['aif'],
    mcp: { github: false, filesystem: false, postgres: false, chromeDevtools: false, playwright: false } };
  await installSkills({ projectDir: project, agentId: id, skillsDir, skills: agent.installedSkills });
  agent.managedSkills = await buildManagedSkillsState(project, agent, agent.installedSkills);
  await saveConfig(project, { version: '2.19.0', agents: [agent] }, { hydrateAgentFileSources: false });
  return agent;
}

function runCommand(project, command, agents = 'codex', skills = 'aif') {
  const moduleUrl = pathToFileURL(path.join(root, `dist/cli/commands/${command}.js`)).href;
  const options = command === 'init' ? { agents, skills } : {};
  const code = `globalThis.fetch = async () => ({ok:true,status:200,headers:{get:()=>null},json:async()=>({version:'2.19.0'})});
    const module = await import(${JSON.stringify(moduleUrl)}); await module[${JSON.stringify(`${command}Command`)}](${JSON.stringify(options)});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: project, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, `${command} failed: ${result.error?.message ?? result.stderr}\n${result.stdout}`);
  return result.stdout + result.stderr;
}

async function registeredInjection(project, agent) {
  const name = 'aif-ext-receipt';
  const directory = path.join(getExtensionsDir(project), name);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'extension.json'), JSON.stringify({ name, version: '1.0.0',
    injections: [{ target: 'aif', position: 'append', file: 'append.md' }] }));
  await fs.writeFile(path.join(directory, 'append.md'), 'Known extension content');
  const skill = path.join(project, agent.skillsDir, 'aif/SKILL.md');
  await fs.writeFile(skill, applyInjection(await fs.readFile(skill, 'utf8'), 'Known extension content', 'append', name, 'aif'));
  return [{ name, version: '1.0.0', source: directory }];
}

for (const command of ['update', 'init', 'upgrade']) {
  test(`${command} never adopts an unknown note before runtime deselection`, async project => {
    const agent = await installedProject(project);
    const note = path.join(project, agent.skillsDir, 'aif/user-notes.txt');
    await fs.writeFile(note, 'Local user data that installation does not own');
    runCommand(project, command);
    const saved = await loadConfig(project);
    assert.equal(saved.agents[0].managedSkills.aif.rawInstalledHash, undefined, 'unknown bytes became owned');
    runCommand(project, 'init', 'claude');
    assert.equal(await fs.readFile(note, 'utf8'), 'Local user data that installation does not own');
  });
}

test('a clean registered injection receives a removable raw receipt', async project => {
  const agent = await installedProject(project);
  const extensions = await registeredInjection(project, agent);
  agent.managedSkills = await buildManagedSkillsState(project, agent, ['aif'], undefined, extensions);
  assert.match(agent.managedSkills.aif.rawInstalledHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(await removeOwnedSkills(project, agent, []), ['aif']);
});

for (const scenario of ['unknown-marker', 'missing-manifest', 'missing-injection-source', 'changed-injection-source', 'wrong-extension-version']) {
  test(`unproven injection composition stays unowned: ${scenario}`, async project => {
    const agent = await installedProject(project);
    const extensions = await registeredInjection(project, agent);
    const directory = extensions[0].source;
    if (scenario === 'missing-manifest') await fs.unlink(path.join(directory, 'extension.json'));
    if (scenario === 'missing-injection-source') await fs.unlink(path.join(directory, 'append.md'));
    if (scenario === 'changed-injection-source') await fs.writeFile(path.join(directory, 'append.md'), 'Different source revision');
    if (scenario === 'wrong-extension-version') extensions[0].version = '0.9.0';
    const skill = path.join(project, agent.skillsDir, 'aif/SKILL.md');
    const before = await fs.readFile(skill);
    agent.managedSkills = await buildManagedSkillsState(project, agent, ['aif'], undefined, scenario === 'unknown-marker' ? [] : extensions);
    assert.equal(agent.managedSkills.aif.rawInstalledHash, undefined, 'unproven composition became owned');
    assert.deepEqual(await removeOwnedSkills(project, agent, []), []);
    assert.deepEqual(await fs.readFile(skill), before);
  });
}

test('linked unknown entries prevent a raw ownership receipt', async project => {
  const agent = await installedProject(project);
  const privateDirectory = path.join(project, 'private');
  await fs.mkdir(privateDirectory);
  await fs.writeFile(path.join(privateDirectory, 'note'), 'Private content');
  const link = path.join(project, agent.skillsDir, 'aif/private-link');
  try {
    await fs.symlink(privateDirectory, link, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error;
    console.log(`CAPABILITY native links unavailable (${error.code}); file and injection custody cases remain mandatory`);
    return;
  }
  agent.managedSkills = await buildManagedSkillsState(project, agent, ['aif']);
  assert.equal(agent.managedSkills.aif.rawInstalledHash, undefined);
  assert.deepEqual(await removeOwnedSkills(project, agent, []), []);
  assert.ok((await fs.lstat(link)).isSymbolicLink());
});

test('flat workflow receipts cover their actual installed files', async project => {
  const agent = await installedProject(project, 'antigravity', '.agent/skills');
  assert.match(agent.managedSkills.aif.rawInstalledHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(await removeOwnedSkills(project, agent, []), ['aif']);
});

for (const [id, skill, installedFile] of [
  ['claude', 'aif-loop', '.claude/skills/aif-loop/SKILL.md'],
  ['codex', 'aif-loop', '.agents/skills/aif-loop/SKILL.md'],
  ['antigravity', 'aif-plan', '.agent/workflows/aif-plan.md'],
  ['kilocode', 'aif-plan', '.kilocode/workflows/aif-plan.md'],
]) {
  for (const scenario of ['clean', 'modified', 'missing-raw-receipt', 'missing-managed-state']) {
    test(`init skill deselection respects ownership: ${id}/${scenario}`, async project => {
      if (id === 'codex') await fs.mkdir(path.join(project, '.agents'));
      runCommand(project, 'init', id, `aif,${skill}`);
      const target = path.join(project, installedFile);
      const configPath = path.join(project, '.ai-factory.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      assert.match(config.agents[0].managedSkills[skill].rawInstalledHash, /^[a-f0-9]{64}$/);
      if (scenario === 'modified') await fs.appendFile(target, '\nUser-authored instructions\n');
      if (scenario === 'missing-raw-receipt') delete config.agents[0].managedSkills[skill].rawInstalledHash;
      if (scenario === 'missing-managed-state') delete config.agents[0].managedSkills;
      await fs.writeFile(configPath, JSON.stringify(config));
      const before = await fs.readFile(target);

      const output = runCommand(project, 'init', id, 'aif');
      if (scenario === 'clean') {
        await assert.rejects(fs.access(target), { code: 'ENOENT' });
        assert.match(output, /Removed deselected skill/);
      } else {
        assert.deepEqual(await fs.readFile(target), before, 'unproven or modified skill must remain intact');
        assert.match(output, /Preserving unproven or modified skill/);
      }
      const saved = await loadConfig(project);
      assert.deepEqual(saved.agents[0].installedSkills, ['aif']);
      assert.equal(saved.agents[0].managedSkills[skill], undefined, 'preserved files must not remain managed');
    });
  }
  if (id === 'claude' || id === 'codex') {
    for (const timing of ['before-install', 'after-install']) {
      test(`init preserves additional user files in a tracked skill: ${id}/${timing}`, async project => {
        if (id === 'codex') await fs.mkdir(path.join(project, '.agents'));
        const target = path.join(project, installedFile);
        const notes = path.join(path.dirname(target), 'personal-notes.md');
        if (timing === 'before-install') {
          await fs.mkdir(path.dirname(notes), { recursive: true });
          await fs.writeFile(notes, 'User-owned notes\n');
        }
        runCommand(project, 'init', id, `aif,${skill}`);
        if (timing === 'before-install') {
          assert.equal((await loadConfig(project)).agents[0].managedSkills[skill].rawInstalledHash, undefined);
        } else {
          await fs.writeFile(notes, 'User-owned notes\n');
        }
        const before = await fs.readFile(target);
        const output = runCommand(project, 'init', id, 'aif');
        assert.equal(await fs.readFile(notes, 'utf8'), 'User-owned notes\n');
        assert.deepEqual(await fs.readFile(target), before);
        assert.match(output, /Preserving unproven or modified skill/);
      });
    }
  }
}

let failures = 0;
const temporaryRoot = path.resolve(os.tmpdir());
for (const { name, run } of cases) {
  const project = await fs.mkdtemp(path.join(temporaryRoot, 'aif-skill-receipts-'));
  try {
    await run(project);
    console.log(`PASS [receipts] ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL [receipts] ${name}: ${error.message}`);
  } finally {
    const resolved = path.resolve(project);
    if (path.dirname(resolved) !== temporaryRoot || !path.basename(resolved).startsWith('aif-skill-receipts-')) throw new Error('Unsafe test cleanup');
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 3 });
  }
}
process.exitCode = failures ? 1 : 0;
