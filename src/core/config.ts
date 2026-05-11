import path from 'path';
import { createRequire } from 'module';
import { readJsonFile, writeJsonFile, fileExists, getPackagePath, listFilesRecursive } from '../utils/fs.js';
import { findAgentConfig, getAgentConfig } from './agents.js';
import { loadAllExtensions, type InstalledExtensionManifest } from './extensions.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

export interface McpConfig {
  github: boolean;
  filesystem: boolean;
  postgres: boolean;
  chromeDevtools: boolean;
  playwright: boolean;
}

export interface ManagedArtifactState {
  sourceHash: string;
  installedHash: string;
}

export interface AgentFileSource {
  kind: 'bundled' | 'extension';
  sourcePath: string;
  extensionName?: string;
}

export interface AgentInstallation {
  id: string;
  skillsDir: string;
  installedSkills: string[];
  managedSkills?: Record<string, ManagedArtifactState>;
  agentsDir?: string;
  installedAgentFiles?: string[];
  agentFileSources?: Record<string, AgentFileSource>;
  managedAgentFiles?: Record<string, ManagedArtifactState>;
  configFiles?: string[];
  installedConfigFiles?: string[];
  managedConfigFiles?: Record<string, ManagedArtifactState>;
  mcp: McpConfig;
}

export interface ExtensionRecord {
  name: string;
  source: string;
  version: string;
  replacedSkills?: string[];
}

export interface AiFactoryConfig {
  version: string;
  agents: AgentInstallation[];
  extensions?: ExtensionRecord[];
}

interface SaveConfigOptions {
  hydrateAgentFileSources?: boolean;
  installedExtensions?: InstalledExtensionManifest[];
}

interface LegacyAiFactoryConfig {
  version?: string;
  agent?: string;
  skillsDir?: string;
  installedSkills?: string[];
  mcp?: Partial<McpConfig>;
}

interface LegacyAgentInstallationShape {
  id: string;
  skillsDir?: string;
  installedSkills?: string[];
  managedSkills?: unknown;
  agentsDir?: string;
  installedAgentFiles?: string[];
  agentFileSources?: unknown;
  managedAgentFiles?: unknown;
  subagentsDir?: string;
  installedSubagents?: string[];
  managedSubagents?: unknown;
  configFiles?: string[];
  installedConfigFiles?: string[];
  managedConfigFiles?: unknown;
  mcp?: Partial<McpConfig>;
}

const CONFIG_FILENAME = '.ai-factory.json';
const CURRENT_VERSION: string = pkg.version;

function getConfigPath(projectDir: string): string {
  return path.join(projectDir, CONFIG_FILENAME);
}

function normalizeMcp(mcp?: Partial<McpConfig>): McpConfig {
  return {
    github: mcp?.github ?? false,
    filesystem: mcp?.filesystem ?? false,
    postgres: mcp?.postgres ?? false,
    chromeDevtools: mcp?.chromeDevtools ?? false,
    playwright: mcp?.playwright ?? false,
  };
}

function createAgentInstallation(agentId: string, legacy?: LegacyAiFactoryConfig): AgentInstallation {
  const agent = getAgentConfig(agentId);
  return {
    skillsDir: legacy?.skillsDir ?? agent.skillsDir,
    id: agentId,
    installedSkills: legacy?.installedSkills ?? [],
    managedSkills: {},
    agentsDir: agent.agentsDir,
    installedAgentFiles: [],
    agentFileSources: {},
    managedAgentFiles: {},
    configFiles: agent.configFiles,
    installedConfigFiles: [],
    managedConfigFiles: {},
    mcp: normalizeMcp(legacy?.mcp),
  };
}

function normalizeManagedArtifacts(raw: unknown): Record<string, ManagedArtifactState> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const result: Record<string, ManagedArtifactState> = {};

  for (const [artifactName, state] of Object.entries(raw as Record<string, unknown>)) {
    if (!artifactName || typeof state !== 'object' || !state) {
      continue;
    }

    const sourceHash = (state as { sourceHash?: unknown }).sourceHash;
    const installedHash = (state as { installedHash?: unknown }).installedHash;

    if (
      typeof sourceHash === 'string'
      && sourceHash.length > 0
      && typeof installedHash === 'string'
      && installedHash.length > 0
    ) {
      result[artifactName] = { sourceHash, installedHash };
    }
  }

  return result;
}

function normalizeAgentFileSources(raw: unknown): Record<string, AgentFileSource> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const result: Record<string, AgentFileSource> = {};

  for (const [relPath, source] of Object.entries(raw as Record<string, unknown>)) {
    if (!relPath || typeof source !== 'object' || !source) {
      continue;
    }

    const kind = (source as { kind?: unknown }).kind;
    const sourcePath = (source as { sourcePath?: unknown }).sourcePath;
    const extensionName = (source as { extensionName?: unknown }).extensionName;

    if ((kind !== 'bundled' && kind !== 'extension') || typeof sourcePath !== 'string' || sourcePath.length === 0) {
      continue;
    }

    if (kind === 'extension' && (typeof extensionName !== 'string' || extensionName.length === 0)) {
      continue;
    }

    result[relPath] = {
      kind,
      sourcePath,
      ...(kind === 'extension' ? { extensionName: extensionName as string } : {}),
    };
  }

  return result;
}

function buildExtensionAgentFileSourceIndex(
  installedExtensions: InstalledExtensionManifest[],
): Map<string, AgentFileSource> {
  const extensionSourceIndex = new Map<string, AgentFileSource>();

  for (const { manifest } of installedExtensions) {
    for (const agentFile of manifest.agentFiles ?? []) {
      extensionSourceIndex.set(`${agentFile.runtime}::${agentFile.target}`, {
        kind: 'extension',
        sourcePath: agentFile.source,
        extensionName: manifest.name,
      });
    }
  }

  return extensionSourceIndex;
}

let bundledClaudeAgentFilesCache: Set<string> | null = null;

async function getBundledAgentFileTargets(agentId: string): Promise<Set<string>> {
  if (agentId !== 'claude') {
    return new Set<string>();
  }

  // Package-bundled Claude agent files are static for the lifetime of a single
  // CLI process, so a module-level cache avoids repeated directory walks.
  if (!bundledClaudeAgentFilesCache) {
    const claudeConfig = getAgentConfig('claude');
    const sourceDir = claudeConfig.agentsSourceDir
      ? getPackagePath(claudeConfig.agentsSourceDir)
      : null;
    if (!sourceDir) {
      bundledClaudeAgentFilesCache = new Set();
      return bundledClaudeAgentFilesCache;
    }
    const files = await listFilesRecursive(sourceDir);
    bundledClaudeAgentFilesCache = new Set(
      files.map(filePath => path.relative(sourceDir, filePath).replaceAll('\\', '/')),
    );
  }

  return bundledClaudeAgentFilesCache;
}

export async function loadConfig(projectDir: string): Promise<AiFactoryConfig | null> {
  const configPath = getConfigPath(projectDir);
  const raw = await readJsonFile<AiFactoryConfig & LegacyAiFactoryConfig>(configPath);
  if (!raw) {
    return null;
  }

  if (Array.isArray(raw.agents)) {
    const rawExtensions = Array.isArray(raw.extensions) ? raw.extensions : [];

    const normalizedAgents = raw.agents.map(agent => {
      const legacyAgent = agent as unknown as LegacyAgentInstallationShape;
      const agentConfig = findAgentConfig(agent.id);
      const skillsDir = legacyAgent.skillsDir || agentConfig?.skillsDir;

      if (!skillsDir) {
        throw new Error(
          `Configured agent "${agent.id}" is missing "skillsDir" and no runtime definition is currently registered for it.`,
        );
      }

      const agentsDir = legacyAgent.agentsDir
        || legacyAgent.subagentsDir
        || agentConfig?.agentsDir;
      const installedAgentFiles = Array.isArray(legacyAgent.installedAgentFiles)
        ? legacyAgent.installedAgentFiles
        : Array.isArray(legacyAgent.installedSubagents)
          ? legacyAgent.installedSubagents
          : [];
      const agentFileSources = normalizeAgentFileSources(legacyAgent.agentFileSources);
      const managedAgentFiles = normalizeManagedArtifacts(
        legacyAgent.managedAgentFiles ?? legacyAgent.managedSubagents,
      );

      const filteredAgentFileSources: Record<string, AgentFileSource> = {};
      for (const relPath of installedAgentFiles) {
        const existingSource = agentFileSources[relPath];
        if (existingSource) {
          filteredAgentFileSources[relPath] = existingSource;
        }
      }

      return {
        id: agent.id,
        skillsDir,
        installedSkills: Array.isArray(legacyAgent.installedSkills) ? legacyAgent.installedSkills : [],
        managedSkills: normalizeManagedArtifacts(legacyAgent.managedSkills),
        agentsDir,
        installedAgentFiles,
        agentFileSources: filteredAgentFileSources,
        managedAgentFiles,
        configFiles: Array.isArray(legacyAgent.configFiles) ? legacyAgent.configFiles : agentConfig?.configFiles,
        installedConfigFiles: Array.isArray(legacyAgent.installedConfigFiles) ? legacyAgent.installedConfigFiles : [],
        managedConfigFiles: normalizeManagedArtifacts(legacyAgent.managedConfigFiles),
        mcp: normalizeMcp(legacyAgent.mcp),
      };
    });

    return {
      version: raw.version ?? CURRENT_VERSION,
      agents: normalizedAgents,
      extensions: rawExtensions,
    };
  }

  if (raw.agent) {
    return {
      version: raw.version ?? CURRENT_VERSION,
      agents: [createAgentInstallation(raw.agent, raw)],
      extensions: [],
    };
  }

  return {
    version: raw.version ?? CURRENT_VERSION,
    agents: [],
    extensions: [],
  };
}

export async function hydrateAgentFileSources(
  projectDir: string,
  config: AiFactoryConfig,
  options: { installedExtensions?: InstalledExtensionManifest[] } = {},
): Promise<void> {
  if (!config.agents.length) {
    return;
  }

  const extensions = config.extensions ?? [];
  const installedExtensions = options.installedExtensions
    ?? (extensions.length > 0
      ? await loadAllExtensions(projectDir, extensions.map(extension => extension.name))
      : []);
  const extensionSourceIndex = buildExtensionAgentFileSourceIndex(installedExtensions);

  for (const agent of config.agents) {
    const installedAgentFiles = agent.installedAgentFiles ?? [];
    if (installedAgentFiles.length === 0) {
      agent.agentFileSources = {};
      continue;
    }

    const installedSet = new Set(installedAgentFiles);
    const normalizedSources = normalizeAgentFileSources(agent.agentFileSources);
    const hydratedSources: Record<string, AgentFileSource> = {};

    for (const relPath of installedAgentFiles) {
      const existingSource = normalizedSources[relPath];
      if (existingSource) {
        hydratedSources[relPath] = existingSource;
        continue;
      }

      const extensionSource = extensionSourceIndex.get(`${agent.id}::${relPath}`);
      if (extensionSource) {
        hydratedSources[relPath] = extensionSource;
      }
    }

    const bundledTargets = await getBundledAgentFileTargets(agent.id);
    for (const relPath of installedAgentFiles) {
      if (!hydratedSources[relPath] && bundledTargets.has(relPath)) {
        hydratedSources[relPath] = {
          kind: 'bundled',
          sourcePath: relPath,
        };
      }
    }

    agent.agentFileSources = Object.fromEntries(
      Object.entries(hydratedSources).filter(([relPath]) => installedSet.has(relPath)),
    );
  }
}

export async function saveConfig(
  projectDir: string,
  config: AiFactoryConfig,
  options: SaveConfigOptions = {},
): Promise<void> {
  const configPath = getConfigPath(projectDir);
  if (options.hydrateAgentFileSources ?? true) {
    await hydrateAgentFileSources(projectDir, config, {
      installedExtensions: options.installedExtensions,
    });
  }
  await writeJsonFile(configPath, config);
}

export async function configExists(projectDir: string): Promise<boolean> {
  const configPath = getConfigPath(projectDir);
  return fileExists(configPath);
}

export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}
