#!/bin/bash
# Smoke tests: validates ai-factory update status model and --force behavior

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$ROOT_DIR/scripts/test-extension-fixtures.sh"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

PROJECT_DIR="$TMPDIR/update-smoke"
mkdir -p "$PROJECT_DIR"

# Ensure dist/ is up to date for CLI smoke tests.
(cd "$ROOT_DIR" && npm run build > /dev/null)

cat > "$PROJECT_DIR/.ai-factory.json" << 'EOF'
{
  "version": "2.4.0",
  "agents": [
    {
      "id": "universal",
      "skillsDir": ".agents/skills",
      "installedSkills": ["aif", "aif-plan", "aif-nonexistent"],
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

run_update() {
  local mode="$1"
  local output_file="$2"
  if [[ "$mode" == "force" ]]; then
    (cd "$PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update --force > "$output_file" 2>&1)
  else
    (cd "$PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$output_file" 2>&1)
  fi
}

FIRST_OUTPUT="$TMPDIR/update-first.log"
SECOND_OUTPUT="$TMPDIR/update-second.log"
FORCE_OUTPUT="$TMPDIR/update-force.log"

run_update normal "$FIRST_OUTPUT"
assert_contains "$FIRST_OUTPUT" "\[universal\] Status:" "status section must be printed"
assert_contains "$FIRST_OUTPUT" "changed: [0-9]+" "changed counter must be printed"
assert_contains "$FIRST_OUTPUT" "skipped: [0-9]+" "skipped counter must be printed"
assert_contains "$FIRST_OUTPUT" "removed: [0-9]+" "removed counter must be printed"
assert_contains "$FIRST_OUTPUT" "aif-nonexistent \(removed from package\)" "removed package skill must be reported"
assert_contains "$FIRST_OUTPUT" "WARN: managed state recovered" "managed state recovery warning expected on first run"

node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const m=c.agents[0].managedSkills||{};if(!m['aif']||!m['aif-plan']){process.exit(1);}" "$PROJECT_DIR/.ai-factory.json"

run_update normal "$SECOND_OUTPUT"
assert_contains "$SECOND_OUTPUT" "unchanged: [0-9]+" "unchanged counter must be printed"
assert_contains "$SECOND_OUTPUT" "changed: 0" "second run should not report changed skills in steady state"

run_update force "$FORCE_OUTPUT"
assert_contains "$FORCE_OUTPUT" "Force mode enabled" "force mode banner expected"
assert_contains "$FORCE_OUTPUT" "changed: [0-9]+" "force run should report changed skills"
assert_contains "$FORCE_OUTPUT" "force reinstall" "force reason should be visible"

echo "update smoke tests passed"

# -------------------------------------------------------------------
# New base skills update prompt smoke
# -------------------------------------------------------------------

NEW_SKILL_PROMPT_PROJECT_DIR="$TMPDIR/update-smoke-new-skill-prompt"
mkdir -p "$NEW_SKILL_PROMPT_PROJECT_DIR"

cat > "$NEW_SKILL_PROMPT_PROJECT_DIR/.ai-factory.json" << 'EOF'
{
  "version": "2.4.0",
  "agents": [
    {
      "id": "universal",
      "skillsDir": ".agents/skills",
      "installedSkills": ["aif"],
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

NEW_SKILL_PROMPT_OUTPUT="$TMPDIR/update-new-skill-prompt.log"
AIF_TEST_ROOT_DIR="$ROOT_DIR" AIF_TEST_PROJECT_DIR="$NEW_SKILL_PROMPT_PROJECT_DIR" node --input-type=module > "$NEW_SKILL_PROMPT_OUTPUT" 2>&1 <<'EOF'
import inquirer from 'inquirer';
import path from 'path';
import { pathToFileURL } from 'url';

Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

const originalPrompt = inquirer.prompt.bind(inquirer);
inquirer.prompt = async (questions) => {
  const first = Array.isArray(questions) ? questions[0] : questions;
  if (first?.name === 'shouldUpdate') {
    return { shouldUpdate: false };
  }
  if (first?.name === 'selectedNewSkills') {
    return { selectedNewSkills: ['aif-plan'] };
  }
  throw new Error(`Unexpected prompt: ${JSON.stringify(questions)}`);
};

process.chdir(process.env.AIF_TEST_PROJECT_DIR);

const moduleUrl = pathToFileURL(path.join(process.env.AIF_TEST_ROOT_DIR, 'dist/cli/commands/update.js')).href;
const { updateCommand } = await import(moduleUrl);

try {
  await updateCommand();
} finally {
  inquirer.prompt = originalPrompt;
}
EOF

assert_contains "$NEW_SKILL_PROMPT_OUTPUT" "New base skills available:" "update must announce newly available base skills"
assert_contains "$NEW_SKILL_PROMPT_OUTPUT" "aif-plan \(new in package\)" "accepted new skill must be reported as installed"
assert_exists "$NEW_SKILL_PROMPT_PROJECT_DIR/.agents/skills/aif-plan/SKILL.md" "accepted new skill must be installed"
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];if(!Array.isArray(a.installedSkills)||!a.installedSkills.includes('aif-plan'))process.exit(1);if(!a.managedSkills||!a.managedSkills['aif-plan'])process.exit(1);" "$NEW_SKILL_PROMPT_PROJECT_DIR/.ai-factory.json"

echo "new base skill prompt smoke tests passed"

# -------------------------------------------------------------------
# Codex app update smoke: repo skills should keep Codex $ invocations,
# custom skills should be preserved, and incompatible shared repo skills
# runtime configs should fail before mutation.
# -------------------------------------------------------------------

CODEX_APP_PROJECT_DIR="$TMPDIR/update-smoke-codex-app"
mkdir -p "$CODEX_APP_PROJECT_DIR/.agents/skills/custom/local-helper"

cat > "$CODEX_APP_PROJECT_DIR/.ai-factory.json" << 'EOF'
{
  "version": "2.4.0",
  "agents": [
    {
      "id": "codex-app",
      "skillsDir": ".agents/skills",
      "installedSkills": ["aif", "aif-plan", "custom/local-helper"],
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

cat > "$CODEX_APP_PROJECT_DIR/.agents/skills/custom/local-helper/SKILL.md" << 'EOF'
---
name: local-helper
description: local custom skill
---
EOF

CODEX_APP_FIRST_OUTPUT="$TMPDIR/update-codex-app-first.log"
CODEX_APP_FORCE_OUTPUT="$TMPDIR/update-codex-app-force.log"

(cd "$CODEX_APP_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$CODEX_APP_FIRST_OUTPUT" 2>&1)
assert_contains "$CODEX_APP_FIRST_OUTPUT" "\[codex-app\] Status:" "codex-app status section must be printed"
assert_contains "$CODEX_APP_FIRST_OUTPUT" "WARN: managed state recovered" "codex-app managed state recovery warning expected on first run"
assert_exists "$CODEX_APP_PROJECT_DIR/.agents/skills/aif/SKILL.md" "codex-app update must install aif into repo skills"
assert_contains "$CODEX_APP_PROJECT_DIR/.agents/skills/aif/SKILL.md" '\$aif-skill-generator' "codex-app update must keep Codex $ invocation"
assert_not_contains "$CODEX_APP_PROJECT_DIR/.agents/skills/aif/SKILL.md" '(^|[^$])`/aif-skill-generator`' "codex-app update must not keep slash invocation examples"
assert_exists "$CODEX_APP_PROJECT_DIR/.agents/skills/custom/local-helper/SKILL.md" "codex-app update must preserve custom skills"

(cd "$CODEX_APP_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update --force > "$CODEX_APP_FORCE_OUTPUT" 2>&1)
assert_contains "$CODEX_APP_FORCE_OUTPUT" "Force mode enabled" "codex-app force update must print force mode"
assert_contains "$CODEX_APP_FORCE_OUTPUT" "aif \(force reinstall\)" "codex-app force update must reinstall base skills"
assert_contains "$CODEX_APP_PROJECT_DIR/.agents/skills/aif/SKILL.md" '\$aif-skill-generator' "codex-app force update must keep Codex $ invocation"
assert_exists "$CODEX_APP_PROJECT_DIR/.agents/skills/custom/local-helper/SKILL.md" "codex-app force update must preserve custom skills"
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];if(a.id!=='codex-app')process.exit(1);if(a.skillsDir!=='.agents/skills')process.exit(1);if(!Array.isArray(a.installedSkills)||!a.installedSkills.includes('custom/local-helper'))process.exit(1);if(!a.managedSkills||!a.managedSkills.aif||!a.managedSkills['aif-plan'])process.exit(1);" "$CODEX_APP_PROJECT_DIR/.ai-factory.json"

CONFLICT_UPDATE_PROJECT_DIR="$TMPDIR/update-smoke-codex-app-universal-conflict"
mkdir -p "$CONFLICT_UPDATE_PROJECT_DIR"
cat > "$CONFLICT_UPDATE_PROJECT_DIR/.ai-factory.json" << 'EOF'
{
  "version": "2.4.0",
  "agents": [
    {
      "id": "universal",
      "skillsDir": ".agents/skills",
      "installedSkills": ["aif"],
      "mcp": {
        "github": false,
        "filesystem": false,
        "postgres": false,
        "chromeDevtools": false,
        "playwright": false
      }
    },
    {
      "id": "codex-app",
      "skillsDir": ".agents/skills",
      "installedSkills": ["aif"],
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

if (cd "$CONFLICT_UPDATE_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$TMPDIR/update-codex-app-conflict.log" 2>&1); then
  echo "Assertion failed: update must reject universal and codex-app sharing .agents/skills"
  cat "$TMPDIR/update-codex-app-conflict.log"
  exit 1
fi
assert_contains "$TMPDIR/update-codex-app-conflict.log" "universal, codex-app" "update conflict error must include both runtime ids"
assert_contains "$TMPDIR/update-codex-app-conflict.log" "\.agents/skills" "update conflict error must include the shared skillsDir"

echo "codex app update smoke tests passed"

# -------------------------------------------------------------------
# Antigravity force behavior smoke: preserve custom workflow refs,
# and clean stale files under .agent/skills/<skill>.
# -------------------------------------------------------------------

AG_PROJECT_DIR="$TMPDIR/update-smoke-antigravity"
mkdir -p "$AG_PROJECT_DIR"

cat > "$AG_PROJECT_DIR/.ai-factory.json" << 'EOF'
{
  "version": "2.4.0",
  "agents": [
    {
      "id": "antigravity",
      "skillsDir": ".agent/skills",
      "installedSkills": ["aif", "aif-docs", "custom/workflow-ref"],
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

AG_FIRST_OUTPUT="$TMPDIR/update-antigravity-first.log"
AG_FORCE_OUTPUT="$TMPDIR/update-antigravity-force.log"

(cd "$AG_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$AG_FIRST_OUTPUT" 2>&1)
assert_contains "$AG_FIRST_OUTPUT" "\[antigravity\] Status:" "antigravity status section must be printed"

mkdir -p "$AG_PROJECT_DIR/.agent/workflows/references/custom"
cat > "$AG_PROJECT_DIR/.agent/workflows/references/custom/keep.md" << 'EOF'
# custom reference
keep-me
EOF

mkdir -p "$AG_PROJECT_DIR/.agent/skills/aif-docs/references"
cat > "$AG_PROJECT_DIR/.agent/skills/aif-docs/stale.txt" << 'EOF'
stale
EOF
cat > "$AG_PROJECT_DIR/.agent/skills/aif-docs/references/stale.md" << 'EOF'
stale-ref
EOF

(cd "$AG_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update --force > "$AG_FORCE_OUTPUT" 2>&1)
assert_contains "$AG_FORCE_OUTPUT" "Force mode enabled" "force mode banner expected for antigravity"
assert_contains "$AG_FORCE_OUTPUT" "\[antigravity\] Status:" "antigravity status section must be printed on force run"
assert_contains "$AG_FORCE_OUTPUT" "aif \(force reinstall\)" "workflow skill should be force reinstalled"
assert_contains "$AG_FORCE_OUTPUT" "aif-docs \(force reinstall\)" "non-workflow skill should be force reinstalled"
assert_contains "$AG_FORCE_OUTPUT" "\[antigravity\] Custom skills \(preserved\):" "custom skills section should be printed"
assert_contains "$AG_FORCE_OUTPUT" "custom/workflow-ref" "custom skill reference should be preserved in config"
assert_exists "$AG_PROJECT_DIR/.agent/workflows/references/custom/keep.md" "custom workflow reference must survive force update"
assert_contains "$AG_PROJECT_DIR/.agent/workflows/references/custom/keep.md" "keep-me" "custom workflow reference content must be preserved"
assert_not_exists "$AG_PROJECT_DIR/.agent/skills/aif-docs/stale.txt" "stale file in .agent/skills/<skill> must be cleaned on force update"
assert_not_exists "$AG_PROJECT_DIR/.agent/skills/aif-docs/references/stale.md" "stale reference in .agent/skills/<skill> must be cleaned on force update"

echo "antigravity force smoke tests passed"

# -------------------------------------------------------------------
# Kilo Code workflow smoke: workflow-classified skills should install
# as workflows and no longer remain under .kilocode/skills/.
# -------------------------------------------------------------------

KILO_PROJECT_DIR="$TMPDIR/update-smoke-kilocode"
mkdir -p "$KILO_PROJECT_DIR"

cat > "$KILO_PROJECT_DIR/.ai-factory.json" << 'EOF'
{
  "version": "2.4.0",
  "agents": [
    {
      "id": "kilocode",
      "skillsDir": ".kilocode/skills",
      "installedSkills": ["aif", "aif-plan", "aif-commit", "aif-rules-check", "aif-docs"],
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

KILO_OUTPUT="$TMPDIR/update-kilocode.log"

(cd "$KILO_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$KILO_OUTPUT" 2>&1)
assert_contains "$KILO_OUTPUT" "\[kilocode\] Status:" "kilocode status section must be printed"
assert_exists "$KILO_PROJECT_DIR/.kilocode/workflows/aif.md" "aif workflow must be installed for Kilo Code"
assert_exists "$KILO_PROJECT_DIR/.kilocode/workflows/aif-plan.md" "aif-plan workflow must be installed for Kilo Code"
assert_exists "$KILO_PROJECT_DIR/.kilocode/workflows/aif-commit.md" "aif-commit workflow must be installed for Kilo Code"
assert_exists "$KILO_PROJECT_DIR/.kilocode/workflows/aif-rules-check.md" "aif-rules-check workflow must be installed for Kilo Code"
assert_contains "$KILO_PROJECT_DIR/.kilocode/workflows/aif-plan.md" "/aif:[a-z-]+" "Kilo workflow content must use Kilo invocation syntax"
assert_exists "$KILO_PROJECT_DIR/.kilocode/skills/aif-docs/SKILL.md" "non-workflow Kilo skills must remain in skills/"
assert_not_exists "$KILO_PROJECT_DIR/.kilocode/skills/aif" "workflow skill should not remain in skills/"
assert_not_exists "$KILO_PROJECT_DIR/.kilocode/skills/aif-plan" "workflow skill should not remain in skills/"
assert_not_exists "$KILO_PROJECT_DIR/.kilocode/skills/aif-commit" "workflow skill should not remain in skills/"
assert_not_exists "$KILO_PROJECT_DIR/.kilocode/skills/aif-rules-check" "workflow skill should not remain in skills/"

echo "kilocode workflow smoke tests passed"

# -------------------------------------------------------------------
# Claude bundled agent files smoke
# -------------------------------------------------------------------

CLAUDE_PROJECT_DIR="$TMPDIR/update-smoke-claude"
mkdir -p "$CLAUDE_PROJECT_DIR"

cat > "$CLAUDE_PROJECT_DIR/.ai-factory.json" << 'EOF'
{
  "version": "2.4.0",
  "agents": [
    {
      "id": "claude",
      "skillsDir": ".claude/skills",
      "installedSkills": ["aif"],
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

CLAUDE_FIRST_OUTPUT="$TMPDIR/update-claude-first.log"
CLAUDE_SECOND_OUTPUT="$TMPDIR/update-claude-second.log"

(cd "$CLAUDE_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$CLAUDE_FIRST_OUTPUT" 2>&1)
assert_contains "$CLAUDE_FIRST_OUTPUT" "\[claude\] Agent files:" "claude agent files section must be printed"
assert_contains "$CLAUDE_FIRST_OUTPUT" "loop-orchestrator\\.md \(new in package\)" "new bundled subagent must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/best-practices-sidecar.md" "best-practices sidecar must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/commit-preparer.md" "commit preparer must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/docs-auditor.md" "docs auditor must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/implement-worker.md" "implement worker must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/loop-orchestrator.md" "bundled Claude subagent must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/plan-polisher.md" "planning subagent must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/review-sidecar.md" "review sidecar must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/rules-sidecar.md" "rules sidecar must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/security-sidecar.md" "security sidecar must be installed"

node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];if(a.agentsDir!=='.claude/agents')process.exit(1);if(!Array.isArray(a.installedAgentFiles)||!a.installedAgentFiles.includes('best-practices-sidecar.md')||!a.installedAgentFiles.includes('commit-preparer.md')||!a.installedAgentFiles.includes('docs-auditor.md')||!a.installedAgentFiles.includes('implement-worker.md')||!a.installedAgentFiles.includes('loop-orchestrator.md')||!a.installedAgentFiles.includes('plan-polisher.md')||!a.installedAgentFiles.includes('review-sidecar.md')||!a.installedAgentFiles.includes('rules-sidecar.md')||!a.installedAgentFiles.includes('security-sidecar.md'))process.exit(1);if(!a.managedAgentFiles||!a.managedAgentFiles['best-practices-sidecar.md']||!a.managedAgentFiles['commit-preparer.md']||!a.managedAgentFiles['docs-auditor.md']||!a.managedAgentFiles['implement-worker.md']||!a.managedAgentFiles['loop-orchestrator.md']||!a.managedAgentFiles['plan-polisher.md']||!a.managedAgentFiles['review-sidecar.md']||!a.managedAgentFiles['rules-sidecar.md']||!a.managedAgentFiles['security-sidecar.md'])process.exit(1);if(!a.agentFileSources||a.agentFileSources['plan-polisher.md']?.kind!=='bundled')process.exit(1);" "$CLAUDE_PROJECT_DIR/.ai-factory.json"

echo "" >> "$CLAUDE_PROJECT_DIR/.claude/agents/loop-orchestrator.md"
echo "<!-- drift -->" >> "$CLAUDE_PROJECT_DIR/.claude/agents/loop-orchestrator.md"

(cd "$CLAUDE_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$CLAUDE_SECOND_OUTPUT" 2>&1)
assert_contains "$CLAUDE_SECOND_OUTPUT" "Local modifications detected in agent file" "local drift warning must be printed"
assert_contains "$CLAUDE_SECOND_OUTPUT" "loop-orchestrator\\.md \(local drift\)" "agent file drift must be repaired on update"
assert_contains "$CLAUDE_PROJECT_DIR/.claude/agents/loop-orchestrator.md" "name: loop-orchestrator" "reinstalled agent file content must be restored"

echo "claude agent files smoke tests passed"

# -------------------------------------------------------------------
# Codex bundled agent files and config smoke
# -------------------------------------------------------------------

CODEX_PROJECT_DIR="$TMPDIR/update-smoke-codex"
mkdir -p "$CODEX_PROJECT_DIR"

cat > "$CODEX_PROJECT_DIR/.ai-factory.json" << 'EOF'
{
  "version": "2.4.0",
  "agents": [
    {
      "id": "codex",
      "skillsDir": ".codex/skills",
      "installedSkills": ["aif"],
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

CODEX_FIRST_OUTPUT="$TMPDIR/update-codex-first.log"
CODEX_SECOND_OUTPUT="$TMPDIR/update-codex-second.log"
CODEX_FORCE_RECORDED_CUSTOMIZATION_OUTPUT="$TMPDIR/update-codex-force-recorded-customization.log"

(cd "$CODEX_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$CODEX_FIRST_OUTPUT" 2>&1)
assert_contains "$CODEX_FIRST_OUTPUT" "\[codex\] Agent files:" "codex agent files section must be printed"
assert_contains "$CODEX_FIRST_OUTPUT" "\[codex\] Config files:" "codex config files section must be printed"
assert_contains "$CODEX_FIRST_OUTPUT" "plan-coordinator\\.toml \(new in package\)" "new Codex agent must be installed"
assert_contains "$CODEX_FIRST_OUTPUT" "config\\.toml \(new in package\)" "new Codex config file must be installed"
assert_exists "$CODEX_PROJECT_DIR/.codex/agents/plan-coordinator.toml" "Codex plan coordinator must be installed"
assert_exists "$CODEX_PROJECT_DIR/.codex/agents/implement-coordinator.toml" "Codex implement coordinator must be installed"
assert_exists "$CODEX_PROJECT_DIR/.codex/config.toml" "Codex config.toml must be installed"

node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];if(a.agentsDir!=='.codex/agents')process.exit(1);if(!Array.isArray(a.installedAgentFiles)||!a.installedAgentFiles.includes('plan-coordinator.toml'))process.exit(1);if(!a.managedAgentFiles||!a.managedAgentFiles['plan-coordinator.toml'])process.exit(1);if(!Array.isArray(a.installedConfigFiles)||!a.installedConfigFiles.includes('config.toml'))process.exit(1);if(!a.managedConfigFiles||!a.managedConfigFiles['config.toml'])process.exit(1);" "$CODEX_PROJECT_DIR/.ai-factory.json"

echo "" >> "$CODEX_PROJECT_DIR/.codex/config.toml"
echo "# drift" >> "$CODEX_PROJECT_DIR/.codex/config.toml"

(cd "$CODEX_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$CODEX_SECOND_OUTPUT" 2>&1)
assert_contains "$CODEX_SECOND_OUTPUT" "Local modifications detected in config file" "Codex config drift warning must be printed"
assert_contains "$CODEX_SECOND_OUTPUT" "config\\.toml \(local changes preserved\)" "Codex config drift must be preserved on update"
assert_contains "$CODEX_PROJECT_DIR/.codex/config.toml" "\\[agents\\]" "Codex config base content must remain"
assert_contains "$CODEX_PROJECT_DIR/.codex/config.toml" "# drift" "Codex config local drift must be preserved"

(cd "$CODEX_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update --force > "$CODEX_FORCE_RECORDED_CUSTOMIZATION_OUTPUT" 2>&1)
assert_contains "$CODEX_FORCE_RECORDED_CUSTOMIZATION_OUTPUT" "Force mode enabled" "force update must print force mode for recorded config customization"
assert_contains "$CODEX_FORCE_RECORDED_CUSTOMIZATION_OUTPUT" "Previously preserved local customization detected in config file" "force update must explain recorded config customization preservation"
assert_contains "$CODEX_FORCE_RECORDED_CUSTOMIZATION_OUTPUT" "config\\.toml \(--force ignored; local changes preserved\)" "force update must report ignored force for recorded config customization"
assert_contains "$CODEX_PROJECT_DIR/.codex/config.toml" "# drift" "force update must preserve recorded config customization"

echo "codex assets smoke tests passed"

# -------------------------------------------------------------------
# Codex legacy user-owned config migration smoke
# -------------------------------------------------------------------

CODEX_USER_CONFIG_PROJECT_DIR="$TMPDIR/update-smoke-codex-user-config"
mkdir -p "$CODEX_USER_CONFIG_PROJECT_DIR/.codex"

cat > "$CODEX_USER_CONFIG_PROJECT_DIR/.ai-factory.json" << 'EOF'
{
  "version": "2.4.0",
  "agents": [
    {
      "id": "codex",
      "skillsDir": ".codex/skills",
      "installedSkills": ["aif"],
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

cat > "$CODEX_USER_CONFIG_PROJECT_DIR/.codex/config.toml" << 'EOF'
[user]
keep = true
EOF

CODEX_USER_CONFIG_OUTPUT="$TMPDIR/update-codex-user-config.log"
CODEX_USER_CONFIG_FORCE_OUTPUT="$TMPDIR/update-codex-user-config-force.log"
(cd "$CODEX_USER_CONFIG_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$CODEX_USER_CONFIG_OUTPUT" 2>&1)
assert_contains "$CODEX_USER_CONFIG_OUTPUT" "Existing untracked config file \"config\\.toml\" detected" "untracked Codex config warning must be printed"
assert_contains "$CODEX_USER_CONFIG_OUTPUT" "config\\.toml \(untracked file exists\)" "untracked Codex config must be skipped"
assert_contains "$CODEX_USER_CONFIG_PROJECT_DIR/.codex/config.toml" "\\[user\\]" "user-owned Codex config must be preserved"
assert_contains "$CODEX_USER_CONFIG_PROJECT_DIR/.codex/config.toml" "keep = true" "user-owned Codex config content must be preserved"
assert_not_contains "$CODEX_USER_CONFIG_PROJECT_DIR/.codex/config.toml" "\\[agents\\]" "user-owned Codex config must not be overwritten by bundled defaults"
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];if(a.id!=='codex')process.exit(1);if(!Array.isArray(a.configFiles)||!a.configFiles.includes('config.toml'))process.exit(1);if(Array.isArray(a.installedConfigFiles)&&a.installedConfigFiles.includes('config.toml'))process.exit(1);if(a.managedConfigFiles&&a.managedConfigFiles['config.toml'])process.exit(1);" "$CODEX_USER_CONFIG_PROJECT_DIR/.ai-factory.json"

(cd "$CODEX_USER_CONFIG_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update --force > "$CODEX_USER_CONFIG_FORCE_OUTPUT" 2>&1)
assert_contains "$CODEX_USER_CONFIG_FORCE_OUTPUT" "Force mode enabled" "force update must print force mode"
assert_contains "$CODEX_USER_CONFIG_FORCE_OUTPUT" "Existing untracked config file \"config\\.toml\" detected" "force update must warn when preserving untracked Codex config"
assert_contains "$CODEX_USER_CONFIG_FORCE_OUTPUT" "config\\.toml \(untracked file exists\)" "force update must skip untracked Codex config"
assert_contains "$CODEX_USER_CONFIG_PROJECT_DIR/.codex/config.toml" "\\[user\\]" "force update must preserve user-owned Codex config"
assert_contains "$CODEX_USER_CONFIG_PROJECT_DIR/.codex/config.toml" "keep = true" "force update must preserve user-owned Codex config content"
assert_not_contains "$CODEX_USER_CONFIG_PROJECT_DIR/.codex/config.toml" "\\[agents\\]" "force update must not overwrite user-owned Codex config"
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];if(a.id!=='codex')process.exit(1);if(!Array.isArray(a.configFiles)||!a.configFiles.includes('config.toml'))process.exit(1);if(Array.isArray(a.installedConfigFiles)&&a.installedConfigFiles.includes('config.toml'))process.exit(1);if(a.managedConfigFiles&&a.managedConfigFiles['config.toml'])process.exit(1);" "$CODEX_USER_CONFIG_PROJECT_DIR/.ai-factory.json"

echo "codex user-owned config migration smoke tests passed"

# -------------------------------------------------------------------
# Package-removed config ownership smoke
# -------------------------------------------------------------------

CLAUDE_REMOVED_CONFIG_LOCAL_PROJECT_DIR="$TMPDIR/update-smoke-removed-config-local"
mkdir -p "$CLAUDE_REMOVED_CONFIG_LOCAL_PROJECT_DIR/.claude"

node - "$CLAUDE_REMOVED_CONFIG_LOCAL_PROJECT_DIR" <<'EOF'
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const projectDir = process.argv[2];
const oldConfig = '[managed]\nkeep = true\n';
const localConfig = `${oldConfig}\n[user]\nkeep = true\n`;
fs.writeFileSync(path.join(projectDir, '.claude/config.toml'), localConfig);

const oldHash = crypto.createHash('sha256')
  .update('path:config.toml\n')
  .update(Buffer.from(oldConfig))
  .update('\n')
  .digest('hex');

fs.writeFileSync(path.join(projectDir, '.ai-factory.json'), JSON.stringify({
  version: '2.4.0',
  agents: [{
    id: 'claude',
    skillsDir: '.claude/skills',
    installedSkills: ['aif'],
    configFiles: ['config.toml'],
    installedConfigFiles: ['config.toml'],
    managedConfigFiles: { 'config.toml': { sourceHash: oldHash, installedHash: oldHash } },
    mcp: {
      github: false,
      filesystem: false,
      postgres: false,
      chromeDevtools: false,
      playwright: false,
    },
  }],
  extensions: [],
}, null, 2) + '\n');
EOF

CLAUDE_REMOVED_CONFIG_LOCAL_OUTPUT="$TMPDIR/update-removed-config-local.log"
(cd "$CLAUDE_REMOVED_CONFIG_LOCAL_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$CLAUDE_REMOVED_CONFIG_LOCAL_OUTPUT" 2>&1)
assert_contains "$CLAUDE_REMOVED_CONFIG_LOCAL_OUTPUT" "removed from the package" "package-removed local config warning must be printed"
assert_contains "$CLAUDE_REMOVED_CONFIG_LOCAL_OUTPUT" "config\\.toml \(local changes preserved\)" "package-removed local config must be reported as preserved"
assert_exists "$CLAUDE_REMOVED_CONFIG_LOCAL_PROJECT_DIR/.claude/config.toml" "package-removed local config must remain on disk"
assert_contains "$CLAUDE_REMOVED_CONFIG_LOCAL_PROJECT_DIR/.claude/config.toml" "\\[user\\]" "package-removed local config must keep user section"
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];if(Array.isArray(a.configFiles)&&a.configFiles.length>0)process.exit(1);if(Array.isArray(a.installedConfigFiles)&&a.installedConfigFiles.length>0)process.exit(1);if(a.managedConfigFiles&&Object.keys(a.managedConfigFiles).length>0)process.exit(1);" "$CLAUDE_REMOVED_CONFIG_LOCAL_PROJECT_DIR/.ai-factory.json"

CLAUDE_REMOVED_CONFIG_CLEAN_PROJECT_DIR="$TMPDIR/update-smoke-removed-config-clean"
mkdir -p "$CLAUDE_REMOVED_CONFIG_CLEAN_PROJECT_DIR/.claude"

node - "$CLAUDE_REMOVED_CONFIG_CLEAN_PROJECT_DIR" <<'EOF'
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const projectDir = process.argv[2];
const oldConfig = '[managed]\nkeep = true\n';
fs.writeFileSync(path.join(projectDir, '.claude/config.toml'), oldConfig);

const oldHash = crypto.createHash('sha256')
  .update('path:config.toml\n')
  .update(Buffer.from(oldConfig))
  .update('\n')
  .digest('hex');

fs.writeFileSync(path.join(projectDir, '.ai-factory.json'), JSON.stringify({
  version: '2.4.0',
  agents: [{
    id: 'claude',
    skillsDir: '.claude/skills',
    installedSkills: ['aif'],
    configFiles: ['config.toml'],
    installedConfigFiles: ['config.toml'],
    managedConfigFiles: { 'config.toml': { sourceHash: oldHash, installedHash: oldHash } },
    mcp: {
      github: false,
      filesystem: false,
      postgres: false,
      chromeDevtools: false,
      playwright: false,
    },
  }],
  extensions: [],
}, null, 2) + '\n');
EOF

CLAUDE_REMOVED_CONFIG_CLEAN_OUTPUT="$TMPDIR/update-removed-config-clean.log"
(cd "$CLAUDE_REMOVED_CONFIG_CLEAN_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$CLAUDE_REMOVED_CONFIG_CLEAN_OUTPUT" 2>&1)
assert_contains "$CLAUDE_REMOVED_CONFIG_CLEAN_OUTPUT" "config\\.toml \(removed from package\)" "package-removed clean config must be reported as removed"
assert_not_exists "$CLAUDE_REMOVED_CONFIG_CLEAN_PROJECT_DIR/.claude/config.toml" "package-removed clean config must be deleted"
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];if(Array.isArray(a.configFiles)&&a.configFiles.length>0)process.exit(1);if(Array.isArray(a.installedConfigFiles)&&a.installedConfigFiles.length>0)process.exit(1);if(a.managedConfigFiles&&Object.keys(a.managedConfigFiles).length>0)process.exit(1);" "$CLAUDE_REMOVED_CONFIG_CLEAN_PROJECT_DIR/.ai-factory.json"

echo "package-removed config ownership smoke tests passed"

# -------------------------------------------------------------------
# Codex config source+target drift smoke
# -------------------------------------------------------------------

CODEX_CONFIG_SOURCE_TARGET_DRIFT_PROJECT_DIR="$TMPDIR/update-smoke-codex-config-source-target-drift"
mkdir -p "$CODEX_CONFIG_SOURCE_TARGET_DRIFT_PROJECT_DIR/.codex"

node - "$CODEX_CONFIG_SOURCE_TARGET_DRIFT_PROJECT_DIR" <<'EOF'
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const projectDir = process.argv[2];
const oldConfig = '[agents]\nmax_threads = 2\n';
const localConfig = `${oldConfig}\n[user]\nkeep = true\n`;
fs.writeFileSync(path.join(projectDir, '.codex/config.toml'), localConfig);

const oldHash = crypto.createHash('sha256')
  .update('path:config.toml\n')
  .update(Buffer.from(oldConfig))
  .update('\n')
  .digest('hex');

fs.writeFileSync(path.join(projectDir, '.ai-factory.json'), JSON.stringify({
  version: '2.4.0',
  agents: [{
    id: 'codex',
    skillsDir: '.codex/skills',
    installedSkills: ['aif'],
    configFiles: ['config.toml'],
    installedConfigFiles: ['config.toml'],
    managedConfigFiles: { 'config.toml': { sourceHash: oldHash, installedHash: oldHash } },
    mcp: {
      github: false,
      filesystem: false,
      postgres: false,
      chromeDevtools: false,
      playwright: false,
    },
  }],
  extensions: [],
}, null, 2) + '\n');
EOF

CODEX_CONFIG_SOURCE_TARGET_DRIFT_OUTPUT="$TMPDIR/update-codex-config-source-target-drift.log"
(cd "$CODEX_CONFIG_SOURCE_TARGET_DRIFT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$CODEX_CONFIG_SOURCE_TARGET_DRIFT_OUTPUT" 2>&1)
assert_contains "$CODEX_CONFIG_SOURCE_TARGET_DRIFT_OUTPUT" "Local modifications detected in config file" "Codex config source+target drift warning must be printed"
assert_contains "$CODEX_CONFIG_SOURCE_TARGET_DRIFT_OUTPUT" "config\\.toml \(local changes preserved\)" "Codex config source+target drift must be preserved on update"
assert_contains "$CODEX_CONFIG_SOURCE_TARGET_DRIFT_PROJECT_DIR/.codex/config.toml" "\\[user\\]" "Codex config source+target drift must keep user section"
assert_contains "$CODEX_CONFIG_SOURCE_TARGET_DRIFT_PROJECT_DIR/.codex/config.toml" "keep = true" "Codex config source+target drift must keep user content"
assert_contains "$CODEX_CONFIG_SOURCE_TARGET_DRIFT_PROJECT_DIR/.codex/config.toml" "max_threads = 2" "Codex config source+target drift must keep local old config"
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];const state=a.managedConfigFiles&&a.managedConfigFiles['config.toml'];if(!state||state.sourceHash===state.installedHash)process.exit(1);" "$CODEX_CONFIG_SOURCE_TARGET_DRIFT_PROJECT_DIR/.ai-factory.json"

echo "codex config source+target drift smoke tests passed"

# -------------------------------------------------------------------
# Codex TOML drift smoke
# -------------------------------------------------------------------

CODEX_AGENT_DRIFT_PROJECT_DIR="$TMPDIR/update-smoke-codex-agent-drift"
mkdir -p "$CODEX_AGENT_DRIFT_PROJECT_DIR"

cat > "$CODEX_AGENT_DRIFT_PROJECT_DIR/.ai-factory.json" << 'EOF'
{
  "version": "2.4.0",
  "agents": [
    {
      "id": "codex",
      "skillsDir": ".codex/skills",
      "installedSkills": ["aif"],
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

CODEX_AGENT_DRIFT_FIRST_OUTPUT="$TMPDIR/update-codex-agent-drift-first.log"
CODEX_AGENT_DRIFT_SECOND_OUTPUT="$TMPDIR/update-codex-agent-drift-second.log"

(cd "$CODEX_AGENT_DRIFT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$CODEX_AGENT_DRIFT_FIRST_OUTPUT" 2>&1)
echo "" >> "$CODEX_AGENT_DRIFT_PROJECT_DIR/.codex/agents/plan-coordinator.toml"
echo "# drift" >> "$CODEX_AGENT_DRIFT_PROJECT_DIR/.codex/agents/plan-coordinator.toml"

(cd "$CODEX_AGENT_DRIFT_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$CODEX_AGENT_DRIFT_SECOND_OUTPUT" 2>&1)
assert_contains "$CODEX_AGENT_DRIFT_SECOND_OUTPUT" "Local modifications detected in agent file" "Codex agent drift warning must be printed"
assert_contains "$CODEX_AGENT_DRIFT_SECOND_OUTPUT" "plan-coordinator\\.toml \(local drift\)" "Codex agent drift must be repaired on update"
assert_contains "$CODEX_AGENT_DRIFT_PROJECT_DIR/.codex/agents/plan-coordinator.toml" "name = \"plan-coordinator\"" "Codex agent TOML content must be restored"
assert_contains "$CODEX_AGENT_DRIFT_PROJECT_DIR/.codex/agents/plan-coordinator.toml" "HANDOFF_MODE" "Codex plan coordinator handoff guidance must survive update repair"
assert_contains "$CODEX_AGENT_DRIFT_PROJECT_DIR/.codex/agents/plan-coordinator.toml" "HANDOFF_TASK_ID" "Codex plan coordinator task identity guidance must survive update repair"
assert_contains "$CODEX_AGENT_DRIFT_PROJECT_DIR/.codex/agents/implement-coordinator.toml" "HANDOFF_SKIP_REVIEW" "Codex implement coordinator handoff guidance must remain installed"
assert_contains "$CODEX_AGENT_DRIFT_PROJECT_DIR/.codex/agents/implement-worker.toml" "Workers never own Handoff status sync" "Codex worker must preserve coordinator-owned Handoff sync contract"

echo "codex agent drift smoke tests passed"

# -------------------------------------------------------------------
# Combined claude+codex init -> update round-trip smoke
# -------------------------------------------------------------------

ROUNDTRIP_PROJECT_DIR="$TMPDIR/update-smoke-roundtrip"
mkdir -p "$ROUNDTRIP_PROJECT_DIR"

AIF_TEST_ROOT_DIR="$ROOT_DIR" AIF_TEST_PROJECT_DIR="$ROUNDTRIP_PROJECT_DIR" node --input-type=module > /dev/null 2>&1 <<'EOF'
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

ROUNDTRIP_OUTPUT="$TMPDIR/update-roundtrip.log"
(cd "$ROUNDTRIP_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$ROUNDTRIP_OUTPUT" 2>&1)
assert_contains "$ROUNDTRIP_OUTPUT" "\[claude\] Agent files:" "Round-trip update must still report Claude agent files"
assert_contains "$ROUNDTRIP_OUTPUT" "\[codex\] Agent files:" "Round-trip update must still report Codex agent files"
assert_contains "$ROUNDTRIP_OUTPUT" "\[codex\] Config files:" "Round-trip update must still report Codex config files"
assert_exists "$ROUNDTRIP_PROJECT_DIR/.claude/agents/plan-coordinator.md" "Round-trip project must preserve Claude agents"
assert_exists "$ROUNDTRIP_PROJECT_DIR/.codex/agents/plan-coordinator.toml" "Round-trip project must preserve Codex agents"
assert_exists "$ROUNDTRIP_PROJECT_DIR/.codex/config.toml" "Round-trip project must preserve Codex config"

echo "combined init-update round-trip smoke tests passed"

# -------------------------------------------------------------------
# Claude-only upgrade smoke
# -------------------------------------------------------------------

UPGRADE_CLAUDE_PROJECT_DIR="$TMPDIR/upgrade-smoke-claude-only"
mkdir -p "$UPGRADE_CLAUDE_PROJECT_DIR"

cat > "$UPGRADE_CLAUDE_PROJECT_DIR/.ai-factory.json" << 'EOF'
{
  "version": "1.9.0",
  "agents": [
    {
      "id": "claude",
      "skillsDir": ".claude/skills",
      "installedSkills": ["aif"],
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

UPGRADE_CLAUDE_OUTPUT="$TMPDIR/upgrade-claude-only.log"
(cd "$UPGRADE_CLAUDE_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" upgrade > "$UPGRADE_CLAUDE_OUTPUT" 2>&1)
assert_contains "$UPGRADE_CLAUDE_OUTPUT" "Upgrade to v2 complete" "Claude-only upgrade should complete"
assert_exists "$UPGRADE_CLAUDE_PROJECT_DIR/.claude/agents/plan-polisher.md" "Claude-only upgrade should install Claude agent files"
assert_not_exists "$UPGRADE_CLAUDE_PROJECT_DIR/.codex/config.toml" "Claude-only upgrade must not create Codex config"
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];if(a.id!=='claude')process.exit(1);if(Array.isArray(a.configFiles)&&a.configFiles.length>0)process.exit(1);if(Array.isArray(a.installedConfigFiles)&&a.installedConfigFiles.length>0)process.exit(1);if(a.managedConfigFiles&&Object.keys(a.managedConfigFiles).length>0)process.exit(1);" "$UPGRADE_CLAUDE_PROJECT_DIR/.ai-factory.json"

echo "claude-only upgrade smoke tests passed"

# -------------------------------------------------------------------
# Legacy Claude migration smoke
# -------------------------------------------------------------------

LEGACY_CLAUDE_PROJECT_DIR="$TMPDIR/update-smoke-legacy-claude"
mkdir -p "$LEGACY_CLAUDE_PROJECT_DIR/.claude/agents"

cp "$ROOT_DIR/subagents/claude/agents/plan-polisher.md" "$LEGACY_CLAUDE_PROJECT_DIR/.claude/agents/plan-polisher.md"

cat > "$LEGACY_CLAUDE_PROJECT_DIR/.ai-factory.json" << 'EOF'
{
  "version": "2.4.0",
  "agents": [
    {
      "id": "claude",
      "skillsDir": ".claude/skills",
      "installedSkills": ["aif"],
      "subagentsDir": ".claude/agents",
      "installedSubagents": ["plan-polisher.md"],
      "managedSubagents": {},
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

LEGACY_CLAUDE_OUTPUT="$TMPDIR/update-legacy-claude.log"
(cd "$LEGACY_CLAUDE_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$LEGACY_CLAUDE_OUTPUT" 2>&1)
assert_contains "$LEGACY_CLAUDE_OUTPUT" "\[claude\] Agent files:" "legacy claude config must still update bundled agent files"
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];if('subagentsDir' in a || 'installedSubagents' in a || 'managedSubagents' in a)process.exit(1);if(a.agentsDir!=='.claude/agents')process.exit(1);if(!Array.isArray(a.installedAgentFiles)||!a.installedAgentFiles.includes('plan-polisher.md'))process.exit(1);if(!a.managedAgentFiles||!a.managedAgentFiles['plan-polisher.md'])process.exit(1);" "$LEGACY_CLAUDE_PROJECT_DIR/.ai-factory.json"

echo "legacy claude migration smoke tests passed"

# -------------------------------------------------------------------
# Legacy extension agent file migration smoke: update should backfill
# agentFileSources for pre-metadata configs without dropping tracked
# extension-managed files.
# -------------------------------------------------------------------

LEGACY_EXTENSION_DIR="$TMPDIR/legacy-extension-agent-files"
LEGACY_EXTENSION_PROJECT_DIR="$TMPDIR/update-smoke-legacy-extension-agent-files"
create_bounded_helper_extension_fixture "$LEGACY_EXTENSION_DIR"
mkdir -p "$LEGACY_EXTENSION_PROJECT_DIR"

(cd "$LEGACY_EXTENSION_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" init --agents claude,codex --skills aif,aif-improve > "$TMPDIR/update-legacy-extension-base.log" 2>&1)
(cd "$LEGACY_EXTENSION_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" extension add "$LEGACY_EXTENSION_DIR" > "$TMPDIR/update-legacy-extension-add.log" 2>&1)

node - "$LEGACY_EXTENSION_PROJECT_DIR/.ai-factory.json" <<'EOF'
const fs = require('fs');
const configPath = process.argv[2];
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const codex = cfg.agents.find(agent => agent.id === 'codex');
if (!codex) process.exit(1);
delete codex.agentFileSources;
fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
EOF

LEGACY_EXTENSION_OUTPUT="$TMPDIR/update-legacy-extension.log"
(cd "$LEGACY_EXTENSION_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$LEGACY_EXTENSION_OUTPUT" 2>&1)
assert_contains "$LEGACY_EXTENSION_OUTPUT" "bounded-plan-polisher\\.toml \(extension refresh\)" "legacy extension agent file config must still refresh managed extension files"
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const codex=c.agents.find(a=>a.id==='codex');if(!codex)process.exit(1);if(!Array.isArray(codex.installedAgentFiles)||!codex.installedAgentFiles.includes('bounded-plan-polisher.toml'))process.exit(1);if(!codex.managedAgentFiles||!codex.managedAgentFiles['bounded-plan-polisher.toml'])process.exit(1);if(!codex.agentFileSources||codex.agentFileSources['bounded-plan-polisher.toml']?.kind!=='extension'||codex.agentFileSources['bounded-plan-polisher.toml']?.extensionName!=='aif-ext-bounded-helpers')process.exit(1);" "$LEGACY_EXTENSION_PROJECT_DIR/.ai-factory.json"

echo "legacy extension agent file migration smoke tests passed"

# -------------------------------------------------------------------
# Bounded helper extension update smoke: update should re-apply the
# canonical /aif-improve injection contract and heal bounded Codex
# helper drift.
# -------------------------------------------------------------------

BOUNDED_EXTENSION_DIR="$TMPDIR/bounded-helper-extension"
BOUNDED_PROJECT_DIR="$TMPDIR/update-smoke-bounded-helper-extension"
create_bounded_helper_extension_fixture "$BOUNDED_EXTENSION_DIR"
mkdir -p "$BOUNDED_PROJECT_DIR"

(cd "$BOUNDED_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" init --agents claude,codex --skills aif,aif-improve > "$TMPDIR/update-bounded-base.log" 2>&1)
(cd "$BOUNDED_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" extension add "$BOUNDED_EXTENSION_DIR" > "$TMPDIR/update-bounded-add.log" 2>&1)
(cd "$BOUNDED_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" init --agents claude,codex --skills aif,aif-improve > "$TMPDIR/update-bounded-reinit.log" 2>&1)

echo "<!-- drift -->" >> "$BOUNDED_PROJECT_DIR/.claude/skills/aif-improve/SKILL.md"
rm "$BOUNDED_PROJECT_DIR/.codex/agents/bounded-plan-polisher.toml"

BOUNDED_UPDATE_OUTPUT="$TMPDIR/update-bounded.log"
(cd "$BOUNDED_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$BOUNDED_UPDATE_OUTPUT" 2>&1)

assert_contains "$BOUNDED_PROJECT_DIR/.claude/skills/aif-improve/SKILL.md" "canonical refinement command for this extension workflow" "bounded helper update must re-apply the canonical improve override"
assert_contains "$BOUNDED_PROJECT_DIR/.codex/skills/aif-improve/SKILL.md" "canonical refinement command for this extension workflow" "bounded helper update must keep Codex improve override in sync"
assert_contains "$BOUNDED_PROJECT_DIR/.claude/skills/aif-improve/SKILL.md" "runtime-specific delegation prompts" "bounded helper update must preserve the runtime warning"
assert_not_contains "$BOUNDED_PROJECT_DIR/.claude/skills/aif-improve/SKILL.md" "<!-- drift -->" "bounded helper update must heal local drift in injected improve skill copies"
assert_exists "$BOUNDED_PROJECT_DIR/.codex/agents/bounded-plan-polisher.toml" "bounded helper update must restore the Codex plan-polisher helper"
assert_contains "$BOUNDED_PROJECT_DIR/.codex/agents/bounded-plan-polisher.toml" "Bounded one-shot worker" "bounded helper update must restore the current Codex helper contract"
assert_contains "$BOUNDED_PROJECT_DIR/.codex/agents/bounded-plan-polisher.toml" 'model = "gpt-5.4-mini"' "bounded helper update must restore the bounded mini model"
assert_contains "$BOUNDED_PROJECT_DIR/.codex/agents/bounded-plan-polisher.toml" 'model_reasoning_effort = "medium"' "bounded helper update must restore the canonical reasoning key"
assert_contains "$BOUNDED_PROJECT_DIR/.codex/agents/bounded-plan-polisher.toml" 'sandbox_mode = "read-only"' "bounded helper update must restore the read-only sandbox mode"
assert_contains "$BOUNDED_PROJECT_DIR/.codex/agents/bounded-plan-polisher.toml" "advisory only" "bounded helper update must restore the advisory-only contract"
assert_not_contains "$BOUNDED_PROJECT_DIR/.codex/agents/bounded-plan-polisher.toml" '^reasoning_effort = ' "bounded helper update must not restore legacy reasoning key"
assert_not_contains "$BOUNDED_PROJECT_DIR/.codex/agents/bounded-plan-polisher.toml" '^prompt = """' "bounded helper update must not restore legacy prompt key"
assert_contains "$BOUNDED_UPDATE_OUTPUT" "bounded-plan-polisher\\.toml \(extension refresh\)" "bounded helper update must report extension-managed refreshes"
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const codex=c.agents.find(a=>a.id==='codex');if(!codex||!Array.isArray(codex.installedAgentFiles)||!codex.installedAgentFiles.includes('bounded-plan-polisher.toml'))process.exit(1);if(!codex.managedAgentFiles||!codex.managedAgentFiles['bounded-plan-polisher.toml'])process.exit(1);if(!codex.agentFileSources||codex.agentFileSources['bounded-plan-polisher.toml']?.kind!=='extension'||codex.agentFileSources['bounded-plan-polisher.toml']?.extensionName!=='aif-ext-bounded-helpers')process.exit(1);" "$BOUNDED_PROJECT_DIR/.ai-factory.json"

rm "$BOUNDED_PROJECT_DIR/.ai-factory/extensions/aif-ext-bounded-helpers/extension.json"
BROKEN_BOUNDED_UPDATE_OUTPUT="$TMPDIR/update-bounded-broken-manifest.log"
(cd "$BOUNDED_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$BROKEN_BOUNDED_UPDATE_OUTPUT" 2>&1)
assert_contains "$BROKEN_BOUNDED_UPDATE_OUTPUT" 'agent file manifest missing — preserving tracked agent file state' "ordinary update must warn when extension manifest is missing"
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const codex=c.agents.find(a=>a.id==='codex');if(!codex)process.exit(1);if(!Array.isArray(codex.installedAgentFiles)||!codex.installedAgentFiles.includes('bounded-plan-polisher.toml'))process.exit(1);if(!codex.managedAgentFiles||!codex.managedAgentFiles['bounded-plan-polisher.toml'])process.exit(1);if(!codex.agentFileSources||codex.agentFileSources['bounded-plan-polisher.toml']?.extensionName!=='aif-ext-bounded-helpers')process.exit(1);" "$BOUNDED_PROJECT_DIR/.ai-factory.json"

printf '{ invalid json' > "$BOUNDED_PROJECT_DIR/.ai-factory/extensions/aif-ext-bounded-helpers/extension.json"
MALFORMED_BOUNDED_UPDATE_OUTPUT="$TMPDIR/update-bounded-malformed-manifest.log"
(cd "$BOUNDED_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$MALFORMED_BOUNDED_UPDATE_OUTPUT" 2>&1)
assert_contains "$MALFORMED_BOUNDED_UPDATE_OUTPUT" 'agent file manifest missing' "ordinary update must warn when extension manifest is invalid"
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const codex=c.agents.find(a=>a.id==='codex');if(!codex)process.exit(1);if(!Array.isArray(codex.installedAgentFiles)||!codex.installedAgentFiles.includes('bounded-plan-polisher.toml'))process.exit(1);if(!codex.managedAgentFiles||!codex.managedAgentFiles['bounded-plan-polisher.toml'])process.exit(1);if(!codex.agentFileSources||codex.agentFileSources['bounded-plan-polisher.toml']?.extensionName!=='aif-ext-bounded-helpers')process.exit(1);" "$BOUNDED_PROJECT_DIR/.ai-factory.json"

echo "bounded helper extension update smoke tests passed"
