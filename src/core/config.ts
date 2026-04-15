import path from 'path';
import { createRequire } from 'module';
import { readJsonFile, writeJsonFile, fileExists } from '../utils/fs.js';
import { findAgentConfig, getAgentConfig } from './agents.js';

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

export interface AgentInstallation {
  id: string;
  skillsDir: string;
  installedSkills: string[];
  managedSkills?: Record<string, ManagedArtifactState>;
  agentsDir?: string;
  installedAgentFiles?: string[];
  managedAgentFiles?: Record<string, ManagedArtifactState>;
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
  managedAgentFiles?: unknown;
  subagentsDir?: string;
  installedSubagents?: string[];
  managedSubagents?: unknown;
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
    managedAgentFiles: {},
    mcp: normalizeMcp(legacy?.mcp),
  };
}

function normalizeManagedArtifacts(raw: unknown): Record<string, ManagedArtifactState> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const result: Record<string, ManagedArtifactState> = {};

  for (const [skillName, state] of Object.entries(raw as Record<string, unknown>)) {
    if (!skillName || typeof state !== 'object' || !state) {
      continue;
    }

    const sourceHash = (state as { sourceHash?: unknown }).sourceHash;
    const installedHash = (state as { installedHash?: unknown }).installedHash;

    if (typeof sourceHash === 'string' && sourceHash.length > 0 && typeof installedHash === 'string' && installedHash.length > 0) {
      result[skillName] = { sourceHash, installedHash };
    }
  }

  return result;
}

export async function loadConfig(projectDir: string): Promise<AiFactoryConfig | null> {
  const configPath = getConfigPath(projectDir);
  const raw = await readJsonFile<AiFactoryConfig & LegacyAiFactoryConfig>(configPath);
  if (!raw) {
    return null;
  }

  if (Array.isArray(raw.agents)) {
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
      const managedAgentFiles = normalizeManagedArtifacts(
        legacyAgent.managedAgentFiles ?? legacyAgent.managedSubagents,
      );

      return {
        id: agent.id,
        skillsDir,
        installedSkills: Array.isArray(legacyAgent.installedSkills) ? legacyAgent.installedSkills : [],
        managedSkills: normalizeManagedArtifacts(legacyAgent.managedSkills),
        agentsDir,
        installedAgentFiles,
        managedAgentFiles,
        mcp: normalizeMcp(legacyAgent.mcp),
      };
    });

    return {
      version: raw.version ?? CURRENT_VERSION,
      agents: normalizedAgents,
      extensions: Array.isArray(raw.extensions) ? raw.extensions : [],
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

export async function saveConfig(projectDir: string, config: AiFactoryConfig): Promise<void> {
  const configPath = getConfigPath(projectDir);
  await writeJsonFile(configPath, config);
}

export async function configExists(projectDir: string): Promise<boolean> {
  const configPath = getConfigPath(projectDir);
  return fileExists(configPath);
}

export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}
