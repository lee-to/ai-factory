#!/usr/bin/env node
// Real offline installation/packaging checks; not an evaluation of agent behavior.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getAvailableSkills, installSkills } from '../dist/core/installer.js';
import { getBuiltinAgentConfigs } from '../dist/core/agents.js';
import { getTransformer } from '../dist/core/transformer.js';
import { inspectFixtureTree, prepareFixture } from '../skills/aif-quality-setup/tests/prepare-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const name = 'aif-quality-setup';
const source = path.join(root, 'skills', name);
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'aif-quality-setup-'));
let passed = 0;
let failed = 0;
let notRun = 0;

async function check(label, run) {
  try {
    const result = await run();
    if (result?.notRun) { notRun++; console.log(`NOTRUN ${label}: ${result.notRun}`); }
    else { passed++; console.log(`PASS ${label}`); }
  }
  catch (error) { failed++; console.error(`FAIL ${label}: ${error.stack ?? error.message}`); }
}

async function files(directory, prefix = '') {
  const entries = [];
  for (const item of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    assert(!item.isSymbolicLink(), `Unexpected link in test inventory: ${directory}/${item.name}`);
    const relative = prefix + item.name;
    if (item.isDirectory()) entries.push(...await files(path.join(directory, item.name), relative + '/'));
    else if (item.isFile()) entries.push(relative);
  }
  return entries;
}

async function snapshot(directory) {
  return Object.fromEntries(await Promise.all((await files(directory)).map(async relative => [relative,
    createHash('sha256').update(await fs.readFile(path.join(directory, relative))).digest('hex')])));
}

function prose(text) {
  let fence = null;
  return text.split(/\r?\n/).filter(line => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (fence === marker[1][0]) fence = null;
      return false;
    }
    return !fence;
  }).join('\n');
}

async function inspectLinks(file) {
  const content = await fs.readFile(file, 'utf8');
  assert(!/\{\{(?:config_dir|skills_dir|home_skills_dir|settings_file|agent_name)\}\}/.test(content),
    `Unresolved runtime variable: ${file}`);
  for (const [, href] of prose(content).matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    const relative = decodeURIComponent(href.split('#')[0]);
    if (!relative) continue;
    assert((await fs.stat(path.resolve(path.dirname(file), relative))).isFile(), `Missing asset: ${href} from ${file}`);
  }
}

const before = await snapshot(source);
const delivered = Object.keys(before).filter(relative => !relative.startsWith('tests/'));
try {
  await check('fixture storage contains neutral stubs and preserves the context inventory', async () => {
    const inventory = await files(path.join(source, 'tests/fixtures'));
    assert.equal(inventory.filter(file => file.endsWith('.stub')).length, 18);
    assert.equal(inventory.filter(file => !file.endsWith('.stub')).length, 11);
    assert.deepEqual(inventory.filter(file => /\.(?:json|toml|php|ts|py|rs|cjs)$/.test(file)), [],
      'IDE-recognizable manifests or sources remain in fixture storage');
  });

  await check('js-ts stubs restore runnable paths and identical bytes without executing scripts', async () => {
    const project = await prepareFixture('js-ts', sandbox);
    const expected = ['existing-check.cjs', 'existing-prepare.cjs', 'package.json', 'src/main.ts', 'tsconfig.json'];
    assert.deepEqual((await files(project)).sort(), expected);
    for (const relative of expected) assert.deepEqual(await fs.readFile(path.join(project, relative)),
      await fs.readFile(path.join(source, 'tests/fixtures/js-ts', relative + '.stub')), relative);
    const manifest = JSON.parse(await fs.readFile(path.join(project, 'package.json'), 'utf8'));
    assert.equal(manifest.scripts.lint, 'node existing-check.cjs');
    assert.equal(manifest.scripts.prepare, 'node existing-prepare.cjs');
    await assert.rejects(fs.access(path.join(project, 'check-executed.txt')), /ENOENT/);
    await assert.rejects(fs.access(path.join(project, 'prepare-executed.txt')), /ENOENT/);
  });

  for (const [fixture, manifests] of Object.entries({ php: ['composer.json'], python: ['pyproject.toml'],
    rust: ['Cargo.toml'], mixed: ['package.json', 'backend/composer.json', 'web/package.json'],
    multirepo: ['api/composer.json', 'worker/pyproject.toml', 'gateway/Cargo.toml'] })) {
    await check(`${fixture}: real fixture restores all bytes, nested roots and hidden context`, async () => {
      const original = await snapshot(path.join(source, 'tests/fixtures', fixture));
      const project = await prepareFixture(fixture, sandbox);
      const restored = await snapshot(project);
      assert.deepEqual(restored, Object.fromEntries(Object.entries(original).map(([file, hash]) =>
        [file.replace(/\.stub$/, ''), hash])));
      assert(!Object.keys(restored).some(file => file.endsWith('.stub')));
      for (const manifest of manifests) assert((await fs.stat(path.join(project, manifest))).isFile(), manifest);
      assert.deepEqual(await snapshot(path.join(source, 'tests/fixtures', fixture)), original);
      if (fixture === 'php') {
        const composer = JSON.parse(await fs.readFile(path.join(project, 'composer.json'), 'utf8'));
        assert.equal(composer.scripts.test, 'php -l src/Example.php');
        assert((await fs.stat(path.join(project, 'src/Example.php'))).isFile());
      }
      if (fixture === 'mixed') {
        const manifest = JSON.parse(await fs.readFile(path.join(project, 'package.json'), 'utf8'));
        assert.deepEqual(manifest.workspaces, ['web']);
      }
      if (fixture === 'multirepo') {
        assert.equal(Object.keys(restored).filter(file => file.includes('/.ai-factory/')).length, 8);
        assert.match(await fs.readFile(path.join(project, 'api/.ai-factory/config.yaml'), 'utf8'), /project-context\/description\.md/);
        assert.match(await fs.readFile(path.join(project, 'worker/.ai-factory/config.yaml'), 'utf8'), /enabled: false/);
        await assert.rejects(fs.access(path.join(project, 'gateway/.ai-factory')), /ENOENT/);
      }
      assert(!Object.keys(restored).some(file => file === '.git' || file.startsWith('.git/')));
    });
  }

  await check('import is inert and CLI returns only the owned project path, including spaces', async () => {
    const parent = path.join(sandbox, 'CLI temporary parent with spaces');
    await fs.mkdir(parent);
    const helper = path.join(source, 'tests/prepare-fixture.mjs');
    const env = { ...process.env, TMP: parent, TEMP: parent, TMPDIR: parent, LOG_LEVEL: 'info', DEBUG: '0' };
    const options = { cwd: root, env, encoding: 'utf8', timeout: 10_000 };
    const imported = spawnSync(process.execPath, ['--input-type=module', '--eval', 'await import(process.argv[1]);',
      pathToFileURL(helper).href], options);
    if (imported.error) throw imported.error;
    assert.equal(imported.status, 0, imported.stderr);
    assert.equal(imported.stdout, '');
    assert.equal(imported.stderr, '');
    assert.deepEqual(await fs.readdir(parent), [], 'Import created a project');

    const result = spawnSync(process.execPath, [helper, 'js-ts'], options);
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^[^\r\n]+\r?\n$/);
    assert.match(result.stderr, /INFO prepare\.complete/);
    assert(!result.stderr.includes('DEBUG'));
    const project = result.stdout.trim();
    assert.equal(path.dirname(await fs.realpath(project)), await fs.realpath(parent));
    assert(path.basename(project).startsWith('aif-quality-fixture-'));
    assert.deepEqual((await files(project)).sort(),
      ['existing-check.cjs', 'existing-prepare.cjs', 'package.json', 'src/main.ts', 'tsconfig.json']);
    assert.deepEqual(await fs.readFile(path.join(project, 'src/main.ts')),
      await fs.readFile(path.join(source, 'tests/fixtures/js-ts/src/main.ts.stub')));

    const beforeInvalid = await snapshot(parent);
    const invalid = spawnSync(process.execPath, [helper, '../php'], options);
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, '');
    assert.match(invalid.stderr, /ERROR prepare\.failed.*Unknown fixture/);
    assert.deepEqual(await snapshot(parent), beforeInvalid);
  });

  await check('invalid selectors and sandbox parents preserve existing data and the checkout', async () => {
    const parent = path.join(sandbox, 'validation parent');
    await fs.mkdir(parent);
    await fs.writeFile(path.join(parent, 'keep.txt'), 'user-owned bytes\n');
    const original = await snapshot(parent);
    for (const selector of ['not-a-fixture', '../php']) {
      await assert.rejects(() => prepareFixture(selector, parent), /Unknown fixture/);
    }
    await assert.rejects(() => prepareFixture('js-ts', path.join(parent, 'missing')), /ENOENT/);
    await assert.rejects(() => prepareFixture('js-ts', path.join(parent, 'keep.txt')), /not a directory/);
    const checkoutEntries = (await fs.readdir(root)).sort();
    await assert.rejects(() => prepareFixture('js-ts', root), /outside the source checkout/);
    await assert.rejects(() => prepareFixture('js-ts', path.join(source, 'tests/fixtures')), /outside the source checkout/);
    assert.deepEqual((await fs.readdir(root)).sort(), checkoutEntries);
    assert.deepEqual(await snapshot(parent), original);
  });

  await check('ambiguous restored names fail read-only preflight instead of overwriting', async () => {
    for (const [label, names] of Object.entries({ duplicate: ['value', 'value.stub'],
      caseOnly: ['Main.ts.stub', 'main.ts'], emptyName: ['.stub'] })) {
      const directory = path.join(sandbox, label);
      await fs.mkdir(directory);
      for (const name of names) await fs.writeFile(path.join(directory, name), `keep ${name}\n`);
      const before = await snapshot(directory);
      await assert.rejects(() => inspectFixtureTree(directory), /collision|Invalid restored fixture name/);
      assert.deepEqual(await snapshot(directory), before);
    }
    const directory = path.join(sandbox, 'file directory collision');
    await fs.mkdir(path.join(directory, 'src'), { recursive: true });
    await fs.writeFile(path.join(directory, 'src.stub'), 'not a directory\n');
    await assert.rejects(() => inspectFixtureTree(directory), /collision/);
  });

  await check('links are rejected and a linked parent cannot bypass checkout protection', async () => {
    const directory = path.join(sandbox, 'linked fixture');
    await fs.mkdir(directory);
    const link = path.join(directory, 'source');
    try { await fs.symlink(root, link, process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return { notRun: `Link creation unavailable: ${error.code}` };
      throw error;
    }
    await assert.rejects(() => inspectFixtureTree(directory), /Unsupported fixture link/);
    await assert.rejects(() => inspectFixtureTree(link), /Expected a fixture directory/);
    await assert.rejects(() => prepareFixture('js-ts', link), /outside the source checkout/);
    assert((await fs.lstat(link)).isSymbolicLink());
  });

  await check('partial copy failure removes only its newly owned directory and preserves neighbors', async () => {
    const parent = path.join(sandbox, 'failed copy parent');
    await fs.mkdir(parent);
    await fs.writeFile(path.join(parent, 'keep.txt'), 'must survive\n');
    const original = await snapshot(parent);
    const copyFile = fs.copyFile;
    let copied = 0;
    fs.copyFile = async (...args) => {
      if (++copied === 2) throw new Error('Injected fixture copy failure');
      return copyFile(...args);
    };
    try { await assert.rejects(() => prepareFixture('js-ts', parent), /Injected fixture copy failure/); }
    finally { fs.copyFile = copyFile; }
    assert.equal(copied, 2);
    assert.deepEqual(await fs.readdir(parent), ['keep.txt']);
    assert.deepEqual(await snapshot(parent), original);
  });

  await check('[FIX:quality-fixtures] required contexts are versionable and unrelated context stays ignored', async () => {
    const fixtureRoot = `skills/${name}/tests/fixtures/multirepo/`;
    const required = [
      'api/.ai-factory/config.yaml',
      'api/.ai-factory/skill-context/global-skill-context.md',
      'api/.ai-factory/skill-context/aif-quality-setup/SKILL.md',
      'worker/.ai-factory/config.yaml',
      'worker/.ai-factory/DESCRIPTION.md',
      'worker/.ai-factory/RULES.md',
      'worker/.ai-factory/skill-context/global-skill-context.md',
      'worker/.ai-factory/skill-context/aif-quality-setup/SKILL.md',
    ].map(relative => fixtureRoot + relative);
    const unrelated = [
      '.ai-factory/config.yaml',
      'another-project/.ai-factory/config.yaml',
      fixtureRoot + 'gateway/.ai-factory/config.yaml',
      fixtureRoot + 'api/.ai-factory/local-note.md',
      fixtureRoot + 'worker/.ai-factory/skill-context/unselected/SKILL.md',
    ];
    const project = path.join(sandbox, 'fixture ignore policy');
    const emptyConfig = path.join(sandbox, 'empty-git-config');
    await fs.mkdir(project);
    await fs.writeFile(emptyConfig, '');
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG.*|TEMPLATE_DIR)$/i.test(key)) delete env[key];
    }
    env.GIT_CONFIG_NOSYSTEM = '1';
    env.GIT_CONFIG_GLOBAL = emptyConfig;
    execFileSync('git', ['init', '--quiet', '--template=', project], { env, stdio: 'pipe' });
    for (const relative of required) {
      const bytes = await fs.readFile(path.join(root, relative));
      const target = path.join(project, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, bytes);
    }
    const policy = path.join(project, '.gitignore');
    await fs.writeFile(policy, await fs.readFile(path.join(root, '.gitignore')));
    function ignored(paths) {
      const result = spawnSync('git', ['-c', `core.excludesFile=${emptyConfig}`, 'check-ignore', '--no-index', '-z', '--stdin'], {
        cwd: project, env, input: paths.join('\0') + '\0', encoding: 'utf8', timeout: 10_000,
      });
      if (result.error) throw result.error;
      assert([0, 1].includes(result.status), `Git ignore query failed: ${result.stderr}`);
      return result.stdout.split('\0').filter(Boolean).sort();
    }
    assert.deepEqual(ignored(required), [], 'Required A06 context inputs would be omitted from Git');
    assert.deepEqual(ignored(unrelated), [...unrelated].sort(), 'Fixture exception exposed unrelated context');
    // Negative control: the old broad rule must reproduce the lost-input bug.
    await fs.writeFile(policy, '.ai-factory/\n');
    assert.deepEqual(ignored(required), [...required].sort(), 'Old ignore policy did not reproduce the regression');
    console.log(`[FIX:quality-fixtures] ${required.length} reviewed inputs included; ${unrelated.length} unrelated contexts ignored; old policy rejected`);
  });

  await check('built-in discovery and source asset links', async () => {
    assert((await getAvailableSkills()).includes(name));
    for (const relative of delivered.filter(file => file.endsWith('.md'))) await inspectLinks(path.join(source, relative));
  });

  for (const agent of getBuiltinAgentConfigs()) {
    await check(`${agent.id}: install, render, repair and reinstall with user files preserved`, async () => {
      const projectDir = path.join(sandbox, 'project with spaces', agent.id);
      const options = { projectDir, skillsDir: agent.skillsDir, agentId: agent.id };
      // Install an existing workflow alongside the utility; its references must survive.
      await installSkills({ ...options, skills: ['aif-commit'] });
      const sourceBody = await fs.readFile(path.join(source, 'SKILL.md'), 'utf8');
      const transformer = getTransformer(agent.id);
      const transformed = transformer.transform(name, sourceBody);
      assert(!transformed.flat, 'Quality setup follows existing utility classification');
      const targetDir = path.join(projectDir, agent.skillsDir, transformed.targetDir);
      const siblingBefore = await snapshot(projectDir);
      assert.deepEqual(await installSkills({ ...options, skills: [name] }), [name]);

      for (const relative of delivered) assert((await fs.stat(path.join(targetDir, relative))).isFile(),
        `${agent.id}: missing delivered file ${relative}`);
      await assert.rejects(fs.access(path.join(targetDir, 'tests')), /ENOENT/);
      for (const relative of delivered.filter(file => file.endsWith('.md'))) await inspectLinks(path.join(targetDir, relative));

      const entry = await fs.readFile(path.join(targetDir, 'SKILL.md'), 'utf8');
      const invocation = ['codex', 'codex-app'].includes(agent.id) ? '$aif-quality-setup'
        : agent.id === 'qwen' ? '/skills aif-quality-setup' : '/aif-quality-setup';
      assert(entry.split(/\r?\n/).some(line => line.startsWith(invocation + ' ')), `Missing ${agent.id} invocation`);
      assert(/^disable-model-invocation:\s*true\s*$/m.test(entry));
      assert(entry.includes('skill-context/aif-quality-setup/SKILL.md'), 'Context file path must remain literal');

      const reference = path.join(targetDir, 'references/quality-setup/setup.md');
      const rendered = await fs.readFile(reference, 'utf8');
      const ownerInvocation = ['codex', 'codex-app'].includes(agent.id) ? '$aif-ci'
        : agent.id === 'qwen' ? '/skills aif-ci' : '/aif-ci';
      assert(rendered.includes(ownerInvocation), 'Supporting reference invocation must be rendered');
      const installedBefore = await snapshot(targetDir);

      // A genuinely missing installed dependency must break link inspection.
      await fs.unlink(reference);
      await assert.rejects(() => inspectLinks(path.join(targetDir, 'SKILL.md')), /ENOENT/);
      const userFile = path.join(targetDir, 'user-note.txt');
      await fs.writeFile(userFile, 'user-owned note\n');
      await installSkills({ ...options, skills: [name] });
      assert.equal(await fs.readFile(userFile, 'utf8'), 'user-owned note\n');
      const installedAfter = await snapshot(targetDir);
      for (const [relative, hash] of Object.entries(installedBefore)) assert.equal(installedAfter[relative], hash,
        `${agent.id}: repaired/reinstalled managed content changed: ${relative}`);
      for (const relative of delivered.filter(file => file.endsWith('.md'))) await inspectLinks(path.join(targetDir, relative));
      const projectAfter = await snapshot(projectDir);
      for (const [relative, hash] of Object.entries(siblingBefore)) assert.equal(projectAfter[relative], hash,
        `${agent.id}: unrelated installed workflow changed: ${relative}`);
    });
  }

  await check('npm package includes supporting assets and excludes authoring tests', async () => {
    const npm = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    await fs.access(npm);
    const result = execFileSync(process.execPath, [npm, 'pack', '--dry-run', '--ignore-scripts', '--json', '--offline'], {
      cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, npm_config_cache: path.join(sandbox, 'npm-cache'), npm_config_update_notifier: 'false' },
    });
    const inventory = JSON.parse(result)[0].files.map(file => file.path.replaceAll('\\', '/'));
    for (const relative of delivered) assert(inventory.includes(`skills/${name}/${relative}`), `Not packaged: ${relative}`);
    assert(!inventory.some(file => file.startsWith(`skills/${name}/tests/`)), 'Authoring fixtures leaked into package');
  });

  await check('source files remain byte-identical', async () => assert.deepEqual(await snapshot(source), before));
} finally {
  const target = path.resolve(sandbox);
  assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
  assert(path.basename(target).startsWith('aif-quality-setup-'));
  await fs.rm(target, { recursive: true, force: true });
}

console.log(`Quality setup: ${passed} passed, ${failed} failed, ${notRun} not_run (offline; no inference or project hook execution)`);
process.exitCode = failed ? 1 : 0;
