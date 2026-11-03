#!/usr/bin/env node
// Offline contracts and synthetic examples; never invokes a model.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { getBuiltinAgentConfigs } from '../dist/core/agents.js';
import { installSkills, buildManagedSkillsState, removeOwnedSkills } from '../dist/core/installer.js';
import { getTransformer } from '../dist/core/transformer.js';
import { before, after, internalConsumer, publicConsumer, cases } from '../skills/aif-review/tests/coupling/fixtures.mjs';
import { advanceReview, runReview, prepareCheck, finishCheck, WORKFLOW_VERSION } from '../skills/aif-review/references/check-workflow.mjs';
import { collectCouplingContext } from '../skills/aif-review/references/coupling-context.mjs';
import { createHash } from 'node:crypto';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
let checks = 0;
const check = async (id, action) => {
  await action();
  checks += 1;
  console.log(`[coupling:test] PASS ${id}`);
};
await check('leak-and-stable-controls', () => {
  assert.equal(internalConsumer(before()), '1250');
  assert.throws(() => internalConsumer(after()), TypeError);
  assert.equal(publicConsumer(before()), '1250');
  assert.equal(publicConsumer(after()), '1250');
  assert.equal(cases.find(value => value.id === 'explicitly-permitted-dependency').expected, 'keep-boundary');
  assert.equal(cases.find(value => value.id === 'unknown-volatility-and-owner').volatility, null);
  assert.equal(cases.find(value => value.id === 'external-consumer').revision, null);
  assert.equal(cases.find(value => value.id === 'separate-repositories').domainBoundary, null);
});
await check('independent-methodology-and-review-routing', () => {
  const skill = read('skills/aif-review/SKILL.md');
  assert(skill.includes('references/COUPLING-REVIEW.md'));
  const method = read('skills/aif-review/references/COUPLING-REVIEW.md');
  for (const term of ['producer', 'consumer', 'volatility', 'inference', 'cost', 'SEVERITY.md', 'unavailable']) {
    assert(method.toLowerCase().includes(term.toLowerCase()), term);
  }
  assert(!read('skills/aif-plan/references/COUPLING-PLAN.md').includes('../aif-review'));
});
const method = read('skills/aif-review/references/COUPLING-REVIEW.md');
const item = { section: 'suggestion', text: 'Representation crosses the boundary. Use totalMinor().', files: ['pricing/model.mjs'] };
const input = { review: { items: [item] }, diff: 'synthetic diff', project_context: '/sandbox',
  source: { mode: 'commits' }, validator: { available: true, read_only_enforced: true } };
const keep = { outcome: 'success', text: '### Item 1 (section: suggestion)\nVerdict: keep\nReason: Verified boundary.\n' };
const source = { mode: 'pr', repository: 'fixture/demo', head_sha: 'b'.repeat(40), merge_base_sha: 'c'.repeat(40), files: [] };
const file = (path, content, commit = source.head_sha) => {
  const bytes = Buffer.from(content);
  return { repository: source.repository, commit_sha: commit, path, status: 'available', content, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    blob_sha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') };
};
await check('prepare-finish-lens-allowlist-and-severity', () => {
  assert.equal(WORKFLOW_VERSION, 3);
  const off = prepareCheck(input);
  assert(!('lenses' in off));
  assert(!off.task.prompt.includes(method));
  assert.deepEqual(prepareCheck({ ...input, lenses: [] }), off);
  const on = prepareCheck({ ...input, lenses: ['coupling'] });
  assert.deepEqual(on.lenses, ['coupling']);
  assert(on.task.prompt.startsWith(method));
  assert.equal(finishCheck({ prepared: on, result: keep }).gate.status, 'warn');
  for (const lenses of [null, 'coupling', ['unknown'], ['coupling', 'coupling'], {}]) {
    assert.throws(() => prepareCheck({ ...input, lenses }), /Invalid lenses/);
  }
});
await check('real-parser-order-targets-and-off-traces', async () => {
  const trace = async argument => {
    const calls = [];
    const result = await runReview({ argument, validator: input.validator }, async (tool, args) => {
      calls.push({ tool, args });
      if (tool === 'Bash') return input.diff;
      if (tool === 'Reviewer') return { review: input.review };
      if (tool === 'Task') return keep;
      throw new Error('Unexpected tool');
    });
    return { calls, result };
  };
  const off = await trace('+check');
  const on = await trace('+check +coupling');
  const reversed = await trace('+coupling +check +coupling');
  assert.deepEqual(on, reversed);
  assert.deepEqual(on.calls.map(value => value.tool), off.calls.map(value => value.tool));
  assert.deepEqual(off.calls.map(value => value.tool), ['Bash', 'Reviewer', 'Task']);
  assert(!('lenses' in off.calls[1].args));
  assert.equal(on.calls[1].args.coupling_methodology, method);
  assert(on.calls[2].args.prompt.includes(method));
  assert.deepEqual(on.result.gate, off.result.gate);
  let calls = 0;
  await assert.rejects(runReview({ argument: '+check', lenses: [] }, () => { calls++; }), /argument tokens/);
  assert.equal(calls, 0);
  for (const target of ['main', 'feature/+coupling-notes']) {
    await assert.rejects(runReview({ argument: target + ' +check +coupling' }, () => { calls++; }), /Commits mode/);
  }
  for (const argument of ['123 +coupling +check', '+check +coupling https://github.com/fixture/demo/pull/123']) {
    const next = await advanceReview({ request: { argument, working_directory: '/sandbox', repository: source.repository } });
    assert(next.next.args.command.endsWith('snapshot fixture/demo 123'));
  }
});
await check('bounded-host-evidence-and-dual-revisions', async () => {
  const head = file('.ai-factory/DESCRIPTION.md', 'new description');
  const old = file(head.path, 'old description', source.merge_base_sha);
  const calls = [];
  const combined = await collectCouplingContext({ ...source, files: [head] }, [head, old, head], '/helper', async (tool, args) => {
    calls.push({ tool, args });
    return args.command.includes(source.merge_base_sha) ? old : head;
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(combined.files, [head, old]);
  const prepared = prepareCheck({ ...input, source: combined, lenses: ['coupling'] });
  assert(prepared.task.prompt.includes('old description'));
  const result = finishCheck({ prepared, result: keep, freshness: { confirmed: true } });
  assert(result.output.includes(source.head_sha) && result.output.includes(source.merge_base_sha));
});
await check('planning-instruction-contracts-not-model-execution', () => {
  const skill = read('skills/aif-plan/SKILL.md');
  const planMethod = read('skills/aif-plan/references/COUPLING-PLAN.md');
  for (const term of ['references/COUPLING-PLAN.md', 'leading option segment', 'before the first description word',
    'all\n  internal whitespace and line breaks', 'Handoff branch', 'research snapshot',
    'When off, do not load this reference']) assert(skill.includes(term), term);
  for (const example of ['fast +coupling Add receipt', 'full +coupling +coupling Add receipt',
    'ultra +coupling Add receipt', '+coupling Add receipt', 'full Add +coupling receipt',
    'full +coupling Add +coupling receipt', 'full Add https://example.test/+coupling', 'Add  receipt']) {
    assert(planMethod.includes(example), example);
  }
  assert(!planMethod.includes('references/COUPLING-REVIEW.md'));
  assert(skill.includes('## Original Request'));
});
await check('independent-project-evidence-cannot-be-downgraded', async () => {
  for (const path of ['.ai-factory/config.yaml', '.ai-factory/DESCRIPTION.md']) {
    const known = file(path, '# independently verified project content');
    const baseline = { ...source, files: [known] };
    const unavailable = { repository: known.repository, commit_sha: known.commit_sha, path,
      status: 'unavailable', reason: 'Reviewer claims missing' };
    let calls = 0;
    for (const declaration of [unavailable, file(path, 'forged but self-consistent')]) {
      await assert.rejects(collectCouplingContext(baseline, [file('first', 'valid'), declaration], '/helper',
        async () => { calls++; }, [known]), /conflicts with independently verified/);
    }
    assert.equal(calls, 0, 'whole-array conflict preflight precedes additional reads');
    const rereadMissing = await collectCouplingContext(baseline, [known], '/helper', async () => unavailable, [known]);
    assert.deepEqual(rereadMissing.files, [known]);
    assert.equal(rereadMissing.unavailable_context[0].scope, 'coupling-recheck');
    assert.equal(finishCheck({ prepared: prepareCheck({ ...input, source: rereadMissing, lenses: ['coupling'] }),
      result: keep, freshness: { confirmed: true } }).gate.status, 'warn');
    const earlier = Array.from({ length: 16 }, (_, index) => file('earlier-' + index, 'ok'));
    const limited = await collectCouplingContext(baseline, [...earlier, known], '/helper', async (tool, args) => {
      calls++;
      return earlier.find(value => args.command.endsWith("'" + value.path + "'"));
    }, [known]);
    assert.equal(calls, 16);
    assert.deepEqual(limited.files.find(value => value.path === path), known);
    const oneMiB = 'a'.repeat(1024 * 1024);
    const fullBudget = [file('budget-a', oneMiB), file('budget-b', oneMiB)];
    const bytesLimited = await collectCouplingContext(baseline, [...fullBudget, known], '/helper', async (tool, args) =>
      fullBudget.find(value => args.command.endsWith("'" + value.path + "'")), [known]);
    assert.deepEqual(bytesLimited.files.find(value => value.path === path), known);
    assert.equal(bytesLimited.unavailable_context[0].scope, 'coupling-recheck');
    // A matching-looking Reviewer file is NOT an independent host baseline.
    const untrusted = await collectCouplingContext(baseline, [known], '/helper', async () => unavailable);
    assert.equal(untrusted.files[0].status, 'unavailable');
    assert(!('content' in untrusted.files[0]));
    const before = file(path, 'merge-base version', source.merge_base_sha);
    const otherRevision = await collectCouplingContext(baseline, [before], '/helper', async () => ({
      repository: before.repository, commit_sha: before.commit_sha, path, status: 'unavailable', reason: 'Before unavailable',
    }), [known]);
    assert.deepEqual(otherRevision.files.find(value => value.commit_sha === source.head_sha), known);
    assert.equal(otherRevision.files.find(value => value.commit_sha === source.merge_base_sha).status, 'unavailable');
  }
});
await check('independent-unavailable-source-recovery-and-integrity', async () => {
  for (const path of ['.ai-factory/config.yaml', '.ai-factory/DESCRIPTION.md']) {
    const available = file(path, 'PRIVATE_RECOVERED_CONTENT');
    const missing = { repository: source.repository, commit_sha: source.head_sha, path,
      status: 'unavailable', reason: 'Transient source outage' };
    const baseline = { ...source, files: [missing], unavailable_context: [missing] };
    let reads = 0;
    const recovered = await collectCouplingContext(baseline, [available], '/helper', () => { reads++; return available; }, [missing]);
    assert.equal(reads, 1);
    assert.deepEqual(recovered.files, [available]);
    assert.deepEqual(recovered.unavailable_context, [missing], 'initial source limitations remain explicit');
    for (const [files, independent] of [[[missing], []], [[{ ...missing, reason: 'Reviewer changed reason' }], [missing]],
      [[file(path, 'forged available source')], [missing]]]) {
      await assert.rejects(collectCouplingContext({ ...source, files }, [available], '/helper', () => available, independent),
        /source package conflicts with verified dependency/);
    }
    for (const response of [file(path, 'different host bytes'), { ...available, commit_sha: source.merge_base_sha },
      { ...available, sha256: '0'.repeat(64) }]) {
      await assert.rejects(collectCouplingContext(baseline, [available], '/helper', () => response, [missing]), /Coupling context/);
    }
    const stillMissing = await collectCouplingContext(baseline, [available], '/helper', () => missing, [missing]);
    assert.equal(stillMissing.files[0].status, 'unavailable');
    assert(!('content' in stillMissing.files[0]));
    const noRead = await collectCouplingContext(baseline, [missing], '/helper', () => { throw new Error('Unavailable must not read'); }, [missing]);
    assert.equal(noRead.files[0].status, 'unavailable');
    const oversized = file(path, 'x'.repeat(1024 * 1024 + 1));
    const limited = await collectCouplingContext(baseline, [oversized], '/helper', () => { throw new Error('Over budget must not read'); }, [missing]);
    assert.equal(limited.files[0].status, 'unavailable');
    const old = file(path, 'merge-base content', source.merge_base_sha);
    const otherRevision = await collectCouplingContext(baseline, [old], '/helper', () => old, [missing]);
    assert.deepEqual(otherRevision.files, [missing, old], 'merge-base availability never promotes unavailable head');
    let forbiddenReads = 0;
    await assert.rejects(collectCouplingContext({ ...source, files: [available] }, [file(path, 'replacement')], '/helper',
      () => { forbiddenReads++; }, [available]), /conflicts with independently verified/);
    assert.equal(forbiddenReads, 0);
  }
});
await check('real-PR-project-source-recovery-reaches-validator', async () => {
  const config = file('.ai-factory/config.yaml', '# default paths\n');
  const description = file('.ai-factory/DESCRIPTION.md', 'PRIVATE_RECOVERED_DESCRIPTION');
  const snapshot = { ...source, schema_version: 1, pr: 123, base_sha: 'a'.repeat(40), stale: false,
    diff: { text: input.diff, bytes: Buffer.byteLength(input.diff), sha256: createHash('sha256').update(input.diff).digest('hex') } };
  for (const recovered of [config, description]) {
    let reads = 0;
    let targetReads = 0;
    let dispatches = 0;
    let prompt;
    const result = await runReview({ argument: '123 +coupling +check', repository: source.repository,
      working_directory: '/sandbox', validator: input.validator }, async (tool, args) => {
      if (tool === 'Bash') {
        if (args.command.includes(' snapshot ')) return snapshot;
        if (args.command.includes(' context ')) {
          reads++;
          const record = args.command.includes(config.path) ? config : description;
          if (record.path === recovered.path && ++targetReads === 1) return {
            repository: record.repository, commit_sha: record.commit_sha, path: record.path,
            status: 'unavailable', reason: 'Transient source outage' };
          return record;
        }
        return { base: { sha: snapshot.base_sha }, head: { sha: snapshot.head_sha } };
      }
      if (tool === 'Reviewer') {
        assert.equal(args.source.files.find(value => value.path === recovered.path).status, 'unavailable');
        assert.equal(args.project_context, '/sandbox');
        return { source: args.source, project_context: '', review: input.review, coupling_dependencies: [recovered] };
      }
      if (tool === 'Task') {
        dispatches++;
        prompt = args.prompt;
        return { outcome: 'success', text: '### Item 1 (section: suggestion)\nVerdict: drop\nReason: No supported defect.\n' };
      }
      throw new Error('Unexpected recovery call');
    });
    assert.equal(targetReads, 2);
    assert.equal(reads, recovered === config ? 2 : 3);
    assert.equal(dispatches, 1);
    assert(prompt.includes(JSON.stringify(recovered.content)), 'host-verified bytes reach SOURCE_PACKAGE');
    assert(!prompt.includes('/sandbox\n' + recovered.content), 'recovery does not invent a pinned description excerpt');
    assert(result.output.includes(recovered.path));
    assert(result.output.includes('Transient source outage'));
    assert.equal(result.gate.status, 'warn', 'initial unavailable context retains its existing uncertainty floor');
  }
});
await check('undeclared-source-evidence-whole-package-preflight', async () => {
  const known = { ...file('.ai-factory/DESCRIPTION.md', 'host description'), source: 'git-objects', local: false };
  const missing = { repository: source.repository, commit_sha: source.head_sha, path: '.ai-factory/config.yaml',
    status: 'unavailable', reason: 'Not found', reason_code: 'not-found' };
  const declared = file('declared.mjs', 'declared content');
  const extra = file('extra.mjs', 'PRIVATE_UNVERIFIED_SOURCE');
  let reads = 0;
  for (const dependency of [[], [declared]]) {
    for (const injected of [extra, { ...declared, commit_sha: source.merge_base_sha },
      { ...declared, repository: 'other/repo' }]) {
      await assert.rejects(collectCouplingContext({ ...source, files: [known, missing, injected] }, dependency,
        '/helper', () => { reads++; }, [known, missing]), /undeclared source evidence/);
    }
  }
  assert.equal(reads, 0, 'whole-package preflight precedes even valid declared reads');
  for (const files of [{}, [null], [{ path: 'bad' }]]) {
    await assert.rejects(collectCouplingContext({ ...source, files }, [], '/helper', () => { reads++; }), /Coupling context/);
  }
  await assert.rejects(collectCouplingContext({ ...source, files: [file(known.path, 'forged')] }, [],
    '/helper', () => { reads++; }, [known]), /independent source evidence mismatch/);
  const preserved = await collectCouplingContext({ ...source, files: [{ ...known, reviewer_note: 'PRIVATE_UNVERIFIED_SOURCE' }, missing] },
    [], '/helper', () => { reads++; }, [known, missing]);
  assert.deepEqual(preserved.files, [known, missing], 'retain canonical host records, including unavailable metadata');
  assert.equal(reads, 0);
  const mixed = await collectCouplingContext({ ...source, files: [known, missing, declared] }, [declared],
    '/helper', () => { reads++; return declared; }, [known, missing]);
  assert.equal(reads, 1);
  assert.deepEqual(mixed.files, [known, missing, declared]);
});
await check('real-PR-undeclared-evidence-rejected-before-validator', async () => {
  const config = file('.ai-factory/config.yaml', '# default paths\n');
  const description = file('.ai-factory/DESCRIPTION.md', 'host description');
  const extra = file('extra.mjs', 'PRIVATE_UNVERIFIED_SOURCE');
  const declared = file('declared.mjs', 'declared source');
  const snapshot = { ...source, schema_version: 1, pr: 123, base_sha: 'a'.repeat(40), stale: false,
    diff: { text: input.diff, bytes: Buffer.byteLength(input.diff), sha256: createHash('sha256').update(input.diff).digest('hex') } };
  for (const missing of [false, true]) {
    for (const dependencies of [[], [declared]]) {
      let reads = 0;
      let dispatches = 0;
      await assert.rejects(runReview({ argument: '123 +coupling +check', working_directory: '/sandbox',
        repository: source.repository, validator: input.validator }, async (tool, args) => {
        if (tool === 'Bash' && args.command.includes(' snapshot ')) return snapshot;
        if (tool === 'Bash' && args.command.includes(' context ')) {
          reads++;
          const record = args.command.includes(config.path) ? config : description;
          return missing ? { repository: record.repository, commit_sha: record.commit_sha, path: record.path,
            status: 'unavailable', reason: 'Not found', reason_code: 'not-found' } : record;
        }
        if (tool === 'Reviewer') return { source: { ...args.source, files: [...args.source.files, ...dependencies, extra] },
          project_context: missing ? '' : description.content, review: input.review, coupling_dependencies: dependencies };
        if (tool === 'Task') { dispatches++; return keep; }
        throw new Error('Unexpected call after undeclared evidence');
      }), /undeclared source evidence/);
      assert.equal(reads, 2, 'only independent project reads occur');
      assert.equal(dispatches, 0);
    }
    // Independent available/unavailable records need no declaration. Off mode
    // retains the existing baseline policy for Reviewer-provided source files.
    for (const enabled of [false, true]) {
      let reads = 0;
      const result = await runReview({ argument: '123 +check' + (enabled ? ' +coupling' : ''), working_directory: '/sandbox',
        repository: source.repository, validator: input.validator }, async (tool, args) => {
        if (tool === 'Bash' && args.command.includes(' snapshot ')) return snapshot;
        if (tool === 'Bash' && args.command.includes(' context ')) {
          reads++;
          const record = args.command.includes(config.path) ? config : description;
          return missing ? { repository: record.repository, commit_sha: record.commit_sha, path: record.path,
            status: 'unavailable', reason: 'Not found', reason_code: 'not-found' } : record;
        }
        if (tool === 'Bash') return { base: { sha: snapshot.base_sha }, head: { sha: snapshot.head_sha } };
        if (tool === 'Reviewer') return { source: { ...args.source, files: [...args.source.files, ...(enabled ? [] : [extra])] },
          project_context: missing ? '' : description.content, review: { items: [] }, ...(enabled ? { coupling_dependencies: [] } : {}) };
        throw new Error('Empty review must not dispatch validator');
      });
      assert.equal(reads, 2);
      assert.equal(result.gate.status, missing ? 'warn' : 'pass');
      assert.equal(result.output.includes(extra.path), !enabled);
    }
  }
});
await check('coupling-debug-activation-mode-and-source-redaction', async () => {
  const originalError = console.error;
  const previousDebug = process.env.AIF_REVIEW_DEBUG;
  const messages = [];
  try {
    console.error = (...values) => messages.push(values.join(' '));
    process.env.AIF_REVIEW_DEBUG = '1';
    for (const mode of ['staged', 'pr', 'commits']) {
      prepareCheck({ ...input, source: { mode }, lenses: ['coupling'],
        diff: 'PRIVATE_DIFF_SENTINEL', project_context: 'PRIVATE_CONTEXT_SENTINEL' });
      assert(messages.some(value => value.includes('coupling lens enabled; source mode=' + mode)));
    }
    assert(!messages.some(value => /PRIVATE_|Representation crosses/.test(value)));
    messages.length = 0;
    const dependency = file('PRIVATE_PATH.mjs', 'PRIVATE_BODY');
    await assert.rejects(collectCouplingContext({ ...source, files: [dependency] }, [], '/helper',
      () => { throw new Error('Undeclared source must not be read'); }), /undeclared source evidence/);
    assert(messages.some(value => value.includes('[FIX:177] undeclared source evidence rejected')));
    await collectCouplingContext({ ...source, files: [dependency] }, [dependency], '/helper', () => dependency);
    assert(messages.some(value => value.includes('[FIX:177] source evidence preflight complete')));
    const missing = { repository: dependency.repository, commit_sha: dependency.commit_sha, path: dependency.path,
      status: 'unavailable', reason: 'PRIVATE_REASON' };
    await collectCouplingContext({ ...source, files: [missing] }, [dependency], '/helper', () => dependency, [missing]);
    assert(messages.some(value => value.includes('[FIX:177] independent source availability recovered')));
    assert(!messages.some(value => /PRIVATE_|Representation crosses/.test(value)));
    messages.length = 0;
    prepareCheck(input);
    assert(!messages.some(value => value.includes('coupling')));
    messages.length = 0;
    delete process.env.AIF_REVIEW_DEBUG;
    prepareCheck({ ...input, lenses: ['coupling'] });
    await collectCouplingContext({ ...source, files: [dependency] }, [dependency], '/helper', () => dependency);
    await collectCouplingContext({ ...source, files: [missing] }, [dependency], '/helper', () => dependency, [missing]);
    assert.equal(messages.length, 0);
  } finally {
    console.error = originalError;
    if (previousDebug === undefined) delete process.env.AIF_REVIEW_DEBUG;
    else process.env.AIF_REVIEW_DEBUG = previousDebug;
  }
});
await check('whole-declaration-preflight-rejects-before-source-calls', async () => {
  const good = file('pricing/model.mjs', 'original');
  const invalid = [undefined, null, {}, 'wrong', [null], [good, { ...good, content: 'forged' }],
    [{ ...good, bytes: -1 }], [{ ...good, sha256: '0'.repeat(64) }], [{ ...good, blob_sha: '0'.repeat(40) }],
    [{ ...good, status: 'maybe' }], [{ ...good, commit_sha: 'main' }], [{ ...good, repository: 'bad;command' }],
    [{ ...good, path: '../outside' }], [{ ...good, path: '/absolute' }], [{ ...good, path: 'C:/outside' }],
    [{ ...good, path: 'a\\b' }], [{ ...good, path: 'bad\npath' }], [{ ...good, command: 'run' }],
    [{ ...good, status: 'unavailable', reason: 'Missing' }],
    [{ repository: good.repository, path: good.path, commit_sha: good.commit_sha, status: 'unavailable', reason: '' }],
    [good, file(good.path, 'different')], [good, { ...file('last.mjs', 'last'), sha256: 'forged' }]];
  let calls = 0;
  for (const dependencies of invalid) {
    await assert.rejects(collectCouplingContext(source, dependencies, '/helper', () => { calls++; }), /Coupling context/);
  }
  assert.equal(calls, 0);
  assert.deepEqual((await collectCouplingContext(source, [], '/helper', () => { calls++; })).files, []);
});
await check('host-integrity-and-genuine-unavailable', async () => {
  const good = file('pricing/model.mjs', 'original');
  for (const response of [file(good.path, 'replaced'), { ...good, commit_sha: source.merge_base_sha },
    { ...good, sha256: 'forged' }, { ...good, bytes: good.bytes + 1 }, { ...good, status: 'maybe' }]) {
    await assert.rejects(collectCouplingContext(source, [good], '/helper', async () => response), /Coupling context/);
  }
  const unavailable = { repository: good.repository, path: good.path, commit_sha: good.commit_sha,
    status: 'unavailable', reason: 'Pinned source inaccessible' };
  const missing = await collectCouplingContext(source, [good], '/helper', async () => unavailable);
  assert.equal(missing.files[0].status, 'unavailable');
  assert(!('content' in missing.files[0]));
  assert.equal(finishCheck({ prepared: prepareCheck({ ...input, source: missing, lenses: ['coupling'] }),
    result: { outcome: 'success', text: '### Item 1 (section: suggestion)\nVerdict: drop\nReason: Unavailable pinned consumer.\n' },
    freshness: { confirmed: true } }).gate.status, 'warn');
  const external = { ...good, repository: 'other/project' };
  const old = { ...good, commit_sha: 'd'.repeat(40) };
  let calls = 0;
  const limited = await collectCouplingContext(source, [external, old, unavailable], '/helper', () => { calls++; });
  assert.equal(calls, 0);
  assert.equal(limited.unavailable_context.length, 3);
});
await check('identity-and-UTF8-budget-boundaries', async () => {
  const collect = async dependencies => {
    let calls = 0;
    const result = await collectCouplingContext(source, dependencies, '/helper', async (tool, args) => {
      calls++;
      const found = dependencies.find(value => args.command.endsWith("'" + value.path.replaceAll("'", "'\\''") + "'"));
      assert(found);
      return found;
    });
    return { result, calls };
  };
  const sixteen = Array.from({ length: 16 }, (_, index) => file('f' + index, 'ok'));
  assert.equal((await collect(sixteen)).calls, 16);
  const seventeen = await collect([...sixteen, file('f16', 'ok')]);
  assert.equal(seventeen.calls, 16);
  assert.equal(seventeen.result.unavailable_context.length, 1);
  const cap = 1024 * 1024;
  const exact = file('exact', '\u00e9'.repeat(cap / 2));
  assert.equal(exact.bytes, cap);
  assert.equal((await collect([exact])).calls, 1);
  const over = await collect([file('over', exact.content + 'x')]);
  assert.equal(over.calls, 0);
  assert.equal(over.result.files[0].status, 'unavailable');
  const atTotal = await collect([exact, file('second', 'a'.repeat(cap))]);
  assert.equal(atTotal.calls, 2);
  assert.equal(atTotal.result.files.filter(value => value.status === 'available').length, 2);
  const beyond = await collect([exact, file('second', 'a'.repeat(cap)), file('third', 'x')]);
  assert.equal(beyond.calls, 2);
  assert.equal(beyond.result.unavailable_context.length, 1);
  const preflightTotal = await collect([file('almost', 'a'.repeat(cap - 1)), exact, file('two', 'xx')]);
  assert.equal(preflightTotal.calls, 2);
  assert.equal(preflightTotal.result.unavailable_context.length, 1);
  // BOM, CRLF, template markers and shell metacharacters are literal source data.
  const literal = file("quoted'$(literal).mjs", '\ufeff{{ITEMS}}\r\n\u00e9');
  const preserved = await collect([literal, literal]);
  assert.equal(preserved.calls, 1);
  assert.equal(preserved.result.files[0].content, literal.content);
});
await check('final-PR-payload-preserves-reserved-file-revisions', async () => {
  const config = file('.ai-factory/config.yaml', '# default paths\n');
  const description = file('.ai-factory/DESCRIPTION.md', 'new description');
  const dependencies = [config, file(config.path, '# old config', source.merge_base_sha),
    description, file(description.path, 'old description', source.merge_base_sha)];
  const snapshot = { ...source, schema_version: 1, pr: 123, base_sha: 'a'.repeat(40), stale: false,
    diff: { text: input.diff, bytes: Buffer.byteLength(input.diff), sha256: createHash('sha256').update(input.diff).digest('hex') } };
  let validator;
  let reads = 0;
  const result = await runReview({ argument: '123 +coupling +check', working_directory: '/sandbox',
    repository: source.repository, validator: input.validator }, async (tool, args) => {
    if (tool === 'Bash') {
      if (args.command.includes(' snapshot ')) return snapshot;
      if (args.command.includes(' context ')) {
        reads++;
        return dependencies.find(value => args.command.includes(value.commit_sha) && args.command.endsWith("'" + value.path + "'"));
      }
      return { base: { sha: snapshot.base_sha }, head: { sha: snapshot.head_sha } };
    }
    if (tool === 'Reviewer') return { source: args.source, project_context: description.content, review: input.review, coupling_dependencies: dependencies };
    if (tool === 'Task') { validator = args; return keep; }
    throw new Error('Unexpected PR call');
  });
  assert.equal(reads, 6); // two independent project reads + four coupling reads
  for (const content of dependencies.map(value => value.content)) assert(validator.prompt.includes(JSON.stringify(content)));
  assert(result.output.includes(source.head_sha) && result.output.includes(source.merge_base_sha));
  assert.equal(result.gate.status, 'warn');
  for (const known of [config, description]) {
    let contextReads = 0;
    let dispatches = 0;
    await assert.rejects(runReview({ argument: '123 +coupling +check', working_directory: '/sandbox',
      repository: source.repository, validator: input.validator }, async (tool, args) => {
      if (tool === 'Bash' && args.command.includes(' snapshot ')) return snapshot;
      if (tool === 'Bash' && args.command.includes(' context ')) {
        contextReads++;
        return args.command.includes(config.path) ? config : description;
      }
      if (tool === 'Reviewer') return { source: args.source, project_context: description.content, review: input.review,
        coupling_dependencies: [{ repository: known.repository, commit_sha: known.commit_sha, path: known.path,
          status: 'unavailable', reason: 'Reviewer claims unavailable' }] };
      if (tool === 'Task') { dispatches++; return keep; }
      throw new Error('Unexpected call after invalid declaration');
    }), /conflicts with independently verified/);
    assert.equal(contextReads, 2, 'only independent project reads occur');
    assert.equal(dispatches, 0, 'conflicting declaration cannot reach validator');
  }
});
await check('automatic-procedure-envelopes-and-existing-gates', () => {
  const procedure = read('skills/aif-review/references/CHECK-MODE.md');
  assert(procedure.includes('Automatic dispatch retains its enforced read-only'));
  assert(procedure.includes('failure, never an automatic full-tool fallback'));
  // Execute prepare/finish for every envelope; dispatch choice is specified by
  // the parent skill, not implemented by prepare or qualified as native behavior.
  for (const lenses of [[], ['coupling']]) {
    for (const validator of [input.validator, { available: false, read_only_enforced: true }, { available: true, read_only_enforced: false }]) {
      const prepared = prepareCheck({ ...input, lenses, validator,
        review: { items: [{ ...item, text: item.text + ' (confidence: medium)' }] } });
      assert.equal(prepared.task.prompt.includes(method), lenses.length > 0);
      const enforced = validator.available && validator.read_only_enforced;
      const result = finishCheck({ prepared, result: enforced ? { outcome: 'success',
        text: '### Item 1 (section: suggestion)\nVerdict: modify\nReason: Confirmed boundary.\nModified-text: ' + item.text } : { outcome: 'unavailable' } });
      assert.equal(result.gate.status, enforced ? 'warn' : 'fail');
      if (!enforced) assert(result.gate.blockers.some(value => value.id === 'review-validation-failed'));
    }
  }
  const blocked = finishCheck({ prepared: prepareCheck({ ...input, lenses: ['coupling'],
    review: { items: [item, { ...item, section: 'critical', text: 'Confirmed independent correctness failure.' }],
      context_gates: [{ area: 'rules', status: 'fail', text: 'Explicit rule violated', files: item.files }] } }),
    result: { outcome: 'timeout' } });
  assert.equal(blocked.gate.status, 'fail');
  for (const verdict of ['keep', 'modify', 'drop']) {
    const result = finishCheck({ prepared: prepareCheck({ ...input, lenses: ['coupling'] }),
      result: { outcome: 'success', text: `### Item 1 (section: suggestion)\nVerdict: ${verdict}\nReason: Bounded boundary advice.\n`
        + (verdict === 'modify' ? 'Modified-text: Prefer the stable public operation.' : '') } });
    assert.equal(result.gate.status, verdict === 'drop' ? 'pass' : 'warn');
  }
});
await check('all-profile-standalone-combined-installation-and-flat-deselection', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const skills = ['aif-review', 'aif-plan'];
  const sourceFiles = new Map();
  const inventory = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) inventory(target);
      else sourceFiles.set(target, readFileSync(target));
    }
  };
  for (const skill of skills) inventory(path.join(root, 'skills', skill));
  const project = mkdtempSync(path.join(tmpdir(), 'aif-coupling-install-'));
  let installs = 0;
  try {
    for (const agent of getBuiltinAgentConfigs()) {
      for (const selection of [[skills[0]], [skills[1]], skills]) {
        const directory = path.join(project, agent.id, selection.join('-'));
        assert.deepEqual(await installSkills({ projectDir: directory, agentId: agent.id, skillsDir: agent.skillsDir, skills: selection }), selection);
        for (const skill of selection) {
          const rendered = getTransformer(agent.id).transform(skill, read(`skills/${skill}/SKILL.md`));
          const skillRoot = rendered.flat ? path.join(directory, agent.configDir, rendered.targetDir)
            : path.join(directory, agent.skillsDir, rendered.targetDir);
          const name = skill === 'aif-review' ? 'COUPLING-REVIEW.md' : 'COUPLING-PLAN.md';
          const installed = readFileSync(path.join(skillRoot, rendered.targetName), 'utf8');
          assert(installed.includes('references/' + name), agent.id + ': missing routing');
          assert.deepEqual(readFileSync(path.join(skillRoot, 'references', name)), sourceFiles.get(path.join(root, 'skills', skill, 'references', name)));
          if (skill === 'aif-review') {
            assert.deepEqual(readFileSync(path.join(skillRoot, 'references/coupling-context.mjs')),
              sourceFiles.get(path.join(root, 'skills', skill, 'references/coupling-context.mjs')));
            const prepared = JSON.parse(execFileSync(process.execPath, [path.join(skillRoot, 'references/check-workflow.mjs'), 'prepare'], {
              input: JSON.stringify({ ...input, lenses: ['coupling'] }), encoding: 'utf8', windowsHide: true,
            }));
            assert(prepared.task.prompt.startsWith(method));
          }
          if (selection.length === 2 && rendered.flat) {
            const installation = { id: agent.id, skillsDir: agent.skillsDir, installedSkills: selection };
            installation.managedSkills = await buildManagedSkillsState(directory, installation, selection);
            const note = path.join(skillRoot, 'references/user-note.txt');
            mkdirSync(path.dirname(note), { recursive: true });
            writeFileSync(note, 'preserve user data');
            const survivor = { ...installation, installedSkills: ['aif-review'] };
            assert.deepEqual(await removeOwnedSkills(directory, { ...installation, installedSkills: [skill] }, [survivor]), [skill]);
            assert(!existsSync(path.join(skillRoot, rendered.targetName)));
            assert.equal(readFileSync(note, 'utf8'), 'preserve user data');
            const reviewRoot = path.join(directory, agent.skillsDir, getTransformer(agent.id).transform('aif-review', '').targetDir);
            assert.deepEqual(readFileSync(path.join(reviewRoot, 'references/COUPLING-REVIEW.md')),
              sourceFiles.get(path.join(root, 'skills/aif-review/references/COUPLING-REVIEW.md')));
          }
        }
        installs++;
        console.log(`[coupling:test] ${agent.id}: ${selection.join('+')} installed; references verified`);
      }
    }
    assert.equal(installs, getBuiltinAgentConfigs().length * 3);
    const npm = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    assert(existsSync(npm), 'npm CLI required for offline package inventory');
    const packed = JSON.parse(execFileSync(process.execPath, [npm, 'pack', '--dry-run', '--ignore-scripts', '--json', '--offline'], {
      cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, npm_config_cache: path.join(project, 'npm-cache'), npm_config_update_notifier: 'false' },
    }))[0].files.map(value => value.path.replaceAll('\\', '/'));
    for (const asset of ['skills/aif-review/references/COUPLING-REVIEW.md',
      'skills/aif-review/references/coupling-context.mjs', 'skills/aif-plan/references/COUPLING-PLAN.md']) {
      assert(packed.includes(asset), 'Missing package asset: ' + asset);
    }
    assert(!packed.some(value => /^skills\/(aif-review|aif-plan)\/tests\//.test(value)), 'Authoring tests leaked into package');
    console.log(`[coupling:test] package references present; authoring fixtures excluded; ${installs} installations verified`);
    for (const [filePath, bytes] of sourceFiles) assert.deepEqual(readFileSync(filePath), bytes, 'Source mutated: ' + filePath);
  } finally {
    // Only this freshly created, absolute temp root is owned by this harness.
    assert(path.resolve(project).startsWith(path.resolve(tmpdir()) + path.sep));
    assert(path.basename(project).startsWith('aif-coupling-install-'));
    rmSync(project, { recursive: true, force: true });
  }
});
console.log(`[coupling:test] ${checks} checks passed; inference=false; live_tools=false`);
