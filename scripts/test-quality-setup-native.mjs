// Opt-in real Git/hooks regression. Never imported by the offline test suite.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pins = { husky: '9.1.7', 'lint-staged': '17.6.0', prettier: '3.9.10' };
const argv = process.argv.slice(2);
let dependencies;
let install = false;
let cleanup = false;
let runSelected = false;
let sandboxParent = os.tmpdir();
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--run') runSelected = true;
  else if (arg === '--install-dependencies') install = true;
  else if (arg === '--cleanup') cleanup = true;
  else if (arg === '--dependencies' && argv[i + 1] && !argv[i + 1].startsWith('--')) dependencies = path.resolve(argv[++i]);
  else if (arg === '--sandbox-parent' && argv[i + 1] && !argv[i + 1].startsWith('--')) sandboxParent = path.resolve(argv[++i]);
  else if (arg === '--help') {
    console.log('Usage: npm run test:quality-setup:native -- --run (--dependencies <project-with-pinned-node_modules> | --install-dependencies) [--sandbox-parent <existing-dir>] [--cleanup]');
    console.log('Creates disposable repositories/commits and runs real Husky/lint-staged/Prettier. Installation downloads pinned dev tools with scripts disabled. No inference. Default retains logs and fixtures; --cleanup removes only this run sandbox.');
    process.exit(0);
  } else throw new Error(`Unknown/incomplete argument: ${arg}`);
}
if (!runSelected) {
  console.log('NOTRUN native staging regressions: pass --run and select existing dependencies or explicit installation. No tools, hooks or models executed.');
  process.exit(2);
}
assert.notEqual(Boolean(dependencies), install, 'Select exactly one of --dependencies or --install-dependencies');

const major = Number(process.versions.node.split('.')[0]);
const minor = Number(process.versions.node.split('.')[1]);
const patch = Number(process.versions.node.split('.')[2]);
if (!(major >= 24 || (major === 22 && (minor > 22 || (minor === 22 && patch >= 1))))) {
  console.log(`NOTRUN: pinned lint-staged requires Node ^22.22.1 || >=24. Actual: ${process.version}`);
  process.exit(2);
}
const base = await fs.realpath(sandboxParent);
const prefix = 'quality-setup-native-';
const sandbox = await fs.mkdtemp(path.join(base, prefix));
const results = [];
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: path.join(sandbox, 'empty-gitconfig'), XDG_CONFIG_HOME: path.join(sandbox, 'xdg') };
// Remove inherited repository/index selection, command config and hook bypasses
// only from these disposable subprocesses. Never alter the caller's environment.
for (const key of Object.keys(env)) {
  if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG|CONFIG_COUNT|CONFIG_KEY_\d+|CONFIG_VALUE_\d+|CONFIG_PARAMETERS)$/i.test(key)
      || /^HUSKY(?:_.*)?$/i.test(key) || key === 'NODE_OPTIONS') delete env[key];
}
await fs.writeFile(env.GIT_CONFIG_GLOBAL, '');
await fs.mkdir(path.join(env.XDG_CONFIG_HOME, 'husky'), { recursive: true });
await fs.writeFile(path.join(env.XDG_CONFIG_HOME, 'husky/init.sh'), '# Isolated native fixture\n');

function execute(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, env, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.notEqual(result.status, null, `Terminated: ${executable}`);
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}
function ok(executable, args, cwd) {
  const result = execute(executable, args, cwd);
  assert.equal(result.status, 0, `${executable} ${args.join(' ')}\n${result.stdout}${result.stderr}`);
  return result.stdout;
}
const gitPrefix = ['-c', 'user.name=Quality Fixture', '-c', 'user.email=quality-fixture@example.invalid',
  '-c', 'commit.gpgsign=false', '-c', 'core.fsmonitor=false'];
const git = (cwd, ...args) => ok('git', [...gitPrefix, ...args], cwd);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function fingerprint(dir) {
  const hash = createHash('sha256');
  async function visit(current, relative = '') {
    for (const name of (await fs.readdir(current)).sort()) {
      if (!relative && name === 'tests') continue;
      const full = path.join(current, name);
      const rel = relative ? `${relative}/${name}` : name;
      const stat = await fs.lstat(full);
      assert.ok(!stat.isSymbolicLink(), `Unexpected source symlink: ${full}`);
      if (stat.isDirectory()) await visit(full, rel);
      else hash.update(rel).update('\0').update(await fs.readFile(full));
    }
  }
  await visit(dir);
  return hash.digest('hex');
}
const skillDir = path.join(sourceRoot, 'skills/aif-quality-setup');
const evidence = { platform: process.platform, node: process.version, versions: pins, sandbox,
  harnessSha256: sha(await fs.readFile(fileURLToPath(import.meta.url))),
  sourceRevision: null, skillFingerprint: await fingerprint(skillDir), results,
  scope: 'Real native manager regression only; agent decisions and other platforms require separate acceptance.' };
let prerequisitesReady = false;

try {
  evidence.git = ok('git', ['--version'], sandbox).trim();
  // Read provenance from the source repository, without modifying it. A caller
  // can supply command-scoped safe.directory through its existing environment.
  const provenance = execute('git', ['-c', `safe.directory=${sourceRoot}`, 'rev-parse', 'HEAD'], sourceRoot);
  evidence.sourceRevision = provenance.status === 0 ? provenance.stdout.trim() : 'UNKNOWN';
  if (install) {
    dependencies = path.join(sandbox, 'dependencies');
    await fs.mkdir(dependencies);
    await fs.writeFile(path.join(dependencies, 'package.json'), JSON.stringify({ name: 'quality-native-dependencies', private: true, devDependencies: pins }, null, 2) + '\n');
    // npm run supplies npm_execpath: use Node + argv, including on Windows.
    const npmCli = process.env.npm_execpath;
    assert.ok(npmCli && path.isAbsolute(npmCli), 'Use npm run for --install-dependencies (npm_execpath required)');
    const log = ok(process.execPath, [npmCli, 'install', '--ignore-scripts', '--no-audit', '--no-fund'], dependencies);
    await fs.writeFile(path.join(sandbox, 'install.log'), log);
  }
  for (const [name, version] of Object.entries(pins)) {
    const manifest = JSON.parse(await fs.readFile(path.join(dependencies, 'node_modules', name, 'package.json'), 'utf8'));
    assert.equal(manifest.version, version, `Expected pinned ${name}@${version}`);
  }
  await fs.cp(path.join(dependencies, 'node_modules'), path.join(sandbox, 'node_modules'), { recursive: true, dereference: true });
  prerequisitesReady = true;
  const fileName = 'demo file.js';
  const between = Array.from({ length: 8 }, (_, i) => `export const filler${i} = ${i};`).join('\n');
  const content = (first, last, formatted = false) => (formatted ? `export const staged = "${first}";` : `export const staged='${first}';`)
    + '\n' + between + `\nexport const untouched = "${last}";\n`;
  const snapshots = async cwd => ({ head: git(cwd, 'rev-parse', 'HEAD').trim(), tree: git(cwd, 'write-tree').trim(),
    index: git(cwd, 'show', `:${fileName}`), bytes: await fs.readFile(path.join(cwd, fileName)),
    unrelated: await fs.readFile(path.join(cwd, 'unrelated.txt')),
    config: await fs.readFile(path.join(cwd, 'lint-staged.config.mjs')), gitConfig: await fs.readFile(path.join(cwd, '.git/config')) });
  for (const policy of ['aligned-lf', 'conflicting-autocrlf']) {
    const cwd = path.join(sandbox, `${policy} project with spaces`);
    await fs.mkdir(cwd);
    await fs.writeFile(path.join(cwd, 'package.json'), '{"private":true,"type":"module"}\n');
    await fs.writeFile(path.join(cwd, '.gitignore'), 'node_modules/\n');
    await fs.writeFile(path.join(cwd, '.prettierrc.json'), '{"singleQuote":false,"endOfLine":"lf"}\n');
    await fs.writeFile(path.join(cwd, 'unrelated.txt'), 'must remain unchanged\n');
    await fs.writeFile(path.join(cwd, fileName), content('base', 'base', true));
    await fs.writeFile(path.join(cwd, 'lint-staged.config.mjs'), 'export default {"*.js":"prettier --check"};\n');
    if (policy === 'aligned-lf') await fs.writeFile(path.join(cwd, '.gitattributes'), '* text eol=lf\n');
    git(cwd, 'init', '-b', 'fixture');
    git(cwd, 'config', '--local', 'core.autocrlf', policy === 'aligned-lf' ? 'false' : 'true');
    git(cwd, 'config', '--local', 'core.eol', 'lf');
    git(cwd, 'config', '--local', 'core.safecrlf', 'false');
    const emptyHooks = path.join(sandbox, 'empty-hooks');
    await fs.mkdir(emptyHooks, { recursive: true });
    git(cwd, 'config', '--local', 'core.hooksPath', emptyHooks.replaceAll('\\', '/'));
    git(cwd, 'add', '--', 'package.json', '.gitignore', '.prettierrc.json', 'unrelated.txt', fileName, 'lint-staged.config.mjs', ...(policy === 'aligned-lf' ? ['.gitattributes'] : []));
    git(cwd, 'commit', '-m', 'fixture baseline');
    ok(process.execPath, [path.join(sandbox, 'node_modules/husky/bin.js'), 'init'], cwd);
    assert.equal(git(cwd, 'config', '--local', 'core.hooksPath').trim(), '.husky/_');
    // Husky creates executable dispatchers; prove Git can invoke them on POSIX too.
    if (process.platform !== 'win32') assert.ok((await fs.stat(path.join(cwd, '.husky/_/pre-commit'))).mode & 0o111);
    for (const mode of policy === 'aligned-lf' ? ['check', 'fix-and-stop', 'fix-and-stage'] : ['check']) {
      const task = mode === 'check' ? 'prettier --check' : 'prettier --write';
      await fs.writeFile(path.join(cwd, 'lint-staged.config.mjs'), `export default ${JSON.stringify({ '*.js': task })};\n`);
      // Avoid npm/download wrappers in hooks. Explicitly quoted Node and CLI argv.
      const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
      const cli = path.join(sandbox, 'node_modules/lint-staged/bin/lint-staged.js').replaceAll('\\', '/');
      const node = process.execPath.replaceAll('\\', '/');
      await fs.writeFile(path.join(cwd, '.husky/pre-commit'), `${quote(node)} ${quote(cli)}${mode === 'fix-and-stop' ? ' --fail-on-changes' : ''}\n`);
      await fs.writeFile(path.join(cwd, fileName), content(mode, 'base'));
      git(cwd, 'add', '--', fileName);
      await fs.writeFile(path.join(cwd, fileName), content(mode, 'unstaged'));
      const before = await snapshots(cwd);
      const outcome = execute('git', [...gitPrefix, 'commit', '-m', `fixture ${mode}`], cwd);
      const log = outcome.stdout + outcome.stderr;
      await fs.writeFile(path.join(sandbox, `${policy}-${mode}.log`), log);
      assert.equal(outcome.status === 0, mode === 'fix-and-stage', log);
      assert.match(log, /prettier/i, 'Hook must actually execute the formatter');
      if (mode === 'check') assert.match(log, /Code style issues|prettier --check.*failed/is, log);
      if (mode === 'fix-and-stop') assert.match(log, /fail-on-changes|modifications|changes.*detected/is, log);
      const after = await snapshots(cwd);
      if (mode !== 'fix-and-stage') {
        assert.equal(after.head, before.head);
        assert.equal(after.tree, before.tree);
        assert.equal(after.index, before.index);
      } else {
        assert.notEqual(after.head, before.head);
        assert.equal(git(cwd, 'show', `HEAD:${fileName}`), content(mode, 'base', true));
        assert.equal(after.index, content(mode, 'base', true));
        assert.equal(git(cwd, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').trim(), fileName);
      }
      if (policy === 'aligned-lf') assert.equal(after.bytes.toString(), content(mode, 'unstaged', mode !== 'check'));
      else {
        // This is a negative compatibility probe, NOT support for this policy.
        // Both byte-stable and converted outcomes are recorded; neither enables
        // a new hook mode. The historically observed conversion is checked exactly.
        const changed = !before.bytes.equals(after.bytes);
        if (changed) assert.equal(after.bytes.toString(), before.bytes.toString().replaceAll('\n', '\r\n'));
        assert.equal(after.bytes.toString().replaceAll('\r\n', '\n'), content(mode, 'unstaged'));
        results.push({ policy, mode, observation: changed ? 'LF converted to CRLF' : 'bytes preserved on this platform/version',
          compatibleMode: false, beforeSha256: sha(before.bytes), afterSha256: sha(after.bytes) });
      }
      for (const key of ['unrelated', 'config', 'gitConfig']) assert.deepEqual(after[key], before[key], `${key} changed`);
      results.push({ policy, mode, status: 'PASS', commitExit: outcome.status,
        before: { head: before.head, tree: before.tree, sourceSha256: sha(before.bytes) },
        after: { head: after.head, tree: after.tree, sourceSha256: sha(after.bytes) } });
      console.log(`PASS ${policy}/${mode}: actual Git hook, commit exit ${outcome.status}, index/worktree checked separately`);
    }
  }
  assert.equal(await fingerprint(skillDir), evidence.skillFingerprint, 'Native regression changed source skill');
  evidence.status = 'PASS';
} catch (error) {
  const unavailable = !prerequisitesReady && ['ENOENT', 'EPERM', 'EACCES'].includes(error.code);
  evidence.status = unavailable ? 'NOTRUN' : 'FAIL';
  evidence.error = String(error.stack || error);
  console.error(`${evidence.status} native staging: ${evidence.error}`);
  process.exitCode = unavailable ? 2 : 1;
} finally {
  await fs.writeFile(path.join(sandbox, 'result.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(`Native evidence: ${path.join(sandbox, 'result.json')}`);
  if (cleanup && evidence.status === 'PASS') {
    const resolved = await fs.realpath(sandbox);
    assert.equal(path.dirname(resolved), base);
    assert.ok(path.basename(resolved).startsWith(prefix));
    console.log(JSON.stringify(evidence));
    await fs.rm(resolved, { recursive: true });
  }
}
