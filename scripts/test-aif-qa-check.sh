#!/bin/bash
# Smoke tests for /aif-qa-check: execution-mode and artifact contracts.
# Usage: ./scripts/test-aif-qa-check.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_DIR="$ROOT_DIR/skills/aif-qa-check"

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

echo -e "\n${BOLD}=== /aif-qa-check skill contract ===${NC}\n"

if [[ -f "$SKILL_DIR/SKILL.md" ]] && [[ -f "$SKILL_DIR/templates/QA-CHECK.md" ]]; then
    pass "skill and QA-CHECK template exist"
else
    fail "skill must include SKILL.md and templates/QA-CHECK.md"
fi

if grep -Fq '| `human` | Human-guided QA |' "$SKILL_DIR/SKILL.md" \
    && grep -Fq '| `agent` | Automated-agent QA |' "$SKILL_DIR/SKILL.md"; then
    pass "SKILL.md documents human and agent modes"
else
    fail "SKILL.md must document human and agent modes"
fi

if grep -Fq 'disable-model-invocation: true' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'Agent mode is user-only (`disable-model-invocation: true`)' "$SKILL_DIR/SKILL.md"; then
    pass "live browser execution is user-only"
else
    fail "agent browser execution must be user-only or explicitly gated"
fi

if grep -Fq 'Show only that test case' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'Протестируйте и ответьте работает или нет' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'Save `qa-check.md` after every case' "$SKILL_DIR/SKILL.md"; then
    pass "human mode enforces one-case prompts, required summary question, and incremental saves"
else
    fail "human mode contract missing one-case prompt, required summary question, or incremental save"
fi

if grep -Fq 'Browser automation is REQUIRED for browser/UI-observable cases' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'prefer the in-app Browser capability' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'use Playwright MCP' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'Continue with other cases that can be verified through CLI, tests, API, or file/document checks' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'MUST NOT block non-browser cases merely because live browser automation is unavailable' "$SKILL_DIR/SKILL.md"; then
    pass "agent mode requires browser for UI cases while allowing non-browser execution surfaces"
else
    fail "agent mode must preserve Browser/Playwright for UI cases and continue non-browser cases without browser tools"
fi

if grep -Fq 'Step 1.1: Agent Mode Capability and Safety Preflight' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'If `mode = agent`, perform Step 1.1 before creating or modifying `qa-check.md`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'Existing `qa-check.md` may be inspected read-only during this gate' "$SKILL_DIR/SKILL.md"; then
    pass "agent-mode capability gate runs before artifact creation"
else
    fail "agent mode must run capability/safety preflight before creating qa-check.md"
fi

if grep -Fq 'target environment' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'against `production` or `unknown` targets without explicit user authorization' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'Require explicit per-case authorization' "$SKILL_DIR/SKILL.md"; then
    pass "agent mode blocks unknown/production targets and destructive cases without authorization"
else
    fail "agent mode must require authorization for unknown/production targets and destructive cases"
fi

if grep -Fq 'Redact credentials, cookies, authorization values' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'sensitive URL parameters' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'token`, `access_token`, `refresh_token`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'all human-entered comments/evidence' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'before writing comments or evidence to `qa-check.md`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq '[REDACTED]' "$SKILL_DIR/SKILL.md"; then
    pass "comment and evidence redaction covers credentials, authorization values, and sensitive URL parameters"
else
    fail "comments and evidence must redact credentials, authorization values, and sensitive URL parameters"
fi

if grep -Fq '`source_digest`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq '`case_digests`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq '`replay_script_digests`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq '`tested_revision`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq '`worktree_digest`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq '`manual_build_id`' "$SKILL_DIR/SKILL.md"; then
    pass "qa-check binds results to revision/build id, worktree, and source/case digests"
else
    fail "qa-check must record tested revision or manual build id plus worktree and deterministic test-case digests"
fi

if grep -Fq 'Normalize line endings from CRLF or CR to LF' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'Remove trailing spaces and tabs from each line' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'Preserve the original field order' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'BEGIN TC-NNN' "$SKILL_DIR/SKILL.md"; then
    pass "per-case digest canonicalization is deterministic"
else
    fail "per-case digest canonicalization must define line endings, whitespace, field order, and block boundaries"
fi

if grep -Fq 'git status --porcelain=v1 --untracked-files=all' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'git diff --binary HEAD --' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'Exclude `qa_check_path` and every file under `browser_replay_dir` from the status, diff, and untracked-file digest inputs' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'UNTRACKED <path> <content-digest>' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'If the filtered work tree input is clean, record the digest of the canonical string `clean\n`' "$SKILL_DIR/SKILL.md"; then
    pass "worktree digest covers dirty working tree state"
else
    fail "worktree digest must cover dirty tracked and untracked working tree state"
fi

if grep -Fq 'If `tested_revision` changed, mark every prior result as `Stale`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'If `worktree_digest` changed, mark every prior result as `Stale`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'If `manual_build_id` changed, treat it the same as a tested revision change' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'If an existing case'\''s digest changed, mark that case `Stale`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'Do not count stale pass/fail/block statuses as current' "$SKILL_DIR/SKILL.md"; then
    pass "resume marks revision/worktree/source changes stale instead of reusing old passes"
else
    fail "resume must stale prior results when branch revision, worktree state, or source cases change"
fi

if grep -Fq 'preserving user wording except mandatory redaction of sensitive values' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'MUST preserve failed-user comment wording except mandatory redaction of sensitive values before writing' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'User failure reason, redacted if sensitive' "$SKILL_DIR/templates/QA-CHECK.md"; then
    pass "human failed comments preserve wording with mandatory redaction"
else
    fail "human failed comments must be redacted before write while preserving user wording"
fi

if grep -Fq 'persistent writes are limited to `qa-check.md`, branch-specific `browser-replay/TC-NNN.js`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq '`browser-replay/history/*.js`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'do not rewrite `test-cases.md`, `test-plan.md`, `change-summary.md`, or `config.yaml`' "$SKILL_DIR/SKILL.md"; then
    pass "artifact ownership includes browser replay while keeping source QA artifacts read-only"
else
    fail "artifact ownership must limit writes to qa-check results, browser replay, and agent memory"
fi

if grep -Fq '`browser_replay_dir = <artifact_dir>/browser-replay`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq '`<browser_replay_dir>/TC-NNN.js`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq '`async (page) => { ... }`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq '// aif-case-digest: <case_digest>' "$SKILL_DIR/SKILL.md" \
    && grep -Fq '// aif-target-fingerprint: <target_fingerprint>' "$SKILL_DIR/SKILL.md" \
    && grep -Fq '"AIF_BASE_URL"' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'do not automatically execute a new or updated script a second time' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'explicitly says this is a repeat execution' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'same semantic element and expected behavior are still present' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'actual `script_digest` versus the last proof recorded' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'history/TC-NNN-<old_script_digest>.js' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'replay all current matching browser scripts, including cases that previously passed and failed' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'Treat replay as the regression baseline, not the only browser check' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'Run it when the change affects shared UI, layout, navigation, authentication, permissions, state transitions' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'Browser exploration: Skipped' "$SKILL_DIR/SKILL.md" \
    && grep -Fq 'MUST NOT add a browser test dependency or runner solely for replay artifacts' "$SKILL_DIR/SKILL.md"; then
    pass "browser replay is side-effect-safe and bound to case, target, and executed script content"
else
    fail "agent mode must safely bind and preserve replay evidence before regression reuse"
fi

if grep -Fq 'Exclude `qa_check_path` and every file under `browser_replay_dir`' "$SKILL_DIR/SKILL.md"; then
    pass "QA-owned browser replay files do not stale their own worktree binding"
else
    fail "worktree digest must exclude QA-owned browser replay files"
fi

if grep -Fq '`language.ui`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq '`language.artifacts`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq '`language.technical_terms`' "$SKILL_DIR/SKILL.md" \
    && grep -Fq '`git.enabled`' "$SKILL_DIR/SKILL.md"; then
    pass "SKILL.md documents config-aware language and git policy"
else
    fail "SKILL.md must document config-aware language and git policy"
fi

if grep -Fq -- '- [ ] TC-001:' "$SKILL_DIR/templates/QA-CHECK.md" \
    && grep -Fq 'Tested revision:' "$SKILL_DIR/templates/QA-CHECK.md" \
    && grep -Fq 'Worktree digest:' "$SKILL_DIR/templates/QA-CHECK.md" \
    && grep -Fq 'Manual build/version identifier:' "$SKILL_DIR/templates/QA-CHECK.md" \
    && grep -Fq 'Source digest:' "$SKILL_DIR/templates/QA-CHECK.md" \
    && grep -Fq 'Case digest:' "$SKILL_DIR/templates/QA-CHECK.md" \
    && grep -Fq 'Browser replay directory:' "$SKILL_DIR/templates/QA-CHECK.md" \
    && grep -Fq 'Browser replay:' "$SKILL_DIR/templates/QA-CHECK.md" \
    && grep -Fq 'Script digest:' "$SKILL_DIR/templates/QA-CHECK.md" \
    && grep -Fq 'Target fingerprint:' "$SKILL_DIR/templates/QA-CHECK.md" \
    && grep -Fq 'Proof status:' "$SKILL_DIR/templates/QA-CHECK.md" \
    && grep -Fq 'Preserved previous script:' "$SKILL_DIR/templates/QA-CHECK.md" \
    && grep -Fq '## Browser Exploration' "$SKILL_DIR/templates/QA-CHECK.md" \
    && grep -Fq 'Decision: [Ran / Skipped / n/a]' "$SKILL_DIR/templates/QA-CHECK.md" \
    && grep -Fq 'Stale / Removed Cases' "$SKILL_DIR/templates/QA-CHECK.md" \
    && grep -Fq 'Status: Pending' "$SKILL_DIR/templates/QA-CHECK.md" \
    && grep -Fq 'Evidence:' "$SKILL_DIR/templates/QA-CHECK.md"; then
    pass "QA-CHECK template uses bound checkbox execution records with stale history"
else
    fail "QA-CHECK template must include revision/source binding, per-case digests, stale history, and checkbox execution records"
fi

config_reference_doc="$ROOT_DIR/docs/config-reference.md"
skills_doc="$ROOT_DIR/docs/skills.md"
workflow_doc="$ROOT_DIR/docs/workflow.md"
skill_hints="$ROOT_DIR/src/cli/wizard/skill-hints.ts"

if grep -Fq '/aif-qa-check' "$skills_doc" \
    && grep -Fq '/aif-qa-check' "$workflow_doc" \
    && grep -Fq '/aif-qa-check' "$config_reference_doc" \
    && grep -Fq "'aif-qa-check':" "$skill_hints"; then
    pass "docs and CLI hints list /aif-qa-check"
else
    fail "docs and CLI hints must list /aif-qa-check"
fi

if grep -F '| `paths.qa` |' "$config_reference_doc" | grep -Fq '/aif-qa-check' \
    && grep -F '| `git.enabled` |' "$config_reference_doc" | grep -Fq '/aif-qa-check' \
    && grep -F '| `/aif-qa-check` |' "$config_reference_doc" | grep -Fq 'language.technical_terms'; then
    pass "config-reference documents paths.qa, git.enabled, and language readers"
else
    fail "config-reference must document /aif-qa-check config readers"
fi

echo -e "\n${BOLD}=== Results ===${NC}"
echo -e "  Passed: ${GREEN}$PASSED${NC}"
echo -e "  Failed: ${RED}$FAILED${NC}"

if [[ $FAILED -gt 0 ]]; then
    echo -e "\n${RED}aif-qa-check smoke tests failed${NC}\n"
    exit 1
fi

echo -e "\n${GREEN}aif-qa-check smoke tests passed${NC}\n"
