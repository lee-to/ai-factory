#!/bin/bash
# Smoke tests for /aif-qa: branch-slug algorithm correctness and skill contract.
# Usage: ./scripts/test-aif-qa.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_DIR="$ROOT_DIR/skills/aif-qa"

RED='\033[0;31m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

PASSED=0
FAILED=0

pass() {
    PASSED=$((PASSED + 1))
    echo -e "  ${GREEN}✓${NC} $1"
}

fail() {
    FAILED=$((FAILED + 1))
    echo -e "  ${RED}✗${NC} $1"
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

# Reference implementation of the branch-slug algorithm documented in
# skills/aif-qa/SKILL.md Step 0.2. Kept in lock-step with the skill's
# three-step spec: safe_slug, 8-char hash of the original branch name, combine.
aif_qa_slug() {
    local branch="$1"
    local safe_slug
    safe_slug=$(printf '%s' "$branch" | sed -E 's|[^A-Za-z0-9._-]|-|g; s|-+|-|g; s|^-||; s|-$||')
    if [[ -z "$safe_slug" ]]; then
        safe_slug="branch"
    fi
    safe_slug="${safe_slug:0:40}"
    local hash8
    hash8=$(git hash-object --stdin <<< "$branch" | head -c 8)
    printf '%s-%s\n' "$safe_slug" "$hash8"
}

# ─────────────────────────────────────────────
# Part 1: branch-slug algorithm behavior
# ─────────────────────────────────────────────
echo -e "\n${BOLD}=== /aif-qa branch-slug algorithm ===${NC}\n"

# Test 1: classic collision case that motivated the follow-up
s1=$(aif_qa_slug "feature/foo")
s2=$(aif_qa_slug "feature-foo")
if [[ "$s1" != "$s2" ]]; then
    pass "feature/foo vs feature-foo are distinct ($s1 ≠ $s2)"
else
    fail "feature/foo and feature-foo collapsed to $s1"
fi

# Test 2: several branches that normalize toward the same readable slug
# still resolve to distinct derived slugs once the hash suffix is applied.
branches=('feat/x' 'feat-x' 'feat x' 'feat--x' 'feat.x' 'feat_x')
slugs=()
for b in "${branches[@]}"; do
    slugs+=("$(aif_qa_slug "$b")")
done
unique_count=$(printf '%s\n' "${slugs[@]}" | sort -u | wc -l | tr -d ' ')
if [[ "$unique_count" -eq "${#branches[@]}" ]]; then
    pass "${#branches[@]} representative branches → ${#branches[@]} unique derived slugs"
else
    fail "expected ${#branches[@]} unique slugs, got $unique_count"
    for i in "${!branches[@]}"; do
        echo "      '${branches[$i]}' → ${slugs[$i]}"
    done
fi

# Test 3: filesystem-safe output for exotic characters
s=$(aif_qa_slug 'feat/foo<bar>*?')
if [[ "$s" =~ ^[A-Za-z0-9._-]+$ ]]; then
    pass "slug is filesystem-safe for exotic branch: $s"
else
    fail "slug contains unsafe chars: $s"
fi

# Test 4: empty-ish branch (all special chars) still produces a valid slug
s=$(aif_qa_slug "///")
if [[ -n "$s" && "$s" =~ ^[A-Za-z0-9._-]+$ ]]; then
    pass "branch '///' produces non-empty safe slug: $s"
else
    fail "branch '///' produced bad slug: '$s'"
fi

# Test 5: slug always ends with an 8-char lowercase hex hash suffix
s=$(aif_qa_slug "main")
if [[ "$s" =~ -[0-9a-f]{8}$ ]]; then
    pass "slug ends with 8-char hex hash: $s"
else
    fail "slug missing 8-char hex hash suffix: $s"
fi

# Test 6: deterministic — same input always produces the same slug
s1=$(aif_qa_slug "feature/x")
s2=$(aif_qa_slug "feature/x")
if [[ "$s1" == "$s2" ]]; then
    pass "slug is deterministic"
else
    fail "non-deterministic slug: $s1 vs $s2"
fi

# ─────────────────────────────────────────────
# Part 2: skill contract
# ─────────────────────────────────────────────
echo -e "\n${BOLD}=== /aif-qa skill contract ===${NC}\n"

# Contract: SKILL.md documents the deterministic, collision-resistant slug contract
if grep -qi 'collision-resistant' "$SKILL_DIR/SKILL.md" && grep -qi 'filesystem-safe' "$SKILL_DIR/SKILL.md"; then
    pass "SKILL.md documents a filesystem-safe, collision-resistant branch slug"
else
    fail "SKILL.md must describe the branch slug as filesystem-safe and collision-resistant"
fi

# Contract: SKILL.md specifies git hash-object as the hash step
if grep -q 'git hash-object' "$SKILL_DIR/SKILL.md"; then
    pass "SKILL.md specifies git hash-object for hash suffix"
else
    fail "SKILL.md must reference git hash-object"
fi

# Contract: SKILL.md documents the explicit-branch argument flow
if grep -q 'branch was provided in arguments' "$SKILL_DIR/SKILL.md"; then
    pass "SKILL.md documents explicit-branch argument flow"
else
    fail "SKILL.md must document explicit-branch flow"
fi

# Contract: SKILL.md documents --all mode
if grep -q 'all_mode' "$SKILL_DIR/SKILL.md" && grep -q -- '--all' "$SKILL_DIR/SKILL.md"; then
    pass "SKILL.md documents --all mode"
else
    fail "SKILL.md must document --all mode"
fi

change_summary_ref="$SKILL_DIR/references/CHANGE-SUMMARY.md"
test_plan_ref="$SKILL_DIR/references/TEST-PLAN.md"
test_cases_ref="$SKILL_DIR/references/TEST-CASES.md"

# Contract: follow-up handoff commands keep the exact prompt option lines intact
assert_exact_line \
    "$change_summary_ref" \
    '1. Yes — run /aif-qa test-plan <resolved_branch>' \
    "CHANGE-SUMMARY.md keeps exact test-plan handoff line" \
    "CHANGE-SUMMARY.md must contain the exact handoff line '1. Yes — run /aif-qa test-plan <resolved_branch>'"

assert_exact_line \
    "$test_plan_ref" \
    '1. Yes — run /aif-qa test-cases <resolved_branch>' \
    "TEST-PLAN.md keeps exact test-cases handoff line" \
    "TEST-PLAN.md must contain the exact handoff line '1. Yes — run /aif-qa test-cases <resolved_branch>'"

# Contract: final-stage guidance still carries the resolved branch context
if [[ -f "$test_cases_ref" ]] && grep -q 'resolved_branch' "$test_cases_ref"; then
    pass "TEST-CASES.md preserves resolved_branch context"
else
    fail "TEST-CASES.md must reference resolved_branch"
fi

# Contract: reduced commit scope must also narrow diff scope through exact analysis_base command lines
if grep -Fq 'analysis_base' "$change_summary_ref"; then
    pass "CHANGE-SUMMARY.md defines analysis_base"
else
    fail "CHANGE-SUMMARY.md must define analysis_base"
fi

assert_exact_line \
    "$change_summary_ref" \
    'git diff <analysis_base>...<resolved_branch> --name-status' \
    "CHANGE-SUMMARY.md keeps exact name-status diff line" \
    "CHANGE-SUMMARY.md must contain the exact line 'git diff <analysis_base>...<resolved_branch> --name-status'"

assert_exact_line \
    "$change_summary_ref" \
    'git diff <analysis_base>...<resolved_branch>' \
    "CHANGE-SUMMARY.md keeps exact full diff line" \
    "CHANGE-SUMMARY.md must contain the exact line 'git diff <analysis_base>...<resolved_branch>'"

if grep -q 'reduced commit scope and diff scope aligned' "$change_summary_ref"; then
    pass "CHANGE-SUMMARY.md explicitly links reduced commit scope to diff scope"
else
    fail "CHANGE-SUMMARY.md must explicitly state that reduced commit scope and diff scope stay aligned"
fi

# Contract: allowed-tools covers both Bash(git *) and Bash(mkdir *)
# (an earlier PR review caught a mismatch between instructions and permissions)
allowed_line=$(grep -E '^allowed-tools:' "$SKILL_DIR/SKILL.md" || true)
if [[ "$allowed_line" == *"Bash(git *)"* && "$allowed_line" == *"Bash(mkdir *)"* ]]; then
    pass "SKILL.md allowed-tools covers Bash(git *) and Bash(mkdir *)"
else
    fail "SKILL.md allowed-tools must include Bash(git *) and Bash(mkdir *)"
fi

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
TOTAL=$((PASSED + FAILED))
echo ""
echo -e "${BOLD}Total:${NC} $TOTAL, ${GREEN}Passed:${NC} $PASSED, ${RED}Failed:${NC} $FAILED"

if [[ $FAILED -gt 0 ]]; then
    exit 1
fi
exit 0
