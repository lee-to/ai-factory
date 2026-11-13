import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { SwarmStore } from '../dist/core/swarm/store.js';
import { SwarmEngine } from '../dist/core/swarm/engine.js';
import { serveSwarm } from '../dist/core/swarm/api.js';
import { parseSpec, digest } from '../dist/core/swarm/types.js';

const project = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aif-swarm-pages-')));
const git = (...args) => execFileSync('git', args, { cwd: project, stdio: 'pipe' }).toString().trim();
git('init'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
git('config', 'commit.gpgSign', 'false'); git('config', 'core.hooksPath', path.join(project, '.git', 'hooks'));
await fs.writeFile(path.join(project, '.gitignore'), '.ai-factory/swarm/\n');
git('add', '.gitignore'); git('commit', '-m', 'Fixture');
const ref = git('rev-parse', 'HEAD');
const store = await SwarmStore.open(project, process.env.AIF_SWARM_TEST_DATABASE_URL);
const engine = new SwarmEngine(store, project);
const token = randomBytes(32).toString('hex');
process.env.AIF_SWARM_OWNER_TOKEN = token;
let server;
try {
  const spec = parseSpec({ goal: 'Fixture', acceptanceCriteria: ['Checks pass'], checks: [[process.execPath, '--version']], workers: [{ provider: 'codex' }] });
  const ids = [];
  for (let i = 0; i < 12; i++) {
    const run = await engine.create({ ...spec, goal: i === 0 ? "😃".repeat(2500) : `История ${i}` }, ref);
    ids.push(run.id);
    await store.mutate(project, run.id, state => {
      state.startedAt = 1700000000000 + Math.floor(i / 3);
      state.messages = Array.from({ length: 80 }, (_, index) => ({ id: String(index), sender: 'fixture', topic: 'history', body: 'x'.repeat(16000) }));
    });
    await engine.control(run.id, 'cancel');
  }
  const waiting = await engine.create({ ...spec, goal: 'Ожидает проверки' }, ref);
  await engine.attention(waiting.id, 'Fixture needs review');
  server = await serveSwarm(engine, 0, AbortSignal.timeout(60000), 600000);
  const request = (route, options = {}) => fetch(`${server.url}/v1/swarm${route}`, { ...options, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...options.headers } });
  assert.equal((await request('/project')).status, 200);
  assert.equal((await (await request('/project')).json()).project, project);
  const legacy = await (await request('/runs')).text();
  assert(Buffer.byteLength(legacy) > 10000000, 'Fixture must exceed the Handoff historical-body limit');
  store.list = async () => { throw new Error('Full history must not be loaded for summaries or create'); };
  const found = [];
  let cursor;
  do {
    const response = await request(`/runs?view=summary&limit=3&status=cancelled${cursor ? `&cursor=${cursor}` : ''}`);
    assert.equal(response.status, 200);
    const text = await response.text(); assert(Buffer.byteLength(text) < 100000);
    const page = JSON.parse(text);
    assert.equal(page.project, project); assert(page.runs.length <= 3);
    assert(page.runs.every(run => run.goal.length <= 2000));
    assert(page.runs.every(run => !('messages' in run) && !('tasks' in run) && !('spec' in run)));
    found.push(...page.runs.map(run => run.id)); cursor = page.next_cursor;
  } while (cursor);
  assert.deepEqual(new Set(found), new Set(ids)); assert.equal(found.length, ids.length);
  const filtered = await (await request('/runs?view=summary&search=' + encodeURIComponent('ПРОВЕРКИ') + '&status=needs_attention')).json();
  assert.deepEqual(filtered.runs.map(run => run.id), [waiting.id]);
  for (const query of ['limit=0', 'limit=51', 'cursor=invalid', 'status=invalid']) assert.equal((await request(`/runs?view=summary&${query}`)).status, 400);
  const key = randomUUID();
  const create = () => request('/runs', { method: 'POST', headers: { 'idempotency-key': key }, body: JSON.stringify(spec) });
  const created = await create(); assert.equal(created.status, 201);
  const id = (await created.json()).id;
  const duplicate = await create(); assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).id, id);
  console.log(`PASS swarm summary pagination (${process.env.AIF_SWARM_TEST_DATABASE_URL ? 'PostgreSQL' : 'SQLite'}): >10MB history, tied cursors, filters, identity and create without history scan`);
} finally {
  if (server) await server.close();
  if (process.env.AIF_SWARM_TEST_DATABASE_URL) await store.transaction(project, async c => {
    await c.query('DELETE FROM swarm_events WHERE run_id IN (SELECT id FROM swarm_runs WHERE project=$1)', [project]);
    await c.query('DELETE FROM swarm_runs WHERE project=$1', [project]);
  });
  await store.close();
  await fs.rm(path.join(os.tmpdir(), `aif-swarm-${digest(project).slice(0,16)}`), { recursive: true, force: true });
  await fs.rm(project, { recursive: true, force: true });
}
