import { mkdir, chmod, lstat } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { type Run, type SwarmEvent, SwarmError, digest, requireValue } from './types.js';

interface Connection { query(sql: string, values?: unknown[]): Promise<Record<string, unknown>[]> }
interface SQLite {
  exec(sql: string): void;
  prepare(sql: string): { all(...values: unknown[]): Record<string, unknown>[] };
  close(): void;
}
const schema = `CREATE TABLE IF NOT EXISTS swarm_runs (
  id TEXT PRIMARY KEY, project TEXT NOT NULL, state TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS swarm_events (
  event_id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES swarm_runs(id),
  sequence BIGINT NOT NULL, data TEXT NOT NULL, UNIQUE(run_id, sequence));
CREATE TABLE IF NOT EXISTS swarm_runners (
  project TEXT PRIMARY KEY, owner TEXT NOT NULL, lease_until BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS swarm_runs_project ON swarm_runs(project);`;

export class SwarmStore {
  private sqlite?: SQLite;
  private pool?: pg.Pool;
  private tail: Promise<unknown> = Promise.resolve();
  private constructor() {}

  static async open(project: string, databaseUrl?: string): Promise<SwarmStore> {
    const store = new SwarmStore();
    if (databaseUrl) {
      if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) throw new SwarmError('Expected a PostgreSQL connection URL');
      store.pool = new pg.Pool({ connectionString: databaseUrl, max: 6, connectionTimeoutMillis: 5000,
        statement_timeout: 10000, idle_in_transaction_session_timeout: 10000 });
      store.pool.on('error', () => { if (process.env.AIF_SWARM_LOG_LEVEL !== 'silent') console.error('[swarm] Database connection lost'); });
      // Serialize first-install DDL without granting workers database access.
      const client = await store.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtext('ai-factory-swarm-schema-v1'))");
        await client.query(schema);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    } else {
      const dir = path.join(project, '.ai-factory', 'swarm');
      for (const target of [path.join(project, '.ai-factory'), dir, ...['', '-wal', '-shm'].map(suffix => path.join(dir, `state.sqlite${suffix}`))]) {
        try { if ((await lstat(target)).isSymbolicLink()) throw new SwarmError('Swarm storage cannot be a symlink'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await chmod(dir, 0o700);
      try {
        const moduleName = 'node:sqlite';
        const { DatabaseSync } = await import(moduleName) as { DatabaseSync: new (file: string) => SQLite };
        store.sqlite = new DatabaseSync(path.join(dir, 'state.sqlite'));
      } catch { throw new SwarmError('SQLite mode requires Node.js >=22.13; alternatively set AIF_SWARM_DATABASE_URL for PostgreSQL'); }
      await chmod(path.join(dir, 'state.sqlite'), 0o600);
      store.sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
      store.sqlite.exec(schema);
    }
    return store;
  }

  private connection(): Connection {
    return { query: async (sql, values = []) => {
      const parameters: unknown[] = [];
      const statement = sql.replace(/\$(\d+)/g, (_, n: string) => { parameters.push(values[Number(n) - 1]); return '?'; });
      return this.sqlite!.prepare(statement).all(...parameters);
    } };
  }

  async transaction<T>(key: string, operation: (connection: Connection) => Promise<T>): Promise<T> {
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        // A bounded run is the queue's lock unit, including DAG, budgets and event sequence.
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
        const result = await operation({ query: async (sql, values) => (await client.query(sql, values)).rows });
        await client.query('COMMIT');
        return result;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    const execute = async () => {
      this.sqlite!.exec('BEGIN IMMEDIATE');
      try { const result = await operation(this.connection()); this.sqlite!.exec('COMMIT'); return result; }
      catch (error) { this.sqlite!.exec('ROLLBACK'); throw error; }
    };
    const pending = this.tail.then(execute);
    this.tail = pending.catch(() => {});
    return pending;
  }

  async create(run: Run, event: SwarmEvent): Promise<Run> {
    return this.transaction(run.id, async c => {
      const rows = await c.query('SELECT state FROM swarm_runs WHERE id=$1', [run.id]);
      if (rows.length) {
        const existing = JSON.parse(String(rows[0].state)) as Run;
        requireValue(existing.project === run.project && digest(existing.spec) === digest(run.spec), 'Run idempotency key reused');
        return existing;
      }
      await c.query('INSERT INTO swarm_runs(id,project,state) VALUES($1,$2,$3)', [run.id, run.project, JSON.stringify(run)]);
      await this.append(c, event);
      return run;
    });
  }

  private async append(c: Connection, event: SwarmEvent): Promise<void> {
    await c.query('INSERT INTO swarm_events(event_id,run_id,sequence,data) VALUES($1,$2,$3,$4)',
      [event.event_id, event.run_id, event.sequence, JSON.stringify(event)]);
  }

  async mutate<T>(project: string, id: string, operation: (run: Run, events: SwarmEvent[]) => T): Promise<T> {
    return this.transaction(id, async c => {
      const rows = await c.query('SELECT state FROM swarm_runs WHERE id=$1 AND project=$2', [id, project]);
      if (!rows.length) throw new SwarmError('Run not found', 404);
      const run = JSON.parse(String(rows[0].state)) as Run;
      requireValue(run.schema_version === 1, 'Unsupported Swarm state version');
      const events: SwarmEvent[] = [];
      const result = operation(run, events);
      await c.query('UPDATE swarm_runs SET state=$1 WHERE id=$2', [JSON.stringify(run), id]);
      for (const event of events) await this.append(c, event);
      return result;
    });
  }

  async get(project: string, id: string): Promise<Run> {
    return this.transaction(id, async c => {
      const rows = await c.query('SELECT state FROM swarm_runs WHERE id=$1 AND project=$2', [id, project]);
      if (!rows.length) throw new SwarmError('Run not found', 404);
      const run = JSON.parse(String(rows[0].state)) as Run;
      requireValue(run.schema_version === 1, 'Unsupported Swarm state version'); return run;
    });
  }
  async list(project: string): Promise<Run[]> {
    return this.transaction(project, async c => (await c.query('SELECT state FROM swarm_runs WHERE project=$1', [project]))
      .map(row => JSON.parse(String(row.state)) as Run));
  }
  async events(project: string, id: string, after = 0): Promise<SwarmEvent[]> {
    await this.get(project, id);
    return this.transaction(id, async c => (await c.query('SELECT data FROM swarm_events WHERE run_id=$1 AND sequence>$2 ORDER BY sequence LIMIT 500', [id, after]))
      .map(row => JSON.parse(String(row.data)) as SwarmEvent));
  }
  async lease(project: string, owner: string, durationMs: number): Promise<boolean> {
    return this.transaction(`runner:${project}`, async c => {
      const now = Date.now();
      await c.query(`INSERT INTO swarm_runners(project,owner,lease_until) VALUES($1,$2,$3)
        ON CONFLICT(project) DO UPDATE SET owner=excluded.owner,lease_until=excluded.lease_until
        WHERE swarm_runners.owner=$2 OR swarm_runners.lease_until<$4`, [project, owner, now + durationMs, now]);
      const rows = await c.query('SELECT owner FROM swarm_runners WHERE project=$1', [project]);
      return rows[0].owner === owner;
    });
  }
  async release(project: string, owner: string): Promise<void> {
    await this.transaction(`runner:${project}`, c => c.query('DELETE FROM swarm_runners WHERE project=$1 AND owner=$2', [project, owner]));
  }
  async close(): Promise<void> { await this.tail; this.sqlite?.close(); await this.pool?.end(); }
}
