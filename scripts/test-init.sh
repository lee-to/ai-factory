#!/bin/bash
# Smoke tests: validates ai-factory init for bundled and extension-provided agent files

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

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

INIT_OUTPUT="$TMPDIR/init-claude.log"
EXPECTED_SUBAGENTS=$(find "$ROOT_DIR/subagents" -type f | wc -l | tr -d ' ')

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
assert_contains "$INIT_OUTPUT" "Installed agent files: ${EXPECTED_SUBAGENTS}" "Claude init summary must report installed agent files"
assert_exists "$PROJECT_DIR/.claude/agents/best-practices-sidecar.md" "Claude init must install best-practices sidecar"
assert_exists "$PROJECT_DIR/.claude/agents/commit-preparer.md" "Claude init must install commit preparer"
assert_exists "$PROJECT_DIR/.claude/agents/docs-auditor.md" "Claude init must install docs auditor"
assert_exists "$PROJECT_DIR/.claude/agents/implement-worker.md" "Claude init must install implement worker"
assert_exists "$PROJECT_DIR/.claude/agents/loop-orchestrator.md" "Claude init must install bundled subagents"
assert_exists "$PROJECT_DIR/.claude/agents/plan-polisher.md" "Claude init must install planning subagent"
assert_exists "$PROJECT_DIR/.claude/agents/review-sidecar.md" "Claude init must install review sidecar"
assert_exists "$PROJECT_DIR/.claude/agents/security-sidecar.md" "Claude init must install security sidecar"

ACTUAL_SUBAGENTS=$(find "$PROJECT_DIR/.claude/agents" -type f | wc -l | tr -d ' ')
if [[ "$ACTUAL_SUBAGENTS" != "$EXPECTED_SUBAGENTS" ]]; then
  echo "Assertion failed: Claude init must install all bundled agent files"
  echo "Expected agent files: $EXPECTED_SUBAGENTS"
  echo "Actual agent files: $ACTUAL_SUBAGENTS"
  exit 1
fi

EXPECTED_SUBAGENTS="$EXPECTED_SUBAGENTS" node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];const expected=Number(process.env.EXPECTED_SUBAGENTS);if(a.id!=='claude')process.exit(1);if(a.agentsDir!=='.claude/agents')process.exit(1);if(!Array.isArray(a.installedAgentFiles)||a.installedAgentFiles.length!==expected)process.exit(1);if(!a.installedAgentFiles.includes('best-practices-sidecar.md'))process.exit(1);if(!a.installedAgentFiles.includes('commit-preparer.md'))process.exit(1);if(!a.installedAgentFiles.includes('docs-auditor.md'))process.exit(1);if(!a.installedAgentFiles.includes('implement-worker.md'))process.exit(1);if(!a.installedAgentFiles.includes('loop-orchestrator.md'))process.exit(1);if(!a.installedAgentFiles.includes('plan-polisher.md'))process.exit(1);if(!a.installedAgentFiles.includes('review-sidecar.md'))process.exit(1);if(!a.installedAgentFiles.includes('security-sidecar.md'))process.exit(1);if(!a.managedAgentFiles||Object.keys(a.managedAgentFiles).length!==expected)process.exit(1);" "$PROJECT_DIR/.ai-factory.json"

echo "claude init smoke tests passed"

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
(cd "$EXT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" init --agents claude,codex,test-runtime --skills aif > "$TMPDIR/init-ext-reinit.log" 2>&1)

assert_exists "$EXT_PROJECT_DIR/.claude/agents/test-sidecar.md" "extension claude agent file must be installed on init"
assert_exists "$EXT_PROJECT_DIR/.codex/agents/test-helper.toml" "extension codex agent file must be installed on init"
assert_exists "$EXT_PROJECT_DIR/.test-runtime/agents/test-agent.toml" "dynamic runtime agent file must be installed on init"

node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const ids=c.agents.map(a=>a.id).sort().join(',');if(ids!=='claude,codex,test-runtime')process.exit(1);const dyn=c.agents.find(a=>a.id==='test-runtime');if(!dyn||dyn.agentsDir!=='.test-runtime/agents')process.exit(1);" "$EXT_PROJECT_DIR/.ai-factory.json"

# Update extension-managed agent files from local source.
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

# Remove should be blocked while dynamic runtime is still configured.
if (cd "$EXT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" extension remove aif-ext-runtime-agent-files > "$TMPDIR/init-ext-remove-blocked.log" 2>&1); then
  echo "Assertion failed: extension remove must be blocked while dynamic runtime is configured"
  cat "$TMPDIR/init-ext-remove-blocked.log"
  exit 1
fi
assert_contains "$TMPDIR/init-ext-remove-blocked.log" "orphan configured runtime" "remove must explain orphan runtime block"

# After deselecting the dynamic runtime, removal should succeed and clean agent files.
(cd "$EXT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" init --agents claude,codex --skills aif > "$TMPDIR/init-ext-deselect.log" 2>&1)
(cd "$EXT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" extension remove aif-ext-runtime-agent-files > "$TMPDIR/init-ext-remove.log" 2>&1)
assert_not_exists "$EXT_PROJECT_DIR/.claude/agents/test-sidecar.md" "extension claude agent file must be removed"
assert_not_exists "$EXT_PROJECT_DIR/.codex/agents/test-helper.toml" "extension codex agent file must be removed"

echo "extension agent file init smoke tests passed"

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
assert_contains "$TMPDIR/init-ext-conflict.log" "already owned by AI Factory bundled Claude agent files" "bundled Claude target collision must be rejected with a clear message"

echo "extension agent file conflict smoke tests passed"
