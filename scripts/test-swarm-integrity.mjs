import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SwarmStore } from '../dist/core/swarm/store.js';
import { SwarmEngine } from '../dist/core/swarm/engine.js';
import { SwarmRuntime } from '../dist/core/swarm/runtime.js';
import { parseSpec, digest } from '../dist/core/swarm/types.js';

const temp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aif-swarm-integrity-')));
const project = path.join(temp, 'project'); await fs.mkdir(project);
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
git(project, 'init'); git(project, 'config', 'user.name', 'Fixture'); git(project, 'config', 'user.email', 'fixture@example.invalid');
git(project, 'config', 'commit.gpgSign', 'false'); git(project, 'config', 'core.hooksPath', path.join(project, '.git', 'hooks'));
await fs.writeFile(path.join(project, 'shared.txt'), 'base'); git(project, 'add', '.'); git(project, 'commit', '-m', 'Fixture');
const base = git(project, 'rev-parse', 'HEAD');
const store = await SwarmStore.open(project, process.env.AIF_SWARM_TEST_DATABASE_URL);
const engine = new SwarmEngine(store, project), runtime = new SwarmRuntime(engine, 'http://127.0.0.1:1');
const spec = parseSpec({ goal: 'Integrity fixture', acceptanceCriteria: ['Checks pass'], checks: [[process.execPath, '--version']],
  workers: [{ provider: 'codex' }], approval: 'restricted-actions' });
const originalPath = process.env.PATH;
async function submitted(checks = spec.checks) {
  const run = await engine.create({ ...spec, checks }, base);
  const lead = await engine.register(run.id, 'lead', spec.lead);
  await engine.plan(run.id, lead.id, [{ title: 'Edit shared file', description: 'Fixture', acceptanceCriteria: ['Edited'], dependsOn: [] }]);
  await engine.finishAgent(run.id, lead.id, 0);
  const agent = await engine.register(run.id, 'worker', spec.workers[0]), task = await engine.claim(run.id, agent.id);
  const cwd = path.join(temp, `worker-${run.id}`);
  git(project, 'worktree', 'add', '-b', `aif/swarm/${run.id}/${task.id}-${task.attempts}`, cwd, base);
  await fs.writeFile(path.join(cwd, 'shared.txt'), 'worker'); git(cwd, 'add', '.'); git(cwd, 'commit', '-m', 'Worker fixture');
  const ref = git(cwd, 'rev-parse', 'HEAD');
  await engine.agentOperation(run.id, agent.id, 'submit', 'submit_result', { taskId: task.id, claimToken: task.claimToken, gitRef: ref, report: 'Fixture' });
  await engine.finishAgent(run.id, agent.id, 0);
  return { id: run.id, task, ref };
}
try {
  const substitution = await submitted();
  git(project, 'update-ref', `refs/heads/aif/swarm/${substitution.id}/${substitution.task.id}-1`, base);
  await runtime.integrate(substitution.id, new AbortController().signal);
  const invalid = await engine.get(substitution.id);
  assert.equal(invalid.status, 'needs_attention'); assert.equal(invalid.tasks[0].status, 'blocked');
  assert.equal(invalid.artifacts[0].type, 'integration-integrity'); assert.equal(invalid.artifacts[0].metadata.checks, 'not_run');
  assert((await store.events(project, invalid.id)).some(event => event.type === 'integration.integrity_failed'));
  const checkFailure = await submitted([[process.execPath, '-e', 'process.exit(1)']]);
  await runtime.integrate(checkFailure.id, new AbortController().signal);
  const failedCheck = await engine.get(checkFailure.id);
  assert.equal(failedCheck.tasks[0].status, 'pending'); assert.equal(failedCheck.artifacts[0].metadata.phase, 'checks');
  assert.match(failedCheck.tasks[0].report, /Configured integration checks failed/);
  const conflict = await submitted();
  const accepted = path.join(temp, 'accepted');
  git(project, 'worktree', 'add', '-b', 'accepted-fixture', accepted, base);
  await fs.writeFile(path.join(accepted, 'shared.txt'), 'accepted'); git(accepted, 'add', '.'); git(accepted, 'commit', '-m', 'Accepted fixture');
  await store.mutate(project, conflict.id, run => { run.integrationRef = git(accepted, 'rev-parse', 'HEAD'); });
  await runtime.integrate(conflict.id, new AbortController().signal);
  const failedMerge = await engine.get(conflict.id);
  assert.equal(failedMerge.artifacts[0].metadata.phase, 'merge'); assert.equal(failedMerge.artifacts[0].metadata.checks, 'not_run');
  const marker = path.join(temp, 'check-started');
  const interrupted = await submitted([[process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)},'ready');setInterval(()=>{},1000);`]]);
  const abort = new AbortController();
  const integration = runtime.integrate(interrupted.id, abort.signal);
  const deadline = Date.now() + 15000;
  while (!await fs.access(marker).then(() => true, () => false)) {
    assert(Date.now() < deadline, 'Integration check did not start'); await new Promise(resolve => setTimeout(resolve, 30));
  }
  abort.abort(); await integration;
  const paused = await engine.get(interrupted.id);
  assert.equal(paused.tasks[0].status, 'submitted'); assert.equal(paused.tasks[0].attempts, 1); assert.equal(paused.artifacts.length, 0);
  assert((await store.events(project, paused.id)).some(event => event.type === 'integration.interrupted'));
  await store.mutate(project, paused.id, run => { run.spec.checks = spec.checks; });
  await runtime.integrate(paused.id, new AbortController().signal);
  assert.equal((await engine.get(paused.id)).tasks[0].status, 'done', 'Interrupted integration must recover without another worker attempt');
  const bin = path.join(temp, 'bin'); await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'codex'), `#!${process.execPath}\nprocess.exit(42);\n`, { mode: 0o755 });
  process.env.PATH = bin + path.delimiter + originalPath;
  const invocation = await engine.create(spec, base), agent = await engine.register(invocation.id, 'lead', spec.lead);
  const record = engine.recordAgentUsage;
  engine.recordAgentUsage = async () => { throw new Error('Usage store unavailable'); };
  try {
    await assert.rejects(runtime.invoke(invocation, agent, project, 'Fixture prompt', new AbortController().signal), /Provider failed or timed out/);
  } finally { engine.recordAgentUsage = record; }
  assert.equal(runtime.credentials.size, 0);
  console.log(`PASS swarm integrity (${process.env.AIF_SWARM_TEST_DATABASE_URL ? 'PostgreSQL' : 'SQLite'}): ref substitution, merge/check distinction, interrupted integration recovery and primary-error preservation`);
} finally {
  process.env.PATH = originalPath;
  await store.close();
  await fs.rm(path.join(os.tmpdir(), `aif-swarm-${digest(project).slice(0, 16)}`), { recursive: true, force: true });
  await fs.rm(temp, { recursive: true, force: true });
}
