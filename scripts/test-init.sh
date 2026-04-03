#!/bin/bash
# Smoke tests: validates ai-factory init for Claude Code subagent installation

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
assert_contains "$INIT_OUTPUT" "Subagents directory:" "Claude init summary must include subagents directory"
assert_contains "$INIT_OUTPUT" "Installed subagents: ${EXPECTED_SUBAGENTS}" "Claude init summary must report installed subagents"
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
  echo "Assertion failed: Claude init must install all bundled subagents"
  echo "Expected subagents: $EXPECTED_SUBAGENTS"
  echo "Actual subagents: $ACTUAL_SUBAGENTS"
  exit 1
fi

EXPECTED_SUBAGENTS="$EXPECTED_SUBAGENTS" node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const a=c.agents[0];const expected=Number(process.env.EXPECTED_SUBAGENTS);if(a.id!=='claude')process.exit(1);if(a.subagentsDir!=='.claude/agents')process.exit(1);if(!Array.isArray(a.installedSubagents)||a.installedSubagents.length!==expected)process.exit(1);if(!a.installedSubagents.includes('best-practices-sidecar.md'))process.exit(1);if(!a.installedSubagents.includes('commit-preparer.md'))process.exit(1);if(!a.installedSubagents.includes('docs-auditor.md'))process.exit(1);if(!a.installedSubagents.includes('implement-worker.md'))process.exit(1);if(!a.installedSubagents.includes('loop-orchestrator.md'))process.exit(1);if(!a.installedSubagents.includes('plan-polisher.md'))process.exit(1);if(!a.installedSubagents.includes('review-sidecar.md'))process.exit(1);if(!a.installedSubagents.includes('security-sidecar.md'))process.exit(1);if(!a.managedSubagents||Object.keys(a.managedSubagents).length!==expected)process.exit(1);" "$PROJECT_DIR/.ai-factory.json"

echo "claude init smoke tests passed"
