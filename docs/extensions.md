[← Security](security.md) · [Back to README](../README.md) · [Configuration →](configuration.md)

# Extensions

Extensions let third-party developers add new capabilities to AI Factory — custom CLI commands, MCP servers, skill injections, agent definitions, and more. Extensions survive `ai-factory update` (injections are automatically re-applied after skills are refreshed).

## For Users

### Installing an Extension

```bash
# From a local directory
ai-factory extension add ./my-extension

# From a git repository
ai-factory extension add https://github.com/user/aif-ext-example.git

# From npm
ai-factory extension add aif-ext-example
```

### Managing Extensions

```bash
# List installed extensions
ai-factory extension list

# Update extensions from their sources
ai-factory extension update

# Update a specific extension
ai-factory extension update aif-ext-example

# Force refresh even if version unchanged
ai-factory extension update --force

# Remove an extension (cleans up injections, MCP servers, and files)
ai-factory extension remove aif-ext-example
```

### What Happens on Install

1. Extension files are copied to `.ai-factory/extensions/<name>/`
2. Extension is recorded in `.ai-factory.json` under `extensions`
3. Extension skills (from `skills`) are installed into configured agents
4. Injections are applied to matching skill files (e.g. appending extra instructions to `/aif-implement`)
5. MCP servers are merged into each agent's settings file (e.g. `.mcp.json`)
6. Custom CLI commands become available immediately

### What Happens on Update

Running `ai-factory update`:

1. **Self-update check** — prompts to update the CLI if a newer version exists
2. **Extension refresh** — checks installed extensions for updates from their sources:
   - npm packages: queries registry for latest version
   - GitHub repos: fetches `extension.json` via GitHub API (faster than cloning)
   - Local paths: requires `--force` to refresh
   - Extensions with unchanged versions are skipped
3. **Base skill update** — updates installed base skills, reports per-agent status (`changed`, `unchanged`, `skipped`, `removed`)
4. **Reinstall replacement skills** — re-installs skills from extension manifests
5. **Re-apply injections** — re-applies all extension injections automatically

`ai-factory update --force` forces a clean reinstall of base skills AND forces extension refresh regardless of version changes.

#### Extension Update Behavior

| Source Type | Version Check | `--force` Behavior |
|-------------|---------------|-------------------|
| npm | Registry lookup, skip if unchanged | Always re-download |
| GitHub | API fetch of `extension.json`, skip if unchanged | Always re-clone |
| GitLab / other git | Requires `--force` | Always re-clone |
| Local path | Requires `--force` | Re-copy from source |

#### GitHub API Rate Limits

GitHub API requests use `GITHUB_TOKEN` if present (5000 req/hr). Without a token, you're limited to 60 req/hr. If rate-limited, the extension refresh is skipped with a warning — the broader `update` continues.

```bash
# Set GITHUB_TOKEN for higher rate limits
export GITHUB_TOKEN=ghp_xxxx
ai-factory update
```

### Updating Extensions Separately

Use `ai-factory extension update` to refresh extensions without updating base skills:

```bash
# Update all extensions
ai-factory extension update

# Update a specific extension
ai-factory extension update aif-ext-example

# Force refresh regardless of version
ai-factory extension update --force
```

The command outputs per-extension status:

```
✓ aif-ext-example: v1.0.0 → v1.1.0
- aif-ext-other: v1.0.0 (unchanged)
⚠ aif-ext-local: source type requires --force

Summary:
  Updated: 1
  Unchanged: 1
  Skipped: 1
```

### What Happens on Remove

1. Injection markers are stripped from all skill files
2. MCP server entries are removed from agent settings files
3. Extension directory is deleted from `.ai-factory/extensions/`
4. Extension record is removed from `.ai-factory.json`

---

## For Developers

### Extension Structure

An extension is a directory (or npm package, or git repo) with `extension.json` in the root:

```
my-extension/
├── extension.json          # Manifest (required)
├── package.json            # Required for npm packages
├── commands/               # Custom CLI commands
│   └── hello.js
├── injections/             # Content to inject into existing skills
│   └── implement-extra.md
├── skills/                 # Custom and replacement skills
│   ├── my-skill/
│   │   └── SKILL.md
│   └── my-commit/          # Replaces built-in aif-commit
│       └── SKILL.md
└── mcp/                    # MCP server templates
    └── my-server.json
```

> **Note:** If you plan to publish your extension as an **npm package**, you must include a `package.json` alongside `extension.json`. The `npm pack` command used during installation requires it. A minimal `package.json` is sufficient:
>
> ```json
> {
>   "name": "aif-ext-example",
>   "version": "1.0.0",
>   "description": "Example extension",
>   "type": "module"
> }
> ```
>
> For local directory and git sources, only `extension.json` is required.

### Manifest: `extension.json`

```json
{
  "name": "aif-ext-example",
  "version": "1.0.0",
  "description": "Example extension",
  "commands": [
    {
      "name": "hello",
      "description": "Say hello",
      "module": "./commands/hello.js"
    }
  ],
  "agents": [
    {
      "id": "my-agent",
      "displayName": "My Agent",
      "configDir": ".my-agent",
      "skillsDir": ".my-agent/skills",
      "settingsFile": null,
      "supportsMcp": false,
      "skillsCliAgent": null
    }
  ],
  "injections": [
    {
      "target": "aif-implement",
      "position": "append",
      "file": "./injections/implement-extra.md"
    }
  ],
  "skills": [
    "skills/my-skill",
    "skills/my-commit"
  ],
  "replaces": {
    "skills/my-commit": "aif-commit"
  },
  "mcpServers": [
    {
      "key": "my-server",
      "template": "./mcp/my-server.json",
      "instruction": "My Server: Set MY_API_KEY environment variable"
    }
  ]
}
```

Only `name` and `version` are required. All other fields are optional.

### Manifest Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | **Required.** Unique extension name. Allowed characters: letters, digits, `_`, `-`, `.`, `@`, `/`. No `..` or absolute paths. |
| `version` | `string` | **Required.** Version string (SemVer is recommended). |
| `description` | `string` | Human-readable description. |
| `commands` | `array` | CLI commands to register. |
| `agents` | `array` | Agent definitions (id, directories, MCP support). |
| `injections` | `array` | Content to inject into existing skill files. |
| `skills` | `array` | Paths to skill directories within the extension. |
| `replaces` | `object` | Maps extension skill paths to base skill names they replace (e.g. `{"skills/my-commit": "aif-commit"}`). |
| `mcpServers` | `array` | MCP server configurations to merge into agent settings. |

---

### Commands

A command module is a JavaScript (ESM) file that exports a `register` function receiving the [Commander.js](https://github.com/tj/commander.js) `program` instance:

```javascript
// commands/hello.js
export function register(program) {
  program
    .command('hello')
    .description('Say hello from my extension')
    .option('--name <name>', 'Name to greet', 'World')
    .action((opts) => {
      console.log(`Hello, ${opts.name}!`);
    });
}
```

After installation, the command is available as:

```bash
ai-factory hello
ai-factory hello --name Alice
```

Commands are loaded dynamically at CLI startup. A broken command module won't crash the CLI — it will log a warning to stderr and continue.

---

### Injections

Injections append or prepend content to existing skill files. This lets extensions augment built-in workflows without replacing them entirely.

#### Injection Definition

```json
{
  "target": "aif-implement",
  "position": "append",
  "file": "./injections/implement-extra.md"
}
```

| Field | Values | Description |
|-------|--------|-------------|
| `target` | Any skill name | The skill to inject into (e.g. `aif-implement`, `aif-commit`, `aif-plan`). |
| `position` | `append` or `prepend` | Where to insert the content. `prepend` inserts after YAML frontmatter. |
| `file` | Relative path | Path to the markdown file within the extension directory. |

#### How Injections Work

Injected content is wrapped in HTML comment markers for tracking:

```markdown
<!-- aif-ext:my-extension:aif-implement:append:start -->
Your injected content here.
<!-- aif-ext:my-extension:aif-implement:append:end -->
```

These markers enable:
- **Idempotent application** — re-installing the same extension won't duplicate content
- **Clean removal** — `extension remove` strips exactly the injected blocks
- **Update survival** — `ai-factory update` overwrites base skills, then re-applies all injections

#### Example Injection File

```markdown
## Post-Implementation Checklist (from my-extension)

After completing each task:
1. Run the linter: `npm run lint`
2. Check for console.log statements left in production code
3. Verify error messages are user-friendly
```

---

### MCP Servers

Extensions can provide MCP (Model Context Protocol) server configurations that are automatically merged into each agent's settings file.

#### MCP Server Definition

```json
{
  "key": "my-server",
  "template": "./mcp/my-server.json",
  "instruction": "My Server: Set MY_API_KEY environment variable"
}
```

| Field | Description |
|-------|-------------|
| `key` | Unique key for the MCP server entry in the agent's settings. |
| `template` | Path to a JSON template file within the extension directory. |
| `instruction` | Optional. Shown to the user after installation (e.g. what env vars to set). |

#### MCP Template Format

Same format as built-in MCP templates:

```json
{
  "command": "npx",
  "args": ["-y", "@my-org/my-mcp-server"],
  "env": {
    "MY_API_KEY": "${MY_API_KEY}"
  }
}
```

The template is merged into the agent's settings file under `mcpServers.<key>` (or `servers.<key>` for GitHub Copilot, `mcp.<key>` for OpenCode). Only agents with `supportsMcp: true` are configured. On `extension remove`, the key is deleted from the settings file.

---

### Agents

Extensions can declare new agent configurations. These are currently stored in the manifest and shown during installation. Agent integration with the interactive wizard (`ai-factory init`) is planned for a future release.

```json
{
  "id": "my-agent",
  "displayName": "My Agent",
  "configDir": ".my-agent",
  "skillsDir": ".my-agent/skills",
  "settingsFile": ".my-agent/mcp.json",
  "supportsMcp": true,
  "skillsCliAgent": "my-agent"
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique agent identifier (used in config and CLI). |
| `displayName` | Human-readable name shown in prompts. |
| `configDir` | Directory for agent configuration (e.g. `.my-agent`). |
| `skillsDir` | Where skills are installed (e.g. `.my-agent/skills`). |
| `settingsFile` | Path to the agent's MCP settings file, or `null`. |
| `supportsMcp` | Whether this agent supports MCP server configuration. |
| `skillsCliAgent` | Value for `--agent` flag in skills CLI, or `null`. |

---

### Skills

Extensions can bundle custom skills. List them in the manifest `skills` array as relative paths:

```json
{
  "skills": ["skills/my-custom-skill"]
}
```

Each skill follows the standard [Agent Skills](https://agentskills.io) format — a directory with `SKILL.md`:

```
skills/my-custom-skill/
└── SKILL.md
```

On `ai-factory extension add`, these skills are installed into each configured agent's skills directory (using the same agent transformer logic as built-in skills). The original extension copy remains in `.ai-factory/extensions/<name>/`.

### Skill Replacements

Extensions can replace built-in skills with their own versions using the `replaces` field. This maps extension skill paths to the base skill names they replace:

```json
{
  "skills": ["skills/my-commit"],
  "replaces": {
    "skills/my-commit": "aif-commit"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `replaces` | `Record<string, string>` | Maps extension skill path (from `skills` array) to the base skill name it replaces. |

#### How Replacements Work

The replacement skill is installed **under the base skill name**. For example, `skills/my-commit` from the extension will be installed as `aif-commit/SKILL.md` in the agent's skills directory. The user still invokes `/aif-commit` — but the content comes from the extension.

**On install** (`extension add`):
1. The extension skill overwrites the base skill directory (installed under the base name)
2. The replacement is recorded in `.ai-factory.json`

**On update** (`ai-factory update`):
1. Replaced base skills are **skipped** during reinstallation
2. Extension replacement skills are re-installed from `.ai-factory/extensions/`
3. If the extension manifest is missing/broken, the base skill is **restored** automatically

**On remove** (`extension remove`):
1. The replacement skill is removed (by its base name)
2. The original base skill is **restored** — unless another extension still replaces it

#### Example

An extension that replaces `aif-commit` with a custom commit workflow:

```
my-extension/
├── extension.json
└── skills/
    └── my-commit/
        └── SKILL.md
```

```json
{
  "name": "aif-ext-custom-commit",
  "version": "1.0.0",
  "skills": ["skills/my-commit"],
  "replaces": {
    "skills/my-commit": "aif-commit"
  }
}
```

After installation, the extension's `my-commit/SKILL.md` is installed as `aif-commit/SKILL.md`. The user invokes `/aif-commit` as before — the replacement is transparent.

---

## Storage Layout

```
your-project/
├── .ai-factory/
│   ├── extensions/
│   │   └── aif-ext-example/        # Installed extension
│   │       ├── extension.json
│   │       ├── commands/
│   │       ├── injections/
│   │       ├── skills/
│   │       └── mcp/
│   └── ...
├── .ai-factory.json                 # extensions[] array tracks installed extensions
└── .mcp.json                        # MCP servers merged here (for Claude Code)
```

Extensions are stored in `.ai-factory/extensions/` — this keeps them separate from the project's package system and works with any language (Python, Go, Rust, etc.).

## Config Format

Extensions are tracked in `.ai-factory.json`:

```json
{
  "version": "2.2.0",
  "agents": [...],
  "extensions": [
    {
      "name": "aif-ext-example",
      "source": "https://github.com/user/aif-ext-example.git",
      "version": "1.0.0"
    }
  ]
}
```

---

## Security Considerations

- **Extension names are validated** — names containing `..`, absolute paths, or special characters are rejected to prevent path traversal.
- **Only registered extensions are loaded** — extensions must be listed in `.ai-factory.json` to have their commands executed. A rogue directory in `.ai-factory/extensions/` is ignored.
- **Shell commands use argument arrays** — `git clone` and `npm pack` use `execFileSync` (no shell interpolation) to prevent command injection via malicious source URLs.
- **Extensions execute code** — command modules are dynamically imported. Only install extensions you trust, just as you would with npm packages.

## Community Extensions

Extensions built by the community. To add yours, submit a PR to this file.

| Extension | Description | Install |
|-----------|-------------|---------|
| [Remote Skills](https://github.com/dealenx/ai-factory-extension-remote-skills) | Install and manage skills from GitHub repositories. Supports branch selection, interactive removal, and sync with active agents. | `ai-factory extension add https://github.com/dealenx/ai-factory-extension-remote-skills.git` |
| [AIF Extension Creator](https://github.com/dealenx/ai-factory-extension-aif-extension-creator-skill) |An AI Factory extension that provides an interactive skill for scaffolding new AI Factory extensions. | `ai-factory extension add https://github.com/dealenx/ai-factory-extension-aif-extension-creator-skill.git` |

## See Also

- [Configuration](configuration.md) — `.ai-factory.json` format, MCP servers, project structure
- [Core Skills](skills.md) — all built-in slash commands
- [Security](security.md) — two-level security scanning for external skills
