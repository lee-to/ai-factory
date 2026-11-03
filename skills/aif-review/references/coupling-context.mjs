// Bounded, declared PR dependencies. This module never discovers repositories.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const MAX_FILES = 16;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 2 * MAX_FILE_BYTES;
const identity = file => JSON.stringify([file.repository, file.commit_sha, file.path]);
const core = ['repository', 'commit_sha', 'path', 'status', 'content', 'bytes', 'sha256', 'blob_sha'];
const fields = new Set([...core, 'reason']);
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (condition, reason) => { if (!condition) throw new Error(`Coupling context: ${reason}`); };
const debug = message => {
  if (process.env.AIF_REVIEW_DEBUG === '1') console.error(`[aif-review:check] coupling ${message}`);
};

function validateIdentity(file) {
  assert(file && typeof file === 'object' && !Array.isArray(file), 'record must be an object');
  assert(typeof file.repository === 'string' && /^[\w.-]+\/[\w.-]+$/.test(file.repository), 'invalid repository');
  assert(typeof file.commit_sha === 'string' && /^[a-f0-9]{40}$/.test(file.commit_sha), 'full commit SHA required');
  assert(typeof file.path === 'string' && file.path.length > 0 && !/[\x00-\x1f\x7f\\:]/.test(file.path)
    && !file.path.startsWith('/') && file.path.split('/').every(part => part && part !== '.' && part !== '..'), 'unsafe path');
  assert(['available', 'unavailable'].includes(file.status), 'invalid status');
}

function validateContent(file) {
  assert(typeof file.content === 'string' && !file.content.includes('\0'), 'content required');
  const bytes = Buffer.from(file.content, 'utf8');
  assert(bytes.toString('utf8') === file.content && Number.isSafeInteger(file.bytes) && file.bytes >= 0
    && bytes.length === file.bytes && file.sha256 === hash(bytes)
    && file.blob_sha === createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), 'content integrity mismatch');
}

function sameCore(left, right) {
  return core.every(key => isDeepStrictEqual(left[key], right[key]));
}

// independentlyVerifiedFiles must come from collectProjectContext, never from
// a Reviewer draft/source.files. Availability and self-consistent hashes alone
// do not establish that separate host provenance.
export async function collectCouplingContext(source, dependencies, helper, call, independentlyVerifiedFiles = []) {
  debug('preflight start');
  assert(Array.isArray(dependencies), 'coupling_dependencies must be an array');
  assert(Array.isArray(independentlyVerifiedFiles), 'independent project evidence must be an array');
  const independentFiles = new Map();
  const protectedFiles = new Map();
  for (const file of independentlyVerifiedFiles) {
    validateIdentity(file);
    assert(file.repository === source.repository && file.commit_sha === source.head_sha, 'independent project evidence scope mismatch');
    independentFiles.set(identity(file), structuredClone(file));
    if (file.status !== 'available') continue;
    validateContent(file);
    protectedFiles.set(identity(file), structuredClone(file));
  }
  const unique = new Map();
  // Validate the ENTIRE declaration before issuing a source call, including
  // records that will later be excluded by scope or resource limits.
  for (const file of dependencies) {
    validateIdentity(file);
    assert(Object.keys(file).every(key => fields.has(key)), 'unknown dependency field');
    if (file.status === 'available') validateContent(file);
    else {
      assert(typeof file.reason === 'string' && file.reason.trim(), 'unavailable reason required');
      assert(['content', 'bytes', 'sha256', 'blob_sha'].every(key => !(key in file)), 'unavailable record carries content metadata');
    }
    const key = identity(file);
    if (protectedFiles.has(key) && !sameCore(file, protectedFiles.get(key))) {
      debug('[FIX:177] conflicting declaration rejected; independent project evidence retained');
      assert(false, 'declaration conflicts with independently verified project evidence');
    }
    assert(!unique.has(key) || isDeepStrictEqual(unique.get(key), file), 'conflicting duplicate identity');
    unique.set(key, file);
  }
  // Reviewer files are claims too. Completeness must be checked before reading
  // even a valid declaration; self-consistent hashes do not confer provenance.
  const sourceFiles = source.files ?? [];
  assert(Array.isArray(sourceFiles), 'source.files must be an array');
  for (const file of sourceFiles) {
    validateIdentity(file);
    const key = identity(file);
    if (unique.has(key)) continue;
    const established = independentFiles.get(key);
    if (!established) {
      debug('[FIX:177] undeclared source evidence rejected before additional reads');
      assert(false, 'undeclared source evidence; include every additional file in coupling_dependencies');
    }
    assert(sameCore(file, established) && (file.status === 'available' || file.reason === established.reason),
      'independent source evidence mismatch');
  }
  debug(`[FIX:177] source evidence preflight complete; ${sourceFiles.length} records`);
  debug(`preflight complete; ${unique.size} unique records`);
  const files = [];
  const unavailable = [];
  let usedBytes = 0;
  let slot = 0;
  const exclude = (file, reason) => {
    const record = { repository: file.repository, commit_sha: file.commit_sha, path: file.path, status: 'unavailable', reason };
    const established = protectedFiles.get(identity(file));
    files.push(established ?? record);
    unavailable.push(established ? { ...record, scope: 'coupling-recheck',
      reason: `Coupling recheck unavailable: ${reason}; independently verified project evidence retained` } : record);
    if (established) debug('[FIX:177] independent project evidence retained after limited recheck');
    debug('source unavailable; bounded context retained');
  };
  for (const file of unique.values()) {
    slot += 1;
    if (file.repository !== source.repository || ![source.head_sha, source.merge_base_sha].includes(file.commit_sha)) {
      exclude(file, 'Outside the current PR repository/pinned head or merge-base; no source access authorized');
      continue;
    }
    if (slot > MAX_FILES || file.bytes > MAX_FILE_BYTES || usedBytes >= MAX_TOTAL_BYTES
        || (file.status === 'available' && usedBytes + file.bytes > MAX_TOTAL_BYTES)) {
      exclude(file, 'Coupling context limit: 16 identities, 1 MiB/file, 2 MiB total');
      continue;
    }
    // A declared unavailable source is a limitation, not positive evidence.
    if (file.status === 'unavailable') { exclude(file, file.reason); continue; }
    debug(`read source ${slot}; bytes used ${usedBytes}`);
    const raw = await call('Bash', { command: `node ${quote(helper)} context ${file.repository} ${file.commit_sha} ${quote(file.path)}` });
    const verified = typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw);
    validateIdentity(verified);
    assert(identity(verified) === identity(file), 'host source identity mismatch');
    if (verified.status === 'unavailable') {
      assert(typeof verified.reason === 'string' && verified.reason.trim(), 'host unavailable reason required');
      exclude(file, verified.reason);
      continue;
    }
    validateContent(verified);
    assert(sameCore(file, verified), 'host source content mismatch');
    if (verified.bytes > MAX_FILE_BYTES || usedBytes + verified.bytes > MAX_TOTAL_BYTES) {
      exclude(file, 'Verified source exceeds coupling context byte limit');
      continue;
    }
    usedBytes += verified.bytes;
    files.push(verified);
  }
  // Run AFTER project-context's path-only reservation merge. Preserve both
  // revisions of reserved files; never silently replace conflicting evidence.
  for (const file of sourceFiles) {
    const key = identity(file);
    if (!unique.has(key)) continue;
    const verified = files.find(entry => identity(entry) === key);
    if (verified.status === 'available') {
      // A canonical host failure has no bytes to conflict with. Recovery is
      // permitted only after the declaration matched a fresh host read above.
      const initial = independentFiles.get(key);
      const recovered = initial?.status === 'unavailable' && isDeepStrictEqual(file, initial);
      assert(sameCore(file, verified) || recovered, 'source package conflicts with verified dependency');
      if (recovered) debug('[FIX:177] independent source availability recovered after verified host read');
    }
  }
  // Only the separate host baseline may survive without a declaration. Retain
  // canonical unavailable metadata too, never arbitrary Reviewer annotations.
  const existing = [...independentFiles.values()].filter(file => !unique.has(identity(file)));
  debug(`complete; ${files.length} records, ${usedBytes} bytes, ${unavailable.length} unavailable`);
  return { ...source, files: [...existing, ...files],
    unavailable_context: [...(source.unavailable_context ?? []), ...unavailable] };
}
