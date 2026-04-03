#!/bin/bash
# Smoke tests: validates ai-factory update status model and --force behavior

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

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
# Kilo Code workflow smoke: action skills should install as workflows
# and no longer remain under .kilocode/skills/.
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
      "installedSkills": ["aif", "aif-plan", "aif-commit", "aif-docs"],
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
assert_contains "$KILO_PROJECT_DIR/.kilocode/workflows/aif-plan.md" "/aif:[a-z-]+" "Kilo workflow content must use Kilo invocation syntax"
assert_exists "$KILO_PROJECT_DIR/.kilocode/skills/aif-docs/SKILL.md" "non-workflow Kilo skills must remain in skills/"
assert_not_exists "$KILO_PROJECT_DIR/.kilocode/skills/aif" "workflow skill should not remain in skills/"
assert_not_exists "$KILO_PROJECT_DIR/.kilocode/skills/aif-plan" "workflow skill should not remain in skills/"
assert_not_exists "$KILO_PROJECT_DIR/.kilocode/skills/aif-commit" "workflow skill should not remain in skills/"

echo "kilocode workflow smoke tests passed"

# -------------------------------------------------------------------
# Claude subagents smoke: update should install bundled subagents,
# persist subagent state in config, and heal local drift.
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

# First update should add bundled Claude subagents and persist state.
(cd "$CLAUDE_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$CLAUDE_FIRST_OUTPUT" 2>&1)
assert_contains "$CLAUDE_FIRST_OUTPUT" "\[claude\] Subagents:" "claude subagents section must be printed"
assert_contains "$CLAUDE_FIRST_OUTPUT" "loop-orchestrator\\.md \(new in package\)" "new bundled subagent must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/best-practices-sidecar.md" "best-practices sidecar must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/commit-preparer.md" "commit preparer must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/docs-auditor.md" "docs auditor must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/implement-worker.md" "implement worker must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/loop-orchestrator.md" "bundled Claude subagent must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/plan-polisher.md" "planning subagent must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/review-sidecar.md" "review sidecar must be installed"
assert_exists "$CLAUDE_PROJECT_DIR/.claude/agents/security-sidecar.md" "security sidecar must be installed"

node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];if(a.subagentsDir!=='.claude/agents')process.exit(1);if(!Array.isArray(a.installedSubagents)||!a.installedSubagents.includes('best-practices-sidecar.md')||!a.installedSubagents.includes('commit-preparer.md')||!a.installedSubagents.includes('docs-auditor.md')||!a.installedSubagents.includes('implement-worker.md')||!a.installedSubagents.includes('loop-orchestrator.md')||!a.installedSubagents.includes('plan-polisher.md')||!a.installedSubagents.includes('review-sidecar.md')||!a.installedSubagents.includes('security-sidecar.md'))process.exit(1);if(!a.managedSubagents||!a.managedSubagents['best-practices-sidecar.md']||!a.managedSubagents['commit-preparer.md']||!a.managedSubagents['docs-auditor.md']||!a.managedSubagents['implement-worker.md']||!a.managedSubagents['loop-orchestrator.md']||!a.managedSubagents['plan-polisher.md']||!a.managedSubagents['review-sidecar.md']||!a.managedSubagents['security-sidecar.md'])process.exit(1);" "$CLAUDE_PROJECT_DIR/.ai-factory.json"

# Modify one managed subagent to simulate local drift, then update again.
echo "" >> "$CLAUDE_PROJECT_DIR/.claude/agents/loop-orchestrator.md"
echo "<!-- drift -->" >> "$CLAUDE_PROJECT_DIR/.claude/agents/loop-orchestrator.md"

(cd "$CLAUDE_PROJECT_DIR" && node "$ROOT_DIR/dist/cli/index.js" update > "$CLAUDE_SECOND_OUTPUT" 2>&1)
assert_contains "$CLAUDE_SECOND_OUTPUT" "Local modifications detected in subagent" "local drift warning must be printed"
assert_contains "$CLAUDE_SECOND_OUTPUT" "loop-orchestrator\\.md \(local drift\)" "subagent drift must be repaired on update"
assert_contains "$CLAUDE_PROJECT_DIR/.claude/agents/loop-orchestrator.md" "name: loop-orchestrator" "reinstalled subagent content must be restored"

echo "claude subagents smoke tests passed"
