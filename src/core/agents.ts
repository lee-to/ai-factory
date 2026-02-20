export interface AgentConfig {
  id: string;
  displayName: string;
  configDir: string;
  skillsDir: string;
  settingsFile: string | null;
  supportsMcp: boolean;
  skillsCliAgent: string | null;
}

const AGENT_REGISTRY: Record<string, AgentConfig> = {
  claude: {
    id: 'claude',
    displayName: 'Claude Code',
    configDir: '.claude',
    skillsDir: '.claude/skills',
    settingsFile: '.mcp.json',
    supportsMcp: true,
    skillsCliAgent: 'claude-code',
  },
  cursor: {
    id: 'cursor',
    displayName: 'Cursor',
    configDir: '.cursor',
    skillsDir: '.cursor/skills',
    settingsFile: '.cursor/mcp.json',
    supportsMcp: true,
    skillsCliAgent: 'cursor',
  },
  codex: {
    id: 'codex',
    displayName: 'Codex CLI',
    configDir: '.codex',
    skillsDir: '.codex/skills',
    settingsFile: null,
    supportsMcp: false,
    skillsCliAgent: 'codex',
  },
  copilot: {
    id: 'copilot',
    displayName: 'GitHub Copilot',
    configDir: '.github',
    skillsDir: '.github/skills',
    settingsFile: null,
    supportsMcp: false,
    skillsCliAgent: 'github-copilot',
  },
  gemini: {
    id: 'gemini',
    displayName: 'Gemini CLI',
    configDir: '.gemini',
    skillsDir: '.gemini/skills',
    settingsFile: null,
    supportsMcp: false,
    skillsCliAgent: 'gemini-cli',
  },
  junie: {
    id: 'junie',
    displayName: 'Junie',
    configDir: '.junie',
    skillsDir: '.junie/skills',
    settingsFile: null,
    supportsMcp: false,
    skillsCliAgent: 'junie',
  },
  windsurf: {
    id: 'windsurf',
    displayName: 'Windsurf',
    configDir: '.windsurf',
    skillsDir: '.windsurf/skills',
    settingsFile: null,
    supportsMcp: false,
    skillsCliAgent: 'windsurf',
  },
  warp: {
    id: 'warp',
    displayName: 'Warp',
    configDir: '.warp',
    skillsDir: '.warp/skills',
    settingsFile: null,
    supportsMcp: false,
    skillsCliAgent: null,
  },
  zencoder: {
    id: 'zencoder',
    displayName: 'Zencoder',
    configDir: '.zencoder',
    skillsDir: '.zencoder/skills',
    settingsFile: null,
    supportsMcp: false,
    skillsCliAgent: 'zencoder',
  },
  roocode: {
    id: 'roocode',
    displayName: 'Roo Code',
    configDir: '.roo',
    skillsDir: '.roo/skills',
    settingsFile: '.roo/mcp.json',
    supportsMcp: true,
    skillsCliAgent: 'roo',
  },
  kilocode: {
    id: 'kilocode',
    displayName: 'Kilo Code',
    configDir: '.kilocode',
    skillsDir: '.kilocode/skills',
    settingsFile: '.kilocode/mcp.json',
    supportsMcp: true,
    skillsCliAgent: 'kilo',
  },
  antigravity: {
    id: 'antigravity',
    displayName: 'Antigravity',
    configDir: '.agent',
    skillsDir: '.agent/skills',
    settingsFile: null,
    supportsMcp: false,
    skillsCliAgent: 'antigravity',
  },
  opencode: {
    id: 'opencode',
    displayName: 'OpenCode',
    configDir: '.opencode',
    skillsDir: '.opencode/skills',
    settingsFile: 'opencode.json',
    supportsMcp: true,
    skillsCliAgent: 'opencode',
  },
  universal: {
    id: 'universal',
    displayName: 'Universal / Other',
    configDir: '.agents',
    skillsDir: '.agents/skills',
    settingsFile: null,
    supportsMcp: false,
    skillsCliAgent: null,
  },
};

export function getAgentConfig(id: string): AgentConfig {
  const config = AGENT_REGISTRY[id];
  if (!config) {
    throw new Error(`Unknown agent: ${id}. Available: ${Object.keys(AGENT_REGISTRY).join(', ')}`);
  }
  return config;
}

export function getAgentChoices(): { name: string; value: string }[] {
  return Object.values(AGENT_REGISTRY).map(agent => ({
    name: `${agent.displayName} (${agent.configDir}/)`,
    value: agent.id,
  }));
}
