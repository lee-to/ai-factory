#!/usr/bin/env node
// Real offline installation/packaging checks; not an evaluation of agent behavior.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getAvailableSkills, installSkills } from '../dist/core/installer.js';
import { getBuiltinAgentConfigs } from '../dist/core/agents.js';
import { getTransformer } from '../dist/core/transformer.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const name = 'aif-quality-setup';
const source = path.join(root, 'skills', name);
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'aif-quality-setup-'));
let passed = 0;
let failed = 0;

async function check(label, run) {
  try { await run(); passed++; console.log(`PASS ${label}`); }
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

console.log(`Quality setup: ${passed} passed, ${failed} failed (offline; no inference or project hook execution)`);
process.exitCode = failed ? 1 : 0;
