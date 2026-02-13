import path from 'path';
import { readJsonFile, writeJsonFile, getMcpDir, ensureDir, fileExists } from '../utils/fs.js';
import { getAgentConfig } from './agents.js';

interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface OpenCodeMcpServerConfig {
  type: 'local';
  command: string[];
  environment?: Record<string, string>;
}

interface McpSettings {
  mcpServers?: Record<string, McpServerConfig>;
}

interface OpenCodeSettings {
  [key: string]: unknown;
  mcp?: Record<string, OpenCodeMcpServerConfig>;
}

export interface McpOptions {
  github: boolean;
  filesystem: boolean;
  postgres: boolean;
  chromeDevtools: boolean;
  serena: boolean;
}

function toOpenCodeFormat(config: McpServerConfig): OpenCodeMcpServerConfig {
  const command = [config.command, ...(config.args || [])];
  const result: OpenCodeMcpServerConfig = { type: 'local', command };
  if (config.env) {
    result.environment = config.env;
  }
  return result;
}

export async function configureMcp(projectDir: string, options: McpOptions, agentId: string = 'claude'): Promise<string[]> {
  const agent = getAgentConfig(agentId);

  if (!agent.supportsMcp || !agent.settingsFile) {
    return [];
  }

  const isOpenCode = agentId === 'opencode';
  const configuredServers: string[] = [];
  const settingsPath = path.join(projectDir, agent.settingsFile);
  const settingsDir = path.dirname(settingsPath);

  await ensureDir(settingsDir);

  const mcpTemplatesDir = path.join(getMcpDir(), 'templates');

  if (isOpenCode) {
    let settings: OpenCodeSettings = {};
    if (await fileExists(settingsPath)) {
      const existing = await readJsonFile<OpenCodeSettings>(settingsPath);
      if (existing) {
        settings = existing;
      }
    }

    if (!settings.mcp) {
      settings.mcp = {};
    }

    const serverEntries: [string, string][] = [
      ['github', 'github.json'],
      ['filesystem', 'filesystem.json'],
      ['postgres', 'postgres.json'],
      ['chromeDevtools', 'chrome-devtools.json'],
      ['serena', 'serena.json'],
    ];

    for (const [key, file] of serverEntries) {
      if (options[key as keyof McpOptions]) {
        const template = await readJsonFile<McpServerConfig>(path.join(mcpTemplatesDir, file));
        if (template) {
          settings.mcp[key] = toOpenCodeFormat(template);
          configuredServers.push(key);
        }
      }
    }

    if (configuredServers.length > 0) {
      await writeJsonFile(settingsPath, settings);
    }
  } else {
    let settings: McpSettings = {};
    if (await fileExists(settingsPath)) {
      const existing = await readJsonFile<McpSettings>(settingsPath);
      if (existing) {
        settings = existing;
      }
    }

    if (!settings.mcpServers) {
      settings.mcpServers = {};
    }

    const serverEntries: [string, string][] = [
      ['github', 'github.json'],
      ['filesystem', 'filesystem.json'],
      ['postgres', 'postgres.json'],
      ['chromeDevtools', 'chrome-devtools.json'],
      ['serena', 'serena.json'],
    ];

    for (const [key, file] of serverEntries) {
      if (options[key as keyof McpOptions]) {
        const template = await readJsonFile<McpServerConfig>(path.join(mcpTemplatesDir, file));
        if (template) {
          settings.mcpServers[key] = template;
          configuredServers.push(key);
        }
      }
    }

    if (configuredServers.length > 0) {
      await writeJsonFile(settingsPath, settings);
    }
  }

  return configuredServers;
}

export function getMcpInstructions(servers: string[]): string[] {
  const instructions: string[] = [];

  if (servers.includes('github')) {
    instructions.push(
      'GitHub MCP: Set GITHUB_TOKEN environment variable with your GitHub personal access token'
    );
  }

  if (servers.includes('filesystem')) {
    instructions.push(
      'Filesystem MCP: No additional configuration needed. Server provides file access tools.'
    );
  }

  if (servers.includes('postgres')) {
    instructions.push(
      'Postgres MCP: Set DATABASE_URL environment variable with your PostgreSQL connection string'
    );
  }

  if (servers.includes('chromeDevtools')) {
    instructions.push(
      'Chrome Devtools MCP: No additional configuration needed. Server provides your coding agent control and inspect a live Chrome browser.'
    );
  }

  if (servers.includes('serena')) {
    instructions.push(
      'Serena MCP: Requires `uv` package manager. Install: https://docs.astral.sh/uv/getting-started/installation/'
    );
  }

  return instructions;
}
