import path from 'path';
import { createRequire } from 'module';
import { readJsonFile, writeJsonFile, fileExists } from '../utils/fs.js';
import { getAgentConfig } from './agents.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

export interface McpConfig {
  github: boolean;
  filesystem: boolean;
  postgres: boolean;
  chromeDevtools: boolean;
}

export interface AgentInstallation {
  id: string;
  skillsDir: string;
  installedSkills: string[];
  mcp: McpConfig;
}

export interface AiFactoryConfig {
  version: string;
  agents: AgentInstallation[];
}

interface LegacyAiFactoryConfig {
  version?: string;
  agent?: string;
  skillsDir?: string;
  installedSkills?: string[];
  mcp?: Partial<McpConfig>;
}

const CONFIG_FILENAME = '.ai-factory.json';
const CURRENT_VERSION: string = pkg.version;

export function getConfigPath(projectDir: string): string {
  return path.join(projectDir, CONFIG_FILENAME);
}

function normalizeMcp(mcp?: Partial<McpConfig>): McpConfig {
  return {
    github: mcp?.github ?? false,
    filesystem: mcp?.filesystem ?? false,
    postgres: mcp?.postgres ?? false,
    chromeDevtools: mcp?.chromeDevtools ?? false,
  };
}

function createAgentInstallation(agentId: string, legacy?: LegacyAiFactoryConfig): AgentInstallation {
  const agent = getAgentConfig(agentId);
  return {
    skillsDir: legacy?.skillsDir ?? agent.skillsDir,
    id: agentId,
    installedSkills: legacy?.installedSkills ?? [],
    mcp: normalizeMcp(legacy?.mcp),
  };
}

export function createDefaultConfig(agentIds: string[] = ['claude']): AiFactoryConfig {
  const uniqueAgentIds = Array.from(new Set(agentIds));
  return {
    version: CURRENT_VERSION,
    agents: uniqueAgentIds.map(id => createAgentInstallation(id)),
  };
}

export async function loadConfig(projectDir: string): Promise<AiFactoryConfig | null> {
  const configPath = getConfigPath(projectDir);
  const raw = await readJsonFile<AiFactoryConfig & LegacyAiFactoryConfig>(configPath);
  if (!raw) {
    return null;
  }

  if (Array.isArray(raw.agents)) {
    const normalizedAgents = raw.agents.map(agent => {
      const agentConfig = getAgentConfig(agent.id);
      return {
        id: agent.id,
        skillsDir: agent.skillsDir || agentConfig.skillsDir,
        installedSkills: Array.isArray(agent.installedSkills) ? agent.installedSkills : [],
        mcp: normalizeMcp(agent.mcp),
      };
    });

    return {
      version: raw.version ?? CURRENT_VERSION,
      agents: normalizedAgents,
    };
  }

  if (raw.agent) {
    return {
      version: raw.version ?? CURRENT_VERSION,
      agents: [createAgentInstallation(raw.agent, raw)],
    };
  }

  return {
    version: raw.version ?? CURRENT_VERSION,
    agents: [],
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
