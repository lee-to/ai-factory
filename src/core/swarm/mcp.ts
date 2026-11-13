import { requireValue } from './types.js';

const schemas = {
  get_run_context: {}, list_ready_tasks: {}, claim_task: {},
  heartbeat: { taskId: { type: 'string' }, claimToken: { type: 'string' } },
  create_subtask: { parentId: { type: 'string' }, claimToken: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } }, dependsOn: { type: 'array', items: { type: 'string' } }, idempotencyKey: { type: 'string' } },
  submit_result: { taskId: { type: 'string' }, claimToken: { type: 'string' }, gitRef: { type: 'string' }, report: { type: 'string' }, idempotencyKey: { type: 'string' } },
  report_blocker: { taskId: { type: 'string' }, claimToken: { type: 'string' }, report: { type: 'string' }, idempotencyKey: { type: 'string' } },
  send_message: { recipient: { type: 'string' }, topic: { type: 'string' }, body: { type: 'string' }, idempotencyKey: { type: 'string' } },
  list_messages: {}, get_task_tree: {},
};

export async function runSwarmMcp(): Promise<void> {
  const url = process.env.AIF_SWARM_URL, token = process.env.AIF_SWARM_AGENT_TOKEN, run = process.env.AIF_SWARM_RUN_ID;
  requireValue(url && /^http:\/\/127\.0\.0\.1:\d+$/.test(url) && token && run, 'Missing local Runtime agent credentials');
  const send = (message: unknown) => { process.stdout.write(JSON.stringify(message) + '\n'); };
  let pending = '', queue = Promise.resolve();
  const handle = async (line: string) => {
    let request: { id?: string | number; method?: string; params?: Record<string, unknown> };
    try { request = JSON.parse(line); }
    catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }); return; }
    if (!request || typeof request !== 'object' || Array.isArray(request) || typeof request.method !== 'string' ||
      request.id !== undefined && typeof request.id !== 'string' && typeof request.id !== 'number') {
      send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } }); return;
    }
    if (request.id === undefined) return;
    try {
      let result: unknown;
      if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'ai-factory-swarm', version: '1.0.0' } };
      else if (request.method === 'ping') result = {};
      else if (request.method === 'tools/list') result = { tools: Object.entries(schemas).map(([name, properties]) => ({
        name: `swarm.${name}`, description: `Swarm Runtime ${name}; bound to the current run and agent. Mutations require a stable idempotencyKey.`,
        inputSchema: { type: 'object', properties, additionalProperties: false } })) };
      else if (request.method === 'tools/call') {
        const name = String(request.params?.name ?? '').replace(/^swarm\./, '');
        requireValue(Object.hasOwn(schemas, name), 'Unknown tool');
        const args = request.params?.arguments ?? {};
        const response = await fetch(`${url}/v1/swarm/runs/${encodeURIComponent(run)}/agent`, {
          method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ method: name, arguments: args, idempotencyKey: (args as Record<string, unknown>).idempotencyKey }),
          signal: AbortSignal.timeout(10000) });
        requireValue(response.ok, 'Runtime rejected this operation');
        result = { content: [{ type: 'text', text: JSON.stringify(await response.json()) }] };
      } else { send({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } }); return; }
      send({ jsonrpc: '2.0', id: request.id, result });
    } catch { send({ jsonrpc: '2.0', id: request.id, result: { isError: true, content: [{ type: 'text', text: 'Swarm operation rejected; check the task lease, role, limits and input.' }] } }); }
  };
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    pending += chunk;
    requireValue(pending.length <= 256 * 1024, 'MCP message limit reached');
    let newline: number;
    while ((newline = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
      if (line.trim()) queue = queue.then(() => handle(line));
    }
    await queue;
  }
}
