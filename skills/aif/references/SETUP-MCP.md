## MCP Configuration

AI Factory writes MCP config to `{{settings_file}}`, but the outer settings shape depends on the runtime.

### Runtime Format Matrix

| Runtime | Write under | Entry shape |
|---------|-------------|-------------|
| Standard MCP runtimes (Claude Code, Cursor, Roo Code, Kilo Code, Qwen Code, Universal / Other) | `mcpServers.<server>` | `{ "command": "...", "args": [...], "env": {...} }` |
| OpenCode | `mcp.<server>` | `{ "type": "local", "command": ["...", "..."], "environment": {...} }` |
| GitHub Copilot | `servers.<server>` | `{ "type": "stdio", "command": "...", "args": [...], "env": {...} }` |
| Codex app | `[mcp_servers.<server>]` in `.codex/config.toml` | `command = "..."`, optional `args = [...]`, credential placeholders as `env_vars = ["VAR"]`, literal values under `[mcp_servers.<server>.env]` |

Use the canonical server templates below as the source values, then wrap them using the runtime-specific format above.

### Canonical Server Templates

#### GitHub
**When:** Project has `.git` or uses GitHub

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
  }
}
```

#### Postgres
**When:** Uses PostgreSQL, Prisma, Drizzle, Supabase

```json
{
  "postgres": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres"],
    "env": { "DATABASE_URL": "${DATABASE_URL}" }
  }
}
```

#### Filesystem
**When:** Needs advanced file operations

```json
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
  }
}
```

#### Playwright
**When:** Needs browser automation, web testing, interaction via accessibility tree

```json
{
  "playwright": {
    "command": "npx",
    "args": ["-y", "@playwright/mcp@latest"]
  }
}
```

### Runtime-Specific Wrapper Examples

Standard MCP runtimes (`mcpServers`):

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

OpenCode (`mcp` + `type: "local"` + command array):

```json
{
  "mcp": {
    "filesystem": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

GitHub Copilot (`servers` + `type: "stdio"`):

```json
{
  "servers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

Codex app (`.codex/config.toml` + `mcp_servers` TOML tables):

```toml
[mcp_servers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "."]

[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
env_vars = ["GITHUB_TOKEN"]
```

For GitHub Copilot, convert credential placeholders from `${VAR}` to `${env:VAR}` in the final config file. For OpenCode, use `environment` instead of `env` when the server requires credentials. For Codex app, convert credential placeholders from `${VAR}` to `env_vars = ["VAR"]`; only literal values belong under `[mcp_servers.<server>.env]`.

---
