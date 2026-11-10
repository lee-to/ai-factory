#!/usr/bin/env node
// Installation/CLI coverage only; model precedence and evolution need scenario runs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAvailableSkills, installSkills } from '../dist/core/installer.js';
import { getBuiltinAgentConfigs } from '../dist/core/agents.js';
import { getTransformer } from '../dist/core/transformer.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const build = new Set(['aif-fix', 'aif-implement', 'aif-plan', 'aif-verify', 'aif-improve']);
const context = '.ai-factory/skill-context/';
const globalPath = `${context}global-skill-context.md`;
const buildPath = `${context}build-skill-context.md`;
const individual = `${context}aif-plan/SKILL.md`;
const skills = await getAvailableSkills();
const sandbox = await mkdtemp(path.join(tmpdir(), 'aif-shared-context-'));
const source = new Map(await Promise.all(skills.map(async skill => [skill,
  await readFile(path.join(root, 'skills', skill, 'SKILL.md'), 'utf8')])));
const cli = (project, ...args) => execFileSync(process.execPath, [path.join(root, 'dist/cli/index.js'), ...args],
  { cwd: project, encoding: 'utf8', timeout: 120_000, env: { ...process.env, NO_COLOR: '1' } });

try {
  // Actual rendering catches path rewrites and flat workflow installations.
  for (const agent of getBuiltinAgentConfigs()) {
    const project = path.join(sandbox, agent.id);
    await installSkills({ projectDir: project, agentId: agent.id, skillsDir: agent.skillsDir, skills });
    for (const skill of skills) {
      const transformed = getTransformer(agent.id).transform(skill, source.get(skill));
      const target = transformed.flat
        ? path.join(project, agent.configDir, transformed.targetDir, transformed.targetName)
        : path.join(project, agent.skillsDir, transformed.targetDir, transformed.targetName);
      const entry = await readFile(target, 'utf8');
      const section = entry.split('## Shared project skill-context\n')[1]?.split('\n#')[0];
      assert(section, `${agent.id}/${skill}: startup loader missing`);
      const own = `${context}${skill}/SKILL.md`;
      assert(section.indexOf(globalPath) >= 0 && section.indexOf(globalPath) < section.indexOf(own),
        `${agent.id}/${skill}: global/individual order or literal path lost`);
      if (build.has(skill)) {
        assert(section.indexOf(globalPath) < section.indexOf(buildPath) && section.indexOf(buildPath) < section.indexOf(own),
          `${agent.id}/${skill}: build order lost`);
      } else assert(!section.includes(buildPath), `${agent.id}/${skill}: leaked build membership`);
      assert(section.includes('individual > build (when applicable) > global > skill defaults'));
      assert(section.includes('existing unreadable file stops dependent work'));
      assert(section.includes('ownership, scope, safety/privacy, validation, or approval boundaries'));
    }
    console.log(`PASS ${agent.id}: all ${skills.length} entrypoints preserve shared context paths and membership`);
  }

  const project = path.join(sandbox, 'lifecycle with spaces');
  const selected = [...build, 'aif-review'].join(',');
  await mkdir(project);
  cli(project, 'init', '--agents', 'universal', '--skills', selected);
  const contents = new Map([
    [globalPath, '# Global\r\n\r\nKeep this manual comment.\r\n'],
    [buildPath, '# Build\n\nKeep exact workflow evidence.\n'],
    [individual, '# Plan\n\nUnique local exception.\n'],
  ]);
  for (const [file, content] of contents) {
    await mkdir(path.dirname(path.join(project, file)), { recursive: true });
    await writeFile(path.join(project, file), content);
  }
  const preserved = async () => {
    for (const [file, content] of contents) assert.equal(await readFile(path.join(project, file), 'utf8'), content);
  };
  const warnings = cli(project, 'update', '--force');
  const plan = warnings.split('\n').find(line => line.includes('    - aif-plan (') && line.includes(globalPath));
  const review = warnings.split('\n').find(line => line.includes('    - aif-review (') && line.includes(globalPath));
  assert(plan?.includes(buildPath) && plan.includes(individual), 'Plan must warn for all three layers');
  for (const skill of build) {
    const line = warnings.split('\n').find(line => line.includes(`    - ${skill} (`) && line.includes(globalPath));
    assert(line?.includes(buildPath), `${skill}: shared build warning missing`);
  }
  assert(review && !review.includes(buildPath) && !review.includes(individual), 'Review must warn only for global context');
  await preserved();
  const steady = cli(project, 'update');
  assert(!steady.includes('WARN: skill-context override'), 'No review warning without changed skills');
  await preserved();
  cli(project, 'init', '--agents', 'universal', '--skills', selected);
  await preserved();
  cli(project, 'upgrade');
  await preserved();

  // Shared-only files must trigger review warnings without an individual file.
  await rm(path.join(project, individual));
  contents.delete(individual);
  await rm(path.join(project, globalPath));
  contents.delete(globalPath);
  const buildOnly = cli(project, 'update', '--force');
  assert(buildOnly.includes(`aif-plan (${buildPath})`));
  assert(!buildOnly.includes(`aif-review (${buildPath})`));
  await preserved();
  await rm(path.join(project, buildPath));
  const absent = cli(project, 'update', '--force');
  assert(!absent.includes('WARN: skill-context override'), 'Absent contexts must stay optional');
  await writeFile(path.join(project, individual), '# Legacy individual context\n');
  const legacy = cli(project, 'update', '--force');
  assert(legacy.includes(`aif-plan (${individual})`), 'Legacy individual-only warning must remain');
  assert(!legacy.split('\n').some(line => line.includes('    - aif-review (.ai-factory/skill-context/')));
  assert.equal(await readFile(path.join(project, individual), 'utf8'), '# Legacy individual context\n');
  console.log('PASS CLI: scoped warnings and byte preservation through update, force, re-init and upgrade; optional missing layers');
} finally {
  await rm(sandbox, { recursive: true, force: true });
}
