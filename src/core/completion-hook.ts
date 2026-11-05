import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeInstructionPath, resolveInstructionLocalPath } from './instruction-manifest.js';

const STORE = '.ai-factory/completion-hook';
const SETTINGS = '.claude/settings.local.json';
const RUNTIME = '2.1.318';
const MAX_OUTPUT = 64 * 1024;
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
type ObjectValue = Record<string, unknown>;
function object(value: unknown): value is ObjectValue {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4000 && !/[\x00-\x1f]/.test(value);
}
interface Specification {
  schema_version: 1; runtime: string; version: string; host_executable: string;
  role: 'required' | 'observer'; executable: string; argv: string[]; cwd: string;
  source_revision: string; inputs: string[]; timeout_ms: number;
}
interface Approval {
  id: string; project: string; spec_path: string; spec_sha256: string; spec: Specification;
  executable_sha256: string; host_sha256: string; inputs: Record<string, string>;
  hook: ObjectValue;
}
function specification(value: unknown): Specification {
  if (!object(value) || Object.keys(value).some(key => !['schema_version', 'runtime', 'version', 'host_executable',
    'role', 'executable', 'argv', 'cwd', 'source_revision', 'inputs', 'timeout_ms'].includes(key))
    || value.schema_version !== 1 || !text(value.runtime) || !text(value.version)
    || !['required', 'observer'].includes(String(value.role)) || !text(value.executable) || !path.isAbsolute(value.executable)
    || !text(value.host_executable) || !path.isAbsolute(value.host_executable)
    || !Array.isArray(value.argv) || value.argv.length > 100 || !value.argv.every(text)
    || !text(value.cwd) || !text(value.source_revision) || !/^[a-f0-9]{40,64}$/.test(value.source_revision)
    || !Array.isArray(value.inputs) || !value.inputs.length || value.inputs.length > 100 || !value.inputs.every(text)
    || !Number.isInteger(value.timeout_ms) || Number(value.timeout_ms) < 100 || Number(value.timeout_ms) > 120000) {
    throw new Error('Invalid completion-hook specification.');
  }
  if (value.cwd !== '.') normalizeInstructionPath(value.cwd);
  for (const input of value.inputs) normalizeInstructionPath(input as string);
  return value as unknown as Specification;
}
async function read(project: string, relative: string): Promise<Buffer> {
  const target = await resolveInstructionLocalPath(project, relative);
  const handle = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!(await handle.stat()).isFile()) throw new Error('Expected a regular file.');
    const bytes = Buffer.alloc(1024 * 1024 + 1);
    let size = 0;
    while (size < bytes.length) {
      const result = await handle.read(bytes, size, bytes.length - size, size);
      if (!result.bytesRead) break;
      size += result.bytesRead;
    }
    if (size === bytes.length) throw new Error('Completion-hook file exceeds 1 MiB.');
    return bytes.subarray(0, size);
  } finally { await handle.close(); }
}
async function fingerprint(file: string, limit = 512 * 1024 * 1024): Promise<{ sha256: string; size: number; mode: number }> {
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error('Unsupported file or fingerprint limit.');
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(64 * 1024);
    let size = 0;
    for (;;) {
      const result = await handle.read(buffer, 0, buffer.length, null);
      if (!result.bytesRead) break;
      size += result.bytesRead;
      if (size > limit) throw new Error('Fingerprint limit.');
      hash.update(buffer.subarray(0, result.bytesRead));
    }
    return { sha256: hash.digest('hex'), size, mode: stat.mode & 0o777 };
  } finally { await handle.close(); }
}
function git(project: string, args: string[]): string {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  const result = spawnSync('git', ['-c', 'core.fsmonitor=false', '-C', project, ...args], {
    env, encoding: 'utf8', timeout: 5000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
  });
  if (result.error || result.status !== 0 || result.stdout.includes('\ufffd')) throw new Error('Git source inventory unavailable.');
  return result.stdout;
}
async function snapshot(project: string, inputs: string[]) {
  if (await fs.realpath(git(project, ['rev-parse', '--show-toplevel']).trim()) !== project) throw new Error('Expected the Git worktree root.');
  const head = git(project, ['rev-parse', 'HEAD']).trim();
  const index_sha256 = sha(git(project, ['ls-files', '--stage', '-z']));
  const files = [...new Set([...git(project, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean), ...inputs])]
    .filter(file => file !== SETTINGS && file !== STORE && !file.startsWith(`${STORE}/`)).sort();
  if (files.length > 10000) throw new Error('Source inventory exceeds 10000 files.');
  const entries: Array<{ path: string; sha256: string | null; mode: number | null }> = [];
  let size = 0;
  for (const file of files) {
    try {
      const target = await resolveInstructionLocalPath(project, file);
      const digest = await fingerprint(target, 8 * 1024 * 1024);
      size += digest.size;
      if (size > 128 * 1024 * 1024) throw new Error('Source inventory exceeds 128 MiB.');
      entries.push({ path: file, sha256: digest.sha256, mode: digest.mode });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      entries.push({ path: file, sha256: null, mode: null });
    }
  }
  if (Buffer.byteLength(json(entries)) > 512 * 1024) throw new Error('Source evidence exceeds 512 KiB.');
  return { head, index_sha256, sha256: sha(json({ head, index_sha256, entries })), files: entries };
}
async function inputDigests(project: string, inputs: string[]): Promise<Record<string, string>> {
  const entries: Record<string, string> = Object.create(null);
  for (const input of inputs) entries[input] = (await fingerprint(await resolveInstructionLocalPath(project, input), 8 * 1024 * 1024)).sha256;
  return entries;
}
function supported(spec: Specification): boolean {
  if (process.platform !== 'darwin' && process.platform !== 'linux') return false;
  if (spec.runtime !== 'claude' || spec.version !== RUNTIME) return false;
  const result = spawnSync(spec.host_executable, ['--version'], { encoding: 'utf8', timeout: 3000, maxBuffer: MAX_OUTPUT });
  return !result.error && result.status === 0 && result.stdout.trim() === `${RUNTIME} (Claude Code)`;
}
async function settings(project: string): Promise<ObjectValue> {
  let data: unknown;
  try { data = JSON.parse((await read(project, SETTINGS)).toString('utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; }
  if (!object(data) || (data.hooks !== undefined && !object(data.hooks))) throw new Error('Unsupported project hook settings.');
  if (object(data.hooks) && data.hooks.Stop !== undefined && !Array.isArray(data.hooks.Stop)) throw new Error('Unsupported Stop hooks.');
  return data;
}
async function write(project: string, relative: string, value: unknown, exclusive = false): Promise<void> {
  const target = await resolveInstructionLocalPath(project, relative, true);
  if (exclusive) { await fs.writeFile(target, json(value), { flag: 'wx', mode: 0o600 }); return; }
  const temporary = `${target}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, json(value), { flag: 'wx', mode: 0o600 });
  try { await fs.rename(temporary, target); } finally { await fs.rm(temporary, { force: true }); }
}
export async function enableCompletionHook(projectDir: string, specPath: string) {
  const project = await fs.realpath(projectDir);
  const bytes = await read(project, normalizeInstructionPath(specPath));
  const spec = specification(JSON.parse(bytes.toString('utf8')));
  if (spec.runtime !== 'claude' || spec.version !== RUNTIME || !['darwin', 'linux'].includes(process.platform)) {
    return { status: 'unsupported', runtime: spec.runtime, version: spec.version };
  }
  // Canonical paths keep later symlink retargeting outside the approved command.
  if (await fs.realpath(spec.executable) !== spec.executable || await fs.realpath(spec.host_executable) !== spec.host_executable) {
    throw new Error('Use canonical absolute executable paths (realpath).');
  }
  if (!supported(spec)) return { status: 'unsupported', runtime: spec.runtime, version: spec.version };
  const source = await snapshot(project, [...spec.inputs, specPath]);
  if (source.head !== spec.source_revision) throw new Error('Approved source_revision does not match HEAD.');
  const config = await settings(project);
  const hooks = (config.hooks ??= {}) as ObjectValue;
  const stops = (hooks.Stop ??= []) as unknown[];
  let previous: Approval | undefined;
  try { previous = JSON.parse((await read(project, `${STORE}/approval.json`)).toString('utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const remaining = previous ? stops.filter(entry => json(entry) !== json(previous.hook)) : stops;
  const id = randomUUID();
  const hook = { hooks: [{ type: 'command', command: process.execPath,
    args: [fileURLToPath(new URL('../cli/index.js', import.meta.url)), 'completion-hook', 'run', '--project', project,
      '--approval', id, '--role', spec.role], timeout: Math.ceil(spec.timeout_ms / 1000) + 30 }] };
  const approval: Approval = { id, project, spec_path: specPath, spec_sha256: sha(bytes), spec,
    executable_sha256: (await fingerprint(spec.executable)).sha256,
    host_sha256: (await fingerprint(spec.host_executable)).sha256, inputs: await inputDigests(project, spec.inputs), hook };
  await write(project, `${STORE}/approval.json`, approval);
  hooks.Stop = [...remaining, hook];
  await write(project, SETTINGS, config);
  return { status: 'enabled', approval: id, role: spec.role, source_revision: source.head };
}
export async function disableCompletionHook(projectDir: string) {
  const project = await fs.realpath(projectDir);
  let approval: Approval;
  try { approval = JSON.parse((await read(project, `${STORE}/approval.json`)).toString('utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'disabled' }; throw error; }
  const config = await settings(project);
  const hooks = config.hooks as ObjectValue | undefined;
  if (hooks && Array.isArray(hooks.Stop)) {
    hooks.Stop = hooks.Stop.filter(entry => json(entry) !== json(approval.hook));
    await write(project, SETTINGS, config);
  }
  await fs.unlink(await resolveInstructionLocalPath(project, `${STORE}/approval.json`));
  return { status: 'disabled' };
}
function report(output: string): ObjectValue | null {
  const blocks = [...output.matchAll(/^```aif-gate-result\r?\n([\s\S]*?)^```\s*$/gm)];
  const block = blocks.at(-1);
  if (!block) return null;
  if (output.slice(block.index! + block[0].length).trim()) throw new Error('Verifier report must be the final complete output.');
  const value: unknown = JSON.parse(block[1]);
  if (!object(value) || value.schema_version !== 1 || value.gate !== 'verify'
    || !['pass', 'warn', 'fail'].includes(String(value.status)) || typeof value.blocking !== 'boolean'
    || !Array.isArray(value.blockers) || !Array.isArray(value.affected_files) || !value.affected_files.every(text)
    || !object(value.suggested_next) || !(value.suggested_next.command === null
      || ['/aif-fix', '/aif-rules', '/aif-architecture', '/aif-roadmap', '/aif-commit'].includes(String(value.suggested_next.command)))
    || !text(value.suggested_next.reason)
    || value.blockers.some(blocker => !object(blocker) || !text(blocker.id) || !text(blocker.summary)
      || !['error', 'warning'].includes(String(blocker.severity)))
    || (value.status === 'fail') !== value.blocking || value.blocking !== (value.blockers.length > 0)) throw new Error('Invalid verifier report.');
  return value;
}
async function execute(spec: Specification, cwd: string) {
  return new Promise<{ exit: number | null; signal: string | null; outcome: string; stdout: Buffer; stderr: Buffer }>(resolve => {
    let outcome = 'exited';
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0);
    const child = spawn(spec.executable, spec.argv, { cwd, shell: false, detached: true,
      env: { ...process.env, AIF_COMPLETION_HOOK_ACTIVE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const kill = () => { try { if (child.pid) process.kill(-child.pid, 'SIGKILL'); } catch { /* Already exited. */ } };
    const stop = (reason: string) => {
      if (outcome === 'exited') outcome = reason;
      kill(); child.stdout.destroy(); child.stderr.destroy();
    };
    const cancel = () => stop('cancelled');
    const timer = setTimeout(() => stop('timeout'), spec.timeout_ms);
    process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
    const append = (stream: 'stdout' | 'stderr', chunk: Buffer) => {
      if (stdout.length + stderr.length + chunk.length > MAX_OUTPUT) stop('output_limit');
      const room = Math.max(0, MAX_OUTPUT - stdout.length - stderr.length);
      if (stream === 'stdout') stdout = Buffer.concat([stdout, chunk.subarray(0, room)]);
      else stderr = Buffer.concat([stderr, chunk.subarray(0, room)]);
    };
    child.stdout.on('data', chunk => append('stdout', chunk));
    child.stderr.on('data', chunk => append('stderr', chunk));
    child.on('error', () => { outcome = 'spawn_error'; });
    child.on('close', (exit, signal) => {
      kill(); clearTimeout(timer); process.off('SIGINT', cancel); process.off('SIGTERM', cancel);
      resolve({ exit, signal, outcome, stdout, stderr });
    });
  });
}
export async function runCompletionHook(projectDir: string, approvalId: string, role: string, event: unknown) {
  const project = await fs.realpath(projectDir);
  const receipt: ObjectValue = { schema_version: 1, id: randomUUID(), producer: 'ai-factory/completion-hook',
    observed_by: 'local-adapter', project, approval: approvalId, role, started_at: new Date().toISOString(),
    outcome: 'error', execution: null, report: null, evidence_complete: false };
  let approval: Approval | undefined;
  try {
    try { approval = JSON.parse((await read(project, `${STORE}/approval.json`)).toString('utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (!approval || approval.id !== approvalId) receipt.outcome = 'unsupported';
    else {
      const spec = specification(approval.spec);
      receipt.runtime = { name: spec.runtime, version: spec.version };
      receipt.command = { executable: spec.executable, argv: spec.argv, cwd: spec.cwd, executable_sha256: approval.executable_sha256 };
      receipt.config_sha256 = sha(json(approval));
      if (approval.project !== project || spec.role !== role) receipt.outcome = 'wrong_project_or_role';
      else if (!object(event) || event.hook_event_name !== 'Stop' || !text(event.session_id) || !event.session_id
        || typeof event.stop_hook_active !== 'boolean' || !text(event.cwd)) receipt.outcome = 'invalid_event';
      else if (event.stop_hook_active || process.env.AIF_COMPLETION_HOOK_ACTIVE) receipt.outcome = 'recursion';
      else if (await fs.realpath(event.cwd) !== project) receipt.outcome = 'wrong_cwd';
      else if (sha(await read(project, approval.spec_path)) !== approval.spec_sha256
        || json(await inputDigests(project, spec.inputs)) !== json(approval.inputs)
        || (await fingerprint(spec.executable)).sha256 !== approval.executable_sha256
        || (await fingerprint(spec.host_executable)).sha256 !== approval.host_sha256) receipt.outcome = 'changed_command';
      else if (!supported(spec)) receipt.outcome = 'unsupported';
      else {
        const before = await snapshot(project, [...spec.inputs, approval.spec_path]);
        receipt.source = before;
        if (before.head !== spec.source_revision) receipt.outcome = 'stale';
        else {
          const key = sha(json([approvalId, event.session_id]));
          try { await write(project, `${STORE}/attempts/${key}.json`, { receipt: receipt.id }, true); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; receipt.outcome = 'reentry'; }
          if (receipt.outcome !== 'reentry') {
            const cwd = spec.cwd === '.' ? project : await resolveInstructionLocalPath(project, spec.cwd);
            receipt.effective_cwd = cwd;
            const execution = await execute(spec, cwd);
            // Keep output local: receipts contain digests, never raw logs or host transcripts.
            receipt.execution = { exit: execution.exit, signal: execution.signal, outcome: execution.outcome,
              stdout_sha256: sha(execution.stdout), stderr_sha256: sha(execution.stderr),
              output_bytes: execution.stdout.length + execution.stderr.length,
              output_complete: execution.outcome === 'exited' };
            receipt.outcome = execution.outcome;
            if (execution.outcome === 'exited') {
              if (execution.signal) receipt.outcome = 'cancelled';
              else if (execution.exit !== 0) receipt.outcome = 'failed';
              else {
                try {
                  const result = report(execution.stdout.toString('utf8'));
                  receipt.report = result ? { sha256: sha(json(result)), status: result.status, blocking: result.blocking } : null;
                  receipt.outcome = !result ? 'missing_report' : result.blocking ? 'failed' : result.status === 'warn' ? 'warning' : 'passed';
                } catch { receipt.outcome = 'invalid_report'; }
              }
            }
            const after = await snapshot(project, [...spec.inputs, approval.spec_path]);
            receipt.source_after_sha256 = after.sha256;
            if (before.sha256 !== after.sha256 || sha(await read(project, `${STORE}/approval.json`)) !== sha(json(approval))
              || (await fingerprint(spec.executable)).sha256 !== approval.executable_sha256
              || (await fingerprint(spec.host_executable)).sha256 !== approval.host_sha256) receipt.outcome = 'stale';
            receipt.evidence_complete = ['passed', 'warning', 'failed'].includes(String(receipt.outcome)) && receipt.report !== null;
          }
        }
      }
    }
  } catch { receipt.outcome = 'error'; }
  receipt.finished_at = new Date().toISOString();
  const receiptPath = `${STORE}/receipts/${receipt.id}.json`;
  await write(project, receiptPath, receipt, true);
  return { outcome: String(receipt.outcome), blocking: (approval?.spec?.role === 'required' || role !== 'observer') && !['passed', 'warning'].includes(String(receipt.outcome)), receipt: receiptPath };
}
export async function inspectCompletionReceipt(projectDir: string, receiptPath: string) {
  const project = await fs.realpath(projectDir);
  const receipt = JSON.parse((await read(project, receiptPath)).toString('utf8')) as ObjectValue;
  const approval = JSON.parse((await read(project, `${STORE}/approval.json`)).toString('utf8')) as Approval;
  const current = await snapshot(project, [...approval.spec.inputs, approval.spec_path]);
  const source = receipt.source;
  const fresh = receipt.project === project && receipt.approval === approval.id && object(source) && source.sha256 === current.sha256
    && receipt.config_sha256 === sha(json(approval)) && sha(await read(project, approval.spec_path)) === approval.spec_sha256
    && json(await inputDigests(project, approval.spec.inputs)) === json(approval.inputs)
    && (await fingerprint(approval.spec.executable)).sha256 === approval.executable_sha256
    && (await fingerprint(approval.spec.host_executable)).sha256 === approval.host_sha256;
  return { status: fresh ? 'current' : 'stale', authenticity: 'not_authenticated', receipt };
}
