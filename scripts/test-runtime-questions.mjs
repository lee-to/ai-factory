import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSkillFiles } from '../dist/core/installer.js';
import { getBuiltinAgentConfigs } from '../dist/core/agents.js';
import { createSkillRenderContext } from '../dist/core/skill-targets.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n?/g, '\n');
const authoring = read('skills/aif-skill-generator/references/BEST-PRACTICES.md');
const contract = authoring.match(/```markdown\n(## Runtime-aware questions\n[\s\S]*?)\n```/)?.[1];
assert.ok(contract, 'Reusable question contract is missing');
for (const phrase of ['advertised schema', 'plain text with numbered options', 'preselected option',
  'do not prompt the user directly', 'required decision, approval, or material scope/behavior choice']) {
  assert.ok(contract.includes(phrase), `Missing question boundary: ${phrase}`);
}

// Classify every bundled entrypoint, including exceptional clarification paths.
// New skills default to carrying the policy; a genuinely non-interactive skill
// needs a reviewed exemption rather than disappearing from a keyword search.
const nonInteractive = new Map([
  ['aif-best-practices', 'Reference guidelines only; no user-decision workflow.'],
]);
const skills = fs.readdirSync(path.join(root, 'skills')).filter(skill =>
  fs.existsSync(path.join(root, 'skills', skill, 'SKILL.md'))).sort();
for (const skill of nonInteractive.keys()) assert.ok(skills.includes(skill), `Stale exemption: ${skill}`);
const consumers = skills.filter(skill => !nonInteractive.has(skill));
function requireContract(text, label) {
  assert.ok(text.includes(contract), `${label}: runtime-aware question contract missing or changed`);
  assert.equal(text.split('## Runtime-aware questions\n').length - 1, 1, `${label}: duplicate question policy`);
}
for (const skill of consumers) requireContract(read(`skills/${skill}/SKILL.md`), skill);
for (const skill of nonInteractive.keys()) {
  assert.doesNotMatch(read(`skills/${skill}/SKILL.md`), /AskUserQuestion|Questions|questionnaire/,
    `${skill}: reconsider the non-interactive exemption`);
}

// A copied section must fail closed if a renderer drops even one policy clause.
for (const clause of contract.split('\n').filter(line => line.startsWith('- '))) {
  assert.throws(() => requireContract(contract.replace(clause, ''), 'missing-clause'), /missing or changed/);
}
assert.throws(() => requireContract(`${contract}\n${contract}`, 'duplicate'), /duplicate/);

let combinations = 0;
for (const agent of getBuiltinAgentConfigs()) {
  for (const skill of consumers) {
    const files = await renderSkillFiles(path.join(root, 'skills', skill), skill, agent.id,
      createSkillRenderContext(agent.id, agent.skillsDir));
    requireContract(files.get('SKILL.md').toString().replace(/\r\n?/g, '\n'), `${agent.id}/${skill}`);
    combinations++;
  }
  const files = await renderSkillFiles(path.join(root, 'skills/aif-skill-generator'), 'aif-skill-generator',
    agent.id, createSkillRenderContext(agent.id, agent.skillsDir));
  const generator = files.get('SKILL.md').toString().replace(/\r\n?/g, '\n');
  const routing = generator.indexOf('## Argument Detection');
  const allModes = generator.indexOf('## Questions and Interactive Output (All Modes)');
  assert.ok(allModes >= 0 && allModes < routing, `${agent.id}: generation policy must precede URL routing`);
  const questionStart = generator.indexOf(contract);
  assert.ok(questionStart >= 0 && questionStart < generator.indexOf('## CRITICAL: Security Scanning'),
    `${agent.id}: question delivery must cover early prerequisite decisions`);
  assert.match(generator.slice(allModes, routing), /every generated interactive skill/);
  const learn = files.get('references/LEARN-MODE.md').toString().replace(/\r\n?/g, '\n');
  const clarify = learn.split('### Phase 4: Clarify with User')[1].split('### Phase 5:')[0];
  assert.match(clarify, /Runtime-Aware Questions contract/);
  assert.match(clarify, /plain text with numbered options/);
  assert.doesNotMatch(clarify, /using `AskUserQuestion`/);
  assert.match(learn.split('### Phase 5: Generate the Skill')[1].split('### Phase 6:')[0],
    /self-contained `## Runtime-aware questions`/);
  assert.match(learn.split('### Phase 6: Validate & Present')[1],
    /verify that its `SKILL.md` includes the complete Runtime-aware questions section/);
}

const loop = read('skills/aif-loop/SKILL.md');
assert.match(loop, /even if criteria were already present in the task text/);
assert.match(loop, /even if iteration count was already present in the task text/);
assert.match(loop, /Start iteration 1 only after the confirmations are explicit/);
assert.match(loop, /Prompt-supplied values remain drafts/);
assert.match(loop, /required confirmations\s+remain blockers/);
assert.match(loop, /requires user confirmation, always confirm before deleting/);
const evolve = read('skills/aif-evolve/SKILL.md');
assert.match(evolve, /logical batches of up to 3 independent decisions/);
assert.doesNotMatch(evolve, /up to 3 decisions per `AskUserQuestion` call/);
assert.doesNotMatch(evolve, /per `AskUserQuestion` call/);
const qa = read('skills/aif-qa/SKILL.md');
assert.match(qa, /`--all` skips inter-stage prompts only/);
const qaCheck = read('skills/aif-qa-check/SKILL.md');
assert.match(qaCheck, /QA `agent` mode is automated execution with a supervising user/);
assert.match(qaCheck, /explicit user authorization immediately before execution/);
assert.match(qaCheck, /MUST ask the user for missing user-suppliable execution context/);
assert.match(read('skills/aif-warmup/SKILL.md'), /Do not ask setup questions unless the project root itself cannot be identified/);
for (const skill of ['aif-build-automation', 'aif-ci', 'aif-dockerize', 'aif-grounded']) {
  assert.match(read(`skills/${skill}/SKILL.md`), /config-agnostic: use the conversation language for questions/);
}
const docs = read('docs/skills.md');
assert.match(docs, /^## Questions Across Runtimes$/m);
assert.match(docs, /BEST-PRACTICES\.md#runtime-aware-questions/);
console.log(`PASS runtime questions: ${consumers.length} consumers, ${combinations} rendered combinations; inventory and policy drift controls`);
console.log('NOTRUN native question UIs and model behavior; local instruction/rendering checks only');
