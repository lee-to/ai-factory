import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { LineCounter, parseDocument } from 'yaml';
import { normalizeInstructionPath, resolveInstructionLocalPath } from './instruction-manifest.js';

const MAX_BYTES = 1024 * 1024;
const COMPOSE = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml',
  'compose.override.yaml', 'compose.override.yml', 'docker-compose.override.yaml', 'docker-compose.override.yml'];
const UNSUPPORTED = ['Makefile', 'Taskfile.yml', 'Taskfile.yaml', 'justfile', 'Justfile', 'package.json', 'composer.json', '.env'];
const KINDS = ['container', 'volume', 'network', 'host-port', 'path', 'database', 'cache', 'compose-project'] as const;
type Kind = typeof KINDS[number];
type ObjectValue = Record<string, unknown>;
type Source = { checkout: number; path: string; sha256: string | null; status: 'read' | 'missing' | 'unresolved' };
type Location = Source & { line: number | null; certainty: 'static' | 'owner-declared' | 'unknown' };
type Resource = { kind: Kind; identity: string; access: 'read-only' | 'read-write'; allowShared: boolean; location: Location };
type Finding = {
  kind: Kind | 'configuration'; resource_id: string | null;
  status: 'potential-collision' | 'allowed-read-only-sharing' | 'distinct' | 'unknown';
  locations: Location[]; reason: string; remediation: string;
};
export interface WorktreeDiagnostic {
  schema_version: 1;
  revision_sha256: string;
  checkout_count: number;
  status: 'potential-collision' | 'incomplete' | 'no-static-collision';
  coverage: 'incomplete' | 'supported-declarations';
  isolation: 'not_verified';
  sources: Source[];
  findings: Finding[];
}

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const object = (value: unknown): value is ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value);
const literal = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 1000
  && !/[$`\x00-\x1f\x7f-\x9f]/.test(value);
const name = (value: unknown): value is string => literal(value) && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value);
const port = (value: unknown): boolean => (typeof value === 'string' || typeof value === 'number')
  && /^(?:[1-9][0-9]{0,4})$/.test(String(value)) && Number(value) <= 65535;
const remedy = (kind: Kind) => kind === 'host-port' ? 'Declare a different host port per checkout, or run serially.'
  : kind === 'path' ? 'Use a checkout-local writable path, explicitly approve read-only sharing, or run serially.'
    : kind === 'database' || kind === 'cache' ? 'Declare a separate database/cache namespace per checkout, approve read-only sharing, or run serially.'
      : 'Namespace this resource per checkout in its existing configuration owner, or run serially.';

/** Static declarations only: no process execution, interpolation, external target reads or writes. */
export async function diagnoseWorktrees(checkouts: string[], mapping?: string): Promise<WorktreeDiagnostic> {
  if (!checkouts.length || checkouts.length > 32) throw new Error('Select 1 to 32 existing checkouts.');
  if (mapping !== undefined) {
    mapping = normalizeInstructionPath(mapping.replaceAll('\\', '/').replace(/^(?:\.\/)+/, ''));
    if (!/^[a-zA-Z0-9_. /-]{1,1000}$/.test(mapping) || mapping.split('/').some(part => /^\.env(?:\.|$)|secret|credential|\.git$/i.test(part))) {
      throw new Error('Unsupported mapping path.');
    }
  }
  const roots = await Promise.all(checkouts.map(async checkout => {
    const root = await fs.realpath(checkout);
    if (!(await fs.stat(root)).isDirectory()) throw new Error('Not a directory.');
    return root;
  }));
  if (new Set(roots).size !== roots.length) throw new Error('Select distinct checkouts.');
  const sources: Source[] = [];
  const resources: Resource[] = [];
  const findings: Finding[] = [];
  let totalBytes = 0;

  function unknown(location: Location, reason: string): void {
    if (findings.length + resources.length >= 2000) throw new Error('Finding limit exceeded.');
    findings.push({ kind: 'configuration', resource_id: null, status: 'unknown', locations: [{ ...location, certainty: 'unknown' }], reason,
      remediation: 'Inspect this declaration privately; supply literal runtimeResources in the existing configuration owner, or run serially.' });
  }
  function add(kind: Kind, identity: string, location: Location, access: Resource['access'] = 'read-write', allowShared = false): void {
    if (resources.length + findings.length >= 2000) throw new Error('Resource limit exceeded.');
    // Never publish resource names, paths, connection strings or environment values.
    resources.push({ kind, identity: hash(`${kind}\0${identity}`), access, allowShared, location });
  }

  for (const [index, root] of roots.entries()) {
    const checkout = index + 1;
    let composeCount = 0;
    let checkoutDeclarations = 0;
    for (const file of new Set([...COMPOSE, ...UNSUPPORTED, ...(mapping ? [mapping] : [])])) {
      const source: Source = { checkout, path: file, sha256: null, status: 'missing' };
      sources.push(source);
      const location: Location = { ...source, line: null, certainty: 'static' };
      let handle;
      let data: ObjectValue;
      let doc: ReturnType<typeof parseDocument>;
      const lines = new LineCounter();
      try {
        const target = await resolveInstructionLocalPath(root, file);
        const stat = await fs.lstat(target);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Not a regular file.');
        if (UNSUPPORTED.includes(file) && file !== mapping) {
          source.status = 'unresolved';
          unknown({ ...location, ...source }, 'unsupported-runtime-source-not-evaluated');
          continue;
        }
        if (totalBytes >= 8 * MAX_BYTES) throw new Error('Total byte limit.');
        handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
        if (!(await handle.stat()).isFile()) throw new Error('Not a regular file.');
        const buffer = Buffer.alloc(MAX_BYTES + 1);
        let size = 0;
        while (size < buffer.length) {
          const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
          if (!bytesRead) break;
          size += bytesRead;
        }
        totalBytes += size;
        if (size > MAX_BYTES || totalBytes > 8 * MAX_BYTES) throw new Error('Byte limit.');
        const bytes = buffer.subarray(0, size);
        source.sha256 = hash(bytes);
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
        doc = parseDocument(text, { lineCounter: lines, uniqueKeys: true });
        if (doc.errors.length || doc.warnings.length) throw new Error('Unsupported YAML.');
        const parsed: unknown = doc.toJS({ maxAliasCount: 0 });
        if (!object(parsed) || file === mapping && !object(JSON.parse(text))) throw new Error('Unsupported object.');
        data = parsed;
        source.status = 'read';
        Object.assign(location, source);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          source.status = 'unresolved';
          unknown({ ...location, ...source }, 'unreadable-invalid-or-limit');
        } else if (file === mapping) unknown(location, 'requested-mapping-missing');
        continue;
      } finally { await handle?.close(); }

      const at = (keys: (string | number)[], certainty: Location['certainty'] = 'static'): Location => {
        const node = doc.getIn(keys, true) as { range?: number[] } | undefined;
        return { ...location, certainty, line: node?.range ? lines.linePos(node.range[0]).line : null };
      };
      if (file === mapping) {
        if (!Array.isArray(data.runtimeResources) || data.runtimeResources.length > 2000) {
          unknown(location, 'unsupported-runtimeResources-mapping'); continue;
        }
        for (const [i, value] of data.runtimeResources.entries()) {
          const loc = at(['runtimeResources', i], 'owner-declared');
          if (!object(value) || Object.keys(value).some(key => !['kind', 'identity', 'access', 'sharing'].includes(key))
            || !KINDS.includes(value.kind as Kind) || !literal(value.identity)
            || !['read-only', 'read-write'].includes(value.access as string)
            || value.sharing !== undefined && value.sharing !== 'read-only'
            || value.sharing === 'read-only' && (value.access !== 'read-only' || !['path', 'volume', 'database', 'cache'].includes(value.kind as string))) {
            unknown(loc, 'unsupported-resource-mapping'); continue;
          }
          const kind = value.kind as Kind;
          let identity = value.identity;
          if (kind === 'path') {
            if (identity.startsWith('~') || identity.includes('\\') || /^[a-z]:/i.test(identity)) { unknown(loc, 'unsupported-mapped-path'); continue; }
            identity = path.resolve(root, identity);
          }
          if (kind === 'host-port' && (!/^[1-9][0-9]{0,4}\/(tcp|udp)$/.test(identity) || !port(identity.split('/')[0]))) {
            unknown(loc, 'unsupported-mapped-host-port'); continue;
          }
          add(kind, identity, loc, value.access as Resource['access'], value.sharing === 'read-only');
          checkoutDeclarations++;
        }
        continue;
      }
      composeCount++;
      checkoutDeclarations++;
      if (composeCount > 1) unknown(location, 'multiple-compose-files-merge-not-resolved');
      const project = data.name ?? path.basename(root).toLowerCase().replace(/[^a-z0-9_-]/g, '');
      const projectKnown = name(project);
      if (projectKnown) add('compose-project', project, at(['name']));
      else unknown(at(['name']), 'dynamic-or-unsupported-compose-project');
      for (const key of Object.keys(data)) {
        if (!['name', 'version', 'services', 'volumes', 'networks'].includes(key)) unknown(at([key]), 'unsupported-compose-section');
      }
      const named = (kind: 'volume' | 'network', key: string): string | null => {
        const section = kind === 'volume' ? 'volumes' : 'networks';
        const definitions = data[section];
        if (definitions !== undefined && !object(definitions)) { unknown(at([section]), 'unsupported-resource-section'); return null; }
        const definition = object(definitions) ? definitions[key] : undefined;
        const loc = at([section, key]);
        if (definition === undefined && (kind === 'volume' || key !== 'default')) unknown(loc, 'referenced-resource-definition-missing');
        if (definition !== undefined && definition !== null && !object(definition)) { unknown(loc, 'unsupported-resource-definition'); return null; }
        const config = object(definition) ? definition : {};
        if (Object.keys(config).some(key => !['name', 'external', 'driver', 'driver_opts', 'labels', 'internal', 'attachable', 'enable_ipv6', 'enable_ipv4', 'ipam'].includes(key))
          || config.driver_opts !== undefined || config.driver !== undefined && config.driver !== (kind === 'volume' ? 'local' : 'bridge')
          || config.ipam !== undefined || config.external !== undefined && typeof config.external !== 'boolean') {
          unknown(loc, 'unsupported-resource-driver-or-options');
        }
        const identity = config.name ?? (config.external === true ? key : projectKnown ? `${project}_${key}` : null);
        if (!name(identity)) { unknown(loc, 'dynamic-or-unsupported-resource-name'); return null; }
        return identity;
      };
      for (const [section, kind] of [['volumes', 'volume'], ['networks', 'network']] as const) {
        if (data[section] !== undefined && !object(data[section])) unknown(at([section]), 'unsupported-resource-section');
        for (const key of Object.keys(object(data[section]) ? data[section] : {})) {
          const identity = named(kind, key);
          // Definitions identify resources; mounted uses below determine writable access.
          if (identity) add(kind, identity, at([section, key]), 'read-only');
        }
      }
      if (!object(data.services)) { unknown(at(['services']), 'unsupported-or-missing-services'); continue; }
      for (const [service, value] of Object.entries(data.services)) {
        const base = ['services', service];
        if (!object(value)) { unknown(at(base), 'unsupported-service'); continue; }
        const serviceData = value;
        for (const key of Object.keys(serviceData)) {
          if (!['image', 'container_name', 'ports', 'volumes', 'networks', 'environment', 'read_only', 'depends_on', 'restart', 'profiles', 'labels'].includes(key)) {
            unknown(at([...base, key]), 'unsupported-service-setting-not-evaluated');
          }
          if (typeof serviceData[key] === 'string' && serviceData[key].includes('$')) unknown(at([...base, key]), 'dynamic-service-setting-not-resolved');
        }
        if (serviceData.container_name !== undefined) {
          if (name(serviceData.container_name)) add('container', serviceData.container_name, at([...base, 'container_name']));
          else unknown(at([...base, 'container_name']), 'dynamic-or-unsupported-container-name');
        }
        const list = (key: string): unknown[] => {
          if (serviceData[key] === undefined) return [];
          if (Array.isArray(serviceData[key])) return serviceData[key];
          unknown(at([...base, key]), 'unsupported-service-list'); return [];
        };
        for (const [i, binding] of list('ports').entries()) {
          const loc = at([...base, 'ports', i]);
          let published: unknown;
          let target: unknown;
          let protocol: unknown = 'tcp';
          if (literal(binding)) {
            const match = /^(?:(?:[0-9.]+|\[[0-9a-fA-F:]+\]):)?([0-9]+):([0-9]+)(?:\/(tcp|udp))?$/.exec(binding);
            published = match?.[1]; target = match?.[2]; protocol = match?.[3] ?? 'tcp';
          } else if (object(binding)) {
            published = binding.published; target = binding.target; protocol = binding.protocol ?? 'tcp';
            if (Object.keys(binding).some(key => !['name', 'target', 'published', 'host_ip', 'protocol', 'app_protocol', 'mode'].includes(key))
              || Object.values(binding).some(value => typeof value === 'string' && value.includes('$'))) unknown(loc, 'unsupported-or-dynamic-port-options');
          }
          if (port(published) && port(target) && ['tcp', 'udp'].includes(protocol as string)) add('host-port', `${published}/${protocol}`, loc);
          else unknown(loc, 'dynamic-automatic-range-or-unsupported-host-port');
        }
        for (const [i, binding] of list('volumes').entries()) {
          const loc = at([...base, 'volumes', i]);
          let source: unknown; let type: unknown; let readOnly = false;
          if (literal(binding)) {
            const parts = binding.split(':');
            if (parts.length >= 2 && parts.length <= 3 && (!parts[2] || /^(ro|rw)(,(z|Z))?$/.test(parts[2]))) {
              source = parts[0]; type = /^\.?\.?\//.test(parts[0]) ? 'bind' : 'volume'; readOnly = parts[2]?.split(',')[0] === 'ro';
            }
          } else if (object(binding) && [undefined, true, false].includes(binding.read_only as boolean | undefined)) {
            source = binding.source; type = binding.type; readOnly = binding.read_only === true;
            if (binding.volume !== undefined || binding.bind !== undefined) unknown(loc, 'mount-options-not-resolved');
          }
          if (type === 'bind' && literal(source) && !source.startsWith('~') && !source.includes('\\')) {
            add('path', path.resolve(root, source), loc, readOnly ? 'read-only' : 'read-write');
          } else if (type === 'volume' && name(source)) {
            const identity = named('volume', source);
            if (identity) add('volume', identity, loc, readOnly ? 'read-only' : 'read-write');
          } else unknown(loc, 'dynamic-anonymous-or-unsupported-mount');
        }
        const networkNames = serviceData.networks === undefined ? ['default']
          : Array.isArray(serviceData.networks) ? serviceData.networks : object(serviceData.networks) ? Object.keys(serviceData.networks) : null;
        if (!networkNames) unknown(at([...base, 'networks']), 'unsupported-service-networks');
        else for (const network of networkNames) {
          if (!name(network)) { unknown(at([...base, 'networks']), 'dynamic-network'); continue; }
          const identity = named('network', network);
          if (identity) add('network', identity, at([...base, 'networks']));
          if (object(serviceData.networks) && serviceData.networks[network] !== null) unknown(at([...base, 'networks', network]), 'network-options-not-resolved');
        }
        const environment = serviceData.environment;
        if (environment !== undefined) {
          const entries = object(environment) ? Object.entries(environment)
            : Array.isArray(environment) ? environment.map(value => typeof value === 'string'
              ? [value.split('=')[0], value.includes('=') ? value.slice(value.indexOf('=') + 1) : null] : ['', null]) : null;
          if (!entries) unknown(at([...base, 'environment']), 'unsupported-environment');
          else for (const [key, value] of entries) {
            const loc = at([...base, 'environment']);
            if (value === null || typeof value === 'string' && value.includes('$') || object(value) || Array.isArray(value)) {
              unknown(loc, 'dynamic-inherited-or-unsupported-environment'); continue;
            }
            if (typeof key !== 'string' || !/(?:DATABASE|DB|REDIS|CACHE|PORT|SOCKET|PATH|DIR|COMPOSE_PROJECT_NAME)/i.test(key)) continue;
            if (/^(DATABASE_URL|REDIS_URL|CACHE_URL)$/.test(key) && literal(value)) {
              try {
                const url = new URL(value);
                const kind = key === 'DATABASE_URL' ? 'database' : 'cache';
                const defaults: Record<string, string> = { 'postgres:': '5432', 'postgresql:': '5432', 'mysql:': '3306', 'redis:': '6379', 'rediss:': '6379' };
                if (!defaults[url.protocol] || !url.hostname || url.search || url.hash) throw new Error('Unsupported binding.');
                // Credentials never participate in resource identity: different users can share the same database.
                const protocol = kind === 'cache' ? 'redis:' : url.protocol === 'postgresql:' ? 'postgres:' : url.protocol;
                const database = kind === 'cache' && (!url.pathname || url.pathname === '/') ? '/0' : url.pathname || '/';
                add(kind, `${protocol}//${url.hostname.toLowerCase()}:${url.port || defaults[url.protocol]}${database}`, loc);
                unknown(loc, 'connection-host-alias-and-runtime-routing-not-verified');
                continue;
              } catch { /* Keep opaque connection values unknown. */ }
            }
            unknown(loc, 'runtime-binding-requires-explicit-mapping');
          }
        }
      }
    }
    if (!checkoutDeclarations) unknown({ checkout, path: '.', sha256: null, status: 'unresolved', line: null, certainty: 'unknown' }, 'no-supported-runtime-declarations');
  }

  const groups = new Map<string, Resource[]>();
  for (const resource of resources) {
    const key = `${resource.kind}:${resource.identity}`;
    groups.set(key, [...(groups.get(key) ?? []), resource]);
  }
  for (const [resource_id, group] of groups) {
    const shared = new Set(group.map(resource => resource.location.checkout)).size > 1;
    const allowed = shared && group.every(resource => resource.access === 'read-only')
      && [...new Set(group.map(resource => resource.location.checkout))].every(checkout => group.some(resource => resource.location.checkout === checkout && resource.allowShared));
    const status = !shared ? 'distinct' : allowed ? 'allowed-read-only-sharing' : 'potential-collision';
    findings.push({ kind: group[0].kind, resource_id, status,
      locations: group.map(resource => resource.location), reason: !shared ? 'no-equal-static-identity-in-other-selected-checkouts'
        : allowed ? 'owner-declared-read-only-sharing' : 'equal-static-resource-identities',
      remediation: shared && !allowed ? remedy(group[0].kind) : 'Recheck after source changes; runtime isolation remains unverified.' });
  }
  const incomplete = findings.some(finding => finding.status === 'unknown');
  return { schema_version: 1, revision_sha256: hash(JSON.stringify({ roots: roots.map(root => hash(root)), sources })), checkout_count: roots.length,
    status: findings.some(finding => finding.status === 'potential-collision') ? 'potential-collision' : incomplete ? 'incomplete' : 'no-static-collision',
    coverage: incomplete ? 'incomplete' : 'supported-declarations', isolation: 'not_verified', sources, findings };
}

export function formatWorktreeDiagnostic(report: WorktreeDiagnostic): string {
  return ['Read-only static diagnostic; no environments launched. Isolation: not_verified.',
    'Checkout numbers follow argument order. Resource IDs are SHA-256 fingerprints; raw values are withheld.',
    JSON.stringify({ schema_version: report.schema_version, revision_sha256: report.revision_sha256, checkout_count: report.checkout_count, status: report.status, coverage: report.coverage }),
    ...report.findings.map(finding => JSON.stringify(finding)), 'Sources:', ...report.sources.map(source => JSON.stringify(source))].join('\n');
}
