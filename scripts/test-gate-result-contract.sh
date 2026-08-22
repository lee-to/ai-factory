#!/bin/bash
# Smoke tests for machine-readable quality gate result contracts.
# Usage: ./scripts/test-gate-result-contract.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTRACT_REF="$ROOT_DIR/skills/aif-verify/references/GATE-RESULT-CONTRACT.md"
DOCS_REF="$ROOT_DIR/docs/quality-gates.md"

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

assert_file_exists() {
    local file="$1"
    local message="$2"

    if [[ -f "$file" ]]; then
        pass "$message"
    else
        fail "$message"
    fi
}

assert_contains() {
    local file="$1"
    local expected="$2"
    local message="$3"

    if [[ -f "$file" ]] && grep -Fq "$expected" "$file"; then
        pass "$message"
    else
        fail "$message"
    fi
}

assert_not_contains() {
    local file="$1"
    local unexpected="$2"
    local message="$3"

    if [[ -f "$file" ]] && ! grep -Fq "$unexpected" "$file"; then
        pass "$message"
    else
        fail "$message"
    fi
}

extract_last_gate_result() {
    local input_file="$1"
    local output_file="$2"

    awk '
        /^```aif-gate-result$/ {
            capture = 1
            buffer = ""
            next
        }
        /^```$/ && capture {
            last = buffer
            capture = 0
            next
        }
        capture {
            buffer = buffer $0 ORS
        }
        END {
            if (last == "") {
                exit 1
            }
            printf "%s", last
        }
    ' "$input_file" > "$output_file"
}

validate_gate_result_json() {
    local json_file="$1"
    local message="$2"

    if command -v jq >/dev/null 2>&1; then
        if jq -e '
            . as $result |
            $result.schema_version == 1 and
            (["verify", "review", "security", "rules"] | index($result.gate)) and
            (["pass", "warn", "fail"] | index($result.status)) and
            ($result.blocking | type == "boolean") and
            ($result.blockers | type == "array") and
            ($result.affected_files | type == "array") and
            ($result.suggested_next | type == "object") and
            (
                $result.suggested_next.command == null or
                (["/aif-fix", "/aif-rules", "/aif-architecture", "/aif-roadmap", "/aif-commit"] | index($result.suggested_next.command))
            )
        ' "$json_file" >/dev/null; then
            pass "$message"
        else
            fail "$message"
        fi
    elif command -v node >/dev/null 2>&1; then
        if GATE_RESULT_JSON_FILE="$json_file" node <<'JS'
const fs = require('fs');

const result = JSON.parse(fs.readFileSync(process.env.GATE_RESULT_JSON_FILE, 'utf8'));
const allowedGates = new Set(['verify', 'review', 'security', 'rules']);
const allowedStatus = new Set(['pass', 'warn', 'fail']);
const allowedNext = new Set(['/aif-fix', '/aif-rules', '/aif-architecture', '/aif-roadmap', '/aif-commit', null]);

const ok = (
  result.schema_version === 1 &&
  allowedGates.has(result.gate) &&
  allowedStatus.has(result.status) &&
  typeof result.blocking === 'boolean' &&
  Array.isArray(result.blockers) &&
  Array.isArray(result.affected_files) &&
  result.suggested_next &&
  typeof result.suggested_next === 'object' &&
  allowedNext.has(result.suggested_next.command)
);

process.exit(ok ? 0 : 1);
JS
        then
            pass "$message"
        else
            fail "$message"
        fi
    elif command -v python3 >/dev/null 2>&1; then
        if python3 - "$json_file" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as fh:
    result = json.load(fh)

allowed_gates = {"verify", "review", "security", "rules"}
allowed_status = {"pass", "warn", "fail"}
allowed_next = {"/aif-fix", "/aif-rules", "/aif-architecture", "/aif-roadmap", "/aif-commit", None}

ok = (
    result.get("schema_version") == 1
    and result.get("gate") in allowed_gates
    and result.get("status") in allowed_status
    and isinstance(result.get("blocking"), bool)
    and isinstance(result.get("blockers"), list)
    and isinstance(result.get("affected_files"), list)
    and isinstance(result.get("suggested_next"), dict)
    and result["suggested_next"].get("command") in allowed_next
)

sys.exit(0 if ok else 1)
PY
        then
            pass "$message"
        else
            fail "$message"
        fi
    else
        fail "$message (requires jq, node, or python3)"
    fi
}

echo -e "\n${BOLD}=== Gate result shared contract ===${NC}\n"

assert_file_exists "$CONTRACT_REF" "shared gate result contract exists"
assert_contains "$CONTRACT_REF" '```aif-gate-result' "contract documents exact fence language"
assert_contains "$CONTRACT_REF" 'Orchestrators must parse the last `aif-gate-result` fenced block' "contract documents trailing fence parsing"
assert_contains "$CONTRACT_REF" '"schema_version": 1' "contract documents schema_version"
assert_contains "$CONTRACT_REF" '"status": "pass|warn|fail"' "contract documents allowed status values"
assert_contains "$CONTRACT_REF" '"blocking": true|false' "contract documents boolean blocking"
assert_contains "$CONTRACT_REF" 'critical`/`high` -> `error`' "contract documents security severity bridge"
assert_contains "$CONTRACT_REF" 'files the gate actually evaluated or cited' "contract documents affected_files semantics"
assert_contains "$CONTRACT_REF" '"suggested_next": {' "contract documents suggested_next object"
assert_contains "$CONTRACT_REF" '/aif-fix' "contract documents allowed next commands"
assert_contains "$CONTRACT_REF" 'Each gate may document a narrower subset' "contract documents per-gate suggested_next subsets"
assert_contains "$CONTRACT_REF" '/aif-commit' "contract documents commit as clean next step"

echo -e "\n${BOLD}=== Gate skill output contracts ===${NC}\n"

gate_skill_file() {
    case "$1" in
        verify) printf "%s\n" "$ROOT_DIR/skills/aif-verify/SKILL.md" ;;
        review) printf "%s\n" "$ROOT_DIR/skills/aif-review/SKILL.md" ;;
        security) printf "%s\n" "$ROOT_DIR/skills/aif-security-checklist/SKILL.md" ;;
        rules) printf "%s\n" "$ROOT_DIR/skills/aif-rules-check/SKILL.md" ;;
        *) return 1 ;;
    esac
}

for gate in verify review security rules; do
    file="$(gate_skill_file "$gate")"
    assert_contains "$file" '```aif-gate-result' "$gate skill includes aif-gate-result fence"
    assert_contains "$file" '"gate": "' "$gate skill includes gate field in JSON example"
    assert_contains "$file" '"status": "pass|warn|fail"' "$gate skill documents pass/warn/fail status"
    assert_contains "$file" '"blocking": true|false' "$gate skill documents boolean blocking"
    assert_contains "$file" '"blockers": [' "$gate skill documents blockers array"
    assert_contains "$file" '"affected_files": [' "$gate skill documents affected_files array"
    assert_contains "$file" '"suggested_next": {' "$gate skill documents suggested_next object"
done

assert_contains "$ROOT_DIR/skills/aif-rules-check/SKILL.md" 'PASS` -> `pass`, `WARN` -> `warn`, and `FAIL` -> `fail`' "rules skill documents explicit verdict mapping"
assert_contains "$ROOT_DIR/skills/aif-rules-check/SKILL.md" 'Do not use `/aif-review` in the JSON `suggested_next.command`' "rules skill separates disallowed review command"
assert_contains "$ROOT_DIR/skills/aif-security-checklist/SKILL.md" 'Do not append this gate block for the `ignore <item>` writer flow' "security skill documents ignore writer-flow exception"

echo -e "\n${BOLD}=== Review confidence / unverified-blocker contract ===${NC}\n"

REVIEW_SKILL="$ROOT_DIR/skills/aif-review/SKILL.md"
REVIEW_VALIDATOR="$ROOT_DIR/skills/aif-review/references/VALIDATOR.md"
REVIEW_SEVERITY="$ROOT_DIR/skills/aif-review/references/SEVERITY.md"
REVIEW_CHECK_MODE="$ROOT_DIR/skills/aif-review/references/CHECK-MODE.md"

# Severity and confidence stay independent dimensions.
assert_contains "$REVIEW_SKILL" 'Severity picks the section' "review skill separates severity from confidence"
assert_contains "$REVIEW_SEVERITY" 'never changes severity semantics' "severity rules keep confidence out of severity"

# Markers are resolved before the gate — schema v1 has no unverified-blocker state.
assert_contains "$REVIEW_SKILL" 'No unresolved markers reach the gate' "review skill states the marker-free gate invariant"
assert_contains "$REVIEW_SKILL" 'runs the `+check` validation automatically' "review skill triggers validation on markers without the flag"
assert_contains "$REVIEW_SKILL" 'is not used to encode an unresolved finding' "review skill keeps null at its original meaning"
assert_not_contains "$REVIEW_SKILL" 'every *unmarked* "Critical Issues" item' "blockers no longer carve out marked criticals"
assert_contains "$DOCS_REF" 'does **not** use `null` to encode an unresolved finding' "docs drop the null-for-unverified case"

# Only the two literal markers are legal; the pipe form is not example output.
assert_contains "$REVIEW_SKILL" 'never emit the literal string' "review skill forbids the literal pipe marker"
assert_not_contains "$REVIEW_VALIDATOR" '(confidence: low|medium)' "validator prompt avoids the literal pipe marker"
assert_not_contains "$REVIEW_SEVERITY" '(confidence: low|medium)' "severity rules avoid the literal pipe marker"

# A confirmed marked finding must lose its marker, and `keep` cannot do that.
assert_contains "$REVIEW_VALIDATOR" '`keep` is not valid for a marked item' "validator forbids keep for marked findings"
assert_contains "$REVIEW_VALIDATOR" 'Not valid for an item carrying a confidence marker' "validator verdict list repeats the keep restriction"
assert_contains "$REVIEW_CHECK_MODE" 'Never strip a marker yourself' "check-mode forbids silent unmarking"
assert_contains "$REVIEW_CHECK_MODE" 'violated the marked-item contract' "check-mode defines the marked-item violation path"
assert_contains "$REVIEW_VALIDATOR" 'MUST NOT contain' "validator forbids a marker inside Modified-text"
assert_contains "$REVIEW_CHECK_MODE" 'Confirmed criticals become blockers' "check-mode promotes confirmed criticals into blockers"

# Only actionable code findings enter the validator.
assert_contains "$REVIEW_SKILL" 'actionable code finding' "review skill names the validated item class"
assert_contains "$REVIEW_CHECK_MODE" 'exactly one class of item' "check-mode scopes the validator input"

# The narrative docs describe the same contract — prose drifting back to the
# pre-validation `warn` + `command: null` state is what these guard.
DOCS_WORKFLOW="$ROOT_DIR/docs/workflow.md"
DOCS_SKILLS="$ROOT_DIR/docs/skills.md"

assert_contains "$DOCS_WORKFLOW" 'A marker never reaches the published gate' "workflow docs state the marker-free gate invariant"
assert_contains "$DOCS_WORKFLOW" 'runs the `+check` validation automatically' "workflow docs describe marker-triggered validation"
assert_not_contains "$DOCS_WORKFLOW" 'An unverified marked critical is reported in "Critical Issues" but does not block' "workflow docs drop the unverified-blocker behavior"
assert_contains "$DOCS_SKILLS" 'internal pre-validation draft' "skills docs scope warn+null to the draft"
assert_contains "$DOCS_SKILLS" 'the published gate is already marker-free' "skills docs state the published gate is marker-free"

echo -e "\n${BOLD}=== Gate result docs ===${NC}\n"

assert_file_exists "$DOCS_REF" "quality gate docs page exists"
assert_contains "$DOCS_REF" '```aif-gate-result' "docs include parseable fence examples"
assert_contains "$DOCS_REF" 'parse only the last `aif-gate-result` fenced block' "docs document trailing fence parsing"
assert_contains "$DOCS_REF" '"schema_version": 1' "docs include schema_version"
assert_contains "$DOCS_REF" '"gate": "verify"' "docs include verify example"
assert_contains "$DOCS_REF" '"gate": "review"' "docs include review example"
assert_contains "$DOCS_REF" '"gate": "security"' "docs include security example"
assert_contains "$DOCS_REF" '"gate": "rules"' "docs include rules example"
assert_contains "$DOCS_REF" '"status": "fail"' "docs include fail example"
assert_contains "$DOCS_REF" '"status": "warn"' "docs include warn example"
assert_contains "$DOCS_REF" '"status": "pass"' "docs include pass example"
assert_contains "$DOCS_REF" '"blocking": true' "docs include blocking true example"
assert_contains "$DOCS_REF" '"blocking": false' "docs include blocking false example"
assert_contains "$DOCS_REF" '"blockers": [' "docs include blockers array"
assert_contains "$DOCS_REF" '"affected_files": [' "docs include affected_files array"
assert_contains "$DOCS_REF" '"suggested_next": {' "docs include suggested_next object"

echo -e "\n${BOLD}=== Gate result fixture validation ===${NC}\n"

FIXTURE_FILE="$(mktemp)"
FIXTURE_JSON="$(mktemp)"
trap 'rm -f "$FIXTURE_FILE" "$FIXTURE_JSON"' EXIT

cat > "$FIXTURE_FILE" <<'EOF'
## Human Review

Earlier examples may appear in documentation or quoted context.

```aif-gate-result
{
  "schema_version": 1,
  "gate": "review",
  "status": "fail",
  "blocking": true,
  "blockers": [
    {
      "id": "review-example-1",
      "severity": "error",
      "summary": "Example only."
    }
  ],
  "affected_files": ["docs/example.md"],
  "suggested_next": {
    "command": "/aif-fix",
    "reason": "Example only."
  }
}
```

The final machine-readable result comes last.

```aif-gate-result
{
  "schema_version": 1,
  "gate": "verify",
  "status": "pass",
  "blocking": false,
  "blockers": [],
  "affected_files": ["skills/aif-verify/SKILL.md"],
  "suggested_next": {
    "command": "/aif-commit",
    "reason": "Verification passed."
  }
}
```
EOF

if extract_last_gate_result "$FIXTURE_FILE" "$FIXTURE_JSON"; then
    pass "runtime fixture extracts trailing gate-result fence"
else
    fail "runtime fixture extracts trailing gate-result fence"
fi

validate_gate_result_json "$FIXTURE_JSON" "runtime fixture validates gate-result JSON schema"

if grep -Fq '"gate": "verify"' "$FIXTURE_JSON" && grep -Fq '"status": "pass"' "$FIXTURE_JSON"; then
    pass "runtime fixture ignores earlier example fences"
else
    fail "runtime fixture ignores earlier example fences"
fi

TOTAL=$((PASSED + FAILED))
echo ""
echo -e "${BOLD}Total:${NC} $TOTAL, ${GREEN}Passed:${NC} $PASSED, ${RED}Failed:${NC} $FAILED"

if [[ $FAILED -gt 0 ]]; then
    exit 1
fi
exit 0
