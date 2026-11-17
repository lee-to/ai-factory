import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSwarmContext } from '../dist/core/swarm/context.js';
import { projectRoot, sourceHead } from '../dist/core/swarm/runtime.js';

const cli = fileURLToPath(new URL('../dist/cli/index.js', import.meta.url));
const temp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aif-swarm-paths-')));
const project = path.join(temp, 'project with spaces');
await fs.mkdir(project);
const git = (...args) => execFileSync('git', args, { cwd: project, encoding: 'utf8', stdio: 'pipe' }).trim();
try {
  git('init'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'commit.gpgSign', 'false'); git('config', 'core.hooksPath', path.join(project, '.git', 'hooks'));
  await fs.writeFile(path.join(project, 'AGENTS.md'), 'Project instruction fixture');
  git('add', '.'); git('commit', '-m', 'Fixture');
  const ref = git('rev-parse', 'HEAD');
  assert.equal(await projectRoot(project), project, 'Git-style roots must use native canonical separators');
  const alias = path.join(temp, 'linked checkout');
  await fs.symlink(project, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(await projectRoot(alias), project);
  assert.deepEqual(await loadSwarmContext(alias), await loadSwarmContext(project), 'Context through a checkout alias must stay within the canonical root');
  await fs.mkdir(path.join(project, '.ai-factory'));
  const spec = { goal: 'Path fixture', acceptanceCriteria: ['Paths work'], checks: [[process.execPath, '--version']], workers: [{ provider: 'codex' }] };
  const create = file => {
    const result = spawnSync(process.execPath, [cli, 'swarm', 'start', '--spec', file], { cwd: alias, encoding: 'utf8', timeout: 15000,
      env: { ...process.env, AIF_SWARM_DATABASE_URL: '' } });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  await fs.writeFile(path.join(project, '.ai-factory', 'swarm.yaml'), JSON.stringify(spec));
  assert.equal(await sourceHead(project), ref, 'The reviewed default spec need not be committed or ignored');
  assert.equal(create('.ai-factory/swarm.yaml').baseRef, ref);
  await fs.unlink(path.join(project, '.ai-factory', 'swarm.yaml'));
  await fs.writeFile(path.join(project, '.ai-factory', 'custom[1].yaml'), JSON.stringify(spec));
  assert.equal(create('.ai-factory/custom[1].yaml').project, project, 'Custom spec exclusions must be literal pathspecs');
  await fs.writeFile(path.join(project, '.ai-factory', 'custom1.yaml'), 'unrelated');
  await assert.rejects(sourceHead(project, path.join(project, '.ai-factory', 'custom[1].yaml')), /clean checkout/);
  await fs.unlink(path.join(project, '.ai-factory', 'custom1.yaml'));
  await fs.writeFile(path.join(project, 'unrelated.txt'), 'must remain dirty');
  await assert.rejects(sourceHead(project, path.join(project, '.ai-factory', 'custom[1].yaml')), /clean checkout/);
  await fs.writeFile(path.join(temp, 'outside.md'), 'External instructions');
  await fs.unlink(path.join(project, 'AGENTS.md'));
  try {
    await fs.symlink(path.join(temp, 'outside.md'), path.join(project, 'AGENTS.md'));
    await assert.rejects(loadSwarmContext(project), /symlink leaves/);
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error;
    console.log('NOTRUN file-symlink escape check: native file links unavailable');
  }
  console.log(`PASS swarm paths (${process.platform}): canonical root, checkout alias, clean default/custom specs and escape boundaries`);
} finally { await fs.rm(temp, { recursive: true, force: true }); }
