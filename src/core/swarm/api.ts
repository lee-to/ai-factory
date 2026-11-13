import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual, createHash } from 'node:crypto';
import { SwarmEngine, publicRun, readyTasks } from './engine.js';
import { SwarmRuntime, sourceHead } from './runtime.js';
import { digest, integer, object, parseSpec, requireValue, SwarmError, textValue, redact, type RunPageQuery } from './types.js';

function pageQuery(url: URL): RunPageQuery {
  const limit = integer(Number(url.searchParams.get('limit') ?? 20), 'limit', 1, 50);
  const search = url.searchParams.get('search') ?? '';
  requireValue(search.length <= 200, 'Search is too long');
  const status = url.searchParams.get('status') ?? '';
  requireValue(!status || ['running', 'paused', 'needs_attention', 'completed', 'failed', 'cancelled'].includes(status), 'Invalid run status');
  let cursor: RunPageQuery['cursor'];
  const encoded = url.searchParams.get('cursor');
  if (encoded) {
    requireValue(encoded.length <= 400 && /^[A-Za-z0-9_-]+$/.test(encoded), 'Invalid cursor');
    let parsed: Record<string, unknown>;
    try { parsed = object(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))); }
    catch { throw new SwarmError('Invalid cursor'); }
    const id = textValue(parsed.id, 'cursor id', 100);
    requireValue(/^[A-Za-z0-9_-]+$/.test(id), 'Invalid cursor id');
    cursor = { id, startedAt: integer(parsed.startedAt, 'cursor time', 0, Number.MAX_SAFE_INTEGER) };
  }
  return { limit, cursor, search, ...(status ? { status: status as RunPageQuery['status'] } : {}) };
}

function matches(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += chunk.length; requireValue(size <= 128 * 1024, 'Request too large'); chunks.push(Buffer.from(chunk));
  }
  return object(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
}
function send(response: ServerResponse, data: unknown, status = 200): void {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify(data, (_key, value) => typeof value === 'string' ? redact(value) : value));
}

export async function serveSwarm(engine: SwarmEngine, port: number, signal?: AbortSignal, tickMs = 1000): Promise<{ url: string; closed: Promise<void>; close(): Promise<void> }> {
  const roles = [ ['owner', process.env.AIF_SWARM_OWNER_TOKEN], ['operator', process.env.AIF_SWARM_OPERATOR_TOKEN], ['viewer', process.env.AIF_SWARM_VIEWER_TOKEN] ] as const;
  for (const [, token] of roles) requireValue(token === undefined || token.length >= 32, 'API tokens must have at least 32 characters');
  const tokens = roles.map(([, token]) => token).filter(Boolean);
  requireValue(new Set(tokens).size === tokens.length, 'API roles require distinct tokens');
  let runtime: SwarmRuntime;
  const streams = new Set<ServerResponse>();
  const server = http.createServer((request, response) => {
    void (async () => {
      requireValue(!request.headers.origin, 'Browser origins are not allowed; use the Handoff backend');
      const authorization = request.headers.authorization ?? '';
      if (!authorization.startsWith('Bearer ')) throw new SwarmError('Authentication required', 401);
      const token = authorization.slice(7);
      const agent = runtime.credentials.get(token);
      const role = agent ? 'agent' : roles.find(([, configured]) => configured && matches(token, configured))?.[0];
      if (!role) throw new SwarmError('Authentication required', 401);
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const route = url.pathname.split('/').filter(Boolean);
      requireValue(route[0] === 'v1' && route[1] === 'swarm', 'Unknown API version');
      const method = request.method;
      if (route[2] === 'project' && route.length === 3 && method === 'GET') {
        requireValue(role !== 'agent', 'Agent must use its assigned run');
        send(response, { schema_version: 1, project: engine.project }); return;
      }
      if (route[2] === 'approvals' && route[4] === 'decision' && route.length === 5 && method === 'POST') {
        requireValue(role === 'owner', 'Only the owner may decide approvals');
        const input = await body(request);
        requireValue(input.decision === 'approve' || input.decision === 'reject', 'Invalid decision');
        const runs = await engine.store.list(engine.project);
        const run = runs.find(run => run.approvals.some(approval => approval.id === route[3]));
        requireValue(run, 'Approval not found');
        await engine.decide(run.id, route[3], input.decision, role); send(response, { schema_version: 1, ok: true }); return;
      }
      requireValue(route[2] === 'runs', 'Unknown endpoint');
      if (route.length === 3) {
        requireValue(role !== 'agent', 'Agent must use its assigned run');
        if (method === 'GET') {
          if (url.searchParams.get('view') === 'summary') {
            send(response, { schema_version: 1, project: engine.project, ...await engine.store.summaries(engine.project, pageQuery(url)) }); return;
          }
          send(response, { schema_version: 1, runs: (await engine.store.list(engine.project)).map(publicRun) }); return;
        }
        requireValue(method === 'POST' && role === 'owner', 'Only the owner may create runs');
        const key = textValue(request.headers['idempotency-key'], 'Idempotency-Key', 100);
        const spec = parseSpec(await body(request));
        const id = digest({ project: engine.project, key });
        let existing;
        try { existing = await engine.get(id); }
        catch (error) { if (!(error instanceof SwarmError) || error.status !== 404) throw error; }
        if (existing) { requireValue(digest(existing.spec) === digest(spec), 'Idempotency key reused'); send(response, publicRun(existing)); return; }
        const run = await engine.create(spec, await sourceHead(engine.project), role, id);
        send(response, publicRun(run), 201); return;
      }
      const id = textValue(route[3], 'run id', 100);
      requireValue(!agent || agent.runId === id, 'Agent is bound to another run');
      if (route[4] === 'agent' && route.length === 5 && method === 'POST') {
        requireValue(agent, 'Agent authentication required');
        const input = await body(request), operation = textValue(input.method, 'method', 100), args = object(input.arguments ?? {});
        const run = await engine.get(id);
        requireValue(run.agents.some(a => a.id === agent.agentId && a.status === 'running'), 'Agent is no longer active');
        let result: unknown;
        if (operation === 'get_run_context' || operation === 'get_task_tree') {
          const context = publicRun(run);
          context.messages = context.messages.filter(m => !m.recipient || m.recipient === agent.agentId || m.sender === agent.agentId);
          result = context;
          if (operation === 'get_run_context') result = { run: result, agent_id: agent.agentId,
            task: run.tasks.find(t => t.assignedAgentId === agent.agentId && t.status === 'running') };
        } else if (operation === 'list_ready_tasks') result = readyTasks(run).map(task => ({ ...task, claimToken: undefined }));
        else if (operation === 'list_messages') result = run.messages.filter(m => !m.recipient || m.recipient === agent.agentId || m.sender === agent.agentId);
        else if (operation === 'claim_task') result = await engine.claim(id, agent.agentId);
        else if (operation === 'heartbeat') { await engine.heartbeat(id, agent.agentId,
          args.taskId === undefined ? undefined : textValue(args.taskId, 'taskId', 100),
          args.claimToken === undefined ? undefined : textValue(args.claimToken, 'claimToken', 100)); result = { ok: true }; }
        else result = await engine.agentOperation(id, agent.agentId, textValue(input.idempotencyKey, 'idempotencyKey', 100), operation, args);
        send(response, { schema_version: 1, result }); return;
      }
      requireValue(role !== 'agent', 'Agent access is limited to the agent endpoint');
      if (['pause', 'resume', 'cancel'].includes(route[4]) && route.length === 5 && method === 'POST') {
        requireValue(role === 'owner' || role === 'operator', 'Viewer cannot control runs');
        send(response, publicRun(await engine.control(id, route[4] as 'pause' | 'resume' | 'cancel', role,
          textValue(request.headers['idempotency-key'], 'Idempotency-Key', 100)))); return;
      }
      requireValue(method === 'GET', 'Unsupported method');
      if (route.length === 4) { send(response, publicRun(await engine.get(id))); return; }
      if (route[4] === 'events' && (route.length === 5 || route[5] === 'stream' && route.length === 6)) {
        const after = integer(Number(url.searchParams.get('after') ?? request.headers['last-event-id'] ?? 0), 'after sequence', 0, Number.MAX_SAFE_INTEGER);
        if (route.length === 5) { send(response, { schema_version: 1, events: await engine.store.events(engine.project, id, after) }); return; }
        await engine.get(id);
        response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        streams.add(response); let cursor = after, busy = false;
        response.write(': connected\n\n');
        const poll = setInterval(() => {
          if (busy) return; busy = true;
          void engine.store.events(engine.project, id, cursor).then(events => {
            for (const event of events) {
              if (response.destroyed) return;
              if (!response.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)) { response.end(); return; }
              cursor = event.sequence;
            }
            if (!events.length) response.write(': heartbeat\n\n');
          }).catch(() => response.end()).finally(() => { busy = false; });
        }, 500);
        response.on('close', () => { clearInterval(poll); streams.delete(response); }); return;
      }
      const run = publicRun(await engine.get(id));
      requireValue(route.length === 5 && ['tasks', 'agents', 'artifacts'].includes(route[4]), 'Unknown endpoint');
      send(response, { schema_version: 1, [route[4]]: run[route[4] as 'tasks' | 'agents' | 'artifacts'] });
    })().catch(error => {
      if (response.headersSent) response.end();
      else send(response, { schema_version: 1, error: error instanceof SwarmError ? error.message : 'Runtime operation failed' }, error instanceof SwarmError ? error.status : 500);
    });
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000;
  const closed = new Promise<void>(resolve => server.once('close', () => resolve()));
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const address = server.address(); requireValue(address && typeof address !== 'string', 'Runtime could not bind');
  const url = `http://127.0.0.1:${address.port}`;
  runtime = new SwarmRuntime(engine, url);
  try { await runtime.start(); } catch (error) { await new Promise<void>(resolve => server.close(() => resolve())); throw error; }
  let ticking = false;
  let tickWork: Promise<void> = Promise.resolve();
  const timer = setInterval(() => {
    if (ticking) return; ticking = true;
    tickWork = runtime.tick().catch(() => { queueMicrotask(() => { void close(); }); }).finally(() => { ticking = false; });
  }, tickMs);
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => closing ??= (async () => {
    clearInterval(timer); signal?.removeEventListener('abort', onAbort);
    streams.forEach(stream => stream.end());
    await tickWork;
    await runtime.stop();
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeIdleConnections(); });
  })();
  const onAbort = () => { void close(); };
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) await close();
  return { url, closed, close };
}
