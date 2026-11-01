#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  applyToolPermissions, stripToolPermissions, validateToolPermission,
  applyExtensionToolPermissions,
} from '../dist/core/tool-permissions.js';
import { loadInstalledExtensionManifest } from '../dist/core/extensions.js';
import { buildManagedSkillsState, installSkills } from '../dist/core/installer.js';
import { getBuiltinAgentConfigs } from '../dist/core/agents.js';
import { getTransformer } from '../dist/core/transformer.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'aif-tool-permissions-'));
const cli = path.join(root, 'dist/cli/index.js');
const requested = 'Bash(aif-test *)';
const shared = 'Bash(pre-existing *)';
const tools = content => parse(content.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1])['allowed-tools'];
const rawField = content => content.match(/^allowed-tools:.*\n/m)[0];
const base = '---\nname: sample\nallowed-tools: Read, Bash(git *) # keep comment\ndescription: Sample\n---\nBody\n';

function editTools(content, edit) {
  const line = rawField(content);
  const marker = line.indexOf(' # aif-ext-tools:');
  const value = JSON.parse(line.slice('allowed-tools: '.length, marker));
  return content.replace(line, `allowed-tools: ${JSON.stringify(edit(value))}${line.slice(marker)}`);
}

function run(project, args, expectFailure = false) {
  try {
    const output = execFileSync(process.execPath, [cli, ...args], {
      cwd: project, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, npm_config_cache: path.join(temp, 'npm-cache'), NO_COLOR: '1' },
    });
    assert.equal(expectFailure, false, `Expected failure: ${args.join(' ')}`);
    return output;
  } catch (error) {
    if (!expectFailure || error instanceof assert.AssertionError) throw error;
    return `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
}

async function extension(directory, name, declaredTools, extra = {}) {
  await fs.mkdir(directory, { recursive: true });
  const manifest = { name, version: '1.0.0', toolPermissions: [
    { target: 'aif-plan', agents: { claude: declaredTools } },
  ], ...extra };
  await fs.writeFile(path.join(directory, 'extension.json'), JSON.stringify(manifest));
  return manifest;
}

try {
  const executionSkills = ['aif-explore', 'aif-grounded', 'aif-fix', 'aif-implement', 'aif-loop', 'aif-qa-check'];
  const permissionContract = 'Shell commands are not pre-approved by this skill.';
  for (const name of executionSkills) {
    const source = await fs.readFile(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');
    const value = tools(source);
    const declared = Array.isArray(value) ? value.join(' ') : value;
    assert(!/(?:^|\s)Bash(?:\s|$)|Bash\(\*\)/.test(declared), `${name}: blanket Bash pre-approval`);
    assert(!/Bash\((?:python3?|node|sh|bash|npm|pnpm|cargo) \*\)/.test(declared), `${name}: replacement catch-all`);
    assert(source.includes(permissionContract), `${name}: missing native permission contract`);
    const applied = applyToolPermissions(source, 'scoped-test', [requested]);
    assert(tools(applied).includes(requested), `${name}: scoped extension permission lost`);
    assert.equal(stripToolPermissions(applied, 'scoped-test'), source);
    const userEdited = editTools(applied, values => [...values, 'Bash(user-approved *)']);
    assert(tools(stripToolPermissions(userEdited, 'scoped-test')).includes('Bash(user-approved *)'),
      `${name}: removing an extension lost the user's explicit rule`);
  }
  let installed = 0;
  for (const agent of getBuiltinAgentConfigs()) {
    const project = path.join(temp, 'execution-skills', agent.id);
    const settings = path.join(project, '.claude', 'settings.json');
    const settingsBytes = '{"permissions":{"ask":["Bash"],"deny":["Bash(destructive *)"]}}\n';
    await fs.mkdir(path.dirname(settings), { recursive: true });
    await fs.writeFile(settings, settingsBytes);
    await installSkills({ projectDir: project, skillsDir: agent.skillsDir, agentId: agent.id, skills: executionSkills });
    for (const name of executionSkills) {
      const source = await fs.readFile(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');
      const target = getTransformer(agent.id).transform(name, source);
      const entry = await fs.readFile(path.join(project, target.flat ? agent.configDir : agent.skillsDir,
        target.targetDir, target.targetName), 'utf8');
      assert(entry.includes(permissionContract), `${agent.id}/${name}: installed approval contract lost`);
      assert(!/^allowed-tools:.*\bBash(?:\s|$)/m.test(entry), `${agent.id}/${name}: installed blanket Bash`);
      installed++;
    }
    assert.equal(await fs.readFile(settings, 'utf8'), settingsBytes, 'Installation changed unrelated permission settings');
  }
  console.log(`PASS ${installed} real skill/runtime installations retain native permission contracts; interactive prompting NOTRUN`);

  for (const source of [
    base,
    base.replace('Read, Bash(git *) # keep comment', '"Read Bash(git *)"'),
    base.replace('Read, Bash(git *) # keep comment', '[Read, "Bash(git *)"]'),
    base.replace(' Read, Bash(git *) # keep comment', '\n  - Read\n  - "Bash(git *)" # keep comment'),
    base.replace(/^allowed-tools:.*\n/m, ''),
    base.replace(' Read, Bash(git *) # keep comment', ''),
    base.replace(' Read, Bash(git *) # keep comment', '').replaceAll('\n', '\r\n'),
    base.replace('Read, Bash(git *) # keep comment', '# empty field'),
    base.replace(' Read, Bash(git *) # keep comment', ' >\n  Read\n  Bash(git *)'),
    base.replaceAll('\n', '\r\n'),
  ]) {
    const applied = applyToolPermissions(source, 'first', [requested]);
    assert.ok(tools(applied).includes(requested), 'Generated frontmatter parses as YAML with the exact tool');
    assert.equal(applyToolPermissions(applied, 'first', [requested]), applied, 'Repeated install is byte-idempotent');
    assert.equal(stripToolPermissions(applied, 'first'), source, 'Removal restores original bytes/comments/format');
    assert.equal(stripToolPermissions(applied), source, 'Managed hashing excludes only the managed field delta');
  }
  let content = applyToolPermissions(base, 'first', [requested]);
  content = applyToolPermissions(content, 'second', [requested]);
  assert.equal(tools(content).filter(tool => tool === requested).length, 1);
  const reverseOrder = applyToolPermissions(applyToolPermissions(base, 'second', [requested]), 'first', [requested]);
  assert.equal(content, reverseOrder, 'Composition is independent of extension installation order');
  content = stripToolPermissions(content, 'first');
  assert.ok(tools(content).includes(requested), 'A second requester keeps the grant alive');
  assert.equal(stripToolPermissions(content, 'second'), base);
  const preexisting = base.replace('Read, Bash(git *)', `Read, ${requested}`);
  assert.equal(stripToolPermissions(applyToolPermissions(preexisting, 'first', [requested]), 'first'), preexisting);
  const scoped = applyToolPermissions(base.replace(/^allowed-tools:.*\n/m, ''), 'first', ['Read(src/**)']);
  assert.deepEqual(tools(scoped), ['Read(src/**)'], 'Native path restrictions must not become unrestricted Read');
  const changed = editTools(applyToolPermissions(base, 'first', [requested]), values => [...values, requested, 'Bash(user *)']);
  assert.equal(stripToolPermissions(changed, 'unrelated'), changed, 'Removing an unrelated extension must not rewrite this field');
  assert.deepEqual(tools(stripToolPermissions(changed, 'first')), ['Read', 'Bash(git *)', requested, 'Bash(user *)'], 'A user duplicate and new entry survive cleanup');
  const editedGrant = applyToolPermissions(base, 'first', [requested]).replace(JSON.stringify(requested), '"Bash(aif-test --safe *)"');
  assert.ok(tools(stripToolPermissions(editedGrant, 'first')).includes('Bash(aif-test --safe *)'), 'Edited grant becomes user data');
  for (const permission of ['Bash', 'Bash(*)', 'Bash(* *)', 'Bash(git * && curl *)', 'Bash(git *)\nWrite', 'Read(src/\u0085*)', '*']) {
    assert.throws(() => validateToolPermission(permission));
  }
  for (const source of [base.replace('Read, Bash(git *) # keep comment', '{Bash: true}'), base.replace('description:', 'allowed-tools: Write\ndescription:'), base.replace('Read, Bash(git *) # keep comment', '&tools [Read]')]) {
    assert.throws(() => applyToolPermissions(source, 'first', [requested]), 'Ambiguous/unsupported YAML must fail without modification');
  }
  const corrupt = applyToolPermissions(base, 'first', [requested]).replace(' # aif-ext-tools:{', ' # aif-ext-tools:INVALID{');
  assert.equal(stripToolPermissions(corrupt), corrupt, 'Unproven metadata must not hide hash drift or delete tools');
  for (const extra of ['disallowed-tools: []\n', '---\nInjected body\n']) {
    const applied = applyToolPermissions(base, 'first', [requested]);
    const line = rawField(applied);
    const marker = line.indexOf(' # aif-ext-tools:');
    const metadata = JSON.parse(line.slice(marker + ' # aif-ext-tools:'.length));
    metadata.base += extra;
    const forged = applied.replace(line, `${line.slice(0, marker)} # aif-ext-tools:${JSON.stringify(metadata)}\n`);
    assert.equal(stripToolPermissions(forged), forged, 'A forged baseline cannot inject other fields or body text during removal');
  }
  console.log('PASS native YAML forms, exact grants, ownership, user edits, duplicates, and invalid input');

  const schema = JSON.parse(await fs.readFile(path.join(root, 'schemas/extension.schema.json'), 'utf8'));
  const validate = new Ajv2020({ strict: true }).compile(schema);
  const a = path.join(temp, 'extension-a');
  const manifest = await extension(a, 'permissions-a', [requested, shared], {
    toolPermissions: [{ target: 'aif-plan', agents: { claude: [requested, shared], cursor: ['Bash(ignored *)'] } }],
  });
  assert.ok(validate(manifest), JSON.stringify(validate.errors));
  assert.equal(validate({ ...manifest, toolPermissions: [{ target: '../escape', agents: { claude: [requested] } }] }), false);
  assert.equal(validate({ ...manifest, toolPermissions: [{ target: 'aif-plan', agents: { claude: ['Read\nBash'] } }] }), false);
  assert.equal(validate({ ...manifest, toolPermissions: [{ target: 'aif-plan', agents: { unsupported: ['Read\u001b[2J'] } }] }), false);
  const invalidDir = path.join(temp, 'invalid');
  for (const toolPermissions of [null, [{ target: '../escape', agents: { claude: [requested] } }], [{ target: 'aif-plan', agents: { claude: ['Bash(*)'] } }], [{ target: 'aif-plan', agents: { unsupported: ['Read\u001b[2J'] } }], [manifest.toolPermissions[0], manifest.toolPermissions[0]]]) {
    await extension(invalidDir, 'invalid', [], { toolPermissions });
    await assert.rejects(loadInstalledExtensionManifest(invalidDir));
  }

  const project = path.join(temp, 'project');
  await fs.mkdir(project);
  run(project, ['init', '--agents', 'claude,cursor', '--skills', 'aif-plan']);
  for (const name of ['.git', 'custom folder', 'untracked-broken']) {
    const directory = path.join(project, '.claude/skills', name);
    await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, 'SKILL.md'), 'User data without valid frontmatter\n');
  }
  const target = path.join(project, '.claude/skills/aif-plan/SKILL.md');
  const cursor = path.join(project, '.cursor/skills/aif-plan/SKILL.md');
  const cursorBefore = await fs.readFile(cursor, 'utf8');
  const original = await fs.readFile(target, 'utf8');
  await fs.writeFile(target, original.replace(/^allowed-tools:.*$/m, `allowed-tools: [Read, "${shared}"] # user baseline`));
  const output = run(project, ['extension', 'add', a]);
  assert.match(output, /Requested tool permissions:.*claude\/aif-plan/);
  run(project, ['extension', 'add', a]);
  assert.equal(await fs.readFile(cursor, 'utf8'), cursorBefore, 'Unsupported runtime target remains untouched');
  const b = path.join(temp, 'extension-b');
  await extension(b, 'permissions-b', [requested]);
  run(project, ['extension', 'add', b]);
  await fs.writeFile(target, editTools(await fs.readFile(target, 'utf8'), values => [...values, 'Bash(user-extra *)']));
  const unrelated = path.join(temp, 'unrelated');
  await extension(unrelated, 'unrelated', [], { toolPermissions: [] });
  const beforeUnrelated = await fs.readFile(target, 'utf8');
  run(project, ['extension', 'add', unrelated]);
  run(project, ['extension', 'remove', 'unrelated']);
  assert.equal(await fs.readFile(target, 'utf8'), beforeUnrelated, 'Unrelated extension commands must not rewrite managed tool fields');
  for (const args of [['update'], ['update', '--force'], ['init', '--agents', 'claude,cursor', '--skills', 'aif-plan'], ['upgrade']]) {
    run(project, args);
    const current = tools(await fs.readFile(target, 'utf8'));
    assert.deepEqual(new Set(current), new Set(['Read', shared, requested, 'Bash(user-extra *)']), `${args}: preserve user and extension grants`);
    assert.equal(current.filter(tool => tool === requested).length, 1);
  }
  const customizedConfig = JSON.parse(await fs.readFile(path.join(project, '.ai-factory.json'), 'utf8'));
  assert.equal(customizedConfig.agents.find(agent => agent.id === 'claude').managedSkills['aif-plan'].rawInstalledHash, undefined, 'User tool edits must not become proven package ownership');
  const updated = { ...manifest, version: '1.0.1', toolPermissions: [{ target: 'aif-plan', agents: { claude: ['Bash(aif-test-v2 *)', shared] } }] };
  await fs.writeFile(path.join(a, 'extension.json'), JSON.stringify(updated));
  run(project, ['extension', 'update', 'permissions-a', '--force']);
  assert.ok(tools(await fs.readFile(target, 'utf8')).includes('Bash(aif-test-v2 *)'));
  assert.ok(tools(await fs.readFile(target, 'utf8')).includes(requested), 'Other extension retains its request after refresh');

  const failing = path.join(temp, 'failing');
  await extension(failing, 'permissions-failure', ['Bash(temporary *)'], { mcpServers: [{ key: 'broken', template: { command: 123 } }] });
  const beforeFailure = await fs.readFile(target, 'utf8');
  assert.match(run(project, ['extension', 'add', failing], true), /Error installing extension/);
  assert.equal(await fs.readFile(target, 'utf8'), beforeFailure, 'Later asset failure restores the exact prior skill including permissions');
  run(project, ['extension', 'remove', 'permissions-a']);
  assert.ok(tools(await fs.readFile(target, 'utf8')).includes(requested));
  assert.ok(!tools(await fs.readFile(target, 'utf8')).includes('Bash(aif-test-v2 *)'));
  await fs.rm(path.join(project, '.ai-factory/extensions/permissions-b/extension.json'));
  run(project, ['extension', 'remove', 'permissions-b']);
  assert.deepEqual(tools(await fs.readFile(target, 'utf8')), ['Read', shared, 'Bash(user-extra *)'], 'Manifest-less removal keeps pre-existing and user entries');
  console.log('PASS CLI add/reinstall/update/force/init/refresh/remove, shared requests, and rollback');

  const replaced = path.join(temp, 'replacement-project');
  await fs.mkdir(replaced);
  run(replaced, ['init', '--agents', 'claude', '--skills', 'aif-plan']);
  const replacedTarget = path.join(replaced, '.claude/skills/aif-plan/SKILL.md');
  const bundled = await fs.readFile(replacedTarget, 'utf8');
  const replacement = path.join(temp, 'replacement-extension');
  const source = path.join(replacement, 'skills/custom-plan');
  await fs.mkdir(source, { recursive: true });
  const native = version => `Bash(replacement-native-${version} *)`;
  const replacementBody = version => `---\nname: custom-plan\nallowed-tools: Read ${native(version)}\n---\nReplacement ${version}\n`;
  await fs.writeFile(path.join(source, 'SKILL.md'), replacementBody('v1'));
  const replacementManifest = await extension(replacement, 'replacement-tools', ['Bash(replacement-request *)'], {
    replaces: { 'skills/custom-plan': 'aif-plan' },
  });
  run(replaced, ['extension', 'add', replacement]);
  run(replaced, ['extension', 'add', b]);
  await fs.writeFile(replacedTarget, editTools(await fs.readFile(replacedTarget, 'utf8'), values => [...values, 'Bash(replacement-user *)']));
  run(replaced, ['init', '--agents', 'claude', '--skills', 'aif-plan']);
  assert.ok(tools(await fs.readFile(replacedTarget, 'utf8')).includes('Bash(replacement-user *)'), 'Same source owner preserves local tool edits');

  // A top-level update captures its own baseline before refreshing extensions.
  // Neither that snapshot nor the inner refresh may restore v1 native grants.
  await fs.writeFile(path.join(source, 'SKILL.md'), replacementBody('v2'));
  await fs.writeFile(path.join(replacement, 'extension.json'), JSON.stringify({ ...replacementManifest, version: '1.0.1' }));
  run(replaced, ['update', '--force']);
  let replacementTools = tools(await fs.readFile(replacedTarget, 'utf8'));
  assert.ok(replacementTools.includes(native('v2')), 'Refresh uses the new source tool field');
  assert.ok(!replacementTools.includes(native('v1')), 'Outer update cannot restore the old replacement source field');
  assert.ok(!replacementTools.includes('Bash(replacement-user *)'), 'Old source edits do not cross a source permission change');
  assert.ok(replacementTools.includes(requested), 'Another extension keeps its request after refresh');

  // A same-version local refresh must also notice changed native defaults.
  await fs.writeFile(path.join(source, 'SKILL.md'), replacementBody('v3'));
  run(replaced, ['extension', 'update', 'replacement-tools', '--force']);
  replacementTools = tools(await fs.readFile(replacedTarget, 'utf8'));
  assert.ok(replacementTools.includes(native('v3')));
  assert.ok(!replacementTools.includes(native('v2')), 'Same-version refresh must not inherit old source grants');
  run(replaced, ['extension', 'remove', 'replacement-tools']);
  const restored = await fs.readFile(replacedTarget, 'utf8');
  assert.deepEqual(new Set(tools(restored)), new Set(tools(applyToolPermissions(bundled, 'permissions-b', [requested]))), 'Restored bundle gets its own defaults and remaining requests');
  assert.ok(!restored.includes('replacement-native-'), 'Removed replacement native grants must not survive as unowned base tools');
  assert.ok(!restored.includes('replacement-request'));
  run(replaced, ['extension', 'remove', 'permissions-b']);
  assert.equal(await fs.readFile(replacedTarget, 'utf8'), bundled, 'Final removal restores the bundled tool declaration');
  console.log('PASS replacement refresh/removal use current source defaults and preserve remaining request ownership');

  const clean = path.join(temp, 'clean');
  await fs.mkdir(clean);
  run(clean, ['init', '--agents', 'claude', '--skills', 'aif-plan']);
  run(clean, ['extension', 'add', b]);
  run(clean, ['update']);
  const config = JSON.parse(await fs.readFile(path.join(clean, '.ai-factory.json'), 'utf8'));
  assert.ok(config.agents[0].managedSkills['aif-plan'].rawInstalledHash, 'Known composition still produces a proven managed receipt');

  const outside = path.join(temp, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'SKILL.md'), base);
  await fs.symlink(outside, path.join(clean, '.claude/skills/linked'), 'dir');
  await assert.rejects(applyExtensionToolPermissions(clean, config.agents, [{ name: 'unsafe', version: '1.0.0', toolPermissions: [{ target: 'linked', agents: { claude: [requested] } }] }]));
  assert.equal(await fs.readFile(path.join(outside, 'SKILL.md'), 'utf8'), base);
  await fs.mkdir(path.join(clean, '.claude/skills/hardlink'));
  await fs.link(path.join(outside, 'SKILL.md'), path.join(clean, '.claude/skills/hardlink/SKILL.md'));
  await assert.rejects(applyExtensionToolPermissions(clean, config.agents, [{ name: 'unsafe', version: '1.0.0', toolPermissions: [{ target: 'hardlink', agents: { claude: [requested] } }] }]));
  assert.equal(await fs.readFile(path.join(outside, 'SKILL.md'), 'utf8'), base);
  await assert.rejects(applyExtensionToolPermissions(clean, [...config.agents, { ...config.agents[0], id: 'cursor' }], [manifest]));
  const cleanTarget = path.join(clean, '.claude/skills/aif-plan/SKILL.md');
  await fs.writeFile(cleanTarget, applyToolPermissions(await fs.readFile(cleanTarget, 'utf8'), 'unregistered', ['Bash(unknown *)']));
  const unproven = await buildManagedSkillsState(clean, config.agents[0], ['aif-plan'], undefined, config.extensions);
  assert.equal(unproven['aif-plan'].rawInstalledHash, undefined, 'An unregistered ownership marker cannot produce a deletion receipt');
  console.log('PASS managed receipt proof, symlink boundaries, and shared runtime isolation');
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
