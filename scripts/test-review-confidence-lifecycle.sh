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

# A marker is a suffix of the whole item text. `grep`'s `$` anchors to the end
# of any line, so an inner line of a multi-line item would match; `[[ =~ ]]`
# anchors to the end of the string.
has_marker() {
    local marker_re='\(confidence: (low|medium)\)[[:space:]]*$'
    [[ "$1" =~ $marker_re ]]
}

# ---------------------------------------------------------------------------
# Reference implementation
# ---------------------------------------------------------------------------
#
# Inputs:
#   ITEM_TEXT[n]     — finding text as drafted by the review
#   ITEM_SECTION[n]  — critical | suggestion
#   response file    — stubbed validator output, or `DISPATCH_FAILURE` /
#                      `DISPATCH_FAILURE: <reason>` for a whole-dispatch failure
#
# Outputs (globals):
#   OUT_TEXT[n] / OUT_SECTION[n]  — surviving findings
#   OUT_WARNINGS                  — WARN lines, newline separated
#   OUT_FILTERED                  — the "Filtered:" line, or empty
#   GATE_STATUS / GATE_BLOCKING / GATE_BLOCKERS / GATE_COMMAND / GATE_REASON
#   GATE_VALIDATION_FAILED        — 1 when a marker survived the pass
#
# project_gate takes the context-gate result: its status (pass|warn|fail), and
# when failing its id (rules|architecture|roadmap) plus the blocking finding.

apply_validation() {
    local response_file="$1"
    local count="$2"

    OUT_TEXT=(); OUT_SECTION=(); OUT_WARNINGS=""; OUT_FILTERED=""
    UNVALIDATED_ITEMS=0
    local hidden=0 adjusted=0 reclassified=0 warned=0

    # Whole-dispatch failure: every item kept as-is, gate NOT recomputed.
    # `DISPATCH_FAILURE` alone models a timeout; `DISPATCH_FAILURE: <reason>`
    # models the other causes, including "review-validator unavailable" on an
    # automatic run, which CHECK-MODE.md routes here instead of dispatching a
    # full-tool agent.
    local raw reason
    raw="$(cat "$response_file")"
    # CHECK-MODE.md "Failure modes" lists an empty response as a whole-dispatch
    # failure, not as N malformed per-item responses: nothing came back at all,
    # so there is no per-item evidence to attribute.
    if [[ "$raw" == DISPATCH_FAILURE* || -z "${raw//[[:space:]]/}" ]]; then
        reason="timeout"
        if [[ -z "${raw//[[:space:]]/}" ]]; then
            reason="empty response"
        elif [[ "$raw" == DISPATCH_FAILURE:* ]]; then
            reason="${raw#DISPATCH_FAILURE:}"
            reason="${reason# }"
        fi
        local i
        for ((i = 1; i <= count; i++)); do
            OUT_TEXT+=("${ITEM_TEXT[$i]}")
            OUT_SECTION+=("${ITEM_SECTION[$i]}")
        done
        OUT_WARNINGS="WARN [+check]: validator failed ($reason), all items kept as-is"
        DISPATCH_FAILED=1
        return 0
    fi
    DISPATCH_FAILED=0

    local i
    for ((i = 1; i <= count; i++)); do
        local block fields verdict severity modified target
        block=$(awk -v n="$i" '
            $0 ~ "^### Item " n " " { capture = 1; next }
            /^### Item / { capture = 0 }
            capture { print }
        ' "$response_file")

        # VALIDATOR.md "Output format": `Modified-text` is the last field and
        # runs to the end of the block, continuation lines included. Fields are
        # read only above it, so a line below it is corrected text, not a field.
        fields=$(printf '%s\n' "$block" | awk '/^Modified-text:/ { exit } { print }')
        verdict=$(printf '%s' "$fields" | sed -n 's/^Verdict: *//p' | head -1)
        severity=$(printf '%s' "$fields" | sed -n 's/^Severity: *//p' | head -1)
        modified=$(printf '%s\n' "$block" | awk '
            !found && /^Modified-text:/ { found = 1; sub(/^Modified-text: */, "") }
            found { line[++n] = $0 }
            END {
                s = 1
                while (s <= n && line[s] ~ /^[[:space:]]*$/) s++
                while (n >= s && line[n] ~ /^[[:space:]]*$/) n--
                for (i = s; i <= n; i++) print line[i]
            }')
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

        # Marked-item contract: `keep` is invalid for a marked item, and no
        # `Modified-text` may carry a marker — whether or not the input item
        # had one. The validator resolves uncertainty, it never introduces it.
        if { has_marker "${ITEM_TEXT[$i]}" && [[ "$verdict" == "keep" ]]; } \
           || { [[ "$verdict" == "modify" ]] && has_marker "$modified"; }; then
            OUT_TEXT+=("${ITEM_TEXT[$i]}"); OUT_SECTION+=("${ITEM_SECTION[$i]}")
            OUT_WARNINGS+="WARN [+check]: validator response for item $i violated the marked-item contract, kept as-is"$'\n'
            warned=1
            # A preserved marked item is counted as unresolved by its own
            # marker; a preserved unmarked one leaves no trace in the text,
            # so the violation itself is what the gate has to count.
            has_marker "${ITEM_TEXT[$i]}" || UNVALIDATED_ITEMS=$((UNVALIDATED_ITEMS + 1))
            continue
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
    local gate_id="${2:-}"            # rules | architecture | roadmap
    local gate_text="${3:-}"          # the gate's blocking finding, when failing
    local criticals=0 suggestions=0 unresolved=0 context_blockers=0 i

    # SKILL.md "Machine-readable gate result": only marker-free items are
    # established findings. A marker that survived the pass is a validation
    # failure — the item stays in its section but never enters blockers.
    GATE_BLOCKERS=""
    for i in "${!OUT_TEXT[@]}"; do
        if has_marker "${OUT_TEXT[$i]}"; then
            unresolved=$((unresolved + 1))
            continue
        fi
        if [[ "${OUT_SECTION[$i]}" == "critical" ]]; then
            criticals=$((criticals + 1))
            GATE_BLOCKERS+="${OUT_TEXT[$i]}"$'\n'
        else
            suggestions=$((suggestions + 1))
        fi
    done

    # SKILL.md "blockers": a blocking context-gate finding is an established
    # blocker like any other and must appear next to the findings-derived ones,
    # including next to the synthetic review-validation-failed entry.
    if [[ "$context_gate" == "fail" && -n "$gate_text" ]]; then
        GATE_BLOCKERS+="$gate_text"$'
'
        context_blockers=1
    fi

    # A contract violation that preserved an unmarked item leaves no marker in
    # the text, but that item is just as unvalidated as a marked survivor.
    unresolved=$((unresolved + ${UNVALIDATED_ITEMS:-0}))

    local findings_status="pass"
    [[ $suggestions -gt 0 ]] && findings_status="warn"
    [[ $criticals -gt 0 ]] && findings_status="fail"

    # More severe of the two independent inputs.
    GATE_STATUS="$findings_status"
    if [[ "$context_gate" == "fail" ]] \
       || { [[ "$context_gate" == "warn" && "$findings_status" == "pass" ]]; }; then
        GATE_STATUS="$context_gate"
    fi

    GATE_VALIDATION_FAILED=0
    if [[ $unresolved -gt 0 ]]; then
        GATE_VALIDATION_FAILED=1
        GATE_STATUS="fail"
        local cause
        cause="$(printf '%s' "$OUT_WARNINGS" | sed -n 's/^WARN \[+check\]: //p' | head -1)"
        GATE_BLOCKERS+="review-validation-failed: $unresolved finding(s) left unvalidated: $cause"$'\n'
    fi

    [[ "$GATE_STATUS" == "fail" ]] && GATE_BLOCKING="true" || GATE_BLOCKING="false"

    if [[ $GATE_VALIDATION_FAILED -eq 1 ]]; then
        GATE_COMMAND="null"
        GATE_REASON="Validation of $unresolved finding(s) failed, so the review is incomplete. Re-run /aif-review +check."
    else
        case "$GATE_STATUS" in
            fail)
                # SKILL.md "suggested_next.command": when every blocker came
                # from a single context gate, point at that gate's own command.
                if [[ $criticals -eq 0 && $context_blockers -eq 1 ]]; then
                    case "$gate_id" in
                        rules)        GATE_COMMAND="/aif-rules" ;;
                        architecture) GATE_COMMAND="/aif-architecture" ;;
                        roadmap)      GATE_COMMAND="/aif-roadmap" ;;
                        *)            GATE_COMMAND="/aif-fix" ;;
                    esac
                    GATE_REASON="The only blocker is the $gate_id gate."
                else
                    GATE_COMMAND="/aif-fix"
                    GATE_REASON="Blocking findings remain."
                fi
                ;;
            *)    GATE_COMMAND="/aif-commit"; GATE_REASON="Review found no blocking issues." ;;
        esac
    fi
}

# Asserts the full validation-failure gate shape from SKILL.md.
assert_validation_failed_gate() {
    local label="$1"
    assert_eq "$GATE_VALIDATION_FAILED" "1" "$label: validation failure is detected"
    assert_eq "$GATE_STATUS" "fail" "$label: status is fail"
    assert_eq "$GATE_BLOCKING" "true" "$label: blocking is true"
    assert_contains_text "$GATE_BLOCKERS" "review-validation-failed" "$label: blockers carry review-validation-failed"
    assert_eq "$GATE_COMMAND" "null" "$label: suggested_next.command is null"
    assert_contains_text "$GATE_REASON" "/aif-review +check" "$label: reason points at re-running validation"
}

stub() { printf '%s\n' "$1" > "$STUB_FILE"; }

STUB_FILE="$(mktemp)"
trap 'rm -f "$STUB_FILE" "$STUB_FILE".*' EXIT

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
assert_validation_failed_gate "invalid keep"
assert_lacks_text "$GATE_BLOCKERS" "src/db.ts:42" "unconfirmed critical is not an established blocker"
assert_contains_text "$GATE_BLOCKERS" "violated the marked-item contract" "failure blocker carries the cause"

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
assert_validation_failed_gate "invalid modify"
assert_lacks_text "$GATE_BLOCKERS" "src/db.ts:42" "unconfirmed critical is not an established blocker"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 4b. quoted marker inside the text is not a marker ===${NC}"

# SKILL.md ("Confidence markers"): an uncertain finding *ends with* the marker.
# A high-confidence finding may quote the syntax while discussing it; matching
# the marker anywhere in the text would misread such an item as marked and turn
# its valid `keep` into a marked-item contract violation.
QUOTING_CRITICAL='The parser accepts `(confidence: low)` inside the item body. `src/parser.ts:10`. Fix: anchor the marker to the suffix.'
ITEM_TEXT=([1]="$QUOTING_CRITICAL"); ITEM_SECTION=([1]="critical")
stub "### Item 1 (section: critical)
Verdict: keep
Reason: accurate"
apply_validation "$STUB_FILE" 1
project_gate pass

assert_eq "$OUT_WARNINGS" "" "quoting the marker syntax is not a marked item"
assert_eq "${OUT_TEXT[0]}" "$QUOTING_CRITICAL" "the quoting item survives keep unchanged"
assert_contains_text "$GATE_BLOCKERS" "src/parser.ts:10" "an unmarked critical is an established blocker"
assert_eq "$GATE_VALIDATION_FAILED" "0" "no validation failure without a real marker"
assert_eq "$GATE_COMMAND" "/aif-fix" "established blocker still routes to /aif-fix"
assert_contains_text "$OUT_FILTERED" "0 hidden" "a clean pass reports its Filtered line"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 4c. validator may not add a marker to an unmarked item ===${NC}"

# VALIDATOR.md: no `Modified-text` may carry a marker, whether or not the input
# item had one. Scoping the check to already-marked inputs would let this pass
# count as a successful adjustment and only surface later, in the gate, as a
# validation failure with an empty cause.
UNMARKED_INPUT='Retry loop has no upper bound. `src/net.ts:88`. Fix: cap the attempts.'
ITEM_TEXT=([1]="$UNMARKED_INPUT"); ITEM_SECTION=([1]="critical")
stub "### Item 1 (section: critical)
Verdict: modify
Reason: softened
Modified-text: Retry loop may have no upper bound. \`src/net.ts:88\`. (confidence: medium)"
apply_validation "$STUB_FILE" 1
project_gate pass

assert_contains_text "$OUT_WARNINGS" "violated the marked-item contract" "adding a marker is a contract violation"
assert_eq "${OUT_TEXT[0]}" "$UNMARKED_INPUT" "the original unmarked text is preserved"
assert_eq "$OUT_FILTERED" "" "an introduced marker is not a successful adjustment"
assert_validation_failed_gate "marker added by the validator"
assert_contains_text "$GATE_BLOCKERS" "violated the marked-item contract" "the synthetic blocker carries a non-empty cause"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 4d. multi-line item: an inner line ending with the literal is not a marker ===${NC}"

# The marker is a suffix of the whole item, not of any line. A `$`-anchored
# grep matches per line, so it would misread this item as marked.
MULTILINE_QUOTING=$'The parser accepts the literal\n(confidence: low)\ninside the item body. `src/parser.ts:10`. Fix: anchor the suffix parser.'
ITEM_TEXT=([1]="$MULTILINE_QUOTING"); ITEM_SECTION=([1]="critical")
stub "### Item 1 (section: critical)
Verdict: keep
Reason: accurate"
apply_validation "$STUB_FILE" 1
project_gate pass

assert_eq "$OUT_WARNINGS" "" "an inner-line literal does not make a multi-line item marked"
assert_eq "${OUT_TEXT[0]}" "$MULTILINE_QUOTING" "the multi-line item survives keep unchanged"
assert_eq "$GATE_VALIDATION_FAILED" "0" "no validation failure without a real suffix marker"
assert_contains_text "$GATE_BLOCKERS" "src/parser.ts:10" "the unmarked multi-line critical is an established blocker"

MULTILINE_MARKED=$'Connection is never closed on the error path.\n`src/db.ts:42`. Fix: close in `finally`. (confidence: low)  '
ITEM_TEXT=([1]="$MULTILINE_MARKED"); ITEM_SECTION=([1]="critical")
stub "### Item 1 (section: critical)
Verdict: keep
Reason: looks right"
apply_validation "$STUB_FILE" 1
project_gate pass
assert_contains_text "$OUT_WARNINGS" "violated the marked-item contract" \
    "a marker on the last line, trailing whitespace included, still marks a multi-line item"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 4e. multi-line Modified-text: the continuation is part of the text ===${NC}"

# VALIDATOR.md: `Modified-text` runs to the end of the block. A parser that
# keeps only its first physical line loses the path and fix on line two — and,
# worse, misses a marker the validator put there.
UNMARKED_INPUT='Variable name `tmp2` is unclear. `src/db.ts:51`. Fix: rename.'
MULTILINE_MODIFIED=$'Rename `tmp2` to `pendingRows`.\n`src/db.ts:51`. Fix: rename and drop the trailing comment.'
ITEM_TEXT=([1]="$UNMARKED_INPUT"); ITEM_SECTION=([1]="suggestion")
stub "### Item 1 (section: suggestion)
Verdict: modify
Reason: sharpened
Modified-text: Rename \`tmp2\` to \`pendingRows\`.
\`src/db.ts:51\`. Fix: rename and drop the trailing comment.
"
apply_validation "$STUB_FILE" 1
project_gate pass

assert_eq "$OUT_WARNINGS" "" "a plain multi-line Modified-text is a normal modify"
assert_eq "${OUT_TEXT[0]}" "$MULTILINE_MODIFIED" "every line of Modified-text is kept, trailing blank line dropped"
assert_contains_text "$OUT_FILTERED" "1 adjusted" "the multi-line modify is counted as adjusted"
assert_eq "$GATE_COMMAND" "/aif-commit" "a surviving suggestion keeps the gate at warn"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 4f. marker in the continuation of Modified-text is a contract violation ===${NC}"

ITEM_TEXT=([1]="$UNMARKED_INPUT"); ITEM_SECTION=([1]="suggestion")
stub "### Item 1 (section: suggestion)
Verdict: modify
Reason: softened
Modified-text: Rename tmp2.
(confidence: medium)"
apply_validation "$STUB_FILE" 1
project_gate pass

assert_contains_text "$OUT_WARNINGS" "violated the marked-item contract" \
    "a marker on the second line of Modified-text is still a forbidden rewrite"
assert_eq "${OUT_TEXT[0]}" "$UNMARKED_INPUT" "the original unmarked text is preserved"
assert_eq "$OUT_FILTERED" "" "the run does not report a clean Filtered line"
assert_validation_failed_gate "marker in a Modified-text continuation"

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
echo -e "\n${BOLD}=== 6. whole-dispatch failure on a marked review -> validation-failed gate ===${NC}"

ITEM_TEXT=([1]="$MARKED_CRITICAL"); ITEM_SECTION=([1]="critical")
stub "DISPATCH_FAILURE"
apply_validation "$STUB_FILE" 1
project_gate pass

assert_eq "$DISPATCH_FAILED" "1" "dispatch failure is detected"
assert_contains_text "$OUT_WARNINGS" "validator failed" "dispatch failure emits a WARN line"
assert_eq "${OUT_TEXT[0]}" "$MARKED_CRITICAL" "items are kept as-is on dispatch failure"
assert_eq "$OUT_FILTERED" "" "no Filtered line on dispatch failure"
assert_validation_failed_gate "dispatch failure with markers"
assert_lacks_text "$GATE_BLOCKERS" "src/db.ts:42" "unconfirmed critical is not an established blocker"
assert_contains_text "$GATE_BLOCKERS" "validator failed" "failure blocker carries the dispatch cause"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 6a. automatic run without the restricted validator does not dispatch ===${NC}"
#
# The prompt embeds the reviewed diff verbatim, so an unflagged run must not
# reach a full-tool agent that the reviewed content could steer. With
# `review-validator` unavailable the automatic pass becomes a whole-dispatch
# failure instead — the markers stay visible and the gate says the review is
# incomplete.

ITEM_TEXT=([1]="$MARKED_CRITICAL"); ITEM_SECTION=([1]="critical")
stub "DISPATCH_FAILURE: review-validator unavailable"
apply_validation "$STUB_FILE" 1
project_gate pass

assert_contains_text "$OUT_WARNINGS" "review-validator unavailable" "the WARN names the missing restricted agent"
assert_validation_failed_gate "validator agent unavailable"
assert_contains_text "$GATE_BLOCKERS" "review-validator unavailable" "the synthetic blocker carries that cause"
assert_eq "${OUT_TEXT[0]}" "$MARKED_CRITICAL" "nothing is filtered by a pass that never ran"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 6b. whole-dispatch failure on a marker-free +check keeps the draft gate ===${NC}"

ITEM_TEXT=([1]="$CONFIRMED_TEXT" [2]="$PLAIN_SUGGESTION")
ITEM_SECTION=([1]="critical" [2]="suggestion")
stub "DISPATCH_FAILURE"
apply_validation "$STUB_FILE" 2
project_gate pass

assert_eq "$GATE_VALIDATION_FAILED" "0" "no marker means no validation failure"
assert_eq "$GATE_STATUS" "fail" "draft critical still drives fail"
assert_lacks_text "$GATE_BLOCKERS" "review-validation-failed" "optional validation failing adds no synthetic blocker"
assert_contains_text "$GATE_BLOCKERS" "src/db.ts:42" "draft critical remains an established blocker"
assert_eq "$GATE_COMMAND" "/aif-fix" "pre-validation gate suggests /aif-fix"

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
echo -e "\n${BOLD}=== 9. refuted critical leaves only a suggestion -> warn + /aif-commit ===${NC}"

ITEM_TEXT=([1]="$MARKED_CRITICAL" [2]="$PLAIN_SUGGESTION")
ITEM_SECTION=([1]="critical" [2]="suggestion")
stub "### Item 1 (section: critical)
Verdict: drop
Reason: behavior does not follow from the code

### Item 2 (section: suggestion)
Verdict: keep
Reason: fair point, non-blocking"
apply_validation "$STUB_FILE" 2
project_gate pass

assert_eq "${#OUT_TEXT[@]}" "1" "only the suggestion survives"
assert_eq "${OUT_SECTION[0]}" "suggestion" "survivor stays in Suggestions"
assert_eq "$GATE_STATUS" "warn" "a lone suggestion warns rather than fails"
assert_eq "$GATE_BLOCKING" "false" "warn is non-blocking"
assert_eq "$GATE_BLOCKERS" "" "no blockers once the critical is refuted"
assert_eq "$GATE_COMMAND" "/aif-commit" "warn still suggests /aif-commit"
assert_lacks_text "${OUT_TEXT[0]}" "confidence:" "published finding carries no marker"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 10. marked suggestion + validation failure -> fail, not warn ===${NC}"

MARKED_SUGGESTION='Variable name `tmp2` is unclear. `src/db.ts:51`. Fix: rename. (confidence: low)'
ITEM_TEXT=([1]="$MARKED_SUGGESTION"); ITEM_SECTION=([1]="suggestion")
stub "### Item 1 (section: suggestion)
Verdict: keep
Reason: fine as written"
apply_validation "$STUB_FILE" 1
project_gate pass

assert_contains_text "$OUT_WARNINGS" "violated the marked-item contract" "keep on a marked suggestion is a contract violation"
assert_validation_failed_gate "marked suggestion"
assert_lacks_text "$GATE_BLOCKERS" "src/db.ts:51" "the unresolved suggestion is not a blocker"
assert_eq "${OUT_SECTION[0]}" "suggestion" "unresolved suggestion stays in its section for the reader"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 11. established blocker + unresolved marker -> both reported, command null ===${NC}"

UNMARKED_CRITICAL='Password is logged in plaintext. `src/auth.ts:12`. Fix: redact.'
ITEM_TEXT=([1]="$UNMARKED_CRITICAL" [2]="$MARKED_CRITICAL")
ITEM_SECTION=([1]="critical" [2]="critical")
stub "### Item 1 (section: critical)
Verdict: keep
Reason: accurate
### Item 2 (section: critical)
Verdict: keep
Reason: looks right"
apply_validation "$STUB_FILE" 2
project_gate pass

assert_validation_failed_gate "mixed established + unresolved"
assert_contains_text "$GATE_BLOCKERS" "src/auth.ts:12" "established critical stays in blockers"
assert_lacks_text "$GATE_BLOCKERS" "src/db.ts:42" "unresolved critical is excluded from blockers"
assert_eq "$GATE_COMMAND" "null" "validation failure outranks /aif-fix in suggested_next"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 12. malformed response on a marked item -> validation-failed gate ===${NC}"

ITEM_TEXT=([1]="$MARKED_CRITICAL"); ITEM_SECTION=([1]="critical")
stub "### Item 1 (section: critical)
Verdict: maybe
Reason: unsure"
apply_validation "$STUB_FILE" 1
project_gate pass

assert_contains_text "$OUT_WARNINGS" "was malformed" "unknown verdict token is a malformed response"
assert_validation_failed_gate "malformed on marked item"
assert_lacks_text "$GATE_BLOCKERS" "src/db.ts:42" "malformed-kept marked item is not a blocker"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 13. blocking context gate is a blocker and routes to its own command ===${NC}"
#
# SKILL.md ("blockers" / "suggested_next.command"): a blocking context-gate
# finding belongs in blockers, and when it is the only blocker the gate points
# at that gate's command rather than at /aif-fix.

RULES_GATE_FINDING='RULES.md: handlers must not import from db/ directly. src/api/leads.ts:8.'
ARCH_GATE_FINDING='ARCHITECTURE.md: layering violation. src/api/leads.ts:8.'

ITEM_TEXT=([1]="$PLAIN_SUGGESTION"); ITEM_SECTION=([1]="suggestion")
stub "### Item 1 (section: suggestion)
Verdict: keep
Reason: accurate"
apply_validation "$STUB_FILE" 1
project_gate fail rules "$RULES_GATE_FINDING"

assert_eq "$GATE_STATUS" "fail" "a failing context gate outranks a lone suggestion"
assert_eq "$GATE_BLOCKING" "true" "a failing context gate is blocking"
assert_contains_text "$GATE_BLOCKERS" "src/api/leads.ts:8" "the context-gate finding is an established blocker"
assert_eq "$GATE_COMMAND" "/aif-rules" "a sole rules-gate blocker routes to /aif-rules, not /aif-fix"
assert_eq "$GATE_VALIDATION_FAILED" "0" "a clean pass with a failing gate is not a validation failure"

ITEM_TEXT=([1]="$UNMARKED_CRITICAL"); ITEM_SECTION=([1]="critical")
stub "### Item 1 (section: critical)
Verdict: keep
Reason: accurate"
apply_validation "$STUB_FILE" 1
project_gate fail architecture "$ARCH_GATE_FINDING"

assert_contains_text "$GATE_BLOCKERS" "src/auth.ts:12" "the code blocker survives next to the gate blocker"
assert_eq "$GATE_COMMAND" "/aif-fix" "a code blocker alongside the gate returns routing to /aif-fix"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 14. validation failure + blocking context gate ===${NC}"
#
# The two failures are independent: the context blocker is still published, and
# the validation failure still takes precedence in suggested_next.

ITEM_TEXT=([1]="$MARKED_CRITICAL"); ITEM_SECTION=([1]="critical")
stub "### Item 1 (section: critical)
Verdict: keep
Reason: looks right"
apply_validation "$STUB_FILE" 1
project_gate fail roadmap "$RULES_GATE_FINDING"

assert_validation_failed_gate "validation failure with a failing context gate"
assert_contains_text "$GATE_BLOCKERS" "src/api/leads.ts:8" "the context blocker is preserved next to the synthetic one"
assert_lacks_text "$GATE_BLOCKERS" "src/db.ts:42" "the unresolved critical is still excluded"
assert_eq "$GATE_COMMAND" "null" "validation failure outranks the gate's own command too"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== 15. an empty validator response is a whole-dispatch failure ===${NC}"
#
# CHECK-MODE.md assigns an empty response to the whole-dispatch failure path:
# nothing came back, so there is no per-item evidence to attribute and no
# per-item WARN to emit.

ITEM_TEXT=([1]="$MARKED_CRITICAL" [2]="$PLAIN_SUGGESTION")
ITEM_SECTION=([1]="critical" [2]="suggestion")
stub ""
apply_validation "$STUB_FILE" 2
project_gate pass

assert_eq "$DISPATCH_FAILED" "1" "an empty response is a whole-dispatch failure"
assert_contains_text "$OUT_WARNINGS" "validator failed (empty response)" "the WARN names the empty response"
assert_lacks_text "$OUT_WARNINGS" "was malformed" "an empty response is not N malformed per-item responses"
assert_eq "${#OUT_TEXT[@]}" "2" "every item is kept as-is"
assert_eq "$OUT_FILTERED" "" "no Filtered line on a dispatch failure"
assert_validation_failed_gate "empty validator response"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== Contract prose invariants ===${NC}"

assert_contains_text "$(cat "$SKILL")" 'review-validation-failed' \
    "gate contract defines the validation-failure blocker"
assert_contains_text "$(cat "$CHECK_MODE")" 'review-validation-failed' \
    "check-mode routes unresolved markers into the validation-failure gate"
assert_contains_text "$(cat "$VALIDATOR")" "MUST NOT contain" \
    "validator forbids returning a marker in Modified-text"
assert_contains_text "$(cat "$CHECK_MODE")" "Post-condition of a successful pass" \
    "check-mode states the post-condition explicitly"

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== Validator trust boundary ===${NC}"
#
# The dispatch embeds an untrusted diff, so the restriction has to be a real
# allowlist on a real agent file — prose alone is what this section exists to
# rule out.

VALIDATOR_AGENT="$ROOT_DIR/subagents/claude/agents/review-validator.md"
VALIDATOR_AGENT_CODEX="$ROOT_DIR/subagents/codex/agents/review-validator.toml"

if [[ -f "$VALIDATOR_AGENT" ]]; then
    pass "the bundled review-validator agent exists"
    assert_contains_text "$(cat "$VALIDATOR_AGENT")" "tools: Read, Glob, Grep" \
        "review-validator is allowlisted to read-only tools"
else
    fail "the bundled review-validator agent exists (missing: $VALIDATOR_AGENT)"
fi

if [[ -f "$VALIDATOR_AGENT_CODEX" ]]; then
    pass "the codex review-validator agent exists"
    assert_contains_text "$(cat "$VALIDATOR_AGENT_CODEX")" 'sandbox_mode = "read-only"' \
        "codex review-validator keeps its read-only sandbox (it bounds commands, not tools)"
    assert_contains_text "$(cat "$VALIDATOR_AGENT_CODEX")" "only on an explicit" \
        "codex review-validator documents that automatic runs never dispatch it"
else
    fail "the codex review-validator agent exists (missing: $VALIDATOR_AGENT_CODEX)"
fi

# A string in an agent file proves nothing about the tools the agent actually
# gets. Reference model of the effective tool surface, per runtime (CHECK-MODE.md,
# Procedure step 4): a Claude Code `tools:` line is an enforced allowlist; a
# Codex agent has no allowlist — `sandbox_mode` bounds commands — and inherits
# the parent's `mcp_servers` when its file omits them. Prints the surface beyond
# Read/Glob/Grep; empty output means an enforced read-only boundary.
validator_extra_tools() {
    local agent_file="$1" parent_config="$2" tools
    case "$agent_file" in
        *.md)
            tools=$(sed -n 's/^tools: *//p' "$agent_file" | head -1)
            if [[ -z "$tools" ]]; then echo "all tools (no allowlist)"; return 0; fi
            printf '%s\n' "$tools" | tr ',' '\n' | sed 's/^ *//; s/ *$//' | grep -vxE 'Read|Glob|Grep' || true
            ;;
        *.toml)
            echo "no tool allowlist"
            if ! grep -qE '^\[?mcp_servers' "$agent_file" && [[ -f "$parent_config" ]]; then
                sed -n 's/^\[mcp_servers\.\([^].]*\)\]$/inherited MCP server \1/p' "$parent_config"
            fi
            ;;
    esac
}

# mode: auto | check. Prints dispatch | dispatch-weak | fallback-full-tool, or
# the `DISPATCH_FAILURE: <reason>` stub apply_validation consumes.
validator_dispatch() {
    local agent_file="$1" parent_config="$2" mode="$3" extra
    if [[ ! -f "$agent_file" ]]; then
        if [[ "$mode" == "check" ]]; then echo "fallback-full-tool"; else echo "DISPATCH_FAILURE: validator agent unavailable"; fi
        return 0
    fi
    extra=$(validator_extra_tools "$agent_file" "$parent_config")
    if [[ -z "$extra" ]]; then
        echo "dispatch"
    elif [[ "$mode" == "check" ]]; then
        echo "dispatch-weak"
    else
        echo "DISPATCH_FAILURE: validator tool boundary not enforced by this runtime ($(printf '%s' "$extra" | tr '\n' ';'))"
    fi
}

# Mock parent session with an MCP server that can modify state.
MOCK_PARENT_CONFIG="$STUB_FILE.parent.toml"
printf '%s\n' '[mcp_servers.mock-writer]' 'command = "mock-writer"' '' \
    '[mcp_servers.mock-writer.tools.delete_record]' 'approval_mode = "approve"' > "$MOCK_PARENT_CONFIG"
UNLISTED_AGENT="$STUB_FILE.agent.md"
printf '%s\n' '---' 'name: review-validator' '---' > "$UNLISTED_AGENT"

assert_eq "$(validator_dispatch "$VALIDATOR_AGENT" "$MOCK_PARENT_CONFIG" auto)" "dispatch" \
    "claude: the enforced allowlist keeps the inherited mock writer out, automatic run dispatches"
assert_eq "$(validator_dispatch "$UNLISTED_AGENT" "$MOCK_PARENT_CONFIG" auto)" \
    "DISPATCH_FAILURE: validator tool boundary not enforced by this runtime (all tools (no allowlist))" \
    "an agent file without a tools allowlist is not a boundary"
assert_eq "$(validator_dispatch "$VALIDATOR_AGENT_CODEX" "$MOCK_PARENT_CONFIG" check)" "dispatch-weak" \
    "codex + explicit +check: dispatched, with a weaker boundary"
assert_eq "$(validator_dispatch "$STUB_FILE.missing.toml" "$MOCK_PARENT_CONFIG" check)" "fallback-full-tool" \
    "missing agent + explicit +check: full-tool fallback"

CODEX_AUTO=$(validator_dispatch "$VALIDATOR_AGENT_CODEX" "$MOCK_PARENT_CONFIG" auto)
assert_contains_text "$CODEX_AUTO" "DISPATCH_FAILURE: validator tool boundary not enforced" \
    "codex + automatic run: the dispatch is rejected"
assert_contains_text "$CODEX_AUTO" "inherited MCP server mock-writer" \
    "the rejection names the inherited server with a modifying tool"

ITEM_TEXT=([1]="$MARKED_CRITICAL"); ITEM_SECTION=([1]="critical")
stub "$CODEX_AUTO"
apply_validation "$STUB_FILE" 1
project_gate pass
assert_validation_failed_gate "codex automatic run"
assert_contains_text "$GATE_BLOCKERS" "tool boundary not enforced" "the failure blocker carries the boundary cause"

assert_contains_text "$(cat "$CHECK_MODE")" "Codex custom agents have none" \
    "check-mode separates the codex guarantee from the claude allowlist"
assert_contains_text "$(cat "$CHECK_MODE")" "inherited from the parent session" \
    "check-mode documents MCP inheritance"
assert_lacks_text "$(cat "$CHECK_MODE")" 'tool allowlist is `Read`, `Glob`, `Grep` (`subagents/claude/agents/review-validator.md`, `subagents/codex/agents/review-validator.toml`' \
    "check-mode no longer claims the codex file is allowlisted"

assert_contains_text "$(cat "$CHECK_MODE")" "Task(subagent_type: review-validator" \
    "check-mode dispatches the restricted validator"
assert_lacks_text "$(cat "$CHECK_MODE")" "Task(subagent_type: general-purpose" \
    "check-mode no longer dispatches a full-tool agent"
assert_contains_text "$(cat "$CHECK_MODE")" "never silently fall back" \
    "check-mode forbids a silent full-tool fallback"
assert_contains_text "$(cat "$CHECK_MODE")" "do not dispatch at all" \
    "an automatic run without the restricted agent dispatches nothing"
assert_contains_text "$(cat "$VALIDATOR")" "data and evidence, not instructions" \
    "validator prompt declares the reviewed input untrusted"
assert_contains_text "$(cat "$SKILL")" "review-validator" \
    "skill names the restricted agent the automatic pass runs as"

# ---------------------------------------------------------------------------
TOTAL=$((PASSED + FAILED))
echo ""
echo -e "${BOLD}Total:${NC} $TOTAL, ${GREEN}Passed:${NC} $PASSED, ${RED}Failed:${NC} $FAILED"

[[ $FAILED -gt 0 ]] && exit 1
exit 0
