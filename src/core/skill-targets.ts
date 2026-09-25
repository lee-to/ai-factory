import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getAgentConfig, type AgentConfig } from './agents.js';
import { assertCompatibleSkillTargets, getTransformerIdentity, type SkillTargetRuntime } from './transformer.js';
import { buildTemplateVars } from './template.js';

export interface SkillRenderContext {
  readonly agent: Readonly<AgentConfig & { homeSkillsDir?: string }>;
  readonly hash: string;
}

export interface EffectiveSkillTarget {
  readonly id: string;
  readonly previousSkillsDir: string;
  readonly skillsDir: string;
  readonly physicalPath: string;
  readonly sourcePhysicalPath: string;
  readonly reason: 'existing-agents-directory' | 'persisted' | 'default';
}

export interface SkillTargetGroup {
  readonly skillsDir: string;
  readonly physicalPath: string;
  readonly targets: readonly EffectiveSkillTarget[];
  readonly context: SkillRenderContext;
}

export function logSkillTarget(message: string, context: Record<string, unknown>): void {
  if (process.env.LOG_LEVEL?.toLowerCase() === 'debug') {
    console.log(`[skill-targets] ${message} ${JSON.stringify(context)}`);
  }
}

function normalizeRelative(target: string): string {
  const normalized = path.posix.normalize(target.replaceAll('\\', '/'));
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')
    || path.posix.isAbsolute(normalized) || /^[a-z]:/i.test(normalized)) {
    throw new Error(`Unsafe skill target "${target}": use a project-relative directory.`);
  }
  return normalized.replace(/\/$/, '');
}

function contains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

// Resolve missing destinations using the nearest existing ancestor, including junctions.
export async function physicalProjectPath(
  projectDir: string, relativePath: string, options: { preserveCase?: boolean } = {},
): Promise<string> {
  const root = await fs.realpath(projectDir);
  const relative = normalizeRelative(relativePath);
  let candidate = path.resolve(root, relative);
  const missing: string[] = [];
  for (;;) {
    try {
      const resolved = path.join(await fs.realpath(candidate), ...missing.reverse());
      if (!contains(root, resolved) || resolved === root) throw new Error(`Unsafe path outside project: ${relativePath}`);
      return process.platform === 'win32' && !options.preserveCase ? resolved.toLowerCase() : resolved;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      // A dangling link must not be treated as a missing ordinary directory.
      try {
        if ((await fs.lstat(candidate)).isSymbolicLink()) throw new Error(`Dangling link in skill target: ${relativePath}`);
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code !== 'ENOENT') throw statError;
      }
      missing.push(path.basename(candidate));
      candidate = path.dirname(candidate);
    }
  }
}

export function createSkillRenderContext(agentId: string, skillsDir: string, sharedCodex = false): SkillRenderContext {
  const registry = getAgentConfig(agentId);
  const agent = Object.freeze({
    ...registry,
    skillsDir: normalizeRelative(skillsDir),
    ...(sharedCodex ? { configDir: '.codex', settingsFile: '.codex/config.toml', displayName: 'Codex', skillsCliAgent: 'codex',
      homeSkillsDir: getAgentConfig('codex').skillsDir } : {}),
  });
  if (sharedCodex) logSkillTarget('[FIX:155] render:shared-home', { skillsDir: agent.skillsDir, homeSkillsDir: buildTemplateVars(agent).home_skills_dir });
  const hash = createHash('sha256').update(JSON.stringify({
    version: 1,
    transformer: getTransformerIdentity(agentId),
    variables: buildTemplateVars(agent),
  })).digest('hex');
  return Object.freeze({ agent, hash });
}

export async function resolveSkillTargets(
  projectDir: string,
  runtimes: readonly SkillTargetRuntime[],
  options: { select?: boolean } = {},
): Promise<readonly SkillTargetGroup[]> {
  logSkillTarget('resolve:start', { runtimes: runtimes.map(runtime => runtime.id) });
  let hasAgentsDirectory = false;
  try {
    hasAgentsDirectory = (await fs.stat(path.join(projectDir, '.agents'))).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const targets: EffectiveSkillTarget[] = [];
  const protectedPaths = [await physicalProjectPath(projectDir, '.ai-factory/skill-migrations')];
  for (const runtime of runtimes) {
    const registry = getAgentConfig(runtime.id);
    const previousSkillsDir = normalizeRelative(runtime.skillsDir || registry.skillsDir);
    const hasAntigravity = runtimes.some(r => r.id === 'antigravity');
    const preferShared = options.select !== false && runtime.id === 'codex'
      && previousSkillsDir === '.codex/skills' && hasAgentsDirectory && !hasAntigravity;
    const isAntigravityLegacy = options.select !== false && runtime.id === 'antigravity' && previousSkillsDir === '.agent/skills';
    const skillsDir = (preferShared || isAntigravityLegacy) ? '.agents/skills' : previousSkillsDir;
    const target = Object.freeze({
      id: runtime.id, previousSkillsDir, skillsDir,
      physicalPath: await physicalProjectPath(projectDir, skillsDir),
      sourcePhysicalPath: await physicalProjectPath(projectDir, previousSkillsDir),
      reason: preferShared ? 'existing-agents-directory' as const : isAntigravityLegacy ? 'default' as const : runtime.skillsDir ? 'persisted' as const : 'default' as const,
    });
    targets.push(target);
    const assets = [registry.agentsDir, runtime.agentsDir, registry.settingsFile,
      ...new Set([...(registry.configFiles ?? []), ...(runtime.configFiles ?? [])].map(file => `${registry.configDir}/${file}`))].filter((value): value is string => !!value);
    for (const asset of assets) protectedPaths.push(await physicalProjectPath(projectDir, asset));
    logSkillTarget('resolved', { ...target });
  }
  const allSkillPaths = [...new Set(targets.flatMap(target => [target.physicalPath, target.sourcePhysicalPath]))];
  for (const skillPath of allSkillPaths) {
    for (const protectedPath of protectedPaths) {
      if (contains(skillPath, protectedPath) || contains(protectedPath, skillPath)) {
        throw new Error(`Unsafe skill target overlap: "${skillPath}" and native/recovery path "${protectedPath}".`);
      }
    }
    for (const other of allSkillPaths) {
      if (skillPath !== other && contains(skillPath, other)) throw new Error(`Nested skill targets: "${skillPath}" and "${other}".`);
    }
  }
  const byPath = new Map<string, EffectiveSkillTarget[]>();
  for (const target of targets) byPath.set(target.physicalPath, [...(byPath.get(target.physicalPath) ?? []), target]);
  const groups = [...byPath].map(([physicalPath, members]) => {
    const ordered = [...members].sort((a, b) => a.id.localeCompare(b.id));
    assertCompatibleSkillTargets(members.map(member => ({ id: member.id, skillsDir: physicalPath })));
    const sharedCodex = ordered.length > 1 && ordered.every(member => ['codex', 'codex-app'].includes(member.id));
    const skillsDir = ordered[0].skillsDir;
    const contexts = ordered.map(member => createSkillRenderContext(member.id, skillsDir, sharedCodex));
    if (contexts.some(context => context.hash !== contexts[0].hash)) {
      throw new Error(`Incompatible skill render profiles for "${skillsDir}": ${ordered.map(member => member.id).join(', ')}.`);
    }
    return Object.freeze({ skillsDir, physicalPath, targets: Object.freeze(ordered), context: contexts[0] });
  });
  logSkillTarget('resolve:complete', { groups: groups.map(group => ({ target: group.skillsDir, members: group.targets.map(target => target.id) })) });
  return Object.freeze(groups);
}

export async function hasSurvivingConfigConsumer(
  projectDir: string, relativePath: string, survivors: readonly SkillTargetRuntime[],
): Promise<boolean> {
  const target = await physicalProjectPath(projectDir, relativePath);
  for (const survivor of survivors) {
    const runtime = getAgentConfig(survivor.id);
    const paths = [runtime.settingsFile, ...new Set([...(runtime.configFiles ?? []), ...(survivor.configFiles ?? [])].map(file => `${runtime.configDir}/${file}`))]
      .filter((file): file is string => !!file);
    for (const file of paths) if (await physicalProjectPath(projectDir, file) === target) return true;
  }
  return false;
}
