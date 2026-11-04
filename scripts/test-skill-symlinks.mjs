import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import inquirer from 'inquirer';
import { runWizard } from '../dist/cli/wizard/prompts.js';
import { loadConfig } from '../dist/core/config.js';
import { withSkillProjectLock } from '../dist/core/skills-migration.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aif-symlinks-')));
const project = async name => {
  const directory = path.join(temporary, name);
  await fs.mkdir(directory);
  return directory;
};
const readConfig = directory => fs.readJson(path.join(directory, '.ai-factory.json'));
const linked = async file => (await fs.lstat(file)).isSymbolicLink();

function cli(directory, ...args) {
  const entry = path.join(root, 'dist/cli/index.js');
  const result = spawnSync(process.execPath, ['--require', path.join(temporary, 'offline.cjs'), entry, ...args], {
    cwd: directory, encoding: 'utf8', timeout: 60000,
  });
  assert.equal(result.status, 0, `${args.join(' ')} failed:\n${result.stdout}${result.stderr}`);
  return result.stdout + result.stderr;
}

try {
  await fs.writeFile(path.join(temporary, 'offline.cjs'), 'globalThis.fetch = async () => ({ok:true,status:200,headers:{get:()=>null},json:async()=>({version:"0.0.0"})});');
  const originalPrompt = inquirer.prompt;
  try {
    inquirer.prompt = async questions => {
      const names = questions.map(question => question.name);
      assert.ok(names.indexOf('useSymlinks') > names.indexOf('selectedSkills'));
      assert.equal(questions.find(question => question.name === 'useSymlinks').default, true);
      return { selectedAgents: ['gemini'], selectedSkills: ['aif-plan'], useSymlinks: true };
    };
    assert.equal((await runWizard([], true)).useSymlinks, true);
  } finally { inquirer.prompt = originalPrompt; }

  const shared = await project('shared');
  const skills = 'aif,aif-plan,aif-best-practices';
  cli(shared, 'init', '--agents', 'cursor,claude', '--skills', skills, '--symlinks');
  const claudePlan = path.join(shared, '.claude/skills/aif-plan');
  const cursorPlan = path.join(shared, '.cursor/skills/aif-plan');
  assert.ok(await linked(claudePlan));
  assert.ok(await linked(cursorPlan));
  assert.equal(await fs.realpath(claudePlan), await fs.realpath(cursorPlan));
  assert.ok(!path.isAbsolute(await fs.readlink(claudePlan)), 'Links must remain project-relative');
  assert.ok(!await linked(path.join(shared, '.cursor/skills/aif')), 'Runtime-specific template values must remain separate');
  assert.match(await fs.readFile(path.join(shared, '.cursor/skills/aif/SKILL.md'), 'utf8'), /\.cursor/);
  assert.equal((await loadConfig(shared)).useSymlinks, true);
  const plan = await fs.readFile(path.join(claudePlan, 'SKILL.md'));
  for (const args of [['update'], ['update', '--force'], ['init', '--agents', 'claude,cursor', '--skills', skills]]) {
    const output = cli(shared, ...args);
    assert.doesNotMatch(output, /local drift|Local modifications detected|Linked installed/);
    assert.ok(await linked(claudePlan));
    assert.ok(await linked(cursorPlan));
    assert.deepEqual(await fs.readFile(path.join(cursorPlan, 'SKILL.md')), plan);
  }

  const extension = path.join(temporary, 'extension');
  await fs.ensureDir(path.join(extension, 'skills/review'));
  await fs.writeFile(path.join(extension, 'skills/review/SKILL.md'), '---\nname: review\ndescription: test replacement\n---\nRun /aif-plan.\n');
  await fs.writeFile(path.join(extension, 'injection.md'), 'Symlink injection fixture\n');
  await fs.writeJson(path.join(extension, 'extension.json'), {
    name: 'aif-ext-symlinks-test', version: '1.0.0', description: 'Symlink lifecycle fixture',
    skills: ['skills/review'], replaces: { 'skills/review': 'aif-best-practices' },
    injections: [{ target: 'aif-plan', file: 'injection.md', position: 'append' }],
  });
  cli(shared, 'extension', 'add', extension);
  assert.match(await fs.readFile(path.join(cursorPlan, 'SKILL.md'), 'utf8'), /Symlink injection fixture/);
  assert.ok(await linked(cursorPlan));
  cli(shared, 'extension', 'update', '--force');
  cli(shared, 'update', '--force');
  cli(shared, 'extension', 'remove', 'aif-ext-symlinks-test');
  assert.deepEqual(await fs.readFile(path.join(cursorPlan, 'SKILL.md')), plan);
  assert.ok(await linked(path.join(shared, '.cursor/skills/aif-best-practices')));

  const custom = path.join(shared, '.cursor/skills/local-helper');
  await fs.ensureDir(custom);
  await fs.writeFile(path.join(custom, 'SKILL.md'), 'User-owned\n');
  cli(shared, 'init', '--agents', 'cursor', '--skills', skills);
  assert.ok(await linked(cursorPlan), 'Removing a consumer must preserve surviving links');
  assert.ok(!await fs.pathExists(claudePlan));
  assert.equal(await fs.readFile(path.join(custom, 'SKILL.md'), 'utf8'), 'User-owned\n');
  cli(shared, 'init', '--agents', 'cursor', '--skills', skills, '--no-symlinks');
  assert.ok(!await linked(cursorPlan));
  assert.equal((await readConfig(shared)).useSymlinks, false);
  assert.equal((await readConfig(shared)).skillSymlinks, undefined);
  assert.deepEqual(await fs.readFile(path.join(cursorPlan, 'SKILL.md')), plan);
  assert.ok(!await fs.pathExists(path.join(shared, '.agents/skills/aif-plan')));

  const mixed = await project('mixed');
  cli(mixed, 'init', '--agents', 'claude,codex', '--skills', 'aif', '--symlinks');
  for (const args of [['update'], ['update', '--force'], ['init', '--agents', 'claude,codex', '--skills', 'aif']]) {
    cli(mixed, ...args);
    assert.match(await fs.readFile(path.join(mixed, '.codex/skills/aif/SKILL.md'), 'utf8'), /\$aif-skill-generator/);
    assert.match(await fs.readFile(path.join(mixed, '.claude/skills/aif/SKILL.md'), 'utf8'), /`\/aif-skill-generator`/);
    assert.equal((await readConfig(mixed)).agents.find(agent => agent.id === 'codex').skillsDir, '.codex/skills');
  }
  cli(mixed, 'upgrade');
  assert.equal((await readConfig(mixed)).agents.find(agent => agent.id === 'codex').skillsDir, '.codex/skills');

  for (const modified of [false, true]) {
    const directory = await project(`codex-opt-out-${modified}`);
    const args = ['--agents', 'claude,codex', '--skills', 'aif'];
    cli(directory, 'init', ...args, '--symlinks');
    const canonical = path.join(directory, '.agents/skills/aif/SKILL.md');
    if (modified) await fs.appendFile(canonical, '\nLocal canonical changes\n');
    const before = await fs.readFile(canonical);
    for (const command of [
      ['init', ...args, '--no-symlinks'], ['init', ...args],
      ['update'], ['update', '--force'], ['upgrade'],
      ['extension', 'add', extension], ['extension', 'remove', 'aif-ext-symlinks-test'],
    ]) {
      const output = cli(directory, ...command);
      const config = await readConfig(directory);
      assert.equal(config.useSymlinks, false);
      assert.equal(config.skillSymlinks, undefined);
      assert.equal(config.agents.find(agent => agent.id === 'codex').skillsDir, '.codex/skills');
      assert.ok(!await linked(path.join(directory, '.codex/skills/aif')));
      assert.ok(!await linked(path.join(directory, '.claude/skills/aif')));
      assert.doesNotMatch(output, /\[skill-migration\] Migrating skills/);
      if (modified) assert.deepEqual(await fs.readFile(canonical), before, 'Modified shared copy must be preserved');
    }
  }

  for (const ids of ['universal,claude', 'codex-app,codex', 'antigravity,claude', 'kilocode,claude']) {
    const directory = await project(ids.replaceAll(',', '-'));
    cli(directory, 'init', '--agents', ids, '--skills', skills, '--symlinks');
    const before = await fs.readFile(path.join(directory, '.agents/skills/aif/SKILL.md'));
    cli(directory, 'update', '--force');
    assert.deepEqual(await fs.readFile(path.join(directory, '.agents/skills/aif/SKILL.md')), before);
  }

  const protectedProject = await project('protected');
  await fs.ensureDir(path.join(protectedProject, '.agents/skills/aif-plan'));
  await fs.writeFile(path.join(protectedProject, '.agents/skills/aif-plan/SKILL.md'), 'Untracked canonical skill\n');
  await fs.ensureDir(path.join(protectedProject, '.cursor/skills/aif-best-practices'));
  await fs.writeFile(path.join(protectedProject, '.cursor/skills/aif-best-practices/private.txt'), 'Keep this\n');
  cli(protectedProject, 'init', '--agents', 'claude,cursor', '--skills', skills, '--symlinks');
  assert.ok(!await linked(path.join(protectedProject, '.claude/skills/aif-plan')));
  assert.ok(!await linked(path.join(protectedProject, '.cursor/skills/aif-best-practices')));
  assert.equal(await fs.readFile(path.join(protectedProject, '.agents/skills/aif-plan/SKILL.md'), 'utf8'), 'Untracked canonical skill\n');
  assert.equal(await fs.readFile(path.join(protectedProject, '.cursor/skills/aif-best-practices/private.txt'), 'utf8'), 'Keep this\n');

  const edited = await project('edited');
  cli(edited, 'init', '--agents', 'claude,cursor', '--skills', 'aif-plan', '--symlinks');
  const editedRoot = path.join(edited, '.agents/skills/aif-plan');
  await fs.writeFile(path.join(editedRoot, 'local.txt'), 'Local changes\n');
  await withSkillProjectLock(edited, async () => {});
  assert.equal(await fs.readFile(path.join(edited, '.cursor/skills/aif-plan/local.txt'), 'utf8'), 'Local changes\n');
  assert.equal(await fs.readFile(path.join(editedRoot, 'local.txt'), 'utf8'), 'Local changes\n');
  assert.ok(!await linked(path.join(edited, '.cursor/skills/aif-plan')));

  const unsafe = await project('unsafe');
  cli(unsafe, 'init', '--agents', 'claude,cursor', '--skills', 'aif-plan', '--symlinks');
  const unsafeLink = path.join(unsafe, '.cursor/skills/aif-plan');
  const other = await project('other');
  await fs.writeFile(path.join(other, 'SKILL.md'), 'Do not change\n');
  await fs.unlink(unsafeLink);
  await fs.symlink(other, unsafeLink, 'dir');
  await assert.rejects(withSkillProjectLock(unsafe, async () => assert.fail('Must reject before writing')), /outside project|symlink changed/);
  assert.ok(await linked(path.join(unsafe, '.claude/skills/aif-plan')), 'All link validation must precede materialization');
  assert.equal(await fs.readFile(path.join(other, 'SKILL.md'), 'utf8'), 'Do not change\n');

  for (const scenario of ['traversal', 'absolute', 'redirected-parent']) {
    const directory = await project(`unsafe-missing-${scenario}`);
    const outside = await project(`outside-${scenario}`);
    await fs.ensureDir(path.join(outside, 'skills'));
    await fs.writeFile(path.join(outside, 'sentinel'), 'Preserve outside files\n');
    cli(directory, 'init', '--agents', 'claude,cursor', '--skills', 'aif-plan', '--symlinks');
    const config = await readConfig(directory);
    const cursor = config.agents.find(agent => agent.id === 'cursor');
    cursor.skillsDir = scenario === 'traversal' ? `../outside-${scenario}/skills`
      : scenario === 'absolute' ? `${outside}/skills` : '.redirect/skills';
    if (scenario === 'redirected-parent') await fs.symlink(outside, path.join(directory, '.redirect'), 'dir');
    delete config.skillSymlinks.links['.cursor/skills/aif-plan'];
    const relative = path.posix.join(cursor.skillsDir, 'aif-plan');
    config.skillSymlinks.links[relative] = '.agents/skills/aif-plan';
    await fs.writeJson(path.join(directory, '.ai-factory.json'), config);
    await assert.rejects(withSkillProjectLock(directory, async () => assert.fail('Unsafe recovery must not reach the action')), /Unsafe skill target|outside project/);
    assert.ok(!await fs.pathExists(path.join(outside, 'skills/aif-plan')), 'Recovery must not create an outside skill');
    assert.ok(!await fs.pathExists(path.join(directory, relative)), 'Recovery must not create an invalid logical target');
    assert.ok(await linked(path.join(directory, '.claude/skills/aif-plan')), 'Reject every invalid path before materializing valid links');
    assert.equal(await fs.readFile(path.join(outside, 'sentinel'), 'utf8'), 'Preserve outside files\n');
  }

  const fallback = await project('fallback');
  cli(fallback, 'init', '--agents', 'claude', '--skills', 'aif-plan');
  const fallbackConfig = await readConfig(fallback);
  fallbackConfig.useSymlinks = true;
  await fs.writeJson(path.join(fallback, '.ai-factory.json'), fallbackConfig);
  const originalSymlink = fs.symlink;
  try {
    fs.symlink = async () => { throw Object.assign(new Error('No symlink privileges'), { code: 'EPERM' }); };
    await withSkillProjectLock(fallback, async () => {});
    assert.ok(!await linked(path.join(fallback, '.claude/skills/aif-plan')));
  } finally { fs.symlink = originalSymlink; }
  await withSkillProjectLock(fallback, async () => {});
  assert.ok(await linked(path.join(fallback, '.claude/skills/aif-plan')), 'Copy fallback must be retryable');

  // A missing link also represents an interruption between backup and replacement.
  await fs.unlink(path.join(fallback, '.claude/skills/aif-plan'));
  await withSkillProjectLock(fallback, async () => {});
  assert.ok(await linked(path.join(fallback, '.claude/skills/aif-plan')));
  const canonical = path.join(fallback, '.agents/skills/aif-plan');
  await fs.mkdir(path.join(canonical, 'empty'));
  if (process.platform !== 'win32') await fs.chmod(path.join(canonical, 'SKILL.md'), 0o640);
  await withSkillProjectLock(fallback, async () => {});
  assert.ok((await fs.stat(path.join(fallback, '.claude/skills/aif-plan/empty'))).isDirectory());
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(path.join(fallback, '.claude/skills/aif-plan/SKILL.md'))).mode & 0o777, 0o640);
  }

  const concurrent = await project('concurrent');
  cli(concurrent, 'init', '--agents', 'claude', '--skills', 'aif-plan');
  const concurrentConfig = await readConfig(concurrent);
  concurrentConfig.useSymlinks = true;
  await fs.writeJson(path.join(concurrent, '.ai-factory.json'), concurrentConfig);
  const native = path.join(concurrent, '.claude/skills/aif-plan');
  const originalRename = fs.rename;
  try {
    fs.rename = async (from, to) => {
      await originalRename(from, to);
      if (from === native && to.includes('.aif-backup-')) {
        await fs.appendFile(path.join(to, 'SKILL.md'), '\nConcurrent local change\n');
      }
    };
    await assert.rejects(withSkillProjectLock(concurrent, async () => {}), /Skill changed while linking/);
  } finally { fs.rename = originalRename; }
  assert.ok(!await linked(native));
  assert.match(await fs.readFile(path.join(native, 'SKILL.md'), 'utf8'), /Concurrent local change/);
  console.log('skill symlink regression tests passed');
} finally {
  await fs.remove(temporary);
}
