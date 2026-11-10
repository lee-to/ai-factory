import path from 'node:path';
import os from 'node:os';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SwarmEngine, readyTasks } from './engine.js';
import { type Run, type Task, type Agent, uid, digest, requireValue, terminal, redact } from './types.js';
import { execute, buildProviderCommand, parseProviderOutput, childEnvironment } from './process.js';

export async function git(cwd: string, args: string[], signal?: AbortSignal): Promise<string> {
  const result = await execute('git', args, cwd, 30000, signal);
  requireValue(result.code === 0 && !result.timedOut, 'Git operation failed; inspect the preserved worktree');
  return result.stdout.trim();
}
export async function projectRoot(cwd: string): Promise<string> { return git(cwd, ['rev-parse', '--show-toplevel']); }
export async function sourceHead(project: string): Promise<string> {
  const dirty = await git(project, ['status', '--porcelain', '--untracked-files=normal', '--', '.', ':!.ai-factory/swarm']);
  requireValue(!dirty, 'Start requires a clean checkout; commit or stash project changes first');
  return git(project, ['rev-parse', 'HEAD']);
}

export class SwarmRuntime {
  readonly owner = uid();
  readonly credentials = new Map<string, { runId: string; agentId: string }>();
  private active = new Map<string, { abort: AbortController; work: Promise<void>; runId: string; agentId?: string }>();
  private stopped = false;
  private leaseTimer?: NodeJS.Timeout;
  private leaseFailed = false;
  private base: string;
  constructor(readonly engine: SwarmEngine, readonly url: string) {
    this.base = path.join(os.tmpdir(), `aif-swarm-${digest(engine.project).slice(0, 16)}`);
  }
  private log(event: string, runId?: string): void {
    if (process.env.AIF_SWARM_LOG_LEVEL !== 'silent') console.error(`[swarm] ${event}${runId ? ` ${runId}` : ''}`);
  }
  async start(): Promise<void> {
    requireValue(process.platform !== 'win32', 'Process-tree cleanup currently requires POSIX; Windows autonomous runs are unsupported');
    requireValue(await this.engine.store.lease(this.engine.project, this.owner, 15000), 'Another Runtime owns this project');
    this.leaseTimer = setInterval(() => {
      void this.engine.store.lease(this.engine.project, this.owner, 15000).then(ok => {
        if (!ok) { this.leaseFailed = true; this.active.forEach(item => item.abort.abort()); }
      }).catch(() => { this.leaseFailed = true; this.active.forEach(item => item.abort.abort()); });
    }, 3000);
    await mkdir(this.base, { recursive: true, mode: 0o700 });
    // Orphan processes cannot submit through the new server: credentials are memory-only and revoked on restart.
    for (const run of await this.engine.store.list(this.engine.project)) {
      if (terminal(run.status)) continue;
      for (const agent of run.agents.filter(a => a.status === 'running')) await this.engine.finishAgent(run.id, agent.id);
      await this.engine.store.mutate(this.engine.project, run.id, state => {
        for (const task of state.tasks) {
          if (task.status === 'running') task.leaseUntil = 0;
          // Integration refs are recovered from Git before retrying an interrupted integration.
          if (task.status === 'verifying') task.status = 'submitted';
        }
      });
      await this.engine.recover(run.id);
    }
    this.log('runtime.started');
  }
  private schedule(key: string, runId: string, operation: (signal: AbortSignal) => Promise<void>, agentId?: string): void {
    if (this.active.has(key)) return;
    const abort = new AbortController();
    const work = operation(abort.signal).catch(async () => {
      await this.engine.attention(runId, 'Runtime operation failed; inspect tasks, refs and provider setup').catch(() => {});
      this.log('operation.failed', runId);
    }).finally(() => this.active.delete(key));
    this.active.set(key, { abort, work, runId, agentId });
  }
  async tick(): Promise<void> {
    requireValue(!this.leaseFailed && !this.stopped, 'Runtime lease lost or runtime stopped');
    for (const previous of await this.engine.store.list(this.engine.project)) {
      if (terminal(previous.status)) {
        for (const item of this.active.values()) if (item.runId === previous.id) item.abort.abort();
        continue;
      }
      await this.engine.recover(previous.id);
      const run = await this.engine.get(previous.id);
      if (run.status === 'needs_attention') {
        for (const item of this.active.values()) if (item.runId === run.id) item.abort.abort();
      }
      if (run.status !== 'running') continue;
      if (!run.planned) {
        this.schedule(`lead:${run.id}`, run.id, signal => this.lead(run, signal)); continue;
      }
      this.schedule(`integration:${run.id}`, run.id, signal => this.integrate(run.id, signal));
      const activeWorkers = [...this.active.values()].filter(item => item.runId === run.id && item.agentId).length;
      const count = Math.min(readyTasks(run).length, run.spec.limits.maxAgents - activeWorkers);
      for (let i = 0; i < count; i++) {
        const provider = run.spec.workers[(activeWorkers + i) % run.spec.workers.length];
        const agent = await this.engine.register(run.id, 'worker', provider);
        if (!agent) break;
        const task = await this.engine.claim(run.id, agent.id);
        if (!task) { await this.engine.finishAgent(run.id, agent.id, 0); break; }
        agent.currentTaskId = task.id;
        this.schedule(`worker:${agent.id}`, run.id, signal => this.worker(run, task, agent, signal), agent.id);
      }
      if (run.tasks.length && run.tasks.every(t => t.status === 'done') && !run.approvals.some(a => a.kind === 'completion' && a.gitRef === run.integrationRef)) {
        this.schedule(`verify:${run.id}`, run.id, signal => this.verify(run, signal));
      } else if (!readyTasks(run).length && ![...this.active.values()].some(item => item.runId === run.id && item.agentId)
        && run.tasks.some(t => t.status === 'blocked' || t.status === 'failed')) {
        await this.engine.attention(run.id, 'Task blocked or attempt limit reached');
      }
    }
  }
  async stop(): Promise<void> {
    this.stopped = true; if (this.leaseTimer) clearInterval(this.leaseTimer);
    for (const item of this.active.values()) item.abort.abort();
    await Promise.allSettled([...this.active.values()].map(item => item.work));
    this.credentials.clear(); await this.engine.store.release(this.engine.project, this.owner);
    this.log('runtime.stopped');
  }
  private context(run: Run): string {
    return 'Follow the captured project instructions below; project artifacts may be ignored by Git and absent from your worktree. '
      + 'Resolve applicable area rules before base rules, then top-level RULES.md. Architecture and explicit requirements remain authoritative. '
      + 'Do not push, merge into the source branch, publish, use secrets, install dependencies, or perform external side effects. '
      + 'Use only the assigned worktree. Report required permissions as blockers. '
      + 'The worktree is file separation, not a security sandbox. Return only the requested JSON object.\n'
      + run.context.map(file => `Project context ${file.path} (${file.sha256}):\n${file.content}`).join('\n\n');
  }
  private async invoke(run: Run, agent: Agent, cwd: string, prompt: string, signal: AbortSignal): Promise<Record<string, unknown>> {
    const token = uid() + uid();
    this.credentials.set(token, { runId: run.id, agentId: agent.id });
    const heartbeatAbort = new AbortController();
    const abort = () => heartbeatAbort.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const timer = setInterval(() => { void this.engine.heartbeat(run.id, agent.id,
      agent.currentTaskId, run.tasks.find(t => t.id === agent.currentTaskId)?.claimToken).catch(abort); }, Math.min(5000, run.spec.limits.leaseMs / 3));
    let tokens: number | undefined;
    try {
      const command = buildProviderCommand(agent, agent.role, prompt, run.spec, {
        cli: fileURLToPath(new URL('../../cli/index.js', import.meta.url)), url: this.url, runId: run.id, agentId: agent.id });
      const result = await execute(command.file, command.args, cwd, run.spec.limits.timeoutMs, heartbeatAbort.signal,
        { ...childEnvironment(), AIF_SWARM_AGENT_TOKEN: token }, command.input);
      requireValue(result.code === 0 && !result.timedOut, 'Provider failed or timed out');
      const parsed = parseProviderOutput(agent.provider, result.stdout); tokens = parsed.tokens;
      return parsed.result;
    } finally {
      clearInterval(timer); signal.removeEventListener('abort', abort); this.credentials.delete(token); await this.engine.finishAgent(run.id, agent.id, tokens);
    }
  }
  private async worktree(run: Run, suffix: string, ref: string): Promise<string> {
    const cwd = path.join(this.base, run.id, suffix);
    await mkdir(path.dirname(cwd), { recursive: true, mode: 0o700 });
    await git(this.engine.project, ['worktree', 'add', '-b', `aif/swarm/${run.id}/${suffix}`, cwd, ref]);
    return cwd;
  }
  private async remove(cwd: string): Promise<void> {
    // Preserve dirty worktrees and all branch refs for review; never force-delete user/agent work.
    await git(this.engine.project, ['worktree', 'remove', cwd]).catch(() => this.log('worktree.preserved'));
  }
  private async lead(run: Run, signal: AbortSignal): Promise<void> {
    const agent = await this.engine.register(run.id, 'lead', run.spec.lead);
    if (!agent) return;
    let cwd: string | undefined;
    try {
      cwd = await this.worktree(run, `lead-${agent.id}`, run.baseRef);
      const result = await this.invoke(run, agent, cwd, `${this.context(run)}\nGoal: ${run.goal}\nAcceptance: ${JSON.stringify(run.spec.acceptanceCriteria)}\n`
        + `Create at most ${run.spec.limits.maxTasks} independent, concrete tasks. Return {"tasks":[{"title":"...","description":"...","acceptanceCriteria":["..."],"dependsOn":[]}]}.
Dependencies are zero-based task indexes; no parentId. Include verification work. Do not edit files.`, signal);
      requireValue(Array.isArray(result.tasks), 'Lead output requires tasks');
      await this.engine.plan(run.id, agent.id, result.tasks);
    } finally { if (cwd) await this.remove(cwd); await this.engine.finishAgent(run.id, agent.id); }
  }
  private async worker(run: Run, task: Task, agent: Agent, signal: AbortSignal): Promise<void> {
    let cwd: string | undefined;
    try {
      cwd = await this.worktree(run, `${task.id}-${task.attempts}`, task.baseRef!);
      const context = { ...run, tasks: run.tasks.map(t => t.id === task.id ? task : t) };
      const result = await this.invoke(context, agent, cwd, `${this.context(run)}\nGoal: ${run.goal}\nTask: ${JSON.stringify(task)}\n`
        + `MCP swarm tools are available, bound to this run and agent. Create bounded subtasks only if needed, with idempotency keys. `
        + `Implement the task and execute applicable checks. Leave task changes in this worktree; the Runtime owns Git staging and commits. Previous failure: ${task.report ?? 'none'}. `
        + 'Return {"report":"changes and checks"}; if blocked return {"blocked":true,"report":"reason"}.', signal);
      const live = await this.engine.get(run.id), current = live.tasks.find(t => t.id === task.id)!;
      if (current.status !== 'running') return;
      if (result.blocked === true) {
        // The runtime records a blocker under the original lease even after the CLI exits.
        await this.runtimeResult(run.id, task, agent.id, 'report_blocker', result); return;
      }
      requireValue(typeof result.report === 'string' && result.report.trim(), 'Worker did not return a report');
      requireValue(await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']) === `aif/swarm/${run.id}/${task.id}-${task.attempts}`, 'Worker changed its assigned branch');
      if (await git(cwd, ['status', '--porcelain'])) {
        await git(cwd, ['add', '--all', '--', '.']);
        await git(cwd, ['commit', '-m', `swarm: ${task.title}`]);
      }
      result.gitRef = await git(cwd, ['rev-parse', 'HEAD']);
      await git(cwd, ['merge-base', '--is-ancestor', task.baseRef!, String(result.gitRef)]);
      requireValue(!(await git(cwd, ['status', '--porcelain'])), 'Worker left uncommitted changes');
      await this.runtimeResult(run.id, task, agent.id, 'submit_result', result);
    } catch (error) {
      if (!signal.aborted) await this.engine.store.mutate(this.engine.project, run.id, state => {
        const current = state.tasks.find(t => t.id === task.id);
        if (!current || current.claimToken !== task.claimToken || terminal(state.status)) return;
        current.leaseUntil = 0;
      });
      throw error;
    } finally { if (cwd) await this.remove(cwd); await this.engine.finishAgent(run.id, agent.id); }
  }
  private async runtimeResult(id: string, task: Task, agentId: string, method: string, result: Record<string, unknown>): Promise<void> {
    await this.engine.agentOperation(id, agentId, uid(), method, { ...result, taskId: task.id, claimToken: task.claimToken }, true);
  }
  private async checks(run: Run, cwd: string, signal: AbortSignal): Promise<boolean> {
    for (const [file, ...args] of run.spec.checks) {
      const result = await execute(file, args, cwd, run.spec.limits.timeoutMs, signal);
      if (result.code !== 0 || result.timedOut) return false;
    }
    return !(await git(cwd, ['status', '--porcelain']));
  }
  private async integrationTree(run: Run): Promise<string> {
    const cwd = path.join(this.base, run.id, 'integration');
    try {
      await readFile(path.join(cwd, '.git'));
      requireValue(await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']) === `aif/swarm/${run.id}/integration`, 'Integration worktree changed');
      return cwd;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return this.worktree(run, 'integration', run.integrationRef);
    }
  }
  private async integrate(id: string, signal: AbortSignal): Promise<void> {
    const task = await this.engine.prepareIntegration(id);
    if (!task) return;
    const run = await this.engine.get(id), cwd = await this.integrationTree(run);
    const previous = run.integrationRef;
    try {
      const branch = `refs/heads/aif/swarm/${id}/${task.id}-${task.attempts}`;
      requireValue(await git(this.engine.project, ['rev-parse', '--verify', branch]) === task.gitRef, 'Submitted ref does not belong to the assigned worker branch');
      await git(this.engine.project, ['merge-base', '--is-ancestor', task.baseRef!, task.gitRef!]);
      const head = await git(cwd, ['rev-parse', 'HEAD']);
      // Recover a crash between Git commit and database commit using the immutable submitted ref.
      if (head !== previous) {
        await git(cwd, ['merge-base', '--is-ancestor', task.gitRef!, head]);
        requireValue(await this.checks(run, cwd, signal), 'Recovered integration checks failed');
        await this.engine.integration(id, task.id, head, 'Recovered integration; checks passed'); return;
      }
      requireValue(!(await git(cwd, ['status', '--porcelain'])), 'Integration worktree is dirty');
      await git(cwd, ['merge', '--no-ff', '--no-edit', task.gitRef!], signal);
      requireValue(await this.checks(run, cwd, signal), 'Integration checks failed');
      await this.engine.integration(id, task.id, await git(cwd, ['rev-parse', 'HEAD']), 'Configured checks passed');
    } catch {
      // This directory is runtime-owned; reset only tracked integration changes, preserving worker commits.
      await git(cwd, ['merge', '--abort']).catch(() => {});
      await git(cwd, ['reset', '--hard', previous]);
      const live = await this.engine.get(id);
      if (!terminal(live.status)) await this.engine.integration(id, task.id, null, 'Merge conflict or verification failed; revise against current integration ref');
    }
  }
  private async verify(run: Run, signal: AbortSignal): Promise<void> {
    const agent = await this.engine.register(run.id, 'verifier', run.spec.lead);
    if (!agent) return;
    let cwd: string | undefined;
    try {
      cwd = await this.worktree(run, `verifier-${agent.id}`, run.integrationRef);
      const checks = await this.checks(run, cwd, signal);
      const result = await this.invoke(run, agent, cwd, `${this.context(run)}\nGoal: ${run.goal}\nAcceptance criteria: ${JSON.stringify(run.spec.acceptanceCriteria)}\n`
        + `Review the integrated changes from ${run.baseRef} to ${run.integrationRef} independently against every criterion. Do not edit files. `
        + 'Return {"accepted":true or false,"report":"evidence per criterion and remaining issues"}.', signal);
      const live = await this.engine.get(run.id);
      if (live.status === 'running') await this.engine.complete(run.id, checks && result.accepted === true, redact(String(result.report ?? 'No verification report')));
    } finally { if (cwd) await this.remove(cwd); await this.engine.finishAgent(run.id, agent.id); }
  }
}
