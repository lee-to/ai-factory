import { loadAllExtensions } from './extensions.js';

export type AgentFileExtension = '.md' | '.toml';

export interface AgentConfig {
  id: string;
  displayName: string;
  configDir: string;
  skillsDir: string;
  agentsDir?: string;
  agentFileExtension?: AgentFileExtension;
  settingsFile: string | null;
  supportsMcp: boolean;
  skillsCliAgent: string | null;
  source: 'builtin' | 'extension';
  extensionName?: string;
}

export interface RuntimeDefinitionInput {
  id: string;
  displayName: string;
  configDir: string;
  skillsDir: string;
  agentsDir?: string;
  agentFileExtension?: AgentFileExtension;
  settingsFile: string | null;
  supportsMcp: boolean;
  skillsCliAgent: string | null;
}

export interface RuntimeManifestInput {
  name: string;
  agents?: RuntimeDefinitionInput[];
}

const BUILTIN_AGENT_REGISTRY: Record<string, AgentConfig> = {
  claude: {
    id: 'claude',
    displayName: 'Claude Code',
    configDir: '.claude',
    skillsDir: '.claude/skills',
    agentsDir: '.claude/agents',
    agentFileExtension: '.md',
    settingsFile: '.mcp.json',
    supportsMcp: true,
    skillsCliAgent: 'claude-code',
    source: 'builtin',
  },
  cursor: {
    id: 'cursor',
    displayName: 'Cursor',
    configDir: '.cursor',
    skillsDir: '.cursor/skills',
    settingsFile: '.cursor/mcp.json',
    supportsMcp: true,
    skillsCliAgent: 'cursor',
    source: 'builtin',
  },
  codex: {
    id: 'codex',
    displayName: 'Codex CLI',
    configDir: '.codex',
    skillsDir: '.codex/skills',
    agentsDir: '.codex/agents',
    agentFileExtension: '.toml',
    settingsFile: null,
    supportsMcp: false,
    skillsCliAgent: 'codex',
    source: 'builtin',
  },
  copilot: {
    id: 'copilot',
    displayName: 'GitHub Copilot',
    configDir: '.github',
    skillsDir: '.github/skills',
    settingsFile: '.vscode/mcp.json',
    supportsMcp: true,
    skillsCliAgent: 'github-copilot',
    source: 'builtin',
  },
  gemini: {
    id: 'gemini',
    displayName: 'Gemini CLI',
    configDir: '.gemini',
    skillsDir: '.gemini/skills',
    settingsFile: null,
    supportsMcp: false,
    skillsCliAgent: 'gemini-cli',
    source: 'builtin',
  },
  junie: {
    id: 'junie',
    displayName: 'Junie',
    configDir: '.junie',
    skillsDir: '.junie/skills',
    settingsFile: null,
    supportsMcp: false,
    skillsCliAgent: 'junie',
    source: 'builtin',
  },
  qwen: {
    id: 'qwen',
    displayName: 'Qwen Code',
    configDir: '.qwen',
    skillsDir: '.qwen/skills',
    settingsFile: '.qwen/settings.json',
    supportsMcp: true,
    skillsCliAgent: null,
    source: 'builtin',
  },
  windsurf: {
    id: 'windsurf',
    displayName: 'Windsurf',
    configDir: '.windsurf',
    skillsDir: '.windsurf/skills',
    settingsFile: null,
    supportsMcp: false,
    skillsCliAgent: 'windsurf',
    source: 'builtin',
  },
  warp: {
    id: 'warp',
    displayName: 'Warp',
    configDir: '.warp',
    skillsDir: '.warp/skills',
    settingsFile: null,
    supportsMcp: false,
    skillsCliAgent: null,
    source: 'builtin',
  },
  zencoder: {
    id: 'zencoder',
    displayName: 'Zencoder',
    configDir: '.zencoder',
    skillsDir: '.zencoder/skills',
    settingsFile: null,
    supportsMcp: false,
    skillsCliAgent: 'zencoder',
    source: 'builtin',
  },
  roocode: {
    id: 'roocode',
    displayName: 'Roo Code',
    configDir: '.roo',
    skillsDir: '.roo/skills',
    settingsFile: '.roo/mcp.json',
    supportsMcp: true,
    skillsCliAgent: 'roo',
    source: 'builtin',
  },
  kilocode: {
    id: 'kilocode',
    displayName: 'Kilo Code',
    configDir: '.kilocode',
    skillsDir: '.kilocode/skills',
    settingsFile: '.kilocode/mcp.json',
    supportsMcp: true,
    skillsCliAgent: 'kilo',
    source: 'builtin',
  },
  antigravity: {
    id: 'antigravity',
    displayName: 'Antigravity',
    configDir: '.agent',
    skillsDir: '.agent/skills',
    settingsFile: null,
    supportsMcp: false,
    skillsCliAgent: 'antigravity',
    source: 'builtin',
  },
  opencode: {
    id: 'opencode',
    displayName: 'OpenCode',
    configDir: '.opencode',
    skillsDir: '.opencode/skills',
    settingsFile: 'opencode.json',
    supportsMcp: true,
    skillsCliAgent: 'opencode',
    source: 'builtin',
  },
  universal: {
    id: 'universal',
    displayName: 'Universal / Other',
    configDir: '.agents',
    skillsDir: '.agents/skills',
    settingsFile: null,
    supportsMcp: false,
    skillsCliAgent: null,
    source: 'builtin',
  },
};

const extensionAgentRegistry = new Map<string, AgentConfig>();

function getRegistryEntries(): AgentConfig[] {
  return [
    ...Object.values(BUILTIN_AGENT_REGISTRY),
    ...extensionAgentRegistry.values(),
  ];
}

function isValidRuntimeDefinition(definition: RuntimeDefinitionInput): boolean {
  return Boolean(
    definition.id &&
      definition.displayName &&
      definition.configDir &&
      definition.skillsDir,
  );
}

function normalizeRuntimeDefinition(
  definition: RuntimeDefinitionInput,
  extensionName: string,
): AgentConfig {
  return {
    id: definition.id,
    displayName: definition.displayName,
    configDir: definition.configDir,
    skillsDir: definition.skillsDir,
    agentsDir: definition.agentsDir,
    agentFileExtension: definition.agentFileExtension,
    settingsFile: definition.settingsFile,
    supportsMcp: definition.supportsMcp,
    skillsCliAgent: definition.skillsCliAgent,
    source: 'extension',
    extensionName,
  };
}

export function resetExtensionAgentRegistry(): void {
  extensionAgentRegistry.clear();
}

export function registerRuntimeDefinitions(
  definitions: RuntimeDefinitionInput[],
  extensionName: string,
): void {
  for (const definition of definitions) {
    if (!isValidRuntimeDefinition(definition)) {
      throw new Error(`Extension "${extensionName}" defines an invalid runtime. Required fields: id, displayName, configDir, skillsDir.`);
    }

    if (definition.id in BUILTIN_AGENT_REGISTRY) {
      throw new Error(`Extension "${extensionName}" cannot redefine built-in runtime "${definition.id}".`);
    }

    // The registry is reset before each hydrate, but this still guards
    // collisions between different installed extensions and any extra
    // manifests being validated in the same hydration pass.
    const existing = extensionAgentRegistry.get(definition.id);
    if (existing && existing.extensionName !== extensionName) {
      throw new Error(
        `Runtime "${definition.id}" is already provided by extension "${existing.extensionName}". ` +
        `Extension "${extensionName}" cannot claim the same runtime id.`,
      );
    }

    extensionAgentRegistry.set(definition.id, normalizeRuntimeDefinition(definition, extensionName));
  }
}

export async function hydrateProjectAgentRegistry(
  projectDir: string,
  options?: {
    extensionNames?: string[];
    extraManifests?: RuntimeManifestInput[];
  },
): Promise<void> {
  resetExtensionAgentRegistry();

  const extraNames = new Set((options?.extraManifests ?? []).map(manifest => manifest.name));
  const extensionNames = (options?.extensionNames ?? []).filter(name => !extraNames.has(name));

  if (extensionNames.length > 0) {
    const installed = await loadAllExtensions(projectDir, extensionNames);
    for (const { manifest } of installed) {
      if (manifest.agents?.length) {
        registerRuntimeDefinitions(manifest.agents, manifest.name);
      }
    }
  }

  for (const manifest of options?.extraManifests ?? []) {
    if (manifest.agents?.length) {
      registerRuntimeDefinitions(manifest.agents, manifest.name);
    }
  }
}

export function findAgentConfig(id: string): AgentConfig | undefined {
  if (id in BUILTIN_AGENT_REGISTRY) {
    return BUILTIN_AGENT_REGISTRY[id];
  }
  return extensionAgentRegistry.get(id);
}

export function getAgentConfig(id: string): AgentConfig {
  const config = findAgentConfig(id);
  if (!config) {
    throw new Error(`Unknown agent: ${id}. Available: ${getAvailableAgentIds().join(', ')}`);
  }
  return config;
}

export function getAgentChoices(): { name: string; value: string }[] {
  return getRegistryEntries().map(agent => ({
    name: `${agent.displayName} (${agent.configDir}/)`,
    value: agent.id,
  }));
}

export function getAvailableAgentIds(): string[] {
  return getRegistryEntries().map(agent => agent.id);
}
