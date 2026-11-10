import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { getCurrentVersion } from './config.js';

const DEFAULT_RUNS_DIR = '.ai-factory/instruction-runs';
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ROLES = ['base', 'replacement', 'injection', 'installed', 'project-context', 'rules', 'reference', 'settings', 'evidence'] as const;
const OPERATIONS = ['replace', 'transform', 'template', 'prepend', 'append', 'include'] as const;
const SETTING_KEYS = new Set(['model', 'reasoning_effort', 'permission_mode', 'sandbox_mode', 'runtime_version']);

type Unknown = 'unknown' | 'not_applicable';
type Role = typeof ROLES[number];
type JsonObject = Record<string, unknown>;

export interface InstructionResourceInput {
  id: string;
  role: Role;
  path?: string;
  required?: boolean;
  in_composition?: boolean;
  addition?: boolean;
  output_path?: string;
}

interface CapturePolicy {
  snapshot_roots: string[];
  exclude: string[];
  settings_allowlist: string[];
}

interface Dependency {
  from: string;
  to: string;
  required: boolean;
  condition: string | Unknown;
  declaration: string | Unknown;
  resolution: 'declared' | 'included' | 'skipped' | 'missing' | 'unknown';
}

interface Operation {
  kind: typeof OPERATIONS[number];
  inputs: string[];
  output: string;
  implementation: string | Unknown;
}

interface Budget {
  source: string;
  unit: 'bytes' | 'estimated_tokens';
  scope: 'composition' | 'additions' | 'observed_load';
  value: number;
}

interface Resource {
  ref: string;
  id: string;
  revision: number;
  role: Role;
  locator: string;
  required: boolean;
  in_composition: boolean;
  addition: boolean;
  output_path?: string;
  captured_at: string;
  status: 'captured' | 'missing' | 'excluded' | 'unavailable';
  sha256?: string;
  bytes?: number;
  snapshot?: string;
  preservation: 'snapshot' | 'not_preserved' | 'excluded' | 'unavailable';
}

interface Observation {
  sequence: number;
  resource: string;
  kind: 'agent_report' | 'tool_event' | 'runtime_event';
  source: string;
  reported_at: string;
  recorded_at: string;
  reported_status: 'complete' | 'partial' | 'unknown';
  range?: { unit: 'bytes' | 'lines'; start: number; end: number };
  truncated: boolean | 'unknown';
  evidence?: string;
  delivered?: string;
  // Caller-provided receipts are evidence, not authenticated runtime telemetry.
  provenance: 'caller_supplied';
}

export interface InstructionManifest {
  schema_version: 1;
  coverage: { resources: 'declared_only'; dependency_discovery: 'unknown'; runtime_loading: 'caller_supplied' };
  recorder: { name: 'ai-factory'; version: string };
  run: {
    id: string; skill: string; task: string; stage: string; previous_run_id: string;
    status: 'open' | 'complete'; initialization: 'capturing' | 'ready'; started_at: string; finalized_at?: string;
    capture_error?: { resource_id: string; reason: string };
  };
  environment: { ai_factory_version: string; runtime: string; settings: Record<string, string | number | boolean>; hidden_instructions: 'unknown' };
  policy: CapturePolicy & { retention: 'manual_no_automatic_deletion'; sensitivity: 'local_sensitive' };
  resources: Resource[];
  dependencies: Dependency[];
  operations: Array<Operation & { sequence: number; provenance: 'declared' }>;
  observations: Observation[];
  loading: Array<{ resource: string; status: 'unknown' | 'evidence_provided'; agent_reports: number; authenticated_runtime_load: 'unknown' }>;
  budget?: Budget;
  composition_sha256: string;
  accounting: ReturnType<typeof account>;
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as JsonObject;
}

function fields(value: JsonObject, allowed: string[], label: string): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`${label} has unsupported fields.`);
}

function string(value: unknown, label: string, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !value || value.length > 4000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) {
    throw new Error(`${label} must be a non-empty string (maximum 4000 characters).`);
  }
  return value;
}

function identifier(value: unknown, label: string): string {
  const result = string(value, label);
  if (!ID.test(result)) throw new Error(`${label} must be a safe identifier (1-100 letters, digits, dots, underscores, or hyphens).`);
  return result;
}

function array(value: unknown, label: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean.`);
  return value;
}

function choice<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (!allowed.includes(value as T)) throw new Error(`${label} has an unsupported value.`);
  return value as T;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative safe integer.`);
  return value as number;
}

function relative(value: unknown): string {
  const result = string(value, 'Relative path').replaceAll('\\', '/');
  if (path.posix.isAbsolute(result) || /^[a-z]:/i.test(result) || result.includes(':')
    || result.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part)
      || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
    || /[\x00-\x1f]/.test(result)) throw new Error('A canonical project-relative path without traversal is required.');
  return result;
}

function sensitive(file: string): boolean {
  return file.split('/').some(part => /^(?:\.git|\.env.*|credentials(?:\..*)?|secrets?(?:\..*)?|id_rsa|id_ed25519)$/i.test(part))
    || /\.(?:pem|key|p12|pfx)$/i.test(file);
}

function digest(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// Follow no links, including ancestor junctions, for both reads and writes.
async function localPath(projectDir: string, rel: string, createParents = false): Promise<string> {
  const root = await fs.realpath(projectDir);
  const parts = relative(rel).split('/');
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new Error('Instruction recorder does not follow symbolic links or junctions.');
      if (i < parts.length - 1 && !stat.isDirectory()) throw new Error('Instruction recorder path ancestor is not a directory.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (createParents && i < parts.length - 1) await fs.mkdir(current, { mode: 0o700 });
    }
  }
  return current;
}

function excluded(file: string, policy: CapturePolicy): boolean {
  // Exclusions are exact relative files or directory prefixes; no ambiguous glob semantics.
  return sensitive(file) || policy.exclude.some(prefix => file === prefix || file.startsWith(`${prefix}/`));
}

function parseResource(value: unknown): InstructionResourceInput {
  const input = object(value, 'Resource');
  fields(input, ['id', 'role', 'path', 'required', 'in_composition', 'addition', 'output_path'], 'Resource');
  return {
    id: identifier(input.id, 'Resource id'), role: choice(input.role, ROLES, 'Resource role'),
    ...(input.path === undefined ? {} : { path: string(input.path, 'Resource path') }),
    ...(input.required === undefined ? {} : { required: boolean(input.required, 'Resource required') }),
    ...(input.in_composition === undefined ? {} : { in_composition: boolean(input.in_composition, 'Resource in_composition') }),
    ...(input.addition === undefined ? {} : { addition: boolean(input.addition, 'Resource addition') }),
    ...(input.output_path === undefined ? {} : { output_path: relative(input.output_path) }),
  };
}

function parsePolicy(value: unknown): CapturePolicy {
  const input = value === undefined ? {} : object(value, 'Policy');
  fields(input, ['snapshot_roots', 'exclude', 'settings_allowlist'], 'Policy');
  const settings = array(input.settings_allowlist, 'settings_allowlist').map(value => string(value, 'Setting key'));
  if (settings.some(key => !SETTING_KEYS.has(key))) throw new Error('Only documented non-sensitive setting keys can be allowlisted.');
  return {
    snapshot_roots: array(input.snapshot_roots, 'snapshot_roots').map(relative),
    exclude: array(input.exclude, 'exclude').map(relative), settings_allowlist: settings,
  };
}

async function capture(projectDir: string, runDir: string, input: InstructionResourceInput, policy: CapturePolicy, revision: number): Promise<Resource> {
  const resource: Resource = {
    ref: `${input.id}@${revision}`, id: input.id, revision, role: input.role,
    locator: `resource:${input.id}`, required: input.required ?? false,
    in_composition: input.in_composition ?? false, addition: input.addition ?? false,
    ...(input.output_path ? { output_path: input.output_path } : {}),
    captured_at: new Date().toISOString(), status: 'unavailable', preservation: 'unavailable',
  };
  // Settings files commonly combine harmless options with credentials. Only the
  // separately allowlisted environment.settings values are recorded, never raw settings files.
  if (input.role === 'settings') return { ...resource, status: 'excluded', preservation: 'excluded' };
  if (!input.path) return resource;
  const candidate = path.relative(path.resolve(projectDir), path.resolve(projectDir, input.path)).replaceAll('\\', '/');
  let rel: string;
  try { rel = relative(candidate); } catch { return resource; } // External files retain only a logical id.
  if (excluded(rel, policy)) return { ...resource, status: 'excluded', preservation: 'excluded' };
  resource.locator = rel;
  let bytes: Buffer;
  try {
    const source = await localPath(projectDir, rel);
    if (!(await fs.lstat(source)).isFile()) throw new Error('Instruction resources must be regular files.');
    bytes = await fs.readFile(source);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { ...resource, status: 'missing' };
  }
  resource.status = 'captured';
  resource.sha256 = digest(bytes);
  resource.bytes = bytes.length;
  resource.preservation = 'not_preserved';
  if (policy.snapshot_roots.some(root => rel === root || rel.startsWith(`${root}/`))) {
    const snapshot = `snapshots/${resource.sha256}`;
    const target = await localPath(projectDir, `${runDir}/${snapshot}`, true);
    try {
      const handle = await fs.open(target, 'wx', 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); }
      finally { await handle.close(); }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (!(await fs.readFile(target)).equals(bytes)) throw new Error('Existing snapshot failed exact-byte verification.');
    }
    resource.snapshot = snapshot;
    resource.preservation = 'snapshot';
  }
  return resource;
}

function latest(resources: Resource[]): Resource[] {
  return [...new Map(resources.map(resource => [resource.id, resource])).values()];
}

function account(manifest: Pick<InstructionManifest, 'resources' | 'observations' | 'budget'>) {
  const current = latest(manifest.resources);
  const sum = (resources: Resource[]) => resources.reduce((total, resource) => total + (resource.bytes ?? 0), 0);
  const composition = current.filter(resource => resource.in_composition);
  const additions = current.filter(resource => resource.addition);
  const observed = manifest.observations.map(observation => manifest.resources.find(resource => resource.ref === observation.delivered));
  const loadKnown = observed.every(resource => resource?.bytes !== undefined);
  const sizes = {
    composition: composition.some(resource => resource.bytes === undefined) ? 'unknown' as const : sum(composition),
    additions: additions.some(resource => resource.bytes === undefined) ? 'unknown' as const : sum(additions),
    observed_load: !manifest.observations.length || !loadKnown ? 'unknown' as const : sum(observed as Resource[]),
  };
  const estimated = (value: number | 'unknown') => value === 'unknown' ? value : Math.ceil(value / 4);
  const tokens = { composition: estimated(sizes.composition), additions: estimated(sizes.additions), observed_load: estimated(sizes.observed_load) };
  const measurement = manifest.budget && (manifest.budget.unit === 'bytes' ? sizes : tokens)[manifest.budget.scope];
  return {
    bytes: sizes, estimated_tokens: tokens, token_method: 'ceil(utf8_bytes/4); heuristic, not model usage',
    known_unique_resource_bytes: sum([...new Map(manifest.resources.filter(resource => resource.sha256).map(resource => [resource.sha256, resource])).values()]),
    model_context_bytes: 'unknown' as const,
    budget_result: !manifest.budget ? 'not_applicable' : measurement === 'unknown' ? 'unknown' : measurement! > manifest.budget.value ? 'overrun' : 'within',
  };
}

function refresh(manifest: InstructionManifest): void {
  manifest.composition_sha256 = digest(JSON.stringify({
    resources: latest(manifest.resources).map(({ id, role, sha256, status, in_composition, addition, output_path }) =>
      ({ id, role, sha256: sha256 ?? 'unknown', status, in_composition, addition, output_path })),
    operations: manifest.operations, dependencies: manifest.dependencies, environment: manifest.environment,
  }));
  manifest.accounting = account(manifest);
  manifest.loading = manifest.resources.map(resource => {
    const reports = manifest.observations.filter(observation => observation.resource === resource.ref);
    return { resource: resource.ref, status: reports.some(report => report.evidence && manifest.resources.some(candidate => candidate.ref === report.evidence && candidate.snapshot)) ? 'evidence_provided' : 'unknown',
      agent_reports: reports.filter(report => report.kind === 'agent_report').length, authenticated_runtime_load: 'unknown' };
  });
}

async function writeManifest(projectDir: string, runDir: string, manifest: InstructionManifest): Promise<void> {
  refresh(manifest);
  const file = await localPath(projectDir, `${runDir}/manifest.json`);
  const temporary = await localPath(projectDir, `${runDir}/.manifest-${randomUUID()}.tmp`);
  try {
    const handle = await fs.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(manifest, null, 2) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}

export function instructionRunPath(runId: string, runsDir = DEFAULT_RUNS_DIR): string {
  if (sensitive(relative(runsDir))) throw new Error('Instruction storage cannot use a sensitive directory.');
  return `${relative(runsDir)}/${identifier(runId, 'Run id')}`;
}

export { relative as normalizeInstructionPath, localPath as resolveInstructionLocalPath };

function validateManifest(value: unknown, runId: string): InstructionManifest {
  const input = object(value, 'Manifest');
  fields(input, ['schema_version', 'coverage', 'recorder', 'run', 'environment', 'policy', 'resources', 'dependencies', 'operations', 'observations', 'loading', 'budget', 'composition_sha256', 'accounting'], 'Manifest');
  const coverage = object(input.coverage, 'Coverage');
  fields(coverage, ['resources', 'dependency_discovery', 'runtime_loading'], 'Coverage');
  choice(coverage.resources, ['declared_only'], 'Resource coverage');
  choice(coverage.dependency_discovery, ['unknown'], 'Dependency discovery');
  choice(coverage.runtime_loading, ['caller_supplied'], 'Runtime loading');
  const recorder = object(input.recorder, 'Recorder');
  fields(recorder, ['name', 'version'], 'Recorder');
  choice(recorder.name, ['ai-factory'], 'Recorder name'); string(recorder.version, 'Recorder version');
  const run = object(input.run, 'Manifest run');
  fields(run, ['id', 'skill', 'task', 'stage', 'previous_run_id', 'status', 'initialization', 'started_at', 'finalized_at', 'capture_error'], 'Manifest run');
  if (input.schema_version !== 1 || run.id !== runId) throw new Error('Invalid or unsupported instruction manifest.');
  identifier(run.id, 'Run id'); identifier(run.skill, 'Skill');
  choice(run.status, ['open', 'complete'], 'Run status');
  choice(run.initialization, ['capturing', 'ready'], 'Initialization');
  if (run.status === 'complete' && run.initialization !== 'ready') throw new Error('An incomplete initialization cannot be finalized.');
  for (const key of ['task', 'stage', 'previous_run_id', 'started_at']) string(run[key], `Run ${key}`);
  if (run.finalized_at !== undefined) string(run.finalized_at, 'Finalized time');
  if (run.capture_error !== undefined) {
    const failure = object(run.capture_error, 'Capture error');
    fields(failure, ['resource_id', 'reason'], 'Capture error');
    identifier(failure.resource_id, 'Failed resource id'); string(failure.reason, 'Capture reason');
  }
  const ref = (value: unknown) => {
    const result = string(value, 'Resource revision');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}@[1-9][0-9]*$/.test(result)) throw new Error('Invalid resource revision.');
    return result;
  };
  // Validate persisted records before accounting, hashing, or resolving output paths.
  for (const key of ['resources', 'operations', 'observations', 'dependencies', 'loading']) {
    if (!Array.isArray(input[key])) throw new Error(`Manifest ${key} must be an array.`);
  }
  const revisions = new Set<string>();
  for (const value of input.resources as unknown[]) {
    const resource = object(value, 'Resource');
    fields(resource, ['ref', 'id', 'revision', 'role', 'locator', 'required', 'in_composition', 'addition', 'output_path', 'captured_at', 'status', 'sha256', 'bytes', 'snapshot', 'preservation'], 'Resource');
    const id = identifier(resource.id, 'Resource id');
    const revision = integer(resource.revision, 'Resource revision');
    const reference = ref(resource.ref);
    if (revision < 1 || reference !== `${id}@${revision}` || revisions.has(reference)) throw new Error('Invalid or duplicate resource revision.');
    revisions.add(reference);
    choice(resource.role, ROLES, 'Resource role');
    choice(resource.status, ['captured', 'missing', 'excluded', 'unavailable'], 'Resource status');
    choice(resource.preservation, ['snapshot', 'not_preserved', 'excluded', 'unavailable'], 'Preservation');
    string(resource.locator, 'Resource locator'); string(resource.captured_at, 'Capture time');
    for (const key of ['required', 'in_composition', 'addition']) {
      if (typeof resource[key] !== 'boolean') throw new Error(`Resource ${key} must be a boolean.`);
    }
    if (resource.output_path !== undefined) relative(resource.output_path);
    if (resource.bytes !== undefined) integer(resource.bytes, 'Resource bytes');
    if (resource.sha256 !== undefined && (typeof resource.sha256 !== 'string' || !SHA256.test(resource.sha256))) throw new Error('Invalid resource hash.');
    if (resource.snapshot !== undefined && (typeof resource.snapshot !== 'string' || resource.snapshot !== `snapshots/${resource.sha256}`)) throw new Error('Invalid snapshot locator.');
    // A preservation promise is a complete state, not just an optional locator.
    // A missing promised field must fail before verify's metadata-only warning.
    if (resource.status === 'captured') {
      if (resource.sha256 === undefined || resource.bytes === undefined) throw new Error('Captured resources require a hash and byte count.');
      choice(resource.preservation, ['snapshot', 'not_preserved'], 'Captured preservation');
      if (resource.preservation === 'snapshot' && resource.snapshot === undefined) throw new Error('Promised snapshot locator is missing.');
      if (resource.preservation === 'not_preserved' && resource.snapshot !== undefined) throw new Error('Unpreserved resources cannot have a snapshot locator.');
    } else {
      if (resource.sha256 !== undefined || resource.bytes !== undefined || resource.snapshot !== undefined) throw new Error('Uncaptured resources cannot declare preserved bytes.');
      choice(resource.preservation, resource.status === 'excluded' ? ['excluded'] : ['unavailable'], 'Uncaptured preservation');
    }
  }
  for (const value of input.operations as unknown[]) {
    const operation = object(value, 'Operation');
    fields(operation, ['kind', 'inputs', 'output', 'implementation', 'sequence', 'provenance'], 'Operation');
    choice(operation.kind, OPERATIONS, 'Operation kind');
    if (!Array.isArray(operation.inputs) || !operation.inputs.length) throw new Error('Operation inputs must be a non-empty array.');
    operation.inputs.forEach(ref); ref(operation.output);
    string(operation.implementation, 'Operation implementation');
    if (integer(operation.sequence, 'Operation sequence') < 1) throw new Error('Operation sequence must be positive.');
    choice(operation.provenance, ['declared'], 'Operation provenance');
  }
  for (const value of input.observations as unknown[]) {
    const observation = object(value, 'Observation');
    fields(observation, ['sequence', 'resource', 'kind', 'source', 'reported_at', 'recorded_at', 'reported_status', 'range', 'truncated', 'evidence', 'delivered', 'provenance'], 'Observation');
    ref(observation.resource);
    if (integer(observation.sequence, 'Observation sequence') < 1) throw new Error('Observation sequence must be positive.');
    choice(observation.kind, ['agent_report', 'tool_event', 'runtime_event'], 'Observation kind');
    choice(observation.reported_status, ['complete', 'partial', 'unknown'], 'Reported status');
    choice(observation.provenance, ['caller_supplied'], 'Observation provenance');
    for (const key of ['source', 'reported_at', 'recorded_at']) string(observation[key], `Observation ${key}`);
    if (observation.truncated !== true && observation.truncated !== false && observation.truncated !== 'unknown') throw new Error('Invalid truncation status.');
    for (const key of ['evidence', 'delivered']) if (observation[key] !== undefined) ref(observation[key]);
    if (observation.range !== undefined) {
      const range = object(observation.range, 'Range');
      fields(range, ['unit', 'start', 'end'], 'Range');
      const unit = choice(range.unit, ['bytes', 'lines'], 'Range unit');
      const start = integer(range.start, 'Range start'); const end = integer(range.end, 'Range end');
      if (end < start || (unit === 'lines' && start < 1)) throw new Error('Invalid loaded range.');
    }
  }
  for (const value of input.dependencies as unknown[]) {
    const dependency = object(value, 'Dependency');
    fields(dependency, ['from', 'to', 'required', 'condition', 'declaration', 'resolution'], 'Dependency');
    identifier(dependency.from, 'Dependency from'); identifier(dependency.to, 'Dependency to');
    if (typeof dependency.required !== 'boolean') throw new Error('Dependency required must be a boolean.');
    string(dependency.condition, 'Dependency condition'); string(dependency.declaration, 'Dependency declaration');
    choice(dependency.resolution, ['declared', 'included', 'skipped', 'missing', 'unknown'], 'Dependency resolution');
  }
  for (const value of input.loading as unknown[]) {
    const load = object(value, 'Load status');
    fields(load, ['resource', 'status', 'agent_reports', 'authenticated_runtime_load'], 'Load status');
    ref(load.resource); choice(load.status, ['unknown', 'evidence_provided'], 'Load status');
    integer(load.agent_reports, 'Agent reports'); choice(load.authenticated_runtime_load, ['unknown'], 'Runtime load authentication');
  }
  const policy = object(input.policy, 'Policy');
  fields(policy, ['snapshot_roots', 'exclude', 'settings_allowlist', 'retention', 'sensitivity'], 'Policy');
  for (const key of ['snapshot_roots', 'exclude', 'settings_allowlist']) if (!Array.isArray(policy[key])) throw new Error(`Policy ${key} must be an array.`);
  parsePolicy({ snapshot_roots: policy.snapshot_roots, exclude: policy.exclude, settings_allowlist: policy.settings_allowlist });
  choice(policy.retention, ['manual_no_automatic_deletion'], 'Retention');
  choice(policy.sensitivity, ['local_sensitive'], 'Sensitivity');
  const environment = object(input.environment, 'Environment');
  fields(environment, ['ai_factory_version', 'runtime', 'settings', 'hidden_instructions'], 'Environment');
  string(environment.ai_factory_version, 'AI Factory version'); string(environment.runtime, 'Runtime');
  choice(environment.hidden_instructions, ['unknown'], 'Hidden instructions');
  const settings = object(environment.settings, 'Settings');
  fields(settings, [...SETTING_KEYS], 'Settings');
  for (const setting of Object.values(settings)) {
    if (!['string', 'number', 'boolean'].includes(typeof setting) || (typeof setting === 'number' && !Number.isFinite(setting))) throw new Error('Invalid recorded setting.');
  }
  const accounting = object(input.accounting, 'Accounting');
  fields(accounting, ['bytes', 'estimated_tokens', 'token_method', 'known_unique_resource_bytes', 'model_context_bytes', 'budget_result'], 'Accounting');
  for (const key of ['bytes', 'estimated_tokens']) {
    const sizes = object(accounting[key], 'Sizes');
    fields(sizes, ['composition', 'additions', 'observed_load'], 'Sizes');
    for (const scope of ['composition', 'additions', 'observed_load']) if (sizes[scope] !== 'unknown') integer(sizes[scope], 'Size');
  }
  string(accounting.token_method, 'Token method'); integer(accounting.known_unique_resource_bytes, 'Unique bytes');
  choice(accounting.model_context_bytes, ['unknown'], 'Model context bytes');
  choice(accounting.budget_result, ['not_applicable', 'unknown', 'overrun', 'within'], 'Budget result');
  if (typeof input.composition_sha256 !== 'string' || !SHA256.test(input.composition_sha256)) throw new Error('Invalid composition hash.');
  if (input.budget !== undefined) {
    const budget = object(input.budget, 'Budget');
    fields(budget, ['source', 'unit', 'scope', 'value'], 'Budget');
    string(budget.source, 'Budget source'); integer(budget.value, 'Budget value');
    choice(budget.unit, ['bytes', 'estimated_tokens'], 'Budget unit');
    choice(budget.scope, ['composition', 'additions', 'observed_load'], 'Budget scope');
  }
  return input as unknown as InstructionManifest;
}

export async function readInstructionManifest(projectDir: string, runId: string, runsDir?: string): Promise<InstructionManifest> {
  const file = await localPath(projectDir, `${instructionRunPath(runId, runsDir)}/manifest.json`);
  let input: unknown;
  try { input = JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { throw new Error('Cannot read the instruction manifest; initialization may be incomplete or its JSON is invalid.'); }
  return validateManifest(input, runId);
}

async function withRunLock<T>(projectDir: string, runDir: string, work: () => Promise<T>): Promise<T> {
  const lock = await localPath(projectDir, `${runDir}/.lock`);
  let handle;
  try { handle = await fs.open(lock, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Run is locked. If its recorder was interrupted, confirm it has stopped before removing the run-local .lock file.');
    throw error;
  }
  try {
    return await work();
  } finally { await handle.close(); await fs.rm(lock, { force: true }); }
}

async function mutate(projectDir: string, runId: string, runsDir: string | undefined, update: (manifest: InstructionManifest, runDir: string) => Promise<void>): Promise<InstructionManifest> {
  const runDir = instructionRunPath(runId, runsDir);
  return withRunLock(projectDir, runDir, async () => {
    const manifest = await readInstructionManifest(projectDir, runId, runsDir);
    if (manifest.run.status !== 'open') throw new Error('Finalized runs are immutable; start a resumed invocation instead.');
    if (manifest.run.initialization !== 'ready') throw new Error('Initial capture is incomplete; start a new invocation linked to this run.');
    await update(manifest, runDir);
    await writeManifest(projectDir, runDir, manifest);
    return manifest;
  });
}

function captureFailureReason(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code)) return `Filesystem error ${code}.`;
  const safeMessages = new Set([
    'Instruction recorder does not follow symbolic links or junctions.',
    'Instruction recorder path ancestor is not a directory.',
    'Instruction resources must be regular files.',
    'Existing snapshot failed exact-byte verification.',
  ]);
  return error instanceof Error && safeMessages.has(error.message) ? error.message : 'Resource capture failed.';
}

export async function startInstructionRun(projectDir: string, value: unknown, runsDir?: string): Promise<InstructionManifest> {
  const input = object(value, 'Run specification');
  fields(input, ['run_id', 'skill', 'task', 'stage', 'previous_run_id', 'runtime', 'settings', 'policy', 'resources', 'dependencies', 'operations', 'budget'], 'Run specification');
  const runId = input.run_id === undefined ? randomUUID() : identifier(input.run_id, 'Run id');
  const runDir = instructionRunPath(runId, runsDir);
  const policy = parsePolicy(input.policy);
  const resourceInputs = array(input.resources, 'Resources').map(parseResource);
  const ids = new Set(resourceInputs.map(resource => resource.id));
  if (ids.size !== resourceInputs.length) throw new Error('Duplicate resource ids in the initial composition.');
  if (!resourceInputs.some(resource => resource.role === 'installed' && resource.output_path)) throw new Error('Declare at least one installed output with output_path.');
  const dependencies = array(input.dependencies, 'Dependencies').map(value => {
    const dep = object(value, 'Dependency');
    fields(dep, ['from', 'to', 'required', 'condition', 'declaration', 'resolution'], 'Dependency');
    return { from: identifier(dep.from, 'Dependency from'), to: identifier(dep.to, 'Dependency to'), required: boolean(dep.required, 'Dependency required'),
      condition: string(dep.condition, 'Dependency condition', 'unknown'), declaration: string(dep.declaration, 'Dependency declaration', 'unknown'),
      resolution: choice(dep.resolution ?? 'unknown', ['declared', 'included', 'skipped', 'missing', 'unknown'], 'Dependency resolution') };
  });
  if (dependencies.some(dep => !ids.has(dep.from) || !ids.has(dep.to))) throw new Error('Declare every dependency endpoint as a resource, including missing resources.');
  const operations = array(input.operations, 'Operations').map((value, index) => {
    const op = object(value, 'Operation');
    fields(op, ['kind', 'inputs', 'output', 'implementation'], 'Operation');
    const inputs = array(op.inputs, 'Operation inputs').map(value => identifier(value, 'Operation input'));
    const output = identifier(op.output, 'Operation output');
    if (!inputs.length || [...inputs, output].some(id => !ids.has(id))) throw new Error('Every operation needs declared input and output resources.');
    return { kind: choice(op.kind, OPERATIONS, 'Operation kind'), inputs: inputs.map(id => `${id}@1`), output: `${output}@1`,
      implementation: string(op.implementation, 'Operation implementation', 'unknown'), sequence: index + 1, provenance: 'declared' as const };
  });
  let budget: Budget | undefined;
  if (input.budget !== undefined) {
    const b = object(input.budget, 'Budget');
    fields(b, ['source', 'unit', 'scope', 'value'], 'Budget');
    budget = { source: string(b.source, 'Budget source'), unit: choice(b.unit, ['bytes', 'estimated_tokens'], 'Budget unit'),
      scope: choice(b.scope, ['composition', 'additions', 'observed_load'], 'Budget scope'), value: integer(b.value, 'Budget value') };
  }
  const settings: Record<string, string | number | boolean> = {};
  if (input.settings !== undefined) {
    const supplied = object(input.settings, 'Settings');
    for (const key of policy.settings_allowlist) {
      const setting = supplied[key];
      if (setting === undefined) continue;
      if (!['string', 'number', 'boolean'].includes(typeof setting)) throw new Error('Allowlisted settings must be primitive values.');
      if (typeof setting === 'number' && !Number.isFinite(setting)) throw new Error('Numeric settings must be finite.');
      settings[key] = setting as string | number | boolean;
    }
  }
  const previous = string(input.previous_run_id, 'Previous run', 'unknown');
  if (!['unknown', 'not_applicable'].includes(previous)) {
    identifier(previous, 'Previous run');
    if (previous === runId) throw new Error('A run cannot resume itself.');
    await readInstructionManifest(projectDir, previous, runsDir);
  }
  const skill = identifier(input.skill, 'Skill');
  const task = string(input.task, 'Task', 'unknown');
  const stage = string(input.stage, 'Stage', 'unknown');
  const runtime = string(input.runtime, 'Runtime', 'unknown');
  const dir = await localPath(projectDir, runDir, true);
  await fs.mkdir(dir, { mode: 0o700 }); // Never overwrite an earlier run, even if initialization failed.
  const manifest: InstructionManifest = {
    schema_version: 1, coverage: { resources: 'declared_only', dependency_discovery: 'unknown', runtime_loading: 'caller_supplied' },
    recorder: { name: 'ai-factory', version: getCurrentVersion() },
    run: { id: runId, skill, task, stage, previous_run_id: previous, status: 'open', initialization: 'capturing', started_at: new Date().toISOString() },
    environment: { ai_factory_version: getCurrentVersion(), runtime, settings, hidden_instructions: 'unknown' },
    policy: { ...policy, retention: 'manual_no_automatic_deletion', sensitivity: 'local_sensitive' },
    resources: await Promise.all(resourceInputs.map(resource => capture(projectDir, runDir, { ...resource, path: undefined }, policy, 1))),
    dependencies, operations, observations: [], loading: [], ...(budget ? { budget } : {}),
    composition_sha256: '', accounting: account({ resources: [], observations: [] }),
  };
  // Hold the same lock from the first published record through the completed
  // capture. Other writers must never successfully mutate the placeholder.
  return withRunLock(projectDir, runDir, async () => {
    await writeManifest(projectDir, runDir, manifest);
    for (const [index, resource] of resourceInputs.entries()) {
      try { manifest.resources[index] = await capture(projectDir, runDir, resource, policy, 1); }
      catch (error) {
        const reason = captureFailureReason(error);
        manifest.run.capture_error = { resource_id: resource.id, reason };
        let saved = true;
        try { await writeManifest(projectDir, runDir, manifest); } catch { saved = false; }
        throw new Error(`Run ${runId}: resource ${resource.id} capture failed. ${reason} ${saved ? 'Inspect the saved capture_error with instructions show.' : 'The diagnostic could not be persisted.'} Start a resumed invocation after correcting the resource.`);
      }
    }
    manifest.run.initialization = 'ready';
    await writeManifest(projectDir, runDir, manifest);
    return manifest;
  });
}

export async function addInstructionResource(projectDir: string, runId: string, value: unknown, runsDir?: string): Promise<InstructionManifest> {
  const input = parseResource(value);
  return mutate(projectDir, runId, runsDir, async (manifest, runDir) => {
    const previous = manifest.resources.filter(resource => resource.id === input.id);
    if (previous.length && previous.at(-1)!.role !== input.role) throw new Error('Resource role cannot change across revisions.');
    const prior = previous.at(-1);
    const inherited = prior ? { required: prior.required, in_composition: prior.in_composition, addition: prior.addition, output_path: prior.output_path } : {};
    manifest.resources.push(await capture(projectDir, runDir, { ...inherited, ...input }, manifest.policy, previous.length + 1));
  });
}

export async function observeInstructionLoad(projectDir: string, runId: string, value: unknown, runsDir?: string): Promise<InstructionManifest> {
  const input = object(value, 'Load observation');
  fields(input, ['resource', 'kind', 'source', 'reported_at', 'reported_status', 'range', 'truncated', 'evidence', 'delivered'], 'Load observation');
  return mutate(projectDir, runId, runsDir, async manifest => {
    const ref = (value: unknown, label: string) => {
      const result = string(value, label);
      if (!manifest.resources.some(resource => resource.ref === result)) throw new Error(`${label} must name a captured resource revision (id@revision).`);
      return result;
    };
    let range: Observation['range'];
    if (input.range !== undefined) {
      const r = object(input.range, 'Range');
      fields(r, ['unit', 'start', 'end'], 'Range');
      range = { unit: choice(r.unit, ['bytes', 'lines'], 'Range unit'), start: integer(r.start, 'Range start'), end: integer(r.end, 'Range end') };
      if (range.end < range.start || (range.unit === 'lines' && range.start < 1)) throw new Error('Invalid loaded range.');
    }
    const reportedAt = string(input.reported_at, 'Reported time', 'unknown');
    if (reportedAt !== 'unknown' && !Number.isFinite(Date.parse(reportedAt))) throw new Error('Reported time must be an ISO date or unknown.');
    const status = choice(input.reported_status ?? 'unknown', ['complete', 'partial', 'unknown'], 'Reported status');
    const truncated = input.truncated === undefined || input.truncated === 'unknown' ? 'unknown' : boolean(input.truncated, 'Truncated');
    if (status === 'complete' && truncated === true) throw new Error('A truncated read cannot be reported as complete.');
    manifest.observations.push({
      sequence: manifest.observations.length + 1, resource: ref(input.resource, 'Observed resource'),
      kind: choice(input.kind, ['agent_report', 'tool_event', 'runtime_event'], 'Observation kind'),
      source: string(input.source, 'Observation source'), reported_at: reportedAt, recorded_at: new Date().toISOString(),
      reported_status: status, truncated, ...(range ? { range } : {}),
      ...(input.evidence === undefined ? {} : { evidence: ref(input.evidence, 'Evidence') }),
      ...(input.delivered === undefined ? {} : { delivered: ref(input.delivered, 'Delivered payload') }), provenance: 'caller_supplied',
    });
  });
}

export async function addInstructionOperation(projectDir: string, runId: string, value: unknown, runsDir?: string): Promise<InstructionManifest> {
  const input = object(value, 'Operation');
  fields(input, ['kind', 'inputs', 'output', 'implementation'], 'Operation');
  return mutate(projectDir, runId, runsDir, async manifest => {
    const refs = new Set(manifest.resources.map(resource => resource.ref));
    const inputs = array(input.inputs, 'Operation inputs').map(value => string(value, 'Operation input'));
    const output = string(input.output, 'Operation output');
    if (!inputs.length || [...inputs, output].some(ref => !refs.has(ref))) throw new Error('Operation endpoints must name exact recorded resource revisions.');
    manifest.operations.push({ kind: choice(input.kind, OPERATIONS, 'Operation kind'), inputs, output,
      implementation: string(input.implementation, 'Operation implementation', 'unknown'),
      sequence: manifest.operations.length + 1, provenance: 'declared' });
  });
}

export async function finalizeInstructionRun(projectDir: string, runId: string, runsDir?: string): Promise<InstructionManifest> {
  return mutate(projectDir, runId, runsDir, async manifest => {
    manifest.run.status = 'complete';
    manifest.run.finalized_at = new Date().toISOString();
  });
}

export async function verifyInstructionRun(projectDir: string, runId: string, runsDir?: string, restoreDir?: string) {
  const runDir = instructionRunPath(runId, runsDir);
  let manifest: InstructionManifest;
  try { manifest = await readInstructionManifest(projectDir, runId, runsDir); }
  catch {
    return { status: 'fail', run_id: runId, complete: 'unknown', reconstructable: false, restored: false, loads: [],
      findings: [{ level: 'fail', reason: 'Instruction manifest is unreadable, malformed, or unsupported; verification could not complete.' }], accounting: 'unknown' };
  }
  const findings: Array<{ level: 'warn' | 'fail'; resource?: string; reason: string }> = [];
  const blobs = new Map<string, Buffer>();
  const expectedCompositionHash = manifest.composition_sha256;
  const expectedAccounting = JSON.stringify(manifest.accounting);
  const expectedLoading = JSON.stringify(manifest.loading);
  refresh(manifest);
  if (manifest.composition_sha256 !== expectedCompositionHash || JSON.stringify(manifest.accounting) !== expectedAccounting) {
    findings.push({ level: 'fail', reason: 'Manifest composition or accounting digest does not match its records.' });
  }
  if (JSON.stringify(manifest.loading) !== expectedLoading) findings.push({ level: 'fail', reason: 'Stored load status does not match recorded observations.' });
  for (const resource of manifest.resources) {
    if (!resource.snapshot) {
      findings.push({ level: 'warn', resource: resource.ref, reason: `${resource.status}; historical bytes are not preserved` });
      continue;
    }
    if (!resource.sha256 || !SHA256.test(resource.sha256) || resource.snapshot !== `snapshots/${resource.sha256}`) {
      findings.push({ level: 'fail', resource: resource.ref, reason: 'Invalid snapshot locator or hash.' });
      continue;
    }
    try {
      const bytes = await fs.readFile(await localPath(projectDir, `${runDir}/${resource.snapshot}`));
      if (digest(bytes) !== resource.sha256 || bytes.length !== resource.bytes) throw new Error('Snapshot bytes differ from the recorded hash or length.');
      blobs.set(resource.ref, bytes);
    } catch {
      findings.push({ level: 'fail', resource: resource.ref, reason: 'Snapshot unavailable or failed exact-byte verification; reconstruction is limited.' });
    }
  }
  const refs = new Set(manifest.resources.map(resource => resource.ref));
  for (const operation of manifest.operations) {
    if ([...operation.inputs, operation.output].some(ref => !refs.has(ref))) findings.push({ level: 'fail', reason: 'An operation refers to an unavailable resource revision.' });
  }
  const current = latest(manifest.resources);
  const byId = new Map(current.map(resource => [resource.id, resource]));
  for (const observation of manifest.observations) {
    if ([observation.resource, observation.evidence, observation.delivered].some(ref => ref !== undefined && !refs.has(ref))) findings.push({ level: 'fail', reason: 'A load observation refers to an unavailable resource revision.' });
  }
  for (const dependency of manifest.dependencies) {
    if (!byId.has(dependency.from) || !byId.has(dependency.to)) findings.push({ level: 'fail', reason: 'A dependency endpoint is not declared.' });
    if (dependency.required && byId.get(dependency.to)?.status !== 'captured') findings.push({ level: 'warn', resource: dependency.to, reason: 'Required dependency is missing, excluded, or unavailable.' });
  }
  for (const resource of current) if (resource.required && resource.status !== 'captured') findings.push({ level: 'warn', resource: resource.ref, reason: 'Required resource is not captured.' });
  if (manifest.run.status !== 'complete') findings.push({ level: 'warn', reason: 'Run is incomplete (not explicitly finalized).' });
  const outputs = current.filter(resource => resource.output_path);
  const outputNames = outputs.map(resource => relative(resource.output_path!));
  if (new Set(outputNames.map(name => process.platform === 'win32' ? name.toLowerCase() : name)).size !== outputNames.length) {
    findings.push({ level: 'fail', reason: 'Duplicate reconstruction output paths.' });
  }
  const comparedNames = outputNames.map(name => process.platform === 'win32' ? name.toLowerCase() : name);
  if (comparedNames.some(name => comparedNames.some(other => other !== name && other.startsWith(`${name}/`)))) {
    findings.push({ level: 'fail', reason: 'A reconstruction output file is also used as an output directory.' });
  }
  const reconstructable = outputs.length > 0 && outputs.every(resource => blobs.has(resource.ref)) && !findings.some(finding => finding.level === 'fail');
  let restored = false;
  if (restoreDir && !reconstructable) findings.push({ level: 'fail', reason: 'Cannot restore: recorded output bytes are unavailable or verification failed.' });
  if (restoreDir && reconstructable) {
    const destination = relative(restoreDir);
    if (sensitive(destination) || outputs.some(resource => sensitive(resource.output_path!))) throw new Error('Refusing sensitive reconstruction destination.');
    const root = await localPath(projectDir, destination, true);
    await fs.mkdir(root, { mode: 0o700 }); // Requires a new destination; never overwrites live instructions.
    for (const resource of outputs) {
      const target = await localPath(projectDir, `${destination}/${relative(resource.output_path!)}`, true);
      await fs.writeFile(target, blobs.get(resource.ref)!, { flag: 'wx', mode: 0o600 });
      if (digest(await fs.readFile(target)) !== resource.sha256) throw new Error('Restored output failed exact-byte verification.');
    }
    restored = true;
  }
  const loads = manifest.resources.map(resource => {
    const reports = manifest.observations.filter(observation => observation.resource === resource.ref);
    return { resource: resource.ref, status: reports.some(report => report.evidence && blobs.has(report.evidence)) ? 'evidence_provided' : 'unknown',
      agent_reports: reports.filter(report => report.kind === 'agent_report').length, authenticated_runtime_load: 'unknown' };
  });
  return { status: findings.some(finding => finding.level === 'fail') ? 'fail' : findings.length ? 'warn' : 'pass',
    run_id: runId, complete: manifest.run.status === 'complete', reconstructable, restored, loads, findings, accounting: manifest.accounting };
}
