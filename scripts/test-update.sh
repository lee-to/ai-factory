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

# First update: should repair missing managed state and remove missing package skill.
run_update normal "$FIRST_OUTPUT"
assert_contains "$FIRST_OUTPUT" "\[universal\] Status:" "status section must be printed"
assert_contains "$FIRST_OUTPUT" "changed: [0-9]+" "changed counter must be printed"
assert_contains "$FIRST_OUTPUT" "skipped: [0-9]+" "skipped counter must be printed"
assert_contains "$FIRST_OUTPUT" "removed: [0-9]+" "removed counter must be printed"
assert_contains "$FIRST_OUTPUT" "aif-nonexistent \(removed from package\)" "removed package skill must be reported"
assert_contains "$FIRST_OUTPUT" "WARN: managed state recovered" "managed state recovery warning expected on first run"

# Managed state should be persisted after first run.
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const m=c.agents[0].managedSkills||{};if(!m['aif']||!m['aif-plan']){process.exit(1);}" "$PROJECT_DIR/.ai-factory.json"

# Second update: should converge to unchanged for tracked skills.
run_update normal "$SECOND_OUTPUT"
assert_contains "$SECOND_OUTPUT" "unchanged: [0-9]+" "unchanged counter must be printed"
assert_contains "$SECOND_OUTPUT" "changed: 0" "second run should not report changed skills in steady state"

# Force update: should report force mode and changed entries.
run_update force "$FORCE_OUTPUT"
assert_contains "$FORCE_OUTPUT" "Force mode enabled" "force mode banner expected"
assert_contains "$FORCE_OUTPUT" "changed: [0-9]+" "force run should report changed skills"
assert_contains "$FORCE_OUTPUT" "force reinstall" "force reason should be visible"

echo "update smoke tests passed"

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

# First update installs baseline antigravity layout.
(cd "$AG_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$AG_FIRST_OUTPUT" 2>&1)
assert_contains "$AG_FIRST_OUTPUT" "\[antigravity\] Status:" "antigravity status section must be printed"

# Seed custom workflow reference that must survive force update.
mkdir -p "$AG_PROJECT_DIR/.agent/workflows/references/custom"
cat > "$AG_PROJECT_DIR/.agent/workflows/references/custom/keep.md" << 'EOF'
# custom reference
keep-me
EOF

# Seed stale files under managed skill dir that should be cleaned by force.
mkdir -p "$AG_PROJECT_DIR/.agent/skills/aif-docs/references"
cat > "$AG_PROJECT_DIR/.agent/skills/aif-docs/stale.txt" << 'EOF'
stale
EOF
cat > "$AG_PROJECT_DIR/.agent/skills/aif-docs/references/stale.md" << 'EOF'
stale-ref
EOF

# Force update.
(cd "$AG_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update --force > "$AG_FORCE_OUTPUT" 2>&1)

# Force output assertions.
assert_contains "$AG_FORCE_OUTPUT" "Force mode enabled" "force mode banner expected for antigravity"
assert_contains "$AG_FORCE_OUTPUT" "\[antigravity\] Status:" "antigravity status section must be printed on force run"
assert_contains "$AG_FORCE_OUTPUT" "aif \(force reinstall\)" "workflow skill should be force reinstalled"
assert_contains "$AG_FORCE_OUTPUT" "aif-docs \(force reinstall\)" "non-workflow skill should be force reinstalled"
assert_contains "$AG_FORCE_OUTPUT" "\[antigravity\] Custom skills \(preserved\):" "custom skills section should be printed"
assert_contains "$AG_FORCE_OUTPUT" "custom/workflow-ref" "custom skill reference should be preserved in config"

# Filesystem assertions for requested antigravity force behavior.
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
# Claude agent files smoke: update should install bundled Claude files,
# persist universal agent file state in config, and heal local drift.
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

# First update should add bundled Claude agent files and persist state.
(cd "$CLAUDE_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$CLAUDE_FIRST_OUTPUT" 2>&1)
assert_contains "$CLAUDE_FIRST_OUTPUT" "\[claude\] Agent files:" "claude agent files section must be printed"
assert_contains "$CLAUDE_FIRST_OUTPUT" "loop-orchestrator\\.md \(new in package\)" "new bundled agent file must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/best-practices-sidecar.md" "best-practices sidecar must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/commit-preparer.md" "commit preparer must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/docs-auditor.md" "docs auditor must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/implement-worker.md" "implement worker must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/loop-orchestrator.md" "bundled Claude agent file must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/plan-polisher.md" "planning agent file must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/review-sidecar.md" "review sidecar must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/security-sidecar.md" "security sidecar must be installed"

node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];if(a.agentsDir!=='.claude/agents')process.exit(1);if(!Array.isArray(a.installedAgentFiles)||!a.installedAgentFiles.includes('best-practices-sidecar.md')||!a.installedAgentFiles.includes('commit-preparer.md')||!a.installedAgentFiles.includes('docs-auditor.md')||!a.installedAgentFiles.includes('implement-worker.md')||!a.installedAgentFiles.includes('loop-orchestrator.md')||!a.installedAgentFiles.includes('plan-polisher.md')||!a.installedAgentFiles.includes('review-sidecar.md')||!a.installedAgentFiles.includes('security-sidecar.md'))process.exit(1);if(!a.managedAgentFiles||!a.managedAgentFiles['best-practices-sidecar.md']||!a.managedAgentFiles['commit-preparer.md']||!a.managedAgentFiles['docs-auditor.md']||!a.managedAgentFiles['implement-worker.md']||!a.managedAgentFiles['loop-orchestrator.md']||!a.managedAgentFiles['plan-polisher.md']||!a.managedAgentFiles['review-sidecar.md']||!a.managedAgentFiles['security-sidecar.md'])process.exit(1);if(!a.agentFileSources||a.agentFileSources['plan-polisher.md']?.kind!=='bundled')process.exit(1);" "$CLAUDE_PROJECT_DIR/.ai-factory.json"

# Modify one managed agent file to simulate local drift, then update again.
echo "" >> "$CLAUDE_PROJECT_DIR/.claude/agents/loop-orchestrator.md"
echo "<!-- drift -->" >> "$CLAUDE_PROJECT_DIR/.claude/agents/loop-orchestrator.md"

(cd "$CLAUDE_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$CLAUDE_SECOND_OUTPUT" 2>&1)
assert_contains "$CLAUDE_SECOND_OUTPUT" "Local modifications detected in agent file" "local drift warning must be printed"
assert_contains "$CLAUDE_SECOND_OUTPUT" "loop-orchestrator\\.md \(local drift\)" "agent file drift must be repaired on update"
assert_contains "$CLAUDE_PROJECT_DIR/.claude/agents/loop-orchestrator.md" "name: loop-orchestrator" "reinstalled agent file content must be restored"

echo "claude agent files smoke tests passed"

# -------------------------------------------------------------------
# Legacy Claude migration smoke: update should read old subagents*
# keys and persist only the universal agent-file state on save.
# -------------------------------------------------------------------

LEGACY_CLAUDE_PROJECT_DIR="$TMPDIR/update-smoke-legacy-claude"
mkdir -p "$LEGACY_CLAUDE_PROJECT_DIR/.claude/agents"

cp "$ROOT_DIR/subagents/plan-polisher.md" "$LEGACY_CLAUDE_PROJECT_DIR/.claude/agents/plan-polisher.md"

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
