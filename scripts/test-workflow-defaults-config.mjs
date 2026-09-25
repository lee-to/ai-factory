// Exercise the real config updater; this does not execute agent workflows.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const helper = path.join(root, 'skills/aif/references/update-config.mjs');
const template = path.join(root, 'skills/aif/references/config-template.yaml');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aif-workflow-defaults-'));
const defaults = {
  'workflow.explore_mode': 'regular',
  'workflow.plan_mode': 'ask',
  'workflow.improve_check': false,
};

function update(target, payload) {
  const payloadPath = path.join(temp, 'payload.json');
  fs.writeFileSync(payloadPath, JSON.stringify(payload));
  execFileSync(process.execPath, [helper, '--template', template, '--target', target, '--payload', payloadPath]);
  return fs.readFileSync(target, 'utf8');
}

function assertValues(text, values) {
  const workflow = text.match(/^workflow:\n((?:[ \t].*\n|\n)*)/m)?.[1];
  assert.ok(workflow, 'workflow section exists');
  for (const [key, value] of Object.entries(values)) {
    const name = key.split('.')[1];
    assert.match(workflow, new RegExp(`^  ${name}: ${value}(?: #.*)?$`, 'm'), key);
  }
}

function assertNoop(target, payload) {
  const before = fs.readFileSync(target);
  // A fixed timestamp makes an accidental rewrite observable even on coarse filesystems.
  fs.utimesSync(target, new Date('2000-01-01'), new Date('2000-01-01'));
  const mtime = fs.statSync(target).mtimeMs;
  update(target, payload);
  assert.deepEqual(fs.readFileSync(target), before, 'repeated merge preserves every byte');
  assert.equal(fs.statSync(target).mtimeMs, mtime, 'repeated merge does not rewrite the file');
}

try {
  const fresh = path.join(temp, 'fresh.yaml');
  const freshText = update(fresh, { mode: 'create', set: {}, fillMissing: {} });
  assertValues(freshText, defaults);
  assert.ok(freshText.includes('# Default /aif-plan mode when no leading mode token is supplied.'));

  for (const explore of ['regular', 'ultra']) {
    for (const plan of ['ask', 'fast', 'full', 'ultra']) {
      for (const check of [false, true]) {
        const values = {
          'workflow.explore_mode': explore,
          'workflow.plan_mode': plan,
          'workflow.improve_check': check,
        };
        const target = path.join(temp, `${explore}-${plan}-${check}.yaml`);
        const created = update(target, { mode: 'create', set: values, fillMissing: {} });
        assertValues(created, values);
        assert.ok(created.includes('# Boolean: true or false. +check enables it; --no-check disables it once.'));
        // Simulate a user-edited config, then rerun setup with built-in defaults.
        const custom = created.replace(`  plan_mode: ${plan}`, `  plan_mode: ${plan} # keep my choice`)
          + '\ncustom:\n  owner: team # preserve unknown sections\n';
        fs.writeFileSync(target, custom);
        const merge = { mode: 'merge', set: {}, fillMissing: defaults };
        assert.equal(update(target, merge), custom, 'setup must preserve all existing values and comments');
        assertNoop(target, merge);
      }
    }
  }

  for (const initial of [
    '# legacy config\npaths:\n  docs: handbook/\n',
    '# partial workflow\nworkflow:\n  plan_mode: ultra # team preference\n  custom_key: retain-me\n',
  ]) {
    const target = path.join(temp, 'legacy.yaml');
    fs.writeFileSync(target, initial);
    const merge = { mode: 'merge', set: {}, fillMissing: defaults };
    const text = update(target, merge);
    assertValues(text, { ...defaults, 'workflow.plan_mode': initial.includes('plan_mode: ultra') ? 'ultra' : 'ask' });
    for (const line of initial.trimEnd().split('\n')) {
      assert.ok(text.split('\n').includes(line), `preserve legacy line: ${line}`);
    }
    assert.ok(text.includes('# Default /aif-explore mode when no leading mode token is supplied.'));
    assert.ok(text.includes('# Run /aif-improve\'s +check validation by default.'));
    assertNoop(target, merge);
  }
  console.log('Workflow defaults config helper regressions passed (16 custom combinations, fresh and legacy configs).');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
