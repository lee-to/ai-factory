import type { McpServerConfig } from './mcp.js';

interface CodexTomlServerConfig {
  command: string;
  args?: string[];
  envVars?: string[];
  env?: Record<string, string>;
}

const SERVER_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
const TOML_BARE_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
const ENV_REF_PATTERN = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;
const TOML_TABLE_PATTERN = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/;

function assertValidServerKey(key: string): void {
  if (!SERVER_KEY_PATTERN.test(key)) {
    throw new Error(`MCP server "${key}": Codex TOML server keys may only contain letters, digits, "_" and "-"`);
  }
}

function formatTomlString(value: string): string {
  return JSON.stringify(value);
}

function formatTomlKey(value: string): string {
  return TOML_BARE_KEY_PATTERN.test(value) ? value : formatTomlString(value);
}

function formatTomlArray(values: string[]): string {
  return `[${values.map(formatTomlString).join(', ')}]`;
}

function toCodexTomlFormat(template: McpServerConfig): CodexTomlServerConfig {
  const result: CodexTomlServerConfig = { command: template.command };

  if (template.args && template.args.length > 0) {
    result.args = [...template.args];
  }

  if (template.env && Object.keys(template.env).length > 0) {
    const envVars: string[] = [];
    const literalEnv: Record<string, string> = {};

    for (const [key, value] of Object.entries(template.env)) {
      const envRef = value.match(ENV_REF_PATTERN);
      if (envRef) {
        envVars.push(envRef[1]);
      } else {
        literalEnv[key] = value;
      }
    }

    if (envVars.length > 0) {
      result.envVars = envVars;
    }
    if (Object.keys(literalEnv).length > 0) {
      result.env = literalEnv;
    }
  }

  return result;
}

function serializeCodexMcpServer(key: string, template: McpServerConfig): string {
  assertValidServerKey(key);
  const server = toCodexTomlFormat(template);
  const lines = [
    `[mcp_servers.${key}]`,
    `command = ${formatTomlString(server.command)}`,
  ];

  if (server.args) {
    lines.push(`args = ${formatTomlArray(server.args)}`);
  }

  if (server.envVars) {
    lines.push(`env_vars = ${formatTomlArray(server.envVars)}`);
  }

  if (server.env) {
    lines.push('', `[mcp_servers.${key}.env]`);
    for (const [envKey, envValue] of Object.entries(server.env)) {
      lines.push(`${formatTomlKey(envKey)} = ${formatTomlString(envValue)}`);
    }
  }

  return lines.join('\n');
}

function parseTomlTableName(line: string): string | null {
  return line.match(TOML_TABLE_PATTERN)?.[1] ?? null;
}

function isManagedServerTable(tableName: string, keys: Set<string>): boolean {
  for (const key of keys) {
    const serverTable = `mcp_servers.${key}`;
    if (tableName === serverTable || tableName.startsWith(`${serverTable}.`)) {
      return true;
    }
  }
  return false;
}

export function removeCodexMcpServersToml(content: string, keys: string[]): string {
  const keySet = new Set(keys);
  const lines = content.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const tableName = parseTomlTableName(line);
    if (tableName) {
      skipping = isManagedServerTable(tableName, keySet);
    }

    if (!skipping) {
      kept.push(line);
    }
  }

  const trimmed = kept.join('\n').trimEnd();
  return trimmed ? `${trimmed}\n` : '';
}

export function upsertCodexMcpServersToml(
  content: string,
  servers: { key: string; template: McpServerConfig }[],
): string {
  const keys = servers.map(server => server.key);
  const base = removeCodexMcpServersToml(content, keys).trimEnd();
  const blocks = servers
    .map(server => serializeCodexMcpServer(server.key, server.template))
    .join('\n\n');

  if (!blocks) {
    return base ? `${base}\n` : '';
  }

  return base ? `${base}\n\n${blocks}\n` : `${blocks}\n`;
}
