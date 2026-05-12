#!/bin/bash
# Smoke tests: validates ai-factory init for bundled and extension agent files

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$ROOT_DIR/scripts/test-extension-fixtures.sh"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

PROJECT_DIR="$TMPDIR/init-smoke-claude"
mkdir -p "$PROJECT_DIR"

# Ensure dist/ is up to date for CLI smoke tests.
(cd "$ROOT_DIR" && npm run build > /dev/null)

assert_contains() {
  local file="$1"
  local pattern="$2"
  local hint="$3"
  if ! grep -qE "$pattern" "$file"; then
    echo "Assertion failed: $hint"
    echo "Pattern: $pattern"
    echo "--- output ---"
    cat "$file"
    echo "--------------"
    exit 1
  fi
}

assert_exists() {
  local path="$1"
  local hint="$2"
  if [[ ! -e "$path" ]]; then
    echo "Assertion failed: $hint"
    echo "Missing path: $path"
    exit 1
  fi
}

assert_not_exists() {
  local path="$1"
  local hint="$2"
  if [[ -e "$path" ]]; then
    echo "Assertion failed: $hint"
    echo "Unexpected path: $path"
    exit 1
  fi
}

assert_not_contains() {
  local file="$1"
  local pattern="$2"
  local hint="$3"
  if grep -qE "$pattern" "$file"; then
    echo "Assertion failed: $hint"
    echo "Pattern: $pattern"
    echo "--- output ---"
    cat "$file"
    echo "--------------"
    exit 1
  fi
}

INIT_OUTPUT="$TMPDIR/init-claude.log"
EXPECTED_AGENT_FILES=$(find "$ROOT_DIR/subagents/claude/agents" -type f | wc -l | tr -d ' ')

AIF_TEST_ROOT_DIR="$ROOT_DIR" AIF_TEST_PROJECT_DIR="$PROJECT_DIR" node --input-type=module > "$INIT_OUTPUT" 2>&1 <<'EOF'
import inquirer from 'inquirer';
import path from 'path';
import { pathToFileURL } from 'url';

const promptQueue = [
  { selectedAgents: ['claude'], selectedSkills: ['aif'] },
  { configureMcp: false },
];

const originalPrompt = inquirer.prompt.bind(inquirer);
inquirer.prompt = async (questions) => {
  const next = promptQueue.shift();
  if (!next) {
    throw new Error(`Unexpected prompt: ${JSON.stringify(questions)}`);
  }
  return next;
};

process.chdir(process.env.AIF_TEST_PROJECT_DIR);

const moduleUrl = pathToFileURL(path.join(process.env.AIF_TEST_ROOT_DIR, 'dist/cli/commands/init.js')).href;
const { initCommand } = await import(moduleUrl);

try {
  await initCommand();
} finally {
  inquirer.prompt = originalPrompt;
}
EOF

assert_contains "$INIT_OUTPUT" "Claude Code:" "Claude Code summary must be printed"
assert_contains "$INIT_OUTPUT" "Agent files directory:" "Claude init summary must include agent files directory"
assert_contains "$INIT_OUTPUT" "Installed agent files: ${EXPECTED_AGENT_FILES}" "Claude init summary must report installed agent files"
assert_exists "$PROJECT_DIR/.claude/agents/best-practices-sidecar.md" "Claude init must install best-practices sidecar"
assert_exists "$PROJECT_DIR/.claude/agents/commit-preparer.md" "Claude init must install commit preparer"
assert_exists "$PROJECT_DIR/.claude/agents/docs-auditor.md" "Claude init must install docs auditor"
assert_exists "$PROJECT_DIR/.claude/agents/implement-worker.md" "Claude init must install implement worker"
assert_exists "$PROJECT_DIR/.claude/agents/loop-orchestrator.md" "Claude init must install bundled agent files"
assert_exists "$PROJECT_DIR/.claude/agents/plan-polisher.md" "Claude init must install planning agent"
assert_exists "$PROJECT_DIR/.claude/agents/review-sidecar.md" "Claude init must install review sidecar"
assert_exists "$PROJECT_DIR/.claude/agents/rules-sidecar.md" "Claude init must install rules sidecar"
assert_exists "$PROJECT_DIR/.claude/agents/security-sidecar.md" "Claude init must install security sidecar"

ACTUAL_AGENT_FILES=$(find "$PROJECT_DIR/.claude/agents" -type f | wc -l | tr -d ' ')
if [[ "$ACTUAL_AGENT_FILES" != "$EXPECTED_AGENT_FILES" ]]; then
  echo "Assertion failed: Claude init must install all bundled agent files"
  echo "Expected agent files: $EXPECTED_AGENT_FILES"
  echo "Actual agent files: $ACTUAL_AGENT_FILES"
  exit 1
fi

EXPECTED_AGENT_FILES="$EXPECTED_AGENT_FILES" node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];const expected=Number(process.env.EXPECTED_AGENT_FILES);if(a.id!=='claude')process.exit(1);if(a.agentsDir!=='.claude/agents')process.exit(1);if(!Array.isArray(a.installedAgentFiles)||a.installedAgentFiles.length!==expected)process.exit(1);if(!a.installedAgentFiles.includes('best-practices-sidecar.md'))process.exit(1);if(!a.installedAgentFiles.includes('commit-preparer.md'))process.exit(1);if(!a.installedAgentFiles.includes('docs-auditor.md'))process.exit(1);if(!a.installedAgentFiles.includes('implement-worker.md'))process.exit(1);if(!a.installedAgentFiles.includes('loop-orchestrator.md'))process.exit(1);if(!a.installedAgentFiles.includes('plan-polisher.md'))process.exit(1);if(!a.installedAgentFiles.includes('review-sidecar.md'))process.exit(1);if(!a.installedAgentFiles.includes('rules-sidecar.md'))process.exit(1);if(!a.installedAgentFiles.includes('security-sidecar.md'))process.exit(1);if(!a.managedAgentFiles||Object.keys(a.managedAgentFiles).length!==expected)process.exit(1);if(!a.managedAgentFiles['rules-sidecar.md'])process.exit(1);" "$PROJECT_DIR/.ai-factory.json"

echo "claude init smoke tests passed"

PROJECT_DIR="$TMPDIR/init-smoke-codex"
mkdir -p "$PROJECT_DIR"

CODEX_OUTPUT="$TMPDIR/init-codex.log"
EXPECTED_CODEX_AGENT_FILES=$(find "$ROOT_DIR/subagents/codex/agents" -type f | wc -l | tr -d ' ')

AIF_TEST_ROOT_DIR="$ROOT_DIR" AIF_TEST_PROJECT_DIR="$PROJECT_DIR" node --input-type=module > "$CODEX_OUTPUT" 2>&1 <<'EOF'
import path from 'path';
import { pathToFileURL } from 'url';

process.chdir(process.env.AIF_TEST_PROJECT_DIR);

const moduleUrl = pathToFileURL(path.join(process.env.AIF_TEST_ROOT_DIR, 'dist/cli/commands/init.js')).href;
const { initCommand } = await import(moduleUrl);

await initCommand({
  agents: 'codex',
  skills: 'aif',
});
EOF

assert_contains "$CODEX_OUTPUT" "Codex CLI:" "Codex summary must be printed"
assert_contains "$CODEX_OUTPUT" "Agent files directory:" "Codex init summary must include agent files directory"
assert_contains "$CODEX_OUTPUT" "Installed agent files: ${EXPECTED_CODEX_AGENT_FILES}" "Codex init summary must report installed agent files"
assert_contains "$CODEX_OUTPUT" "Managed config files: 1" "Codex init summary must report managed config file count"
assert_exists "$PROJECT_DIR/.codex/agents/plan-coordinator.toml" "Codex init must install plan coordinator"
assert_exists "$PROJECT_DIR/.codex/agents/implement-coordinator.toml" "Codex init must install implement coordinator"
assert_exists "$PROJECT_DIR/.codex/agents/review-sidecar.toml" "Codex init must install review sidecar"
assert_exists "$PROJECT_DIR/.codex/config.toml" "Codex init must install config.toml"
assert_contains "$PROJECT_DIR/.codex/agents/plan-coordinator.toml" "HANDOFF_MODE" "Codex plan coordinator must be handoff-aware"
assert_contains "$PROJECT_DIR/.codex/agents/plan-coordinator.toml" "HANDOFF_TASK_ID" "Codex plan coordinator must carry handoff task identity guidance"
assert_contains "$PROJECT_DIR/.codex/agents/implement-coordinator.toml" "HANDOFF_SKIP_REVIEW" "Codex implement coordinator must understand handoff skip-review context"
assert_contains "$PROJECT_DIR/.codex/agents/implement-coordinator.toml" "do not perform Handoff MCP sync yourself" "Codex implement coordinator must keep autonomous Handoff sync disabled"
assert_contains "$PROJECT_DIR/.codex/agents/best-practices-sidecar.toml" 'sandbox_mode = "read-only"' "Codex best-practices sidecar must declare read-only sandbox mode"
assert_contains "$PROJECT_DIR/.codex/agents/review-sidecar.toml" "Never perform Handoff MCP sync" "Codex review sidecar must keep Handoff sync coordinator-owned"
assert_contains "$PROJECT_DIR/.codex/agents/review-sidecar.toml" 'sandbox_mode = "read-only"' "Codex review sidecar must declare read-only sandbox mode"
assert_contains "$PROJECT_DIR/.codex/agents/security-sidecar.toml" 'sandbox_mode = "read-only"' "Codex security sidecar must declare read-only sandbox mode"
assert_contains "$PROJECT_DIR/.codex/agents/docs-auditor.toml" 'sandbox_mode = "read-only"' "Codex docs auditor must declare read-only sandbox mode"
assert_contains "$PROJECT_DIR/.codex/agents/commit-preparer.toml" 'sandbox_mode = "read-only"' "Codex commit preparer must declare read-only sandbox mode"

EXPECTED_CODEX_AGENT_FILES="$EXPECTED_CODEX_AGENT_FILES" node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];const expected=Number(process.env.EXPECTED_CODEX_AGENT_FILES);if(a.id!=='codex')process.exit(1);if(a.agentsDir!=='.codex/agents')process.exit(1);if(!Array.isArray(a.installedAgentFiles)||a.installedAgentFiles.length!==expected)process.exit(1);if(!a.managedAgentFiles||!a.managedAgentFiles['plan-coordinator.toml'])process.exit(1);if(!a.configFiles||a.configFiles[0]!=='config.toml')process.exit(1);if(!a.installedConfigFiles||a.installedConfigFiles[0]!=='config.toml')process.exit(1);if(!a.managedConfigFiles||!a.managedConfigFiles['config.toml'])process.exit(1);" "$PROJECT_DIR/.ai-factory.json"

echo "codex init smoke tests passed"

CODEX_USER_CONFIG_INIT_PROJECT_DIR="$TMPDIR/init-smoke-codex-user-config"
mkdir -p "$CODEX_USER_CONFIG_INIT_PROJECT_DIR/.codex"

cat > "$CODEX_USER_CONFIG_INIT_PROJECT_DIR/.codex/config.toml" << 'EOF'
[user]
keep = true
EOF

(cd "$CODEX_USER_CONFIG_INIT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" init --agents codex --skills aif > "$TMPDIR/init-codex-user-config.log" 2>&1)
assert_contains "$TMPDIR/init-codex-user-config.log" "Existing untracked config file \"config\\.toml\" detected" "Codex init must warn when preserving pre-existing untracked config"
assert_contains "$TMPDIR/init-codex-user-config.log" "Managed config files: 0" "Codex init must not mark preserved user config as managed"
assert_contains "$CODEX_USER_CONFIG_INIT_PROJECT_DIR/.codex/config.toml" "\\[user\\]" "Codex init must preserve pre-existing user config"
assert_contains "$CODEX_USER_CONFIG_INIT_PROJECT_DIR/.codex/config.toml" "keep = true" "Codex init must preserve pre-existing user config content"
assert_not_contains "$CODEX_USER_CONFIG_INIT_PROJECT_DIR/.codex/config.toml" "\\[agents\\]" "Codex init must not overwrite user config with managed defaults"
EXPECTED_CODEX_AGENT_FILES="$EXPECTED_CODEX_AGENT_FILES" node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];const expected=Number(process.env.EXPECTED_CODEX_AGENT_FILES);if(a.id!=='codex')process.exit(1);if(!Array.isArray(a.installedAgentFiles)||a.installedAgentFiles.length!==expected)process.exit(1);if(!a.configFiles||a.configFiles[0]!=='config.toml')process.exit(1);if(Array.isArray(a.installedConfigFiles)&&a.installedConfigFiles.includes('config.toml'))process.exit(1);if(a.managedConfigFiles&&a.managedConfigFiles['config.toml'])process.exit(1);" "$CODEX_USER_CONFIG_INIT_PROJECT_DIR/.ai-factory.json"

echo "codex user-owned config init smoke tests passed"

PROJECT_DIR="$TMPDIR/init-smoke-claude-codex"
mkdir -p "$PROJECT_DIR"

COMBINED_OUTPUT="$TMPDIR/init-claude-codex.log"

AIF_TEST_ROOT_DIR="$ROOT_DIR" AIF_TEST_PROJECT_DIR="$PROJECT_DIR" node --input-type=module > "$COMBINED_OUTPUT" 2>&1 <<'EOF'
import path from 'path';
import { pathToFileURL } from 'url';

process.chdir(process.env.AIF_TEST_PROJECT_DIR);

const moduleUrl = pathToFileURL(path.join(process.env.AIF_TEST_ROOT_DIR, 'dist/cli/commands/init.js')).href;
const { initCommand } = await import(moduleUrl);

await initCommand({
  agents: 'claude,codex',
  skills: 'aif',
});
EOF

assert_exists "$PROJECT_DIR/.claude/agents/plan-polisher.md" "Combined init must install Claude agent files"
assert_exists "$PROJECT_DIR/.codex/agents/plan-polisher.toml" "Combined init must install Codex agent files"
assert_exists "$PROJECT_DIR/.codex/config.toml" "Combined init must install Codex config"
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(!Array.isArray(c.agents)||c.agents.length!==2)process.exit(1);const ids=c.agents.map(a=>a.id).sort();if(ids.join(',')!=='claude,codex')process.exit(1);" "$PROJECT_DIR/.ai-factory.json"

echo "combined init smoke tests passed"

PROJECT_DIR="$TMPDIR/init-smoke-deselect-codex"
mkdir -p "$PROJECT_DIR"

DESELECT_OUTPUT="$TMPDIR/init-deselect-codex.log"

AIF_TEST_ROOT_DIR="$ROOT_DIR" AIF_TEST_PROJECT_DIR="$PROJECT_DIR" node --input-type=module > /dev/null 2>&1 <<'EOF'
import path from 'path';
import { pathToFileURL } from 'url';

process.chdir(process.env.AIF_TEST_PROJECT_DIR);

const moduleUrl = pathToFileURL(path.join(process.env.AIF_TEST_ROOT_DIR, 'dist/cli/commands/init.js')).href;
const { initCommand } = await import(moduleUrl);

await initCommand({
  agents: 'codex',
  skills: 'aif',
});
EOF

assert_exists "$PROJECT_DIR/.codex/agents/plan-coordinator.toml" "Codex setup must exist before deselect cleanup"
assert_exists "$PROJECT_DIR/.codex/config.toml" "Codex config must exist before deselect cleanup"
cat > "$PROJECT_DIR/SHOULD_NOT_DELETE.toml" << 'EOF'
keep-me
EOF
node -e "const fs=require('fs');const p=process.argv[1];const c=JSON.parse(fs.readFileSync(p,'utf8'));const a=c.agents.find(agent=>agent.id==='codex');a.installedConfigFiles=['config.toml','../SHOULD_NOT_DELETE.toml'];fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');" "$PROJECT_DIR/.ai-factory.json"

AIF_TEST_ROOT_DIR="$ROOT_DIR" AIF_TEST_PROJECT_DIR="$PROJECT_DIR" node --input-type=module > "$DESELECT_OUTPUT" 2>&1 <<'EOF'
import path from 'path';
import { pathToFileURL } from 'url';

process.chdir(process.env.AIF_TEST_PROJECT_DIR);

const moduleUrl = pathToFileURL(path.join(process.env.AIF_TEST_ROOT_DIR, 'dist/cli/commands/init.js')).href;
const { initCommand } = await import(moduleUrl);

await initCommand({
  agents: 'claude',
  skills: 'aif',
});
EOF

assert_contains "$DESELECT_OUTPUT" "Removed: codex" "Deselected Codex agent should be reported"
assert_contains "$DESELECT_OUTPUT" "Skipping unsafe managed config file path \"\\.\\./SHOULD_NOT_DELETE\\.toml\"" "Unsafe Codex managed config path should be skipped with warning"
assert_exists "$PROJECT_DIR/.claude/agents/plan-polisher.md" "Claude setup should remain after deselecting Codex"
assert_not_exists "$PROJECT_DIR/.codex/agents/plan-coordinator.toml" "Deselected Codex managed agents must be removed"
assert_not_exists "$PROJECT_DIR/.codex/config.toml" "Deselected Codex managed config must be removed"
assert_exists "$PROJECT_DIR/SHOULD_NOT_DELETE.toml" "Unsafe managed config path must not remove files outside Codex config dir"
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(c.agents.length!==1)process.exit(1);if(c.agents[0].id!=='claude')process.exit(1);" "$PROJECT_DIR/.ai-factory.json"

echo "codex deselect cleanup smoke tests passed"

# -------------------------------------------------------------------
# Flat workflow install smoke: flat agents must receive references/
# assets for workflow skills so helper scripts remain available after
# installation.
# -------------------------------------------------------------------

FLAT_PROJECT_DIR="$TMPDIR/init-smoke-antigravity"
mkdir -p "$FLAT_PROJECT_DIR"

(cd "$FLAT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" init --agents antigravity --skills aif,aif-rules-check > "$TMPDIR/init-antigravity.log" 2>&1)

assert_exists "$FLAT_PROJECT_DIR/.agent/workflows/aif.md" "antigravity init must install aif as a flat workflow"
assert_exists "$FLAT_PROJECT_DIR/.agent/workflows/aif-rules-check.md" "antigravity init must install aif-rules-check as a flat workflow"
assert_exists "$FLAT_PROJECT_DIR/.agent/workflows/references/update-config.mjs" "flat workflow installs must include the config helper in references/"
assert_exists "$FLAT_PROJECT_DIR/.agent/workflows/references/config-template.yaml" "flat workflow installs must include config template references"
assert_exists "$FLAT_PROJECT_DIR/.agent/workflows/references/RULES-CHECK-CONTRACT.md" "flat workflow installs must include rules-check references"
assert_not_exists "$FLAT_PROJECT_DIR/.agent/skills/aif-rules-check" "workflow-classified skills must not remain under .agent/skills/"

echo "flat workflow init smoke tests passed"

# -------------------------------------------------------------------
# Codex app skills smoke: Codex app uses the repository skills location
# with Codex-style $aif invocations, while Universal remains unchanged.
# -------------------------------------------------------------------

CODEX_APP_PROJECT_DIR="$TMPDIR/init-smoke-codex-app"
mkdir -p "$CODEX_APP_PROJECT_DIR"

(cd "$CODEX_APP_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" init --agents codex-app --skills aif,aif-plan > "$TMPDIR/init-codex-app.log" 2>&1)

assert_contains "$TMPDIR/init-codex-app.log" "Codex app:" "Codex app summary must be printed"
assert_exists "$CODEX_APP_PROJECT_DIR/.agents/skills/aif/SKILL.md" "Codex app must install aif into repo skills"
assert_exists "$CODEX_APP_PROJECT_DIR/.agents/skills/aif-plan/SKILL.md" "Codex app must install aif-plan into repo skills"
assert_contains "$CODEX_APP_PROJECT_DIR/.agents/skills/aif/SKILL.md" '\$aif-skill-generator' "Codex app skills must use Codex $ invocation"
assert_not_contains "$CODEX_APP_PROJECT_DIR/.agents/skills/aif/SKILL.md" '(^|[^$])`/aif-skill-generator`' "Codex app skills must not keep slash invocation examples"
assert_contains "$CODEX_APP_PROJECT_DIR/.agents/skills/aif/SKILL.md" '~/.agents/skills/aif-skill-generator/scripts/security-scan\.py' "Codex app transformer must not rewrite skill directory paths"
assert_contains "$CODEX_APP_PROJECT_DIR/.agents/skills/aif/SKILL.md" '\.\./aif-skill-generator/SKILL\.md' "Codex app transformer must not rewrite relative markdown links"
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];if(a.id!=='codex-app')process.exit(1);if(a.skillsDir!=='.agents/skills')process.exit(1);if(a.agentsDir)process.exit(1);" "$CODEX_APP_PROJECT_DIR/.ai-factory.json"

CODEX_APP_MCP_PROJECT_DIR="$TMPDIR/init-smoke-codex-app-mcp"
mkdir -p "$CODEX_APP_MCP_PROJECT_DIR"

(cd "$CODEX_APP_MCP_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" init --agents codex-app --skills aif --mcp filesystem,playwright,github > "$TMPDIR/init-codex-app-mcp.log" 2>&1)

assert_exists "$CODEX_APP_MCP_PROJECT_DIR/.codex/config.toml" "Codex app MCP init must write project config.toml"
assert_contains "$CODEX_APP_MCP_PROJECT_DIR/.codex/config.toml" '^\[mcp_servers\.filesystem\]$' "Codex app MCP init must write filesystem server table"
assert_contains "$CODEX_APP_MCP_PROJECT_DIR/.codex/config.toml" 'args = \["-y", "@modelcontextprotocol/server-filesystem", "\."\]' "Codex app filesystem MCP args must be TOML array syntax"
assert_contains "$CODEX_APP_MCP_PROJECT_DIR/.codex/config.toml" '^\[mcp_servers\.playwright\]$' "Codex app MCP init must write playwright server table"
assert_contains "$CODEX_APP_MCP_PROJECT_DIR/.codex/config.toml" '^\[mcp_servers\.github\]$' "Codex app MCP init must write github server table"
assert_contains "$CODEX_APP_MCP_PROJECT_DIR/.codex/config.toml" 'env_vars = \["GITHUB_TOKEN"\]' "Codex app MCP env references must become env_vars"
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];if(a.id!=='codex-app')process.exit(1);if(a.mcp.github!==true||a.mcp.filesystem!==true||a.mcp.playwright!==true)process.exit(1);" "$CODEX_APP_MCP_PROJECT_DIR/.ai-factory.json"

UNIVERSAL_PROJECT_DIR="$TMPDIR/init-smoke-universal"
mkdir -p "$UNIVERSAL_PROJECT_DIR"

(cd "$UNIVERSAL_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" init --agents universal --skills aif > "$TMPDIR/init-universal.log" 2>&1)
assert_exists "$UNIVERSAL_PROJECT_DIR/.agents/skills/aif/SKILL.md" "Universal must still install aif into repo skills"
assert_contains "$UNIVERSAL_PROJECT_DIR/.agents/skills/aif/SKILL.md" '`/aif-skill-generator`' "Universal must keep slash invocation examples"

CONFLICT_PROJECT_DIR="$TMPDIR/init-smoke-codex-app-universal-conflict"
mkdir -p "$CONFLICT_PROJECT_DIR"
if (cd "$CONFLICT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" init --agents universal,codex-app --skills aif > "$TMPDIR/init-codex-app-conflict.log" 2>&1); then
  echo "Assertion failed: universal and codex-app must not be allowed to share .agents/skills"
  cat "$TMPDIR/init-codex-app-conflict.log"
  exit 1
fi
assert_contains "$TMPDIR/init-codex-app-conflict.log" "universal, codex-app" "conflict error must include both runtime ids"
assert_contains "$TMPDIR/init-codex-app-conflict.log" "\.agents/skills" "conflict error must include the shared skillsDir"
if grep -Eq '^[[:space:]]+at ' "$TMPDIR/init-codex-app-conflict.log"; then
  echo "Assertion failed: conflict error must not print a stack trace"
  cat "$TMPDIR/init-codex-app-conflict.log"
  exit 1
fi

INTERACTIVE_CONFLICT_PROJECT_DIR="$TMPDIR/init-smoke-codex-app-universal-interactive-conflict"
mkdir -p "$INTERACTIVE_CONFLICT_PROJECT_DIR"
AIF_TEST_ROOT_DIR="$ROOT_DIR" AIF_TEST_PROJECT_DIR="$INTERACTIVE_CONFLICT_PROJECT_DIR" node --input-type=module > "$TMPDIR/init-codex-app-interactive-conflict.log" 2>&1 <<'EOF'
import inquirer from 'inquirer';
import path from 'path';
import { pathToFileURL } from 'url';

const promptQueue = [
  { selectedAgents: ['universal', 'codex-app'], selectedSkills: ['aif'] },
  { configureMcp: false },
];

const originalPrompt = inquirer.prompt.bind(inquirer);
const originalExit = process.exit;
let exitCode = null;

inquirer.prompt = async (questions) => {
  const next = promptQueue.shift();
  if (!next) {
    throw new Error(`Unexpected prompt: ${JSON.stringify(questions)}`);
  }
  return next;
};
process.exit = (code = 0) => {
  exitCode = code;
  throw new Error(`PROCESS_EXIT:${code}`);
};

process.chdir(process.env.AIF_TEST_PROJECT_DIR);

const moduleUrl = pathToFileURL(path.join(process.env.AIF_TEST_ROOT_DIR, 'dist/cli/commands/init.js')).href;
const { initCommand } = await import(moduleUrl);

try {
  await initCommand();
  throw new Error('initCommand unexpectedly succeeded');
} catch (error) {
  if (!String(error.message).startsWith('PROCESS_EXIT:')) {
    throw error;
  }
  if (exitCode !== 1) {
    throw new Error(`Expected exit code 1, got ${exitCode}`);
  }
} finally {
  inquirer.prompt = originalPrompt;
  process.exit = originalExit;
}
EOF
assert_contains "$TMPDIR/init-codex-app-interactive-conflict.log" "universal, codex-app" "interactive conflict error must include both runtime ids"
assert_contains "$TMPDIR/init-codex-app-interactive-conflict.log" "\.agents/skills" "interactive conflict error must include the shared skillsDir"
if grep -Eq '^[[:space:]]+at ' "$TMPDIR/init-codex-app-interactive-conflict.log"; then
  echo "Assertion failed: interactive conflict error must not print a stack trace"
  cat "$TMPDIR/init-codex-app-interactive-conflict.log"
  exit 1
fi

echo "codex app init smoke tests passed"

# -------------------------------------------------------------------
# Codex app extension MCP smoke: extension-provided MCP servers must
# be added to and removed from Codex project-scoped TOML settings.
# -------------------------------------------------------------------

CODEX_APP_MCP_EXTENSION_DIR="$TMPDIR/codex-app-mcp-extension"
CODEX_APP_MCP_EXTENSION_PROJECT_DIR="$TMPDIR/init-smoke-codex-app-mcp-extension"
mkdir -p "$CODEX_APP_MCP_EXTENSION_DIR" "$CODEX_APP_MCP_EXTENSION_PROJECT_DIR/.codex"

cat > "$CODEX_APP_MCP_EXTENSION_DIR/extension.json" << 'EOF'
{
  "name": "aif-ext-codex-app-mcp",
  "version": "1.0.0",
  "mcpServers": [
    {
      "key": "codex-app-smoke",
      "template": {
        "command": "node",
        "args": ["server.js"],
        "env": {
          "AIF_TOKEN": "${AIF_TOKEN}",
          "AIF_LITERAL": "literal-value",
          "AIF.SCOPE": "literal-scope"
        }
      },
      "instruction": "Set AIF_TOKEN"
    }
  ]
}
EOF

cat > "$CODEX_APP_MCP_EXTENSION_PROJECT_DIR/.codex/config.toml" << 'EOF'
[sandbox_workspace_write]
network_access = false
EOF

(cd "$CODEX_APP_MCP_EXTENSION_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" init --agents codex-app --skills aif > "$TMPDIR/init-codex-app-mcp-extension-base.log" 2>&1)
(cd "$CODEX_APP_MCP_EXTENSION_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" extension add "$CODEX_APP_MCP_EXTENSION_DIR" > "$TMPDIR/init-codex-app-mcp-extension-add.log" 2>&1)

assert_contains "$TMPDIR/init-codex-app-mcp-extension-add.log" "MCP servers configured: codex-app-smoke" "Codex app extension MCP add must report configured server"
assert_contains "$CODEX_APP_MCP_EXTENSION_PROJECT_DIR/.codex/config.toml" '^\[sandbox_workspace_write\]$' "Codex app extension MCP add must preserve unrelated TOML settings"
assert_contains "$CODEX_APP_MCP_EXTENSION_PROJECT_DIR/.codex/config.toml" '^\[mcp_servers\.codex-app-smoke\]$' "Codex app extension MCP add must write server table"
assert_contains "$CODEX_APP_MCP_EXTENSION_PROJECT_DIR/.codex/config.toml" 'command = "node"' "Codex app extension MCP add must write command"
assert_contains "$CODEX_APP_MCP_EXTENSION_PROJECT_DIR/.codex/config.toml" 'args = \["server\.js"\]' "Codex app extension MCP add must write args"
assert_contains "$CODEX_APP_MCP_EXTENSION_PROJECT_DIR/.codex/config.toml" 'env_vars = \["AIF_TOKEN"\]' "Codex app extension MCP add must convert env references"
assert_contains "$CODEX_APP_MCP_EXTENSION_PROJECT_DIR/.codex/config.toml" '^\[mcp_servers\.codex-app-smoke\.env\]$' "Codex app extension MCP add must write literal env table"
assert_contains "$CODEX_APP_MCP_EXTENSION_PROJECT_DIR/.codex/config.toml" 'AIF_LITERAL = "literal-value"' "Codex app extension MCP add must preserve literal env values"
assert_contains "$CODEX_APP_MCP_EXTENSION_PROJECT_DIR/.codex/config.toml" '"AIF\.SCOPE" = "literal-scope"' "Codex app extension MCP add must quote unsafe literal env keys"

cat >> "$CODEX_APP_MCP_EXTENSION_PROJECT_DIR/.codex/config.toml" << 'EOF'

[mcp_servers.codex-app-smoke.tools.search]
approval = "never"

[mcp_servers.unrelated.tools.keep]
approval = "always"
EOF

(cd "$CODEX_APP_MCP_EXTENSION_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" extension remove aif-ext-codex-app-mcp > "$TMPDIR/init-codex-app-mcp-extension-remove.log" 2>&1)
assert_contains "$CODEX_APP_MCP_EXTENSION_PROJECT_DIR/.codex/config.toml" '^\[sandbox_workspace_write\]$' "Codex app extension MCP remove must preserve unrelated TOML settings"
assert_not_contains "$CODEX_APP_MCP_EXTENSION_PROJECT_DIR/.codex/config.toml" 'codex-app-smoke' "Codex app extension MCP remove must remove server tables"
assert_contains "$CODEX_APP_MCP_EXTENSION_PROJECT_DIR/.codex/config.toml" '^\[mcp_servers\.unrelated\.tools\.keep\]$' "Codex app extension MCP remove must preserve unrelated nested TOML tables"

echo "codex app extension MCP smoke tests passed"

# -------------------------------------------------------------------
# Extension agent files + dynamic runtime smoke: init should accept
# extension-defined runtimes in --agents, install agentFiles for
# built-in and dynamic runtimes, refresh them on extension update,
# and block remove while the dynamic runtime is still configured.
# -------------------------------------------------------------------

EXTENSION_DIR="$TMPDIR/runtime-agent-files-extension"
mkdir -p "$EXTENSION_DIR/agent-files/claude" "$EXTENSION_DIR/agent-files/codex" "$EXTENSION_DIR/agent-files/test-runtime"

cat > "$EXTENSION_DIR/extension.json" << 'EOF'
{
  "name": "aif-ext-runtime-agent-files",
  "version": "1.0.0",
  "agents": [
    {
      "id": "test-runtime",
      "displayName": "Test Runtime",
      "configDir": ".test-runtime",
      "skillsDir": ".test-runtime/skills",
      "agentsDir": ".test-runtime/agents",
      "agentFileExtension": ".toml",
      "settingsFile": null,
      "supportsMcp": false,
      "skillsCliAgent": null
    }
  ],
  "agentFiles": [
    {
      "runtime": "claude",
      "source": "agent-files/claude/test-sidecar.md",
      "target": "test-sidecar.md"
    },
    {
      "runtime": "codex",
      "source": "agent-files/codex/test-helper.toml",
      "target": "test-helper.toml"
    },
    {
      "runtime": "test-runtime",
      "source": "agent-files/test-runtime/test-agent.toml",
      "target": "test-agent.toml"
    }
  ]
}
EOF

cat > "$EXTENSION_DIR/agent-files/claude/test-sidecar.md" << 'EOF'
---
name: test-sidecar
description: test extension claude agent file
---
EOF

cat > "$EXTENSION_DIR/agent-files/codex/test-helper.toml" << 'EOF'
name = "test-helper"
description = "test extension codex agent file"
EOF

cat > "$EXTENSION_DIR/agent-files/test-runtime/test-agent.toml" << 'EOF'
name = "test-agent"
description = "test extension dynamic runtime agent file"
EOF

EXT_PROJECT_DIR="$TMPDIR/init-smoke-extension-runtime"
mkdir -p "$EXT_PROJECT_DIR"

(cd "$EXT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" init --agents claude --skills aif > "$TMPDIR/init-ext-base.log" 2>&1)
(cd "$EXT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" extension add "$EXTENSION_DIR" > "$TMPDIR/init-ext-add.log" 2>&1)
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const claude=c.agents.find(a=>a.id==='claude');if(!claude||!Array.isArray(claude.installedAgentFiles)||!claude.installedAgentFiles.includes('test-sidecar.md'))process.exit(1);if(!claude.managedAgentFiles||!claude.managedAgentFiles['test-sidecar.md'])process.exit(1);if(!claude.agentFileSources||claude.agentFileSources['test-sidecar.md']?.kind!=='extension'||claude.agentFileSources['test-sidecar.md']?.extensionName!=='aif-ext-runtime-agent-files')process.exit(1);" "$EXT_PROJECT_DIR/.ai-factory.json"
(cd "$EXT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" init --agents claude,codex,test-runtime --skills aif > "$TMPDIR/init-ext-reinit.log" 2>&1)

assert_exists "$EXT_PROJECT_DIR/.claude/agents/test-sidecar.md" "extension claude agent file must be installed on init"
assert_exists "$EXT_PROJECT_DIR/.codex/agents/test-helper.toml" "extension codex agent file must be installed on init"
assert_exists "$EXT_PROJECT_DIR/.test-runtime/agents/test-agent.toml" "dynamic runtime agent file must be installed on init"

node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const ids=c.agents.map(a=>a.id).sort().join(',');if(ids!=='claude,codex,test-runtime')process.exit(1);const dyn=c.agents.find(a=>a.id==='test-runtime');if(!dyn||dyn.agentsDir!=='.test-runtime/agents')process.exit(1);" "$EXT_PROJECT_DIR/.ai-factory.json"

cat > "$EXTENSION_DIR/extension.json" << 'EOF'
{
  "name": "aif-ext-runtime-agent-files",
  "version": "1.0.1",
  "agents": [
    {
      "id": "test-runtime",
      "displayName": "Test Runtime",
      "configDir": ".test-runtime",
      "skillsDir": ".test-runtime/skills",
      "agentsDir": ".test-runtime/agents",
      "agentFileExtension": ".toml",
      "settingsFile": null,
      "supportsMcp": false,
      "skillsCliAgent": null
    }
  ],
  "agentFiles": [
    {
      "runtime": "claude",
      "source": "agent-files/claude/test-sidecar.md",
      "target": "test-sidecar.md"
    },
    {
      "runtime": "codex",
      "source": "agent-files/codex/test-helper.toml",
      "target": "test-helper.toml"
    },
    {
      "runtime": "test-runtime",
      "source": "agent-files/test-runtime/test-agent.toml",
      "target": "test-agent.toml"
    }
  ]
}
EOF

cat > "$EXTENSION_DIR/agent-files/codex/test-helper.toml" << 'EOF'
name = "test-helper"
description = "updated codex agent file"
EOF

cat > "$EXTENSION_DIR/agent-files/test-runtime/test-agent.toml" << 'EOF'
name = "test-agent"
description = "updated dynamic runtime agent file"
EOF

(cd "$EXT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" extension update --force > "$TMPDIR/init-ext-update.log" 2>&1)
assert_contains "$EXT_PROJECT_DIR/.codex/agents/test-helper.toml" "updated codex agent file" "extension update must refresh codex agent file"
assert_contains "$EXT_PROJECT_DIR/.test-runtime/agents/test-agent.toml" "updated dynamic runtime agent file" "extension update must refresh dynamic runtime agent file"
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const codex=c.agents.find(a=>a.id==='codex');const dyn=c.agents.find(a=>a.id==='test-runtime');if(!codex||!dyn)process.exit(1);if(!Array.isArray(codex.installedAgentFiles)||!codex.installedAgentFiles.includes('test-helper.toml'))process.exit(1);if(!Array.isArray(dyn.installedAgentFiles)||!dyn.installedAgentFiles.includes('test-agent.toml'))process.exit(1);if(!codex.managedAgentFiles||!codex.managedAgentFiles['test-helper.toml'])process.exit(1);if(!dyn.managedAgentFiles||!dyn.managedAgentFiles['test-agent.toml'])process.exit(1);if(!codex.agentFileSources||codex.agentFileSources['test-helper.toml']?.extensionName!=='aif-ext-runtime-agent-files')process.exit(1);if(!dyn.agentFileSources||dyn.agentFileSources['test-agent.toml']?.extensionName!=='aif-ext-runtime-agent-files')process.exit(1);" "$EXT_PROJECT_DIR/.ai-factory.json"

if (cd "$EXT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" extension remove aif-ext-runtime-agent-files > "$TMPDIR/init-ext-remove-blocked.log" 2>&1); then
  echo "Assertion failed: extension remove must be blocked while dynamic runtime is configured"
  cat "$TMPDIR/init-ext-remove-blocked.log"
  exit 1
fi
assert_contains "$TMPDIR/init-ext-remove-blocked.log" "orphan configured runtime" "remove must explain orphan runtime block"

(cd "$EXT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" init --agents claude,codex --skills aif > "$TMPDIR/init-ext-deselect.log" 2>&1)
assert_contains "$TMPDIR/init-ext-deselect.log" "Removed: test-runtime" "deselect must report dynamic runtime removal"
assert_not_exists "$EXT_PROJECT_DIR/.test-runtime/agents/test-agent.toml" "deselect must remove extension-defined runtime agent files"
(cd "$EXT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" extension remove aif-ext-runtime-agent-files > "$TMPDIR/init-ext-remove.log" 2>&1)
assert_not_exists "$EXT_PROJECT_DIR/.claude/agents/test-sidecar.md" "extension claude agent file must be removed"
assert_not_exists "$EXT_PROJECT_DIR/.codex/agents/test-helper.toml" "extension codex agent file must be removed"
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const claude=c.agents.find(a=>a.id==='claude');const codex=c.agents.find(a=>a.id==='codex');if(!claude||!codex)process.exit(1);if((claude.installedAgentFiles||[]).includes('test-sidecar.md'))process.exit(1);if((codex.installedAgentFiles||[]).includes('test-helper.toml'))process.exit(1);if((claude.managedAgentFiles||{})['test-sidecar.md'])process.exit(1);if((codex.managedAgentFiles||{})['test-helper.toml'])process.exit(1);if((claude.agentFileSources||{})['test-sidecar.md'])process.exit(1);if((codex.agentFileSources||{})['test-helper.toml'])process.exit(1);" "$EXT_PROJECT_DIR/.ai-factory.json"

echo "extension agent file init smoke tests passed"

# -------------------------------------------------------------------
# Legacy installed extension smoke: projects that already contain
# pre-validation agentFiles.target aliases must remain operable.
# -------------------------------------------------------------------

LEGACY_ALIAS_EXTENSION_DIR="$TMPDIR/legacy-agent-target-alias-extension"
LEGACY_ALIAS_OTHER_EXTENSION_DIR="$TMPDIR/legacy-agent-target-alias-other-extension"
LEGACY_ALIAS_PROJECT_DIR="$TMPDIR/init-smoke-legacy-agent-target-alias"
mkdir -p "$LEGACY_ALIAS_EXTENSION_DIR/agent-files/codex" "$LEGACY_ALIAS_OTHER_EXTENSION_DIR" "$LEGACY_ALIAS_PROJECT_DIR"

cat > "$LEGACY_ALIAS_EXTENSION_DIR/extension.json" << 'EOF'
{
  "name": "aif-ext-legacy-agent-target-alias",
  "version": "1.0.0",
  "agentFiles": [
    {
      "runtime": "codex",
      "source": "agent-files/codex/legacy-helper.toml",
      "target": "legacy-helper.toml"
    }
  ]
}
EOF

cat > "$LEGACY_ALIAS_EXTENSION_DIR/agent-files/codex/legacy-helper.toml" << 'EOF'
name = "legacy-helper"
description = "legacy alias helper"
EOF

cat > "$LEGACY_ALIAS_OTHER_EXTENSION_DIR/extension.json" << 'EOF'
{
  "name": "aif-ext-legacy-agent-target-alias-other",
  "version": "1.0.0"
}
EOF

(cd "$LEGACY_ALIAS_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" init --agents codex --skills aif > "$TMPDIR/init-legacy-alias-base.log" 2>&1)
(cd "$LEGACY_ALIAS_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" extension add "$LEGACY_ALIAS_EXTENSION_DIR" > "$TMPDIR/init-legacy-alias-add.log" 2>&1)
node -e "const fs=require('fs');const p=process.argv[1];const m=JSON.parse(fs.readFileSync(p,'utf8'));m.agentFiles[0].target='./legacy-helper.toml';fs.writeFileSync(p,JSON.stringify(m,null,2));" "$LEGACY_ALIAS_PROJECT_DIR/.ai-factory/extensions/aif-ext-legacy-agent-target-alias/extension.json"

(cd "$LEGACY_ALIAS_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" extension add "$LEGACY_ALIAS_OTHER_EXTENSION_DIR" > "$TMPDIR/init-legacy-alias-other-add.log" 2>&1)
assert_contains "$TMPDIR/init-legacy-alias-other-add.log" "Normalized legacy extension agentFiles.target alias" "extension add must warn and continue when an installed manifest has a legacy target alias"
assert_exists "$LEGACY_ALIAS_PROJECT_DIR/.codex/agents/legacy-helper.toml" "legacy alias project must keep the installed Codex helper"

node -e "const fs=require('fs');const p=process.argv[1];const m=JSON.parse(fs.readFileSync(p,'utf8'));m.agentFiles[0].target='./legacy-helper.toml';fs.writeFileSync(p,JSON.stringify(m,null,2));" "$LEGACY_ALIAS_PROJECT_DIR/.ai-factory/extensions/aif-ext-legacy-agent-target-alias/extension.json"
(cd "$LEGACY_ALIAS_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" extension update aif-ext-legacy-agent-target-alias --force > "$TMPDIR/init-legacy-alias-update.log" 2>&1)
assert_contains "$TMPDIR/init-legacy-alias-update.log" "Normalized legacy extension agentFiles.target alias" "extension update must warn and continue when the previous installed manifest has a legacy target alias"
assert_contains "$LEGACY_ALIAS_PROJECT_DIR/.ai-factory/extensions/aif-ext-legacy-agent-target-alias/extension.json" "\"target\": \"legacy-helper.toml\"" "extension update must replace the legacy alias with the canonical source manifest"

echo "legacy extension agent file alias smoke tests passed"

# -------------------------------------------------------------------
# Bounded helper extension smoke: init should install a bounded Codex
# helper agent file and inject the canonical /aif-improve companion
# contract into supported runtime skill copies.
# -------------------------------------------------------------------

BOUNDED_EXTENSION_DIR="$TMPDIR/bounded-helper-extension"
BOUNDED_PROJECT_DIR="$TMPDIR/init-smoke-bounded-helper-extension"
create_bounded_helper_extension_fixture "$BOUNDED_EXTENSION_DIR"
mkdir -p "$BOUNDED_PROJECT_DIR"

(cd "$BOUNDED_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" init --agents claude,codex --skills aif,aif-improve > "$TMPDIR/init-bounded-base.log" 2>&1)
(cd "$BOUNDED_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" extension add "$BOUNDED_EXTENSION_DIR" > "$TMPDIR/init-bounded-add.log" 2>&1)
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const codex=c.agents.find(a=>a.id==='codex');if(!codex||!Array.isArray(codex.installedAgentFiles)||!codex.installedAgentFiles.includes('bounded-plan-polisher.toml'))process.exit(1);if(!codex.managedAgentFiles||!codex.managedAgentFiles['bounded-plan-polisher.toml'])process.exit(1);if(!codex.agentFileSources||codex.agentFileSources['bounded-plan-polisher.toml']?.kind!=='extension'||codex.agentFileSources['bounded-plan-polisher.toml']?.extensionName!=='aif-ext-bounded-helpers')process.exit(1);" "$BOUNDED_PROJECT_DIR/.ai-factory.json"
(cd "$BOUNDED_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" init --agents claude,codex --skills aif,aif-improve > "$TMPDIR/init-bounded-reinit.log" 2>&1)

assert_exists "$BOUNDED_PROJECT_DIR/.codex/agents/bounded-plan-polisher.toml" "bounded helper init must install the Codex plan-polisher helper"
assert_contains "$BOUNDED_PROJECT_DIR/.codex/agents/bounded-plan-polisher.toml" "Bounded one-shot worker" "bounded helper description must be installed"
assert_contains "$BOUNDED_PROJECT_DIR/.codex/agents/bounded-plan-polisher.toml" 'model = "gpt-5.4-mini"' "bounded helper must use the bounded mini model"
assert_contains "$BOUNDED_PROJECT_DIR/.codex/agents/bounded-plan-polisher.toml" 'model_reasoning_effort = "medium"' "bounded helper must use canonical reasoning key"
assert_contains "$BOUNDED_PROJECT_DIR/.codex/agents/bounded-plan-polisher.toml" 'sandbox_mode = "read-only"' "bounded helper must declare read-only sandbox mode"
assert_contains "$BOUNDED_PROJECT_DIR/.codex/agents/bounded-plan-polisher.toml" 'developer_instructions = """' "bounded helper must use canonical instructions key"
assert_contains "$BOUNDED_PROJECT_DIR/.codex/agents/bounded-plan-polisher.toml" "advisory only" "bounded helper instructions must describe advisory-only behavior"
assert_contains "$BOUNDED_PROJECT_DIR/.claude/skills/aif-improve/SKILL.md" "canonical refinement command for this extension workflow" "bounded helper init must inject the canonical improve override into Claude skill copies"
assert_contains "$BOUNDED_PROJECT_DIR/.claude/skills/aif-improve/SKILL.md" "runtime-specific delegation prompts" "bounded helper init must inject the runtime warning into Claude skill copies"
assert_contains "$BOUNDED_PROJECT_DIR/.codex/skills/aif-improve/SKILL.md" "canonical refinement command for this extension workflow" "bounded helper init must inject the canonical improve override into Codex skill copies"
assert_contains "$BOUNDED_PROJECT_DIR/.codex/skills/aif-improve/SKILL.md" "runtime-specific delegation prompts" "bounded helper init must inject the runtime warning into Codex skill copies"

node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const codex=c.agents.find(a=>a.id==='codex');if(!codex||codex.agentsDir!=='.codex/agents')process.exit(1);if(!Array.isArray(codex.installedAgentFiles)||!codex.installedAgentFiles.includes('bounded-plan-polisher.toml'))process.exit(1);if(!codex.managedAgentFiles||!codex.managedAgentFiles['bounded-plan-polisher.toml'])process.exit(1);if(!codex.agentFileSources||codex.agentFileSources['bounded-plan-polisher.toml']?.extensionName!=='aif-ext-bounded-helpers')process.exit(1);" "$BOUNDED_PROJECT_DIR/.ai-factory.json"

echo "bounded helper extension init smoke tests passed"

# -------------------------------------------------------------------
# Ownership conflict smoke: extension add must reject agentFiles that
# collide with bundled Claude agent file targets.
# -------------------------------------------------------------------
CONFLICT_EXTENSION_DIR="$TMPDIR/runtime-agent-files-conflict"
mkdir -p "$CONFLICT_EXTENSION_DIR/agent-files/claude"

cat > "$CONFLICT_EXTENSION_DIR/extension.json" << 'EOF'
{
  "name": "aif-ext-runtime-agent-files-conflict",
  "version": "1.0.0",
  "agentFiles": [
    {
      "runtime": "claude",
      "source": "agent-files/claude/plan-polisher.md",
      "target": "plan-polisher.md"
    }
  ]
}
EOF

cat > "$CONFLICT_EXTENSION_DIR/agent-files/claude/plan-polisher.md" << 'EOF'
---
name: conflicting-plan-polisher
description: conflicting claude agent file
---
EOF

if (cd "$EXT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" extension add "$CONFLICT_EXTENSION_DIR" > "$TMPDIR/init-ext-conflict.log" 2>&1); then
  echo "Assertion failed: extension add must reject bundled Claude target collisions"
  cat "$TMPDIR/init-ext-conflict.log"
  exit 1
fi
assert_contains "$TMPDIR/init-ext-conflict.log" "already owned by AI Factory bundled Claude Code agent files" "bundled Claude target collision must be rejected with a clear message"

echo "extension agent file conflict smoke tests passed"

# -------------------------------------------------------------------
# Ownership conflict smoke: extension add must reject agentFiles that
# collide with bundled Codex agent file targets.
# -------------------------------------------------------------------
CODEX_CONFLICT_EXTENSION_DIR="$TMPDIR/runtime-agent-files-codex-conflict"
mkdir -p "$CODEX_CONFLICT_EXTENSION_DIR/agent-files/codex"

cat > "$CODEX_CONFLICT_EXTENSION_DIR/extension.json" << 'EOF'
{
  "name": "aif-ext-runtime-agent-files-codex-conflict",
  "version": "1.0.0",
  "agentFiles": [
    {
      "runtime": "codex",
      "source": "agent-files/codex/review-sidecar.toml",
      "target": "./review-sidecar.toml"
    }
  ]
}
EOF

cat > "$CODEX_CONFLICT_EXTENSION_DIR/agent-files/codex/review-sidecar.toml" << 'EOF'
name = "conflicting-review-sidecar"
description = "conflicting codex agent file"
EOF

if (cd "$EXT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" extension add "$CODEX_CONFLICT_EXTENSION_DIR" > "$TMPDIR/init-ext-codex-conflict.log" 2>&1); then
  echo "Assertion failed: extension add must reject bundled Codex target collisions"
  cat "$TMPDIR/init-ext-codex-conflict.log"
  exit 1
fi
assert_contains "$TMPDIR/init-ext-codex-conflict.log" "must use a canonical \"target\" path" "non-canonical bundled Codex target aliases must be rejected during validation"

CODEX_NESTED_ALIAS_EXTENSION_DIR="$TMPDIR/runtime-agent-files-codex-nested-alias"
mkdir -p "$CODEX_NESTED_ALIAS_EXTENSION_DIR/agent-files/codex"

cat > "$CODEX_NESTED_ALIAS_EXTENSION_DIR/extension.json" << 'EOF'
{
  "name": "aif-ext-runtime-agent-files-codex-nested-alias",
  "version": "1.0.0",
  "agentFiles": [
    {
      "runtime": "codex",
      "source": "agent-files/codex/review-sidecar.toml",
      "target": "nested/../review-sidecar.toml"
    }
  ]
}
EOF

cat > "$CODEX_NESTED_ALIAS_EXTENSION_DIR/agent-files/codex/review-sidecar.toml" << 'EOF'
name = "conflicting-review-sidecar"
description = "conflicting codex agent file"
EOF

if (cd "$EXT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" extension add "$CODEX_NESTED_ALIAS_EXTENSION_DIR" > "$TMPDIR/init-ext-codex-nested-alias.log" 2>&1); then
  echo "Assertion failed: extension add must reject nested bundled Codex target aliases"
  cat "$TMPDIR/init-ext-codex-nested-alias.log"
  exit 1
fi
assert_contains "$TMPDIR/init-ext-codex-nested-alias.log" "has an invalid \"target\" path" "nested bundled Codex target aliases must be rejected during validation"

CODEX_ESCAPE_EXTENSION_DIR="$TMPDIR/runtime-agent-files-codex-escape"
mkdir -p "$CODEX_ESCAPE_EXTENSION_DIR/agent-files/codex"

cat > "$CODEX_ESCAPE_EXTENSION_DIR/extension.json" << 'EOF'
{
  "name": "aif-ext-runtime-agent-files-codex-escape",
  "version": "1.0.0",
  "agentFiles": [
    {
      "runtime": "codex",
      "source": "agent-files/codex/review-sidecar.toml",
      "target": "../review-sidecar.toml"
    }
  ]
}
EOF

cat > "$CODEX_ESCAPE_EXTENSION_DIR/agent-files/codex/review-sidecar.toml" << 'EOF'
name = "escaping-review-sidecar"
description = "escaping codex agent file"
EOF

if (cd "$EXT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" extension add "$CODEX_ESCAPE_EXTENSION_DIR" > "$TMPDIR/init-ext-codex-escape.log" 2>&1); then
  echo "Assertion failed: extension add must reject Codex target path escapes"
  cat "$TMPDIR/init-ext-codex-escape.log"
  exit 1
fi
assert_contains "$TMPDIR/init-ext-codex-escape.log" "has an invalid \"target\" path" "Codex target path escapes must be rejected during validation"

echo "codex extension agent file conflict smoke tests passed"

# -------------------------------------------------------------------
# Unsafe managed agent file path smoke: deselecting an agent must not
# delete files outside the runtime-local agents directory.
# -------------------------------------------------------------------

UNSAFE_PROJECT_DIR="$TMPDIR/init-smoke-unsafe-agent-file-removal"
mkdir -p "$UNSAFE_PROJECT_DIR"

cat > "$UNSAFE_PROJECT_DIR/.ai-factory.json" << 'EOF'
{
  "version": "2.4.0",
  "agents": [
    {
      "id": "codex",
      "skillsDir": ".codex/skills",
      "agentsDir": ".codex/agents",
      "installedSkills": ["aif"],
      "installedAgentFiles": ["../../SHOULD_NOT_DELETE.md"],
      "managedAgentFiles": {},
      "agentFileSources": {},
      "mcp": {
        "github": false,
        "filesystem": false,
        "postgres": false,
        "chromeDevtools": false,
        "playwright": false
      }
    }
  ],
  "extensions": []
}
EOF

cat > "$UNSAFE_PROJECT_DIR/SHOULD_NOT_DELETE.md" << 'EOF'
keep-me
EOF

(cd "$UNSAFE_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" init --agents claude --skills aif > "$TMPDIR/init-unsafe-remove.log" 2>&1)
assert_exists "$UNSAFE_PROJECT_DIR/SHOULD_NOT_DELETE.md" "init deselection must not delete files outside the agents directory"
assert_contains "$TMPDIR/init-unsafe-remove.log" 'Skipping unsafe managed agent file path "\.\./\.\./SHOULD_NOT_DELETE\.md"' "init must warn when config contains an unsafe managed agent file path"

echo "unsafe managed agent file removal smoke tests passed"

# Managed config path boundary smoke: package-managed config files must be
# constrained both to the package source directory and to the runtime config dir.

node --input-type=module > "$TMPDIR/init-managed-config-paths.log" 2>&1 <<'EOF'
import { resolveManagedConfigFilePaths } from './dist/core/installer.js';

const projectDir = process.cwd();

for (const relPath of ['../config.toml', 'nested/../../config.toml', 'C:/config.toml']) {
  try {
    resolveManagedConfigFilePaths(projectDir, 'codex', relPath);
    throw new Error(`Expected rejection for ${relPath}`);
  } catch (error) {
    if (!String(error?.message ?? '').includes('Managed artifact path')) {
      throw error;
    }
  }
}

const resolved = resolveManagedConfigFilePaths(projectDir, 'codex', 'config.toml');
if (!resolved.targetFile.endsWith('/.codex/config.toml')) {
  throw new Error(`Unexpected target path: ${resolved.targetFile}`);
}
if (!resolved.sourceFile.endsWith('/subagents/codex/config.toml')) {
  throw new Error(`Unexpected source path: ${resolved.sourceFile}`);
}
EOF

echo "managed config path boundary smoke tests passed"

# CLI validation smoke: extension add must reject excess arguments.
# -------------------------------------------------------------------

if (cd "$EXT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" extension add "$CONFLICT_EXTENSION_DIR" unexpected > "$TMPDIR/init-ext-extra-args.log" 2>&1); then
  echo "Assertion failed: extension add must reject excess arguments"
  cat "$TMPDIR/init-ext-extra-args.log"
  exit 1
fi
assert_contains "$TMPDIR/init-ext-extra-args.log" "too many arguments" "extension add must fail fast on excess arguments"

echo "extension add excess-arguments smoke tests passed"

# -------------------------------------------------------------------
# Windows npm resolution smoke: npm-based extension install must
# resolve npm-cli.js without shell fallback and fail explicitly when
# no safe npm entrypoint exists.
# -------------------------------------------------------------------

ROOT_DIR="$ROOT_DIR" node --input-type=module <<'EOF'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { resolveNpmCommand } = await import(pathToFileURL(path.join(process.env.ROOT_DIR, 'dist/core/extensions.js')).href);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aif-npm-resolve-'));
const fakeExecDir = path.join(tempRoot, 'current-node');
fs.mkdirSync(fakeExecDir, { recursive: true });
const fakeExecPath = path.join(fakeExecDir, 'node.exe');
fs.writeFileSync(fakeExecPath, '');

const npmRoot = path.join(tempRoot, 'npm-root');
const npmCliPath = path.join(npmRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js');
const bundledNodePath = path.join(npmRoot, 'node.exe');
fs.mkdirSync(path.dirname(npmCliPath), { recursive: true });
fs.writeFileSync(path.join(npmRoot, 'npm.cmd'), '@ECHO off\r\n');
fs.writeFileSync(npmCliPath, '#!/usr/bin/env node\n');
fs.writeFileSync(bundledNodePath, '');

const resolved = await resolveNpmCommand({
  platform: 'win32',
  execPath: fakeExecPath,
  pathEnv: `${npmRoot};${process.env.PATH}`,
});

assert.equal(resolved.command, bundledNodePath, 'Windows npm resolution must prefer node.exe adjacent to npm.cmd');
assert.deepEqual(resolved.argsPrefix, [npmCliPath], 'Windows npm resolution must invoke npm-cli.js directly');

const resolvedWithCustomDelimiter = await resolveNpmCommand({
  platform: 'win32',
  execPath: fakeExecPath,
  pathEnv: `${path.relative(process.cwd(), npmRoot)}:${path.relative(process.cwd(), tempRoot)}`,
  pathDelimiter: ':',
});

assert.equal(
  resolvedWithCustomDelimiter.command,
  path.join(path.relative(process.cwd(), npmRoot), 'node.exe'),
  'Windows npm resolution must honor injected path delimiters instead of host defaults',
);
assert.deepEqual(
  resolvedWithCustomDelimiter.argsPrefix,
  [path.join(path.relative(process.cwd(), npmRoot), 'node_modules', 'npm', 'bin', 'npm-cli.js')],
  'Windows npm resolution must honor injected delimiters when locating npm-cli.js',
);

const noSafeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aif-npm-missing-'));
const missingExecDir = path.join(noSafeRoot, 'isolated-node');
fs.mkdirSync(missingExecDir, { recursive: true });
const missingExecPath = path.join(missingExecDir, 'node.exe');
fs.writeFileSync(missingExecPath, '');

await assert.rejects(
  () => resolveNpmCommand({
    platform: 'win32',
    execPath: missingExecPath,
    pathEnv: noSafeRoot,
  }),
  /safe Windows npm/i,
  'Windows npm resolution must fail explicitly when no safe npm-cli.js path is available',
);
EOF

echo "windows npm resolution smoke tests passed"
