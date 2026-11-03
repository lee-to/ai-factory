#!/usr/bin/env node
// Explicit fixture maintenance only. Never imported or run by tests/CI.
// All responses below are scripted data; no model, GitHub or SDK is called.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadScenarioFile } from '../node_modules/@cutcode/ai-tester/dist/scenario/loader.js';
import { createSandbox } from '../node_modules/@cutcode/ai-tester/dist/sandbox/worktree.js';
import { runReview, WORKFLOW_VERSION } from '../skills/aif-review/references/check-workflow.mjs';
import { argsHash } from './lib/tool-replay.mjs';

if (process.argv[2] !== '--write') throw new Error('Explicit --write required to replace controlled recordings');
const root = fileURLToPath(new URL('../', import.meta.url));
const tests = path.join(root, 'skills/aif-review/tests');
const helper = path.join(root, 'skills/aif-review/references/pr-source.mjs').replaceAll('\\', '/');
const normalize = value => JSON.parse(JSON.stringify(value).replaceAll(helper, '<references>/pr-source.mjs'));
const critical = 'Unauthenticated requests return 200 because verifyToken is ignored. `src/handler.ts:4`. Return 401 when verification fails.';
const suggestion = 'Token comparison deserves a documented timing policy. `src/auth.ts:2`. Document the comparison contract.';
const markedCritical = critical + ' (confidence: medium)';
const pinnedDescription = '# Pinned authentication service\nThis description belongs to the recorded PR head.';
const baseReview = { items: [
  { section: 'critical', text: critical, files: ['src/handler.ts'] },
  { section: 'suggestion', text: suggestion, files: ['src/auth.ts'] },
], questions: ['Which clients consume this handler?'], positive_notes: ['The verifier is isolated.'], context_gates: [] };
const block = (id, section, verdict, extra = '') => `### Item ${id} (section: ${section})\nVerdict: ${verdict}\nReason: Verified against the recorded diff.\n${extra}`;
const keep = block(1, 'critical', 'keep') + block(2, 'suggestion', 'keep');
const drop = block(1, 'critical', 'drop') + block(2, 'suggestion', 'drop');
const success = text => ({ outcome: 'success', text });
const happyFile = 'check-mode-happy-path.spec.yaml';
const failureFile = 'check-mode-validator-failure.spec.yaml';
const malformedFile = 'check-mode-validator-malformed.spec.yaml';
const specs = [
  { id: 'happy-path', file: happyFile, original: true, response: success(block(1, 'critical', 'modify', 'Modified-text: ' + critical + '\n') + block(2, 'suggestion', 'drop')),
    expected: { status: 'fail', command: '/aif-fix', counters: { hidden: 1, adjusted: 1, reclassified: 0 }, contains: [critical], absent: [suggestion] } },
  ...['refusal', 'timeout', 'exception'].map(outcome => ({ id: 'validator-' + outcome, file: failureFile, original: true, response: { outcome },
    expected: { status: 'fail', command: '/aif-fix', counters: null, preserved: [critical, suggestion], absent: ['Filtered:'] } })),
  { id: 'validator-empty', file: failureFile, original: true, response: success(''),
    expected: { status: 'fail', command: '/aif-fix', counters: null, preserved: [critical, suggestion], absent: ['Filtered:'] } },
  { id: 'validator-nontext-response', file: failureFile, original: true, response: success({ items: [] }),
    expected: { status: 'fail', command: '/aif-fix', counters: null, preserved: [critical, suggestion], contains: ['malformed response'], absent: ['Filtered:'] } },
  ...[
    ['missing-verdict', '### Item 1 (section: critical)\nReason: Truncated.\n'],
    ['missing-heading', ''],
    ['missing-reason', '### Item 1 (section: critical)\nVerdict: drop\n'],
    ['empty-reason', '### Item 1 (section: critical)\nVerdict: drop\nReason:   \t\n'],
    ['duplicate-reason', block(1, 'critical', 'drop', 'Reason: Contradictory reason.\n')],
    ['unknown-verdict', block(1, 'critical', 'maybe')],
    ['unknown-severity', block(1, 'critical', 'keep', 'Severity: urgent\n')],
    ['missing-modified-text', block(1, 'critical', 'modify')],
    ['duplicate-heading', block(1, 'critical', 'drop') + block(1, 'critical', 'keep')],
  ].map(([id, text]) => ({ id: 'partial-' + id, file: malformedFile, original: true,
    response: success(text + block(2, 'suggestion', 'drop')),
    expected: { status: 'fail', command: '/aif-fix', counters: { hidden: 1, adjusted: 0, reclassified: 0 },
      preserved: [critical], absent: [suggestion, 'Filtered:', 'validator failed'], contains: ['item 1 was malformed'] } })),
  { id: 'pending-then-done', file: happyFile, response: { outcome: 'pending', task_id: 'validator-1' },
    polls: [{ outcome: 'pending', task_id: 'validator-1' }, success(keep)],
    expected: { status: 'fail', command: '/aif-fix', counters: { hidden: 0, adjusted: 0, reclassified: 0 }, preserved: [critical, suggestion] } },
  { id: 'pending-budget-timeout', file: failureFile, response: { outcome: 'pending', task_id: 'validator-1' },
    polls: Array.from({ length: 3 }, () => ({ outcome: 'pending', task_id: 'validator-1' })),
    expected: { status: 'fail', command: '/aif-fix', counters: null, preserved: [critical, suggestion], absent: ['Filtered:'] } },
  { id: 'drop-all-confirmed', file: happyFile, response: success(drop),
    expected: { status: 'pass', command: '/aif-commit', counters: { hidden: 2, adjusted: 0, reclassified: 0 }, absent: [critical, suggestion] } },
  { id: 'reclassify-both-directions', file: happyFile,
    response: success(block(1, 'critical', 'keep', 'Severity: suggestion\n') + block(2, 'suggestion', 'keep', 'Severity: critical\n')),
    expected: { status: 'fail', command: '/aif-fix', counters: { hidden: 0, adjusted: 0, reclassified: 2 }, contains: ['promoted from Suggestions', 'demoted from Critical Issues'] } },
  { id: 'context-gate-survives-drop', file: happyFile, response: success(drop),
    gates: [{ area: 'rules', status: 'fail', text: 'Required logging is missing.', files: ['src/handler.ts'] }],
    expected: { status: 'fail', command: '/aif-rules', counters: { hidden: 2, adjusted: 0, reclassified: 0 }, contains: ['Required logging is missing.'] } },
  ...['refusal', 'timeout', 'exception'].map(outcome => ({ id: 'marked-' + outcome, file: failureFile,
    marked: true, response: { outcome }, expected: { status: 'fail', command: null, validation_failed: true,
      counters: null, preserved: [markedCritical, suggestion], absent: ['Filtered:'] } })),
  { id: 'marked-partial', file: malformedFile, marked: true,
    response: success('### Item 1 (section: critical)\nReason: Truncated.\n' + block(2, 'suggestion', 'drop')),
    expected: { status: 'fail', command: null, validation_failed: true, counters: { hidden: 1, adjusted: 0, reclassified: 0 }, preserved: [markedCritical], absent: ['Filtered:'] } },
  { id: 'marked-keep-rejected', file: malformedFile, marked: true, response: success(keep),
    expected: { status: 'fail', command: null, validation_failed: true, counters: { hidden: 0, adjusted: 0, reclassified: 0 }, preserved: [markedCritical], contains: ['violated the marked-item contract'] } },
  { id: 'marked-multiline-confirmed', file: happyFile, marked: true,
    response: success(block(1, 'critical', 'modify', 'Modified-text: Authentication is bypassed.\n`src/handler.ts:4`.\nReturn 401 on invalid tokens.\n') + block(2, 'suggestion', 'drop')),
    expected: { status: 'fail', command: '/aif-fix', counters: { hidden: 1, adjusted: 1, reclassified: 0 }, contains: ['Authentication is bypassed.\n`src/handler.ts:4`.\nReturn 401 on invalid tokens.'], absent: ['(confidence: medium)'] } },
  { id: 'introduced-marker-rejected', file: malformedFile,
    response: success(block(1, 'critical', 'modify', 'Modified-text: ' + markedCritical + '\n') + block(2, 'suggestion', 'drop')),
    expected: { status: 'fail', command: null, validation_failed: true, counters: { hidden: 1, adjusted: 0, reclassified: 0 }, preserved: [critical], absent: [markedCritical] } },
  ...[true, false].map(fresh => ({ id: 'pr-drop-all-' + (fresh ? 'fresh' : 'unconfirmed'), file: happyFile, pr: true, fresh,
    response: success(drop), expected: { status: fresh ? 'pass' : 'warn', command: '/aif-commit', counters: { hidden: 2, adjusted: 0, reclassified: 0 }, contains: ['Review Sources', fresh ? 'Freshness: confirmed' : 'Freshness: unconfirmed'] } })),
  { id: 'pr-pinned-project-context', file: happyFile, pr: true, fresh: true, pinned_context: pinnedDescription,
    response: success(drop), expected: { status: 'pass', command: '/aif-commit', counters: { hidden: 2, adjusted: 0, reclassified: 0 },
      validator_context: '/sandbox\n' + pinnedDescription, pinned_context: pinnedDescription } },
  { id: 'pr-custom-pinned-project-context', file: happyFile, pr: true, fresh: true, pinned_context: pinnedDescription,
    description_path: 'docs/product.md', response: success(drop),
    expected: { status: 'pass', command: '/aif-commit', counters: { hidden: 2, adjusted: 0, reclassified: 0 },
      validator_context: '/sandbox\n' + pinnedDescription, pinned_context: pinnedDescription, description_path: 'docs/product.md' } },
  { id: 'pr-config-unavailable', file: happyFile, pr: true, fresh: true, config_unavailable: true, response: success(drop),
    expected: { status: 'warn', command: '/aif-commit', counters: { hidden: 2, adjusted: 0, reclassified: 0 }, contains: ['Pinned config unavailable'] } },
  { id: 'pr-config-unsupported', file: happyFile, pr: true, fresh: true, config_text: 'paths: {description: other.md}\n', response: success(drop),
    expected: { status: 'warn', command: '/aif-commit', counters: { hidden: 2, adjusted: 0, reclassified: 0 }, contains: ['description path is unknown'] } },
  { id: 'pr-empty-description-unavailable', file: happyFile, pr: true, fresh: true, empty: true, missing_description: true,
    expected: { status: 'warn', command: '/aif-commit', counters: { hidden: 0, adjusted: 0, reclassified: 0 }, dispatches: 0, contains: ['description unavailable'] } },
  { id: 'pr-description-unavailable', file: happyFile, pr: true, fresh: true, missing_description: true, response: success(drop),
    expected: { status: 'warn', command: '/aif-commit', counters: { hidden: 2, adjusted: 0, reclassified: 0 },
      contains: ['Review Sources', '.ai-factory/DESCRIPTION.md', 'description unavailable'] } },
  { id: 'pr-missing-evidence', file: happyFile, pr: true, fresh: true, missing: true, response: success(drop),
    expected: { status: 'warn', command: '/aif-commit', counters: { hidden: 2, adjusted: 0, reclassified: 0 }, contains: ['Review Sources', 'src/dependency.ts'] } },
  { id: 'pr-validator-unavailable-evidence', file: happyFile, pr: true, fresh: true,
    response: success('### Item 1 (section: critical)\nVerdict: drop\nReason: Unverified due to missing pinned context: src/dependency.ts.\n' + block(2, 'suggestion', 'drop')),
    expected: { status: 'warn', command: '/aif-commit', counters: { hidden: 2, adjusted: 0, reclassified: 0 }, contains: ['Excluded conclusions', 'src/dependency.ts'] } },
  ...[false, true].map(available => ({ id: available ? 'explicit-sandbox-boundary' : 'explicit-fallback-boundary', file: happyFile,
    validator: { available, read_only_enforced: false }, response: success(keep),
    expected: { status: 'fail', command: '/aif-fix', counters: { hidden: 0, adjusted: 0, reclassified: 0 },
      contains: [available ? 'sandbox-only boundary' : 'full-tool agent'] } })),
  { id: 'empty-items-no-dispatch', file: happyFile, empty: true,
    expected: { status: 'pass', command: '/aif-commit', counters: { hidden: 0, adjusted: 0, reclassified: 0 }, dispatches: 0 } },
  ...[false, true].map(pr => ({ id: pr ? 'coupling-pr' : 'coupling-staged', file: happyFile,
    pr, fresh: true, coupling: true, response: success(keep),
    expected: { status: 'fail', command: '/aif-fix', counters: { hidden: 0, adjusted: 0, reclassified: 0 }, preserved: [critical, suggestion] } })),
];

const diffs = new Map();
for (const name of new Set(specs.map(spec => spec.file))) {
  const { scenario } = await loadScenarioFile(path.join(tests, name));
  const sandbox = await createSandbox(scenario.scenario, scenario.fixtures);
  try {
    diffs.set(name, execFileSync('git', ['diff', '--cached'], { cwd: sandbox.path, encoding: 'utf8', windowsHide: true }));
  } finally { await sandbox.cleanup(); }
}
const cases = [];
for (const spec of specs) {
  const diff = diffs.get(spec.file);
  const source = { schema_version: 1, mode: 'pr', repository: 'fixture/demo', pr: 123,
    base_sha: 'a'.repeat(40), head_sha: 'b'.repeat(40), merge_base_sha: 'c'.repeat(40),
    diff: { text: diff, sha256: createHash('sha256').update(diff).digest('hex'), bytes: Buffer.byteLength(diff), source: 'git-objects' },
    files: [], unavailable_context: spec.missing_description
      ? [{ path: '.ai-factory/DESCRIPTION.md', commit_sha: 'b'.repeat(40), reason: 'description unavailable' }]
      : spec.missing ? [{ path: 'src/dependency.ts', reason: 'unavailable' }] : [], stale: false };
  const review = structuredClone(baseReview);
  if (spec.marked) review.items[0].text = markedCritical;
  if (spec.empty) review.items = [];
  if (spec.gates) review.context_gates = spec.gates;
  const request = { argument: spec.pr ? '123 +check' : '+check',
    project_context: spec.pr ? 'LOCAL_CONTEXT_SENTINEL: this local description must never reach the PR review.' : '/sandbox\nDemo authentication service.',
    validator: spec.validator ?? { available: true, read_only_enforced: true },
    ...(spec.pr ? { repository: 'fixture/demo', working_directory: '/sandbox' } : {}) };
  if (spec.coupling) request.argument += ' +coupling';
  const contextFile = (path, content) => {
    const bytes = Buffer.from(content);
    return { repository: source.repository, commit_sha: source.head_sha, path, status: 'available', source: 'git-objects',
      blob_sha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
      sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, content };
  };
  const config = spec.config_unavailable
    ? { repository: source.repository, commit_sha: source.head_sha, path: '.ai-factory/config.yaml', status: 'unavailable', reason: 'Pinned config unavailable' }
    : spec.config_text ? contextFile('.ai-factory/config.yaml', spec.config_text)
      : spec.description_path
    ? contextFile('.ai-factory/config.yaml', 'paths:\n  description: ' + JSON.stringify(spec.description_path) + '\n')
    : { repository: source.repository, commit_sha: source.head_sha, path: '.ai-factory/config.yaml',
      status: 'unavailable', reason_code: 'not-found', reason: 'Path is absent from the pinned Git tree' };
  const description = spec.missing_description
    ? { repository: source.repository, commit_sha: source.head_sha, path: '.ai-factory/DESCRIPTION.md', status: 'unavailable', reason: 'description unavailable' }
    : contextFile(spec.description_path ?? '.ai-factory/DESCRIPTION.md', spec.pinned_context ?? '# Pinned fixture project');
  const records = [];
  let polls = 0;
  await runReview(request, async (tool, args) => {
    let response;
    if (tool === 'Bash') {
      response = args.command === 'git diff --cached' ? diff
        : args.command.includes(' snapshot ') ? source
          : args.command.includes(' context ') ? args.command.includes('.ai-factory/config.yaml') ? config : description
            : spec.fresh ? { base: { sha: source.base_sha }, head: { sha: source.head_sha } } : { error: 'freshness unavailable' };
    } else if (tool === 'Reviewer') response = { review, ...(spec.coupling && spec.pr ? { coupling_dependencies: [] } : {}), ...(spec.pr ? { source: structuredClone(args.source), project_context: spec.pinned_context ?? '',
      ...(spec.description_path ? { project_context_path: spec.description_path } : {}) } : {}) };
    else if (tool === 'Task') response = spec.response;
    else if (tool === 'TaskStatus') response = spec.polls[polls++];
    else throw new Error('Unscripted tool: ' + tool);
    records.push({ call_id: records.length + 1, tool, args_sha256: argsHash(normalize(args)), response: structuredClone(response) });
    return response;
  });
  cases.push({ id: spec.id, scenario_file: spec.file, original_assertions: Boolean(spec.original), request, records, expected: spec.expected });
}
fs.mkdirSync(path.join(tests, '_replay'), { recursive: true });
fs.writeFileSync(path.join(tests, '_replay/cases.json'), JSON.stringify({ schema_version: 1, workflow_version: WORKFLOW_VERSION, provenance: 'scripted deterministic tool responses; no model calls', cases }, null, 2) + '\n');
console.log(`Captured ${cases.length} controlled workflows. Review the diff before accepting new recordings.`);
