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
  playwright: boolean;
}

export interface AgentInstallation {
  id: string;
  skillsDir: string;
  installedSkills: string[];
  mcp: McpConfig;
}

export interface ExtensionRecord {
  name: string;
  source: string;
  version: string;
  replacedSkills?: string[];
  subagentProfileIds?: string[];
  subagentProfileBackups?: Record<string, SubagentProfile | null>;
}

export interface AiFactoryConfig {
  version: string;
  agents: AgentInstallation[];
  extensions?: ExtensionRecord[];
  subagents?: SubagentsConfig;
}

export type SubagentMode = 'off' | 'plan-only' | 'implement-only' | 'full';

const SUBAGENT_MODES: Set<SubagentMode> = new Set(['off', 'plan-only', 'implement-only', 'full']);

export interface SubagentProfile {
  id: string;
  role: 'planner-scout' | 'implementer' | 'reviewer' | 'verifier' | 'custom';
  description: string;
  maxContextChars: number;
  outputFormat: 'json' | 'markdown';
  enabled: boolean;
  sourceExtension?: string;
}

export interface SubagentRouting {
  plan: string[];
  implement: string[];
}

export interface SubagentsConfig {
  enabled: boolean;
  mode: SubagentMode;
  maxParallelTasks: number;
  profiles: SubagentProfile[];
  routing: SubagentRouting;
}

interface LegacyAiFactoryConfig {
  version?: string;
  agent?: string;
  skillsDir?: string;
  installedSkills?: string[];
  mcp?: Partial<McpConfig>;
  subagents?: Partial<SubagentsConfig>;
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

export function createDefaultSubagentsConfig(): SubagentsConfig {
  return {
    enabled: false,
    mode: 'off',
    maxParallelTasks: 3,
    profiles: [],
    routing: {
      plan: [],
      implement: [],
    },
  };
}

function normalizeSubagents(subagents?: Partial<SubagentsConfig>): SubagentsConfig {
  const defaults = createDefaultSubagentsConfig();
  const profiles = Array.isArray(subagents?.profiles)
    ? subagents.profiles
      .filter((profile): profile is SubagentProfile => {
        return Boolean(profile?.id && profile?.role);
      })
      .map(profile => ({
        id: profile.id,
        role: profile.role,
        description: profile.description ?? '',
        maxContextChars: profile.maxContextChars ?? 12000,
        outputFormat: profile.outputFormat ?? 'markdown',
        enabled: profile.enabled ?? true,
        sourceExtension: profile.sourceExtension,
      }))
    : defaults.profiles;

  const mode = (typeof subagents?.mode === 'string' && SUBAGENT_MODES.has(subagents.mode as SubagentMode))
    ? subagents.mode as SubagentMode
    : defaults.mode;
  const maxParallelTasks = Number.isFinite(subagents?.maxParallelTasks)
    ? Math.max(1, Math.floor(subagents?.maxParallelTasks as number))
    : defaults.maxParallelTasks;

  return {
    enabled: subagents?.enabled ?? defaults.enabled,
    mode,
    maxParallelTasks,
    profiles,
    routing: {
      plan: Array.isArray(subagents?.routing?.plan) ? subagents!.routing!.plan : defaults.routing.plan,
      implement: Array.isArray(subagents?.routing?.implement) ? subagents!.routing!.implement : defaults.routing.implement,
    },
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
      extensions: Array.isArray(raw.extensions) ? raw.extensions : [],
      subagents: normalizeSubagents(raw.subagents),
    };
  }

  if (raw.agent) {
    return {
      version: raw.version ?? CURRENT_VERSION,
      agents: [createAgentInstallation(raw.agent, raw)],
      extensions: [],
      subagents: normalizeSubagents(raw.subagents),
    };
  }

  return {
    version: raw.version ?? CURRENT_VERSION,
    agents: [],
    extensions: [],
    subagents: normalizeSubagents(raw.subagents),
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
