import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { SwarmStore } from '../../core/swarm/store.js';
import { SwarmEngine, publicRun } from '../../core/swarm/engine.js';
import { projectRoot, sourceHead } from '../../core/swarm/runtime.js';
import { serveSwarm } from '../../core/swarm/api.js';
import { runSwarmMcp } from '../../core/swarm/mcp.js';
import { integer, parseSpec, requireValue, SwarmError } from '../../core/swarm/types.js';

async function action(operation: () => Promise<unknown>): Promise<void> {
  try {
    const result = await operation();
    if (result !== undefined) console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`[swarm] ${error instanceof SwarmError ? error.message : 'Operation failed; check storage, configuration and project permissions'}`);
    process.exitCode = 1;
  }
}
async function withEngine<T>(operation: (engine: SwarmEngine) => Promise<T>): Promise<T> {
  const project = await projectRoot(process.cwd());
  const store = await SwarmStore.open(project, process.env.AIF_SWARM_DATABASE_URL);
  try { return await operation(new SwarmEngine(store, project)); } finally { await store.close(); }
}
export function registerSwarmCommands(program: Command): void {
  const swarm = program.command('swarm').description('Local Swarm Runtime with SQLite or PostgreSQL; versioned API for Handoff');
  swarm.command('start').description('Create a run from an explicitly reviewed YAML/JSON spec; execute with swarm serve')
    .option('--spec <file>', 'Project-relative specification', '.ai-factory/swarm.yaml')
    .action((options: { spec: string }) => action(async () => {
      const project = await projectRoot(process.cwd());
      const specPath = path.resolve(project, options.spec);
      requireValue(specPath.startsWith(project + path.sep), 'Specification must be inside the project');
      const content = await readFile(specPath, 'utf8'); requireValue(Buffer.byteLength(content) <= 128 * 1024, 'Specification too large');
      const spec = parseSpec(parseYaml(content));
      const base = await sourceHead(project);
      return withEngine(async engine => ({ ...publicRun(await engine.create(spec, base)), next: 'ai-factory swarm serve' }));
    }));
  swarm.command('serve').description('Run the scheduler and loopback API independently of Handoff')
    .option('--port <port>', 'Local API port (0 chooses a free port)', '4317')
    .action((options: { port: string }) => action(() => withEngine(async engine => {
      const port = integer(Number(options.port), 'port', 0, 65535);
      const abort = new AbortController();
      let finish: () => void;
      const finished = new Promise<void>(resolve => { finish = resolve; });
      const stop = () => { abort.abort(); finish(); };
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
      let server: Awaited<ReturnType<typeof serveSwarm>> | undefined;
      try {
        server = await serveSwarm(engine, port, abort.signal);
        console.log(JSON.stringify({ schema_version: 1, url: server.url, status: 'listening' }));
        await Promise.race([finished, server.closed]);
      } finally {
        process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
        await server?.close();
      }
    })));
  swarm.command('status [id]').action((id?: string) => action(() => withEngine(async engine =>
    id ? publicRun(await engine.get(id)) : { schema_version: 1, runs: (await engine.store.list(engine.project)).map(publicRun) })));
  swarm.command('inspect <id>').action((id: string) => action(() => withEngine(async engine => publicRun(await engine.get(id)))));
  for (const control of ['pause', 'resume', 'cancel'] as const) {
    swarm.command(`${control} <id>`).action((id: string) => action(() => withEngine(async engine => publicRun(await engine.control(id, control)))));
  }
  swarm.command('logs <id>').description('Read redacted events, not raw provider traces')
    .option('--after <sequence>', 'Exclusive per-run cursor', '0')
    .action((id: string, options: { after: string }) => action(() => withEngine(engine => engine.store.events(engine.project, id,
      integer(Number(options.after), 'after', 0, Number.MAX_SAFE_INTEGER)))));
  swarm.command('approve <id> <approval>').action((id: string, approval: string) => action(() => withEngine(async engine => {
    await engine.decide(id, approval, 'approve', 'local-owner'); return { schema_version: 1, ok: true };
  })));
  swarm.command('reject <id> <approval>').action((id: string, approval: string) => action(() => withEngine(async engine => {
    await engine.decide(id, approval, 'reject', 'local-owner'); return { schema_version: 1, ok: true };
  })));
  swarm.command('retry <id> <task>').description('Release a resolved blocker without raising attempt limits')
    .requiredOption('--reason <text>', 'Resolution or corrected instructions for the next worker')
    .action((id: string, task: string, options: { reason: string }) => action(() => withEngine(async engine => {
      await engine.retry(id, task, options.reason); return { schema_version: 1, ok: true };
    })));
  swarm.command('mcp').description('Agent-bound stdio MCP bridge; no direct database access')
    .action(() => action(runSwarmMcp));
}
