import path from 'path';
import type { AgentInstallation, AiFactoryConfig, ExtensionRecord } from './config.js';
import { findAgentConfig, hydrateProjectAgentRegistry } from './agents.js';
import {
  type ExtensionManifest,
  classifyExtensionSource,
  compareExtensionVersions,
  commitExtensionInstall,
  resolveExtensionVersion,
  resolveExtension,
  getExtensionsDir,
  loadExtensionManifest,
  loadAllExtensions,
  type ResolvedExtension,
} from './extensions.js';
import {
  installSkills,
  getAvailableSkills,
  getAvailableSubagents,
  installExtensionAgentFiles,
  installExtensionSkills,
  removeExtensionAgentFiles,
  removeExtensionSkills,
} from './installer.js';
import { applySingleExtensionInjections, stripAllExtensionInjections, stripInjectionsByExtensionName } from './injections.js';
import { configureExtensionMcpServers, removeExtensionMcpServers, validateMcpTemplate, type McpServerConfig } from './mcp.js';
import { copyDirectory, ensureDir, fileExists, readJsonFile, removeDirectory } from '../utils/fs.js';

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
  for (const agent of agents) {
    await installSkills({ projectDir, skillsDir: agent.skillsDir, skills, agentId: agent.id });
  }
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
  for (const agent of agents) {
    const removed = await removeExtensionSkills(projectDir, agent, skillNames);
    results.set(agent.id, removed);
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
  for (const agent of agents) {
    const installed = await installExtensionSkills(projectDir, agent, extensionDir, skillPaths, nameOverrides);
    results.set(agent.id, installed);
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

  const bundledClaudeFiles = await getAvailableSubagents();
  for (const relPath of bundledClaudeFiles) {
    ownership.set(`claude::${relPath}`, 'AI Factory bundled Claude agent files');
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

    const restoredManifest = context.oldManifest ?? await loadExtensionManifest(context.extensionDir);
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
  for (const agent of agents) {
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
      const replacePaths = Object.keys(manifest.replaces);
      const perAgentResults = new Map<string, number>();

      for (const agent of agents) {
        const installed = await installExtensionSkills(projectDir, agent, extensionDir, replacePaths, nameOverrides);
        for (const name of installed) {
          perAgentResults.set(name, (perAgentResults.get(name) ?? 0) + 1);
        }
      }

      const agentCount = agents.length;
      for (const [extSkillPath, baseSkillName] of Object.entries(manifest.replaces)) {
        replacesPaths.add(extSkillPath);
        const successCount = perAgentResults.get(baseSkillName) ?? 0;

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

        if (successCount > 0) {
          await removeSkillsForAllAgents(projectDir, agents, [baseSkillName]);
          await restoreBaseSkills(projectDir, agents, [baseSkillName], new Set());
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
      for (const agent of agents) {
        partialResult.injectionCount += await applySingleExtensionInjections(projectDir, agent, extensionDir, manifest);
      }
    }

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
): Promise<{ manifest: ExtensionManifest; extensionDir: string; record: ExtensionRecord }> {
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
    ? await loadExtensionManifest(extensionDir)
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

  let assetInstall: ExtensionAssetInstallResult;

  try {
    await commitExtensionInstall(projectDir, resolved);

    if (existIdx >= 0) {
      await removePreviousExtensionState(projectDir, config.agents, manifest.name, oldRecord, oldManifest);
    }

    assetInstall = await installExtensionAssetsForAllAgents(projectDir, config.agents, extensionDir, manifest);
  } catch (error) {
    const partialAssetInstall = error instanceof ExtensionAssetInstallError
      ? error.partialResult
      : null;
    await rollbackFailedExtensionInstall(projectDir, config.agents, {
      extensionDir,
      backupDir,
      oldRecord,
      oldManifest,
      newManifest: manifest,
      partialAssetInstall,
    });
    throw error;
  } finally {
    if (backupDir) {
      await removeDirectory(backupDir);
    }
  }

  for (const outcome of assetInstall.replacementOutcomes) {
    if (outcome.status === 'installed') {
      log('info', `Replaced skill "${outcome.baseSkillName}" with "${path.basename(outcome.extensionSkillPath)}"`);
    } else if (outcome.status === 'rolled-back') {
      log('warn', `Replacement "${outcome.baseSkillName}" only installed on ${outcome.successCount}/${outcome.agentCount} agents - rolled back, base skill restored`);
    } else {
      log('warn', `Failed to replace skill "${outcome.baseSkillName}" - base skill preserved`);
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

  return { manifest, extensionDir, record };
}

export interface ExtensionRefreshResult {
  name: string;
  status: 'updated' | 'unchanged' | 'failed' | 'skipped';
  oldVersion: string;
  newVersion: string | null;
  failureReason?: string;
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

        const { manifest } = await commitResolvedExtension(projectDir, {
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
