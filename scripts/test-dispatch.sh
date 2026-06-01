#!/bin/bash
# Test suite for cross-agent dispatch CLI command
# Usage: ./scripts/test-dispatch.sh

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

# Helper to run CLI safely under set -e
RUN_OUTPUT=""
RUN_STATUS=0

run_cli() {
    local dir="$1"
    shift
    # Run in a subshell, capture stdout/stderr and exit code, avoid triggering set -e
    RUN_OUTPUT=$( (cd "$dir" && node "$ROOT/dist/cli/index.js" "$@") 2>&1 ) && RUN_STATUS=0 || RUN_STATUS=$?
}

# Create a temporary directory for tests
TEST_TMPDIR=$(mktemp -d)
ARGV_LOG="$TEST_TMPDIR/fakeagent-argv.log"
export ARGV_LOG

# Add a fake agent script to PATH
FAKE_BIN_DIR="$TEST_TMPDIR/bin"
mkdir -p "$FAKE_BIN_DIR"
cat > "$FAKE_BIN_DIR/fakeagent" << 'EOF'
#!/bin/sh
# Log arguments, one per line
for arg in "$@"; do
  echo "$arg" >> "$ARGV_LOG"
done
exit 0
EOF
chmod +x "$FAKE_BIN_DIR/fakeagent"

# Preserve original path, prepend fake bin dir
ORIGINAL_PATH="$PATH"
export PATH="$FAKE_BIN_DIR:$PATH"

cleanup() {
    rm -rf "$TEST_TMPDIR"
}
trap cleanup EXIT

echo -e "${BOLD}Starting Dispatch tests...${NC}"

# Case 1: Manual round-trip
# dispatch:"manual", plan:{agent:"claude-code",model:"opus"}
TMP_CASE1="$TEST_TMPDIR/case1"
mkdir -p "$TMP_CASE1"
cat > "$TMP_CASE1/.ai-factory.json" << 'EOF'
{
  "version": "2.13.2",
  "agents": [],
  "dispatch": "manual",
  "phases": {
    "plan": { "agent": "claude-code", "model": "opus" }
  }
}
EOF

run_cli "$TMP_CASE1" dispatch plan

if [ $RUN_STATUS -eq 0 ] && echo "$RUN_OUTPUT" | grep -q "claude-code" && echo "$RUN_OUTPUT" | grep -q "opus" && echo "$RUN_OUTPUT" | grep -q "manual" && echo "$RUN_OUTPUT" | grep -q "claude --model opus"; then
  pass "Case 1: Manual round-trip"
else
  fail "Case 1: Manual round-trip" "Status: $RUN_STATUS, Output: $RUN_OUTPUT"
fi

# Case 2: defaultModel fallback
# phase entry without model (antigravity) -> output shows gemini-3.5-flash
TMP_CASE2="$TEST_TMPDIR/case2"
mkdir -p "$TMP_CASE2"
cat > "$TMP_CASE2/.ai-factory.json" << 'EOF'
{
  "version": "2.13.2",
  "agents": [],
  "dispatch": "manual",
  "phases": {
    "prepare": { "agent": "antigravity" }
  }
}
EOF

run_cli "$TMP_CASE2" dispatch prepare

if [ $RUN_STATUS -eq 0 ] && echo "$RUN_OUTPUT" | grep -q "gemini-3.5-flash" && echo "$RUN_OUTPUT" | grep -q "antigravity run --model gemini-3.5-flash"; then
  pass "Case 2: defaultModel fallback"
else
  fail "Case 2: defaultModel fallback" "Status: $RUN_STATUS, Output: $RUN_OUTPUT"
fi

# Case 3: Unknown phase
# dispatch frobnicate -> exit 2, stderr lists the 6 phases.
TMP_CASE3="$TEST_TMPDIR/case3"
mkdir -p "$TMP_CASE3"
cat > "$TMP_CASE3/.ai-factory.json" << 'EOF'
{
  "version": "2.13.2",
  "agents": [],
  "dispatch": "manual",
  "phases": {}
}
EOF

run_cli "$TMP_CASE3" dispatch frobnicate

if [ $RUN_STATUS -eq 2 ] && echo "$RUN_OUTPUT" | grep -q "Unknown phase 'frobnicate'" && echo "$RUN_OUTPUT" | grep -q "plan, produce, prepare, evaluate, critique, refine"; then
  pass "Case 3: Unknown phase"
else
  fail "Case 3: Unknown phase" "Status: $RUN_STATUS, Output: $RUN_OUTPUT"
fi

# Case 4: Backwards-compat no-op
# .ai-factory.json with no dispatch/phases -> exit 0, no "Cross-agent dispatch" block on stdout.
TMP_CASE4="$TEST_TMPDIR/case4"
mkdir -p "$TMP_CASE4"
cat > "$TMP_CASE4/.ai-factory.json" << 'EOF'
{
  "version": "2.13.2",
  "agents": []
}
EOF

run_cli "$TMP_CASE4" dispatch plan

if [ $RUN_STATUS -eq 0 ] && ! echo "$RUN_OUTPUT" | grep -q "Cross-agent dispatch"; then
  pass "Case 4: Backwards-compat no-op"
else
  fail "Case 4: Backwards-compat no-op" "Status: $RUN_STATUS, Output: $RUN_OUTPUT"
fi

# Case 5: No phase entry
# dispatch present but produce unset -> dispatch produce exit 0, no block.
TMP_CASE5="$TEST_TMPDIR/case5"
mkdir -p "$TMP_CASE5"
cat > "$TMP_CASE5/.ai-factory.json" << 'EOF'
{
  "version": "2.13.2",
  "agents": [],
  "dispatch": "manual",
  "phases": {
    "plan": { "agent": "claude-code" }
  }
}
EOF

run_cli "$TMP_CASE5" dispatch produce

if [ $RUN_STATUS -eq 0 ] && ! echo "$RUN_OUTPUT" | grep -q "Cross-agent dispatch"; then
  pass "Case 5: No phase entry"
else
  fail "Case 5: No phase entry" "Status: $RUN_STATUS, Output: $RUN_OUTPUT"
fi

# Case 6: Unknown agent
# phase references "agent":"nope" -> exit 2, stderr lists known ids.
TMP_CASE6="$TEST_TMPDIR/case6"
mkdir -p "$TMP_CASE6"
cat > "$TMP_CASE6/.ai-factory.json" << 'EOF'
{
  "version": "2.13.2",
  "agents": [],
  "dispatch": "manual",
  "phases": {
    "plan": { "agent": "nope" }
  }
}
EOF

run_cli "$TMP_CASE6" dispatch plan

if [ $RUN_STATUS -eq 2 ] && echo "$RUN_OUTPUT" | grep -q "Unknown dispatch agent 'nope'" && echo "$RUN_OUTPUT" | grep -q "claude-code, gemini-cli, antigravity, chatgpt-cli, openrouter-cli"; then
  pass "Case 6: Unknown agent"
else
  fail "Case 6: Unknown agent" "Status: $RUN_STATUS, Output: $RUN_OUTPUT"
fi

# Case 7: Auto invokes fake CLI + argv assertion
# dispatch:"auto" + dispatchAgents:{"claude-code":{"command":"fakeagent --model {model} -p {prompt}","defaultModel":"sonnet"}};
# dispatch plan --prompt "do the plan" -> argv log shows --model, the model, -p, and "do the plan" as one argv element
TMP_CASE7="$TEST_TMPDIR/case7"
mkdir -p "$TMP_CASE7"
cat > "$TMP_CASE7/.ai-factory.json" << 'EOF'
{
  "version": "2.13.2",
  "agents": [],
  "dispatch": "auto",
  "phases": {
    "plan": { "agent": "claude-code", "model": "opus" }
  },
  "dispatchAgents": {
    "claude-code": {
      "command": "fakeagent --model {model} -p {prompt}",
      "defaultModel": "sonnet"
    }
  }
}
EOF

: > "$ARGV_LOG"
run_cli "$TMP_CASE7" dispatch plan --prompt "do the plan"

if [ $RUN_STATUS -eq 0 ] && [ -f "$ARGV_LOG" ] && grep -Fxq -- "--model" "$ARGV_LOG" && grep -Fxq -- "opus" "$ARGV_LOG" && grep -Fxq -- "-p" "$ARGV_LOG" && grep -Fxq -- "do the plan" "$ARGV_LOG"; then
  pass "Case 7: Auto invokes fake CLI + argv assertion"
else
  fail "Case 7: Auto invokes fake CLI + argv assertion" "Status: $RUN_STATUS, Output: $RUN_OUTPUT, Log: $(cat "$ARGV_LOG" 2>/dev/null || true)"
fi

# Case 8: Auto missing binary
# template points at a nonexistent binary -> exit 1 + "Command not found on PATH".
TMP_CASE8="$TEST_TMPDIR/case8"
mkdir -p "$TMP_CASE8"
cat > "$TMP_CASE8/.ai-factory.json" << 'EOF'
{
  "version": "2.13.2",
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

run_cli "$TMP_CASE8" dispatch plan

if [ $RUN_STATUS -eq 1 ] && echo "$RUN_OUTPUT" | grep -q "Command not found on PATH: nonexistentbinary"; then
  pass "Case 8: Auto missing binary"
else
  fail "Case 8: Auto missing binary" "Status: $RUN_STATUS, Output: $RUN_OUTPUT"
fi

# Case 9: --print under auto
# dispatch:"auto" + --print -> manual block on stdout, fake binary NOT invoked (empty argv log).
TMP_CASE9="$TEST_TMPDIR/case9"
mkdir -p "$TMP_CASE9"
cat > "$TMP_CASE9/.ai-factory.json" << 'EOF'
{
  "version": "2.13.2",
  "agents": [],
  "dispatch": "auto",
  "phases": {
    "plan": { "agent": "claude-code", "model": "opus" }
  },
  "dispatchAgents": {
    "claude-code": {
      "command": "fakeagent --model {model} -p {prompt}"
    }
  }
}
EOF

: > "$ARGV_LOG"
run_cli "$TMP_CASE9" dispatch plan --prompt "do the plan" --print

log_content=$(cat "$ARGV_LOG")
if [ $RUN_STATUS -eq 0 ] && echo "$RUN_OUTPUT" | grep -q "Cross-agent dispatch" && [ -z "$log_content" ]; then
  pass "Case 9: --print under auto"
else
  fail "Case 9: --print under auto" "Status: $RUN_STATUS, Output: $RUN_OUTPUT, Log: $log_content"
fi

# Case 10: spec-driven phase 'implement' resolves (manual)
# phases.implement.agent=antigravity (no model) -> manual block with antigravity + default model
TMP_CASE10="$TEST_TMPDIR/case10"
mkdir -p "$TMP_CASE10"
cat > "$TMP_CASE10/.ai-factory.json" << 'EOF'
{
  "version": "2.13.2",
  "agents": [],
  "dispatch": "manual",
  "phases": {
    "implement": { "agent": "antigravity" }
  }
}
EOF

run_cli "$TMP_CASE10" dispatch implement

if [ $RUN_STATUS -eq 0 ] && echo "$RUN_OUTPUT" | grep -q "Cross-agent dispatch: implement" && echo "$RUN_OUTPUT" | grep -q "antigravity" && echo "$RUN_OUTPUT" | grep -q "gemini-3.5-flash"; then
  pass "Case 10: spec-driven phase 'implement' resolves"
else
  fail "Case 10: spec-driven phase 'implement' resolves" "Status: $RUN_STATUS, Output: $RUN_OUTPUT"
fi

# Case 11: spec-driven phase 'review' resolves (manual)
# phases.review.agent=claude-code, model=sonnet
TMP_CASE11="$TEST_TMPDIR/case11"
mkdir -p "$TMP_CASE11"
cat > "$TMP_CASE11/.ai-factory.json" << 'EOF'
{
  "version": "2.13.2",
  "agents": [],
  "dispatch": "manual",
  "phases": {
    "review": { "agent": "claude-code", "model": "sonnet" }
  }
}
EOF

run_cli "$TMP_CASE11" dispatch review

if [ $RUN_STATUS -eq 0 ] && echo "$RUN_OUTPUT" | grep -q "Cross-agent dispatch: review" && echo "$RUN_OUTPUT" | grep -q "claude-code" && echo "$RUN_OUTPUT" | grep -q "sonnet"; then
  pass "Case 11: spec-driven phase 'review' resolves"
else
  fail "Case 11: spec-driven phase 'review' resolves" "Status: $RUN_STATUS, Output: $RUN_OUTPUT"
fi

# Case 12: unknown-phase message lists the spec-driven phases too
TMP_CASE12="$TEST_TMPDIR/case12"
mkdir -p "$TMP_CASE12"
cat > "$TMP_CASE12/.ai-factory.json" << 'EOF'
{ "version": "2.13.2", "agents": [], "dispatch": "manual", "phases": {} }
EOF

run_cli "$TMP_CASE12" dispatch frobnicate

if [ $RUN_STATUS -eq 2 ] && echo "$RUN_OUTPUT" | grep -q "implement" && echo "$RUN_OUTPUT" | grep -q "review"; then
  pass "Case 12: unknown-phase lists implement & review"
else
  fail "Case 12: unknown-phase lists implement & review" "Status: $RUN_STATUS, Output: $RUN_OUTPUT"
fi

# Show final summary
echo ""
echo -e "${BOLD}Tests summary: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"
if [ $FAILED -gt 0 ]; then
  exit 1
fi
exit 0
