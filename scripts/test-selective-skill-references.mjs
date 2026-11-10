import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { routes, root, measure } from './measure-skill-entrypoints.mjs';
import { readSkillContract } from './lib/skill-contract-source.mjs';
import { installSkills, buildManagedSkillsState, updateSkills, removeOwnedSkills } from '../dist/core/installer.js';
import { getAgentConfig } from '../dist/core/agents.js';
import { getTransformer } from '../dist/core/transformer.js';
import { createSkillRenderContext } from '../dist/core/skill-targets.js';
import { applyInjection, stripInjection } from '../dist/core/injections.js';

const skills = Object.keys(routes);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aif-selective-references-'));
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

try {
  const report = measure();
  assert(report.entries.reduce((sum, entry) => sum + entry.current.lines, 0) < 1000,
    'Four entrypoints must stay under the instruction budget');
  for (const skill of skills) {
    const entrypoint = path.join(root, 'skills', skill, 'SKILL.md');
    const text = fs.readFileSync(entrypoint, 'utf8');
    for (const boundary of ['only when', 'do not preload all references', 'missing or unreadable, STOP', 'managed extension injections']) {
      assert(text.includes(boundary), `${skill}: lost loading/precedence boundary ${boundary}`);
    }
    const linked = new Set([...text.matchAll(/\]\(references\/([^)#]+\.md)(?:#[^)]*)?\)/g)].map(match => match[1]));
    for (const names of Object.values(routes[skill])) {
      for (const name of names) {
        assert(fs.existsSync(path.join(root, 'skills', skill, 'references', name)), `${skill}: missing ${name}`);
        assert(linked.has(name) || text.includes(`references/${name}`), `${skill}: unreachable ${name}`);
      }
    }
    assert(readSkillContract(entrypoint).includes(text), `${skill}: static contracts lost entrypoint`);
  }
  const selected = (skill, route) => report.routes.find(entry => entry.skill === skill && entry.route === route)
    .current.files.map(file => file.file);
  for (const route of ['list', 'status']) {
    assert(!selected('aif-implement', route).some(file => /IMPLEMENT-(TASK|INLINE|COMPLETION|RECOVERY|COMMITS)/.test(file)));
  }
  assert(!selected('aif-implement', 'inline').some(file => /IMPLEMENT-(DISCOVERY|RECOVERY|TASK|COMPLETION|COMMITS)/.test(file)));
  for (const route of ['task', 'recovery']) {
    assert(selected('aif-implement', route).some(file => file.endsWith('/IMPLEMENT-COMMITS.md')),
      `aif-implement ${route}: commit and receipt instructions must be loaded`);
  }
  assert(!selected('aif-fix', 'plan-first').some(file => /FIX-(IMPLEMENTATION|COMPLETION|OUTPUT|PATCH)/.test(file)));
  const fix = readSkillContract(path.join(root, 'skills/aif-fix/SKILL.md'));
  for (const phrase of ['workflow.fix_mode', 'workflow.fix_patch', '--fix-now', '--plan-first', '--patch', '--no-patch',
    'last explicit flag wins over config', 'Flags alone are not a problem description',
    'An existing fix plan still takes priority', 'only `ask` falls back',
    'skip that reference and all patch writes/directory creation', 'resolve the policy anew',
    'Failed/blocked fixes do not produce completed-fix patches']) {
    assert(fix.includes(phrase), `aif-fix: missing mode/patch boundary: ${phrase}`);
  }
  assert.doesNotMatch(fix, /ALWAYS create a patch|Every fix generates a patch|mandatory patch creation|This is NOT optional/);
  assert.equal((fix.match(/Step 6 only when enabled/g) ?? []).length, 2,
    'Both extra-coverage answers must honor the patch policy');
  for (const entry of report.routes) {
    assert(!entry.current.files.some(file => /-(EXAMPLES|USAGE|COMMANDS)\.md$/.test(file.file)), 'Examples must be optional');
  }
  const missing = path.join(temp, 'missing-reference', 'SKILL.md');
  fs.mkdirSync(path.dirname(missing), { recursive: true });
  fs.writeFileSync(missing, 'Read [required procedure](references/MISSING.md) before writing.');
  assert.throws(() => readSkillContract(missing), /ENOENT/);
  fs.writeFileSync(missing, 'Read [escape](references/../../outside.md).');
  assert.throws(() => readSkillContract(missing), /Reference escapes its skill/);
  for (const [skill, phrases] of Object.entries({
    'aif-implement': ['<!-- aif:plan-mode:ultra -->', 'handoff_outcome: blocked_external', 'ERROR [requirement-conflict]', 'paused: true'],
    'aif-verify': ['<!-- aif:plan-mode:ultra -->', 'blocking plan-integrity failure', 'ERROR [requirement-conflict]', 'exactly one final fenced `aif-gate-result`'],
    'aif-fix': ['Canonical Regression-First Policy', 'pre-fix regression check passes unexpectedly', 'Do NOT call MCP tools', 'custom/non-default fix plan'],
  })) {
    for (const phrase of phrases) assert(read(`skills/${skill}/SKILL.md`).includes(phrase), `${skill}: guard moved out of entrypoint: ${phrase}`);
  }
  console.log('PASS route budgets, selective reachability, optional examples and hard boundaries');

  // New references cannot collide in Kilo's shared workflow references directory.
  const referenceOwners = new Map();
  for (const skill of fs.readdirSync(path.join(root, 'skills'))) {
    const dir = path.join(root, 'skills', skill, 'references');
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      referenceOwners.set(name, [...(referenceOwners.get(name) ?? []), skill]);
    }
  }
  for (const skill of skills) {
    for (const name of Object.values(routes[skill]).flat().filter(name => /^(SETUP|IMPLEMENT|VERIFY|FIX)-/.test(name))) {
      assert.deepEqual(referenceOwners.get(name), [skill], `${name}: colliding flat reference`);
    }
  }

  for (const [id, architectureCommand] of [
    ['claude', '/aif-architecture'], ['codex', '$aif-architecture'], ['codex-app', '$aif-architecture'],
    ['kilocode', '/aif:architecture'], ['qwen', '/skills aif-architecture'],
  ]) {
    const project = path.join(temp, id);
    const config = getAgentConfig(id);
    const agent = { id, skillsDir: config.skillsDir, installedSkills: skills };
    await installSkills({ projectDir: project, agentId: id, skillsDir: agent.skillsDir, skills });
    const flat = id === 'kilocode';
    const refs = skill => path.join(project, flat ? '.kilocode/workflows' : path.join(agent.skillsDir, skill), 'references');
    const entry = skill => path.join(project, flat ? `.kilocode/workflows/${skill}.md` : path.join(agent.skillsDir, skill, 'SKILL.md'));
    const installedFix = readSkillContract(entry('aif-fix'));
    for (const phrase of ['workflow.fix_mode', 'workflow.fix_patch', '--fix-now', '--plan-first', '--patch', '--no-patch',
      'skip that reference and all patch writes/directory creation']) {
      assert(installedFix.includes(phrase), `${id}: fix policy lost in installed skill: ${phrase}`);
    }
    for (const skill of skills) {
      for (const names of Object.values(routes[skill])) {
        for (const name of names) assert(fs.existsSync(path.join(refs(skill), name)), `${id}: unavailable ${skill}/${name}`);
      }
    }
    const completion = fs.readFileSync(path.join(refs('aif'), 'SETUP-COMPLETION.md'), 'utf8');
    assert(completion.includes(architectureCommand), `${id}: wrong invocation in reference`);
    assert(!completion.includes('{{'), `${id}: unresolved template variables`);
    const discovery = fs.readFileSync(path.join(refs('aif-implement'), 'IMPLEMENT-DISCOVERY.md'), 'utf8');
    assert(discovery.includes('<!-- aif:plan-mode:ultra -->'));
    assert(discovery.includes('<!-- ultra-phase:<relative-path> -->'));
    assert(discovery.includes('paused: true'));
    assert.equal(fs.readFileSync(path.join(refs('aif-verify'), 'GATE-RESULT-CONTRACT.md'), 'utf8'),
      read('skills/aif-verify/references/GATE-RESULT-CONTRACT.md'), `${id}: canonical machine contract changed`);
    const reportText = fs.readFileSync(path.join(refs('aif-verify'), 'VERIFY-REPORT.md'), 'utf8');
    const gateExample = reportText.match(/^```aif-gate-result\n([\s\S]*?)\n```/m);
    assert.equal(JSON.parse(gateExample[1]).suggested_next.command, '/aif-commit', `${id}: machine enum rewritten`);
    const sentinel = flat ? path.join(refs('aif'), 'user-owned.md')
      : path.join(project, agent.skillsDir, 'custom-skill', 'SKILL.md');
    fs.mkdirSync(path.dirname(sentinel), { recursive: true });
    fs.writeFileSync(sentinel, 'Preserve this user reference.');
    agent.managedSkills = await buildManagedSkillsState(project, agent, skills);
    const state = agent.managedSkills;
    for (const skill of skills) assert(state[skill].rawInstalledHash, `${id}: renderer and receipt diverged for ${skill}`);
    // An old renderer receipt must invalidate even when source hashes match.
    for (const skill of skills) agent.managedSkills[skill].renderContextHash = 'legacy-reference-renderer';
    fs.writeFileSync(path.join(refs('aif'), 'SETUP-COMPLETION.md'), completion.replaceAll(architectureCommand, '/aif-architecture'));
    const migrated = await updateSkills(agent, project);
    assert.equal(migrated.entries.filter(entry => entry.reason === 'render-context-changed').length, skills.length);
    assert.equal(fs.readFileSync(path.join(refs('aif'), 'SETUP-COMPLETION.md'), 'utf8'), completion);
    agent.installedSkills = migrated.installedSkills;
    agent.managedSkills = await buildManagedSkillsState(project, agent, agent.installedSkills);
    const unchanged = await updateSkills(agent, project);
    assert.equal(unchanged.entries.filter(entry => entry.status === 'unchanged' && skills.includes(entry.skill)).length, skills.length);
    const updated = await updateSkills(agent, project, { force: true });
    assert.equal(updated.entries.filter(entry => entry.status === 'changed' && skills.includes(entry.skill)).length, skills.length);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'Preserve this user reference.');
    assert.equal(fs.readFileSync(path.join(refs('aif'), 'SETUP-COMPLETION.md'), 'utf8'), completion);
    const text = fs.readFileSync(entry('aif-implement'), 'utf8');
    const once = applyInjection(text, 'Extension override', 'prepend', 'fixture-extension', 'aif-implement');
    const twice = applyInjection(once, 'Extension override', 'prepend', 'fixture-extension', 'aif-implement');
    assert.equal(twice.split('aif-ext:fixture-extension:aif-implement:prepend:start').length - 1, 1);
    assert.equal(stripInjection(twice, 'fixture-extension', 'aif-implement', 'prepend').trim(), text.trim());
    console.log(`PASS ${id}: install/update references, commands, receipts, user files and injection idempotence`);
  }

  for (const [id, command] of [['codex', '$aif-fix'], ['kilocode', '/aif:fix'], ['qwen', '/skills aif-fix']]) {
    const reference = getTransformer(id).transformReference('aif', '---\nname: example\n---\n/aif-fix @plan.md\nGET /api/orders\n~/skills/aif/SKILL.md');
    assert(reference.startsWith('---\nname: example\n---\n'), `${id}: reference frontmatter stripped`);
    assert(reference.includes(`${command} @plan.md`));
    assert(reference.includes('GET /api/orders'));
    assert(reference.includes('~/skills/aif/SKILL.md'));
    for (const fence of ['```', '~~~~']) {
      const block = `${fence}aif-gate-result\n{"suggested_next":{"command":"/aif-commit"}}\n${fence}`;
      const guarded = getTransformer(id).transformReference('aif', `/aif-fix\n${block}\n/aif-fix`);
      assert.equal(guarded, `${command}\n${block}\n${command}`);
      const truncated = `${fence}aif-gate-result\n{"command":"/aif-commit"}`;
      assert.equal(getTransformer(id).transformReference('aif', truncated), truncated);
    }
  }
  const shared = createSkillRenderContext('universal', '.agents/skills', true);
  const sharedFiles = path.join(temp, 'shared');
  await installSkills({ projectDir: sharedFiles, agentId: 'universal', skillsDir: '.agents/skills', skills: ['aif'], renderContext: shared });
  assert(fs.readFileSync(path.join(sharedFiles, '.agents/skills/aif/references/SETUP-COMPLETION.md'), 'utf8').includes('$aif-architecture'));
  console.log('PASS reference syntax preserves metadata, API/skill paths and shared Codex rendering');

  const deselectedProject = path.join(temp, 'deselected');
  const deselected = { id: 'claude', skillsDir: '.claude/skills', installedSkills: ['aif'] };
  await installSkills({ projectDir: deselectedProject, agentId: deselected.id, skillsDir: deselected.skillsDir, skills: deselected.installedSkills });
  const removedDir = path.join(deselectedProject, deselected.skillsDir, 'aif');
  fs.mkdirSync(path.join(removedDir, 'empty', 'nested'), { recursive: true });
  deselected.managedSkills = await buildManagedSkillsState(deselectedProject, deselected, deselected.installedSkills);
  assert(deselected.managedSkills.aif.rawInstalledHash);
  assert.deepEqual(await removeOwnedSkills(deselectedProject, deselected, []), ['aif']);
  assert(!fs.existsSync(removedDir), 'Verified skill removal must remove empty subdirectories too');
  console.log('PASS verified deselection removes empty source subdirectories');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
