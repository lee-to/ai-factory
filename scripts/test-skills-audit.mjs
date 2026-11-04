#!/usr/bin/env node
// Offline packaging/rendering checks, not an evaluation of model reasoning.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { installSkills, getAvailableSkills } from '../dist/core/installer.js';
import { getBuiltinAgentConfigs } from '../dist/core/agents.js';
import { getTransformer } from '../dist/core/transformer.js';
import { buildTemplateVars } from '../dist/core/template.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const name = 'aif-skills-audit';
const source = path.join(root, 'skills', name);
const flags = ['--root', '--online', '--output'];
let failed = 0;
let passed = 0;
const check = async (label, run) => {
  try { await run(); passed++; console.log(`PASS ${label}`); }
  catch (error) { failed++; console.error(`FAIL ${label}: ${error.stack ?? error.message}`); }
};

async function snapshot(directory) {
  const result = {};
  for (const item of (await fs.readdir(directory, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    const target = path.join(directory, item.name);
    assert(!item.isSymbolicLink(), `Unexpected source symlink: ${target}`);
    if (item.isDirectory()) {
      for (const [key, value] of Object.entries(await snapshot(target))) result[`${item.name}/${key}`] = value;
    } else result[item.name] = createHash('sha256').update(await fs.readFile(target)).digest('hex');
  }
  return result;
}

function withoutFences(text) {
  let fence = null;
  return text.split(/\r?\n/).filter(line => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (fence === marker[1][0]) fence = null;
      return false;
    }
    return !fence;
  }).join('\n');
}

async function inspectMarkdown(file, suppliedText) {
  const text = suppliedText ?? await fs.readFile(file, 'utf8');
  if (suppliedText === undefined) assert(!/\{\{(?:config_dir|skills_dir|home_skills_dir|settings_file|agent_name|skills_cli_agent_flag)\}\}/.test(text),
    `Unresolved template in ${file}`);
  const links = [...withoutFences(text).matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)];
  for (const [, href] of links) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    const [relative, anchor] = href.split('#');
    const target = relative ? path.resolve(path.dirname(file), decodeURIComponent(relative)) : file;
    assert((await fs.stat(target)).isFile(), `Missing linked file: ${href} from ${file}`);
    if (anchor) {
      // Our introduced audit anchor is a simple heading; existing anchors are
      // checked by the documentation review rather than a partial GFM emulation.
      if (anchor === 'aif-skills-audit') {
        const targetText = withoutFences(await fs.readFile(target, 'utf8'));
        assert(/^### `\/aif-skills-audit`\s*$/m.test(targetText), `Missing audit anchor: ${href}`);
      }
    }
  }
  return links.length;
}

const before = await snapshot(source);
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'aif-skills-audit-'));
try {
  await check('package discovery includes audit', async () => {
    assert((await getAvailableSkills()).includes(name));
  });

  for (const agent of getBuiltinAgentConfigs()) {
    await check(`${agent.id}: actual installation, invocation and supporting files`, async () => {
      const projectDir = path.join(sandbox, 'project with spaces', agent.id);
      const installed = await installSkills({ projectDir, skillsDir: agent.skillsDir, skills: [name], agentId: agent.id });
      assert.deepEqual(installed, [name]);
      const transformed = getTransformer(agent.id).transform(name, await fs.readFile(path.join(source, 'SKILL.md'), 'utf8'));
      const target = transformed.flat
        ? path.join(projectDir, agent.configDir, transformed.targetDir, transformed.targetName)
        : path.join(projectDir, agent.skillsDir, transformed.targetDir, 'SKILL.md');
      const body = await fs.readFile(target, 'utf8');
      assert(await inspectMarkdown(target) > 0, 'Must validate the installed report link');
      const reference = path.join(path.dirname(target), 'references', name, 'REPORT.md');
      assert((await fs.stat(reference)).isFile());
      await inspectMarkdown(reference);
      const invocation = ['codex', 'codex-app'].includes(agent.id) ? '$aif-skills-audit'
        : agent.id === 'kilocode' ? '/aif:skills-audit'
        : agent.id === 'qwen' ? '/skills aif-skills-audit' : '/aif-skills-audit';
      const commandLines = body.split(/\r?\n/);
      assert(commandLines.some(line => line === invocation || line.startsWith(invocation + ' ')),
        `Missing executable invocation example for ${agent.id}: ${invocation}`);
      if (invocation !== '/aif-skills-audit') {
        assert(!commandLines.some(line => line === '/aif-skills-audit' || line.startsWith('/aif-skills-audit ')),
          `Untransformed invocation example for ${agent.id}`);
      }
      assert(body.includes('skill-context/aif-skills-audit/SKILL.md'), 'File paths must not be invocation-rewritten');
      assert(!body.includes(buildTemplateVars(agent).home_skills_dir), 'Personal skills paths must be resolved on the current machine');
      if (!transformed.flat) assert(/^disable-model-invocation:\s*true\s*$/m.test(body), 'Explicit opt-in metadata missing');
      assert(!body.includes('{{skills_dir}}'));
      if (agent.id === 'kilocode') {
        assert(transformed.flat);
        assert.equal(transformed.targetDir, 'workflows');
      }
      if (agent.id === 'antigravity') assert(!transformed.flat, 'Native skill format required');

      // Exercise the same checker against corrupt installed artifacts, not
      // snapshots of the instructions or a mock of installer behavior.
      await fs.writeFile(target, body + '\n[broken](references/missing-audit-file.md)\n');
      await assert.rejects(() => inspectMarkdown(target), /ENOENT|Missing linked file/);
      await fs.writeFile(target, body + '\n{{skills_dir}}\n');
      await assert.rejects(() => inspectMarkdown(target), /Unresolved template/);
      await fs.writeFile(target, body);
    });
  }

  await check('documentation examples and new links match the public interface', async () => {
    const skillsPath = path.join(root, 'docs/skills.md');
    const skills = await fs.readFile(skillsPath, 'utf8');
    const start = skills.indexOf('### `/aif-skills-audit`');
    assert(start >= 0);
    const next = skills.indexOf('\n### ', start + 1);
    const section = skills.slice(start, next < 0 ? undefined : next);
    for (const flag of flags) assert(section.includes(flag), `Undocumented flag ${flag}`);
    for (const line of section.split(/\r?\n/).filter(line => line.startsWith('/aif-skills-audit'))) {
      for (const flag of line.match(/--[a-z-]+/g) ?? []) assert(flags.includes(flag), `Unknown example flag ${flag}`);
    }
    assert(section.includes('not measured'));
    assert(section.includes('not checked'));
    assert(section.includes('unknown'));
    await inspectMarkdown(skillsPath, section);
    const documents = ['README.md', 'AGENTS.md', 'docs/skills.md', 'docs/workflow.md', 'docs/configuration.md', 'docs/config-reference.md'];
    for (const doc of documents) {
      const file = path.join(root, doc);
      const content = await fs.readFile(file, 'utf8');
      assert(content.includes(doc === 'README.md' ? 'skills-audit' : 'aif-skills-audit'), `Missing catalog/config documentation in ${doc}`);
      // Resolve local file links throughout the affected pages; validate the
      // new audit heading target wherever it is introduced.
      await inspectMarkdown(file, content);
    }
    const broken = path.join(sandbox, 'broken-doc.md');
    await fs.writeFile(broken, '[audit](missing-doc.md#aif-skills-audit)');
    await assert.rejects(() => inspectMarkdown(broken), /ENOENT|Missing linked file/);
    const noAnchor = path.join(sandbox, 'no-anchor.md');
    await fs.writeFile(noAnchor, '# Other heading\n');
    await fs.writeFile(broken, '[audit](no-anchor.md#aif-skills-audit)');
    await assert.rejects(() => inspectMarkdown(broken), /Missing audit anchor/);
  });

  await check('installation never modifies source skill files', async () => {
    assert.deepEqual(await snapshot(source), before);
  });
} finally {
  const resolved = path.resolve(sandbox);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()), 'Cleanup must stay under the temp parent');
  assert(path.basename(resolved).startsWith('aif-skills-audit-'), 'Cleanup requires the owned temp prefix');
  await fs.rm(resolved, { recursive: true, force: true });
}
console.log(`Skills audit: ${passed} passed, ${failed} failed (offline; no inference)`);
process.exitCode = failed ? 1 : 0;
