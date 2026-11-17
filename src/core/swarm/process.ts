import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import type { Provider, SwarmSpec, Role } from './types.js';
import { requireValue, SwarmError } from './types.js';

export interface ProcessResult { stdout: string; code: number; timedOut: boolean }
export function childEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'TMPDIR', 'TEMP', 'LANG', 'LC_ALL', 'TERM']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  env.GIT_TERMINAL_PROMPT = '0';
  return env;
}
export async function execute(file: string, args: string[], cwd: string, timeoutMs: number, signal?: AbortSignal,
  env = childEnvironment(), input?: string): Promise<ProcessResult> {
  requireValue(!signal?.aborted, 'Operation cancelled');
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, env, shell: false, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true });
    child.stdin.on('error', () => { /* The child may exit before reading its input. */ });
    child.stdin.end(input);
    const decoder = new StringDecoder('utf8');
    let stdout = '', bytes = 0, timedOut = false, limit = false;
    const kill = () => {
      if (!child.pid) return;
      try { if (process.platform === 'win32') child.kill('SIGKILL'); else process.kill(-child.pid, 'SIGKILL'); } catch { /* Already exited. */ }
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    signal?.addEventListener('abort', kill, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 4 * 1024 * 1024) { limit = true; kill(); return; }
      stdout += decoder.write(chunk);
    });
    // Agent traces may contain secrets; drain stderr without saving or exporting it.
    child.stderr.resume();
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', kill); };
    child.once('error', () => { cleanup(); reject(new SwarmError('Executable could not start; check its installation and permissions')); });
    child.once('close', code => {
      cleanup();
      if (limit) reject(new SwarmError('Process output limit reached'));
      else if (signal?.aborted) reject(new SwarmError('Operation cancelled'));
      else resolve({ stdout: stdout + decoder.end(), code: code ?? 1, timedOut });
    });
  });
}

export function buildProviderCommand(provider: Provider, role: Role, prompt: string, spec: SwarmSpec,
  mcp: { cli: string; url: string; runId: string; agentId: string }): { file: string; args: string[]; input: string } {
  const writable = role === 'worker';
  const bridgeArgs = [mcp.cli, 'swarm', 'mcp'];
  const bridgeEnv = { AIF_SWARM_URL: mcp.url, AIF_SWARM_RUN_ID: mcp.runId, AIF_SWARM_AGENT_ID: mcp.agentId };
  if (provider.provider === 'claude') {
    const config = { mcpServers: { swarm: { command: process.execPath, args: bridgeArgs,
      env: { ...bridgeEnv, AIF_SWARM_AGENT_TOKEN: '${AIF_SWARM_AGENT_TOKEN}' } } } };
    return { file: 'claude', input: prompt, args: ['-p', '--output-format', 'json', '--strict-mcp-config', '--mcp-config', JSON.stringify(config),
      '--tools', writable ? 'Read,Glob,Grep,Edit,Write,Bash' : 'Read,Glob,Grep',
      '--allowedTools', 'mcp__swarm__*', ...(writable ? spec.allowedTools : []),
      ...(provider.model ? ['--model', provider.model] : [])] };
  }
  const args = ['--ask-for-approval', 'never', 'exec', '--sandbox', writable ? 'workspace-write' : 'read-only', '--json',
    '-c', 'sandbox_workspace_write.network_access=false',
    '-c', `mcp_servers.swarm.command=${JSON.stringify(process.execPath)}`,
    '-c', `mcp_servers.swarm.args=${JSON.stringify(bridgeArgs)}`,
    '-c', 'mcp_servers.swarm.env_vars=["AIF_SWARM_AGENT_TOKEN"]'];
  for (const [key, value] of Object.entries(bridgeEnv)) args.push('-c', `mcp_servers.swarm.env.${key}=${JSON.stringify(value)}`);
  if (provider.model) args.push('--model', provider.model);
  args.push('-');
  return { file: 'codex', args, input: prompt };
}

export function parseProviderOutput(provider: Provider['provider'], stdout: string): { result: Record<string, unknown>; tokens?: number } {
  let response: string | undefined, tokens: number | undefined;
  if (provider === 'claude') {
    const envelope = JSON.parse(stdout);
    requireValue(!envelope.is_error && typeof envelope.result === 'string', 'Claude returned no successful structured result');
    response = envelope.result;
    const usage = envelope.usage;
    if (usage && Number.isSafeInteger(usage.input_tokens) && Number.isSafeInteger(usage.output_tokens)) {
      tokens = usage.input_tokens + usage.output_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
    }
  } else {
    for (const line of stdout.split('\n').filter(line => line.trim())) {
      const event = JSON.parse(line);
      if (event.type === 'item.completed' && event.item?.type === 'agent_message') response = event.item.text;
      if (event.type === 'turn.completed' && event.usage && Number.isSafeInteger(event.usage.input_tokens) && Number.isSafeInteger(event.usage.output_tokens)) {
        tokens = (tokens ?? 0) + event.usage.input_tokens + event.usage.output_tokens;
      }
      requireValue(event.type !== 'turn.failed' && event.type !== 'error', 'Codex turn failed');
    }
  }
  requireValue(response, 'Provider returned no final message');
  const result = JSON.parse(response.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
  requireValue(result && typeof result === 'object' && !Array.isArray(result), 'Expected a JSON result object');
  return { result, tokens };
}
