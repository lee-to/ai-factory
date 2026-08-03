#!/bin/bash
# Smoke tests for the /aif-loop stop-precedence and completed-phase budget contracts.
# Covers the state-machine invariants that structural skill validation cannot see:
# precedence identical across all three files, phase gating of no_major_issues,
# artifact_status gating of terminal numbers, and field type rules.
# Usage: ./scripts/test-loop-budget-contract.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SKILL="$ROOT_DIR/skills/aif-loop/SKILL.md"
DOCS="$ROOT_DIR/docs/loop.md"
ROUTER="$ROOT_DIR/subagents/claude/agents/loop-orchestrator.md"
BUDGET_REF="$ROOT_DIR/skills/aif-loop/references/ACTIVE-TIME-BUDGET.md"
REPORT_REF="$ROOT_DIR/skills/aif-loop/references/TERMINAL-REPORT.md"
PHASES_REF="$ROOT_DIR/skills/aif-loop/references/PHASE-CONTRACTS.md"

RED='\033[0;31m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

PASSED=0
FAILED=0

pass() {
    PASSED=$((PASSED + 1))
    echo -e "  ${GREEN}OK${NC} $1"
}

fail() {
    FAILED=$((FAILED + 1))
    echo -e "  ${RED}FAIL${NC} $1"
}

assert_contains() {
    local file="$1" expected="$2" message="$3"
    if [[ -f "$file" ]] && grep -Fq "$expected" "$file"; then
        pass "$message"
    else
        fail "$message"
    fi
}

assert_absent() {
    local file="$1" unexpected="$2" message="$3"
    if [[ -f "$file" ]] && grep -Fq "$unexpected" "$file"; then
        fail "$message"
    else
        pass "$message"
    fi
}

# Order of stop reasons as they first appear on stdin, newline separated.
reason_order() {
    grep -o 'threshold_reached\|no_major_issues\|user_stop\|stagnation\|budget_exceeded\|iteration_limit' \
        | awk '!seen[$0]++'
}

echo -e "${BOLD}=== Stop precedence contract ===${NC}"

EXPECTED_ORDER=$'threshold_reached\nno_major_issues\nuser_stop\nstagnation\nbudget_exceeded\niteration_limit'

for f in "$SKILL" "$DOCS"; do
    ACTUAL=$(sed -n '/[Pp]recedence contract/,/^## /p' "$f" | reason_order)
    if [[ "$ACTUAL" == "$EXPECTED_ORDER" ]]; then
        pass "precedence order matches contract in $(basename "$f")"
    else
        fail "precedence order matches contract in $(basename "$f") (got: $(echo "$ACTUAL" | tr '\n' ' '))"
    fi
done

# The router never observes user_stop, so its reachable order omits it.
ROUTER_EXPECTED=$'threshold_reached\nno_major_issues\nuser_stop\nstagnation\nbudget_exceeded\niteration_limit'
ROUTER_ACTUAL=$(sed -n '/stop order/,/Normal routing/p' "$ROUTER" | reason_order)
if [[ "$ROUTER_ACTUAL" == "$ROUTER_EXPECTED" ]]; then
    pass "router lists the same reasons in the same order"
else
    fail "router lists the same reasons in the same order (got: $(echo "$ROUTER_ACTUAL" | tr '\n' ' '))"
fi

assert_contains "$ROUTER" "never reaches this router" \
    "router documents user_stop as unreachable instead of faking a guard"

echo -e "\n${BOLD}=== no_major_issues is phase-gated (phase B never skipped) ===${NC}"

for f in "$SKILL" "$DOCS" "$ROUTER"; do
    if sed -n '/no_major_issues/p' "$f" | grep -q 'phase=B\|`phase=B`'; then
        pass "no_major_issues requires phase=B in $(basename "$f")"
    else
        fail "no_major_issues requires phase=B in $(basename "$f")"
    fi
done

assert_contains "$SKILL" "First evaluate the Step 5 stop conditions" \
    "iteration checks stop conditions before continuing to CRITIQUE"

echo -e "\n${BOLD}=== Terminal report is gated by artifact_status ===${NC}"

for status in not_created unevaluated stale evaluated; do
    assert_contains "$REPORT_REF" "$status" "terminal report defines artifact_status '$status'"
done

assert_contains "$PHASES_REF" "artifact_hash" \
    "EVALUATE records artifact_hash so staleness is detectable"
assert_contains "$REPORT_REF" "final_score: unavailable" \
    "non-evaluated stops report final_score as unavailable"
assert_contains "$SKILL" "artifact_status\` is \`evaluated\`" \
    "distance-to-success is restricted to evaluated artifacts"
assert_contains "$SKILL" "not_created" \
    "post-loop skips the save prompt when no artifact exists"

echo -e "\n${BOLD}=== Budget field names, types and invariants ===${NC}"

for f in "$SKILL" "$DOCS" "$ROUTER" "$BUDGET_REF"; do
    assert_absent "$f" "max_active_seconds" "old field name absent from $(basename "$f")"
done

assert_contains "$BUDGET_REF" "null | positive integer" \
    "max_completed_phase_seconds accepts only null or a positive integer"
assert_contains "$BUDGET_REF" "monotonically non-decreasing" \
    "completed_phase_seconds is documented as non-decreasing"
assert_contains "$BUDGET_REF" 'max(0, now - phase_started_epoch_seconds)' \
    "clock rollback cannot contribute negative time"
assert_absent "$BUDGET_REF" "log \`phase_error\` with the offending field" \
    "config validation does not reuse the phase_error retry semantic"
assert_contains "$BUDGET_REF" "Retried phases" \
    "retried phase attempts have defined accounting"

echo -e "\n${BOLD}=== Budget telemetry is user-visible ===${NC}"

assert_contains "$SKILL" "completed_phase_seconds / max_completed_phase_seconds" \
    "status command shows budget consumption"
assert_contains "$BUDGET_REF" "overshoot_seconds" \
    "budget stop reports overshoot"
assert_contains "$BUDGET_REF" "last_completed_step" \
    "budget stop reports the segment that tripped the cap"

echo -e "\n${BOLD}=== Setup contract ===${NC}"

assert_contains "$SKILL" "Completed-phase time budget" \
    "full setup asks for the budget"
assert_contains "$DOCS" "not a loop budget" \
    "domain-level timeout is not inferred as a loop budget"

TOTAL=$((PASSED + FAILED))
echo ""
echo -e "${BOLD}Total:${NC} $TOTAL, ${GREEN}Passed:${NC} $PASSED, ${RED}Failed:${NC} $FAILED"

if [[ $FAILED -gt 0 ]]; then
    exit 1
fi
exit 0
