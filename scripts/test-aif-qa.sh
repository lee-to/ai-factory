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
config_reference_doc="$ROOT_DIR/docs/config-reference.md"
skills_doc="$ROOT_DIR/docs/skills.md"

# Contract: /aif-qa follows the same language.ui/language.artifacts split as other artifact writers.
if grep -Fq 'ui_language' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'artifact_language' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'language.artifacts' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'language.technical_terms' "$SKILL_DIR/SKILL.md"; then
    pass "SKILL.md defines resolved UI, artifact, and technical-terms language policy"
else
    fail "SKILL.md must define ui_language, artifact_language, language.artifacts, and language.technical_terms"
fi

if grep -Fq 'All AskUserQuestion prompts, user-visible explanations, stage completion messages, and next-step guidance MUST be written in `ui_language`.' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'All generated artifacts (`change-summary.md`, `test-plan.md`, `test-cases.md`) MUST be written in `artifact_language`.' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'Templates define structure, not language.' "$SKILL_DIR/SKILL.md"; then
    pass "SKILL.md enforces UI vs artifact language split"
else
    fail "SKILL.md must enforce UI prompts in ui_language and QA artifacts in artifact_language"
fi

# Contract: user prompts are semantic instructions, not hardcoded English output.
if grep -R '^AskUserQuestion:' "$SKILL_DIR/SKILL.md" "$SKILL_DIR/references" >/dev/null; then
    fail "aif-qa must not contain hardcoded 'AskUserQuestion:' output lines"
else
    pass "aif-qa prompt blocks are not hardcoded English AskUserQuestion output"
fi

if grep -Fq 'AskUserQuestion in `ui_language`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'AskUserQuestion in `ui_language`' "$change_summary_ref" \
    && grep -Fq 'AskUserQuestion in `ui_language`' "$test_plan_ref" \
    && grep -Fq 'AskUserQuestion in `ui_language`' "$test_cases_ref"; then
    pass "SKILL and references require AskUserQuestion text in ui_language"
else
    fail "SKILL and all references must require AskUserQuestion text in ui_language"
fi

# Contract: handoff commands remain literal while the surrounding prose is localized.
if grep -Fq '`/aif-qa test-plan <resolved_branch>`' "$change_summary_ref"; then
    pass "CHANGE-SUMMARY.md preserves test-plan handoff command"
else
    fail "CHANGE-SUMMARY.md must preserve /aif-qa test-plan <resolved_branch> as a literal command"
fi

if grep -Fq '`/aif-qa test-cases <resolved_branch>`' "$test_plan_ref"; then
    pass "TEST-PLAN.md preserves test-cases handoff command"
else
    fail "TEST-PLAN.md must preserve /aif-qa test-cases <resolved_branch> as a literal command"
fi

if grep -Fq 'Before saving' "$change_summary_ref" \
    && grep -Fq 'Before saving' "$test_plan_ref" \
    && grep -Fq 'Before saving' "$test_cases_ref" \
    && grep -Fq 'artifact_language' "$change_summary_ref" \
    && grep -Fq 'artifact_language' "$test_plan_ref" \
    && grep -Fq 'artifact_language' "$test_cases_ref"; then
    pass "all QA artifact stages self-check artifact_language before saving"
else
    fail "each QA reference must self-check artifact_language before saving"
fi

if grep -Fq 'canonical English templates' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'translate them to `artifact_language`' "$SKILL_DIR/SKILL.md" \
    && [[ -f "$SKILL_DIR/templates/CHANGE-SUMMARY.md" ]] \
    && [[ -f "$SKILL_DIR/templates/TEST-PLAN.md" ]] \
    && [[ -f "$SKILL_DIR/templates/TEST-CASES.md" ]] \
    && [[ ! -d "$SKILL_DIR/templates/en" ]] \
    && [[ ! -d "$SKILL_DIR/templates/ru" ]] \
    && ! grep -R 'templates/<artifact_language>/' "$SKILL_DIR/SKILL.md" "$SKILL_DIR/references" >/dev/null; then
    pass "QA uses only canonical English templates with translate-to-artifact-language fallback"
else
    fail "aif-qa must use only canonical English templates and translate them to artifact_language when needed"
fi

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
    'git log <effective_base>..<analysis_target> --oneline' \
    "CHANGE-SUMMARY.md keeps exact full-range log line with analysis_target" \
    "CHANGE-SUMMARY.md must contain the exact line 'git log <effective_base>..<analysis_target> --oneline'"

assert_exact_line \
    "$change_summary_ref" \
    'git log <analysis_base>..<analysis_target> --oneline' \
    "CHANGE-SUMMARY.md keeps exact scoped log line with analysis_target" \
    "CHANGE-SUMMARY.md must contain the exact line 'git log <analysis_base>..<analysis_target> --oneline'"

assert_exact_line \
    "$change_summary_ref" \
    'git diff <analysis_base>...<analysis_target> --name-status' \
    "CHANGE-SUMMARY.md keeps exact name-status diff line with analysis_target" \
    "CHANGE-SUMMARY.md must contain the exact line 'git diff <analysis_base>...<analysis_target> --name-status'"

assert_exact_line \
    "$change_summary_ref" \
    'git diff <analysis_base>...<analysis_target>' \
    "CHANGE-SUMMARY.md keeps exact full diff line with analysis_target" \
    "CHANGE-SUMMARY.md must contain the exact line 'git diff <analysis_base>...<analysis_target>'"

if grep -Fq 'analysis_target = <resolved_branch>' "$change_summary_ref" \
    && grep -Fq 'analysis_target = origin/<resolved_branch>' "$change_summary_ref"; then
    pass "CHANGE-SUMMARY.md defines analysis_target for local and remote target refs"
else
    fail "CHANGE-SUMMARY.md must define analysis_target for local and remote target refs"
fi

if grep -q 'reduced commit scope and diff scope aligned' "$change_summary_ref"; then
    pass "CHANGE-SUMMARY.md explicitly links reduced commit scope to diff scope"
else
    fail "CHANGE-SUMMARY.md must explicitly state that reduced commit scope and diff scope stay aligned"
fi

if grep -Fq 'git rev-parse --verify <resolved_branch>' "$change_summary_ref" \
    && grep -Fq 'git rev-parse --verify <effective_base>' "$change_summary_ref" \
    && grep -Fq 'git fetch --all --prune' "$change_summary_ref" \
    && grep -Fq 'origin/<base_branch>' "$change_summary_ref" \
    && grep -Fq 'origin/<resolved_branch>' "$change_summary_ref"; then
    pass "CHANGE-SUMMARY.md validates branch/base refs and documents remote fallback for base and target branch"
else
    fail "CHANGE-SUMMARY.md must validate branch/base refs and try origin/<base_branch> plus origin/<resolved_branch> fallback"
fi

if grep -Fq 'git.enabled' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'manual change context' "$SKILL_DIR/SKILL.md"; then
    pass "SKILL.md handles git.enabled=false/manual change context"
else
    fail "SKILL.md must read git.enabled and describe manual change context fallback"
fi

if grep -Fq 'If you only have a PR description or short implementation summary, derive a best-effort `changed_files` list' "$change_summary_ref" \
    && grep -Fq 'If no reliable file list can be derived, skip file exploration' "$change_summary_ref"; then
    pass "CHANGE-SUMMARY.md handles manual mode without requiring --name-status output"
else
    fail "CHANGE-SUMMARY.md must handle manual mode when no --name-status output exists"
fi

if grep -Fq 'git diff --stat' "$change_summary_ref" \
    && grep -Fq 'generated files, lock files, dependency snapshots, build artifacts, minified assets, or vendored code' "$change_summary_ref"; then
    pass "CHANGE-SUMMARY.md documents large-diff triage and skip rules"
else
    fail "CHANGE-SUMMARY.md must include diff stat triage and generated/vendor skip rules"
fi

if grep -Fq 'model: sonnet' "$change_summary_ref"; then
    fail "CHANGE-SUMMARY.md must not hardcode model: sonnet for Explore agents"
else
    pass "CHANGE-SUMMARY.md does not hardcode model: sonnet"
fi

if grep -Fq 'Do not replace the manual QA plan with automated test implementation details.' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'You may mention existing automated checks only as supporting verification' "$SKILL_DIR/SKILL.md"; then
    pass "SKILL.md keeps manual QA primary while allowing supporting automated checks"
else
    fail "SKILL.md must soften automated-test wording without replacing manual QA"
fi

if grep -Fq '### Evidence' "$SKILL_DIR/templates/CHANGE-SUMMARY.md" \
    && grep -Fq 'Every high-risk item must be backed by observed code/diff evidence or explicitly marked as an assumption.' "$change_summary_ref"; then
    pass "change-summary includes evidence section and high-risk evidence rule"
else
    fail "change-summary template/reference must include evidence section and high-risk evidence rule"
fi

if grep -Fq '| `language.artifacts` | `en` |' "$config_reference_doc" \
    && grep -Fq '/aif-qa' "$config_reference_doc" \
    && grep -Fq 'language.technical_terms' "$config_reference_doc" \
    && grep -Fq 'git.enabled' "$config_reference_doc" \
    && grep -Fq 'paths.description`, `paths.architecture`, `paths.qa`, `language.ui`, `language.artifacts`, `language.technical_terms`, `git.enabled`, `git.base_branch' "$skills_doc"; then
    pass "docs describe /aif-qa language and git config readers"
else
    fail "docs must list /aif-qa as reading language.artifacts, language.technical_terms, git.enabled, and git.base_branch"
fi

if grep -F '| `paths.description` |' "$config_reference_doc" | grep -Fq '/aif-qa' \
    && grep -F '| `paths.architecture` |' "$config_reference_doc" | grep -Fq '/aif-qa' \
    && grep -F '| `git.base_branch` |' "$config_reference_doc" | grep -Fq '/aif-qa'; then
    pass "config-reference key rows list /aif-qa for description, architecture, and git.base_branch"
else
    fail "config-reference key rows must list /aif-qa for paths.description, paths.architecture, and git.base_branch"
fi

config_template="$ROOT_DIR/skills/aif/references/config-template.yaml"
configuration_doc="$ROOT_DIR/docs/configuration.md"

if grep -Fq 'mixed' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'mixed' "$config_template" \
    && grep -Fq 'mixed' "$configuration_doc"; then
    pass "technical_terms mixed policy is documented consistently in skill, config template, and configuration docs"
else
    fail "technical_terms mixed policy must be documented consistently everywhere it is supported"
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
