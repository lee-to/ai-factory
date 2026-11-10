import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseDocument } from 'yaml';
import { normalizeInstructionPath, resolveInstructionLocalPath } from './instruction-manifest.js';

const MAX_BYTES = 1024 * 1024;
const MAX_COMMANDS = 2000;
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9:._/-]{0,99}$/;
const SENSITIVE_NAME = /(?:pass(?:word|wd)?|pwd|token|secret|credential|api[-_]?key|authorization|cookie)[:=]/i;
const LOCKS = { 'package-lock.json': 'npm', 'npm-shrinkwrap.json': 'npm', 'pnpm-lock.yaml': 'pnpm', 'yarn.lock': 'yarn', 'bun.lock': 'bun', 'bun.lockb': 'bun' };
type JsonObject = Record<string, unknown>;
type Source = { path: string; sha256: string | null; status: 'read' | 'missing' | 'unresolved'; reason: string | null };
type Entry = {
  id: string; name: string; kind: 'package' | 'composer' | 'mapping'; cwd: string;
  source: { path: string; sha256: string; pointer: string };
  argv: string[] | null; inputs: string[] | null; output_mode: 'unknown' | 'human' | 'json';
  status: 'declared' | 'unresolved'; reason: string | null;
  verification: 'not_run'; effects: 'unknown';
};
export interface CommandCatalog {
  schema_version: 1;
  revision_sha256: string;
  commands: Entry[];
  sources: Source[];
  ambiguities: Array<{ name: string; command_ids: string[]; selection_required: true }>;
}

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function directory(value: string): string {
  if (!clean(value)) throw new Error('Unsupported directory.');
  const relative = value.replaceAll('\\', '/').replace(/^(?:\.\/)+/, '');
  return relative === '.' || relative === '' ? '.' : normalizeInstructionPath(relative);
}

function clean(value: string): boolean {
  return value.length > 0 && value.length <= 1000 && !/[\x00-\x1f\x7f-\x9f\u2028\u2029]/.test(value);
}

// Raw script bodies are never published. Opaque mapped invocations are withheld
// rather than returning partly redacted shell snippets or credential-bearing URLs.
function safeArgv(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 100
    && value.every(arg => typeof arg === 'string' && clean(arg)
      && !/[`$;&|<>@]/.test(arg) && !/:\/\//.test(arg)
      && !/(?:pass(?:word|wd)?|pwd|token|secret|credential|key|auth(?:orization)?|bearer|basic|cookie|user(?:name)?)(?:[^a-z0-9]|$)/i.test(arg)
      && !/^-(?:u|p|P|H)(?:.|$)/.test(arg))
    && !value.some(arg => /^(?:-[ce]|--(?:eval|command|encodedcommand)(?:=|$)|\/c)/i.test(arg));
}

export async function discoverCommands(projectDir: string, directories: string[] = ['.'], mapping?: string): Promise<CommandCatalog> {
  if (!directories.length || directories.length > 32) throw new Error('Select between 1 and 32 project directories.');
  const selected = [...new Set(directories.map(directory))];
  const sources: Source[] = [];
  const commands: Entry[] = [];
  let totalBytes = 0;

  async function read(file: string, json = true): Promise<{ source: Source; data: unknown } | null> {
    const source: Source = { path: file, sha256: null, status: 'unresolved', reason: null };
    sources.push(source);
    let handle;
    try {
      const target = await resolveInstructionLocalPath(projectDir, file);
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('not-regular');
      if (totalBytes >= 8 * MAX_BYTES) throw new Error('size-limit');
      handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
      if (!(await handle.stat()).isFile()) throw new Error('not-regular');
      const buffer = Buffer.alloc(MAX_BYTES + 1);
      let size = 0;
      while (size < buffer.length) {
        const result = await handle.read(buffer, size, buffer.length - size, size);
        if (!result.bytesRead) break;
        size += result.bytesRead;
      }
      totalBytes += size;
      if (size > MAX_BYTES || totalBytes > 8 * MAX_BYTES) throw new Error('size-limit');
      const bytes = buffer.subarray(0, size);
      source.sha256 = createHash('sha256').update(bytes).digest('hex');
      let data: unknown = null;
      if (json) {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
        data = JSON.parse(text);
        // JSON.parse silently overwrites duplicate keys; the installed YAML parser
        // also accepts JSON and detects duplicates, including escaped key aliases.
        if (parseDocument(text, { uniqueKeys: true }).errors.length || !object(data)) throw new Error('invalid-json');
      }
      source.status = 'read';
      return { source, data };
    } catch (error) {
      source.status = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unresolved';
      source.reason = source.status === 'missing' ? 'not-found' : 'unreadable-unsupported-or-limit';
      return null;
    } finally { await handle?.close(); }
  }

  function add(entry: Entry): void {
    if (commands.length >= MAX_COMMANDS) throw new Error('Command limit exceeded; select fewer directories.');
    commands.push(entry);
  }

  for (const cwd of selected) {
    const prefix = cwd === '.' ? '' : `${cwd}/`;
    // Validate directories even if both manifests are absent; never follow a link.
    const target = cwd === '.' ? await fs.realpath(projectDir) : await resolveInstructionLocalPath(projectDir, cwd);
    if (!(await fs.lstat(target)).isDirectory()) throw new Error('Selected directory is unavailable.');
    const pkg = await read(`${prefix}package.json`);
    const composer = await read(`${prefix}composer.json`);
    let manager: string | null = null;
    if (pkg && object(pkg.data)) {
      const declared = typeof pkg.data.packageManager === 'string' ? /^(npm|pnpm|yarn|bun)@[^\s]+$/.exec(pkg.data.packageManager)?.[1] : undefined;
      const detected = new Set<string>();
      let unresolvedEvidence = false;
      for (const [lock, tool] of Object.entries(LOCKS)) {
        const found = await read(`${prefix}${lock}`, false);
        if (found) detected.add(tool);
        if (sources.at(-1)?.status === 'unresolved') unresolvedEvidence = true;
      }
      if (declared) detected.add(declared);
      // shortcut: evidence is per selected directory; use an explicit mapping for
      // inherited workspace managers until bounded ancestor discovery is needed.
      manager = !unresolvedEvidence && detected.size === 1 && (pkg.data.packageManager === undefined || declared) ? [...detected][0] : null;
    }

    for (const [manifest, kind] of [[pkg, 'package'], [composer, 'composer']] as const) {
      if (!manifest || !object(manifest.data)) continue;
      const scripts = manifest.data.scripts;
      if (scripts === undefined) continue;
      if (!object(scripts)) {
        manifest.source.status = 'unresolved';
        manifest.source.reason = 'unsupported-scripts';
        continue;
      }
      for (const [index, [name, definition]] of Object.entries(scripts).entries()) {
        const validName = NAME.test(name) && !SENSITIVE_NAME.test(name);
        const validDefinition = typeof definition === 'string' && definition.trim().length > 0
          || kind === 'composer' && Array.isArray(definition) && definition.length > 0
            && definition.every(value => typeof value === 'string' && value.trim().length > 0);
        const runner = kind === 'composer' ? 'composer' : manager;
        const reason = !validName ? 'unsupported-name' : !validDefinition ? 'unsupported-definition' : !runner ? 'package-manager-unknown-or-conflicting' : null;
        const pointer = validName ? `/scripts/${name.replaceAll('~', '~0').replaceAll('/', '~1')}` : '/scripts';
        add({
          id: `${manifest.source.path}#${validName ? pointer : `/unsupported-script/${index}`}`, name: validName ? name : '[unsupported name]',
          kind, cwd, source: { path: manifest.source.path, sha256: manifest.source.sha256!, pointer },
          argv: reason ? null : [runner!, kind === 'composer' ? 'run-script' : 'run', name], inputs: null, output_mode: 'unknown',
          status: reason ? 'unresolved' : 'declared', reason, verification: 'not_run', effects: 'unknown',
        });
      }
    }

    for (const file of ['Makefile', 'Taskfile.yml', 'Taskfile.yaml', 'justfile', 'Justfile']) {
      const relative = `${prefix}${file}`;
      try {
        await fs.lstat(await resolveInstructionLocalPath(projectDir, relative));
        const found = await read(relative, false);
        if (found) {
          found.source.status = 'unresolved';
          found.source.reason = 'explicit-mapping-required-not-parsed';
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') sources.push({ path: relative, sha256: null, status: 'unresolved', reason: 'unsupported-path' });
      }
    }
  }

  if (mapping) {
    if (!clean(mapping)) throw new Error('Unsupported mapping path.');
    const file = normalizeInstructionPath(mapping.replaceAll('\\', '/').replace(/^(?:\.\/)+/, ''));
    const loaded = await read(file);
    if (loaded && object(loaded.data)) {
      if (!Array.isArray(loaded.data.commands) || loaded.data.commands.length > MAX_COMMANDS) {
        loaded.source.status = 'unresolved'; loaded.source.reason = 'unsupported-mapping';
      } else for (const [index, value] of loaded.data.commands.entries()) {
        if (!object(value) || typeof value.name !== 'string' || !NAME.test(value.name) || SENSITIVE_NAME.test(value.name)
          || typeof value.cwd !== 'string' || Object.keys(value).some(key => !['name', 'cwd', 'argv', 'inputs', 'output_mode'].includes(key))) {
          loaded.source.status = 'unresolved'; loaded.source.reason = 'unsupported-mapping-entry'; continue;
        }
        let cwd: string;
        try {
          cwd = directory(value.cwd);
          const target = cwd === '.' ? await fs.realpath(projectDir) : await resolveInstructionLocalPath(projectDir, cwd);
          if (!(await fs.lstat(target)).isDirectory()) throw new Error('invalid-cwd');
        } catch { loaded.source.status = 'unresolved'; loaded.source.reason = 'unsupported-mapping-cwd'; continue; }
        const inputs = value.inputs === undefined ? null : Array.isArray(value.inputs) && value.inputs.length <= 100
          && value.inputs.every(input => typeof input === 'string' && /^[a-zA-Z_][a-zA-Z0-9_.-]{0,99}$/.test(input)) ? value.inputs as string[] : null;
        const output = value.output_mode ?? 'unknown';
        const reason = !safeArgv(value.argv) ? 'opaque-or-sensitive-invocation-withheld'
          : value.inputs !== undefined && inputs === null || !['unknown', 'human', 'json'].includes(output as string) ? 'unsupported-metadata' : null;
        add({ id: `${file}#/commands/${index}`, name: value.name, kind: 'mapping', cwd,
          source: { path: file, sha256: loaded.source.sha256!, pointer: `/commands/${index}` },
          argv: reason ? null : value.argv as string[], inputs, output_mode: ['human', 'json'].includes(output as string) ? output as 'human' | 'json' : 'unknown',
          status: reason ? 'unresolved' : 'declared', reason, verification: 'not_run', effects: 'unknown' });
      }
    }
  }

  const groups = new Map<string, string[]>();
  for (const entry of commands) groups.set(entry.name, [...(groups.get(entry.name) ?? []), entry.id]);
  return { schema_version: 1, revision_sha256: createHash('sha256').update(JSON.stringify(sources)).digest('hex'), commands, sources,
    ambiguities: [...groups].filter(([, ids]) => ids.length > 1).map(([name, command_ids]) => ({ name, command_ids, selection_required: true })) };
}

export function formatCommandCatalog(catalog: CommandCatalog): string {
  const cell = (value: unknown) => JSON.stringify(value).replaceAll('|', '\\|').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const rows = ['Read-only declarations; no commands executed. Verification: not_run; effects: unknown.',
    `Schema: ${catalog.schema_version}; catalog revision SHA-256: ${catalog.revision_sha256}`,
    '', '| ID | Name | Kind | CWD | Status / reason | Argv | Inputs | Output | Source / SHA-256 / pointer |',
    '|---|---|---|---|---|---|---|---|---|',
    ...catalog.commands.map(entry => `| ${[entry.id, entry.name, entry.kind, entry.cwd, [entry.status, entry.reason], entry.argv, entry.inputs, entry.output_mode, entry.source].map(cell).join(' | ')} |`),
    '', 'Sources:', ...catalog.sources.map(source => cell(source)),
    '', 'Ambiguities (select an exact command ID and CWD before execution):', ...catalog.ambiguities.map(group => cell(group))];
  return rows.join('\n');
}
