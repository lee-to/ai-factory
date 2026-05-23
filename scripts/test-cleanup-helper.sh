#!/bin/bash
# Test suite: regression tests for cleanup-blocked-skill.py
# Usage: ./scripts/test-cleanup-helper.sh
#
# Exercises the lock-file patching and validation surfaces of
# skills/aif-skill-generator/scripts/cleanup-blocked-skill.py without
# touching the live skills.sh registry. A throw-away fake `npx` script
# is placed first on PATH so subprocess calls succeed without network.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HELPER="$ROOT_DIR/skills/aif-skill-generator/scripts/cleanup-blocked-skill.py"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

PASSED=0
FAILED=0

pass() { PASSED=$((PASSED + 1)); echo -e "  ${GREEN}✓${NC} $1"; }
fail() { FAILED=$((FAILED + 1)); echo -e "  ${RED}✗${NC} $1"; if [[ -n "${2:-}" ]]; then echo -e "      ${YELLOW}$2${NC}"; fi; }

# ─────────────────────────────────────────────
# Resolve a usable Python interpreter
# ─────────────────────────────────────────────
PYTHON="${PYTHON:-}"
if [[ -z "$PYTHON" ]]; then
    PYTHON=$(command -v python3 || command -v python || true)
fi
if [[ -z "$PYTHON" ]]; then
    echo -e "${RED}ERROR:${NC} python interpreter not found on PATH" >&2
    exit 1
fi

if [[ ! -f "$HELPER" ]]; then
    echo -e "${RED}ERROR:${NC} helper script not found at $HELPER" >&2
    exit 1
fi

# ─────────────────────────────────────────────
# Build a fake `npx` that logs argv and returns 0
# ─────────────────────────────────────────────
FAKE_BIN=$(mktemp -d)
cat > "$FAKE_BIN/npx" << 'EOF'
#!/bin/sh
# Fake npx for cleanup-helper tests:
# - logs each argv element on its own line into $NPX_ARGV_LOG
# - logs the current working directory (as its basename) so tests can
#   assert that the helper passes cwd=<root> to subprocess.run
# - returns 0 unconditionally
printf '%s\n' "$@" >> "${NPX_ARGV_LOG:-/dev/null}"
echo "cwd_basename=$(basename "$(pwd)")" >> "${NPX_ARGV_LOG:-/dev/null}"
exit 0
EOF
chmod +x "$FAKE_BIN/npx"

ORIGINAL_PATH="$PATH"
export PATH="$FAKE_BIN:$PATH"

# Detect Windows-flavoured bash. On Windows, Python's shutil.which honours
# PATHEXT and skips our extension-less fake `npx` in favour of any real
# npx.cmd elsewhere on PATH. CI runs on Ubuntu so this is fine there; for
# local Windows runs we still validate lock-state behaviour but skip the
# fake-npx argv-passing assertion (since the fake never executes).
case "$(uname -s 2>/dev/null || echo unknown)" in
    MINGW*|MSYS*|CYGWIN*) IS_WINDOWS=1 ;;
    *)                    IS_WINDOWS=0 ;;
esac

cleanup() {
    rm -rf "$FAKE_BIN"
    if [[ -n "${TEST_TMPDIR:-}" ]]; then
        rm -rf "$TEST_TMPDIR"
    fi
}
trap cleanup EXIT

# ─────────────────────────────────────────────
# Helpers for individual tests
# ─────────────────────────────────────────────
# fresh_tmp sets globals TEST_TMPDIR and NPX_ARGV_LOG in the current
# shell. Avoid command substitution here — that would run in a subshell
# and the exports would not survive.
fresh_tmp() {
    TEST_TMPDIR=$(mktemp -d)
    NPX_ARGV_LOG="$TEST_TMPDIR/npx-argv.log"
    export TEST_TMPDIR NPX_ARGV_LOG
    : > "$NPX_ARGV_LOG"
}

write_lock() {
    # write_lock <tmpdir> <json>
    printf '%s\n' "$2" > "$1/skills-lock.json"
}

echo -e "\n${BOLD}=== cleanup-blocked-skill.py regression tests ===${NC}\n"

# ─────────────────────────────────────────────
# Test 1: removes target, preserves siblings (#117 regression)
# ─────────────────────────────────────────────
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {
    "blocked-one": {"source": "evil/repo"},
    "safe-one": {"source": "good/repo"}
  }
}'
if "$PYTHON" "$HELPER" --skill blocked-one --root "$TEST_TMPDIR" > "$TEST_TMPDIR/out" 2>&1; then
    if grep -q '"safe-one"' "$TEST_TMPDIR/skills-lock.json" \
       && ! grep -q '"blocked-one"' "$TEST_TMPDIR/skills-lock.json"; then
        pass "removes target, preserves siblings"
    else
        fail "removes target, preserves siblings" "lock file content unexpected: $(cat "$TEST_TMPDIR/skills-lock.json")"
    fi
else
    fail "removes target, preserves siblings" "helper exited non-zero: $(cat "$TEST_TMPDIR/out")"
fi
rm -rf "$TEST_TMPDIR"

# ─────────────────────────────────────────────
# Test 2: skill name with spaces (P1.1 regression)
# ─────────────────────────────────────────────
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {
    "Convex Best Practices": {"source": "x/y"},
    "safe-one": {"source": "good/repo"}
  }
}'
if "$PYTHON" "$HELPER" --skill "Convex Best Practices" --root "$TEST_TMPDIR" > "$TEST_TMPDIR/out" 2>&1; then
    LOCK_OK=0
    if grep -q '"safe-one"' "$TEST_TMPDIR/skills-lock.json" \
       && ! grep -q 'Convex Best Practices' "$TEST_TMPDIR/skills-lock.json"; then
        LOCK_OK=1
    fi

    if [[ $LOCK_OK -eq 0 ]]; then
        fail "skill name with spaces" "lock content unexpected: $(cat "$TEST_TMPDIR/skills-lock.json")"
    elif [[ $IS_WINDOWS -eq 1 ]]; then
        # Lock-state proves the P1.1 fix (validation + patch_lock both
        # accepted the spaced name); argv-passing assertion is unreliable
        # on Windows (see PATHEXT note above).
        pass "skill name with spaces (lock; argv check skipped on Windows)"
    else
        # Fake npx logged each argv on its own line — verify the full
        # name arrived as a single argv element (no shell splitting).
        if grep -Fx "Convex Best Practices" "$NPX_ARGV_LOG" > /dev/null; then
            pass "skill name with spaces (lock + argv)"
        else
            fail "skill name with spaces" "fake-npx did not receive full name as one argv. log: $(cat "$NPX_ARGV_LOG")"
        fi
    fi
else
    fail "skill name with spaces" "helper exited non-zero: $(cat "$TEST_TMPDIR/out")"
fi
rm -rf "$TEST_TMPDIR"

# ─────────────────────────────────────────────
# Test 3: bad names rejected (security validation)
# ─────────────────────────────────────────────
fresh_tmp
write_lock "$TEST_TMPDIR" '{"version": 1, "skills": {"foo": {}}}'
ORIGINAL_LOCK=$(cat "$TEST_TMPDIR/skills-lock.json")
BAD_INPUTS=("" "*" "foo/bar" "foo\\bar" "-foo" "..")
# Add a newline-containing name via printf (cannot inline a literal \n)
NL_NAME=$(printf 'foo\nbar')
BAD_INPUTS+=("$NL_NAME")
ALL_REJECTED=1
for bad in "${BAD_INPUTS[@]}"; do
    if "$PYTHON" "$HELPER" --skill "$bad" --root "$TEST_TMPDIR" > /dev/null 2>&1; then
        ALL_REJECTED=0
        fail "bad names rejected" "accepted bad name: ${bad//$'\n'/<NL>}"
        break
    fi
done
if [[ $ALL_REJECTED -eq 1 ]]; then
    # Make sure none of those calls modified the lock file
    if [[ "$(cat "$TEST_TMPDIR/skills-lock.json")" == "$ORIGINAL_LOCK" ]]; then
        pass "bad names rejected (${#BAD_INPUTS[@]} cases)"
    else
        fail "bad names rejected" "lock was modified despite rejection"
    fi
fi
rm -rf "$TEST_TMPDIR"

# ─────────────────────────────────────────────
# Test 4: no-op when entry absent (lists available keys)
# ─────────────────────────────────────────────
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"existing-skill": {"source": "a/b"}}
}'
ORIGINAL_LOCK=$(cat "$TEST_TMPDIR/skills-lock.json")
if "$PYTHON" "$HELPER" --skill never-existed --root "$TEST_TMPDIR" > "$TEST_TMPDIR/out" 2>&1; then
    if grep -q "existing-skill" "$TEST_TMPDIR/out" \
       && [[ "$(cat "$TEST_TMPDIR/skills-lock.json")" == "$ORIGINAL_LOCK" ]]; then
        pass "no-op when entry absent (lists available keys)"
    else
        fail "no-op when entry absent" "expected 'existing-skill' in output and lock unchanged. output: $(cat "$TEST_TMPDIR/out")"
    fi
else
    fail "no-op when entry absent" "helper exited non-zero: $(cat "$TEST_TMPDIR/out")"
fi
rm -rf "$TEST_TMPDIR"

# ─────────────────────────────────────────────
# Test 5: invalid JSON → non-zero exit
# ─────────────────────────────────────────────
fresh_tmp
echo "{not valid json" > "$TEST_TMPDIR/skills-lock.json"
if "$PYTHON" "$HELPER" --skill anything --root "$TEST_TMPDIR" > /dev/null 2>&1; then
    fail "invalid JSON errors out" "helper exited 0 on malformed lock"
else
    pass "invalid JSON errors out"
fi
rm -rf "$TEST_TMPDIR"

# ─────────────────────────────────────────────
# Test 6: missing npx → non-zero exit, lock unchanged (P2.1 regression)
# ─────────────────────────────────────────────
fresh_tmp
write_lock "$TEST_TMPDIR" '{"version": 1, "skills": {"foo": {"source": "a/b"}}}'
ORIGINAL_LOCK=$(cat "$TEST_TMPDIR/skills-lock.json")
# Empty PATH so npx cannot be resolved. The interpreter is invoked
# explicitly via $PYTHON, so python itself remains reachable.
if PATH="" "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" > "$TEST_TMPDIR/out" 2>&1; then
    fail "missing npx fails fast" "helper exited 0 despite npx missing"
else
    # Make sure we didn't silently mutate the lock either
    if [[ "$(cat "$TEST_TMPDIR/skills-lock.json")" == "$ORIGINAL_LOCK" ]]; then
        pass "missing npx fails fast (lock unchanged)"
    else
        fail "missing npx fails fast" "helper failed but mutated the lock anyway"
    fi
fi
rm -rf "$TEST_TMPDIR"

# ─────────────────────────────────────────────
# Test 7: subprocess cwd matches --root (P2, second-review regression)
# ─────────────────────────────────────────────
# Ensures `npx skills remove` runs with cwd=<root> so the upstream CLI
# inspects the same project's skills-lock.json that this helper patches.
# Without cwd propagation, --root could patch one project while npx
# acts on a different one.
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"some-skill": {"source": "x/y"}}
}'
if "$PYTHON" "$HELPER" --skill some-skill --root "$TEST_TMPDIR" > "$TEST_TMPDIR/out" 2>&1; then
    if [[ $IS_WINDOWS -eq 1 ]]; then
        # Fake npx doesn't execute on Windows (PATHEXT — see top of file).
        # The cwd-propagation contract is still covered by code inspection
        # and Linux CI; document the platform gap.
        pass "subprocess cwd matches --root (skipped on Windows)"
    else
        expected_basename=$(basename "$TEST_TMPDIR")
        if grep -q "cwd_basename=${expected_basename}" "$NPX_ARGV_LOG"; then
            pass "subprocess cwd matches --root"
        else
            fail "subprocess cwd matches --root" "subprocess cwd != --root. log: $(cat "$NPX_ARGV_LOG")"
        fi
    fi
else
    fail "subprocess cwd matches --root" "helper exited non-zero: $(cat "$TEST_TMPDIR/out")"
fi
rm -rf "$TEST_TMPDIR"

# Restore PATH for any post-suite work
export PATH="$ORIGINAL_PATH"

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
echo ""
TOTAL=$((PASSED + FAILED))
if [[ $FAILED -gt 0 ]]; then
    echo -e "${RED}${BOLD}FAILED: ${FAILED}/${TOTAL}${NC}"
    exit 1
fi
echo -e "${GREEN}${BOLD}PASSED: ${PASSED}/${TOTAL}${NC}"
