#!/bin/bash
# Smoke tests: validates ai-factory init for bundled and extension-provided agent files

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
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const codex=c.agents.find(a=>a.id==='codex');const dyn=c.agents.find(a=>a.id==='test-runtime');if(!codex||!dyn)process.exit(1);if(!Array.isArray(codex.installedAgentFiles)||!codex.installedAgentFiles.includes('test-helper.toml'))process.exit(1);if(!Array.isArray(dyn.installedAgentFiles)||!dyn.installedAgentFiles.includes('test-agent.toml'))process.exit(1);if(!codex.managedAgentFiles||!codex.managedAgentFiles['test-helper.toml'])process.exit(1);if(!dyn.managedAgentFiles||!dyn.managedAgentFiles['test-agent.toml'])process.exit(1);if(!codex.agentFileSources||codex.agentFileSources['test-helper.toml']?.extensionName!=='aif-ext-runtime-agent-files')process.exit(1);if(!dyn.agentFileSources||dyn.agentFileSources['test-agent.toml']?.extensionName!=='aif-ext-runtime-agent-files')process.exit(1);" "$EXT_PROJECT_DIR/.ai-factory.json"

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
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const claude=c.agents.find(a=>a.id==='claude');const codex=c.agents.find(a=>a.id==='codex');if(!claude||!codex)process.exit(1);if((claude.installedAgentFiles||[]).includes('test-sidecar.md'))process.exit(1);if((codex.installedAgentFiles||[]).includes('test-helper.toml'))process.exit(1);if((claude.managedAgentFiles||{})['test-sidecar.md'])process.exit(1);if((codex.managedAgentFiles||{})['test-helper.toml'])process.exit(1);if((claude.agentFileSources||{})['test-sidecar.md'])process.exit(1);if((codex.agentFileSources||{})['test-helper.toml'])process.exit(1);" "$EXT_PROJECT_DIR/.ai-factory.json"

echo "extension agent file init smoke tests passed"

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
assert_contains "$TMPDIR/init-ext-conflict.log" "already owned by AI Factory bundled Claude agent files" "bundled Claude target collision must be rejected with a clear message"

echo "extension agent file conflict smoke tests passed"

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
