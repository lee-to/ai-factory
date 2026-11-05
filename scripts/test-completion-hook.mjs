#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (!['darwin', 'linux'].includes(process.platform)) {
  console.log('SKIP completion-hook native process-group fixtures: unsupported platform');
  process.exit(0);
}

const cli = fileURLToPath(new URL('../dist/cli/index.js', import.meta.url));
const temp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aif-completion-hook-')));
const project = path.join(temp, 'project with spaces');
const run = (args, options = {}) => {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: project, encoding: 'utf8', timeout: 15000, ...options });
  assert.ifError(result.error);
  return result;
};
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: project, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const parse = result => { assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout); };
let spec;
const saveSpec = async () => fs.writeFile(path.join(project, 'hook-spec.json'), JSON.stringify(spec));
const enable = async (mode = 'pass', role = 'required') => {
  spec.role = role;
  spec.argv = ['verify.mjs', mode];
  await saveSpec();
  const result = parse(run(['completion-hook', 'enable', '--spec', 'hook-spec.json']));
  assert.equal(result.status, 'enabled');
  return JSON.parse(await fs.readFile(path.join(project, '.claude/settings.local.json'), 'utf8')).hooks.Stop.at(-1).hooks[0];
};
let session = 0;
const event = extra => ({ hook_event_name: 'Stop', session_id: `session-${++session}`, stop_hook_active: false, cwd: project, ...extra });
const invoke = (hook, payload = event(), options = {}) => {
  const result = spawnSync(hook.command, hook.args, { cwd: project, input: JSON.stringify(payload), encoding: 'utf8', timeout: 15000, ...options });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};
const receiptFor = async result => {
  const relative = result.systemMessage.match(/\.ai-factory\/completion-hook\/receipts\/[a-z0-9-]+\.json/)[0];
  return { relative, data: JSON.parse(await fs.readFile(path.join(project, relative), 'utf8')) };
};
async function check(hook, expected, blocked = true, payload = event(), options = {}) {
  const result = invoke(hook, payload, options);
  assert.equal(result.decision === 'block', blocked, JSON.stringify(result));
  const receipt = await receiptFor(result);
  assert.equal(receipt.data.outcome, expected, JSON.stringify(receipt.data));
  return receipt;
}
try {
  await fs.mkdir(project);
  await fs.mkdir(path.join(project, 'out'));
  await fs.mkdir(path.join(project, '.claude'));
  await fs.writeFile(path.join(project, '.gitignore'), 'out/\n.ai-factory/\n.claude/\n');
  const originalSettings = { permissions: { deny: ['Bash(rm *)'] }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'user-owned-hook' }] }], SessionStart: [] } };
  await fs.writeFile(path.join(project, '.claude/settings.local.json'), JSON.stringify(originalSettings));
  const host = path.join(project, 'fake-host');
  await fs.writeFile(host, '#!/bin/sh\nprintf \'2.1.318 (Claude Code)\\n\'\n', { mode: 0o755 });
  await fs.writeFile(path.join(project, 'source.txt'), 'original\n');
  await fs.writeFile(path.join(project, 'verify.mjs'), `
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
const mode = process.argv[2];
fs.appendFileSync('out/launches', 'launch\\n');
const result = { schema_version: 1, gate: 'verify', status: mode === 'warn' ? 'warn' : mode === 'fail-report' ? 'fail' : 'pass',
  blocking: mode === 'fail-report', blockers: mode === 'fail-report' ? [{ id: 'test', severity: 'error', summary: 'fixture failed' }] : [],
  affected_files: ['source.txt'], suggested_next: { command: null, reason: 'Fixture verification' } };
const report = () => console.log('\`\`\`aif-gate-result\\n' + JSON.stringify(result) + '\\n\`\`\`');
if (mode === 'timeout' || mode === 'cancel') {
  fs.writeFileSync('out/started', 'yes');
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => require("fs").writeFileSync("out/leaked", "bad"), 1500)']);
  fs.writeFileSync('out/child', String(child.pid));
  setInterval(() => {}, 1000);
} else if (mode === 'output') { process.stdout.write('x'.repeat(100000)); }
else if (mode === 'missing') { console.log(JSON.stringify({ status: 'pass' })); }
else if (mode === 'invalid') { console.log('\`\`\`aif-gate-result\\n{}\\n\`\`\`'); }
else {
  if (mode === 'edit') fs.appendFileSync('source.txt', 'changed during verifier\\n');
  if (mode === 'inconsistent') result.blocking = true;
  if (mode === 'last-block') console.log('\`\`\`aif-gate-result\\n{}\\n\`\`\`');
  if (mode === 'index-edit') {
    const original = fs.readFileSync('source.txt');
    fs.writeFileSync('source.txt', 'staged-only change');
    if (spawnSync('git', ['add', 'source.txt']).status !== 0) throw new Error('staging failed');
    fs.writeFileSync('source.txt', original);
  }
  report();
  if (mode === 'dangling') console.log('\`\`\`aif-gate-result\\n{');
  if (mode === 'trailing') console.log('verification failed after report');
  if (mode === 'whitespace') process.stdout.write(' \\n\\t\\r\\n');
  if (mode === 'fail-exit') process.exitCode = 1;
}
`);
  git('init', '-q'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'fixture');
  spec = { schema_version: 1, runtime: 'claude', version: '2.1.318', host_executable: host, role: 'required',
    executable: await fs.realpath(process.execPath), argv: [], cwd: '.', source_revision: git('rev-parse', 'HEAD'),
    inputs: ['verify.mjs', '.gitignore'], timeout_ms: 5000 };
  let hook = await enable();
  assert.deepEqual(hook.args.slice(1, 3), ['completion-hook', 'run']);
  const passed = await check(hook, 'passed', false);
  assert.equal(passed.data.execution.exit, 0);
  assert.equal(passed.data.evidence_complete, true);
  assert.equal(passed.data.effective_cwd, project);
  assert.equal(passed.data.source.head, spec.source_revision);
  assert.deepEqual(passed.data.command.argv, spec.argv);
  assert.equal(parse(run(['completion-hook', 'inspect', passed.relative])).status, 'current');
  await fs.appendFile(path.join(project, 'source.txt'), 'later edit\n');
  assert.equal(parse(run(['completion-hook', 'inspect', passed.relative])).status, 'stale');
  await fs.writeFile(path.join(project, 'source.txt'), 'staged-only change');
  git('add', 'source.txt');
  await fs.writeFile(path.join(project, 'source.txt'), 'original\n');
  assert.equal(parse(run(['completion-hook', 'inspect', passed.relative])).status, 'stale', 'index-only changes invalidate evidence');
  git('reset', '--', 'source.txt');
  assert.equal(parse(run(['completion-hook', 'inspect', passed.relative])).status, 'current', 'index metadata refresh alone preserves evidence');
  const once = event();
  await check(hook, 'passed', false, once);
  const launches = await fs.readFile(path.join(project, 'out/launches'), 'utf8');
  await check(hook, 'reentry', true, once);
  await check(hook, 'recursion', true, event({ stop_hook_active: true }));
  await check(hook, 'recursion', true, event(), { env: { ...process.env, AIF_COMPLETION_HOOK_ACTIVE: '1' } });
  await check(hook, 'wrong_cwd', true, event({ cwd: temp }));
  await check(hook, 'invalid_event', true, { hook_event_name: 'Stop' });
  assert.equal(await fs.readFile(path.join(project, 'out/launches'), 'utf8'), launches);
  await fs.appendFile(path.join(project, 'verify.mjs'), '\n// changed command definition\n');
  await check(hook, 'changed_command');
  assert.equal(parse(run(['completion-hook', 'inspect', passed.relative])).status, 'stale');
  hook = await enable();
  spec.argv = ['verify.mjs', 'fail-exit']; await saveSpec();
  await check(hook, 'changed_command');
  for (const [mode, outcome, blocked] of [['fail-exit', 'failed', true], ['fail-report', 'failed', true],
    ['missing', 'missing_report', true], ['invalid', 'invalid_report', true], ['inconsistent', 'invalid_report', true],
    ['warn', 'warning', false], ['last-block', 'passed', false], ['whitespace', 'passed', false],
    ['dangling', 'invalid_report', true], ['trailing', 'invalid_report', true], ['index-edit', 'stale', true], ['output', 'output_limit', true], ['edit', 'stale', true]]) {
    hook = await enable(mode);
    const receipt = await check(hook, outcome, blocked);
    if (mode === 'index-edit') git('reset', '--', 'source.txt');
    if (mode === 'fail-exit') assert.equal(receipt.data.execution.exit, 1);
    if (mode === 'output') assert.equal(receipt.data.execution.output_complete, false);
  }
  spec.cwd = 'missing-directory';
  hook = await enable();
  await check(hook, 'spawn_error');
  spec.cwd = '.';
  hook = await enable();
  await fs.writeFile(path.join(project, 'another-source.txt'), 'new source');
  git('add', 'another-source.txt');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'new revision');
  await check(hook, 'stale');
  spec.source_revision = git('rev-parse', 'HEAD');
  spec.timeout_ms = 200;
  hook = await enable('timeout');
  const timeout = await check(hook, 'timeout');
  assert.equal(timeout.data.execution.signal, 'SIGKILL');
  assert.equal(timeout.data.evidence_complete, false);
  // The real verifier and its child share a killed process group.
  await new Promise(resolve => setTimeout(resolve, 1600));
  await assert.rejects(fs.access(path.join(project, 'out/leaked')));
  spec.timeout_ms = 5000;
  await fs.rm(path.join(project, 'out/started'), { force: true });
  hook = await enable('cancel');
  const child = spawn(hook.command, hook.args, { cwd: project, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(JSON.stringify(event()));
  let stdout = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.resume();
  const closed = new Promise(resolve => child.on('close', resolve));
  const deadline = Date.now() + 10000;
  while (true) {
    try { await fs.access(path.join(project, 'out/started')); break; } catch { /* Wait for real verifier startup. */ }
    assert(Date.now() < deadline);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  child.kill('SIGTERM');
  assert.equal(await closed, 0);
  const cancelled = await receiptFor(JSON.parse(stdout));
  assert.equal(cancelled.data.outcome, 'cancelled');
  hook = await enable('fail-exit', 'observer');
  await check(hook, 'failed', false);
  const requiredHook = await enable();
  const downgraded = { ...requiredHook, args: [...requiredHook.args.slice(0, -1), 'observer'] };
  await check(downgraded, 'wrong_project_or_role');
  parse(run(['completion-hook', 'disable']));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(project, '.claude/settings.local.json'), 'utf8')), originalSettings);
  await check(requiredHook, 'unsupported');
  await check(hook, 'unsupported', false);
  spec.version = '0.0.0'; await saveSpec();
  const unsupported = run(['completion-hook', 'enable', '--spec', 'hook-spec.json']);
  assert.equal(unsupported.status, 1);
  assert.equal(JSON.parse(unsupported.stdout).status, 'unsupported');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(project, '.claude/settings.local.json'), 'utf8')), originalSettings);
  spec.version = '2.1.318';
  spec.runtime = 'codex'; await saveSpec();
  const unsupportedRuntime = run(['completion-hook', 'enable', '--spec', 'hook-spec.json']);
  assert.equal(unsupportedRuntime.status, 1);
  assert.equal(JSON.parse(unsupportedRuntime.stdout).status, 'unsupported');
  spec.runtime = 'claude';
  hook = await enable();
  await fs.appendFile(host, '# host changed\n');
  await check(hook, 'changed_command');
  // Help and execution never import extension commands before approval validation.
  await fs.mkdir(path.join(project, '.ai-factory/extensions/evil'), { recursive: true });
  await fs.writeFile(path.join(project, '.ai-factory.json'), JSON.stringify({ version: '2.21.0', skills: [], agents: [], extensions: [{ name: 'evil', source: './evil', sourceType: 'local' }] }));
  await fs.writeFile(path.join(project, '.ai-factory/extensions/evil/extension.json'), JSON.stringify({ name: 'evil', version: '1.0.0', commands: [{ name: 'evil', module: 'evil.mjs' }] }));
  await fs.writeFile(path.join(project, '.ai-factory/extensions/evil/evil.mjs'), "import fs from 'node:fs'; fs.writeFileSync('out/imported', 'bad'); export function register() {}\n");
  assert.equal(run(['completion-hook', '--help']).status, 0);
  await check(hook, 'changed_command');
  await assert.rejects(fs.access(path.join(project, 'out/imported')));
  console.log('PASS completion-hook: real bounded verifier, Stop decisions, receipts, freshness, recursion, cancellation, opt-in/reversal and unsupported runtime');
} finally { await fs.rm(temp, { recursive: true, force: true }); }
