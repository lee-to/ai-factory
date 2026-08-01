#!/bin/bash
# Executable lifecycle tests for the /aif-review confidence-marker contract.
#
# A green skill-validation run only proves the documents are structurally valid.
# This script exercises the behavior they describe: it implements a reference
# parser for the validator response (references/VALIDATOR.md "Output format")
# and a reference projection of aif-gate-result (SKILL.md "Machine-readable
# gate result"), then runs both against stubbed validator output.
#
# The reference implementation is intentionally independent of the prose: if the
# documented contract changes without these tests changing, they fail.
#
# Usage: ./scripts/test-review-confidence-lifecycle.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SKILL="$ROOT_DIR/skills/aif-review/SKILL.md"
CHECK_MODE="$ROOT_DIR/skills/aif-review/references/CHECK-MODE.md"
VALIDATOR="$ROOT_DIR/skills/aif-review/references/VALIDATOR.md"

RED='\033[0;31m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

PASSED=0
FAILED=0

pass() { PASSED=$((PASSED + 1)); echo -e "  ${GREEN}OK${NC} $1"; }
fail() { FAILED=$((FAILED + 1)); echo -e "  ${RED}FAIL${NC} $1"; }

assert_eq() {
    local actual="$1" expected="$2" message="$3"
    if [[ "$actual" == "$expected" ]]; then
        pass "$message"
    else
        fail "$message (expected: '$expected', got: '$actual')"
    fi
}

assert_contains_text() {
    local haystack="$1" needle="$2" message="$3"
    if printf '%s' "$haystack" | grep -Fq "$needle"; then
        pass "$message"
    else
        fail "$message (missing: '$needle')"
    fi
}

assert_lacks_text() {
    local haystack="$1" needle="$2" message="$3"
    if printf '%s' "$haystack" | grep -Fq "$needle"; then
        fail "$message (unexpectedly present: '$needle')"
    else
        pass "$message"
    fi
}

has_marker() {
    printf '%s' "$1" | grep -Eq '\(confidence: (low|medium)\)'
}

# ---------------------------------------------------------------------------
# Reference implementation
# ---------------------------------------------------------------------------
#
# Inputs:
#   ITEM_TEXT[n]     — finding text as drafted by the review
#   ITEM_SECTION[n]  — critical | suggestion
#   response file    — stubbed validator output, or the literal string
#                      DISPATCH_FAILURE to model a whole-dispatch failure
#
# Outputs (globals):
#   OUT_TEXT[n] / OUT_SECTION[n]  — surviving findings
#   OUT_WARNINGS                  — WARN lines, newline separated
#   OUT_FILTERED                  — the "Filtered:" line, or empty
#   GATE_STATUS / GATE_BLOCKING / GATE_BLOCKERS / GATE_COMMAND

apply_validation() {
    local response_file="$1"
    local count="$2"

    OUT_TEXT=(); OUT_SECTION=(); OUT_WARNINGS=""; OUT_FILTERED=""
    local hidden=0 adjusted=0 reclassified=0 warned=0

    # Whole-dispatch failure: every item kept as-is, gate NOT recomputed.
    if [[ "$(cat "$response_file")" == "DISPATCH_FAILURE" ]]; then
        local i
        for ((i = 1; i <= count; i++)); do
            OUT_TEXT+=("${ITEM_TEXT[$i]}")
            OUT_SECTION+=("${ITEM_SECTION[$i]}")
        done
        OUT_WARNINGS="WARN [+check]: validator failed (timeout), all items kept as-is"
        DISPATCH_FAILED=1
        return 0
    fi
    DISPATCH_FAILED=0

    local i
    for ((i = 1; i <= count; i++)); do
        local block verdict severity modified target
        block=$(awk -v n="$i" '
            $0 ~ "^### Item " n " " { capture = 1; next }
            /^### Item / { capture = 0 }
            capture { print }
        ' "$response_file")

        verdict=$(printf '%s' "$block" | sed -n 's/^Verdict: *//p' | head -1)
        severity=$(printf '%s' "$block" | sed -n 's/^Severity: *//p' | head -1)
        modified=$(printf '%s' "$block" | sed -n 's/^Modified-text: *//p' | head -1)
        [[ -z "$severity" ]] && severity="unchanged"

        case "$severity" in
            unchanged) target="${ITEM_SECTION[$i]}" ;;
            critical)  target="critical" ;;
            suggestion) target="suggestion" ;;
            *) severity="malformed"; target="${ITEM_SECTION[$i]}" ;;
        esac

        # Per-item malformed response.
        if [[ -z "$verdict" || "$severity" == "malformed" ]] \
           || [[ "$verdict" != "keep" && "$verdict" != "modify" && "$verdict" != "drop" ]] \
           || [[ "$verdict" == "modify" && -z "$modified" ]]; then
            OUT_TEXT+=("${ITEM_TEXT[$i]}"); OUT_SECTION+=("${ITEM_SECTION[$i]}")
            OUT_WARNINGS+="WARN [+check]: validator response for item $i was malformed, kept as-is"$'\n'
            warned=1
            continue
        fi

        # Marked-item contract: keep is invalid, and modify must drop the marker.
        if has_marker "${ITEM_TEXT[$i]}"; then
            if [[ "$verdict" == "keep" ]] \
               || { [[ "$verdict" == "modify" ]] && has_marker "$modified"; }; then
                OUT_TEXT+=("${ITEM_TEXT[$i]}"); OUT_SECTION+=("${ITEM_SECTION[$i]}")
                OUT_WARNINGS+="WARN [+check]: validator response for item $i violated the marked-item contract, kept as-is"$'\n'
                warned=1
                continue
            fi
        fi

        case "$verdict" in
            keep)
                OUT_TEXT+=("${ITEM_TEXT[$i]}"); OUT_SECTION+=("$target")
                [[ "$target" != "${ITEM_SECTION[$i]}" ]] && reclassified=$((reclassified + 1))
                ;;
            modify)
                OUT_TEXT+=("$modified"); OUT_SECTION+=("$target")
                adjusted=$((adjusted + 1))
                [[ "$target" != "${ITEM_SECTION[$i]}" ]] && reclassified=$((reclassified + 1))
                ;;
            drop)
                hidden=$((hidden + 1))
                ;;
        esac
    done

    if [[ $warned -eq 0 ]]; then
        OUT_FILTERED="Filtered: $hidden hidden, $adjusted adjusted, $reclassified reclassified by +check"
    fi
    return 0
}

project_gate() {
    local context_gate="${1:-pass}"   # pass | warn | fail
    local criticals=0 suggestions=0 i

    GATE_BLOCKERS=""
    for i in "${!OUT_TEXT[@]}"; do
        if [[ "${OUT_SECTION[$i]}" == "critical" ]]; then
            criticals=$((criticals + 1))
            GATE_BLOCKERS+="${OUT_TEXT[$i]}"$'\n'
        else
            suggestions=$((suggestions + 1))
        fi
    done

    local findings_status="pass"
    [[ $suggestions -gt 0 ]] && findings_status="warn"
    [[ $criticals -gt 0 ]] && findings_status="fail"

    # More severe of the two independent inputs.
    GATE_STATUS="$findings_status"
    if [[ "$context_gate" == "fail" ]] \
       || { [[ "$context_gate" == "warn" && "$findings_status" == "pass" ]]; }; then
        GATE_STATUS="$context_gate"
    fi

    [[ "$GATE_STATUS" == "fail" ]] && GATE_BLOCKING="true" || GATE_BLOCKING="false"

    case "$GATE_STATUS" in
        fail) GATE_COMMAND="/aif-fix" ;;
        *)    GATE_COMMAND="/aif-commit" ;;
    esac
}

stub() { printf '%s\n' "$1" > "$STUB_FILE"; }

STUB_FILE="$(mktemp)"
trap 'rm -f "$STUB_FILE"' EXIT

MARKED_CRITICAL='Connection is never closed on the error path. `src/db.ts:42`. Fix: close in `finally`. (confidence: low)'
CONFIRMED_TEXT='Connection is never closed on the error path. `src/db.ts:42`. Fix: close in `finally`.'
PLAIN_SUGGESTION='Variable name `tmp2` is unclear. `src/db.ts:51`. Fix: rename.'

# ---------------------------------------------------------------------------
echo -e "${BOLD}=== 1. marked critical -> modify without marker -> blocker, gate fail ===${NC}"

ITEM_TEXT=([1]="$MARKED_CRITICAL"); ITEM_SECTION=([1]="critical")
stub "### Item 1 (section: critical)
Verdict: modify
Reason: verified against the diff
Modified-text: $CONFIRMED_TEXT"
apply_validation "$STUB_FILE" 1
project_gate pass

assert_eq "${OUT_TEXT[0]}" "$CONFIRMED_TEXT" "confirmed item comes back without its marker"
assert_eq "$GATE_STATUS" "fail" "confirmed critical drives status fail"
assert_eq "$GATE_BLOCKING" "true" "blocking is true on fail"
assert_contains_text "$GATE_BLOCKERS" "src/db.ts:42" "confirmed critical enters blockers"
assert_eq "$GATE_COMMAND" "/aif-fix" "fail suggests /aif-fix"
assert_eq "$OUT_WARNINGS" "" "no warning on a contract-compliant confirmation"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 2. marked critical -> drop -> finding removed ===${NC}"

ITEM_TEXT=([1]="$MARKED_CRITICAL"); ITEM_SECTION=([1]="critical")
stub "### Item 1 (section: critical)
Verdict: drop
Reason: behavior does not follow from the code"
apply_validation "$STUB_FILE" 1
project_gate pass

assert_eq "${#OUT_TEXT[@]}" "0" "refuted finding is removed entirely"
assert_eq "$GATE_STATUS" "pass" "gate is clean once the only finding is refuted"
assert_eq "$GATE_COMMAND" "/aif-commit" "clean gate suggests /aif-commit"
assert_contains_text "$OUT_FILTERED" "1 hidden" "drop is counted as hidden"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 3. marked critical -> keep -> contract violation ===${NC}"

ITEM_TEXT=([1]="$MARKED_CRITICAL"); ITEM_SECTION=([1]="critical")
stub "### Item 1 (section: critical)
Verdict: keep
Reason: looks right"
apply_validation "$STUB_FILE" 1
project_gate pass

assert_contains_text "$OUT_WARNINGS" "violated the marked-item contract" "keep on a marked item is a contract violation"
assert_eq "${OUT_TEXT[0]}" "$MARKED_CRITICAL" "original marked text is preserved verbatim"
assert_eq "$OUT_FILTERED" "" "a warned run does not report a clean Filtered line"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 4. marked critical -> modify keeping the marker -> contract violation ===${NC}"

ITEM_TEXT=([1]="$MARKED_CRITICAL"); ITEM_SECTION=([1]="critical")
stub "### Item 1 (section: critical)
Verdict: modify
Reason: reworded
Modified-text: Connection may leak on the error path. \`src/db.ts:42\`. (confidence: medium)"
apply_validation "$STUB_FILE" 1
project_gate pass

assert_contains_text "$OUT_WARNINGS" "violated the marked-item contract" "modify that keeps a marker is a contract violation"
assert_eq "${OUT_TEXT[0]}" "$MARKED_CRITICAL" "violating modify does not replace the original text"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 5. confirmed critical + suggestion never suggests /aif-commit ===${NC}"

ITEM_TEXT=([1]="$MARKED_CRITICAL" [2]="$PLAIN_SUGGESTION")
ITEM_SECTION=([1]="critical" [2]="suggestion")
stub "### Item 1 (section: critical)
Verdict: modify
Reason: verified
Modified-text: $CONFIRMED_TEXT
### Item 2 (section: suggestion)
Verdict: keep
Reason: accurate"
apply_validation "$STUB_FILE" 2
project_gate pass

assert_eq "$GATE_STATUS" "fail" "a confirmed critical outweighs a coexisting suggestion"
assert_eq "$GATE_COMMAND" "/aif-fix" "mixed result never suggests /aif-commit"
assert_eq "${#OUT_TEXT[@]}" "2" "both findings survive"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 6. whole-dispatch failure keeps the pre-validation gate ===${NC}"

ITEM_TEXT=([1]="$MARKED_CRITICAL"); ITEM_SECTION=([1]="critical")
stub "DISPATCH_FAILURE"
apply_validation "$STUB_FILE" 1

assert_eq "$DISPATCH_FAILED" "1" "dispatch failure is detected"
assert_contains_text "$OUT_WARNINGS" "validator failed" "dispatch failure emits a WARN line"
assert_eq "${OUT_TEXT[0]}" "$MARKED_CRITICAL" "items are kept as-is on dispatch failure"
assert_eq "$OUT_FILTERED" "" "no Filtered line on dispatch failure"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 7. successful pass leaves no confidence marker ===${NC}"

ITEM_TEXT=([1]="$MARKED_CRITICAL" [2]="Another shaky claim. \`src/a.ts:7\`. (confidence: medium)" [3]="$PLAIN_SUGGESTION")
ITEM_SECTION=([1]="critical" [2]="critical" [3]="suggestion")
stub "### Item 1 (section: critical)
Verdict: modify
Reason: verified
Modified-text: $CONFIRMED_TEXT
### Item 2 (section: critical)
Verdict: drop
Reason: not reproducible
### Item 3 (section: suggestion)
Verdict: keep
Reason: accurate"
apply_validation "$STUB_FILE" 3
project_gate pass

ALL_SURVIVING="$(printf '%s\n' "${OUT_TEXT[@]}")"
assert_lacks_text "$ALL_SURVIVING" "(confidence: low)" "no low marker survives a successful pass"
assert_lacks_text "$ALL_SURVIVING" "(confidence: medium)" "no medium marker survives a successful pass"
assert_eq "$OUT_WARNINGS" "" "successful pass emits no warnings"
assert_contains_text "$OUT_FILTERED" "1 hidden, 1 adjusted" "counters reflect the pass"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 8. markers without an explicit flag still trigger validation ===${NC}"
#
# The trigger itself lives in the skill prose, so it is asserted there; the
# behavioral half is that the resulting gate is marker-free either way.

assert_contains_text "$(cat "$SKILL")" "runs the \`+check\` validation automatically" \
    "skill mandates automatic validation when markers are present"
assert_contains_text "$(cat "$CHECK_MODE")" "run the procedure even without the flag" \
    "check-mode runs without the flag when markers are present"
assert_contains_text "$(cat "$SKILL")" "No unresolved markers reach the gate" \
    "gate contract states the marker-free invariant"

ITEM_TEXT=([1]="$MARKED_CRITICAL"); ITEM_SECTION=([1]="critical")
stub "### Item 1 (section: critical)
Verdict: modify
Reason: verified
Modified-text: $CONFIRMED_TEXT"
apply_validation "$STUB_FILE" 1
project_gate pass
assert_lacks_text "${OUT_TEXT[0]}" "confidence:" "gate input is marker-free on an implicit run"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== Contract prose invariants ===${NC}"

assert_lacks_text "$(cat "$SKILL")" 'does **not** enter `"blockers"`' \
    "the unverified-blocker carve-out is gone from the gate contract"
assert_contains_text "$(cat "$VALIDATOR")" "MUST NOT contain" \
    "validator forbids returning a marker in Modified-text"
assert_contains_text "$(cat "$CHECK_MODE")" "Post-condition of a successful pass" \
    "check-mode states the post-condition explicitly"

# ---------------------------------------------------------------------------
TOTAL=$((PASSED + FAILED))
echo ""
echo -e "${BOLD}Total:${NC} $TOTAL, ${GREEN}Passed:${NC} $PASSED, ${RED}Failed:${NC} $FAILED"

[[ $FAILED -gt 0 ]] && exit 1
exit 0
