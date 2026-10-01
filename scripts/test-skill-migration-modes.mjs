import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { installExtensionSkills } from '../dist/core/installer.js';
import { saveConfig } from '../dist/core/config.js';
import { applySkillMigration, preflightSkillMigration, recoverSkillMigration, captureSharedSkillRollback } from '../dist/core/skills-migration.js';

if (process.platform === 'win32') {
  console.log('SKIP [migration-modes] POSIX file permissions require a POSIX filesystem');
  process.exit(0);
}

const cases = [];
const test = (name, run) => cases.push({ name, run });
const sourcePath = '.codex/skills/demo';
const destinationPath = '.agents/skills/demo';
const configPath = '.ai-factory.json';
const activePath = '.ai-factory/skill-migrations/active.json';
const permissions = { 'SKILL.md': 0o640, 'run.sh': 0o755, 'secret.txt': 0o600 };
const mode = async file => (await fs.stat(file)).mode & 0o7777;

async function fixture(project) {
  const extension = '.ai-factory/extensions/aif-ext-modes';
  const extensionDir = path.join(project, extension);
  const skillDir = path.join(extensionDir, 'demo');
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: demo\ndescription: mode fixture\n---\n{{skills_dir}}');
  await fs.writeFile(path.join(skillDir, 'run.sh'), '#!/bin/sh\nprintf mode-preserved');
  await fs.writeFile(path.join(skillDir, 'secret.txt'), 'private fixture');
  const manifest = { name: 'aif-ext-modes', version: '1.0.0', skills: ['demo'] };
  await fs.writeFile(path.join(extensionDir, 'extension.json'), JSON.stringify(manifest));
  const agent = { id: 'codex', skillsDir: '.codex/skills', installedSkills: ['demo'],
    mcp: { github: false, filesystem: false, postgres: false, chromeDevtools: false, playwright: false } };
  await installExtensionSkills(project, agent, extensionDir, ['demo']);
  for (const [file, value] of Object.entries(permissions)) await fs.chmod(path.join(project, sourcePath, file), value);
  const config = { version: '2.19.0', agents: [agent], extensions: [{ name: manifest.name, source: extensionDir, version: manifest.version }] };
  await saveConfig(project, config, { hydrateAgentFileSources: false });
  await fs.chmod(path.join(project, configPath), 0o600);
  await fs.mkdir(path.join(project, '.agents'));
  return config;
}

async function assertModes(project, relative) {
  for (const [file, expected] of Object.entries(permissions)) {
    assert.equal(await mode(path.join(project, relative, file)), expected, `${relative}/${file} permissions`);
  }
  assert.equal(await mode(path.join(project, configPath)), 0o600, 'config permissions');
  const result = spawnSync(path.join(project, relative, 'run.sh'), { encoding: 'utf8' });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  assert.equal(result.stdout, 'mode-preserved');
}

async function interrupt(project, phase) {
  const migrationUrl = new URL('../dist/core/skills-migration.js', import.meta.url).href;
  const configUrl = new URL('../dist/core/config.js', import.meta.url).href;
  const code = `const m = await import(${JSON.stringify(migrationUrl)}); const c = await import(${JSON.stringify(configUrl)}); const p = process.cwd(); await m.applySkillMigration(p, await m.preflightSkillMigration(p, await c.loadConfig(p)), { onPhase: async phase => { if (phase === ${JSON.stringify(phase)}) process.exit(86); } });`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: project, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 86, result.error?.message ?? result.stderr);
}

test('migration preserves executable/restrictive files, config, and private recovery material', async project => {
  const config = await fixture(project);
  await applySkillMigration(project, await preflightSkillMigration(project, config));
  await assertModes(project, destinationPath);
  await assert.rejects(fs.access(path.join(project, sourcePath, 'run.sh')), { code: 'ENOENT' });
  const migrationRoot = path.join(project, '.ai-factory/skill-migrations');
  assert.equal(await mode(migrationRoot), 0o700);
  for (const entry of await fs.readdir(migrationRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(migrationRoot, entry.name);
    assert.equal(await mode(directory), 0o700);
    for (const name of await fs.readdir(directory)) assert.equal(await mode(path.join(directory, name)), 0o600, `private recovery blob ${name}`);
  }
});

for (const phase of ['prepared', 'destination']) {
  test(`rollback at ${phase} preserves source/config permissions`, async project => {
    const config = await fixture(project);
    const before = await fs.readFile(path.join(project, configPath));
    await assert.rejects(applySkillMigration(project, await preflightSkillMigration(project, config), {
      onPhase: async current => { if (phase === current) throw new Error('injected interruption'); },
    }), /rolled back/);
    await assertModes(project, sourcePath);
    assert.deepEqual(await fs.readFile(path.join(project, configPath)), before);
    await assert.rejects(fs.access(path.join(project, destinationPath, 'run.sh')), { code: 'ENOENT' });
  });
}

for (const phase of ['destination', 'committed']) {
  test(`process interruption at ${phase} recovers permissions idempotently`, async project => {
    await fixture(project);
    await interrupt(project, phase);
    await recoverSkillMigration(project);
    await recoverSkillMigration(project);
    await assertModes(project, phase === 'committed' ? destinationPath : sourcePath);
    await assert.rejects(fs.access(path.join(project, activePath)), { code: 'ENOENT' });
  });
}

test('mode conflicts between proven copies stop before writes', async project => {
  const config = await fixture(project);
  await installExtensionSkills(project, { ...config.agents[0], skillsDir: '.agents/skills' }, config.extensions[0].source, ['demo']);
  for (const [file, value] of Object.entries(permissions)) await fs.chmod(path.join(project, destinationPath, file), value);
  await fs.chmod(path.join(project, destinationPath, 'run.sh'), 0o700);
  const before = await fs.readFile(path.join(project, configPath));
  await assert.rejects(preflightSkillMigration(project, config), /mode conflict/);
  assert.equal(await mode(path.join(project, sourcePath, 'run.sh')), 0o755);
  assert.equal(await mode(path.join(project, destinationPath, 'run.sh')), 0o700);
  assert.deepEqual(await fs.readFile(path.join(project, configPath)), before);
});

async function duplicateFixture(project) {
  const config = await fixture(project);
  await installExtensionSkills(project, { ...config.agents[0], skillsDir: '.agents/skills' }, config.extensions[0].source, ['demo']);
  for (const [file, value] of Object.entries(permissions)) await fs.chmod(path.join(project, destinationPath, file), value);
  return config;
}

for (const phase of ['destination', 'cleanup']) {
  for (const change of ['mode', 'bytes']) {
    test(`unchanged duplicate destination ${change} change at ${phase} preserves the source`, async project => {
      const config = await duplicateFixture(project);
      const target = path.join(project, destinationPath, 'run.sh');
      const before = await fs.readFile(target);
      await assert.rejects(applySkillMigration(project, await preflightSkillMigration(project, config), {
        onPhase: async current => {
          if (current !== phase) return;
          if (change === 'mode') await fs.chmod(target, 0o700);
          else await fs.writeFile(target, 'concurrent destination edit');
        },
      }), /Concurrent|concurrent/);
      assert.deepEqual(await fs.readFile(path.join(project, sourcePath, 'run.sh')), before);
      assert.equal(await mode(path.join(project, sourcePath, 'run.sh')), 0o755);
      await fs.access(path.join(project, activePath));
      await assert.rejects(recoverSkillMigration(project), /Concurrent|concurrent/);
      if (change === 'mode') assert.equal(await mode(target), 0o700);
      else assert.equal(await fs.readFile(target, 'utf8'), 'concurrent destination edit');
      await fs.writeFile(target, before);
      await fs.chmod(target, 0o755);
      await recoverSkillMigration(project);
      await assertModes(project, phase === 'cleanup' ? destinationPath : sourcePath);
    });
  }
}

test('unchanged duplicate destination is verified without physical writes', async project => {
  const config = await duplicateFixture(project);
  const plan = await preflightSkillMigration(project, config);
  const originalOpen = fs.open;
  let destinationWrites = 0;
  fs.open = async (...args) => {
    if (args[1] === 'wx' && String(args[0]).startsWith(path.join(project, destinationPath) + path.sep)) destinationWrites++;
    return originalOpen(...args);
  };
  try { await applySkillMigration(project, plan); }
  finally { fs.open = originalOpen; }
  assert.equal(destinationWrites, 0);
  await assertModes(project, destinationPath);
  await assert.rejects(fs.access(path.join(project, sourcePath, 'run.sh')), { code: 'ENOENT' });
});

for (const changed of ['source', 'config']) {
  test(`concurrent ${changed} chmod after preflight is preserved`, async project => {
    const config = await fixture(project);
    const plan = await preflightSkillMigration(project, config);
    const target = path.join(project, changed === 'source' ? `${sourcePath}/run.sh` : configPath);
    await fs.chmod(target, 0o640);
    await assert.rejects(applySkillMigration(project, plan), /permissions changed/);
    assert.equal(await mode(target), 0o640);
    await assert.rejects(fs.access(path.join(project, destinationPath, 'run.sh')), { code: 'ENOENT' });
  });
}

test('concurrent source chmod before commit stops rollback until reconciled', async project => {
  const config = await fixture(project);
  const target = path.join(project, sourcePath, 'run.sh');
  await assert.rejects(applySkillMigration(project, await preflightSkillMigration(project, config), {
    onPhase: async phase => { if (phase === 'destination') await fs.chmod(target, 0o700); },
  }), /permissions change/);
  assert.equal(await mode(target), 0o700);
  await fs.access(path.join(project, activePath));
  await assert.rejects(recoverSkillMigration(project), /permissions change/);
  await fs.chmod(target, 0o755);
  await recoverSkillMigration(project);
  await assertModes(project, sourcePath);
});

test('concurrent destination chmod prevents committed cleanup', async project => {
  await fixture(project);
  await interrupt(project, 'committed');
  const target = path.join(project, destinationPath, 'run.sh');
  await fs.chmod(target, 0o700);
  await assert.rejects(recoverSkillMigration(project), /permissions change/);
  assert.equal(await mode(target), 0o700);
  await fs.access(path.join(project, sourcePath, 'run.sh'));
  await fs.access(path.join(project, activePath));
  await fs.chmod(target, 0o755);
  await recoverSkillMigration(project);
  await assertModes(project, destinationPath);
});

for (const phase of ['prepared', 'destination']) {
  test(`legacy journal ${phase} never guesses missing permissions`, async project => {
    await fixture(project);
    await interrupt(project, phase);
    const journalFile = path.join(project, activePath);
    const journal = JSON.parse(await fs.readFile(journalFile, 'utf8'));
    journal.version = 1;
    delete journal.configBeforeMode;
    delete journal.configAfterMode;
    for (const file of journal.files) { delete file.beforeMode; delete file.afterMode; }
    await fs.writeFile(journalFile, JSON.stringify(journal));
    if (phase === 'prepared') {
      await recoverSkillMigration(project);
      await assert.rejects(fs.access(journalFile), { code: 'ENOENT' });
    } else {
      await assert.rejects(recoverSkillMigration(project), /Legacy migration journal lacks file permissions/);
      await fs.access(journalFile);
      await assertModes(project, destinationPath);
    }
    await assertModes(project, sourcePath);
  });
}

test('singleton skill rollback restores bytes and mode independently', async project => {
  const config = await fixture(project);
  const restore = await captureSharedSkillRollback(project, config.agents, ['demo'], { includeSingletons: true });
  const target = path.join(project, sourcePath, 'run.sh');
  await fs.writeFile(target, 'partial replacement');
  await fs.chmod(target, 0o600);
  await fs.writeFile(path.join(project, sourcePath, 'partial.txt'), 'partial helper');
  await restore();
  await assertModes(project, sourcePath);
  await assert.rejects(fs.access(path.join(project, sourcePath, 'partial.txt')), { code: 'ENOENT' });
});

test('flat rollback preserves sibling workflows and restores references', async project => {
  const workflow = path.join(project, '.kilocode/workflows');
  await fs.mkdir(path.join(workflow, 'references'), { recursive: true });
  await fs.writeFile(path.join(workflow, 'aif.md'), 'original main');
  await fs.chmod(path.join(workflow, 'aif.md'), 0o600);
  await fs.writeFile(path.join(workflow, 'unrelated.md'), 'unrelated workflow');
  await fs.writeFile(path.join(workflow, 'references/helper.txt'), 'original helper');
  await fs.chmod(path.join(workflow, 'references/helper.txt'), 0o640);
  const agent = { id: 'kilocode', skillsDir: '.kilocode/skills', installedSkills: ['aif'],
    mcp: { github: false, filesystem: false, postgres: false, chromeDevtools: false, playwright: false } };
  const restore = await captureSharedSkillRollback(project, [agent], ['aif'], { includeSingletons: true });
  await fs.writeFile(path.join(workflow, 'aif.md'), 'partial main');
  await fs.chmod(path.join(workflow, 'aif.md'), 0o644);
  await fs.writeFile(path.join(workflow, 'references/helper.txt'), 'partial helper');
  await fs.writeFile(path.join(workflow, 'references/new.txt'), 'partial new file');
  await fs.writeFile(path.join(workflow, 'unrelated.md'), 'new unrelated workflow');
  await restore();
  assert.equal(await fs.readFile(path.join(workflow, 'aif.md'), 'utf8'), 'original main');
  assert.equal(await mode(path.join(workflow, 'aif.md')), 0o600);
  assert.equal(await fs.readFile(path.join(workflow, 'references/helper.txt'), 'utf8'), 'original helper');
  assert.equal(await mode(path.join(workflow, 'references/helper.txt')), 0o640);
  assert.equal(await fs.readFile(path.join(workflow, 'unrelated.md'), 'utf8'), 'new unrelated workflow');
  await assert.rejects(fs.access(path.join(workflow, 'references/new.txt')), { code: 'ENOENT' });
});

test('unmodified singleton and flat snapshots need no write access', async project => {
  const config = await fixture(project);
  const workflow = path.join(project, '.kilocode/workflows');
  await fs.mkdir(path.join(workflow, 'references'), { recursive: true });
  await fs.writeFile(path.join(workflow, 'aif.md'), 'unchanged main');
  await fs.writeFile(path.join(workflow, 'references/helper.txt'), 'unchanged helper');
  const agents = [...config.agents, { ...config.agents[0], id: 'kilocode', skillsDir: '.kilocode/skills' }];
  const restore = await captureSharedSkillRollback(project, agents, ['demo', 'aif'], { includeSingletons: true });
  const originalOpen = fs.open;
  let writeAttempts = 0;
  fs.open = async (...args) => {
    if (args[1] === 'wx') { writeAttempts++; throw Object.assign(new Error('read-only target'), { code: 'EACCES' }); }
    return originalOpen(...args);
  };
  try { await restore(); }
  finally { fs.open = originalOpen; }
  assert.equal(writeAttempts, 0);
  await assertModes(project, sourcePath);
});

let failures = 0;
for (const { name, run } of cases) {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'aif-migration-mode-'));
  try { await run(project); console.log(`PASS [migration-modes] ${name}`); }
  catch (error) { failures++; console.error(`FAIL [migration-modes] ${name}: ${error.stack}`); }
  finally { await fs.rm(project, { recursive: true, force: true, maxRetries: 3 }); }
}
console.log(`Migration permissions: ${cases.length - failures}/${cases.length} passed`);
process.exitCode = failures ? 1 : 0;
