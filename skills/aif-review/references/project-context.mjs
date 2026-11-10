// Pinned project context is collected independently of the Reviewer response.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const configPath = '.ai-factory/config.yaml';
const defaultDescription = '.ai-factory/DESCRIPTION.md';
const error = 'PR project context requires verified pinned description content';
const quote = text => "'" + text.replaceAll("'", "'\\''") + "'";
const assert = (condition, message = error) => { if (!condition) throw new Error(message); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function relativePath(value) {
  assert(typeof value === 'string');
  const path = value.replace(/^(?:\.\/)+/, '');
  assert(path.length && !path.startsWith('/') && !/^[A-Za-z]:/.test(path) && !/[\\\x00-\x1f]/.test(path)
    && path.split('/').every(part => part && part !== '.' && part !== '..'));
  return path;
}

// Deliberately bounded: unsupported/ambiguous YAML makes config unavailable,
// never an inferred default. Supports the block mappings used by config-template.
function descriptionPath(content) {
  let inPaths = false, inlinePaths = false, childIndent, selected = defaultDescription, first = true, ended = false;
  const roots = new Set(), children = new Set();
  for (const line of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    assert(!ended && !/^\s*\t/.test(line), 'Unsupported pinned config syntax');
    if (line === '---' && first) { first = false; continue; }
    first = false;
    if (line === '...') { ended = true; continue; }
    if (!line.startsWith(' ')) {
      const root = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:(.*)$/.exec(line);
      assert(root && !roots.has(root[1]), 'Unsupported or duplicate pinned config mapping');
      roots.add(root[1]);
      inPaths = root[1] === 'paths';
      if (inPaths) assert(/^(?:\s*|\s*\{\}\s*)(?:#.*)?$/.test(root[2]), 'Unsupported pinned paths mapping');
      inlinePaths = inPaths && /^\s*\{\}/.test(root[2]);
      continue;
    }
    if (!inPaths) continue;
    assert(!inlinePaths, 'Unsupported children under inline pinned paths');
    const entry = /^( +)([A-Za-z_][A-Za-z0-9_-]*)\s*:(.*)$/.exec(line);
    assert(entry && !children.has(entry[2]), 'Unsupported or duplicate pinned path key');
    childIndent ??= entry[1].length;
    assert(entry[1].length === childIndent, 'Unsupported nested pinned path');
    children.add(entry[2]);
    if (entry[2] !== 'description') continue;
    const raw = entry[3].trim();
    let value;
    if (raw.startsWith('"')) {
      const match = /^("(?:[^"\\]|\\.)*")\s*(?:#.*)?$/.exec(raw);
      assert(match, 'Unsupported pinned description scalar');
      value = JSON.parse(match[1]);
    } else if (raw.startsWith("'")) {
      const match = /^'((?:[^']|'')*)'\s*(?:#.*)?$/.exec(raw);
      assert(match, 'Unsupported pinned description scalar');
      value = match[1].replaceAll("''", "'");
    } else {
      value = raw.replace(/\s+#.*$/, '').trim();
      assert(value && !/^[\[\]{}&*!>|%@`?#]/.test(value) && !/:\s|:$/.test(value)
        && !/^(?:null|~|true|false)$/i.test(value), 'Unsupported pinned description scalar');
    }
    selected = relativePath(value);
  }
  return selected;
}

function contextResult(raw, source, path) {
  const file = typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw);
  assert(file?.repository === source.repository && file.commit_sha === source.head_sha && file.path === path
    && ['available', 'unavailable'].includes(file.status), 'PR context source identity mismatch');
  if (file.status === 'available') {
    assert(typeof file.content === 'string', 'PR context source content missing');
    const bytes = Buffer.from(file.content);
    assert(bytes.length <= 1024 * 1024 && !file.content.includes('\0') && bytes.toString('utf8') === file.content
      && file.bytes === bytes.length && file.sha256 === digest(bytes)
      && file.blob_sha === createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
    'PR context source integrity mismatch');
  }
  return file;
}

export async function collectProjectContext(source, helper, call) {
  const read = async path => contextResult(await call('Bash', {
    command: `node ${quote(helper)} context ${source.repository} ${source.head_sha} ${quote(path)}`,
  }), source, path);
  const config = await read(configPath);
  let path = null;
  const unavailable = [];
  if (config.status === 'available') {
    try { path = descriptionPath(config.content); }
    catch { unavailable.push({ path: configPath, commit_sha: source.head_sha,
      reason: 'Pinned config syntax/path is unsupported or ambiguous; description path is unknown' }); }
  } else if (config.reason_code === 'not-found') path = defaultDescription;
  else unavailable.push({ path: configPath, commit_sha: source.head_sha, reason: config.reason || 'Pinned config unavailable' });
  const description = path ? await read(path) : null;
  if (description?.status === 'unavailable') unavailable.push({ path, commit_sha: source.head_sha,
    reason: description.reason || 'Pinned description unavailable' });
  return { path, config, description, files: [description, config].filter(Boolean), unavailable_context: unavailable };
}

export function pinnedProjectContext(drafted, evidence) {
  if (!drafted.project_context) return '';
  assert(evidence.path && evidence.description?.status === 'available');
  assert(drafted.project_context_path === undefined || drafted.project_context_path === evidence.path);
  assert(Array.isArray(drafted.source.files));
  const files = drafted.source.files.filter(file => file?.path === evidence.path);
  assert(files.length === 1);
  for (const key of ['repository', 'path', 'commit_sha', 'status', 'bytes', 'sha256', 'blob_sha', 'content']) {
    assert(isDeepStrictEqual(files[0][key], evidence.description[key]));
  }
  assert(evidence.description.content.includes(drafted.project_context));
  return drafted.project_context;
}

export function mergeProjectContext(source, evidence) {
  const reserved = new Set([configPath, evidence.path]);
  return { ...source, files: [...structuredClone(evidence.files), ...(source.files ?? []).filter(file => !reserved.has(file?.path))],
    unavailable_context: [...new Map([...(source.unavailable_context ?? []), ...evidence.unavailable_context]
      .map(item => [JSON.stringify(item), item])).values()] };
}
