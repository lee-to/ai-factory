#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { discoverCommands, formatCommandCatalog } from '../dist/core/command-catalog.js';
import { loadConfig } from '../dist/core/config.js';
import { loadAllExtensions } from '../dist/core/extensions.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'aif-command-catalog-'));
const project = path.join(temp, 'project with spaces');
const cli = path.join(root, 'dist/cli/index.js');
const secret = 'fixture-credential-7df63';
const write = async (file, content) => {
  const target = path.join(project, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, typeof content === 'string' ? content : JSON.stringify(content));
};
const run = (...args) => execFileSync(process.execPath, [cli, ...args], { cwd: project, encoding: 'utf8', timeout: 15000 });
async function snapshot(dir) {
  const result = {};
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, item.name);
    if (item.isDirectory()) result[item.name] = await snapshot(target);
    else if (item.isSymbolicLink()) result[item.name] = await fs.readlink(target);
    else result[item.name] = createHash('sha256').update(await fs.readFile(target)).digest('hex');
  }
  return result;
}

try {
  await write('package.json', { packageManager: 'npm@10.0.0', scripts: {
    test: `node -e "require('fs').writeFileSync('lifecycle-marker', '${secret}')"`,
    pretest: 'touch lifecycle-marker', build: 'build-tool', dynamic: { command: 'not static' },
    'checks/unit': 'unit-test', [`bad=${secret}`]: 'ignored', [`test:TOKEN:${secret}`]: 'ignored',
  } });
  await write('composer.json', { scripts: { test: ['@php artisan test', '@check'], check: 'Project\\Checks::run', dynamic: 42 } });
  await write('Makefile', '$(shell touch make-marker)\nverify:\n\ttouch make-marker\n');
  await write('Taskfile.yml', 'version: 3\ntasks: {verify: {cmds: [touch task-marker]}}');
  await write('justfile', 'probe := `touch just-marker`\n');
  await write('tools/project.json', { commands: [
    { name: 'test', cwd: '.', argv: ['make', 'verify'], inputs: ['TEST_FILTER'], output_mode: 'human' },
    { name: 'windows-check', cwd: 'packages\\api', argv: ['C:\\Program Files\\Tool\\check.exe', '--json'], output_mode: 'json' },
    ...[
      ['tool', '--token', secret], ['tool', `PASSWORD=${secret}`],
      ['tool', `https://alice:${secret}@example.invalid`], ['node', '-econsole.log("opaque")'],
      ['sh', '-c', 'touch shell-marker'], ['tool', 'Authorization: Bearer ' + secret],
    ].map((argv, i) => ({ name: `private-${i}`, cwd: '.', argv })),
    { name: 'escaping', cwd: '../outside', argv: ['tool', 'test'] },
    { name: 'invalid-metadata', cwd: '.', argv: ['tool', 'test'], inputs: [42] },
    { name: `diagnose:password:${secret}`, cwd: '.', argv: ['tool', 'test'] },
  ] });
  await write('packages/api/package.json', { packageManager: 'pnpm@9.0.0', scripts: { test: 'api-tests' } });
  await write('packages/web/package.json', { scripts: { test: 'web-tests' } });
  await write('packages/web/yarn.lock', '# lock evidence only');

  // A valid registered extension would have a top-level import side effect.
  const extension = '.ai-factory/extensions/aif-ext-poison';
  await write('.ai-factory.json', { version: '2.20.0', agents: [], extensions: [{ name: 'aif-ext-poison', version: '1.0.0' }] });
  await write(`${extension}/extension.json`, { name: 'aif-ext-poison', version: '1.0.0', commands: [{ name: 'poison', module: 'commands/poison.mjs' }] });
  await write(`${extension}/commands/poison.mjs`, "import fs from 'node:fs'; fs.writeFileSync('import-marker', 'executed'); export function register() {}\n");
  const config = await loadConfig(project);
  const installed = await loadAllExtensions(project, config.extensions.map(extension => extension.name));
  assert.equal(installed[0].manifest.commands[0].module, 'commands/poison.mjs', 'Poison fixture must be discoverable by the ordinary extension loader');

  const before = await snapshot(project);
  const catalog = await discoverCommands(project, ['.', 'packages\\api', 'packages/web'], 'tools/project.json');
  assert.deepEqual(await discoverCommands(project, ['.\\', '.\\packages\\api', '.\\packages\\web'], '.\\tools\\project.json'), catalog);
  const get = (kind, name, cwd = '.') => catalog.commands.find(command => command.kind === kind && command.name === name && command.cwd === cwd);
  assert.deepEqual(get('package', 'test').argv, ['npm', 'run', 'test']);
  assert.deepEqual(get('composer', 'test').argv, ['composer', 'run-script', 'test']);
  assert.deepEqual(get('package', 'test', 'packages/api').argv, ['pnpm', 'run', 'test']);
  assert.deepEqual(get('package', 'test', 'packages/web').argv, ['yarn', 'run', 'test']);
  assert.equal(get('package', 'dynamic').status, 'unresolved');
  assert.equal(get('composer', 'dynamic').status, 'unresolved');
  assert.equal(get('mapping', 'test').output_mode, 'human');
  assert.deepEqual(get('mapping', 'test').inputs, ['TEST_FILTER']);
  assert.equal(get('package', 'test').inputs, null);
  assert.equal(get('package', 'test').output_mode, 'unknown');
  assert.equal(get('mapping', 'windows-check', 'packages/api').argv[0], 'C:\\Program Files\\Tool\\check.exe');
  assert.equal(catalog.ambiguities.find(group => group.name === 'test').command_ids.length, 5);
  assert(catalog.ambiguities.every(group => group.selection_required));
  assert(catalog.commands.every(command => command.verification === 'not_run' && command.effects === 'unknown'));
  for (let i = 0; i < 6; i++) assert.equal(get('mapping', `private-${i}`).argv, null);
  assert(!get('mapping', 'escaping'));
  assert.equal(get('mapping', 'invalid-metadata').status, 'unresolved');
  const unit = get('package', 'checks/unit');
  assert.equal(unit.source.pointer, '/scripts/checks~1unit');
  assert.equal(unit.id, 'package.json#/scripts/checks~1unit');
  const pkgBytes = await fs.readFile(path.join(project, 'package.json'));
  assert.equal(unit.source.sha256, createHash('sha256').update(pkgBytes).digest('hex'));
  assert(catalog.sources.some(source => source.path === 'Makefile' && source.sha256 && source.reason === 'explicit-mapping-required-not-parsed'));
  assert(!JSON.stringify(catalog).includes(secret));
  assert(!formatCommandCatalog(catalog).includes(secret));

  const args = ['commands', '.\\', '.\\packages\\api', 'packages/web', '--mapping', '.\\tools\\project.json'];
  const json = run(...args, '--json');
  assert.deepEqual(JSON.parse(json), catalog);
  assert.equal(run(...args).trimEnd(), formatCommandCatalog(catalog));
  run('commands', '--help');
  run('--help', 'commands');
  assert.deepEqual(await snapshot(project), before, 'Discovery/help executed code or wrote project files');
  assert.equal(await fs.stat(path.join(project, 'import-marker')).then(() => true, () => false), false);
  // Prove the poison fixture is executable, without invoking another CLI workflow.
  execFileSync(process.execPath, [path.join(project, extension, 'commands/poison.mjs')], { cwd: project });
  assert.equal(await fs.readFile(path.join(project, 'import-marker'), 'utf8'), 'executed');
  await fs.rm(path.join(project, 'import-marker'));
  console.log('PASS npm/Composer/mappings, provenance, ambiguity, Windows path syntax, human/JSON parity and zero discovery effects');

  const prior = await discoverCommands(project);
  await write('Makefile', 'verify:\n\tchanged-tool\n');
  assert.notEqual((await discoverCommands(project)).revision_sha256, prior.revision_sha256);

  await write('package.json', { scripts: { test: 'changed' } });
  const changed = await discoverCommands(project);
  assert.notEqual(changed.commands[0].source.sha256, unit.source.sha256);
  assert.equal(changed.commands[0].reason, 'package-manager-unknown-or-conflicting');
  await write('package-lock.json', '{}');
  const locked = await discoverCommands(project);
  await write('package-lock.json', '{"lockfileVersion":3}');
  assert.notEqual((await discoverCommands(project)).revision_sha256, locked.revision_sha256, 'Runner evidence changes must invalidate the catalog revision');
  await write('pnpm-lock.yaml', 'lockfileVersion: 9');
  assert.equal((await discoverCommands(project)).commands[0].argv, null, 'Conflicting manager evidence must stay unresolved');
  for (const text of [
    '{"scripts":{"test":"one","test":"two"}}',
    '{"scripts":{"test":"one","te\\u0073t":"two"}}',
    '{"scripts":', 'null',
  ]) {
    await write('package.json', text);
    const result = await discoverCommands(project);
    assert(result.sources.some(source => source.path === 'package.json' && source.status === 'unresolved'));
    assert(!result.commands.some(command => command.kind === 'package'));
  }
  await write('package.json', ' '.repeat(1024 * 1024 + 1));
  assert.equal((await discoverCommands(project)).sources[0].status, 'unresolved');
  await fs.rm(path.join(project, 'package.json'));
  await fs.writeFile(path.join(temp, 'outside.json'), JSON.stringify({ scripts: { test: secret } }));
  await fs.symlink(path.join(temp, 'outside.json'), path.join(project, 'package.json'));
  assert.equal((await discoverCommands(project)).sources[0].status, 'unresolved');
  await fs.symlink(path.join(temp), path.join(project, 'linked'));
  await assert.rejects(discoverCommands(project, ['linked']));
  for (const invalid of ['../outside', 'C:\\outside', '/outside', 'bad\npath']) {
    const result = spawnSync(process.execPath, [cli, 'commands', invalid, '--json'], { cwd: project, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert(!result.stdout.includes(secret) && !result.stderr.includes(invalid));
  }
  await assert.rejects(discoverCommands(project, Array.from({ length: 33 }, () => '.')));
  const empty = path.join(temp, 'empty');
  await fs.mkdir(empty);
  assert.deepEqual((await discoverCommands(empty)).commands, []);
  console.log('PASS source drift, unknown/conflicting managers, duplicate/invalid/large JSON, missing manifests and path/link boundaries');
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
