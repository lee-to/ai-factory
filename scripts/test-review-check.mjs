#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadScenarioFile } from '../node_modules/@cutcode/ai-tester/dist/scenario/loader.js';
import { createSandbox } from '../node_modules/@cutcode/ai-tester/dist/sandbox/worktree.js';
import { evaluateAssertions } from '../node_modules/@cutcode/ai-tester/dist/assertions/index.js';
import { advanceReview, runReview, WORKFLOW_VERSION } from '../skills/aif-review/references/check-workflow.mjs';
import { ToolReplay, argsHash, replayKey } from './lib/tool-replay.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const skillDir = path.join(root, 'skills/aif-review');
const casesPath = path.join(skillDir, 'tests/_replay/cases.json');
const fixture = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const sourceHash = file => hash(fs.readFileSync(path.join(root, file)));
const helper = path.join(skillDir, 'references/pr-source.mjs').replaceAll('\\', '/');
const normalize = value => JSON.parse(JSON.stringify(value).replaceAll(helper, '<references>/pr-source.mjs'));
const report = {
  schema_version: 1, mode: 'replay-only', inference: false, live_tools: false,
  runtime: { name: 'review-replay', version: WORKFLOW_VERSION, node: process.version,
    ai_tester: JSON.parse(fs.readFileSync(path.join(root, 'node_modules/@cutcode/ai-tester/package.json'))).version,
    workflow_sha256: sourceHash('skills/aif-review/references/check-workflow.mjs'),
    replay_sha256: sourceHash('scripts/lib/tool-replay.mjs'), runner_sha256: sourceHash('scripts/test-review-check.mjs') },
  skill: { name: 'aif-review', package_version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version,
    sources: Object.fromEntries(['SKILL.md', 'references/CHECK-MODE.md', 'references/VALIDATOR.md', 'references/SEVERITY.md', 'references/pr-source.mjs', 'references/project-context.mjs', 'references/COUPLING-REVIEW.md', 'references/coupling-context.mjs']
      .map(file => [file, sourceHash(`skills/aif-review/${file}`)])) },
  recordings_sha256: hash(fs.readFileSync(casesPath)), cases: [], checks: [],
};
let failed = 0;
const check = async (name, fn) => {
  try { await fn(); report.checks.push({ name, pass: true }); }
  catch (error) { failed += 1; report.checks.push({ name, pass: false, error: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
};

await check('all former spec-only scenarios have recordings', () => {
  assert.equal(fixture.schema_version, 1);
  assert.equal(fixture.workflow_version, WORKFLOW_VERSION);
  const specs = fs.readdirSync(path.join(skillDir, 'tests')).filter(file => file.endsWith('.spec.yaml')).sort();
  assert(specs.length > 0, 'No scenarios discovered');
  for (const file of specs) assert(fixture.cases.some(test => test.scenario_file === file), `Unexecuted scenario: ${file}`);
  assert.match(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8'), /check-workflow\.mjs run/);
});

const scenarios = new Map();
for (const name of new Set(fixture.cases.map(test => test.scenario_file))) {
  const loaded = await loadScenarioFile(path.join(skillDir, 'tests', name));
  assert.equal(loaded.scenario.runner.runtime, 'review-replay', 'Recorded scenarios must not select a live runtime');
  // Use ai-tester's actual fixture setup: files_staged really are written and
  // staged. Git here is local fixture setup, never a live replay fallback.
  const sandbox = await createSandbox(loaded.scenario.scenario, loaded.scenario.fixtures);
  try {
    const diff = execFileSync('git', ['diff', '--cached'], { cwd: sandbox.path, encoding: 'utf8', windowsHide: true });
    assert(diff.length > 0, 'files_staged did not produce a staged diff');
    scenarios.set(name, { ...loaded, diff, sandboxPath: sandbox.path,
      sha256: hash(fs.readFileSync(loaded.filePath)) });
  } finally { await sandbox.cleanup(); }
}

for (const test of fixture.cases) {
  const record = { id: test.id, scenario: test.scenario_file, scenario_sha256: scenarios.get(test.scenario_file).sha256 };
  report.cases.push(record);
  try {
    const replay = new ToolReplay(test.records, { normalize });
    const loaded = scenarios.get(test.scenario_file);
    const stagedRecord = test.records.find(call => call.tool === 'Bash' && typeof call.response === 'string' && call.response.startsWith('diff --git'));
    if (stagedRecord) assert.equal(stagedRecord.response, loaded.diff, 'Recorded Git diff drifted from the staged YAML fixtures');
    const journal = { request: test.request, responses: [] };
    let step;
    // Execute the same public host entrypoint used by the skill, rather than
    // constructing the final output or calling the parser directly.
    for (let turn = 0; turn < 20; turn += 1) {
      step = await advanceReview(journal);
      if (step.done) break;
      const { tool, args } = step.next;
      journal.responses.push({ ...step.next, response: await replay.call(tool, args) });
    }
    assert(step?.done, 'Host protocol exhausted its turn budget');
    replay.assertConsumed();
    const result = step.result;
    const drafted = replay.calls.find(call => call.tool === 'Reviewer').response.review;
    if (result.counters === null) assert.deepEqual(result.review.items, drafted.items, 'Validator failure changed original findings');
    const trace = {
      finalOutput: result.output, runner: { sandboxPath: loaded.sandboxPath },
      toolCallSummary: { unansweredQuestions: 0 },
      turns: replay.calls.map(call => ({ toolCalls: [{ name: call.tool, input: call.args,
        resultContent: JSON.stringify(call.response), resultIsError: false }] })),
    };
    const assertions = test.original_assertions ? evaluateAssertions(loaded.scenario.assertions, trace) : [];
    assert(assertions.every(item => item.pass), JSON.stringify(assertions.filter(item => !item.pass)));
    assert.equal(result.gate.status, test.expected.status);
    assert.equal(result.gate.blocking, result.gate.status === 'fail');
    assert.equal(result.gate.suggested_next.command, test.expected.command);
    assert.deepEqual(result.counters, test.expected.counters);
    assert.equal(result.gate.blockers.filter(item => item.id === 'review-validation-failed').length, test.expected.validation_failed ? 1 : 0);
    const established = result.review.items.filter(item => item.section === 'critical' && !/\(confidence: (?:low|medium)\)\s*$/.test(item.text));
    const gateBlockers = (result.review.context_gates ?? []).filter(item => item.status === 'fail');
    assert.deepEqual(result.gate.blockers.filter(item => item.id !== 'review-validation-failed').map(item => item.summary),
      [...established.map(item => item.text), ...gateBlockers.map(item => item.text)], 'Final blockers do not match surviving confirmed findings/context gates');
    assert.deepEqual(result.review.questions, drafted.questions, 'Validation changed non-actionable questions');
    assert.deepEqual(result.review.positive_notes, drafted.positive_notes, 'Validation changed positive notes');
    if (result.gate.status !== 'fail') assert.deepEqual(result.gate.blockers, []);
    assert.equal(replay.calls.filter(call => call.tool === 'Task').length, test.expected.dispatches ?? 1);
    const task = replay.calls.find(call => call.tool === 'Task');
    if (task) {
      assert(task.args.prompt.includes(fs.readFileSync(path.join(skillDir, 'references/SEVERITY.md'), 'utf8')), 'Severity rules were not inlined verbatim');
      const sourceCall = replay.calls[0];
      const diff = typeof sourceCall.response === 'string' ? sourceCall.response : sourceCall.response.diff.text;
      assert(task.args.prompt.includes(diff), 'Exact reviewed diff was lost');
      if (test.request.repository) {
        const reviewerCall = replay.calls.find(call => call.tool === 'Reviewer');
        assert.equal(reviewerCall.args.project_context, test.request.working_directory, 'PR reviewer lost its working directory');
        assert(!JSON.stringify(reviewerCall.args).includes(test.request.project_context), 'Local project context reached PR reviewer');
        assert(!task.args.prompt.includes(test.request.project_context), 'Local project context reached PR validator');
        const context = task.args.prompt.match(/^## Project context\r?\n([\s\S]*?)^## Reviewed diff\r?\n/m)?.[1].trim();
        assert.equal(context, test.expected.validator_context ?? test.request.working_directory,
          'PR validator did not receive the working directory and exact pinned context');
        if (test.expected.pinned_context) {
          assert.equal(reviewerCall.response.project_context, test.expected.pinned_context);
          const description = reviewerCall.response.source.files.find(file => file.path === (test.expected.description_path ?? '.ai-factory/DESCRIPTION.md'));
          assert.equal(description.commit_sha, reviewerCall.args.source.head_sha);
          assert.equal(description.content, test.expected.pinned_context, 'Pinned description differs from its recorded source');
        }
      }
    }
    for (const text of test.expected.contains ?? []) assert(result.output.includes(text), `Missing output: ${text}`);
    for (const text of test.expected.absent ?? []) assert(!result.output.includes(text), `Unexpected output: ${text}`);
    for (const text of test.expected.preserved ?? []) assert(result.review.items.some(item => item.text === text), `Original finding changed: ${text}`);
    assert(!result.gate.blockers.some(item => /\(confidence: (?:low|medium)\)/.test(item.summary) && item.id !== 'review-validation-failed'));
    const fences = [...result.output.matchAll(/^```aif-gate-result\n([\s\S]*?)\n```$/gm)];
    assert.equal(fences.length, 1);
    assert(result.output.endsWith(fences[0][0]), 'Gate is not last');
    assert.deepEqual(JSON.parse(fences[0][1]), result.gate);
    record.pass = true;
    record.assertions = assertions;
    record.calls = replay.calls;
    record.output = result.output;
    record.gate = result.gate;
    console.log(`PASS ${test.id}`);
  } catch (error) {
    failed += 1; record.pass = false; record.error = error.message;
    console.error(`FAIL ${test.id}: ${error.message}`);
  }
}

await check('sequential keys keep identical pending/done calls distinct', async () => {
  const args = { task_id: 'validator-1' };
  const replay = new ToolReplay([
    { call_id: 1, tool: 'TaskStatus', args_sha256: argsHash(args), response: { outcome: 'pending' } },
    { call_id: 2, tool: 'TaskStatus', args_sha256: argsHash(args), response: { outcome: 'success', text: 'done' } },
  ]);
  assert.equal((await replay.call('TaskStatus', args)).outcome, 'pending');
  assert.equal((await replay.call('TaskStatus', args)).text, 'done');
  replay.assertConsumed();
  assert.notEqual(replay.calls[0].key, replay.calls[1].key);
});
await check('missing records fail loudly through the workflow', async () => {
  const test = fixture.cases[0];
  const replay = new ToolReplay(test.records.slice(0, test.records.findIndex(record => record.tool === 'Reviewer') + 1), { normalize });
  await assert.rejects(runReview(test.request, replay.call.bind(replay)), /Missing replay record: 3:Task:/);
});
await check('wrong arguments and unused records are errors', async () => {
  const replay = new ToolReplay([{ call_id: 1, tool: 'Bash', args_sha256: argsHash({ command: 'git status' }), response: '' }]);
  await assert.rejects(replay.call('Bash', { command: 'git diff' }), /Missing replay record/);
  assert.throws(() => replay.assertConsumed(), /Unused replay records/);
  assert.throws(() => new ToolReplay([...fixture.cases[0].records, fixture.cases[0].records[0]]), /Duplicate replay record/);
  assert.equal(replayKey(1, 'X', { a: 1, b: 2 }), replayKey(1, 'X', { b: 2, a: 1 }));
});
await check('host rejects responses bound to a different call', async () => {
  const test = fixture.cases[0];
  await assert.rejects(advanceReview({ request: test.request,
    responses: [{ call_id: 1, tool: 'Bash', args: { command: 'git status' }, response: '' }] }), /does not match request 1/);
});
await check('PR working_directory is required before source tools run', async () => {
  const test = fixture.cases.find(test => test.id === 'pr-drop-all-fresh');
  for (const working_directory of [undefined, '', '   ', 42]) {
    let calls = 0;
    await assert.rejects(runReview({ ...test.request, working_directory }, async () => {
      calls += 1;
      throw new Error('Unexpected source tool before working-directory validation');
    }), /PR working_directory must be a non-empty string/);
    assert.equal(calls, 0);
  }
});
await check('PR reviewer must explicitly return pinned context or an empty excerpt', async () => {
  const test = fixture.cases.find(test => test.id === 'pr-drop-all-fresh');
  for (const project_context of [undefined, null, {}, 42]) {
    let validatorCalls = 0;
    let index = 0;
    await assert.rejects(runReview(test.request, async tool => {
      const record = test.records[index++];
      assert.equal(tool, record.tool);
      if (tool === 'Reviewer') return { ...structuredClone(record.response), project_context };
      if (tool === 'Task') { validatorCalls += 1; throw new Error('Unexpected validator before project-context validation'); }
      return structuredClone(record.response);
    }), /PR reviewer project_context must be a string/);
    assert.equal(validatorCalls, 0);
  }
});
// Completed PR packages must retain the captured discriminator and format.
// A different valid mode used to bypass PR context/freshness/provenance checks.
for (const [field, values] of [['mode', ['staged', 'commits', undefined]], ['schema_version', [2, '1', undefined]]]) {
  for (const value of values) {
    await check(`PR reviewer cannot change ${field} to ${JSON.stringify(value) ?? 'missing'}`, async () => {
      const test = fixture.cases.find(test => test.id === 'pr-drop-all-unconfirmed');
      const records = structuredClone(test.records.slice(0, test.records.findIndex(record => record.tool === 'Reviewer') + 1));
      if (value === undefined) delete records.find(record => record.tool === 'Reviewer').response.source[field];
      else records.find(record => record.tool === 'Reviewer').response.source[field] = value;
      const replay = new ToolReplay(records, { normalize });
      const journal = { request: test.request, responses: [] };
      for (let turn = 0; turn < records.length; turn += 1) {
        const step = await advanceReview(journal);
        assert.equal(step.done, false);
        journal.responses.push({ ...step.next, response: await replay.call(step.next.tool, step.next.args) });
      }
      replay.assertConsumed();
      // No validator or freshness call, and no gate may follow an invalid package.
      await assert.rejects(advanceReview(journal), new RegExp('Reviewer changed pinned PR identity/diff'));
      assert.equal(replay.calls.at(-1).tool, 'Reviewer');
      assert(!replay.calls.some(call => call.tool === 'Task'));
    });
  }
}
// A Reviewer cannot introduce prose not backed by a complete pinned description.
for (const mutation of ['missing-file', 'unrelated-file', 'wrong-repository', 'wrong-commit', 'unavailable',
  'wrong-blob', 'wrong-hash', 'wrong-size', 'different-excerpt', 'missing-content', 'duplicate-file', 'unsafe-path']) {
  await check(`PR context rejects ${mutation}`, async () => {
    const test = fixture.cases.find(test => test.id === 'pr-pinned-project-context');
    const records = structuredClone(test.records.slice(0, test.records.findIndex(record => record.tool === 'Reviewer') + 1));
    const draft = records.find(record => record.tool === 'Reviewer').response;
    const file = draft.source.files[0];
    if (mutation === 'missing-file') draft.source.files = [];
    if (mutation === 'unrelated-file') file.path = 'src/unrelated.ts';
    if (mutation === 'wrong-repository') file.repository = 'other/repository';
    if (mutation === 'wrong-commit') file.commit_sha = draft.source.merge_base_sha;
    if (mutation === 'unavailable') file.status = 'unavailable';
    if (mutation === 'wrong-blob') file.blob_sha = '0'.repeat(40);
    if (mutation === 'wrong-hash') file.sha256 = '0'.repeat(64);
    if (mutation === 'wrong-size') file.bytes += 1;
    if (mutation === 'different-excerpt') draft.project_context = 'LOCAL_DESCRIPTION_SENTINEL';
    if (mutation === 'missing-content') delete file.content;
    if (mutation === 'duplicate-file') draft.source.files.push(structuredClone(file));
    if (mutation === 'unsafe-path') draft.project_context_path = '../DESCRIPTION.md';
    const replay = new ToolReplay(records, { normalize });
    const journal = { request: test.request, responses: [] };
    for (let turn = 0; turn < records.length; turn += 1) {
      const step = await advanceReview(journal);
      assert.equal(step.done, false);
      journal.responses.push({ ...step.next, response: await replay.call(step.next.tool, step.next.args) });
    }
    replay.assertConsumed();
    await assert.rejects(advanceReview(journal), /PR project context requires verified pinned description/);
  });
}
await check('PR description permits a verbatim excerpt from a verified full file', async () => {
  const test = fixture.cases.find(test => test.id === 'pr-pinned-project-context');
  const records = structuredClone(test.records.slice(0, test.records.findIndex(record => record.tool === 'Reviewer') + 1));
  const draft = records.find(record => record.tool === 'Reviewer').response;
  const excerpt = draft.source.files[0].content.split('\n').at(-1);
  draft.project_context = excerpt;
  const replay = new ToolReplay(records, { normalize });
  const journal = { request: test.request, responses: [] };
  for (let turn = 0; turn < records.length; turn += 1) {
    const step = await advanceReview(journal);
    journal.responses.push({ ...step.next, response: await replay.call(step.next.tool, step.next.args) });
  }
  const step = await advanceReview(journal);
  assert.equal(step.next.tool, 'Task');
  const context = step.next.args.prompt.match(/^## Project context\r?\n([\s\S]*?)^## Reviewed diff\r?\n/m)?.[1].trim();
  assert.equal(context, test.request.working_directory + '\n' + excerpt);
  replay.assertConsumed();
});
// Exercise every verdict with malformed Reason fields, including marked items.
for (const verdict of ['keep', 'modify', 'drop']) {
  for (const reason of ['', 'Reason:   \t\n', 'Reason: First.\nReason: Second.\n']) {
    for (const marked of [false, true]) {
      await check(`invalid Reason preserves ${marked ? 'marked' : 'plain'} ${verdict}: ${JSON.stringify(reason)}`, async () => {
        const test = fixture.cases.find(test => test.id === 'happy-path');
        const records = structuredClone(test.records);
        const draft = records.find(record => record.tool === 'Reviewer').response.review;
        if (marked) draft.items[0].text += ' (confidence: medium)';
        const text = `### Item 1 (section: critical)\nVerdict: ${verdict}\n${reason}`
          + (verdict === 'modify' ? 'Modified-text: Replaced finding.\n' : '')
          + '### Item 2 (section: suggestion)\nVerdict: drop\nReason: Refuted by the diff.\n';
        // Bind the modified Task arguments explicitly; all responses stay offline.
        const journal = { request: test.request, responses: [] };
        let result;
        for (let turn = 0; turn < records.length + 1; turn += 1) {
          const step = await advanceReview(journal);
          if (step.done) { result = step.result; break; }
          const record = records[journal.responses.length];
          assert.equal(step.next.tool, record.tool);
          journal.responses.push({ ...step.next, response: step.next.tool === 'Task' ? { outcome: 'success', text } : record.response });
        }
        assert.equal(result.gate.status, 'fail');
        assert.deepEqual(result.review.items, [draft.items[0]]);
        assert(result.warnings.some(warning => warning.includes('item 1 was malformed')));
        assert(!result.output.includes('Filtered:'));
        assert.equal(result.gate.blockers.some(blocker => blocker.id === 'review-validation-failed'), marked);
      });
    }
  }
}
for (const attack of ['self-consistent-content', 'self-selected-path']) {
  await check(`independent pinned context rejects ${attack}`, async () => {
    const test = fixture.cases.find(test => test.id === 'pr-pinned-project-context');
    const captured = structuredClone(test.records[0].response);
    const original = structuredClone(test.records.find(record => record.tool === 'Reviewer').response);
    const pinned = original.source.files.find(file => file.path === '.ai-factory/DESCRIPTION.md');
    const bytes = Buffer.from('# Local checkout\nSELF_CONSISTENT_FORGED_DESCRIPTION');
    let validatorCalls = 0;
    await assert.rejects(runReview(test.request, async (tool, args) => {
      if (tool === 'Bash') {
        if (args.command.includes(' snapshot ')) return captured;
        if (args.command.includes(' context ')) {
          if (args.command.includes('.ai-factory/config.yaml')) return {
            repository: captured.repository, commit_sha: captured.head_sha, path: '.ai-factory/config.yaml',
            status: 'unavailable', reason_code: 'not-found', reason: 'Proven absent from pinned tree',
          };
          return structuredClone(pinned);
        }
        return { base: { sha: captured.base_sha }, head: { sha: captured.head_sha } };
      }
      if (tool === 'Reviewer') {
        const response = structuredClone(original);
        const forged = response.source.files.find(file => file.path === '.ai-factory/DESCRIPTION.md');
        if (attack === 'self-consistent-content') {
          Object.assign(forged, { content: bytes.toString(), bytes: bytes.length,
            sha256: hash(bytes), blob_sha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') });
          response.project_context = forged.content;
        } else {
          response.project_context_path = 'docs/unrelated.md';
          forged.path = response.project_context_path;
        }
        return response;
      }
      validatorCalls += 1;
      return { outcome: 'success', text: '### Item 1 (section: critical)\nVerdict: drop\nReason: Refuted.\n### Item 2 (section: suggestion)\nVerdict: drop\nReason: Refuted.\n' };
    }), /PR project context requires verified pinned description/);
    assert.equal(validatorCalls, 0, 'Unsupported excerpt reached the validator');
  });
}
const makePinnedFile = (source, path, content) => {
  const bytes = Buffer.from(content);
  return { repository: source.repository, commit_sha: source.head_sha, path, status: 'available', source: 'git-objects',
    content, bytes: bytes.length, sha256: hash(bytes), blob_sha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') };
};
for (const [name, configText, selected] of [
  ['plain', 'paths:\n  description: docs/product.md\n', 'docs/product.md'],
  ['double quoted', 'paths:\n    description: "docs/Project brief.md" # comment\n', 'docs/Project brief.md'],
  ['single quoted', "paths:\n  description: 'docs/O''Brien.md'\n", "docs/O'Brien.md"],
  ['default', 'language:\n  ui: ru\n', '.ai-factory/DESCRIPTION.md'],
  ['empty paths', 'paths: {}\n', '.ai-factory/DESCRIPTION.md'],
  ['merge alias', 'paths:\n  <<: *defaults\n', null],
  ['root alias', 'paths: *defaults\n', null],
  ['flow map', 'paths: {description: docs/product.md}\n', null],
  ['duplicate', 'paths:\n  description: a.md\n  description: b.md\n', null],
  ['multiple docs', '---\npaths:\n  description: a.md\n---\npaths:\n  description: b.md\n', null],
  ['unsafe path', 'paths:\n  description: ../local.md\n', null],
  ['null path', 'paths:\n  description: null\n', null],
  ['children under inline map', 'paths: {}\n  description: forged.md\n', null],
  ['duplicate root', 'paths: {}\npaths:\n  description: forged.md\n', null],
]) {
  await check(`independent pinned config resolves ${name}`, async () => {
    const test = fixture.cases.find(test => test.id === 'pr-drop-all-fresh');
    const captured = structuredClone(test.records[0].response);
    const contextCalls = [];
    const text = '# Independently captured description';
    const result = await runReview(test.request, async (tool, args) => {
      if (tool === 'Bash') {
        if (args.command.includes(' snapshot ')) return captured;
        if (args.command.includes(' context ')) {
          assert(args.command.includes(captured.head_sha));
          contextCalls.push(args.command);
          return args.command.includes('.ai-factory/config.yaml')
            ? makePinnedFile(captured, '.ai-factory/config.yaml', configText) : makePinnedFile(captured, selected, text);
        }
        return { base: { sha: captured.base_sha }, head: { sha: captured.head_sha } };
      }
      if (tool === 'Reviewer') {
        assert(args.source.files.some(file => file.path === '.ai-factory/config.yaml'));
        return { ...structuredClone(test.records.find(record => record.tool === 'Reviewer').response),
          source: structuredClone(args.source), project_context: selected ? text : '' };
      }
      return { outcome: 'success', text: test.records.find(record => record.tool === 'Task').response.text };
    });
    assert.equal(contextCalls.length, selected ? 2 : 1);
    if (selected) assert(contextCalls[1].endsWith("'" + selected.replaceAll("'", "'\\''") + "'"));
    assert.equal(result.gate.status, selected ? 'pass' : 'warn');
    if (!selected) assert(result.output.includes('description path is unknown'));
  });
}
await check('Reviewer cannot mutate independent evidence through request aliases', async () => {
  const test = fixture.cases.find(test => test.id === 'pr-pinned-project-context');
  let index = 0;
  await assert.rejects(runReview(test.request, async (tool, args) => {
    const record = test.records[index++];
    assert.equal(tool, record.tool);
    if (tool === 'Reviewer') {
      const file = args.source.files.find(file => file.path === '.ai-factory/DESCRIPTION.md');
      Object.assign(file, makePinnedFile(args.source, file.path, '# MUTATED_REQUEST_ALIAS'));
      return { ...structuredClone(record.response), source: args.source, project_context: file.content };
    }
    return structuredClone(record.response);
  }), /PR project context requires verified pinned description/);
});
await check('missing independent source recording never falls back to live tools', async () => {
  const test = fixture.cases.find(test => test.id === 'pr-drop-all-fresh');
  const replay = new ToolReplay(test.records.slice(0, 1), { normalize });
  await assert.rejects(runReview(test.request, replay.call.bind(replay)), /Missing replay record: 2:Bash:/);
});
await check('source collector proves missing paths from existing local Git tree', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'aif-pinned-context-'));
  const git = args => execFileSync('git', args, { cwd: sandbox, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git(['init', '--quiet']);
    fs.writeFileSync(path.join(sandbox, 'description.md'), 'Known pinned content.');
    git(['add', '--', 'description.md']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture']);
    const commit = git(['rev-parse', 'HEAD']).toString().trim();
    const context = file => JSON.parse(execFileSync(process.execPath, [helper, 'context', 'fixture/demo', commit, file], {
      cwd: sandbox, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    }));
    assert.equal(context('description.md').content, 'Known pinned content.');
    const absent = context('.ai-factory/config.yaml');
    assert.equal(absent.status, 'unavailable');
    assert.equal(absent.reason_code, 'not-found');
    assert.equal(absent.commit_sha, commit);
  } finally { fs.rmSync(sandbox, { recursive: true, force: true }); }
});
await check('CLI executes the same complete journal and returns the same gate', async () => {
  const test = fixture.cases[0];
  const replay = new ToolReplay(test.records, { normalize });
  const journal = { request: test.request, responses: [] };
  let step;
  do {
    step = await advanceReview(journal);
    if (!step.done) journal.responses.push({ ...step.next, response: await replay.call(step.next.tool, step.next.args) });
  } while (!step.done);
  const helperPath = path.join(skillDir, 'references/check-workflow.mjs');
  const result = JSON.parse(execFileSync(process.execPath, [helperPath, 'run'], {
    input: JSON.stringify(journal), encoding: 'utf8', windowsHide: true,
  }));
  assert.deepEqual(result, step);
  assert.throws(() => execFileSync(process.execPath, [helperPath, 'run'], {
    input: '{', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  }));
});
await check('flat workflow installation resolves its real skill entrypoint', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'aif-review-flat-'));
  try {
    fs.cpSync(path.join(skillDir, 'references'), path.join(sandbox, 'references'), { recursive: true });
    fs.copyFileSync(path.join(skillDir, 'SKILL.md'), path.join(sandbox, 'aif-review.md'));
    const journal = { request: fixture.cases[0].request, responses: [{ call_id: 1, tool: 'Bash',
      args: { command: 'git diff --cached' }, response: 'recorded diff' }] };
    const result = JSON.parse(execFileSync(process.execPath, [path.join(sandbox, 'references/check-workflow.mjs'), 'run'], {
      input: JSON.stringify(journal), encoding: 'utf8', windowsHide: true,
    }));
    assert.equal(result.next.tool, 'Reviewer');
    assert.equal(result.next.args.skill, fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8'));
  } finally { fs.rmSync(sandbox, { recursive: true, force: true }); }
});
await check('skill and runtime sources stayed unchanged during replay', () => {
  for (const [file, sha256] of Object.entries(report.skill.sources)) assert.equal(sourceHash(`skills/aif-review/${file}`), sha256, `Source changed during run: ${file}`);
  assert.equal(sourceHash('skills/aif-review/references/check-workflow.mjs'), report.runtime.workflow_sha256);
  assert.equal(sourceHash('scripts/lib/tool-replay.mjs'), report.runtime.replay_sha256);
});

report.pass = failed === 0;
const reportIndex = process.argv.indexOf('--report');
if (reportIndex >= 0) assert(process.argv[reportIndex + 1], '--report requires an output path');
const outputPath = reportIndex >= 0 ? path.resolve(process.argv[reportIndex + 1])
  : path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aif-review-replay-')), 'report.json');
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(`${report.cases.filter(test => test.pass).length}/${report.cases.length} replay scenarios; ${report.checks.length} harness checks. Report: ${outputPath}`);
process.exitCode = failed ? 1 : 0;
