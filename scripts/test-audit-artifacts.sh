#!/bin/bash
# Smoke tests for ai-factory audit-artifacts command behavior.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

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

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

(cd "$ROOT_DIR" && npm run build > /dev/null)

run_audit() {
    local project_dir="$1"
    local output_file="$2"
    shift 2

    set +e
    (cd "$project_dir" && node "$ROOT_DIR/dist/cli/index.js" audit-artifacts --json "$@" > "$output_file" 2>&1)
    local exit_code=$?
    set -e
    return "$exit_code"
}

assert_json() {
    local output_file="$1"
    local expression="$2"
    local message="$3"

    if AUDIT_JSON_FILE="$output_file" AUDIT_JSON_EXPR="$expression" node <<'JS'
const fs = require('fs');
const result = JSON.parse(fs.readFileSync(process.env.AUDIT_JSON_FILE, 'utf8'));
const ok = Function('result', `return (${process.env.AUDIT_JSON_EXPR});`)(result);
process.exit(ok ? 0 : 1);
JS
    then
        pass "$message"
    else
        fail "$message"
        sed 's/^/      /' "$output_file"
    fi
}

write_artifact() {
    local file="$1"
    local body="$2"
    mkdir -p "$(dirname "$file")"
    printf '%s\n' "$body" > "$file"
}

echo -e "\n${BOLD}=== audit-artifacts command smoke ===${NC}\n"

# Valid graph -> pass, exit 0.
VALID_PROJECT="$TMPDIR/valid"
mkdir -p "$VALID_PROJECT/.ai-factory"
write_artifact "$VALID_PROJECT/.ai-factory/spec.md" '---
id: spec-auth
type: spec
status: accepted
owners: [platform]
affects: [tests-auth]
---
# Spec'
write_artifact "$VALID_PROJECT/.ai-factory/tests.md" '---
id: tests-auth
type: tests
status: active
owners: [qa]
verifies: [spec-auth]
---
# Tests'
VALID_OUTPUT="$TMPDIR/valid.json"
if run_audit "$VALID_PROJECT" "$VALID_OUTPUT" .ai-factory; then
    pass "valid artifact graph exits 0"
else
    fail "valid artifact graph should exit 0"
fi
assert_json "$VALID_OUTPUT" 'result.status === "pass" && result.artifacts === 2 && result.findings.length === 0' "valid artifact graph reports pass"

# Unknown relation -> fail, non-zero.
UNKNOWN_PROJECT="$TMPDIR/unknown"
mkdir -p "$UNKNOWN_PROJECT/.ai-factory"
write_artifact "$UNKNOWN_PROJECT/.ai-factory/spec.md" '---
id: spec-auth
type: spec
status: accepted
owners: [platform]
depends_on: [adr-missing]
---
# Spec'
UNKNOWN_OUTPUT="$TMPDIR/unknown.json"
if run_audit "$UNKNOWN_PROJECT" "$UNKNOWN_OUTPUT" .ai-factory; then
    fail "unknown relation should exit non-zero"
else
    pass "unknown relation exits non-zero"
fi
assert_json "$UNKNOWN_OUTPUT" 'result.status === "fail" && result.findings.some(f => f.level === "fail" && f.message.includes("adr-missing"))' "unknown relation reports fail finding"

# Duplicate id -> fail, non-zero.
DUP_PROJECT="$TMPDIR/duplicate"
mkdir -p "$DUP_PROJECT/.ai-factory"
write_artifact "$DUP_PROJECT/.ai-factory/a.md" '---
id: spec-auth
type: spec
status: accepted
owners: [platform]
---
# A'
write_artifact "$DUP_PROJECT/.ai-factory/b.md" '---
id: spec-auth
type: spec
status: accepted
owners: [platform]
---
# B'
DUP_OUTPUT="$TMPDIR/duplicate.json"
if run_audit "$DUP_PROJECT" "$DUP_OUTPUT" .ai-factory; then
    fail "duplicate id should exit non-zero"
else
    pass "duplicate id exits non-zero"
fi
assert_json "$DUP_OUTPUT" 'result.status === "fail" && result.findings.some(f => f.message.includes("Duplicate artifact id"))' "duplicate id reports fail finding"

# Missing recommended fields -> warn by default, fail under strict.
WARN_PROJECT="$TMPDIR/warn"
mkdir -p "$WARN_PROJECT/.ai-factory"
write_artifact "$WARN_PROJECT/.ai-factory/minimal.md" '---
id: spec-minimal
---
# Minimal'
WARN_OUTPUT="$TMPDIR/warn.json"
if run_audit "$WARN_PROJECT" "$WARN_OUTPUT" .ai-factory; then
    pass "warnings exit 0 by default"
else
    fail "warnings should exit 0 by default"
fi
assert_json "$WARN_OUTPUT" 'result.status === "warn" && result.findings.some(f => f.level === "warn" && f.message.includes("Missing owner"))' "missing recommended fields report warn"
STRICT_OUTPUT="$TMPDIR/strict.json"
if run_audit "$WARN_PROJECT" "$STRICT_OUTPUT" .ai-factory --strict; then
    fail "strict warnings should exit non-zero"
else
    pass "strict warnings exit non-zero"
fi
assert_json "$STRICT_OUTPUT" 'result.status === "fail" && result.findings.every(f => f.level === "warn")' "strict warnings report fail status"

# Dependency cycle -> fail, non-zero.
CYCLE_PROJECT="$TMPDIR/cycle"
mkdir -p "$CYCLE_PROJECT/.ai-factory"
write_artifact "$CYCLE_PROJECT/.ai-factory/a.md" '---
id: artifact-a
type: spec
status: active
owners: [platform]
depends_on: [artifact-b]
---
# A'
write_artifact "$CYCLE_PROJECT/.ai-factory/b.md" '---
id: artifact-b
type: spec
status: active
owners: [platform]
depends_on: [artifact-a]
---
# B'
CYCLE_OUTPUT="$TMPDIR/cycle.json"
if run_audit "$CYCLE_PROJECT" "$CYCLE_OUTPUT" .ai-factory; then
    fail "dependency cycle should exit non-zero"
else
    pass "dependency cycle exits non-zero"
fi
assert_json "$CYCLE_OUTPUT" 'result.status === "fail" && result.findings.some(f => f.message.includes("Dependency cycle"))' "dependency cycle reports fail finding"

# Explicit missing path -> fail, non-zero; mixed valid + missing also fails.
MISSING_OUTPUT="$TMPDIR/missing.json"
if run_audit "$VALID_PROJECT" "$MISSING_OUTPUT" missing.md; then
    fail "explicit missing path should exit non-zero"
else
    pass "explicit missing path exits non-zero"
fi
assert_json "$MISSING_OUTPUT" 'result.status === "fail" && result.findings.some(f => f.file === "missing.md" && f.message.includes("does not exist"))' "explicit missing path reports target finding"

MIXED_OUTPUT="$TMPDIR/mixed.json"
if run_audit "$VALID_PROJECT" "$MIXED_OUTPUT" .ai-factory missing.md; then
    fail "mixed valid and missing explicit targets should exit non-zero"
else
    pass "mixed valid and missing explicit targets exit non-zero"
fi
assert_json "$MIXED_OUTPUT" 'result.status === "fail" && result.artifacts === 2 && result.findings.some(f => f.file === "missing.md")' "mixed explicit targets keep valid artifacts and missing-path finding"

# Symlinked default target outside project -> do not index outside artifact; warn by default.
OUTSIDE_DIR="$TMPDIR/outside-docs"
SYMLINK_PROJECT="$TMPDIR/symlink"
mkdir -p "$OUTSIDE_DIR" "$SYMLINK_PROJECT"
write_artifact "$OUTSIDE_DIR/outside.md" '---
id: outside-artifact
type: docs
status: active
owners: [docs]
---
# Outside'
node - "$OUTSIDE_DIR" "$SYMLINK_PROJECT/docs" <<'EOF'
const fs = require('fs');

fs.symlinkSync(
  process.argv[2],
  process.argv[3],
  process.platform === 'win32' ? 'junction' : 'dir',
);
EOF
SYMLINK_OUTPUT="$TMPDIR/symlink.json"
if run_audit "$SYMLINK_PROJECT" "$SYMLINK_OUTPUT"; then
    pass "default outside symlink warning exits 0"
else
    fail "default outside symlink warning should exit 0"
fi
assert_json "$SYMLINK_OUTPUT" 'result.status === "warn" && result.artifacts === 0 && result.findings.some(f => f.file === "docs" && f.message.includes("outside the project boundary"))' "default outside symlink is not indexed and reports warning"

EXPLICIT_SYMLINK_OUTPUT="$TMPDIR/explicit-symlink.json"
if run_audit "$SYMLINK_PROJECT" "$EXPLICIT_SYMLINK_OUTPUT" docs; then
    fail "explicit outside symlink should exit non-zero"
else
    pass "explicit outside symlink exits non-zero"
fi
assert_json "$EXPLICIT_SYMLINK_OUTPUT" 'result.status === "fail" && result.artifacts === 0 && result.findings.some(f => f.file === "docs" && f.level === "fail")' "explicit outside symlink reports fail finding"

# Explicit directory targets whose basename is skipped by default are still scanned as requested.
EXPLICIT_SKIP_PROJECT="$TMPDIR/explicit-skip-root"
mkdir -p "$EXPLICIT_SKIP_PROJECT/.ai-factory/qa/branch" "$EXPLICIT_SKIP_PROJECT/qa/branch"
write_artifact "$EXPLICIT_SKIP_PROJECT/.ai-factory/qa/branch/case.md" '---
id: qa-auth-login
type: qa
status: active
owners: [qa]
depends_on: [spec-missing]
---
# QA'
write_artifact "$EXPLICIT_SKIP_PROJECT/qa/branch/case.md" '---
id: qa-root-auth-login
type: qa
status: active
owners: [qa]
depends_on: [spec-missing]
---
# QA'
EXPLICIT_AIF_QA_OUTPUT="$TMPDIR/explicit-aif-qa.json"
if run_audit "$EXPLICIT_SKIP_PROJECT" "$EXPLICIT_AIF_QA_OUTPUT" .ai-factory/qa; then
    fail "explicit .ai-factory/qa target with bad artifact should exit non-zero"
else
    pass "explicit .ai-factory/qa target with bad artifact exits non-zero"
fi
assert_json "$EXPLICIT_AIF_QA_OUTPUT" 'result.status === "fail" && result.artifacts === 1 && result.findings.some(f => f.file === ".ai-factory/qa/branch/case.md" && f.message.includes("spec-missing"))' "explicit .ai-factory/qa target is scanned"

EXPLICIT_ROOT_QA_OUTPUT="$TMPDIR/explicit-root-qa.json"
if run_audit "$EXPLICIT_SKIP_PROJECT" "$EXPLICIT_ROOT_QA_OUTPUT" qa; then
    fail "explicit qa target with bad artifact should exit non-zero"
else
    pass "explicit qa target with bad artifact exits non-zero"
fi
assert_json "$EXPLICIT_ROOT_QA_OUTPUT" 'result.status === "fail" && result.artifacts === 1 && result.findings.some(f => f.file === "qa/branch/case.md" && f.message.includes("spec-missing"))' "explicit qa target is scanned"

echo -e "\n${BOLD}Total:${NC} $((PASSED + FAILED)), ${GREEN}Passed:${NC} $PASSED, ${RED}Failed:${NC} $FAILED"

if [[ "$FAILED" -gt 0 ]]; then
    exit 1
fi
