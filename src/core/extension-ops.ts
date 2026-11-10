import path from 'path';
import type { AgentFileSource, AgentInstallation, AiFactoryConfig, ExtensionRecord } from './config.js';
import { findAgentConfig, getBuiltinAgentConfigs, hydrateProjectAgentRegistry } from './agents.js';
import {
  type ExtensionManifest,
  classifyExtensionSource,
  compareExtensionVersions,
  commitExtensionInstall,
  resolveExtensionVersion,
  resolveExtension,
  getExtensionsDir,
  loadInstalledExtensionManifest,
  loadAllExtensions,
  type ResolvedExtension,
} from './extensions.js';
import {
  installSkills,
  getAvailableSkills,
  getAvailableSubagents,
  buildExtensionAgentFileSources,
  installExtensionAgentFiles,
  installExtensionSkills,
  removeExtensionAgentFiles,
  removeExtensionSkills,
  rebuildManagedAgentFilesForAgents,
} from './installer.js';
import { applyExtensionInjections, applySingleExtensionInjections, stripAllExtensionInjections, stripInjectionsByExtensionName } from './injections.js';
import { configureExtensionMcpServers, removeExtensionMcpServers, validateMcpTemplate, type McpServerConfig } from './mcp.js';
import { copyDirectory, ensureDir, fileExists, readJsonFile, removeDirectory } from '../utils/fs.js';
import { applyExtensionToolPermissions, captureToolPermissionBases, removeExtensionToolPermissions, restoreToolPermissionBases } from './tool-permissions.js';
import { logSkillTarget, resolveSkillTargets } from './skill-targets.js';
import { captureSharedSkillRollback, collectSkillOwners, prepareSkillTargets, withSkillProjectLock } from './skills-migration.js';

export interface ExtensionAssetInstallResult {
  replacedSkills: string[];
  replacementOutcomes: Array<{
    baseSkillName: string;
    extensionSkillPath: string;
    status: 'installed' | 'rolled-back' | 'preserved-base';
    successCount: number;
    agentCount: number;
  }>;
  customSkillInstalls: Map<string, string[]>;
  agentFileInstalls: Map<string, string[]>;
  injectionCount: number;
  configuredMcpServers: string[];
}

export interface CommitResolvedExtensionOptions {
  config: AiFactoryConfig;
  source: string;
  resolved: ResolvedExtension;
  log?: (level: 'info' | 'warn', message: string) => void;
}

interface ExtensionInstallRollbackContext {
  extensionDir: string;
  backupDir: string | null;
  oldRecord: ExtensionRecord | null;
  oldManifest: ExtensionManifest | null;
  newManifest: ExtensionManifest;
  partialAssetInstall?: ExtensionAssetInstallResult | null;
}

class ExtensionAssetInstallError extends Error {
  partialResult: ExtensionAssetInstallResult;

  constructor(message: string, partialResult: ExtensionAssetInstallResult) {
    super(message);
    this.name = 'ExtensionAssetInstallError';
    this.partialResult = partialResult;
  }
}

/**
 * Install base skills on all agents.
 */
export async function installSkillsForAllAgents(
  projectDir: string,
  agents: AgentInstallation[],
  skills: string[],
): Promise<void> {
  for (const group of await resolveSkillTargets(projectDir, agents, { select: false })) {
    await installSkills({ projectDir, skillsDir: group.skillsDir, skills, agentId: group.targets[0].id, renderContext: group.context });
  }
}

export async function composeInstalledExtensionSkills(
  projectDir: string, config: AiFactoryConfig, options: {
    installReplacements?: boolean;
    customSkillInstalls?: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
  } = {},
): Promise<number> {
  const installed = await loadAllExtensions(projectDir, (config.extensions ?? []).map(extension => extension.name));
  await collectSkillOwners(installed);
  const groups = await resolveSkillTargets(projectDir, config.agents, { select: false });
  for (const { dir, manifest } of installed) {
    const replaced = new Set(config.extensions?.find(extension => extension.name === manifest.name)?.replacedSkills ?? []);
    const replacementPaths = options.installReplacements === false ? []
      : Object.entries(manifest.replaces ?? {}).filter(([, name]) => replaced.has(name)).map(([relative]) => relative);
    if (options.installReplacements === false && replaced.size) {
      logSkillTarget('[FIX:155] compose:retain-installed-replacements', { extension: manifest.name, skills: [...replaced] });
    }
    for (const group of groups) {
      const completed = options.customSkillInstalls?.get(manifest.name);
      const customPaths = (manifest.skills ?? []).filter(relative => !manifest.replaces?.[relative]);
      const pendingCustomPaths = customPaths.filter(relative => !group.targets.every(target => completed?.get(target.id)?.includes(path.basename(relative))));
      if (pendingCustomPaths.length < customPaths.length) {
        logSkillTarget('[FIX:155] compose:retain-installed-custom-skills', { extension: manifest.name, target: group.skillsDir, skipped: customPaths.length - pendingCustomPaths.length });
      }
      const paths = [...replacementPaths, ...pendingCustomPaths];
      if (!paths.length) continue;
      const agent = { ...config.agents.find(candidate => candidate.id === group.targets[0].id)!, skillsDir: group.skillsDir };
      const results = await installExtensionSkills(projectDir, agent, dir, paths, manifest.replaces, group.context);
      if (results.length !== paths.length) throw new Error(`Incomplete installed skill composition for extension "${manifest.name}" at "${group.skillsDir}".`);
    }
  }
  let injections = 0;
  for (const group of await resolveSkillTargets(projectDir, config.agents, { select: false })) {
    const agent = { ...config.agents.find(candidate => candidate.id === group.targets[0].id)!, skillsDir: group.skillsDir };
    injections += await applyExtensionInjections(projectDir, agent, config.extensions ?? []);
  }
  await applyExtensionToolPermissions(projectDir, config.agents, installed.map(extension => extension.manifest));
  return injections;
}

/**
 * Remove extension skills from all agents. Returns per-agent removed lists.
 */
export async function removeSkillsForAllAgents(
  projectDir: string,
  agents: AgentInstallation[],
  skillNames: string[],
): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>();
  for (const group of await resolveSkillTargets(projectDir, agents, { select: false })) {
    const agent = agents.find(candidate => candidate.id === group.targets[0].id)!;
    const removed = await removeExtensionSkills(projectDir, { ...agent, skillsDir: group.skillsDir }, skillNames);
    for (const target of group.targets) results.set(target.id, [...removed]);
  }
  return results;
}

/**
 * Install extension skills on all agents. Returns per-agent installed lists.
 */
export async function installExtensionSkillsForAllAgents(
  projectDir: string,
  agents: AgentInstallation[],
  extensionDir: string,
  skillPaths: string[],
  nameOverrides?: Record<string, string>,
): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>();
  for (const group of await resolveSkillTargets(projectDir, agents, { select: false })) {
    const agent = agents.find(candidate => candidate.id === group.targets[0].id)!;
    const installed = await installExtensionSkills(projectDir, { ...agent, skillsDir: group.skillsDir }, extensionDir, skillPaths, nameOverrides, group.context);
    for (const target of group.targets) results.set(target.id, [...installed]);
  }
  return results;
}

export async function installExtensionAgentFilesForAllAgents(
  projectDir: string,
  agents: AgentInstallation[],
  extensionDir: string,
  manifest: ExtensionManifest,
): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>();

  for (const agent of agents) {
    try {
      const installed = await installExtensionAgentFiles(
        projectDir,
        agent,
        extensionDir,
        manifest.agentFiles ?? [],
      );
      results.set(agent.id, installed);
    } catch (error) {
      throw error;
    }
  }

  return results;
}

export function collectManifestAgentFileTargets(
  manifest?: ExtensionManifest | null,
): Map<string, string[]> {
  const targets = new Map<string, string[]>();

  for (const agentFile of manifest?.agentFiles ?? []) {
    const existing = targets.get(agentFile.runtime) ?? [];
    existing.push(agentFile.target);
    targets.set(agentFile.runtime, existing);
  }

  return targets;
}

export function collectTrackedExtensionAgentFileTargets(
  agents: AgentInstallation[],
  extensionName: string,
): Map<string, string[]> {
  const targets = new Map<string, string[]>();

  for (const agent of agents) {
    const trackedTargets = Object.entries(agent.agentFileSources ?? {})
      .filter(([, source]) => source.kind === 'extension' && source.extensionName === extensionName)
      .map(([relPath]) => relPath);

    if (trackedTargets.length > 0) {
      targets.set(agent.id, trackedTargets);
    }
  }

  return targets;
}

export function mergeInstalledAgentFiles(
  agents: AgentInstallation[],
  agentFileInstalls: Map<string, string[]>,
): void {
  for (const [agentId, installedFiles] of agentFileInstalls) {
    const agent = agents.find(candidate => candidate.id === agentId);
    if (!agent || installedFiles.length === 0) {
      continue;
    }

    agent.installedAgentFiles = Array.from(
      new Set([...(agent.installedAgentFiles ?? []), ...installedFiles]),
    ).sort();
  }
}

export function mergeAgentFileSources(
  agents: AgentInstallation[],
  agentFileSources: Map<string, Record<string, AgentFileSource>>,
): void {
  for (const [agentId, installedSources] of agentFileSources) {
    const agent = agents.find(candidate => candidate.id === agentId);
    if (!agent || Object.keys(installedSources).length === 0) {
      continue;
    }

    agent.agentFileSources = {
      ...(agent.agentFileSources ?? {}),
      ...installedSources,
    };
  }
}

export function pruneInstalledAgentFiles(
  agents: AgentInstallation[],
  targetsByAgent: Map<string, string[]>,
): void {
  for (const [agentId, targets] of targetsByAgent) {
    const agent = agents.find(candidate => candidate.id === agentId);
    if (!agent || targets.length === 0 || !agent.installedAgentFiles?.length) {
      continue;
    }

    const blocked = new Set(targets);
    agent.installedAgentFiles = agent.installedAgentFiles.filter(relPath => !blocked.has(relPath));
  }
}

export function pruneAgentFileSources(
  agents: AgentInstallation[],
  targetsByAgent: Map<string, string[]>,
): void {
  for (const [agentId, targets] of targetsByAgent) {
    const agent = agents.find(candidate => candidate.id === agentId);
    if (!agent || targets.length === 0 || !agent.agentFileSources) {
      continue;
    }

    for (const target of targets) {
      delete agent.agentFileSources[target];
    }
  }
}

export function pruneManagedAgentFiles(
  agents: AgentInstallation[],
  targetsByAgent: Map<string, string[]>,
): void {
  for (const [agentId, targets] of targetsByAgent) {
    const agent = agents.find(candidate => candidate.id === agentId);
    if (!agent || targets.length === 0 || !agent.managedAgentFiles) {
      continue;
    }

    for (const target of targets) {
      delete agent.managedAgentFiles[target];
    }
  }
}

export async function removeExtensionAgentFilesForAllAgents(
  projectDir: string,
  agents: AgentInstallation[],
  manifest: ExtensionManifest,
): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>();

  for (const agent of agents) {
    const targets = (manifest.agentFiles ?? [])
      .filter(agentFile => agentFile.runtime === agent.id)
      .map(agentFile => agentFile.target);
    const removed = await removeExtensionAgentFiles(projectDir, agent, targets);
    results.set(agent.id, removed);
  }

  return results;
}

export async function removeAgentFilesForAllAgentsByTargets(
  projectDir: string,
  agents: AgentInstallation[],
  targetsByAgent: Map<string, string[]>,
): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>();

  for (const agent of agents) {
    const targets = targetsByAgent.get(agent.id) ?? [];
    const removed = await removeExtensionAgentFiles(projectDir, agent, targets);
    results.set(agent.id, removed);
  }

  return results;
}

export function getManifestRuntimeIds(manifest?: ExtensionManifest | null): string[] {
  return manifest?.agents?.map(agent => agent.id) ?? [];
}

export function assertNoConfiguredRuntimeOrphans(
  config: AiFactoryConfig,
  runtimeIds: string[],
  extensionName: string,
  action: 'remove' | 'update',
): void {
  if (runtimeIds.length === 0) {
    return;
  }

  const configured = config.agents
    .filter(agent => runtimeIds.includes(agent.id))
    .map(agent => agent.id);

  if (configured.length > 0) {
    throw new Error(
      `Cannot ${action} extension "${extensionName}" because it would orphan configured runtime(s): ${configured.join(', ')}. ` +
      `Re-run "ai-factory init" without them first.`,
    );
  }
}

export async function assertNoAgentFileConflicts(
  projectDir: string,
  config: AiFactoryConfig,
  manifest: ExtensionManifest,
): Promise<void> {
  const extensionNames = (config.extensions ?? []).map(extension => extension.name);
  await hydrateProjectAgentRegistry(projectDir, {
    extensionNames,
    extraManifests: [{ name: manifest.name, agents: manifest.agents }],
  });

  for (const agentFile of manifest.agentFiles ?? []) {
    const runtime = findAgentConfig(agentFile.runtime);
    if (!runtime) {
      throw new Error(
        `Extension "${manifest.name}" references unknown runtime "${agentFile.runtime}" in agentFiles.`,
      );
    }

    if (!runtime.agentsDir || !runtime.agentFileExtension) {
      throw new Error(
        `Runtime "${agentFile.runtime}" does not support managed agent files, but extension "${manifest.name}" declares one.`,
      );
    }

    const sourceExt = path.extname(agentFile.source).toLowerCase();
    const targetExt = path.extname(agentFile.target).toLowerCase();
    if (sourceExt !== runtime.agentFileExtension || targetExt !== runtime.agentFileExtension) {
      throw new Error(
        `Extension "${manifest.name}" agent file "${agentFile.target}" must use ${runtime.agentFileExtension} for runtime "${agentFile.runtime}".`,
      );
    }
  }

  const ownership = new Map<string, string>();
  const otherExtensionNames = extensionNames.filter(name => name !== manifest.name);
  const installedManifests = await loadAllExtensions(projectDir, otherExtensionNames);

  for (const { manifest: installedManifest } of installedManifests) {
    for (const agentFile of installedManifest.agentFiles ?? []) {
      ownership.set(`${agentFile.runtime}::${agentFile.target}`, installedManifest.name);
    }
  }

  const bundledRuntimes = getBuiltinAgentConfigs().filter(runtime => runtime.agentsSourceDir);
  for (const runtime of bundledRuntimes) {
    const bundledFiles = await getAvailableSubagents(runtime.id);
    if (bundledFiles.length === 0) {
      continue;
    }

    const ownerLabel = `AI Factory bundled ${runtime.displayName} agent files`;

    for (const relPath of bundledFiles) {
      ownership.set(`${runtime.id}::${relPath}`, ownerLabel);
    }
  }

  for (const agentFile of manifest.agentFiles ?? []) {
    const key = `${agentFile.runtime}::${agentFile.target}`;
    const owner = ownership.get(key);
    if (owner) {
      throw new Error(
        `Extension "${manifest.name}" cannot manage "${agentFile.target}" for runtime "${agentFile.runtime}" because it is already owned by ${owner}.`,
      );
    }
  }
}

/**
 * Collect all replaced skills from extensions, optionally excluding one extension by name.
 */
export function collectReplacedSkills(extensions: ExtensionRecord[], excludeName?: string): Set<string> {
  const result = new Set<string>();
  for (const ext of extensions) {
    if (excludeName && ext.name === excludeName) continue;
    if (ext.replacedSkills?.length) {
      for (const s of ext.replacedSkills) result.add(s);
    }
  }
  return result;
}

/**
 * Ensure a new/updated extension does not claim a base skill already replaced by another extension.
 */
export function assertNoReplacementConflicts(
  extensions: ExtensionRecord[],
  manifest: ExtensionManifest,
  currentExtensionName?: string,
): void {
  if (!manifest.replaces) {
    return;
  }

  for (const [, baseSkillName] of Object.entries(manifest.replaces)) {
    for (const other of extensions) {
      if (other.name === currentExtensionName) continue;
      if (other.replacedSkills?.includes(baseSkillName)) {
        throw new Error(`Conflict: skill "${baseSkillName}" is already replaced by extension "${other.name}". Remove it first.`);
      }
    }
  }
}

/**
 * Restore base skills that were previously replaced, filtering out skills still replaced by other extensions.
 */
export async function restoreBaseSkills(
  projectDir: string,
  agents: AgentInstallation[],
  skillNames: string[],
  excludeStillReplaced: Set<string>,
): Promise<string[]> {
  const available = await getAvailableSkills();
  const toRestore = skillNames.filter(s => available.includes(s) && !excludeStillReplaced.has(s));
  if (toRestore.length > 0) {
    await installSkillsForAllAgents(projectDir, agents, toRestore);
  }
  return toRestore;
}

/**
 * Remove the previously installed state for an extension before reapplying its refreshed manifest.
 */
export async function removePreviousExtensionState(
  projectDir: string,
  agents: AgentInstallation[],
  extensionName: string,
  oldRecord?: ExtensionRecord | null,
  oldManifest?: ExtensionManifest | null,
): Promise<void> {
  if (oldManifest?.agentFiles?.length) {
    await removeExtensionAgentFilesForAllAgents(projectDir, agents, oldManifest);
  }

  await stripInjectionsForAllAgents(projectDir, agents, extensionName, oldManifest);

  if (oldManifest?.mcpServers?.length) {
    const mcpKeys = oldManifest.mcpServers.map(server => server.key);
    for (const agent of agents) {
      await removeExtensionMcpServers(projectDir, agent.id, mcpKeys);
    }
  }

  if (oldRecord?.replacedSkills?.length) {
    await removeSkillsForAllAgents(projectDir, agents, oldRecord.replacedSkills);
    await restoreBaseSkills(projectDir, agents, oldRecord.replacedSkills, new Set());
  }

  if (oldManifest) {
    await removeCustomSkillsForAllAgents(projectDir, agents, oldManifest);
  }
}

async function cleanupPartialExtensionState(
  projectDir: string,
  agents: AgentInstallation[],
  extensionName: string,
  manifest: ExtensionManifest,
  partialAssetInstall?: ExtensionAssetInstallResult | null,
): Promise<void> {
  if (manifest.agentFiles?.length) {
    for (const agent of agents) {
      const installedTargets = partialAssetInstall?.agentFileInstalls.get(agent.id) ?? [];
      if (installedTargets.length > 0) {
        await removeExtensionAgentFiles(projectDir, agent, installedTargets);
      }
    }
  }

  await stripInjectionsForAllAgents(projectDir, agents, extensionName, manifest);

  if (manifest.mcpServers?.length) {
    const mcpKeys = manifest.mcpServers.map(server => server.key);
    for (const agent of agents) {
      await removeExtensionMcpServers(projectDir, agent.id, mcpKeys);
    }
  }

  const replacedSkills = partialAssetInstall?.replacedSkills ?? [];
  if (replacedSkills.length > 0) {
    await removeSkillsForAllAgents(projectDir, agents, replacedSkills);
  }

  const customSkills = new Set<string>();
  for (const installed of partialAssetInstall?.customSkillInstalls.values() ?? []) {
    for (const skill of installed) {
      customSkills.add(skill);
    }
  }

  if (customSkills.size > 0) {
    await removeSkillsForAllAgents(projectDir, agents, [...customSkills]);
  }
}

async function rollbackFailedExtensionInstall(
  projectDir: string,
  agents: AgentInstallation[],
  context: ExtensionInstallRollbackContext,
): Promise<void> {
  await cleanupPartialExtensionState(
    projectDir,
    agents,
    context.newManifest.name,
    context.newManifest,
    context.partialAssetInstall,
  );

  if (context.backupDir) {
    await removeDirectory(context.extensionDir);
    await ensureDir(path.dirname(context.extensionDir));
    await copyDirectory(context.backupDir, context.extensionDir);

    const restoredManifest = context.oldManifest ?? await loadInstalledExtensionManifest(context.extensionDir);
    if (restoredManifest) {
      await installExtensionAssetsForAllAgents(projectDir, agents, context.extensionDir, restoredManifest);
    }
    return;
  }

  await removeDirectory(context.extensionDir);
}

/**
 * Strip extension injections from all agents. Uses manifest if available, falls back to name-based scan.
 */
export async function stripInjectionsForAllAgents(
  projectDir: string,
  agents: AgentInstallation[],
  extensionName: string,
  manifest?: ExtensionManifest | null,
): Promise<void> {
  await removeExtensionToolPermissions(projectDir, agents, extensionName);
  for (const group of await resolveSkillTargets(projectDir, agents, { select: false })) {
    const agent = { ...agents.find(candidate => candidate.id === group.targets[0].id)!, skillsDir: group.skillsDir };
    if (manifest) {
      await stripAllExtensionInjections(projectDir, agent, extensionName, manifest);
    } else {
      await stripInjectionsByExtensionName(projectDir, agent, extensionName);
    }
  }
}

/**
 * Remove custom (non-replacement) skills from all agents based on the manifest.
 * Returns the list of custom skill paths that were targeted for removal.
 */
export async function removeCustomSkillsForAllAgents(
  projectDir: string,
  agents: AgentInstallation[],
  manifest: ExtensionManifest,
): Promise<Map<string, string[]>> {
  const replacesPaths = new Set(Object.keys(manifest.replaces ?? {}));
  const customSkills = (manifest.skills ?? []).filter(s => !replacesPaths.has(s));
  if (customSkills.length === 0) return new Map();
  return removeSkillsForAllAgents(projectDir, agents, customSkills);
}

/**
 * Install replacement skills, custom skills, injections, and MCP config for an extension.
 */
export async function installExtensionAssetsForAllAgents(
  projectDir: string,
  agents: AgentInstallation[],
  extensionDir: string,
  manifest: ExtensionManifest,
): Promise<ExtensionAssetInstallResult> {
  const partialResult: ExtensionAssetInstallResult = {
    replacedSkills: [],
    replacementOutcomes: [],
    customSkillInstalls: new Map<string, string[]>(),
    agentFileInstalls: new Map<string, string[]>(),
    injectionCount: 0,
    configuredMcpServers: [],
  };

  try {
    const replacesPaths = new Set<string>();

    if (manifest.replaces && Object.keys(manifest.replaces).length > 0) {
      const nameOverrides: Record<string, string> = { ...manifest.replaces };
      const agentCount = agents.length;
      for (const [extSkillPath, baseSkillName] of Object.entries(manifest.replaces)) {
        // A failed installer may already have written files. Capture each skill
        // independently so its rollback cannot undo a successful sibling.
        const restoreSkill = await captureSharedSkillRollback(projectDir, agents, [baseSkillName], { includeSingletons: true });
        const replacementResults = await installExtensionSkillsForAllAgents(projectDir, agents, extensionDir, [extSkillPath], nameOverrides);
        replacesPaths.add(extSkillPath);
        const successCount = agents.filter(agent => replacementResults.get(agent.id)?.includes(baseSkillName)).length;

        if (successCount === agentCount) {
          partialResult.replacedSkills.push(baseSkillName);
          partialResult.replacementOutcomes.push({
            baseSkillName,
            extensionSkillPath: extSkillPath,
            status: 'installed',
            successCount,
            agentCount,
          });
          continue;
        }

        await restoreSkill();
        logSkillTarget('[FIX:155] replacement:restore-failed-write', { skill: baseSkillName, successCount, agentCount });
        if (successCount > 0) {
          partialResult.replacementOutcomes.push({
            baseSkillName,
            extensionSkillPath: extSkillPath,
            status: 'rolled-back',
            successCount,
            agentCount,
          });
          continue;
        }

        partialResult.replacementOutcomes.push({
          baseSkillName,
          extensionSkillPath: extSkillPath,
          status: 'preserved-base',
          successCount,
          agentCount,
        });
      }
    }

    if (manifest.skills?.length) {
      const nonReplacementSkills = manifest.skills.filter(skillPath => !replacesPaths.has(skillPath));
      if (nonReplacementSkills.length > 0) {
        const results = await installExtensionSkillsForAllAgents(projectDir, agents, extensionDir, nonReplacementSkills);
        for (const [agentId, installed] of results) {
          partialResult.customSkillInstalls.set(agentId, installed);
        }
      }
    }

    if (manifest.agentFiles?.length) {
      const results = await installExtensionAgentFilesForAllAgents(projectDir, agents, extensionDir, manifest);
      for (const [agentId, installed] of results) {
        partialResult.agentFileInstalls.set(agentId, installed);
      }
    }

    if (manifest.injections?.length) {
      for (const group of await resolveSkillTargets(projectDir, agents, { select: false })) {
        const agent = { ...agents.find(candidate => candidate.id === group.targets[0].id)!, skillsDir: group.skillsDir };
        partialResult.injectionCount += await applySingleExtensionInjections(projectDir, agent, extensionDir, manifest);
      }
    }

    await applyExtensionToolPermissions(projectDir, agents, [manifest]);

    if (manifest.mcpServers?.length) {
      for (const server of manifest.mcpServers) {
        let template: unknown;
        if (typeof server.template === 'string') {
          template = await readJsonFile<McpServerConfig>(path.join(extensionDir, server.template));
        } else {
          template = server.template;
        }

        if (!template) {
          continue;
        }

        validateMcpTemplate(template, server.key);

        for (const agent of agents) {
          const configured = await configureExtensionMcpServers(projectDir, agent.id, [
            { key: server.key, template },
          ]);
          if (configured.length > 0 && !partialResult.configuredMcpServers.includes(server.key)) {
            partialResult.configuredMcpServers.push(server.key);
          }
        }
      }
    }

    return partialResult;
  } catch (error) {
    throw new ExtensionAssetInstallError((error as Error).message, partialResult);
  }
}

export async function commitResolvedExtension(
  projectDir: string,
  options: CommitResolvedExtensionOptions,
): Promise<{ manifest: ExtensionManifest; extensionDir: string; record: ExtensionRecord; customSkillInstalls: Map<string, string[]> }> {
  return withSkillProjectLock(projectDir, () => commitResolvedExtensionLocked(projectDir, options));
}

async function commitResolvedExtensionLocked(
  projectDir: string,
  options: CommitResolvedExtensionOptions,
): Promise<{ manifest: ExtensionManifest; extensionDir: string; record: ExtensionRecord; customSkillInstalls: Map<string, string[]> }> {
  const prospectiveExtensions = await loadAllExtensions(projectDir, (options.config.extensions ?? [])
    .filter(extension => extension.name !== options.resolved.manifest.name).map(extension => extension.name));
  await collectSkillOwners([...prospectiveExtensions, { dir: options.resolved.sourceDir, manifest: options.resolved.manifest }]);
  const priorManifest = await loadInstalledExtensionManifest(path.join(getExtensionsDir(projectDir), options.resolved.manifest.name));
  assertNoConfiguredRuntimeOrphans(options.config,
    getManifestRuntimeIds(priorManifest).filter(id => !getManifestRuntimeIds(options.resolved.manifest).includes(id)), options.resolved.manifest.name, 'update');
  await assertNoAgentFileConflicts(projectDir, options.config, options.resolved.manifest);
  await resolveSkillTargets(projectDir, options.config.agents, { select: options.config.useSymlinks === undefined });
  await hydrateProjectAgentRegistry(projectDir, { extensionNames: (options.config.extensions ?? []).map(extension => extension.name) });
  await prepareSkillTargets(projectDir, options.config);
  const { config, source, resolved } = options;
  const log = options.log ?? (() => {});
  const manifest = resolved.manifest;
  const extensions = config.extensions ?? [];
  const existIdx = extensions.findIndex(ext => ext.name === manifest.name);
  const extensionDir = path.join(getExtensionsDir(projectDir), manifest.name);
  const backupCandidateDir = existIdx >= 0
    ? path.join(getExtensionsDir(projectDir), `.backup-${manifest.name}-${Date.now()}`)
    : null;
  const oldRecord = existIdx >= 0 ? { ...extensions[existIdx] } : null;
  const oldManifest = existIdx >= 0
    ? await loadInstalledExtensionManifest(extensionDir)
    : null;

  const removedRuntimeIds = oldManifest
    ? getManifestRuntimeIds(oldManifest).filter(id => !getManifestRuntimeIds(manifest).includes(id))
    : [];
  assertNoConfiguredRuntimeOrphans(config, removedRuntimeIds, manifest.name, 'update');
  await assertNoAgentFileConflicts(projectDir, config, manifest);
  assertNoReplacementConflicts(extensions, manifest, manifest.name);

  let backupDir: string | null = null;
  if (backupCandidateDir && await fileExists(extensionDir)) {
    await removeDirectory(backupCandidateDir);
    await copyDirectory(extensionDir, backupCandidateDir);
    backupDir = backupCandidateDir;
  }

  const permissionBases = await captureToolPermissionBases(projectDir, config.agents, config.extensions);
  for (const permission of manifest.toolPermissions ?? []) for (const [runtime, tools] of Object.entries(permission.agents)) {
    log('info', `Requested tool permissions: ${manifest.name} -> ${runtime}/${permission.target}: ${tools.join(', ')}`);
  }
  let assetInstall: ExtensionAssetInstallResult;
  const oldAgentFileTargets = collectManifestAgentFileTargets(oldManifest);
  const newAgentFileSources = buildExtensionAgentFileSources(manifest);
  const restoreSharedSkills = await captureSharedSkillRollback(projectDir, config.agents, [
    ...Object.values(manifest.replaces ?? {}), ...(manifest.skills ?? []),
    ...Object.values(oldManifest?.replaces ?? {}), ...(oldManifest?.skills ?? []),
    ...(manifest.injections ?? []).map(injection => injection.target),
    ...(oldManifest?.injections ?? []).map(injection => injection.target),
    ...(manifest.toolPermissions ?? []).map(permission => permission.target),
    ...(oldManifest?.toolPermissions ?? []).map(permission => permission.target),
  ], { includeSingletons: Boolean(manifest.toolPermissions?.length || oldManifest?.toolPermissions?.length || permissionBases.length) });
  let discardBackup = true;

  try {
    await commitExtensionInstall(projectDir, resolved);

    if (existIdx >= 0) {
      await removePreviousExtensionState(projectDir, config.agents, manifest.name, oldRecord, oldManifest);
    }

    assetInstall = await installExtensionAssetsForAllAgents(projectDir, config.agents, extensionDir, manifest);
    const overwritten = new Set([...Object.values(manifest.replaces ?? {}), ...(manifest.skills ?? []).map(skill => path.basename(skill))]);
    await applyExtensionToolPermissions(projectDir, config.agents, prospectiveExtensions.map(({ manifest: other }) => ({
      ...other, toolPermissions: other.toolPermissions?.filter(permission => overwritten.has(permission.target)),
    })));
    await restoreToolPermissionBases(projectDir, config.agents, permissionBases, [
      ...extensions.filter(extension => extension.name !== manifest.name),
      { name: manifest.name, source, version: manifest.version, replacedSkills: assetInstall.replacedSkills },
    ]);
  } catch (error) {
    const partialAssetInstall = error instanceof ExtensionAssetInstallError
      ? error.partialResult
      : null;
    try {
      await rollbackFailedExtensionInstall(projectDir, config.agents, {
        extensionDir,
        backupDir,
        oldRecord,
        oldManifest,
        newManifest: manifest,
        partialAssetInstall,
      });
      await restoreSharedSkills();
    } catch (rollbackError) {
      discardBackup = false;
      throw new Error(`Extension rollback failed: ${(rollbackError as Error).message}. Preserve backup ${backupDir ?? '(none)'}. Original error: ${(error as Error).message}`);
    }
    throw error;
  } finally {
    if (backupDir && discardBackup) {
      await removeDirectory(backupDir);
    }
  }

  pruneInstalledAgentFiles(config.agents, oldAgentFileTargets);
  pruneAgentFileSources(config.agents, oldAgentFileTargets);
  pruneManagedAgentFiles(config.agents, oldAgentFileTargets);
  mergeInstalledAgentFiles(config.agents, assetInstall.agentFileInstalls);
  mergeAgentFileSources(config.agents, newAgentFileSources);
  await rebuildManagedAgentFilesForAgents(projectDir, config.agents);

  for (const outcome of assetInstall.replacementOutcomes) {
    if (outcome.status === 'installed') {
      log('info', `Replaced skill "${outcome.baseSkillName}" with "${path.basename(outcome.extensionSkillPath)}"`);
    } else if (outcome.status === 'rolled-back') {
      log('warn', `Replacement "${outcome.baseSkillName}" only installed on ${outcome.successCount}/${outcome.agentCount} agents - rolled back, prior skill state restored`);
    } else {
      log('warn', `Failed to replace skill "${outcome.baseSkillName}" - prior skill state preserved`);
    }
  }

  for (const [agentId, installed] of assetInstall.customSkillInstalls) {
    if (installed.length > 0) {
      log('info', `Skills installed for ${agentId}: ${installed.join(', ')}`);
    }
  }

  for (const [agentId, installed] of assetInstall.agentFileInstalls) {
    if (installed.length > 0) {
      log('info', `Agent files installed for ${agentId}: ${installed.join(', ')}`);
    }
  }

  if (assetInstall.injectionCount > 0) {
    log('info', `Applied ${assetInstall.injectionCount} injection(s)`);
  }

  if (assetInstall.configuredMcpServers.length > 0) {
    log('info', `MCP servers configured: ${assetInstall.configuredMcpServers.join(', ')}`);
    for (const srv of manifest.mcpServers ?? []) {
      if (srv.instruction) {
        log('info', `  ${srv.instruction}`);
      }
    }
  }

  const record: ExtensionRecord = {
    name: manifest.name,
    source,
    version: manifest.version,
    replacedSkills: assetInstall.replacedSkills.length > 0 ? assetInstall.replacedSkills : undefined,
  };

  if (existIdx >= 0) {
    extensions[existIdx] = record;
  } else {
    extensions.push(record);
  }

  config.extensions = extensions;

  return { manifest, extensionDir, record, customSkillInstalls: assetInstall.customSkillInstalls };
}

export interface ExtensionRefreshResult {
  name: string;
  status: 'updated' | 'unchanged' | 'failed' | 'skipped';
  oldVersion: string;
  newVersion: string | null;
  failureReason?: string;
  customSkillInstalls?: Map<string, string[]>;
}

export interface ExtensionRefreshSummary {
  updated: ExtensionRefreshResult[];
  unchanged: ExtensionRefreshResult[];
  failed: ExtensionRefreshResult[];
  skipped: ExtensionRefreshResult[];
}

async function checkExtensionNeedsRefresh(
  projectDir: string,
  source: string,
  currentVersion: string,
  force: boolean,
): Promise<{ shouldRefresh: boolean; latestVersion: string | null; reason: string }> {
  const sourceType = classifyExtensionSource(source);

  if (force) {
    return { shouldRefresh: true, latestVersion: null, reason: 'force' };
  }

  if (sourceType === 'local') {
    return { shouldRefresh: false, latestVersion: null, reason: 'source-type-requires-force' };
  }

  const resolution = await resolveExtensionVersion(projectDir, source);
  if (resolution.status === 'failed' || !resolution.latestVersion) {
    return {
      shouldRefresh: false,
      latestVersion: null,
      reason: resolution.failureReason === 'rate-limited' ? 'rate-limited' : 'lookup-failed',
    };
  }

  const needsUpdate = compareExtensionVersions(resolution.latestVersion, currentVersion) > 0;
  return {
    shouldRefresh: needsUpdate,
    latestVersion: resolution.latestVersion,
    reason: needsUpdate ? 'version-changed' : 'unchanged',
  };
}

export async function refreshExtensions(
  projectDir: string,
  config: AiFactoryConfig,
  options?: {
    targetNames?: string[];
    force?: boolean;
    log?: (level: 'info' | 'warn', message: string) => void;
  },
): Promise<ExtensionRefreshSummary> {
  const force = options?.force ?? false;
  const log = options?.log ?? (() => {});
  const extensions = config.extensions ?? [];

  if (extensions.length === 0) {
    return { updated: [], unchanged: [], failed: [], skipped: [] };
  }

  const targetExtensions = options?.targetNames
    ? extensions.filter((e) => options.targetNames!.includes(e.name))
    : extensions;

  const results: ExtensionRefreshResult[] = [];
  const hasGitHubSource = targetExtensions.some(ext => classifyExtensionSource(ext.source) === 'github');

  if (hasGitHubSource) {
    const hasToken = Boolean(process.env.GITHUB_TOKEN?.trim());
    log(
      'info',
      hasToken
        ? 'GitHub extension checks: authenticated via GITHUB_TOKEN'
        : 'GitHub extension checks: unauthenticated; set GITHUB_TOKEN to raise rate limits',
    );
  }

  for (const extRecord of targetExtensions) {
    const { name: extName, source, version: currentVersion } = extRecord;

    log('info', `Checking ${extName} (v${currentVersion})...`);

    const check = await checkExtensionNeedsRefresh(projectDir, source, currentVersion, force);

    if (!check.shouldRefresh) {
      const status: ExtensionRefreshResult['status'] =
        check.reason === 'unchanged' ? 'unchanged' : 'skipped';
      results.push({
        name: extName,
        status,
        oldVersion: currentVersion,
        newVersion: check.latestVersion ?? currentVersion,
        failureReason: check.reason !== 'unchanged' ? check.reason : undefined,
      });
      continue;
    }

    log('info', `Refreshing ${extName} from ${source}...`);

    try {
      const resolved = await resolveExtension(projectDir, source);

      try {
        if (resolved.manifest.name !== extName) {
          throw new Error(
            `Extension identity mismatch: expected "${extName}" but source returned "${resolved.manifest.name}". ` +
            `The extension may have been renamed or the source URL may be incorrect.`,
          );
        }

        const { manifest, customSkillInstalls } = await commitResolvedExtension(projectDir, {
          config,
          source,
          resolved,
          log,
        });

        results.push({
          name: extName,
          status: 'updated',
          oldVersion: currentVersion,
          newVersion: manifest.version,
          customSkillInstalls,
        });

        log('info', `Updated ${extName}: v${currentVersion} → v${manifest.version}`);
      } finally {
        await resolved.cleanup();
      }
    } catch (error) {
      const message = (error as Error).message;
      results.push({
        name: extName,
        status: 'failed',
        oldVersion: currentVersion,
        newVersion: null,
        failureReason: message,
      });
      log('warn', `Failed to refresh ${extName}: ${message}`);
    }
  }

  return {
    updated: results.filter((r) => r.status === 'updated'),
    unchanged: results.filter((r) => r.status === 'unchanged'),
    failed: results.filter((r) => r.status === 'failed'),
    skipped: results.filter((r) => r.status === 'skipped'),
  };
}
