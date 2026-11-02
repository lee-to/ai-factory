#!/usr/bin/env node
// Shared by the skill's prepare/finish protocol and the offline replay runner.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';

import { collectProjectContext, mergeProjectContext, pinnedProjectContext } from './project-context.mjs';
import { collectCouplingContext } from './coupling-context.mjs';

export const WORKFLOW_VERSION = 3;
const marked = text => /\(confidence: (?:low|medium)\)\s*$/.test(text);
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const reference = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
const skillText = () => {
  const location = ['../SKILL.md', '../aif-review.md'].map(name => new URL(name, import.meta.url))
    .find(candidate => fs.existsSync(candidate));
  if (!location) throw new Error('Review skill entrypoint not found beside references');
  return fs.readFileSync(location, 'utf8');
};
const debug = message => {
  if (process.env.AIF_REVIEW_DEBUG === '1') console.error(`[aif-review:check] ${message}`);
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateDraft(draft) {
  assert(draft && Array.isArray(draft.items), 'review.items must be an array');
  for (const item of draft.items) {
    assert(['critical', 'suggestion'].includes(item.section), 'Invalid finding section');
    assert(typeof item.text === 'string' && item.text.trim(), 'Finding text is required');
    assert(Array.isArray(item.files) && item.files.every(file => typeof file === 'string'), 'Finding files must be an array of paths');
  }
  for (const gate of draft.context_gates ?? []) {
    assert(['pass', 'warn', 'fail'].includes(gate.status), 'Invalid context gate status');
    assert(typeof gate.text === 'string' && Array.isArray(gate.files), 'Context gate text/files required');
  }
}

export function prepareCheck(input) {
  const lenses = normalizeLenses(input.lenses);
  validateDraft(input.review);
  assert(typeof input.diff === 'string', 'Exact reviewed diff is required');
  assert(typeof input.project_context === 'string', 'Project context is required');
  assert(['pr', 'staged', 'commits'].includes(input.source?.mode), 'Source mode is required');
  assert(typeof input.validator?.available === 'boolean' && typeof input.validator?.read_only_enforced === 'boolean', 'Actual validator capabilities are required');
  if (lenses.length) debug(`[FIX:177] coupling lens enabled; source mode=${input.source.mode}`);
  const review = structuredClone(input.review);
  for (const item of review.items.filter(item => item.validate === false)) {
    assert(input.source.mode === 'commits' && item.kind === 'commit-structure' && !marked(item.text),
      'Only established commit-structure findings in commits mode may bypass validation');
  }
  // Display order is also the validator numbering order. Commit-only findings
  // remain in the review but never enter the squashed-diff validator request.
  review.items.sort((a, b) => Number(a.section === 'suggestion') - Number(b.section === 'suggestion'));
  const items = review.items.filter(item => item.validate !== false);
  const values = {
    PROJECT_CONTEXT: input.project_context,
    REVIEWED_DIFF: input.diff,
    SOURCE_PACKAGE: JSON.stringify(input.source),
    ITEMS: items.map((item, index) => `### Item ${index + 1} (section: ${item.section})\n${item.text}`).join('\n\n'),
    SEVERITY_RULES: reference('SEVERITY.md'),
  };
  const template = reference('VALIDATOR.md').split(/\r?\n---\r?\n/).slice(1).join('\n---\n');
  assert(template, 'Validator prompt separator is missing');
  // Single replacement pass: source bytes containing {{ITEMS}} etc. are evidence,
  // not recursive template instructions.
  const prompt = (lenses.length ? reference('COUPLING-REVIEW.md') + '\n\n' : '')
    + template.replace(/\{\{(PROJECT_CONTEXT|REVIEWED_DIFF|SOURCE_PACKAGE|ITEMS|SEVERITY_RULES)\}\}/g, (_, key) => values[key]);
  debug(`prepared ${items.length} validator items`);
  return {
    workflow_version: WORKFLOW_VERSION, review, source: input.source,
    ...(lenses.length ? { lenses } : {}),
    task: items.length ? { subagent_type: input.validator?.available === false ? 'general-purpose' : 'review-validator', prompt } : null,
    boundary_warning: input.validator?.available === false
      ? 'WARN [+check]: review-validator unavailable, validated with a full-tool agent'
      : input.validator?.read_only_enforced === false
        ? 'WARN [+check]: review-validator has no enforced tool allowlist on this runtime, validated with a sandbox-only boundary' : null,
  };
}

function normalizeLenses(lenses) {
  assert(lenses === undefined || (Array.isArray(lenses) && lenses.every(value => value === 'coupling')
    && new Set(lenses).size === lenses.length), 'Invalid lenses: expected an optional unique coupling allowlist');
  return lenses === undefined ? [] : [...lenses];
}

function parseItems(text) {
  const blocks = new Map();
  const headings = [...text.matchAll(/^### Item (\d+)(?: \(section: (critical|suggestion)\))?\s*$/gm)];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const id = Number(heading[1]);
    const body = text.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? text.length);
    const modifiedStart = /^Modified-text:[ \t]*/m.exec(body);
    const prefix = modifiedStart ? body.slice(0, modifiedStart.index) : body;
    const fields = name => [...prefix.matchAll(new RegExp(`^${name}:[ \\t]*(.*)$`, 'gm'))];
    const verdicts = fields('Verdict');
    const severities = fields('Severity');
    const reasons = fields('Reason');
    const reason = reasons[0]?.[1].trim() ?? '';
    const modified = modifiedStart ? body.slice(modifiedStart.index + modifiedStart[0].length).trim() : '';
    const verdict = verdicts[0]?.[1].trim();
    const severity = severities[0]?.[1].trim() ?? 'unchanged';
    const valid = verdicts.length === 1 && ['keep', 'modify', 'drop'].includes(verdict)
      && severities.length <= 1 && ['unchanged', 'critical', 'suggestion'].includes(severity)
      && reasons.length === 1 && reason.length > 0
      && (verdict !== 'modify' || modified.length > 0);
    // A duplicate heading is ambiguous even if one copy is valid.
    const duplicate = blocks.has(id);
    blocks.set(id, { valid: valid && !duplicate, section: heading[2], verdict, severity,
      text: modified, reason });
  }
  return blocks;
}

function projectGate(review, uncertainty, counters, validationFailures, warnings) {
  const critical = review.items.filter(item => item.section === 'critical' && !marked(item.text));
  const gates = review.context_gates ?? [];
  const failedGates = gates.filter(gate => gate.status === 'fail');
  const status = validationFailures || critical.length || failedGates.length ? 'fail'
    : review.items.length || uncertainty || gates.some(gate => gate.status === 'warn') ? 'warn' : 'pass';
  const areas = new Set(failedGates.map(gate => gate.area));
  let command = status === 'fail' ? '/aif-fix' : '/aif-commit';
  if (!critical.length && failedGates.length && areas.size === 1) {
    command = { rules: '/aif-rules', architecture: '/aif-architecture', roadmap: '/aif-roadmap' }[[...areas][0]] ?? command;
  }
  const blockers = [
    ...critical.map((item, index) => ({ id: `review-critical-${index + 1}`, severity: 'error',
      ...(item.files[0] ? { file: item.files[0] } : {}), summary: item.text })),
    ...failedGates.map((gate, index) => ({ id: `review-context-${index + 1}`, severity: 'error',
      ...(gate.files[0] ? { file: gate.files[0] } : {}), summary: gate.text })),
  ];
  if (validationFailures) blockers.push({ id: 'review-validation-failed', severity: 'error',
    summary: `${validationFailures} unvalidated item(s). ${warnings.join(' ')}` });
  const reason = status === 'fail' ? 'Blocking review findings remain.'
    : status === 'warn' ? 'Review findings or unconfirmed evidence remain.' : 'Review found no material issues.';
  return {
    schema_version: 1, gate: 'review', status, blocking: status === 'fail', blockers,
    affected_files: [...new Set([...(review.reviewed_files ?? []), ...review.items.flatMap(item => item.files), ...gates.flatMap(gate => gate.files)])].sort(),
    suggested_next: { command: validationFailures ? null : command, reason: validationFailures
      ? 'Review is incomplete; re-run /aif-review +check to resolve unvalidated items.' : reason + (counters
      ? ` After +check filtering: ${counters.hidden} hidden, ${counters.adjusted} adjusted, ${counters.reclassified} reclassified.` : '') },
  };
}

function renderReviewSources(source, freshness) {
  const describe = value => {
    if (value === undefined || value === null || value === '') return 'Not recorded.';
    if (Array.isArray(value)) return value.length ? value.map(describe).join('; ') : 'None recorded.';
    if (typeof value === 'object') return Object.entries(value)
      .map(([key, entry]) => `${key}: ${describe(entry)}`).join('; ') || 'Not recorded.';
    return String(value);
  };
  const cell = value => describe(value).replace(/[&<>|`\\\r\n]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '|': '&#124;', '`': '&#96;', '\\': '&#92;',
    '\r': '', '\n': '<br>',
  })[character]);
  const table = (headers, rows) => [headers, headers.map(() => '---'), ...rows]
    .map(row => `| ${row.map(cell).join(' | ')} |`).join('\n');
  const excerptRanges = excerpts => excerpts?.map(excerpt => {
    if (!excerpt || typeof excerpt !== 'object' || Array.isArray(excerpt)) return excerpt;
    const { content, text, ...identity } = excerpt;
    return identity;
  });
  const files = source.files ?? [];
  const sections = ['### Review Sources', table(['Source', 'Recorded value'], [
    ['Repository', source.repository], ['PR', source.pr],
    ['Base SHA', source.base_sha], ['Head SHA', source.head_sha], ['Merge-base SHA', source.merge_base_sha],
    ['Diff SHA-256', source.diff?.sha256], ['Diff bytes', source.diff?.bytes], ['Diff source', source.diff?.source],
    ['Capture freshness', source.stale === true ? 'PR moved during capture; only the recorded snapshot was reviewed.'
      : source.stale === false ? 'No PR movement detected during capture.' : 'Not recorded.'],
    ['Observed commits during capture', source.observed],
  ]), '#### Additional files'];
  sections.push(files.length ? table(
    ['Path', 'Side / commit SHA', 'Blob SHA', 'Content SHA-256', 'File details', 'Excerpt ranges', 'Local comparison'],
    files.map(file => {
      const { path, side, commit_sha, blob_sha, sha256, excerpts, line_ranges, local, content, ...details } = file;
      return [path, { side: side ?? (commit_sha === source.head_sha ? 'head'
        : commit_sha === source.merge_base_sha ? 'before' : 'Not recorded.'), commit_sha },
      blob_sha, sha256, details, excerptRanges(excerpts) ?? line_ranges, local];
    }),
  ) : 'No additional files were recorded.');
  for (const [key, title, empty] of [
    ['unavailable_context', 'Unavailable context', 'No unavailable context was recorded.'],
    ['excluded_conclusions', 'Excluded conclusions', 'No excluded conclusions were recorded.'],
  ]) {
    sections.push(`#### ${title}`, source[key]?.length
      ? table(['#', 'Details'], source[key].map((entry, index) => [index + 1, entry])) : empty);
  }
  const confirmed = freshness?.confirmed === true;
  sections.push(`Freshness: ${confirmed ? 'confirmed' : 'unconfirmed'} — ${confirmed
    ? 'Current base/head match the recorded snapshot.'
    : 'Current base/head could not be confirmed; this review covers only the recorded snapshot.'}`);
  if (freshness?.reason) sections.push(table(['Freshness limitation', 'Details'], [['Reason', freshness.reason]]));
  return sections.join('\n\n');
}

export function finishCheck({ prepared, result, freshness }) {
  assert(prepared?.workflow_version === WORKFLOW_VERSION, 'Unsupported check workflow version');
  normalizeLenses(prepared.lenses);
  validateDraft(prepared.review);
  const review = structuredClone(prepared.review);
  const warnings = [];
  if (prepared.task && prepared.boundary_warning) warnings.push(prepared.boundary_warning);
  const counters = { hidden: 0, adjusted: 0, reclassified: 0 };
  let uncertainty = Boolean(review.uncertainty || prepared.source.stale || prepared.source.unavailable_context?.length);
  if (prepared.source.mode === 'pr' && freshness?.confirmed !== true) uncertainty = true;
  const text = typeof result?.text === 'string' ? result.text : '';
  const failed = prepared.task && (result?.outcome !== 'success' || !text.trim());
  let contractFailures = 0;
  let itemWarnings = false;
  if (failed) {
    const reason = result?.outcome === 'success' ? typeof result.text === 'string' ? 'empty response' : 'malformed response' : result?.outcome ?? 'unavailable';
    warnings.push(`WARN [+check]: validator failed (${reason}), all items kept as-is`);
  } else if (prepared.task) {
    const blocks = parseItems(text);
    let id = 0;
    review.items = review.items.flatMap(item => {
      if (item.validate === false) return [item];
      id += 1;
      const block = blocks.get(id);
      if (!block?.valid || (block.section && block.section !== item.section)) {
        warnings.push(`WARN [+check]: validator response for item ${id} was malformed, kept as-is`);
        itemWarnings = true;
        return [item];
      }
      if ((marked(item.text) && block.verdict === 'keep')
          || (block.verdict === 'modify' && /\(confidence: (?:low|medium)\)/.test(block.text))) {
        warnings.push(`WARN [+check]: validator response for item ${id} violated the marked-item contract, kept as-is`);
        itemWarnings = true;
        if (!marked(item.text)) contractFailures += 1;
        return [item];
      }
      if (block.verdict === 'drop') {
        counters.hidden += 1;
        if (/unverified|unavailable|missing pinned/i.test(block.reason)) {
          uncertainty = true;
          prepared = { ...prepared, source: { ...prepared.source,
            excluded_conclusions: [...(prepared.source.excluded_conclusions ?? []), block.reason] } };
        }
        return [];
      }
      if (block.verdict === 'modify') {
        item.text = block.text;
        counters.adjusted += 1;
      }
      if (block.severity !== 'unchanged' && block.severity !== item.section) {
        item.text += item.section === 'critical' ? ' [+check: demoted from Critical Issues]' : ' [+check: promoted from Suggestions]';
        item.section = block.severity;
        counters.reclassified += 1;
      }
      return [item];
    });
  }
  const validationFailures = review.items.filter(item => marked(item.text)).length + contractFailures;
  const gate = projectGate(review, uncertainty, failed || itemWarnings ? null : counters, validationFailures, warnings);
  const sections = [review.summary ?? '## Code Review'];
  for (const [section, title] of [['critical', 'Critical Issues'], ['suggestion', 'Suggestions']]) {
    sections.push(`### ${title}\n${review.items.filter(item => item.section === section).map(item => `- ${item.text}`).join('\n') || 'None.'}`);
  }
  if (review.context_gates?.length) sections.push(`### Context Gates\n${review.context_gates.map(gate => `${gate.status === 'fail' ? 'ERROR' : gate.status === 'warn' ? 'WARN' : 'PASS'}: ${gate.text}`).join('\n')}`);
  for (const [key, title] of [['questions', 'Questions'], ['positive_notes', 'Positive Notes']]) {
    if (review[key]?.length) sections.push(`### ${title}\n${review[key].join('\n')}`);
  }
  if (prepared.source.mode === 'pr') {
    sections.push(renderReviewSources(prepared.source, freshness));
  }
  if (!failed && !itemWarnings) sections.push(`Filtered: ${counters.hidden} hidden, ${counters.adjusted} adjusted, ${counters.reclassified} reclassified by +check`);
  sections.push(...warnings);
  sections.push('```aif-gate-result\n' + JSON.stringify(gate, null, 2) + '\n```');
  debug(`finished with ${gate.status}; ${warnings.length} warnings`);
  return { output: sections.join('\n\n'), gate, review, warnings, counters: failed ? null : counters };
}

// The transport is supplied by the host. It must return explicit error outcomes;
// infrastructure errors (including missing replay entries) propagate to the host.
export async function runCheck(input, call) {
  const prepared = prepareCheck(input);
  let result;
  if (prepared.task) {
    result = await call('Task', prepared.task);
    const taskId = result?.task_id;
    if (result?.outcome === 'pending') assert(typeof taskId === 'string' && taskId.length, 'Pending validator response requires a task_id');
    for (let poll = 0; result?.outcome === 'pending' && poll < 3; poll += 1) {
      result = await call('TaskStatus', { task_id: taskId });
    }
    if (result?.outcome === 'pending') result = { outcome: 'timeout' };
  }
  let freshness;
  if (input.source.mode === 'pr') {
    const observed = await call('Bash', { command: `gh api --method GET repos/${input.source.repository}/pulls/${input.source.pr}` });
    try {
      const pr = typeof observed === 'string' ? JSON.parse(observed) : observed;
      freshness = { confirmed: pr?.base?.sha === input.source.base_sha && pr?.head?.sha === input.source.head_sha };
    } catch { freshness = { confirmed: false }; }
  }
  return finishCheck({ prepared, result, freshness });
}

export async function runReview(request, call) {
  assert(!Object.hasOwn(request, 'lenses'), 'run selects lenses only from argument tokens');
  const tokens = (request.argument ?? '').trim().split(/\s+/).filter(Boolean);
  assert(tokens.includes('+check'), 'Replay workflow requires the explicit +check flag');
  const lenses = tokens.includes('+coupling') ? ['coupling'] : [];
  const args = tokens.filter(token => token !== '+check' && token !== '+coupling');
  assert(args.length <= 1, 'Expected at most one review target');
  const target = args[0] ?? '';
  const url = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/([1-9]\d*)\/?$/.exec(target);
  const pr = url?.[2] ?? (/^#?[1-9]\d*$/.test(target) ? target.replace('#', '') : null);
  let source;
  let diff;
  let projectEvidence;
  let excerpt;
  if (pr) {
    assert(typeof request.working_directory === 'string' && request.working_directory.trim(),
      'PR working_directory must be a non-empty string');
    const repository = url?.[1] ?? request.repository;
    assert(/^[\w.-]+\/[\w.-]+$/.test(repository ?? ''), 'PR repository must be explicit');
    const helper = fileURLToPath(new URL('pr-source.mjs', import.meta.url)).replaceAll('\\', '/');
    const captured = await call('Bash', { command: `node ${shellQuote(helper)} snapshot ${repository} ${pr}` });
    source = typeof captured === 'string' ? JSON.parse(captured) : structuredClone(captured);
    assert(source.mode === 'pr' && source.repository === repository && source.pr === Number(pr), 'PR source identity mismatch');
    assert(['base_sha', 'head_sha', 'merge_base_sha'].every(key => /^[a-f0-9]{40}$/.test(source[key])), 'PR commits must be pinned full SHAs');
    diff = source.diff.text;
    assert(typeof diff === 'string' && source.diff.bytes === Buffer.byteLength(diff)
      && source.diff.sha256 === createHash('sha256').update(diff).digest('hex'), 'PR diff hash/size mismatch');
    projectEvidence = await collectProjectContext(source, helper, call);
    source = mergeProjectContext(source, projectEvidence);
    // The host reviewer returns the completed package, including every pinned
    // context dependency retrieved via PR-SOURCE.md; never local PR evidence.
  } else if (!target) {
    diff = await call('Bash', { command: 'git diff --cached' });
    if (!diff) diff = await call('Bash', { command: 'git diff' });
    source = { mode: 'staged', local_read_only_context: true };
  } else {
    throw new Error('Commits mode: follow skill ref/commit collection, then use prepare/finish');
  }
  assert(typeof diff === 'string', 'Source tool must return the exact diff text');
  const drafted = await call('Reviewer', {
    skill: skillText(), procedure: reference('CHECK-MODE.md'),
    ...(lenses.length ? { lenses, coupling_methodology: reference('COUPLING-REVIEW.md') } : {}),
    project_context: source.mode === 'pr' ? request.working_directory : request.project_context ?? '', source: structuredClone(source), diff,
  });
  if (source.mode === 'pr') {
    assert(typeof drafted.project_context === 'string', 'PR reviewer project_context must be a string (empty when no pinned excerpt is used)');
    const completed = drafted.source;
    assert(completed && ['mode', 'schema_version', 'repository', 'pr', 'base_sha', 'head_sha', 'merge_base_sha'].every(key => completed[key] === source[key])
      && isDeepStrictEqual(completed.diff, source.diff), 'Reviewer changed pinned PR identity/diff');
    excerpt = pinnedProjectContext(drafted, projectEvidence);
    source = mergeProjectContext({ ...completed, stale: source.stale || completed.stale,
      unavailable_context: [...new Map([...(source.unavailable_context ?? []), ...(completed.unavailable_context ?? [])]
        .map(item => [JSON.stringify(item), item])).values()] }, projectEvidence);
    if (lenses.length) {
      const helper = fileURLToPath(new URL('pr-source.mjs', import.meta.url)).replaceAll('\\', '/');
      source = await collectCouplingContext(source, drafted.coupling_dependencies, helper, call, projectEvidence.files);
    }
  }
  const { diff: capturedDiff, ...metadata } = source;
  if (capturedDiff) metadata.diff = { ...capturedDiff, text: undefined };
  // Runtime location and versioned description have different provenance. Keep
  // the directory even when no excerpt is used; never fall back to local prose.
  const projectContext = source.mode === 'pr'
    ? request.working_directory + (excerpt ? '\n' + excerpt : '')
    : request.project_context ?? '';
  return runCheck({ review: drafted.review, source: metadata, diff,
    ...(lenses.length ? { lenses } : {}),
    project_context: projectContext, validator: request.validator }, call);
}

// Resumable host protocol. Each invocation replays the acknowledged prefix in
// memory and emits the next request. The host executes only that new request.
// Reviewer means the parent agent drafts internally; Task is the fresh validator.
export async function advanceReview({ request, responses = [] }) {
  let index = 0;
  const pending = Symbol('next request');
  let next;
  try {
    const result = await runReview(request, async (tool, args) => {
      const call = { call_id: ++index, tool, args };
      if (index > responses.length) {
        next = call;
        throw pending;
      }
      const recorded = responses[index - 1];
      assert(recorded.call_id === call.call_id && recorded.tool === tool && isDeepStrictEqual(recorded.args, args), `Response does not match request ${index}`);
      return recorded.response;
    });
    assert(index === responses.length, 'Unexpected trailing tool responses');
    return { done: true, result };
  } catch (error) {
    if (error === pending) return { done: false, next };
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const operation = process.argv[2];
    assert(['run', 'prepare', 'finish'].includes(operation), 'Usage: check-workflow.mjs run|prepare|finish < input.json');
    const result = operation === 'run' ? await advanceReview(input)
      : operation === 'prepare' ? prepareCheck(input) : finishCheck(input);
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    console.error(`ERROR [aif-review:check]: ${error.message}`);
    process.exitCode = 1;
  }
}
