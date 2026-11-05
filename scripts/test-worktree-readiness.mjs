#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { diagnoseWorktrees, formatWorktreeDiagnostic } from '../dist/core/worktree-readiness.js';

const cli = fileURLToPath(new URL('../dist/cli/index.js', import.meta.url));
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'aif-worktree-readiness-'));
const roots = [path.join(temp, 'checkout one'), path.join(temp, 'checkout two')];
const secret = 'fixture-secret-31ee51';
const write = async (root, file, content) => {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), typeof content === 'string' ? content : JSON.stringify(content));
};
const hash = value => createHash('sha256').update(value).digest('hex');
const run = (...args) => execFileSync(process.execPath, [cli, ...args], { cwd: roots[0], encoding: 'utf8', timeout: 15000 });
async function snapshot(dir) {
  const result = {};
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    result[item.name] = item.isSymbolicLink() ? await fs.readlink(file) : item.isDirectory() ? await snapshot(file) : hash(await fs.readFile(file));
  }
  return result;
}
const compose = namespace => `name: ${namespace}
services:
  api:
    image: example.invalid/app
    container_name: fixed-api
    ports: ["127.0.0.1:8080:80", "5432:5432/udp"]
    volumes:
      - /srv/shared:/data
      - ./local:/local
      - cache:/cache
    environment:
      DATABASE_URL: postgres://alice:${secret}@database.example/app
      REDIS_URL: redis://:${secret}@cache.example
      PASSWORD: ${secret}
volumes:
  cache:
    name: fixed-volume
networks:
  default:
    name: fixed-network
`;
const collisions = report => report.findings.filter(finding => finding.status === 'potential-collision');
try {
  for (const [index, root] of roots.entries()) await write(root, 'compose.yaml', compose(`project-${index}`));
  const before = await snapshot(temp);
  const fixed = await diagnoseWorktrees(roots);
  assert.equal(fixed.status, 'potential-collision');
  assert.equal(fixed.isolation, 'not_verified');
  assert.equal(fixed.coverage, 'incomplete', 'Connection host routing remains unknown');
  for (const kind of ['container', 'host-port', 'volume', 'network', 'path', 'database', 'cache']) {
    assert(collisions(fixed).some(finding => finding.kind === kind), `Missing ${kind} collision`);
  }
  assert(fixed.findings.some(finding => finding.kind === 'path' && finding.status === 'distinct'), 'Checkout-local paths must differ');
  assert(fixed.findings.every(finding => finding.remediation.length > 0));
  assert(fixed.findings.filter(finding => finding.kind !== 'configuration').every(finding => finding.locations.every(location => location.sha256 && location.certainty === 'static')));
  assert(collisions(fixed).some(finding => finding.locations.every(location => location.line > 0)));
  assert.equal(fixed.sources.find(source => source.checkout === 1 && source.path === 'compose.yaml').sha256, hash(compose('project-0')));
  assert(!JSON.stringify(fixed).includes(secret));
  assert(!formatWorktreeDiagnostic(fixed).includes(secret));
  assert(!JSON.stringify(fixed).includes('alice'));
  assert(!JSON.stringify(fixed).includes('/srv/shared'));
  assert.deepEqual(JSON.parse(run('worktree-check', ...roots, '--json')), fixed);
  assert.equal(run('worktree-check', ...roots).trimEnd(), formatWorktreeDiagnostic(fixed));
  assert.deepEqual(await snapshot(temp), before, 'Diagnostic wrote files');

  // Different credentials must still identify the same external database.
  await write(roots[1], 'compose.yaml', compose('project-1').replace(`alice:${secret}`, 'bob:different-private-password')
    .replace(`redis://:${secret}@cache.example`, 'rediss://:another-password@CACHE.EXAMPLE/0'));
  const credentialsChanged = await diagnoseWorktrees(roots);
  assert(collisions(credentialsChanged).some(finding => finding.kind === 'database'));
  assert(collisions(credentialsChanged).some(finding => finding.kind === 'cache'), 'Redis credentials, transport, DNS casing and default /0 must not hide the same cache namespace');

  for (const [index, root] of roots.entries()) {
    await write(root, 'compose.yaml', `name: isolated-${index}
services:
  api:
    image: app
    ports: [{target: 80, published: ${8080 + index}}]
    volumes: ["../shared:/shared:ro", "./data:/data", "store:/store"]
volumes:
  store: {}
`);
    await write(root, 'tools/project.json', { commands: [], runtimeResources: [
      { kind: 'path', identity: '../shared', access: 'read-only', sharing: 'read-only' },
      { kind: 'database', identity: `test-db-${index}`, access: 'read-write' },
      { kind: 'cache', identity: 'shared-catalog', access: 'read-only', sharing: 'read-only' },
    ] });
  }
  const namespaced = await diagnoseWorktrees(roots, 'tools/project.json');
  assert.equal(namespaced.status, 'no-static-collision');
  assert.equal(namespaced.coverage, 'supported-declarations');
  assert.equal(collisions(namespaced).length, 0);
  assert.equal(namespaced.findings.filter(finding => finding.status === 'allowed-read-only-sharing').length, 2);
  assert(namespaced.findings.some(finding => finding.locations.some(location => location.certainty === 'owner-declared')));
  const revision = namespaced.revision_sha256;
  await write(roots[1], 'tools/project.json', { runtimeResources: [{ kind: 'path', identity: '../shared', access: 'read-only' }] });
  const unapproved = await diagnoseWorktrees(roots, 'tools/project.json');
  assert(collisions(unapproved).some(finding => finding.kind === 'path'), 'Every checkout must approve shared read-only use');
  assert.notEqual(unapproved.revision_sha256, revision);
  await write(roots[1], 'tools/project.json', { runtimeResources: [{ kind: 'path', identity: '../shared', access: 'read-only', sharing: 'read-only' }] });
  const readOnlyCompose = await fs.readFile(path.join(roots[1], 'compose.yaml'), 'utf8');
  await write(roots[1], 'compose.yaml', readOnlyCompose.replace('../shared:/shared:ro', '../shared:/shared:rw'));
  assert(collisions(await diagnoseWorktrees(roots, 'tools/project.json')).some(finding => finding.kind === 'path'), 'Owner approval cannot hide a writable discovered mount');
  await write(roots[0], 'compose.yaml', 'name: same\nservices: {api: {image: app}}');
  await write(roots[1], 'compose.yaml', 'name: same\nservices: {api: {image: app}}');
  assert(collisions(await diagnoseWorktrees(roots)).some(finding => finding.kind === 'compose-project'));
  console.log('PASS fixed collisions, namespaced/local resources, read-only approvals, provenance, secret withholding and read-only human/JSON output');

  await write(roots[0], 'compose.yaml', `name: \${PROJECT}
include: [${secret}]
services:
  api:
    image: app
    container_name: \${CONTAINER}
    ports: ["\${PORT}:80", "8000-8010:80", 80]
    volumes: ["\${DATA}:/data"]
    env_file: .env
    command: touch command-marker
    environment: {DATABASE_URL: "\${DATABASE_URL}"}
`);
  await write(roots[0], '.env', `DATABASE_URL=postgres://user:${secret}@private/db\n`);
  await write(roots[0], 'Makefile', '$(shell touch make-marker)\n');
  await write(roots[0], 'package.json', { scripts: { pretest: 'touch hook-marker' } });
  const extension = '.ai-factory/extensions/aif-ext-poison';
  await write(roots[0], '.ai-factory.json', { version: '2.21.0', agents: [], extensions: [{ name: 'aif-ext-poison', version: '1.0.0' }] });
  await write(roots[0], `${extension}/extension.json`, { name: 'aif-ext-poison', version: '1.0.0', commands: [{ name: 'poison', module: 'commands/poison.mjs' }] });
  await write(roots[0], `${extension}/commands/poison.mjs`, "import fs from 'node:fs'; fs.writeFileSync('import-marker', 'executed'); export function register() {}\n");
  const effectBefore = await snapshot(temp);
  const dynamic = await diagnoseWorktrees([roots[0]]);
  assert.equal(dynamic.status, 'incomplete');
  assert.equal(dynamic.coverage, 'incomplete');
  assert(dynamic.findings.some(finding => finding.reason === 'dynamic-automatic-range-or-unsupported-host-port'));
  assert(!JSON.stringify(dynamic).includes(secret));
  assert(!JSON.stringify(dynamic).includes('${'));
  assert.equal(dynamic.sources.find(source => source.path === '.env').sha256, null);
  run('worktree-check', '--json');
  run('worktree-check', '--help');
  run('--help', 'worktree-check');
  assert.deepEqual(await snapshot(temp), effectBefore, 'Diagnostic/help executed project code or wrote files');
  execFileSync(process.execPath, [path.join(roots[0], extension, 'commands/poison.mjs')], { cwd: roots[0] });
  assert.equal(await fs.readFile(path.join(roots[0], 'import-marker'), 'utf8'), 'executed', 'Extension poison fixture must be executable');
  await fs.rm(path.join(roots[0], 'import-marker'));

  for (const text of ['services: {api: {image: app, image: other}}', 'services: [', 'null', 'services: &x {api: *x}', ' '.repeat(1024 * 1024 + 1)]) {
    await write(roots[1], 'compose.yaml', text);
    const report = await diagnoseWorktrees([roots[1]]);
    assert.equal(report.status, 'incomplete');
    assert(report.sources.some(source => source.path === 'compose.yaml' && source.status === 'unresolved'));
  }
  await write(roots[1], 'compose.yaml', 'services: {api: {image: app}}');
  await write(roots[1], 'compose.override.yaml', 'services: {api: {ports: ["8080:80"]}}');
  assert((await diagnoseWorktrees([roots[1]])).findings.some(finding => finding.reason === 'multiple-compose-files-merge-not-resolved'));
  await fs.rm(path.join(roots[1], 'compose.yaml'));
  await fs.symlink(path.join(roots[0], 'compose.yaml'), path.join(roots[1], 'compose.yaml'));
  assert((await diagnoseWorktrees([roots[1]])).sources.some(source => source.path === 'compose.yaml' && source.status === 'unresolved'));
  await fs.symlink(roots[0], path.join(roots[1], 'linked'));
  assert.equal((await diagnoseWorktrees([roots[1]], 'linked/tools/project.json')).coverage, 'incomplete');
  await assert.rejects(diagnoseWorktrees(roots, '../outside.json'));
  await assert.rejects(diagnoseWorktrees(roots, '.env'));
  await assert.rejects(diagnoseWorktrees([roots[0], roots[0]]));
  await assert.rejects(diagnoseWorktrees(Array(33).fill(roots[0])));
  const invalid = spawnSync(process.execPath, [cli, 'worktree-check', `missing-${secret}`, '--json'], { cwd: roots[0], encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert(!invalid.stderr.includes(secret));
  const empty = path.join(temp, 'empty');
  await fs.mkdir(empty);
  assert.equal((await diagnoseWorktrees([empty])).status, 'incomplete');
  await write(empty, 'compose.yaml', 'services: {api: {image: "${IMAGE}", environment: {OPAQUE_SETTING: "${INPUT}"}, ports: [{target: 80, published: {toString: invalid}}]}}');
  assert.equal((await diagnoseWorktrees([empty])).status, 'incomplete');
  await fs.rm(path.join(empty, 'compose.yaml'));
  await write(empty, 'package.json', { runtimeResources: [{ kind: 'cache', identity: 'cache-for-tests', access: 'read-write' }] });
  assert.equal((await diagnoseWorktrees([empty], 'package.json')).status, 'no-static-collision', 'Reuse existing metadata owners, including package.json');
  for (const value of [
    { kind: 'cache', identity: '${CACHE}', access: 'read-write' },
    { kind: 'container', identity: 'fixed', access: 'read-only', sharing: 'read-only' },
    { kind: 'host-port', identity: '99999/tcp', access: 'read-write' },
    { kind: 'path', identity: '~/private', access: 'read-write' },
  ]) {
    await write(empty, 'package.json', { runtimeResources: [value] });
    assert.equal((await diagnoseWorktrees([empty], 'package.json')).status, 'incomplete');
  }
  console.log('PASS dynamic/unsupported/duplicate/alias/large configs, missing evidence, source/link boundaries, mapping validation and zero project-code execution');
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
