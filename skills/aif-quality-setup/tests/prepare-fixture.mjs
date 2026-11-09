// Authoring-only fixture preparation: copy bytes, never import or execute fixture code.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureNames = new Set(['js-ts', 'php', 'python', 'rust', 'mixed', 'multirepo']);
const prefix = 'aif-quality-fixture-';

function log(level, event, details) {
  const levels = { debug: 0, info: 1, error: 2, silent: 3 };
  const configured = process.env.LOG_LEVEL ?? (process.env.DEBUG === '1' ? 'debug' : 'info');
  if (levels[level] < (levels[configured] ?? levels.info)) return;
  process.stderr.write(`[quality-fixture] ${level.toUpperCase()} ${event} ${JSON.stringify(details)}\n`);
}

function within(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
}

// Inventory first so ambiguous trees fail before a destination is created.
// This read-only export also lets tests validate malformed disposable trees.
export async function inspectFixtureTree(source) {
  const root = path.resolve(source);
  const rootStat = await fs.lstat(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error(`Expected a fixture directory: ${root}`);
  const entries = [];
  const targets = new Map();
  async function visit(directory, relative = '') {
    for (const name of (await fs.readdir(directory)).sort()) {
      const sourcePath = path.join(directory, name);
      const stat = await fs.lstat(sourcePath);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
        throw new Error(`Unsupported fixture link or file type: ${sourcePath}`);
      }
      const targetName = stat.isFile() && name.endsWith('.stub') ? name.slice(0, -'.stub'.length) : name;
      if (!targetName || targetName === '.' || targetName === '..' || /[\\:]/.test(targetName)) {
        throw new Error(`Invalid restored fixture name: ${sourcePath}`);
      }
      const target = path.join(relative, targetName);
      // Reject case-only collisions on every host so fixtures remain portable to Windows.
      const key = target.toLowerCase();
      if (targets.has(key)) throw new Error(`Restored fixture path collision: ${targets.get(key)} and ${sourcePath}`);
      targets.set(key, sourcePath);
      entries.push({ source: sourcePath, target, directory: stat.isDirectory() });
      if (stat.isDirectory()) await visit(sourcePath, target);
    }
  }
  log('debug', 'inventory.start', { source: root });
  await visit(root);
  log('debug', 'inventory.complete', { source: root, entries: entries.length });
  return entries;
}

async function removeOwnedDirectory(directory, parent) {
  const absolute = path.resolve(directory);
  const stat = await fs.lstat(absolute);
  if (stat.isSymbolicLink() || !stat.isDirectory() || path.dirname(absolute) !== parent
      || !path.basename(absolute).startsWith(prefix) || await fs.realpath(absolute) !== absolute) {
    throw new Error(`Refusing cleanup outside the owned fixture directory: ${absolute}`);
  }
  log('debug', 'cleanup.start', { directory: absolute });
  await fs.rm(absolute, { recursive: true, force: true });
  log('debug', 'cleanup.complete', { directory: absolute });
}

export async function prepareFixture(name, sandboxParent = os.tmpdir()) {
  let destination;
  let parent;
  log('debug', 'prepare.start', { name, sandboxParent });
  try {
    if (!fixtureNames.has(name)) throw new Error(`Unknown fixture: ${name}; choose ${[...fixtureNames].join(', ')}`);
    parent = await fs.realpath(path.resolve(sandboxParent));
    if (!(await fs.stat(parent)).isDirectory()) throw new Error(`Sandbox parent is not a directory: ${parent}`);
    const checkout = await fs.realpath(path.resolve(testsDir, '../../..'));
    if (within(parent, checkout)) throw new Error(`Sandbox parent must be outside the source checkout: ${parent}`);
    const entries = await inspectFixtureTree(path.join(testsDir, 'fixtures', name));
    destination = await fs.mkdtemp(path.join(parent, prefix));
    log('debug', 'prepare.created', { name, destination });
    for (const entry of entries) {
      const target = path.join(destination, entry.target);
      if (entry.directory) await fs.mkdir(target);
      else await fs.copyFile(entry.source, target, constants.COPYFILE_EXCL);
      log('debug', 'prepare.copied', { target: entry.target, directory: entry.directory });
    }
    log('info', 'prepare.complete', { name, destination, files: entries.filter(entry => !entry.directory).length });
    return destination;
  } catch (error) {
    if (destination) {
      try { await removeOwnedDirectory(destination, parent); }
      catch (cleanupError) {
        log('error', 'cleanup.failed', { name, destination, error: cleanupError.message });
        throw new AggregateError([error, cleanupError], `Fixture preparation and cleanup failed: ${destination}`);
      }
    }
    log('error', 'prepare.failed', { name, sandboxParent, destination, error: error.message });
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) {
    log('error', 'usage', { command: 'node skills/aif-quality-setup/tests/prepare-fixture.mjs <fixture-name>' });
    process.exitCode = 1;
  } else {
    try { console.log(await prepareFixture(process.argv[2])); }
    catch { process.exitCode = 1; } // prepareFixture already logged the failure and its context.
  }
}
