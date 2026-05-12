#!/bin/bash
# Smoke tests for /aif-rules-check contract and severity boundaries.
# Usage: ./scripts/test-aif-rules-check.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_DIR="$ROOT_DIR/skills/aif-rules-check"
CONTRACT_REF="$SKILL_DIR/references/RULES-CHECK-CONTRACT.md"

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

assert_exact_line() {
    local file="$1"
    local expected="$2"
    local success_message="$3"
    local failure_message="$4"

    if grep -Fqx "$expected" "$file"; then
        pass "$success_message"
    else
        fail "$failure_message"
    fi
}

echo -e "\n${BOLD}=== /aif-rules-check skill contract ===${NC}\n"

if grep -Fq 'If `paths.rules_file` is missing from config, default to `.ai-factory/RULES.md` instead of treating config as incomplete.' "$SKILL_DIR/SKILL.md"; then
    pass "SKILL.md documents fallback to .ai-factory/RULES.md"
else
    fail "SKILL.md must document fallback to .ai-factory/RULES.md"
fi

if grep -Fq 'If `git.base_branch` is missing from config, resolve the repository default branch from git metadata when possible; use `main` only as the final fallback.' "$SKILL_DIR/SKILL.md"; then
    pass "SKILL.md documents git.base_branch auto-detect fallback"
else
    fail "SKILL.md must document git.base_branch auto-detect fallback"
fi

if grep -Fqx -- '- `git.base_branch`: `main`' "$SKILL_DIR/SKILL.md"; then
    fail "SKILL.md must not hardcode git.base_branch to main"
else
    pass "SKILL.md no longer hardcodes git.base_branch to main"
fi

if grep -Fq 'Optional plan context: use the active plan file only when it helps interpret scope or area relevance; absence of a plan is never a failure.' "$SKILL_DIR/SKILL.md"; then
    pass "SKILL.md documents optional plan context"
else
    fail "SKILL.md must document optional plan context"
fi

if grep -Fq 'If there are still no changed files, return `WARN` rather than a hard failure.' "$SKILL_DIR/SKILL.md" \
   && grep -Fq 'If no rules sources resolve, return `WARN` rather than a hard failure.' "$SKILL_DIR/SKILL.md"; then
    pass "SKILL.md keeps missing-scope and missing-rules outcomes at WARN"
else
    fail "SKILL.md must keep missing-scope and missing-rules outcomes at WARN"
fi

if grep -Fq 'Only return `FAIL` when an explicit hard rule is clearly violated by the inspected diff or changed files.' "$SKILL_DIR/SKILL.md"; then
    pass "SKILL.md restricts FAIL to explicit hard-rule violations"
else
    fail "SKILL.md must restrict FAIL to explicit hard-rule violations"
fi

if grep -Fq 'This command is read-only: do not edit `RULES.md`, `rules/base.md`, `rules.<area>`, plan files, or source code.' "$SKILL_DIR/SKILL.md"; then
    pass "SKILL.md documents read-only boundary"
else
    fail "SKILL.md must document read-only boundary"
fi

allowed_line=$(grep -E '^allowed-tools:' "$SKILL_DIR/SKILL.md" || true)
if [[ "$allowed_line" == *"Bash(git *)"* ]]; then
    pass "SKILL.md allowed-tools includes Bash(git *)"
else
    fail "SKILL.md allowed-tools must include Bash(git *)"
fi

echo -e "\n${BOLD}=== /aif-rules-check report contract ===${NC}\n"

assert_exact_line \
    "$CONTRACT_REF" \
    '**Overall Verdict:** PASS | WARN | FAIL' \
    "contract keeps exact overall verdict line" \
    "contract must contain the exact line '**Overall Verdict:** PASS | WARN | FAIL'"

assert_exact_line \
    "$CONTRACT_REF" \
    '**Files Checked:** <count>' \
    "contract keeps exact files-checked line" \
    "contract must contain the exact line '**Files Checked:** <count>'"

assert_exact_line \
    "$CONTRACT_REF" \
    '### Gate Results' \
    "contract keeps Gate Results section" \
    "contract must contain the exact heading '### Gate Results'"

assert_exact_line \
    "$CONTRACT_REF" \
    '### Blocking Violations' \
    "contract keeps Blocking Violations section" \
    "contract must contain the exact heading '### Blocking Violations'"

assert_exact_line \
    "$CONTRACT_REF" \
    '### Suggested Fixes' \
    "contract keeps Suggested Fixes section" \
    "contract must contain the exact heading '### Suggested Fixes'"

assert_exact_line \
    "$CONTRACT_REF" \
    '### Suggested Rule Updates' \
    "contract keeps Suggested Rule Updates section" \
    "contract must contain the exact heading '### Suggested Rule Updates'"

assert_exact_line \
    "$CONTRACT_REF" \
    '`WARN` - no applicable rules were resolved, evidence is ambiguous, or there are no changed files to evaluate.' \
    "contract keeps no-rules/no-diff semantics at WARN" \
    "contract must keep no-rules/no-diff semantics at WARN"

assert_exact_line \
    "$CONTRACT_REF" \
    '`FAIL` - an explicit hard rule is clearly violated by the inspected diff or changed files.' \
    "contract keeps FAIL reserved for explicit hard-rule violations" \
    "contract must keep FAIL reserved for explicit hard-rule violations"

assert_exact_line \
    "$CONTRACT_REF" \
    'The human rules report keeps `PASS` / `WARN` / `FAIL`. The final machine-readable summary uses lowercase `pass` / `warn` / `fail` in the `aif-gate-result` JSON block, matching the shared quality gate result contract.' \
    "contract documents rules-check machine-readable summary boundary" \
    "contract must document the rules-check machine-readable summary boundary"

TOTAL=$((PASSED + FAILED))
echo ""
echo -e "${BOLD}Total:${NC} $TOTAL, ${GREEN}Passed:${NC} $PASSED, ${RED}Failed:${NC} $FAILED"

if [[ $FAILED -gt 0 ]]; then
    exit 1
fi
exit 0
