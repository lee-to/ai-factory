#!/usr/bin/env node
// ZCode runtime contract: command stubs, MCP settings, and their lifecycle.
// The parsers replayed here are ported from ZCode CLI 0.18.0 (NodeCustomCommandAdapter
// and NodeSkillAdapter), so generated files are checked against the rules the real
// client applies rather than against our own writer.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateSkills } from '../dist/core/installer.js';
import { loadConfig } from '../dist/core/config.js';
import { resolveSkillTargets } from '../dist/core/skill-targets.js';
import { configureExtensionMcpServers, removeExtensionMcpServers } from '../dist/core/mcp.js';
import { getAgentConfig } from '../dist/core/agents.js';
import { getAgentOnboarding, getTransformer, getTransformerIdentity } from '../dist/core/transformer.js';
import { ZCodeTransformer } from '../dist/core/transformers/zcode.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI_PATH = path.join(ROOT_DIR, 'bin', 'ai-factory.js');
const MARKER = '<!-- aif:zcode-command -->';

// ZCode: command names are validated after lowercasing; unknown frontmatter keys warn.
const ZCODE_COMMAND_NAME = /^[a-z0-9][a-z0-9_:-]{0,63}$/;
const ZCODE_COMMAND_KEYS = new Set(['allowed-tools', 'argument-hint', 'description', 'disable-noninteractive', 'model', 'skills']);
// ZCode: the mcp.servers stdio schema is strict, an unknown key drops the server.
const ZCODE_STDIO_KEYS = new Set(['alwaysLoad', 'isolation', 'protocolVersion', 'enabled', 'timeoutMs', 'type', 'command', 'args', 'cwd', 'env']);
const ZCODE_MAX_DESCRIPTION = 1024;

const tests = [];
const test = (name, run) => tests.push({ name, run });
const SKIP = Symbol('skip');

async function withProject(run) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'aif-zcode-'));
  try {
    return await run(project);
  } finally {
    fs.rmSync(project, { recursive: true, force: true, maxRetries: 3 });
  }
}

const skillsDir = project => path.join(project, '.zcode', 'skills');
const commandsDir = project => path.join(project, '.zcode', 'commands');
const settingsPath = project => path.join(project, '.zcode', 'config.json');
const stubPath = (project, skill) => path.join(commandsDir(project), `${skill}.md`);
const read = file => fs.readFileSync(file, 'utf8');
const exists = file => fs.existsSync(file);
const listCommands = project => (exists(commandsDir(project)) ? fs.readdirSync(commandsDir(project)).sort() : []);
const flatten = text => text.replace(/\\"/g, '"').replace(/\s+/g, ' ').trim();

function runCli(project, args) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], { cwd: project, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, `${args.join(' ')} failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
}

function init(project, skills = '', mcp = '', agents = 'zcode') {
  const args = ['init', '--agents', agents];
  if (skills) args.push('--skills', skills);
  if (mcp) args.push('--mcp', mcp);
  return runCli(project, args);
}

function runUpdate(project, force = false) {
  const url = new URL('../dist/cli/commands/update.js', import.meta.url).href;
  const code = `globalThis.fetch = async () => ({ok:true,status:200,headers:{get:()=>null},json:async()=>({version:'2.23.0'})}); const { updateCommand } = await import(${JSON.stringify(url)}); await updateCommand({force:${force}});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: project, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, `update failed: ${result.error?.message ?? result.stderr}\n${result.stdout}`);
  return result.stdout;
}

// --- ZCode parsers -------------------------------------------------------------------------

// ZCode parseFlatYaml + parseScalar: flat `key: value` lines, indented lines ignored,
// outer quotes stripped. Skills also read `>`/`|` block scalars; command files do not.
// Returns null without frontmatter.
function parseZCodeFrontmatter(content, blockScalars) {
  if (!content.replace(/^\uFEFF/, '').startsWith('---')) return null;
  const lines = content.split(/\r?\n/);
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end <= 0) return null;
  const values = {};
  const keys = [];
  for (let index = 1; index < end; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith('#') || /^\s/.test(line)) continue;
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (key in values) continue;
    keys.push(key);
    const value = line.slice(separator + 1).trim();
    const style = blockScalars ? (/^>[+-]?$/.test(value) ? 'folded' : /^\|[+-]?$/.test(value) ? 'literal' : null) : null;
    if (!style) {
      values[key] = zcodeScalar(value);
      continue;
    }
    const block = [];
    let cursor = index + 1;
    while (cursor < end && (!lines[cursor].trim() || /^\s/.test(lines[cursor]))) {
      block.push(lines[cursor]);
      cursor += 1;
    }
    values[key] = style === 'folded' ? foldZCodeBlock(block) : block.join('\n').trim();
    index = cursor - 1;
  }
  return { values, keys };
}

function zcodeScalar(value) {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed.length) return undefined;
  const quoted = (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"));
  return quoted ? trimmed.slice(1, -1).trim() : trimmed;
}

function foldZCodeBlock(lines) {
  let indent = null;
  for (const line of lines) {
    if (line.trim()) indent = indent === null ? line.match(/^(\s*)/)[1].length : Math.min(indent, line.match(/^(\s*)/)[1].length);
  }
  const stripped = lines.map(line => (line.trim() ? line.slice(indent ?? 0) : ''));
  const paragraphs = [];
  let current = [];
  for (const line of stripped) {
    if (!line.trim()) {
      if (current.length) paragraphs.push(current.join(' '));
      current = [];
      continue;
    }
    current.push(line.trim());
  }
  if (current.length) paragraphs.push(current.join(' '));
  return paragraphs.join('\n').trim();
}

// What ZCode loads from a command file, or null when it drops the command.
function replayZCodeCommand(file) {
  const name = path.basename(file, '.md').toLowerCase();
  if (!ZCODE_COMMAND_NAME.test(name)) return null;
  const frontmatter = parseZCodeFrontmatter(read(file), false);
  const description = zcodeScalar(frontmatter?.values.description);
  if (!description) return null; // ZCode falls back to the first body line; stubs always declare one.
  const skills = frontmatter.values.skills;
  return {
    name,
    keys: frontmatter.keys,
    description: description.slice(0, ZCODE_MAX_DESCRIPTION),
    argumentHint: zcodeScalar(frontmatter.values['argument-hint']),
    skills: skills ? skills.replace(/^\[/, '').replace(/\]$/, '').split(',').map(skill => skill.trim()).filter(Boolean) : [],  };
}

// What ZCode loads from a skill, or null when it drops the skill.
function replayZCodeSkill(directory) {
  const file = path.join(directory, 'SKILL.md');
  if (!exists(file)) return null;
  const frontmatter = parseZCodeFrontmatter(read(file), true);
  const name = zcodeScalar(frontmatter?.values.name) ?? (frontmatter === null ? path.basename(directory) : undefined);
  const description = zcodeScalar(frontmatter?.values.description) ?? '';
  if (!name || (frontmatter !== null && !description) || description.length > ZCODE_MAX_DESCRIPTION) return null;
  return { name, description };
}

// --- Tests ---------------------------------------------------------------------------------

test('registry: zcode runtime, transformer identity and onboarding', async () => {
  const agent = getAgentConfig('zcode');
  assert.equal(agent.configDir, '.zcode');
  assert.equal(agent.skillsDir, '.zcode/skills');
  assert.equal(agent.settingsFile, '.zcode/config.json');
  assert.equal(agent.supportsMcp, true);
  // Must match the agent id published by the skills CLI, so /aif installs external skills into .zcode/skills.
  assert.equal(agent.skillsCliAgent, 'zcode');
  assert.ok(getTransformer('zcode') instanceof ZCodeTransformer);
  assert.equal(getTransformerIdentity('zcode'), 'zcode');
  const onboarding = getAgentOnboarding('zcode');
  assert.ok(onboarding.welcomeMessage.some(line => line.includes('.zcode/commands/')));
  assert.ok(onboarding.invocationHint.includes('/aif'));
});

test('init: every bundled skill gets a command the ZCode parser loads', () => withProject(async project => {
  init(project);
  const installed = fs.readdirSync(skillsDir(project)).sort();
  assert.deepEqual(listCommands(project), installed.map(skill => `${skill}.md`).sort());
  assert.ok(installed.length > 1, 'expected the bundled skill set');

  for (const skill of installed) {
    const loaded = replayZCodeCommand(stubPath(project, skill));
    assert.ok(loaded, `${skill}: ZCode would drop the command`);
    assert.deepEqual(loaded.keys.filter(key => !ZCODE_COMMAND_KEYS.has(key)), [], `${skill}: unknown command key`);
    assert.deepEqual(loaded.skills, [skill], `${skill}: command must mount the skill ZCode loads`);
    assert.ok(loaded.argumentHint, `${skill}: argument hint missing`);
    assert.ok(read(stubPath(project, skill)).includes('$ARGUMENTS'), `${skill}: arguments are not passed through`);

    const loadedSkill = replayZCodeSkill(path.join(skillsDir(project), skill));
    assert.ok(loadedSkill, `${skill}: ZCode would drop the skill`);
    assert.equal(loadedSkill.name, skill, `${skill}: frontmatter name differs from the directory`);
    assert.equal(loaded.description, flatten(loadedSkill.description), `${skill}: command description must be the skill description on one line`);
  }

  const sources = installed.map(skill => read(path.join(skillsDir(project), skill, 'SKILL.md')));
  assert.ok(sources.some(source => /^description: [>|][+-]?\s*$/m.test(source)), 'fixture: expected a block-scalar description');
  for (const skill of installed) {
    const description = replayZCodeCommand(stubPath(project, skill)).description;
    assert.ok(!/^[>|]/.test(description) && !description.includes('\n'), `${skill}: block scalar leaked into the command`);
    assert.ok(!description.includes('\\"'), `${skill}: escaped quotes leaked into the command`);
  }
}));

test('init: managed stubs are rewritten only when their content changes', () => withProject(async project => {
  init(project, 'aif,aif-plan');
  const snapshot = () => listCommands(project).map(name => [name, read(path.join(commandsDir(project), name)), fs.statSync(path.join(commandsDir(project), name)).mtimeMs]);
  const before = snapshot();
  init(project, 'aif,aif-plan');
  assert.deepEqual(snapshot(), before);

  const stale = `---\ndescription: stale\nskills: aif-plan\n---\n${MARKER}\n\nstale body\n`;
  fs.writeFileSync(stubPath(project, 'aif-plan'), stale);
  init(project, 'aif,aif-plan');
  assert.notEqual(read(stubPath(project, 'aif-plan')), stale);
  assert.deepEqual(listCommands(project), before.map(([name]) => name));
}));

test('P1: user-owned .zcode/commands files survive init, update and agent removal', () => withProject(async project => {
  fs.mkdirSync(commandsDir(project), { recursive: true });
  const userCommand = '---\ndescription: My own /aif command\n---\nDo exactly this.\n';
  // The marker mentioned inside a sentence is not an ownership claim.
  const userNotes = `Notes\nThe marker ${MARKER} is mentioned here inline.\n`;
  const userDeploy = '---\ndescription: Deploy\n---\nship it\n';
  fs.writeFileSync(stubPath(project, 'aif'), userCommand);
  fs.writeFileSync(stubPath(project, 'aif-plan'), userNotes);
  fs.writeFileSync(path.join(commandsDir(project), 'deploy.md'), userDeploy);

  const output = init(project, 'aif,aif-plan');
  assert.equal(read(stubPath(project, 'aif')), userCommand);
  assert.equal(read(stubPath(project, 'aif-plan')), userNotes);
  assert.equal(read(path.join(commandsDir(project), 'deploy.md')), userDeploy);
  assert.ok(output.includes('Preserved user command') && output.includes('aif.md'), 'conflict was not reported');
  assert.ok(read(stubPath(project, 'aif-skill-generator')).includes(MARKER));

  runUpdate(project);
  runUpdate(project, true);
  assert.equal(read(stubPath(project, 'aif')), userCommand);
  assert.equal(read(stubPath(project, 'aif-plan')), userNotes);

  init(project, 'aif', '', 'claude');
  assert.equal(read(stubPath(project, 'aif')), userCommand);
  assert.equal(read(stubPath(project, 'aif-plan')), userNotes);
  assert.equal(read(path.join(commandsDir(project), 'deploy.md')), userDeploy);
  assert.equal(exists(stubPath(project, 'aif-skill-generator')), false);
}));

test('P1: a file carrying the marker on its own line is owned and cleaned up', () => withProject(async project => {
  init(project, 'aif');
  const edited = `---\ndescription: edited copy\nskills: aif\n---\n${MARKER}\n\nmy edits\n`;
  fs.writeFileSync(stubPath(project, 'aif'), edited);
  init(project, 'aif');
  assert.notEqual(read(stubPath(project, 'aif')), edited, 'managed stub was not refreshed');
  init(project, 'aif', '', 'claude');
  assert.equal(exists(stubPath(project, 'aif')), false);
}));

test('P2: a removal-only update prunes the stale managed command', () => withProject(async project => {
  init(project, 'aif,aif-plan');
  // A skill shipped by an earlier package version: its directory and stub still exist.
  const retired = path.join(skillsDir(project), 'aif-retired');
  fs.cpSync(path.join(skillsDir(project), 'aif-plan'), retired, { recursive: true });
  const skillMd = path.join(retired, 'SKILL.md');
  fs.writeFileSync(skillMd, read(skillMd).replace(/^name: .*$/m, 'name: aif-retired'));
  await getTransformer('zcode').postInstall(project);
  assert.ok(exists(stubPath(project, 'aif-retired')));

  const agent = (await loadConfig(project)).agents.find(candidate => candidate.id === 'zcode');
  agent.installedSkills = [...agent.installedSkills, 'aif-retired'];
  const [group] = await resolveSkillTargets(project, [agent]);
  const result = await updateSkills(agent, project, { renderContext: group.context });

  assert.deepEqual(result.entries.find(entry => entry.skill === 'aif-retired'), { skill: 'aif-retired', status: 'removed', reason: 'package-removed' });
  assert.deepEqual(result.entries.filter(entry => entry.status === 'changed'), [], 'fixture must stay a removal-only update');
  assert.equal(exists(retired), false);
  assert.equal(exists(stubPath(project, 'aif-retired')), false, 'stale managed command left behind');
  assert.ok(exists(stubPath(project, 'aif')) && exists(stubPath(project, 'aif-plan')));
}));

test('lifecycle: re-init prunes deselected skills and agent removal removes only managed stubs', () => withProject(async project => {
  init(project, 'aif,aif-plan');
  assert.deepEqual(listCommands(project), ['aif-plan.md', 'aif-skill-generator.md', 'aif.md']);
  init(project, 'aif');
  assert.deepEqual(listCommands(project), ['aif-skill-generator.md', 'aif.md']);
  init(project, 'aif', '', 'claude');
  assert.equal(exists(commandsDir(project)), false, 'empty commands directory left behind');
}));

test('stubs: skills ZCode cannot expose are skipped and their stale stubs pruned', () => withProject(async project => {
  init(project, 'aif');
  const blocked = {
    'bad.name': '---\nname: bad-name\ndescription: dotted directory\n---\nbody\n',
    'aif-no-description': '---\nname: aif-no-description\n---\nbody\n',
    'aif-too-long': `---\nname: aif-too-long\ndescription: ${'x'.repeat(ZCODE_MAX_DESCRIPTION + 1)}\n---\nbody\n`,
    'aif-no-skill-md': null,
  };
  for (const [skill, content] of Object.entries(blocked)) {
    fs.mkdirSync(path.join(skillsDir(project), skill), { recursive: true });
    if (content !== null) fs.writeFileSync(path.join(skillsDir(project), skill, 'SKILL.md'), content);
    fs.writeFileSync(stubPath(project, skill), `---\ndescription: stale\nskills: ${skill}\n---\n${MARKER}\n\nstale\n`);
  }
  // ZCode lowercases command names, so a mixed-case directory is still exposable.
  fs.mkdirSync(path.join(skillsDir(project), 'Aif-Upper'), { recursive: true });
  fs.writeFileSync(path.join(skillsDir(project), 'Aif-Upper', 'SKILL.md'), '---\nname: aif-upper\ndescription: Mixed case directory\n---\nbody\n');

  await getTransformer('zcode').postInstall(project);
  for (const skill of Object.keys(blocked)) assert.equal(exists(stubPath(project, skill)), false, `${skill} kept a command`);
  assert.deepEqual(replayZCodeCommand(stubPath(project, 'Aif-Upper'))?.skills, ['aif-upper']);
  assert.ok(exists(stubPath(project, 'aif')));
}));

test('mcp: servers use the strict stdio shape and inherit credentials from the environment', () => withProject(async project => {
  const userSettings = { model: 'glm-5', hooks: { enabled: false }, mcp: { servers: { 'user-server': { type: 'stdio', command: 'keep-me' } } } };
  fs.mkdirSync(path.join(project, '.zcode'), { recursive: true });
  fs.writeFileSync(settingsPath(project), JSON.stringify(userSettings));

  init(project, 'aif', 'github,postgres,filesystem');
  const saved = JSON.parse(read(settingsPath(project)));
  assert.equal(saved.model, 'glm-5');
  assert.deepEqual(saved.hooks, { enabled: false });
  const servers = saved.mcp.servers;
  assert.deepEqual(servers['user-server'], userSettings.mcp.servers['user-server']);
  assert.ok(!read(settingsPath(project)).includes('${'), 'ZCode does not expand templates in configuration files');
  for (const key of ['github', 'postgres', 'filesystem']) {
    const template = JSON.parse(read(path.join(ROOT_DIR, 'mcp', 'templates', `${key}.json`)));
    // Every bundled credential is a bare ${VAR} placeholder: omitted so the server reads the real variable.
    assert.deepEqual(servers[key], { type: 'stdio', command: template.command, args: template.args }, `${key}`);
    assert.deepEqual(Object.keys(servers[key]).filter(field => !ZCODE_STDIO_KEYS.has(field)), [], `${key}: ZCode drops servers with unknown keys`);
  }

  await configureExtensionMcpServers(project, 'zcode', [{
    key: 'custom',
    template: { command: 'node', args: ['server.js'], env: { API_KEY: '${API_KEY}', REGION: 'eu-west-1', URL: 'https://${HOST}/x' } },
  }]);
  assert.deepEqual(JSON.parse(read(settingsPath(project))).mcp.servers.custom, {
    type: 'stdio', command: 'node', args: ['server.js'], env: { REGION: 'eu-west-1', URL: 'https://${HOST}/x' },
  });

  await removeExtensionMcpServers(project, 'zcode', ['custom']);
  const after = JSON.parse(read(settingsPath(project)));
  assert.equal('custom' in after.mcp.servers, false);
  assert.ok(after.mcp.servers.github && after.mcp.servers['user-server'] && after.model === 'glm-5');
}));

test('live ZCode client discovers the generated commands and skills', () => withProject(async project => {
  const cli = process.env.ZCODE_CLI;
  if (!cli) return SKIP;
  init(project, 'aif,aif-plan,aif-verify');
  const expected = ['aif', 'aif-plan', 'aif-skill-generator', 'aif-verify'];
  for (const kind of ['commands', 'skills']) {
    const result = spawnSync(process.execPath, [cli, kind, 'list', '--json', '--cwd', project], { encoding: 'utf8', timeout: 120000 });
    assert.equal(result.status, 0, `${kind} list failed: ${result.error?.message ?? result.stderr}`);
    const listing = JSON.parse(result.stdout);
    const mine = listing[kind].filter(entry => entry.scope === 'project' && entry.source === 'zcode');
    assert.deepEqual(mine.map(entry => entry.name).sort(), expected);
    assert.deepEqual(listing.diagnostics.filter(diagnostic => diagnostic.severity === 'error'), []);
    if (kind === 'commands') {
      for (const command of mine) assert.deepEqual(command.skills, [command.name]);
    }
  }
}));

let failures = 0;
let skipped = 0;
for (const { name, run } of tests) {
  try {
    if (await run() === SKIP) {
      skipped += 1;
      console.log(`SKIP ${name} (set ZCODE_CLI=/path/to/zcode.cjs to run it)`);
      continue;
    }
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
console.log(failures ? `\nFAILED: ${failures}/${tests.length}` : `\nPASSED: ${tests.length - skipped}/${tests.length}${skipped ? ` (${skipped} skipped)` : ''}`);
process.exitCode = failures ? 1 : 0;
