#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SwarmStore } from '../dist/core/swarm/store.js';
import { SwarmEngine, readyTasks, publicRun } from '../dist/core/swarm/engine.js';
import { parseSpec, redact, digest } from '../dist/core/swarm/types.js';
import { execute, parseProviderOutput, buildProviderCommand } from '../dist/core/swarm/process.js';
import { serveSwarm } from '../dist/core/swarm/api.js';

const cli = fileURLToPath(new URL('../dist/cli/index.js', import.meta.url));
const temp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aif-swarm-test-')));
const databaseUrl = process.env.AIF_SWARM_TEST_DATABASE_URL;
const spec = parseSpec({ goal: 'Implement fixtures', acceptanceCriteria: ['All tasks verified'], checks: [[process.execPath, 'check.cjs']],
  workers: [{ provider: 'codex' }], approval: 'restricted-actions', limits: { maxAgents: 5, maxTasks: 20, tokensPerAttempt: 1000, budgetTokens: 100000 } });
const task = title => ({ title, description: `Implement ${title}`, acceptanceCriteria: [`${title} works`], dependsOn: [] });
const stores = [];
const projects = new Set();
async function open(root) { const store = await SwarmStore.open(root, databaseUrl); stores.push(store); projects.add(root); return new SwarmEngine(store, root); }
async function planned(engine, tasks, settings = spec) {
  const run = await engine.create(settings, 'a'.repeat(40));
  const lead = await engine.register(run.id, 'lead', settings.lead);
  await engine.plan(run.id, lead.id, tasks); await engine.finishAgent(run.id, lead.id, 5);
  return await engine.get(run.id);
}
const runCli = (root, args, options = {}) => execFileSync(process.execPath, [cli, 'swarm', ...args], { cwd: root, encoding: 'utf8', timeout: 15000,
  env: { ...process.env, AIF_SWARM_DATABASE_URL: databaseUrl ?? '' }, ...options });
async function waitUntil(predicate, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { const value = await predicate(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 40)); }
  throw new Error('Timed out waiting for fixture outcome');
}
try {
  const root = path.join(temp, 'queue'); await fs.mkdir(root);
  const engine = await open(root);
  const run = await planned(engine, Array.from({ length: 5 }, (_, i) => task(`Task ${i}`)));
  const agents = await Promise.all(Array.from({ length: 5 }, () => engine.register(run.id, 'worker', spec.workers[0])));
  const claimed = await Promise.all(agents.map(agent => engine.claim(run.id, agent.id)));
  assert.equal(new Set(claimed.map(t => t.id)).size, 5, 'Five workers must have distinct claims');
  assert.equal(readyTasks(await engine.get(run.id)).length, 0);
  await assert.rejects(engine.claim(run.id, agents[0].id));
  const [parent] = claimed, [worker] = agents;
  const childInput = { ...task('Child'), parentId: parent.id, claimToken: parent.claimToken };
  const child = await engine.agentOperation(run.id, worker.id, 'child-1', 'create_subtask', childInput);
  assert.equal((await engine.agentOperation(run.id, worker.id, 'child-1', 'create_subtask', childInput)).id, child.id);
  await assert.rejects(engine.agentOperation(run.id, worker.id, 'child-1', 'create_subtask', { ...childInput, title: 'Changed' }));
  await assert.rejects(engine.agentOperation(run.id, agents[1].id, 'foreign', 'submit_result', { taskId: parent.id, claimToken: parent.claimToken, gitRef: 'b'.repeat(40), report: 'foreign' }));
  await assert.rejects(engine.agentOperation(run.id, worker.id, 'cycle', 'create_subtask', { ...childInput, dependsOn: [parent.id] }));
  assert.equal((await engine.get(run.id)).tasks.length, 6, 'Failed graph mutation must roll back');
  await engine.agentOperation(run.id, worker.id, 'result', 'submit_result', { taskId: parent.id, claimToken: parent.claimToken, gitRef: 'b'.repeat(40), report: 'Implemented' });
  assert.equal((await engine.get(run.id)).tasks.find(t => t.id === parent.id).status, 'submitted');
  await engine.prepareIntegration(run.id);
  await engine.integration(run.id, parent.id, 'c'.repeat(40), 'checks passed');
  assert.equal((await engine.get(run.id)).tasks.find(t => t.id === parent.id).status, 'integrated', 'Parent must wait for children');
  await engine.control(run.id, 'pause');
  const spare = await engine.register(run.id, 'worker', spec.workers[0]); assert.equal(spare, null);
  await engine.control(run.id, 'resume');
  await engine.store.mutate(root, run.id, state => { state.tasks.find(t => t.id === claimed[1].id).leaseUntil = 0; });
  await engine.recover(run.id);
  await assert.rejects(engine.agentOperation(run.id, agents[1].id, 'stale', 'submit_result', { taskId: claimed[1].id, claimToken: claimed[1].claimToken, gitRef: 'b'.repeat(40), report: 'stale' }));
  assert.equal((await engine.get(run.id)).tasks.find(t => t.id === claimed[1].id).status, 'pending');
  await engine.control(run.id, 'pause', 'operator', 'pause-key');
  await engine.control(run.id, 'pause', 'operator', 'pause-key');
  await assert.rejects(engine.control(run.id, 'cancel', 'operator', 'pause-key'));
  const events = await engine.store.events(root, run.id);
  assert.deepEqual(Object.keys(events[0]).sort(), ['event_id', 'sequence', 'run_id', 'type', 'timestamp', 'actor', 'payload', 'schema_version'].sort(), 'Handoff v1 event envelope changed');
  assert(events.every(event => event.schema_version === 1));
  assert.deepEqual(events.map(event => event.sequence), Array.from({ length: events.length }, (_, i) => i + 1));
  assert.equal((await engine.store.events(root, run.id, 2))[0].sequence, 3);
  assert.equal(publicRun(await engine.get(run.id)).tasks[0].claimToken, undefined);
  assert(!('operations' in publicRun(await engine.get(run.id))));
  const reopened = await open(root); assert.deepEqual(await reopened.get(run.id), await engine.get(run.id));
  const invalid = await engine.create(spec, 'a'.repeat(40)), invalidLead = await engine.register(invalid.id, 'lead', spec.lead);
  await assert.rejects(engine.plan(invalid.id, invalidLead.id, [{ ...task('A'), dependsOn: [1] }, { ...task('B'), dependsOn: [0] }]));
  assert.equal((await engine.get(invalid.id)).tasks.length, 0);
  await engine.control(invalid.id, 'cancel');
  await engine.finishAgent(run.id, agents[2].id); assert.equal((await engine.get(run.id)).status, 'needs_attention');
  const once = await Promise.all(Array.from({ length: 5 }, () => engine.create(spec, 'a'.repeat(40), 'owner', run.id + '-once')));
  assert(once.every(value => value.id === once[0].id));
  assert.equal((await engine.store.events(root, once[0].id)).length, 1, 'Concurrent create must emit only one start event');
  await assert.rejects(engine.create({ ...spec, goal: 'Different' }, 'a'.repeat(40), 'owner', once[0].id));
  const guarded = await planned(engine, [task('Guarded')], { ...spec, approval: 'integration', limits: { ...spec.limits, maxAttempts: 1 } });
  const guardedAgent = await engine.register(guarded.id, 'worker', spec.workers[0]);
  const guardedTask = await engine.claim(guarded.id, guardedAgent.id);
  await engine.agentOperation(guarded.id, guardedAgent.id, 'submit', 'submit_result', {
    taskId: guardedTask.id, claimToken: guardedTask.claimToken, gitRef: 'd'.repeat(40), report: 'Submitted for review' });
  assert.equal(await engine.prepareIntegration(guarded.id), null, 'Integration must wait for approval');
  const pendingApproval = (await engine.get(guarded.id)).approvals[0];
  await engine.decide(guarded.id, pendingApproval.id, 'approve', 'owner');
  await engine.prepareIntegration(guarded.id);
  await engine.integration(guarded.id, guardedTask.id, null, 'Check failed');
  await engine.recover(guarded.id);
  assert.equal((await engine.get(guarded.id)).tasks[0].status, 'failed');
  assert.equal((await engine.get(guarded.id)).status, 'needs_attention');
  await assert.rejects(engine.complete(guarded.id, true, 'Cannot skip failed checks'));
  await engine.control(guarded.id, 'cancel');
  assert.equal((await engine.get(guarded.id)).status, 'cancelled');
  const blocked = await planned(engine, [task('Blocked')]);
  const blockedAgent = await engine.register(blocked.id, 'worker', spec.workers[0]);
  const blockedTask = await engine.claim(blocked.id, blockedAgent.id);
  await engine.agentOperation(blocked.id, blockedAgent.id, 'blocker', 'report_blocker', {
    taskId: blockedTask.id, claimToken: blockedTask.claimToken, report: 'Missing local fixture' });
  await engine.retry(blocked.id, blockedTask.id, 'Fixture is now available');
  assert.equal((await engine.get(blocked.id)).tasks[0].status, 'pending');
  await assert.rejects(engine.retry(blocked.id, blockedTask.id, 'Cannot retry a ready task'));
  assert.match(redact('password=private-value https://alice:secret@host/path sk-12345678901234567890'), /redacted/);
  assert(!redact('password=private-value').includes('private-value'));
  assert.throws(() => parseSpec({ ...spec, limits: { maxAgents: 6 } }));
  assert.throws(() => parseSpec({ ...spec, checks: [] }));
  assert.throws(() => parseSpec({ ...spec, workers: [{ provider: 'unknown' }] }));
  const parsed = parseProviderOutput('codex', JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '{"accepted":true}' } }) + '\n'
    + JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } }));
  assert.equal(parsed.tokens, 15); assert.equal(parsed.result.accepted, true);
  assert.equal(parseProviderOutput('claude', JSON.stringify({ result: '{"accepted":true}', usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 20 } })).tokens, 35);
  assert.throws(() => parseProviderOutput('codex', '{"type":"turn.failed"}'));
  const command = buildProviderCommand({ provider: 'codex' }, 'worker', 'literal $(echo secret)', spec, { cli, url: 'http://127.0.0.1:1', runId: run.id, agentId: worker.id });
  assert.equal(command.input, 'literal $(echo secret)');
  assert(!command.args.includes(command.input), 'Project instructions must not be exposed in process argv');
  assert(!command.args.some(arg => arg.includes('dangerously')));
  const claude = buildProviderCommand({ provider: 'claude' }, 'worker', 'literal prompt', spec,
    { cli, url: 'http://127.0.0.1:1', runId: run.id, agentId: worker.id });
  assert.equal(JSON.parse(claude.args[claude.args.indexOf('--mcp-config') + 1]).mcpServers.swarm.env.AIF_SWARM_AGENT_TOKEN, '${AIF_SWARM_AGENT_TOKEN}');
  const timed = await execute(process.execPath, ['-e', 'setInterval(()=>{},1000)'], temp, 100);
  assert.equal(timed.timedOut, true);
  const abort = new AbortController(), pidFile = path.join(temp, 'descendant.pid');
  const cancelled = execute(process.execPath, ['-e', `const fs=require('fs'),{spawn}=require('child_process');const p=spawn(process.execPath,['-e','setInterval(()=>{},1000)']);fs.writeFileSync(${JSON.stringify(pidFile)},String(p.pid));setInterval(()=>{},1000);`], temp, 10000, abort.signal);
  await waitUntil(() => fs.readFile(pidFile, 'utf8').catch(() => false));
  const descendant = Number(await fs.readFile(pidFile, 'utf8')); abort.abort();
  await assert.rejects(cancelled, /cancelled/);
  await waitUntil(() => { try { process.kill(descendant, 0); return false; } catch { return true; } });

  // Exercise real Git, CLI, HTTP/SSE, scheduler and integration with a deterministic provider executable.
  const repo = path.join(temp, 'project'); await fs.mkdir(repo);
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init'); git('config', 'user.name', 'Swarm fixture'); git('config', 'user.email', 'fixture@example.invalid');
  await fs.writeFile(path.join(repo, '.gitignore'), '.ai-factory/\n');
  await fs.writeFile(path.join(repo, 'check.cjs'), 'const fs=require("fs");for(const f of fs.readdirSync(".")){if(f.endsWith(".txt")&&fs.readFileSync(f,"utf8").includes("BAD"))process.exit(1)}');
  git('add', '.'); git('commit', '-m', 'fixture'); const source = git('rev-parse', 'HEAD');
  await fs.mkdir(path.join(repo, '.ai-factory')); await fs.writeFile(path.join(repo, '.ai-factory', 'swarm.yaml'), JSON.stringify(spec));
  await fs.writeFile(path.join(repo, '.ai-factory', 'DESCRIPTION.md'), 'Fixture context survives ignored Git files');
  const started = JSON.parse(runCli(repo, ['start'])); assert.equal(started.status, 'running');
  const runtimeEngine = await open(repo);
  const bin = path.join(temp, 'bin'); await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'codex'), `#!${process.execPath}
const fs=require('fs'), cp=require('child_process');
const prompt=fs.readFileSync(0,'utf8');
if(!prompt.includes('Fixture context survives ignored Git files'))process.exit(2);
if(prompt.includes('Goal: Cancellation fixture')&&prompt.includes('Task: ')){fs.writeFileSync('worker.started','running');setInterval(()=>{},1000);return;}
let result;
if(prompt.includes('Create at most')) result={tasks:Array.from({length:/Goal: (Dirty integration|Lease lifecycle) fixture/.test(prompt)?1:5},(_,i)=>({title:'item'+i,description:'Create item'+i,acceptanceCriteria:['File exists'],dependsOn:[]}))};
else if(prompt.includes('Task: ')) {
const task=JSON.parse(prompt.split('Task: ')[1].split('\\n')[0]);
fs.writeFileSync(task.title+'.txt','OK');
if(prompt.includes('Goal: Dirty integration fixture')&&task.attempts>1)fs.writeFileSync('repair.txt','OK');
if(prompt.includes('Goal: Lease lifecycle fixture'))fs.writeFileSync('slow-commit.txt','OK');
result={report:'Implemented and checked'};
} else result={accepted:true,report:'All criteria satisfied'};
console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(result)}}));
console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:20,output_tokens:10}}));
`, { mode: 0o755 });
  const originalPath = process.env.PATH; process.env.PATH = bin + path.delimiter + originalPath;
  process.env.AIF_SWARM_OWNER_TOKEN = 'owner-'.repeat(8); process.env.AIF_SWARM_VIEWER_TOKEN = 'viewer-'.repeat(8);
  const server = await serveSwarm(runtimeEngine, 0, undefined, 50);
  try {
    const headers = role => ({ authorization: `Bearer ${process.env[`AIF_SWARM_${role}_TOKEN`]}`, 'content-type': 'application/json', 'idempotency-key': 'fixture-key' });
    const api = (route, role = 'OWNER', options = {}) => fetch(server.url + '/v1/swarm/' + route, { ...options, headers: headers(role) });
    const awaitCompletion = id => waitUntil(async () => {
      const state = await runtimeEngine.get(id);
      if (state.status === 'needs_attention') throw new Error(JSON.stringify(await runtimeEngine.store.events(repo, id)));
      return state.approvals.some(a => a.kind === 'completion') && state.agents.every(a => a.status === 'stopped') ? state : false;
    });
    assert.equal((await fetch(server.url + '/v1/swarm/runs')).ok, false);
    assert.equal((await api(`runs/${started.id}/cancel`, 'VIEWER', { method: 'POST' })).ok, false);
    assert.equal((await fetch(server.url + '/v1/swarm/runs', { headers: { ...headers('OWNER'), origin: 'https://example.invalid' } })).ok, false);
    const done = await waitUntil(async () => {
      const state = await runtimeEngine.get(started.id);
      if (state.status === 'needs_attention') throw new Error(JSON.stringify(await runtimeEngine.store.events(repo, started.id)));
      return state.approvals.some(a => a.kind === 'completion') ? state : false;
    }).catch(async error => { throw new Error(`${error.message}: ${JSON.stringify(publicRun(await runtimeEngine.get(started.id)))}; events=${JSON.stringify(await runtimeEngine.store.events(repo, started.id))}`); });
    assert(done.tasks.every(t => t.status === 'done'));
    assert.equal(done.status, 'running', 'No automatic completion before owner review');
    assert.equal(git('rev-parse', 'HEAD'), source, 'Source branch must stay unchanged');
    assert.equal(done.artifacts.filter(a => a.type === 'integration').length, 5);
    const approval = done.approvals.find(a => a.kind === 'completion');
    await waitUntil(async () => (await runtimeEngine.get(started.id)).agents.every(a => a.status === 'stopped'));
    assert.equal((await api(`approvals/${approval.id}/decision`, 'OWNER', { method: 'POST', body: '{"decision":"approve"}' })).status, 200);
    assert.equal((await runtimeEngine.get(started.id)).status, 'completed');
    const stream = await api(`runs/${started.id}/events/stream?after=2`, 'VIEWER');
    const reader = stream.body.getReader(); let output = '';
    await waitUntil(async () => { const chunk = await reader.read(); output += new TextDecoder().decode(chunk.value); return output.includes('id: 3\n'); });
    assert(!output.includes('id: 1\n')); await reader.cancel();
    const snapshot = await (await api(`runs/${started.id}`, 'VIEWER')).json(); assert.equal(snapshot.status, 'completed');
    assert.equal(snapshot.operations, undefined);
    assert(snapshot.context.every(file => !('content' in file)), 'Public snapshots expose context identities, not captured instructions');
    assert.deepEqual(JSON.parse(runCli(repo, ['inspect', started.id])).status, 'completed');
    const mcp = spawn(process.execPath, [cli, 'swarm', 'mcp'], { env: { ...process.env, AIF_SWARM_URL: server.url, AIF_SWARM_RUN_ID: started.id, AIF_SWARM_AGENT_TOKEN: 'invalid' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let mcpOutput = ''; mcp.stdout.on('data', chunk => { mcpOutput += chunk; }); mcp.stderr.resume();
    mcp.stdin.end('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n');
    await new Promise(resolve => mcp.once('exit', resolve));
    const messages = mcpOutput.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(messages[0].result.serverInfo.name, 'ai-factory-swarm'); assert.equal(messages[1].result.tools.length, 10);
    const hookStarted = path.join(temp, 'hook-started');
    await fs.writeFile(path.join(repo, '.git', 'hooks', 'pre-commit'), `#!${process.execPath}\nconst fs=require('fs');if(fs.existsSync('slow-commit.txt')){fs.writeFileSync(${JSON.stringify(hookStarted)},'started');setTimeout(()=>{},4500);}\n`, { mode: 0o755 });
    const leaseRun = await runtimeEngine.create({ ...spec, goal: 'Lease lifecycle fixture',
      limits: { ...spec.limits, leaseMs: 3000, maxAttempts: 1 } }, source);
    await waitUntil(() => fs.readFile(hookStarted, 'utf8').catch(() => false));
    const committing = await runtimeEngine.get(leaseRun.id);
    const committingAgent = committing.agents.find(a => a.id === committing.tasks[0].assignedAgentId);
    assert.equal(committingAgent.status, 'running', 'Worker must stay active while Runtime commits its result');
    assert.equal(committingAgent.tokens, 30, 'Provider usage must be recorded before the Git hook finishes');
    assert.equal(committingAgent.reservation, 0);
    const leaseDone = await awaitCompletion(leaseRun.id);
    assert.equal(leaseDone.tasks[0].attempts, 1, 'A successful hook longer than leaseMs must not expire the claim');
    assert.equal(leaseDone.tasks[0].status, 'done');
    assert.equal(leaseDone.tokens, 90, 'Lead, worker and verifier usage must each be counted once');
    assert(!(await runtimeEngine.store.events(repo, leaseRun.id)).some(event => event.type === 'task.lease_expired'));
    await runtimeEngine.decide(leaseDone.id, leaseDone.approvals.find(a => a.kind === 'completion').id, 'approve', 'owner');
    await fs.unlink(path.join(repo, '.git', 'hooks', 'pre-commit'));
    const dirtyRun = await runtimeEngine.create({ ...spec, goal: 'Dirty integration fixture', checks: [
      [process.execPath, '-e', 'const fs=require("fs");if(!fs.existsSync("repair.txt")){fs.writeFileSync("untracked-report.txt","preserved failure evidence");process.exit(1)}'], ...spec.checks,
    ] }, source);
    const repaired = await awaitCompletion(dirtyRun.id);
    assert.equal(repaired.tasks[0].attempts, 2, 'A dirty failed attempt must not poison the next integration');
    assert.equal(repaired.tasks[0].status, 'done');
    const failedArtifact = repaired.artifacts.find(a => a.type === 'integration-failure');
    assert(failedArtifact, 'Keep the failed attempt and its immutable submitted ref discoverable');
    assert.equal(await fs.readFile(path.join(failedArtifact.metadata.worktree, 'untracked-report.txt'), 'utf8'), 'preserved failure evidence');
    git('cat-file', '-e', `${failedArtifact.git_ref}^{commit}`);
    await runtimeEngine.decide(repaired.id, repaired.approvals.find(a => a.kind === 'completion').id, 'approve', 'owner');
    const rejectionRun = await runtimeEngine.create({ ...spec, goal: 'Final rejection fixture' }, source);
    const rejected = await awaitCompletion(rejectionRun.id);
    const rejectionApproval = rejected.approvals.find(a => a.kind === 'completion');
    assert.equal((await api(`approvals/${rejectionApproval.id}/decision`, 'OWNER', { method: 'POST', body: '{"decision":"reject"}' })).status, 200);
    const terminalRejection = await runtimeEngine.get(rejectionRun.id);
    assert.equal(terminalRejection.status, 'failed');
    assert(Number.isSafeInteger(terminalRejection.finishedAt));
    assert.equal((await api(`runs/${rejectionRun.id}/resume`, 'OWNER', { method: 'POST' })).ok, false, 'Final rejection is terminal, not a stuck resumable run');
    const cancelledRun = await runtimeEngine.create({ ...spec, goal: 'Cancellation fixture' }, source);
    await waitUntil(async () => {
      const state = await runtimeEngine.get(cancelledRun.id);
      return (await Promise.all(state.tasks.map(t => fs.access(path.join(os.tmpdir(), `aif-swarm-${digest(repo).slice(0, 16)}`, state.id,
        `${t.id}-${t.attempts}`, 'worker.started')).then(() => true, () => false)))).some(Boolean);
    });
    assert.equal((await api(`runs/${cancelledRun.id}/cancel`, 'OWNER', { method: 'POST' })).status, 200);
    await waitUntil(async () => (await runtimeEngine.get(cancelledRun.id)).agents.every(agent => agent.status === 'stopped'));
    assert((await runtimeEngine.get(cancelledRun.id)).tasks.every(task => task.status === 'cancelled'));
  } finally { await server.close(); process.env.PATH = originalPath; }
  // A restart requeues an interrupted claim and makes unknown usage explicit.
  const restart = await planned(runtimeEngine, [task('Interrupted')]);
  const orphan = await runtimeEngine.register(restart.id, 'worker', spec.workers[0]);
  await runtimeEngine.claim(restart.id, orphan.id);
  const recovered = await serveSwarm(runtimeEngine, 0, undefined, 60000);
  try {
    const state = await runtimeEngine.get(restart.id);
    assert.equal(state.status, 'needs_attention'); assert.equal(state.tasks[0].status, 'pending');
    assert.equal(state.agents.find(a => a.id === orphan.id).status, 'stopped');
  } finally { await recovered.close(); }
  console.log(`PASS swarm: ${databaseUrl ? 'PostgreSQL' : 'SQLite'} queue, DAG, leases, idempotency, restart, API/SSE/RBAC, MCP, five workers and Git integration`);
  console.log('NOTRUN real model inference, container isolation, remote runners and provider-enforced token ceilings');
} finally {
  await Promise.allSettled(stores.map(store => store.close()));
  for (const root of projects) await fs.rm(path.join(os.tmpdir(), `aif-swarm-${digest(root).slice(0, 16)}`), { recursive: true, force: true });
  await fs.rm(temp, { recursive: true, force: true });
}
