#!/bin/bash
# Smoke tests for machine-readable quality gate result contracts.
# Usage: ./scripts/test-gate-result-contract.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTRACT_REF="$ROOT_DIR/skills/aif-verify/references/GATE-RESULT-CONTRACT.md"

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

declare -A GATE_SKILLS=(
  [verify]="$ROOT_DIR/skills/aif-verify/SKILL.md"
  [review]="$ROOT_DIR/skills/aif-review/SKILL.md"
  [security]="$ROOT_DIR/skills/aif-security-checklist/SKILL.md"
  [rules]="$ROOT_DIR/skills/aif-rules-check/SKILL.md"
)

for gate in verify review security rules; do
    file="${GATE_SKILLS[$gate]}"
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
