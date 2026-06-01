import { findAgentConfig } from './agents.js';
import type { AgentRunOverride } from './config.js';

export interface AgentRunSpec {
  id: string;          // 'claude-code'
  displayName: string;
  command: string;     // template with {model} {phase} {prompt}
  defaultModel: string;
}

export const BUILTIN_DISPATCH_AGENTS: Record<string, AgentRunSpec> = {
  'claude-code': { id: 'claude-code', displayName: 'Claude Code',
    command: 'claude --model {model} -p {prompt}', defaultModel: 'sonnet' },
  'gemini-cli':  { id: 'gemini-cli',  displayName: 'Gemini CLI',
    command: 'gemini -m {model} -p {prompt}',      defaultModel: 'gemini-2.5-pro' },
  antigravity:   { id: 'antigravity', displayName: 'Antigravity',
    command: 'antigravity run --model {model} --prompt {prompt}', defaultModel: 'gemini-3.5-flash' },
  'chatgpt-cli': { id: 'chatgpt-cli', displayName: 'ChatGPT CLI',
    command: 'chatgpt --model {model} -p {prompt}', defaultModel: 'gpt-4o' },
  'openrouter-cli': { id: 'openrouter-cli', displayName: 'OpenRouter CLI',
    command: 'openrouter --model {model} -p {prompt}', defaultModel: 'anthropic/claude-3.5-sonnet' },
};

export function listDispatchAgentIds(): string[] {
  return Object.keys(BUILTIN_DISPATCH_AGENTS);
}

// Resolution order:
//  1) exact builtin by dispatch id (skillsCliAgent name)
//  2) else findAgentConfig(id); if its skillsCliAgent maps to a builtin, use that (lets users pass 'claude'/'gemini')
//  3) else undefined (unknown agent)
// Then merge overrides[id] (command/defaultModel) on top of the resolved spec.
export function resolveAgentRunSpec(
  agentId: string,
  overrides?: Record<string, AgentRunOverride>,
): AgentRunSpec | undefined {
  let base: AgentRunSpec | undefined = BUILTIN_DISPATCH_AGENTS[agentId];
  if (!base) {
    const installCfg = findAgentConfig(agentId);
    const cliName = installCfg?.skillsCliAgent ?? undefined;
    if (cliName && BUILTIN_DISPATCH_AGENTS[cliName]) base = BUILTIN_DISPATCH_AGENTS[cliName];
  }
  const ov = overrides?.[agentId] ?? (base ? overrides?.[base.id] : undefined);
  if (!base && ov?.command) {
    // user defines a brand-new agent purely via dispatchAgents
    base = { id: agentId, displayName: agentId, command: ov.command,
             defaultModel: ov.defaultModel ?? '' };
  }
  if (!base) return undefined;
  return {
    ...base,
    ...(ov?.command ? { command: ov.command } : {}),
    ...(ov?.defaultModel ? { defaultModel: ov.defaultModel } : {}),
  };
}
