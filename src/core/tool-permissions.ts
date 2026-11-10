import path from 'node:path';
import fs from 'node:fs/promises';
import { isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { AgentInstallation, ExtensionRecord } from './config.js';
import { loadAllExtensions, type ExtensionManifest } from './extensions.js';
import { logSkillTarget, physicalProjectPath } from './skill-targets.js';

const MARKER = ' # aif-ext-tools:';
const IDENTIFIER = /^[a-zA-Z0-9][\w.-]*$/;
interface Request { extension: string; tools: string[] }
interface Ownership { base: string; requests: Request[] }
interface Field { start: number; end: number; raw: string; tools: string[]; newline: string }
export interface ToolPermissionBase { agentId: string; skill: string; base: string; sourceOwner: string | null }

export function validateToolPermission(tool: unknown): asserts tool is string {
  if (typeof tool !== 'string' || !tool || tool.length > 512 || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(tool)) {
    throw new Error('Tool permissions must be non-empty single-line strings (at most 512 characters).');
  }
  if (/^[A-Za-z_][\w.-]*(?:\([^()]+\))?$/.test(tool) && tool.split('(')[0] !== 'Bash') return;
  // Keep executable/subcommand scope literal; never turn it into unrestricted Bash.
  if (/^Bash\([A-Za-z0-9_./-]+(?: [A-Za-z0-9_./:=@-]+)*(?: \*)?\)$/.test(tool)) return;
  throw new Error(`Unsupported Claude tool permission: ${tool}. Use a tool name or a literal Bash command prefix, e.g. Bash(my-extension *).`);
}

function stringTools(value: string): string[] {
  const tools: string[] = [];
  let rest = value.trim();
  while (rest) {
    const match = rest.match(/^([A-Za-z_][\w.:-]*(?:\([^()\r\n]*\))?|\*)(?=[\s,]|$)/);
    if (!match) throw new Error('Unsupported allowed-tools string; use a YAML list for complex tool rules.');
    tools.push(match[1]);
    rest = rest.slice(match[0].length).replace(/^[\s,]+/, '');
  }
  return tools;
}

function field(content: string): Field {
  const frontmatter = content.match(/^---(\r?\n)([\s\S]*?)(?=^---[ \t]*(?:\r?\n|$))/m);
  if (!frontmatter || frontmatter.index !== 0) throw new Error('Missing YAML frontmatter.');
  const offset = 3 + frontmatter[1].length;
  const doc = parseDocument(frontmatter[2], { uniqueKeys: true });
  if (doc.errors.length || doc.warnings.length || !isMap(doc.contents)) throw new Error('Unsupported or invalid YAML frontmatter.');
  const pair = doc.contents.items.find(item => isScalar(item.key) && item.key.value === 'allowed-tools');
  if (!pair) return { start: offset, end: offset, raw: '', tools: [], newline: frontmatter[1] };
  const key = pair.key;
  const value = pair.value;
  if (!isScalar(key) || !key.range || key.anchor || !value || !value.range || value.anchor
      || (key.range[0] > 0 && frontmatter[2][key.range[0] - 1] !== '\n')) {
    throw new Error('Unsupported allowed-tools field or anchor.');
  }
  let tools: string[];
  if (isScalar(value) && typeof value.value === 'string') tools = stringTools(value.value);
  else if (isScalar(value) && value.value === null) tools = [];
  else if (isSeq(value) && value.items.every(item => isScalar(item) && !item.anchor && typeof item.value === 'string')) {
    tools = value.items.map(item => (item as { value: string }).value);
  } else throw new Error('allowed-tools must be a string or a YAML list of strings without aliases.');
  const start = offset + key.range[0];
  let end = offset + value.range[2];
  end += content.slice(end).match(/^\r?\n/)?.[0].length ?? 0;
  return { start, end, raw: content.slice(start, end), tools, newline: frontmatter[1] };
}

function baseTools(base: string): string[] {
  if (!base) return [];
  const current = field(`---\n${base}---\n`);
  if (current.start !== 4 || current.raw !== base) throw new Error('Ownership baseline must contain only the allowed-tools field.');
  return current.tools;
}

function requestedTools(ownership: Ownership): string[] {
  return [...new Set(ownership.requests.flatMap(request => request.tools))];
}

function render(ownership: Ownership, newline: string): string {
  if (!ownership.requests.length) return ownership.base;
  ownership.requests.sort((left, right) => left.extension.localeCompare(right.extension));
  const tools = baseTools(ownership.base);
  for (const tool of requestedTools(ownership)) if (!tools.includes(tool)) tools.push(tool);
  return `allowed-tools: ${JSON.stringify(tools)}${MARKER}${JSON.stringify(ownership)}${newline}`;
}

function ownership(current: Field): Ownership {
  const index = current.raw.indexOf(MARKER);
  if (index < 0) return { base: current.raw, requests: [] };
  const saved = JSON.parse(current.raw.slice(index + MARKER.length).trim()) as Ownership;
  if (typeof saved.base !== 'string' || saved.base.includes(MARKER) || !Array.isArray(saved.requests)
      || saved.requests.some(request => typeof request.extension !== 'string' || !request.extension
        || !Array.isArray(request.tools))) throw new Error('Invalid extension tool ownership marker.');
  for (const request of saved.requests) for (const tool of request.tools) validateToolPermission(tool);
  const originalTools = baseTools(saved.base);
  if (current.raw !== render(saved, current.newline)) {
    // A user changed the field: subtract each owned entry once, preserving edits/duplicates.
    const unmanaged = [...current.tools];
    for (const tool of requestedTools(saved)) {
      if (originalTools.includes(tool)) continue;
      const position = unmanaged.indexOf(tool);
      if (position >= 0) unmanaged.splice(position, 1);
    }
    saved.base = `allowed-tools: ${JSON.stringify(unmanaged)}${current.newline}`;
  }
  return saved;
}

function replace(content: string, current: Field, raw: string): string {
  return content.slice(0, current.start) + raw + content.slice(current.end);
}

export function applyToolPermissions(content: string, extension: string, tools: readonly string[]): string {
  tools.forEach(validateToolPermission);
  const current = field(content);
  const saved = ownership(current);
  const previous = saved.requests.find(request => request.extension === extension);
  if (previous) previous.tools = [...new Set(tools)];
  else saved.requests.push({ extension, tools: [...new Set(tools)] });
  return replace(content, current, render(saved, current.newline));
}

export function stripToolPermissions(content: string, extension?: string): string {
  if (!content.includes(MARKER)) return content;
  try {
    const current = field(content);
    if (!current.raw.includes(MARKER)) return content;
    const saved = ownership(current);
    if (extension && !saved.requests.some(request => request.extension === extension)) return content;
    saved.requests = extension ? saved.requests.filter(request => request.extension !== extension) : [];
    return replace(content, current, render(saved, current.newline));
  } catch {
    // Unreadable ownership is not authority to delete user permissions or ignore hash drift.
    return content;
  }
}

export function applyManifestToolPermissions(content: string, skill: string, runtime: string, manifests: readonly ExtensionManifest[]): string {
  if (runtime !== 'claude') return content;
  for (const manifest of manifests) for (const permission of manifest.toolPermissions ?? []) {
    const tools = permission.agents[runtime];
    if (permission.target === skill && tools?.length) content = applyToolPermissions(content, manifest.name, tools);
  }
  return content;
}

async function skillFile(projectDir: string, agents: readonly AgentInstallation[], agent: AgentInstallation, skill: string): Promise<string> {
  if (!IDENTIFIER.test(skill) || skill.includes('..')) throw new Error(`Unsafe permission target: ${skill}`);
  const root = await physicalProjectPath(projectDir, agent.skillsDir, { preserveCase: true });
  for (const other of agents) {
    if (other.id !== agent.id && await physicalProjectPath(projectDir, other.skillsDir, { preserveCase: true }) === root) {
      throw new Error(`Cannot scope Claude permissions to a root shared with ${other.id}.`);
    }
  }
  const directory = path.join(root, skill);
  const file = path.join(directory, 'SKILL.md');
  const stat = await fs.lstat(file);
  if (!(await fs.lstat(directory)).isDirectory() || !stat.isFile() || stat.nlink > 1) {
    throw new Error('Permission target must be a regular skill directory/file without symbolic or hard links.');
  }
  return file;
}

export async function applyExtensionToolPermissions(projectDir: string, agents: readonly AgentInstallation[], manifests: readonly ExtensionManifest[]): Promise<void> {
  for (const manifest of manifests) for (const permission of manifest.toolPermissions ?? []) {
    for (const [runtime, tools] of Object.entries(permission.agents)) {
      if (runtime !== 'claude') {
        console.warn(`Warning: ${manifest.name}: tool permissions for ${permission.target}/${runtime} are unsupported; no permissions applied.`);
        continue;
      }
      if (!agents.some(agent => agent.id === runtime)) {
        console.warn(`Warning: ${manifest.name}: permission runtime ${runtime} is not configured; skipped.`);
      }
      for (const agent of agents.filter(candidate => candidate.id === runtime)) {
        try {
          const file = await skillFile(projectDir, agents, agent, permission.target);
          const before = await fs.readFile(file, 'utf8');
          const after = applyToolPermissions(before, manifest.name, tools);
          console.log(`Tool permissions: ${manifest.name} -> ${runtime}/${permission.target}: ${tools.join(', ')}`);
          if (after !== before) await fs.writeFile(file, after);
          logSkillTarget('permissions:applied', { extension: manifest.name, runtime, skill: permission.target, tools });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          console.warn(`Warning: ${manifest.name}: permission target ${runtime}/${permission.target} is not installed; skipped.`);
        }
      }
    }
  }
}

async function toolPermissionSourceOwners(projectDir: string, extensions: readonly ExtensionRecord[], skills: ReadonlySet<string>): Promise<Map<string, string | null>> {
  const owners = new Map<string, string | null>();
  // An applied replacement with unavailable source evidence is never a local base.
  for (const extension of extensions) for (const skill of extension.replacedSkills ?? []) {
    if (skills.has(skill)) owners.set(skill, null);
  }
  const installed = await loadAllExtensions(projectDir, extensions.map(extension => extension.name));
  for (const { dir, manifest } of installed) {
    const applied = new Set(extensions.find(extension => extension.name === manifest.name)?.replacedSkills ?? []);
    for (const relative of new Set([...(manifest.skills ?? []), ...Object.keys(manifest.replaces ?? {})])) {
      const replacement = manifest.replaces?.[relative];
      if (replacement && !applied.has(replacement)) continue;
      const normalized = relative.replaceAll('\\', '/');
      const skill = replacement ?? path.posix.basename(normalized);
      if (!skills.has(skill)) continue;
      const source = path.resolve(dir, normalized, 'SKILL.md');
      if (!source.startsWith(`${path.resolve(dir)}${path.sep}`)) throw new Error(`Unsafe permission source: ${relative}`);
      const native = field(await fs.readFile(source, 'utf8')).raw;
      // Stable across unrelated version changes, but never carry native grants
      // across a different owner/source path or a changed source tool declaration.
      const owner = JSON.stringify([manifest.name, normalized, native]);
      if (owners.get(skill) && owners.get(skill) !== owner) throw new Error(`Conflicting permission source owners: ${skill}`);
      owners.set(skill, owner);
    }
  }
  return owners;
}

function permissionSourceOwner(owners: ReadonlyMap<string, string | null>, skill: string): string | null {
  return owners.has(skill) ? owners.get(skill)! : 'local';
}

export async function captureToolPermissionBases(projectDir: string, agents: readonly AgentInstallation[], extensions: readonly ExtensionRecord[] = []): Promise<ToolPermissionBase[]> {
  const result: ToolPermissionBase[] = [];
  for (const agent of agents.filter(candidate => candidate.id === 'claude')) {
    // Include untracked custom targets so manifest-less removal still respects ownership markers.
    const root = await physicalProjectPath(projectDir, agent.skillsDir, { preserveCase: true });
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    });
    for (const entry of entries.filter(entry => entry.isDirectory())) {
      if (!IDENTIFIER.test(entry.name) || entry.name.includes('..')) continue;
      try {
        const candidate = path.join(root, entry.name, 'SKILL.md');
        if (!(await fs.lstat(candidate)).isFile()) continue;
        const content = await fs.readFile(candidate, 'utf8');
        const header = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0];
        if (!header?.includes(MARKER)) continue;
        const file = await skillFile(projectDir, agents, agent, entry.name);
        if (file !== candidate) throw new Error('Permission target changed while reading ownership.');
        const current = field(content);
        if (current.raw.includes(MARKER)) result.push({ agentId: agent.id, skill: entry.name,
          base: ownership(current).base, sourceOwner: null });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
  if (result.length) {
    const owners = await toolPermissionSourceOwners(projectDir, extensions, new Set(result.map(snapshot => snapshot.skill)));
    for (const snapshot of result) snapshot.sourceOwner = permissionSourceOwner(owners, snapshot.skill);
  }
  return result;
}

export async function restoreToolPermissionBases(projectDir: string, agents: readonly AgentInstallation[], bases: readonly ToolPermissionBase[], extensions: readonly ExtensionRecord[] = []): Promise<void> {
  if (!bases.length) return;
  const owners = await toolPermissionSourceOwners(projectDir, extensions, new Set(bases.map(snapshot => snapshot.skill)));
  for (const snapshot of bases) {
    const agent = agents.find(agent => agent.id === snapshot.agentId);
    if (!agent) continue;
    if (snapshot.sourceOwner === null || snapshot.sourceOwner !== permissionSourceOwner(owners, snapshot.skill)) {
      logSkillTarget('[FIX:171] permissions:source-changed', { runtime: agent.id, skill: snapshot.skill });
      continue;
    }
    try {
      const file = await skillFile(projectDir, agents, agent, snapshot.skill);
      const before = await fs.readFile(file, 'utf8');
      const current = field(before);
      const saved = ownership(current);
      if (saved.base === snapshot.base) continue;
      // shortcut: local tool fields win over changed package defaults; reconcile defaults after upgrades.
      saved.base = snapshot.base;
      console.warn(`Warning: Preserving existing allowed-tools for ${agent.id}/${snapshot.skill}; the reinstalled field differs. Review source defaults manually.`);
      const after = replace(before, current, render(saved, current.newline));
      if (before !== after) await fs.writeFile(file, after);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

export async function removeExtensionToolPermissions(projectDir: string, agents: readonly AgentInstallation[], extension: string): Promise<void> {
  const targets = await captureToolPermissionBases(projectDir, agents);
  for (const target of targets) {
    const agent = agents.find(agent => agent.id === target.agentId)!;
    const file = await skillFile(projectDir, agents, agent, target.skill);
    const before = await fs.readFile(file, 'utf8');
    const after = stripToolPermissions(before, extension);
    if (before !== after) await fs.writeFile(file, after);
  }
}
