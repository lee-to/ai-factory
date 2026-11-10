#!/usr/bin/env node
// Kept with references so flat workflow installations also receive this helper.
// Read-only source collection: no checkout, fetch, index changes, or file writes.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';

const MAX_CONTEXT = 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const digest = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const debug = message => {
  if (process.env.AIF_REVIEW_DEBUG === '1') console.error(`[aif-review:source] ${message}`);
};

function command(binary, args) {
  debug(`${binary} ${args.join(' ')}`);
  try {
    return execFileSync(binary, args, {
      encoding: 'buffer', maxBuffer: 32 * 1024 * 1024, timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      env: { ...process.env, GH_PAGER: 'cat', GH_PROMPT_DISABLED: '1',
        GIT_NO_REPLACE_OBJECTS: '1', GIT_OPTIONAL_LOCKS: '0' },
    });
  } catch (error) {
    debug(`${binary} failed: ${error.code ?? error.status ?? error.signal ?? 'unknown'}`);
    throw error;
  }
}

function api(endpoint, accept = 'application/vnd.github+json') {
  return command('gh', ['api', '--method', 'GET', endpoint, '-H', `Accept: ${accept}`]);
}

function json(bytes) { return JSON.parse(decoder.decode(bytes)); }
function sha(value) {
  if (!/^[a-f0-9]{40}$/.test(value ?? '')) throw new Error('Expected a full GitHub commit SHA');
  return value;
}

function repository(value) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value ?? '')
      || value.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('Expected repository in owner/name form');
  }
  return value;
}

function filePath(value) {
  if (!value || value.startsWith('/') || value.includes('\\') || value.includes('\0')
      || value.split('/').some(part => !part || part === '.' || part === '..')
      || /^[A-Za-z]:/.test(value)) throw new Error('Expected a repository-relative file path');
  return value;
}

function pull(repo, number) {
  const pr = json(api(`repos/${repo}/pulls/${number}`));
  return { base_sha: sha(pr.base.sha), head_sha: sha(pr.head.sha) };
}

function snapshot(repo, number) {
  if (!/^[1-9][0-9]*$/.test(number ?? '')) throw new Error('Expected a positive PR number');
  const pinned = pull(repo, number);
  const comparison = json(api(`repos/${repo}/compare/${pinned.base_sha}...${pinned.head_sha}?per_page=1`));
  if (comparison.base_commit?.sha !== pinned.base_sha) {
    throw new Error('Compare response does not match the pinned commits');
  }
  const mergeBase = sha(comparison.merge_base_commit?.sha);
  let diff;
  let source;
  try {
    // Compare the server-proven merge base, even in a shallow local repository.
    diff = command('git', ['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--no-relative',
      '--no-renames', '--binary', '--full-index', '--ignore-submodules=none',
      '--src-prefix=a/', '--dst-prefix=b/', mergeBase, pinned.head_sha, '--']);
    source = 'git-objects';
  } catch {
    diff = api(`repos/${repo}/compare/${mergeBase}...${pinned.head_sha}`, 'application/vnd.github.diff');
    source = 'github-compare';
  }
  const text = decoder.decode(diff);
  if (text && !text.startsWith('diff --git ')) throw new Error('Response is not a full diff');
  let observed = null;
  let stale = null;
  let freshnessError = null;
  try {
    observed = pull(repo, number);
    stale = observed.base_sha !== pinned.base_sha || observed.head_sha !== pinned.head_sha;
  } catch {
    // The pinned diff is complete; a failed freshness probe must not discard it.
    freshnessError = 'PR metadata could not be re-read; current base/head are unknown, review is bound to the recorded SHAs';
  }
  return {
    schema_version: 1, mode: 'pr', repository: repo, pr: Number(number), ...pinned,
    merge_base_sha: mergeBase,
    diff: { sha256: digest(diff), bytes: diff.length, source, text },
    files: [], unavailable_context: [], observed, stale, freshness_error: freshnessError,
  };
}

function localComparison(file, bytes) {
  try {
    const root = fs.realpathSync(command('git', ['rev-parse', '--show-toplevel']).toString().trim());
    const target = path.resolve(root, file);
    const relative = path.relative(root, fs.realpathSync(target));
    if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)
        || !fs.lstatSync(target).isFile()) return { status: 'excluded' };
    if (fs.statSync(target).size > MAX_CONTEXT) return { status: 'excluded' };
    const hash = digest(fs.readFileSync(target));
    return { status: hash === digest(bytes) ? 'matches' : 'differs', sha256: hash };
  } catch { return { status: 'unavailable' }; }
}

function context(repo, commit, file) {
  sha(commit);
  filePath(file);
  const identity = { repository: repo, commit_sha: commit, path: file };
  let bytes;
  let blob;
  let source;
  try {
    const entry = command('git', ['ls-tree', '-z', commit, '--', `:(literal)${file}`]).toString('utf8');
    if (!entry) return { ...identity, status: 'unavailable', reason_code: 'not-found',
      reason: 'Path is absent from the pinned Git tree' };
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t/.exec(entry);
    if (!match) throw new Error('Not a regular Git blob');
    blob = match[2];
    const size = Number(command('git', ['cat-file', '-s', blob]).toString());
    if (size > MAX_CONTEXT) throw new Error('Context exceeds size limit');
    bytes = command('git', ['cat-file', 'blob', blob]);
    source = 'git-objects';
  } catch {
    try {
      // Walk non-recursive trees: recursive tree responses may be truncated, and
      // the Contents API may dereference symlinks rather than return their blob.
      let tree = sha(json(api(`repos/${repo}/git/commits/${commit}`)).tree?.sha);
      const parts = file.split('/');
      for (let index = 0; index < parts.length; index += 1) {
        const listing = json(api(`repos/${repo}/git/trees/${tree}`));
        if (listing.truncated) throw new Error('Incomplete tree');
        const entry = listing.tree.find(item => item.path === parts[index]);
        if (!entry) return { ...identity, status: 'unavailable', reason_code: 'not-found',
          reason: 'Path is absent from the pinned GitHub tree' };
        if (index < parts.length - 1) {
          if (entry?.type !== 'tree') throw new Error('Not a directory');
          tree = sha(entry.sha);
        } else {
          if (entry?.type !== 'blob' || !['100644', '100755'].includes(entry.mode)
              || entry.size > MAX_CONTEXT) throw new Error('Unsupported source');
          blob = sha(entry.sha);
        }
      }
      const result = json(api(`repos/${repo}/git/blobs/${blob}`));
      if (result.sha !== blob || result.encoding !== 'base64' || result.size > MAX_CONTEXT) {
        throw new Error('Unsupported source');
      }
      bytes = Buffer.from(result.content, 'base64');
      if (bytes.length !== result.size) throw new Error('Incomplete file content');
      source = 'github-git-blob';
    } catch {
      return { ...identity, status: 'unavailable', reason: 'File missing, inaccessible, oversized, or not a regular text blob; excluded from conclusions' };
    }
  }
  // Verify the exact bytes instead of trusting an API content field alone.
  const actualBlob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (actualBlob !== blob) {
    return { ...identity, status: 'unavailable', reason: 'Blob identity mismatch; excluded from conclusions' };
  }
  let content;
  try {
    content = decoder.decode(bytes);
    if (content.includes('\0')) throw new Error('Binary content');
  } catch {
    return { ...identity, status: 'unavailable', reason: 'Binary or invalid UTF-8 content; excluded from conclusions' };
  }
  return {
    ...identity, status: 'available', blob_sha: blob, sha256: digest(bytes),
    bytes: bytes.length, source, content, local: localComparison(file, bytes),
  };
}

try {
  const [mode, repo, revision, file, ...extra] = process.argv.slice(2);
  repository(repo);
  let result;
  if (mode === 'snapshot' && revision && file === undefined) result = snapshot(repo, revision);
  else if (mode === 'context' && file !== undefined && !extra.length) result = context(repo, revision, file);
  else throw new Error('Usage: pr-source.mjs snapshot <owner/repo> <PR> | context <owner/repo> <commit-SHA> <path>');
  if (result.freshness_error) console.error(`WARN [aif-review:source]: ${result.freshness_error}`);
  else if (result.stale) console.error('WARN [aif-review:source]: PR moved during capture; review is bound to the recorded SHAs');
  if (result.status === 'unavailable') console.error(`WARN [aif-review:source]: ${result.reason}`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  // Do not dump child-process stdout/stderr (it may contain repository content).
  console.error(`ERROR [aif-review:source]: ${error.status !== undefined || error.code ? 'Source command failed; check Git/gh access or enable AIF_REVIEW_DEBUG=1' : error.message}`);
  process.exitCode = 1;
}
