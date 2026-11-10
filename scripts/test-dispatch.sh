#!/bin/bash
# Test suite for cross-agent dispatch CLI command
# Usage: ./scripts/test-dispatch.sh (requires `npm run build` first)
#
# Contract under test:
# - no-config / no-phase-entry → exit 0 with EMPTY stdout AND stderr (silent no-op)
# - unknown phase / agent      → exit 2, diagnostic on stderr, stdout empty
# - manual mode / --print      → structured argv block on stdout ("Command:" / "Args:",
#                                one argv element per line, copy-safe for any prompt)
# - auto mode                  → spawns the configured argv template as one argv per token
#                                (no shell), bounded by phases.<phase>.timeoutMs
# - init round-trip            → `ai-factory init` preserves dispatch/phases/dispatchAgents

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

PASSED=0
FAILED=0

pass() { PASSED=$((PASSED + 1)); echo -e "  ${GREEN}✓${NC} $1"; }
fail() { FAILED=$((FAILED + 1)); echo -e "  ${RED}✗${NC} $1"; if [[ -n "${2:-}" ]]; then echo -e "      ${YELLOW}$2${NC}"; fi; }

# stdout/stderr are captured separately on purpose: the aif-loop dispatch contract distinguishes
# "no block on stdout" (continue in-process) from stderr diagnostics (tool error noise).
RUN_STDOUT=""
RUN_STDERR=""
RUN_STATUS=0

TEST_TMPDIR="$(mktemp -d)"
STDERR_FILE="$TEST_TMPDIR/stderr.txt"
trap 'rm -rf "$TEST_TMPDIR"' EXIT

run_cli() {
    local dir="$1"
    shift
    RUN_STDOUT=$( (cd "$dir" && node "$ROOT/dist/cli/index.js" "$@") 2>"$STDERR_FILE" ) && RUN_STATUS=0 || RUN_STATUS=$?
    RUN_STDERR=$(cat "$STDERR_FILE" 2>/dev/null || true)
}

# Fake dispatch agents as node scripts with RELATIVE names (copied into each case dir):
# `node fake-argv.js` and `node fake-sleep.js` resolve against the spawned process cwd,
# which keeps the suite portable across Linux CI and Windows Git Bash (no PATH lookup,
# no shebang execution, no spaces in paths).
cat > "$TEST_TMPDIR/fake-argv.js" << 'EOF'
const fs = require('fs');
fs.writeFileSync('argv.log', process.argv.slice(2).map(a => JSON.stringify(a)).join('\n') + '\n');
EOF
cat > "$TEST_TMPDIR/fake-sleep.js" << 'EOF'
setTimeout(() => {}, 30000);
EOF

write_config() {
    local dir="$1"; shift
    mkdir -p "$dir"
    cp "$TEST_TMPDIR/fake-argv.js" "$TEST_TMPDIR/fake-sleep.js" "$dir/" 2>/dev/null || true
    cat > "$dir/.ai-factory.json"
}

echo -e "${BOLD}Starting Dispatch tests...${NC}"

# Case 1: Manual round-trip renders a structured argv block (stderr empty)
TMP_CASE1="$TEST_TMPDIR/case1"
write_config "$TMP_CASE1" << 'EOF'
{
  "version": "2.22.0",
  "agents": [],
  "dispatch": "manual",
  "phases": {
    "plan": { "agent": "claude-code", "model": "opus" }
  }
}
EOF

run_cli "$TMP_CASE1" dispatch plan

if [ $RUN_STATUS -eq 0 ] \
   && echo "$RUN_STDOUT" | grep -q "Cross-agent dispatch: plan" \
   && echo "$RUN_STDOUT" | grep -q "claude-code" \
   && echo "$RUN_STDOUT" | grep -q "opus" \
   && echo "$RUN_STDOUT" | grep -q "Mode  : manual" \
   && echo "$RUN_STDOUT" | grep -Fxq "Command: claude" \
   && echo "$RUN_STDOUT" | grep -Fxq "Args:" \
   && echo "$RUN_STDOUT" | grep -Fxq "  --model" \
   && echo "$RUN_STDOUT" | grep -Fxq "  opus" \
   && echo "$RUN_STDOUT" | grep -Fxq "  -p" \
   && echo "$RUN_STDOUT" | grep -Fxq "  Run the plan phase of the aif-loop." \
   && [ -z "$RUN_STDERR" ]; then
  pass "Case 1: Manual round-trip (structured argv block, empty stderr)"
else
  fail "Case 1: Manual round-trip" "Status: $RUN_STATUS, Stdout: $RUN_STDOUT, Stderr: $RUN_STDERR"
fi

# Case 2: Manual render is copy-safe for shell-metachar prompts (stays ONE argv element)
TMP_CASE2="$TEST_TMPDIR/case2"
write_config "$TMP_CASE2" << 'EOF'
{
  "version": "2.22.0",
  "agents": [],
  "dispatch": "manual",
  "phases": {
    "plan": { "agent": "claude-code", "model": "opus" }
  }
}
EOF

run_cli "$TMP_CASE2" dispatch plan --prompt 'do the plan; echo leaked $(rm -rf /) `id`'

if [ $RUN_STATUS -eq 0 ] \
   && echo "$RUN_STDOUT" | grep -Fxq "  do the plan; echo leaked \$(rm -rf /) \`id\`" \
   && ! echo "$RUN_STDOUT" | grep -Fxq "  echo leaked \$(rm -rf /) \`id\`"; then
  pass "Case 2: Manual render keeps shell-metachar prompt as one argv element"
else
  fail "Case 2: Manual render copy-safe" "Status: $RUN_STATUS, Stdout: $RUN_STDOUT"
fi

# Case 3: defaultModel fallback
TMP_CASE3="$TEST_TMPDIR/case3"
write_config "$TMP_CASE3" << 'EOF'
{
  "version": "2.22.0",
  "agents": [],
  "dispatch": "manual",
  "phases": {
    "prepare": { "agent": "antigravity" }
  }
}
EOF

run_cli "$TMP_CASE3" dispatch prepare

if [ $RUN_STATUS -eq 0 ] \
   && echo "$RUN_STDOUT" | grep -Fxq "Command: antigravity" \
   && echo "$RUN_STDOUT" | grep -Fxq "  --model" \
   && echo "$RUN_STDOUT" | grep -Fxq "  gemini-3.5-flash" \
   && echo "$RUN_STDOUT" | grep -Fxq "  --prompt" \
   && echo "$RUN_STDOUT" | grep -Fxq "  Run the prepare phase of the aif-loop."; then
  pass "Case 3: defaultModel fallback"
else
  fail "Case 3: defaultModel fallback" "Status: $RUN_STATUS, Stdout: $RUN_STDOUT"
fi

# Case 4: Unknown phase → exit 2, stderr diagnostic, stdout empty
TMP_CASE4="$TEST_TMPDIR/case4"
write_config "$TMP_CASE4" << 'EOF'
{
  "version": "2.22.0",
  "agents": [],
  "dispatch": "manual",
  "phases": {}
}
EOF

run_cli "$TMP_CASE4" dispatch frobnicate

if [ $RUN_STATUS -eq 2 ] \
   && echo "$RUN_STDERR" | grep -q "Unknown phase 'frobnicate'" \
   && echo "$RUN_STDERR" | grep -q "implement" \
   && echo "$RUN_STDERR" | grep -q "review" \
   && [ -z "$RUN_STDOUT" ]; then
  pass "Case 4: Unknown phase (exit 2, stderr only, lists spec-driven phases)"
else
  fail "Case 4: Unknown phase" "Status: $RUN_STATUS, Stdout: $RUN_STDOUT, Stderr: $RUN_STDERR"
fi

# Case 5: Silent no-op — no dispatch config at all → exit 0, stdout AND stderr empty
TMP_CASE5="$TEST_TMPDIR/case5"
write_config "$TMP_CASE5" << 'EOF'
{
  "version": "2.22.0",
  "agents": []
}
EOF

run_cli "$TMP_CASE5" dispatch plan

if [ $RUN_STATUS -eq 0 ] && [ -z "$RUN_STDOUT" ] && [ -z "$RUN_STDERR" ]; then
  pass "Case 5: No dispatch config → silent no-op (empty stdout and stderr)"
else
  fail "Case 5: Silent no-op" "Status: $RUN_STATUS, Stdout: [$RUN_STDOUT], Stderr: [$RUN_STDERR]"
fi

# Case 6: Silent no-op — dispatch mode set, phase entry missing → exit 0, stdout AND stderr empty
TMP_CASE6="$TEST_TMPDIR/case6"
write_config "$TMP_CASE6" << 'EOF'
{
  "version": "2.22.0",
  "agents": [],
  "dispatch": "manual",
  "phases": {
    "plan": { "agent": "claude-code" }
  }
}
EOF

run_cli "$TMP_CASE6" dispatch produce

if [ $RUN_STATUS -eq 0 ] && [ -z "$RUN_STDOUT" ] && [ -z "$RUN_STDERR" ]; then
  pass "Case 6: No phase entry → silent no-op (empty stdout and stderr)"
else
  fail "Case 6: No phase entry" "Status: $RUN_STATUS, Stdout: [$RUN_STDOUT], Stderr: [$RUN_STDERR]"
fi

# Case 7: Unknown agent → exit 2, stderr lists known ids, stdout empty
TMP_CASE7="$TEST_TMPDIR/case7"
write_config "$TMP_CASE7" << 'EOF'
{
  "version": "2.22.0",
  "agents": [],
  "dispatch": "manual",
  "phases": {
    "plan": { "agent": "nope" }
  }
}
EOF

run_cli "$TMP_CASE7" dispatch plan

if [ $RUN_STATUS -eq 2 ] \
   && echo "$RUN_STDERR" | grep -q "Unknown dispatch agent 'nope'" \
   && echo "$RUN_STDERR" | grep -q "claude-code, gemini-cli, antigravity, chatgpt-cli, openrouter-cli" \
   && [ -z "$RUN_STDOUT" ]; then
  pass "Case 7: Unknown agent (exit 2, stderr only)"
else
  fail "Case 7: Unknown agent" "Status: $RUN_STATUS, Stdout: $RUN_STDOUT, Stderr: $RUN_STDERR"
fi

# Case 8: Auto mode invokes the template as argv (prompt stays ONE argv element, no shell)
TMP_CASE8="$TEST_TMPDIR/case8"
write_config "$TMP_CASE8" << 'EOF'
{
  "version": "2.22.0",
  "agents": [],
  "dispatch": "auto",
  "phases": {
    "plan": { "agent": "claude-code", "model": "opus" }
  },
  "dispatchAgents": {
    "claude-code": {
      "command": "node fake-argv.js --model {model} -p {prompt}",
      "defaultModel": "sonnet"
    }
  }
}
EOF

run_cli "$TMP_CASE8" dispatch plan --prompt "do the plan"

argv_content=$(cat "$TMP_CASE8/argv.log" 2>/dev/null || true)
if [ $RUN_STATUS -eq 0 ] \
   && echo "$argv_content" | grep -Fxq '"--model"' \
   && echo "$argv_content" | grep -Fxq '"opus"' \
   && echo "$argv_content" | grep -Fxq '"-p"' \
   && echo "$argv_content" | grep -Fxq '"do the plan"'; then
  pass "Case 8: Auto mode passes prompt as one argv element (no shell)"
else
  fail "Case 8: Auto argv preservation" "Status: $RUN_STATUS, Log: [$argv_content], Stderr: $RUN_STDERR"
fi

# Case 9: Auto mode with a missing binary → exit 1 + diagnostic on stderr
TMP_CASE9="$TEST_TMPDIR/case9"
write_config "$TMP_CASE9" << 'EOF'
{
  "version": "2.22.0",
  "agents": [],
  "dispatch": "auto",
  "phases": {
    "plan": { "agent": "claude-code" }
  },
  "dispatchAgents": {
    "claude-code": {
      "command": "nonexistentbinary --model {model} -p {prompt}"
    }
  }
}
EOF

run_cli "$TMP_CASE9" dispatch plan

if [ $RUN_STATUS -eq 1 ] && echo "$RUN_STDERR" | grep -q "Command not found on PATH: nonexistentbinary" && [ -z "$RUN_STDOUT" ]; then
  pass "Case 9: Auto missing binary (exit 1, stderr only)"
else
  fail "Case 9: Auto missing binary" "Status: $RUN_STATUS, Stdout: $RUN_STDOUT, Stderr: $RUN_STDERR"
fi

# Case 10: --print under auto → manual block on stdout, target binary NOT invoked
TMP_CASE10="$TEST_TMPDIR/case10"
write_config "$TMP_CASE10" << 'EOF'
{
  "version": "2.22.0",
  "agents": [],
  "dispatch": "auto",
  "phases": {
    "plan": { "agent": "claude-code", "model": "opus" }
  },
  "dispatchAgents": {
    "claude-code": {
      "command": "node fake-argv.js --model {model} -p {prompt}"
    }
  }
}
EOF

run_cli "$TMP_CASE10" dispatch plan --prompt "do the plan" --print

if [ $RUN_STATUS -eq 0 ] && echo "$RUN_STDOUT" | grep -q "Cross-agent dispatch" && [ ! -f "$TMP_CASE10/argv.log" ]; then
  pass "Case 10: --print under auto prints manual block without spawning"
else
  fail "Case 10: --print under auto" "Status: $RUN_STATUS, Stdout: $RUN_STDOUT"
fi

# Case 11: Auto timeout → child killed, exit 1, "timed out" diagnostic (bounded runtime)
TMP_CASE11="$TEST_TMPDIR/case11"
write_config "$TMP_CASE11" << 'EOF'
{
  "version": "2.22.0",
  "agents": [],
  "dispatch": "auto",
  "phases": {
    "plan": { "agent": "claude-code", "model": "opus", "timeoutMs": 800 }
  },
  "dispatchAgents": {
    "claude-code": {
      "command": "node fake-sleep.js"
    }
  }
}
EOF

run_cli "$TMP_CASE11" dispatch plan

if [ $RUN_STATUS -eq 1 ] && echo "$RUN_STDERR" | grep -q "Dispatch timed out after 800 ms"; then
  pass "Case 11: Auto timeout kills child and reports the cap"
else
  fail "Case 11: Auto timeout" "Status: $RUN_STATUS, Stderr: $RUN_STDERR"
fi

# Case 12: spec-driven phase 'implement' resolves (manual, default prompt)
TMP_CASE12="$TEST_TMPDIR/case12"
write_config "$TMP_CASE12" << 'EOF'
{
  "version": "2.22.0",
  "agents": [],
  "dispatch": "manual",
  "phases": {
    "implement": { "agent": "antigravity" }
  }
}
EOF

run_cli "$TMP_CASE12" dispatch implement

if [ $RUN_STATUS -eq 0 ] && echo "$RUN_STDOUT" | grep -q "Cross-agent dispatch: implement" && echo "$RUN_STDOUT" | grep -Fxq "  Implement the current plan."; then
  pass "Case 12: spec-driven phase 'implement' resolves with default prompt"
else
  fail "Case 12: implement phase" "Status: $RUN_STATUS, Stdout: $RUN_STDOUT"
fi

# Case 13: spec-driven phase 'review' resolves (manual)
TMP_CASE13="$TEST_TMPDIR/case13"
write_config "$TMP_CASE13" << 'EOF'
{
  "version": "2.22.0",
  "agents": [],
  "dispatch": "manual",
  "phases": {
    "review": { "agent": "claude-code", "model": "sonnet" }
  }
}
EOF

run_cli "$TMP_CASE13" dispatch review

if [ $RUN_STATUS -eq 0 ] && echo "$RUN_STDOUT" | grep -q "Cross-agent dispatch: review" && echo "$RUN_STDOUT" | grep -q "sonnet"; then
  pass "Case 13: spec-driven phase 'review' resolves"
else
  fail "Case 13: review phase" "Status: $RUN_STATUS, Stdout: $RUN_STDOUT"
fi

# Case 14: init round-trip — re-init preserves dispatch/phases/dispatchAgents
TMP_CASE14="$TEST_TMPDIR/case14"
mkdir -p "$TMP_CASE14"
cat > "$TMP_CASE14/.ai-factory.json" << 'EOF'
{
  "version": "2.22.0",
  "agents": [],
  "dispatch": "manual",
  "phases": { "plan": { "agent": "claude-code", "model": "opus" } },
  "dispatchAgents": { "custom": { "command": "customcli -p {prompt}", "defaultModel": "x" } }
}
EOF

cp "$TMP_CASE14/.ai-factory.json" "$TMP_CASE14/expected.json"
init_status=0
(cd "$TMP_CASE14" && node "$ROOT/dist/cli/index.js" init --agents claude --skills aif --no-symlinks > "$TMP_CASE14/init.log" 2>&1) || init_status=$?

if [ "$init_status" -eq 0 ] && node --input-type=module - "$TMP_CASE14" <<'EOF'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const dir = process.argv[2];
const actual = JSON.parse(fs.readFileSync(path.join(dir, '.ai-factory.json'), 'utf8'));
const expected = JSON.parse(fs.readFileSync(path.join(dir, 'expected.json'), 'utf8'));
for (const key of ['dispatch', 'phases', 'dispatchAgents']) assert.deepEqual(actual[key], expected[key]);
assert.ok(actual.agents.some(agent => agent.id === 'claude' && agent.installedSkills.includes('aif')));
assert.ok(fs.existsSync(path.join(dir, '.claude/skills/aif/SKILL.md')));
EOF
then
  pass "Case 14: init rerun preserves dispatch/phases/dispatchAgents"
else
  fail "Case 14: init dispatch round-trip" "init exit: $init_status; $(tail -n 5 "$TMP_CASE14/init.log")"
fi

# Show final summary
echo ""
echo -e "${BOLD}Tests summary: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"
if [ $FAILED -gt 0 ]; then
  exit 1
fi
exit 0
