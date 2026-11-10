import { SwarmStore } from './store.js';
import { loadSwarmContext } from './context.js';
import { type Run, type SwarmSpec, type SwarmEvent, type Task, type TaskInput, type Agent, type Role, type Provider,
  uid, digest, requireValue, redact, terminal, SwarmError, parseTask, integer, textValue } from './types.js';

export function emit(run: Run, events: SwarmEvent[], type: string, actor: string, payload: Record<string, unknown> = {}): void {
  const safe = JSON.parse(JSON.stringify(payload, (_key, value) => typeof value === 'string' ? redact(value) : value));
  events.push({ event_id: uid(), sequence: ++run.sequence, run_id: run.id, type, timestamp: new Date().toISOString(),
    actor, payload: safe, schema_version: 1 });
}
export function readyTasks(run: Run): Task[] {
  return run.tasks.filter(task => task.status === 'pending' && task.dependsOn.every(id => run.tasks.some(t => t.id === id && t.status === 'done'))
    && (!task.parentId || run.tasks.some(t => t.id === task.parentId && !['failed', 'cancelled', 'blocked'].includes(t.status))))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}
function validateGraph(run: Run): void {
  const visited = new Set<string>(), visiting = new Set<string>();
  const visit = (id: string) => {
    requireValue(!visiting.has(id), 'Task graph contains a cycle');
    if (visited.has(id)) return;
    const task = run.tasks.find(t => t.id === id);
    requireValue(task, 'Dependency is outside this run');
    visiting.add(id);
    // Parent completion waits for children; dependency and ancestry cycles both block completion.
    for (const dependency of [...task.dependsOn, ...run.tasks.filter(t => t.parentId === id).map(t => t.id)]) visit(dependency);
    visiting.delete(id); visited.add(id);
  };
  run.tasks.forEach(task => visit(task.id));
}
function add(run: Run, input: TaskInput, id = uid()): Task {
  requireValue(run.tasks.length < run.spec.limits.maxTasks, 'Task count limit reached');
  const parent = input.parentId ? run.tasks.find(t => t.id === input.parentId) : undefined;
  requireValue(!input.parentId || parent, 'Parent is outside this run');
  const depth = parent ? parent.depth + 1 : 0;
  requireValue(depth <= run.spec.limits.maxDepth, 'Task depth limit reached');
  const task: Task = { ...input, id, depth, priority: input.priority ?? 0, dependsOn: input.dependsOn ?? [], status: 'pending', attempts: 0 };
  run.tasks.push(task);
  return task;
}
function ownedTask(run: Run, agentId: string, taskId: string, token: string): Task {
  const task = run.tasks.find(t => t.id === taskId);
  requireValue(task && task.assignedAgentId === agentId && task.claimToken === token &&
    task.leaseUntil && task.leaseUntil > Date.now() && ['running', 'submitted'].includes(task.status), 'Stale or foreign task lease');
  return task;
}
function settleParents(run: Run, events: SwarmEvent[]): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of run.tasks) {
      if (task.status === 'integrated' && run.tasks.filter(t => t.parentId === task.id).every(t => t.status === 'done')) {
        task.status = 'done'; changed = true;
        emit(run, events, 'task.done', 'integration', { task_id: task.id, git_ref: task.integratedRef });
      }
    }
  }
}

export class SwarmEngine {
  constructor(readonly store: SwarmStore, readonly project: string) {}

  async create(spec: SwarmSpec, baseRef: string, actor = 'owner', id: string = uid()): Promise<Run> {
    const run: Run = { schema_version: 1, id, project: this.project, goal: spec.goal, spec,
      baseRef, integrationRef: baseRef, status: 'running', startedAt: Date.now(), tasks: [], agents: [], approvals: [],
      artifacts: [], messages: [], tokens: 0, reservedTokens: 0, sequence: 0, planned: false, operations: {},
      context: await loadSwarmContext(this.project) };
    const events: SwarmEvent[] = [];
    emit(run, events, 'run.started', actor, { goal: spec.goal, base_ref: baseRef });
    return this.store.create(run, events[0]);
  }
  get(id: string): Promise<Run> { return this.store.get(this.project, id); }
  async control(id: string, action: 'pause' | 'resume' | 'cancel', actor = 'owner', key?: string): Promise<Run> {
    return this.store.mutate(this.project, id, (run, events) => {
      const operationKey = key ? `control:${actor}:${key}` : undefined;
      if (operationKey && run.operations[operationKey]) {
        requireValue(run.operations[operationKey].hash === digest(action), 'Idempotency key reused'); return run;
      }
      requireValue(!terminal(run.status), 'Run is already terminal');
      requireValue(action !== 'resume' || ['paused', 'needs_attention'].includes(run.status), 'Run is not paused');
      run.status = action === 'pause' ? 'paused' : action === 'resume' ? 'running' : 'cancelled';
      if (action === 'cancel') {
        run.finishedAt = Date.now();
        for (const task of run.tasks) if (task.status !== 'done') task.status = 'cancelled';
      }
      emit(run, events, `run.${action === 'pause' ? 'paused' : action === 'resume' ? 'resumed' : 'cancelled'}`, actor);
      if (operationKey) run.operations[operationKey] = { hash: digest(action), result: { ok: true } };
      return run;
    });
  }
  async attention(id: string, reason: string): Promise<void> {
    await this.store.mutate(this.project, id, (run, events) => {
      if (terminal(run.status) || run.status === 'needs_attention') return;
      run.status = 'needs_attention';
      emit(run, events, 'run.needs_attention', 'runtime', { reason });
    });
  }
  async plan(id: string, agentId: string, inputs: unknown[]): Promise<void> {
    await this.store.mutate(this.project, id, (run, events) => {
      requireValue(!run.planned && run.status === 'running', 'Plan already set or run is not running');
      requireValue(run.agents.some(a => a.id === agentId && a.role === 'lead'), 'Only this run\'s lead can plan');
      requireValue(Array.isArray(inputs) && inputs.length > 0, 'Lead returned no tasks');
      const ids = inputs.map(() => uid());
      // Plan dependencies use zero-based indexes; persisted references always use stable task UUIDs.
      inputs.forEach((input, index) => {
        const raw = input as Record<string, unknown>;
        const deps = raw.dependsOn ?? [];
        requireValue(Array.isArray(deps), 'Invalid plan dependencies');
        const mapped = deps.map(dep => ids[integer(dep, 'dependency index', 0, inputs.length - 1)]);
        requireValue(raw.parentId === undefined, 'Initial plan tasks are roots; create subtasks through the runtime');
        add(run, parseTask({ ...raw, dependsOn: mapped }), ids[index]);
      });
      validateGraph(run); run.planned = true;
      for (const task of run.tasks) emit(run, events, 'task.created', agentId, { task_id: task.id, title: task.title, depends_on: task.dependsOn });
      emit(run, events, 'run.planned', agentId, { tasks: run.tasks.length });
      if (run.spec.approval === 'manual') run.status = 'paused';
    });
  }
  async register(id: string, role: Role, provider: Provider): Promise<Agent | null> {
    return this.store.mutate(this.project, id, (run, events) => {
      if (run.status !== 'running') return null;
      const l = run.spec.limits;
      if (run.agents.filter(a => a.status === 'running').length >= l.maxAgents) return null;
      if (run.tokens + run.reservedTokens + l.tokensPerAttempt > l.budgetTokens) {
        run.status = 'needs_attention'; emit(run, events, 'budget.exhausted', 'runtime'); return null;
      }
      const agent: Agent = { ...provider, id: uid(), role, status: 'running', heartbeatAt: Date.now(), tokens: 0, reservation: l.tokensPerAttempt };
      run.agents.push(agent); run.reservedTokens += agent.reservation;
      emit(run, events, 'agent.started', 'runtime', { agent_id: agent.id, role, provider: provider.provider, model: provider.model });
      return agent;
    });
  }
  async finishAgent(id: string, agentId: string, tokens?: number): Promise<void> {
    await this.store.mutate(this.project, id, (run, events) => {
      const agent = run.agents.find(a => a.id === agentId);
      if (!agent || agent.status === 'stopped') return;
      const known = Number.isSafeInteger(tokens) && Number(tokens) >= 0;
      agent.tokens = known ? tokens! : agent.reservation;
      run.reservedTokens -= agent.reservation; run.tokens += agent.tokens; agent.reservation = 0; agent.status = 'stopped';
      emit(run, events, 'agent.stopped', 'runtime', { agent_id: agentId, tokens: agent.tokens, telemetry: known ? 'observed' : 'reservation' });
      if (!terminal(run.status) && (!known || run.tokens > run.spec.limits.budgetTokens)) {
        run.status = 'needs_attention'; emit(run, events, 'budget.needs_attention', 'runtime', { reason: known ? 'Token ceiling exceeded' : 'Provider token telemetry unavailable' });
      }
    });
  }
  async claim(id: string, agentId: string): Promise<Task | null> {
    return this.store.mutate(this.project, id, (run, events) => {
      if (run.status !== 'running') return null;
      const agent = run.agents.find(a => a.id === agentId && a.role === 'worker' && a.status === 'running');
      requireValue(agent && !agent.currentTaskId, 'Agent cannot claim another task');
      const task = readyTasks(run)[0];
      if (!task) return null;
      task.status = 'running'; task.attempts++; task.assignedAgentId = agentId;
      task.claimToken = uid(); task.leaseUntil = Date.now() + run.spec.limits.leaseMs; task.baseRef = run.integrationRef;
      agent.currentTaskId = task.id;
      emit(run, events, 'task.claimed', agentId, { task_id: task.id, attempt: task.attempts });
      return task;
    });
  }
  async heartbeat(id: string, agentId: string, taskId?: string, token?: string): Promise<void> {
    await this.store.mutate(this.project, id, run => {
      requireValue(!terminal(run.status), 'Run is terminal');
      const agent = run.agents.find(a => a.id === agentId && a.status === 'running');
      requireValue(agent, 'Agent is not active'); agent.heartbeatAt = Date.now();
      if (taskId) ownedTask(run, agentId, taskId, token ?? '').leaseUntil = Date.now() + run.spec.limits.leaseMs;
    });
  }
  async agentOperation(id: string, agentId: string, key: string, method: string, args: Record<string, unknown>, finalResult = false): Promise<unknown> {
    textValue(key, 'idempotency key', 100);
    return this.store.mutate(this.project, id, (run, events) => {
      const agent = run.agents.find(a => a.id === agentId && (a.status === 'running' || finalResult && ['submit_result', 'report_blocker'].includes(method)));
      requireValue(agent && !terminal(run.status), 'Inactive agent or terminal run');
      const operationKey = `${agentId}:${key}`, hash = digest({ method, args });
      const previous = run.operations[operationKey];
      if (previous) { requireValue(previous.hash === hash, 'Idempotency key reused with different input'); return previous.result; }
      requireValue(Object.keys(run.operations).length < 5000, 'Operation limit reached');
      let result: unknown = null;
      if (method === 'create_subtask') {
        const parentId = textValue(args.parentId, 'parentId', 100);
        requireValue(agent.role === 'worker', 'Only workers create subtasks');
        ownedTask(run, agentId, parentId, String(args.claimToken));
        const task = add(run, parseTask({ ...args, parentId })); validateGraph(run);
        emit(run, events, 'task.created', agentId, { task_id: task.id, parent_id: parentId, title: task.title }); result = task;
      } else if (method === 'submit_result' || method === 'report_blocker') {
        requireValue(agent.role === 'worker', 'Only workers submit task results');
        const task = ownedTask(run, agentId, String(args.taskId), String(args.claimToken));
        task.report = redact(textValue(args.report, 'report'));
        if (method === 'submit_result') {
          requireValue(task.status === 'running', 'Task already submitted');
          const ref = textValue(args.gitRef, 'gitRef', 64);
          requireValue(/^[a-f0-9]{40,64}$/.test(ref), 'Expected an immutable commit hash');
          task.gitRef = ref; task.status = 'submitted';
        } else task.status = 'blocked';
        emit(run, events, method === 'submit_result' ? 'task.submitted' : 'task.blocked', agentId, { task_id: task.id, report: task.report, git_ref: task.gitRef });
        result = task;
      } else if (method === 'send_message') {
        requireValue(run.messages.length < 2000, 'Message limit reached');
        const recipient = args.recipient === undefined ? undefined : textValue(args.recipient, 'recipient', 100);
        requireValue(!recipient || run.agents.some(a => a.id === recipient), 'Recipient is outside this run');
        const message = { id: uid(), sender: agentId, recipient, topic: redact(textValue(args.topic, 'topic', 200)), body: redact(textValue(args.body, 'body')) };
        run.messages.push(message); emit(run, events, 'message.sent', agentId, { message_id: message.id, recipient, topic: message.topic }); result = message;
      } else throw new SwarmError('Unknown agent operation');
      run.operations[operationKey] = { hash, result: structuredClone(result) };
      return result;
    });
  }
  async recover(id: string): Promise<void> {
    await this.store.mutate(this.project, id, (run, events) => {
      if (terminal(run.status)) return;
      for (const task of run.tasks) {
        if (task.status === 'running' && (task.leaseUntil ?? 0) <= Date.now()) {
          task.status = task.attempts >= run.spec.limits.maxAttempts ? 'failed' : 'pending';
          delete task.claimToken; delete task.leaseUntil; delete task.assignedAgentId;
          emit(run, events, 'task.lease_expired', 'runtime', { task_id: task.id, status: task.status });
        }
      }
      if (run.status !== 'needs_attention' && !run.approvals.some(a => a.kind === 'completion' && a.status === 'pending') &&
        Date.now() - run.startedAt >= run.spec.limits.runTimeoutMs) {
        run.status = 'needs_attention'; emit(run, events, 'run.time_limit', 'runtime');
      }
      if (run.status !== 'needs_attention' && run.tasks.some(t => t.status === 'failed')) {
        run.status = 'needs_attention'; emit(run, events, 'run.needs_attention', 'runtime', { reason: 'Task attempt limit reached' });
      }
    });
  }
  async retry(id: string, taskId: string, reason: string): Promise<void> {
    await this.store.mutate(this.project, id, (run, events) => {
      requireValue(!terminal(run.status), 'Run is terminal');
      const task = run.tasks.find(t => t.id === taskId);
      requireValue(task && task.status === 'blocked' && task.attempts < run.spec.limits.maxAttempts, 'Only blocked tasks within their attempt limit can retry');
      task.status = 'pending'; task.report = redact(textValue(reason, 'retry reason'));
      delete task.claimToken; delete task.assignedAgentId; delete task.gitRef;
      emit(run, events, 'task.retry_requested', 'owner', { task_id: taskId, reason: task.report });
    });
  }
  async integration(id: string, taskId: string, ref: string | null, report: string): Promise<void> {
    await this.store.mutate(this.project, id, (run, events) => {
      requireValue(!terminal(run.status), 'Run is terminal');
      const task = run.tasks.find(t => t.id === taskId);
      requireValue(task && task.status === 'verifying', 'Task is not being verified');
      if (ref) {
        task.status = 'integrated'; task.integratedRef = ref; run.integrationRef = ref;
        run.artifacts.push({ id: uid(), taskId, type: 'integration', git_ref: ref, metadata: { checks: 'pass', report: redact(report) } });
        emit(run, events, 'task.integrated', 'integration', { task_id: taskId, git_ref: ref });
        settleParents(run, events);
      } else {
        task.status = task.attempts >= run.spec.limits.maxAttempts ? 'failed' : 'pending';
        task.report = redact(report); delete task.gitRef; delete task.claimToken; delete task.assignedAgentId;
        emit(run, events, 'integration.failed', 'integration', { task_id: taskId, reason: task.report });
      }
    });
  }
  async prepareIntegration(id: string): Promise<Task | null> {
    return this.store.mutate(this.project, id, (run, events) => {
      if (run.status !== 'running') return null;
      const task = run.tasks.find(t => t.status === 'submitted' && !run.approvals.some(a => a.taskId === t.id && a.gitRef === t.gitRef && a.status === 'pending'));
      if (!task) return null;
      if (run.spec.approval !== 'restricted-actions') {
        let approval = run.approvals.find(a => a.taskId === task.id && a.gitRef === task.gitRef);
        if (!approval) {
          approval = { id: uid(), taskId: task.id, gitRef: task.gitRef!, kind: 'integration', status: 'pending' };
          run.approvals.push(approval); emit(run, events, 'approval.requested', 'integration', { ...approval });
        }
        if (approval.status === 'rejected') { task.status = 'blocked'; return null; }
        if (approval.status !== 'approved') return null;
      }
      task.status = 'verifying'; emit(run, events, 'task.verifying', 'integration', { task_id: task.id }); return task;
    });
  }
  async decide(id: string, approvalId: string, decision: 'approve' | 'reject', actor: string): Promise<void> {
    await this.store.mutate(this.project, id, (run, events) => {
      requireValue(!terminal(run.status), 'Run is terminal');
      const approval = run.approvals.find(a => a.id === approvalId);
      requireValue(approval, 'Approval not found');
      if (approval.status === (decision === 'approve' ? 'approved' : 'rejected')) return;
      requireValue(approval.status === 'pending', 'Approval is not pending');
      approval.status = decision === 'approve' ? 'approved' : 'rejected';
      emit(run, events, 'approval.decided', actor, { approval_id: approvalId, decision, git_ref: approval.gitRef });
      if (approval.kind === 'completion') {
        requireValue(run.status === 'running' && run.agents.every(a => a.status !== 'running') &&
          approval.gitRef === run.integrationRef && run.tasks.every(t => t.status === 'done'), 'Completion approval is stale or run needs attention');
        run.status = decision === 'approve' ? 'completed' : 'needs_attention';
        if (run.status === 'completed') run.finishedAt = Date.now();
        emit(run, events, `run.${run.status}`, actor, { git_ref: run.integrationRef });
      }
    });
  }
  async complete(id: string, accepted: boolean, report: string): Promise<void> {
    await this.store.mutate(this.project, id, (run, events) => {
      requireValue(run.status === 'running' && run.planned && run.tasks.length && run.tasks.every(t => t.status === 'done'), 'Tasks are incomplete');
      run.artifacts.push({ id: uid(), type: 'verification', git_ref: run.integrationRef, metadata: { accepted, report: redact(report) } });
      if (!accepted) { run.status = 'needs_attention'; emit(run, events, 'verification.failed', 'verifier', { report: redact(report) }); return; }
      if (run.approvals.some(a => a.kind === 'completion' && a.gitRef === run.integrationRef)) return;
      const approval = { id: uid(), gitRef: run.integrationRef, kind: 'completion' as const, status: 'pending' as const };
      run.approvals.push(approval); emit(run, events, 'approval.requested', 'verifier', { ...approval });
    });
  }
}

export function publicRun(run: Run): Omit<Run, 'operations' | 'context'> & { context: { path: string; sha256: string }[] } {
  const { operations: _operations, context, ...copy } = structuredClone(run);
  copy.tasks.forEach(task => { delete task.claimToken; });
  return { ...copy, context: context.map(({ path, sha256 }) => ({ path, sha256 })) };
}
