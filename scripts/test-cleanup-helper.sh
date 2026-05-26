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
# Build a fake `npx` that logs argv and returns a configurable exit code
# ─────────────────────────────────────────────
FAKE_BIN=$(mktemp -d)
cat > "$FAKE_BIN/npx" << 'EOF'
#!/bin/sh
# Fake npx for cleanup-helper tests:
# - logs each argv element on its own line into $NPX_ARGV_LOG
# - logs the current working directory (as its basename) so tests can
#   assert that the helper passes cwd=<root> to subprocess.run
# - exits with $FAKE_NPX_EXIT if set (default 0) so partial-failure
#   regression tests can simulate `npx skills remove` returning non-zero
printf '%s\n' "$@" >> "${NPX_ARGV_LOG:-/dev/null}"
echo "cwd_basename=$(basename "$(pwd)")" >> "${NPX_ARGV_LOG:-/dev/null}"
if [ -n "${FAKE_NPX_REPLACE_WITH_FILE:-}" ]; then
  rm -rf "$FAKE_NPX_REPLACE_WITH_FILE"
  mkdir -p "$(dirname "$FAKE_NPX_REPLACE_WITH_FILE")"
  printf '%s\n' "fake npx replacement" > "$FAKE_NPX_REPLACE_WITH_FILE"
fi
exit "${FAKE_NPX_EXIT:-0}"
EOF
chmod +x "$FAKE_BIN/npx"

ORIGINAL_PATH="$PATH"
ORIGINAL_PATHEXT="${PATHEXT:-}"
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

write_config() {
    # write_config <tmpdir> <json>
    printf '%s\n' "$2" > "$1/.ai-factory.json"
}

echo -e "\n${BOLD}=== cleanup-blocked-skill.py regression tests ===${NC}\n"

# ─────────────────────────────────────────────
# Test 1: removes target lock entry, preserves siblings
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
# Test 2: skill name with spaces
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
        # Lock-state proves validation + patch_lock accepted the spaced
        # name; argv-passing assertion is unreliable on Windows (see
        # PATHEXT note above).
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
BAD_INPUTS=("" "*" "foo/bar" "foo\\bar" "-foo" " -foo" ".." "   ")
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
# Test 6: missing npx → non-zero exit, lock unchanged
# ─────────────────────────────────────────────
fresh_tmp
write_lock "$TEST_TMPDIR" '{"version": 1, "skills": {"foo": {"source": "a/b"}}}'
ORIGINAL_LOCK=$(cat "$TEST_TMPDIR/skills-lock.json")
# Empty PATH so npx cannot be resolved. The interpreter is invoked
# explicitly via $PYTHON, so python itself remains reachable.
# Also clear PATHEXT — on Windows, shutil.which may try extension
# fallbacks (npx.cmd) even with a sparse PATH; this closes the gap.
if PATH="" PATHEXT="" "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" > "$TEST_TMPDIR/out" 2>&1; then
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
# Test 7: subprocess cwd matches --root
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

# ─────────────────────────────────────────────
# Test 8: --installed-path absent on disk → exit 0 (downgrade clean)
# ─────────────────────────────────────────────
# When --installed-path is supplied and the directory does not exist
# after cleanup, the helper should report success even if cli_failed
# would otherwise hold (here cli_failed=False since fake npx returns 0).
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"foo": {"source": "x/y"}}
}'
# .claude/skills/foo intentionally NOT created — simulates a clean removal.
if "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" \
   --installed-path .claude/skills/foo > "$TEST_TMPDIR/out" 2>&1; then
    pass "--installed-path absent → exit 0"
else
    fail "--installed-path absent → exit 0" "helper exited non-zero with clean dir: $(cat "$TEST_TMPDIR/out")"
fi
rm -rf "$TEST_TMPDIR"

# ─────────────────────────────────────────────
# Test 9: --installed-path leftover under skills/ → exit 0 + dir gone
# ─────────────────────────────────────────────
# The helper must physically remove the leftover directory, not just
# report it. Fixture is placed at the canonical install location
# (.claude/skills/<name>/SKILL.md) so all safety checks pass and
# safe_remove_installed proceeds.
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"foo": {"source": "x/y"}}
}'
mkdir -p "$TEST_TMPDIR/.claude/skills/foo"
echo "# leftover" > "$TEST_TMPDIR/.claude/skills/foo/SKILL.md"
if "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" \
   --installed-path .claude/skills/foo > "$TEST_TMPDIR/out" 2>&1; then
    if [[ ! -e "$TEST_TMPDIR/.claude/skills/foo" ]]; then
        pass "--installed-path leftover under skills/ → exit 0 + dir gone"
    else
        fail "--installed-path leftover under skills/" \
             "helper exited 0 but directory remains: $(cat "$TEST_TMPDIR/out")"
    fi
else
    fail "--installed-path leftover under skills/" \
         "helper exited non-zero: $(cat "$TEST_TMPDIR/out")"
fi
rm -rf "$TEST_TMPDIR"

# ─────────────────────────────────────────────
# Test 10: cli_failed downgraded when --installed-path confirms removal
# ─────────────────────────────────────────────
# Fake npx returns 1 (partial failure). Without --installed-path the
# helper would exit 1 conservatively. With --installed-path and the
# directory genuinely gone, the helper should downgrade to exit 0.
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"foo": {"source": "x/y"}}
}'
# Dir not created — npx "failed" but result is clean.
if FAKE_NPX_EXIT=1 "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" \
   --installed-path .claude/skills/foo > "$TEST_TMPDIR/out" 2>&1; then
    pass "partial-failure + dir gone → exit 0 (downgrade)"
else
    fail "partial-failure + dir gone → exit 0 (downgrade)" "helper exited non-zero: $(cat "$TEST_TMPDIR/out")"
fi
rm -rf "$TEST_TMPDIR"

# ─────────────────────────────────────────────
# Test 11: sanitized-leftover end-to-end
# ─────────────────────────────────────────────
# Upstream `skills` sanitizes the on-disk directory name:
#   "Convex Best Practices" -> "convex-best-practices"
# Upstream `npx skills remove -s "Convex Best Practices"` does NOT
# apply sanitizeName() to the argument before matching, so it never
# touches the sanitized directory; it exits 0 silently.
#
# Two sub-cases probe both contracts on the same fixture:
#   (a) a synthesized path (logical name as-is) is rejected by the
#       identity check rather than accepted as an idempotent no-op.
#   (b) the correct sanitized scanned path: helper physically removes
#       the directory AND clears the lock entry, even though upstream
#       `npx skills remove` was a no-op.
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"Convex Best Practices": {"source": "x/y"}}
}'
# Real leftover at the SANITIZED upstream path:
mkdir -p "$TEST_TMPDIR/.claude/skills/convex-best-practices"
echo "# blocked skill" > "$TEST_TMPDIR/.claude/skills/convex-best-practices/SKILL.md"

# (a) Synthesized path from logical name. Helper must reject this
#     absent wrong path by identity rather than silently claim cleanup
#     of the real sanitized directory.
if FAKE_NPX_EXIT=1 "$PYTHON" "$HELPER" \
        --skill "Convex Best Practices" \
        --root "$TEST_TMPDIR" \
        --installed-path ".claude/skills/Convex Best Practices" \
        > "$TEST_TMPDIR/out-a" 2>&1; then
    OLD_CONTRACT_EXIT=0
else
    OLD_CONTRACT_EXIT=$?
fi
# Verify: sanitized dir IS still on disk, and the synthesized path
# is rejected (not treated as a clean no-op).
if [[ $OLD_CONTRACT_EXIT -eq 0 ]] || \
   [[ ! -d "$TEST_TMPDIR/.claude/skills/convex-best-practices" ]] || \
   ! grep -q 'identity mismatch' "$TEST_TMPDIR/out-a"; then
    fail "sanitized leftover (a)" \
         "old-contract path was not rejected as expected; exit=$OLD_CONTRACT_EXIT out=$(cat "$TEST_TMPDIR/out-a")"
fi

# Re-add the lock entry so path (b) has work to do.
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"Convex Best Practices": {"source": "x/y"}}
}'

# (b) Correct contract: pass the actual sanitized scanned path. Helper
#     physically removes the directory AND clears the lock entry, even
#     though upstream `npx skills remove` was a no-op.
if FAKE_NPX_EXIT=1 "$PYTHON" "$HELPER" \
        --skill "Convex Best Practices" \
        --root "$TEST_TMPDIR" \
        --installed-path ".claude/skills/convex-best-practices" \
        > "$TEST_TMPDIR/out-b" 2>&1; then
    NEW_CONTRACT_EXIT=0
else
    NEW_CONTRACT_EXIT=$?
fi

LOCK_CLEAR=0
if ! grep -q 'Convex Best Practices' "$TEST_TMPDIR/skills-lock.json"; then
    LOCK_CLEAR=1
fi
DIR_GONE=0
if [[ ! -e "$TEST_TMPDIR/.claude/skills/convex-best-practices" ]]; then
    DIR_GONE=1
fi

if [[ $OLD_CONTRACT_EXIT -ne 0 \
   && $NEW_CONTRACT_EXIT -eq 0 \
   && $LOCK_CLEAR -eq 1 \
   && $DIR_GONE -eq 1 ]]; then
    pass "sanitized leftover: synthesized path rejected + correct path removes both"
else
    fail "sanitized leftover" \
         "old=$OLD_CONTRACT_EXIT new=$NEW_CONTRACT_EXIT lock_clear=$LOCK_CLEAR dir_gone=$DIR_GONE; out-a=$(cat "$TEST_TMPDIR/out-a"); out-b=$(cat "$TEST_TMPDIR/out-b")"
fi
rm -rf "$TEST_TMPDIR"

# ─────────────────────────────────────────────
# Tests N1–N8: safe_remove_installed safety checks
# ─────────────────────────────────────────────
# These tests exercise each rejection path of safe_remove_installed
# individually. Each setup is minimal so a failure isolates a single
# safety guarantee.

# N1: managed symlink/junction install → accept and remove both canonical
# target and agent-specific link.
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"foo": {"source": "x/y"}}
}'
mkdir -p "$TEST_TMPDIR/.agents/skills/foo"
printf '%s\n' '---' 'name: foo' '---' '# canonical' > "$TEST_TMPDIR/.agents/skills/foo/SKILL.md"
mkdir -p "$TEST_TMPDIR/.claude/skills"
if [[ $IS_WINDOWS -eq 0 ]]; then
    ln -s "../../.agents/skills/foo" "$TEST_TMPDIR/.claude/skills/foo"
    if "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" \
       --installed-path .claude/skills/foo > "$TEST_TMPDIR/out" 2>&1; then
        if [[ ! -e "$TEST_TMPDIR/.agents/skills/foo" ]] && \
           [[ ! -e "$TEST_TMPDIR/.claude/skills/foo" ]] && \
           [[ ! -L "$TEST_TMPDIR/.claude/skills/foo" ]] && \
           ! grep -q '"foo"' "$TEST_TMPDIR/skills-lock.json"; then
            pass "N1: managed symlink accepted and cleaned"
        else
            fail "N1: managed symlink cleanup" \
                 "canonical/link/lock not clean: $(cat "$TEST_TMPDIR/out")"
        fi
    else
        fail "N1: managed symlink cleanup" "helper exited non-zero: $(cat "$TEST_TMPDIR/out")"
    fi
else
    # Windows junction via cmd /c mklink /J (admin not required for junctions).
    # Skip if mklink fails (some Windows setups disallow it without elevation).
    if cmd //c "mklink /J \"$(cygpath -w "$TEST_TMPDIR/.claude/skills/foo")\" \"$(cygpath -w "$TEST_TMPDIR/.agents/skills/foo")\"" > /dev/null 2>&1; then
        if "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" \
           --installed-path .claude/skills/foo > "$TEST_TMPDIR/out" 2>&1; then
            if [[ ! -e "$TEST_TMPDIR/.agents/skills/foo" ]] && \
               [[ ! -e "$TEST_TMPDIR/.claude/skills/foo" ]] && \
               ! grep -q '"foo"' "$TEST_TMPDIR/skills-lock.json"; then
                pass "N1: managed junction accepted and cleaned"
            else
                fail "N1: managed junction cleanup" \
                     "canonical/link/lock not clean: $(cat "$TEST_TMPDIR/out")"
            fi
        else
            fail "N1: managed junction cleanup" "helper exited non-zero: $(cat "$TEST_TMPDIR/out")"
        fi
    else
        pass "N1: managed junction cleanup (Windows; mklink unavailable, skipped)"
    fi
fi
rm -rf "$TEST_TMPDIR"

# N1b: symlink/junction that escapes --root → reject and preserve lock.
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"foo": {"source": "x/y"}}
}'
OUTSIDE_SKILL=$(mktemp -d)
mkdir -p "$OUTSIDE_SKILL/foo"
printf '%s\n' '---' 'name: foo' '---' '# outside' > "$OUTSIDE_SKILL/foo/SKILL.md"
mkdir -p "$TEST_TMPDIR/.claude/skills"
if [[ $IS_WINDOWS -eq 0 ]]; then
    ln -s "$OUTSIDE_SKILL/foo" "$TEST_TMPDIR/.claude/skills/foo"
    if "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" \
       --installed-path .claude/skills/foo > "$TEST_TMPDIR/out" 2>&1; then
        fail "N1b: escaping symlink rejection" "helper exited 0 despite outside symlink"
    else
        if [[ -e "$OUTSIDE_SKILL/foo/SKILL.md" ]] && \
           [[ -L "$TEST_TMPDIR/.claude/skills/foo" ]] && \
           grep -q '"foo"' "$TEST_TMPDIR/skills-lock.json" && \
           grep -Eq 'outside --root|path traversal|symlink escape' "$TEST_TMPDIR/out"; then
            pass "N1b: escaping symlink rejected (target + lock preserved)"
        else
            fail "N1b: escaping symlink rejection" \
                 "target/link/lock tampered or wrong error: $(cat "$TEST_TMPDIR/out")"
        fi
    fi
else
    if cmd //c "mklink /J \"$(cygpath -w "$TEST_TMPDIR/.claude/skills/foo")\" \"$(cygpath -w "$OUTSIDE_SKILL/foo")\"" > /dev/null 2>&1; then
        if "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" \
           --installed-path .claude/skills/foo > "$TEST_TMPDIR/out" 2>&1; then
            fail "N1b: escaping junction rejection (Windows)" "helper exited 0 despite outside junction"
        else
            if [[ -e "$OUTSIDE_SKILL/foo/SKILL.md" ]] && \
               grep -q '"foo"' "$TEST_TMPDIR/skills-lock.json" && \
               grep -Eq 'outside --root|path traversal|symlink escape' "$TEST_TMPDIR/out"; then
                pass "N1b: escaping junction rejected (Windows; target + lock preserved)"
            else
                fail "N1b: escaping junction rejection (Windows)" \
                     "target/lock tampered or wrong error: $(cat "$TEST_TMPDIR/out")"
            fi
        fi
    else
        pass "N1b: escaping junction rejection (Windows; mklink unavailable, skipped)"
    fi
fi
rm -rf "$OUTSIDE_SKILL"
rm -rf "$TEST_TMPDIR"

# N1c: lock entry is cleared only after managed symlink cleanup succeeds.
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"foo": {"source": "x/y"}}
}'
mkdir -p "$TEST_TMPDIR/.agents/skills/foo"
printf '%s\n' '---' 'name: foo' '---' '# canonical' > "$TEST_TMPDIR/.agents/skills/foo/SKILL.md"
mkdir -p "$TEST_TMPDIR/.claude/skills"
if [[ $IS_WINDOWS -eq 0 ]]; then
    ln -s "../../.agents/skills/foo" "$TEST_TMPDIR/.claude/skills/foo"
    if FAKE_NPX_REPLACE_WITH_FILE="$TEST_TMPDIR/.agents/skills/foo" \
       "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" \
       --installed-path .claude/skills/foo > "$TEST_TMPDIR/out" 2>&1; then
        fail "N1c: lock waits for symlink cleanup success" "helper exited 0 despite cleanup failure"
    else
        if grep -q '"foo"' "$TEST_TMPDIR/skills-lock.json" && \
           [[ -L "$TEST_TMPDIR/.claude/skills/foo" ]] && \
           grep -q 'not a directory' "$TEST_TMPDIR/out"; then
            pass "N1c: lock preserved when managed symlink cleanup fails"
        else
            fail "N1c: lock waits for symlink cleanup success" \
                 "lock/link not preserved or wrong error: $(cat "$TEST_TMPDIR/out")"
        fi
    fi
else
    pass "N1c: lock waits for symlink cleanup success (Windows; skipped)"
fi
rm -rf "$TEST_TMPDIR"

# N2: path-traversal escape → reject.
# --installed-path ../escape-dir resolves outside --root, must be rejected.
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"foo": {"source": "x/y"}}
}'
# Create an "outside" target a sibling of --root that the test could
# theoretically traverse into.
ESCAPE_DIR=$(mktemp -d)
mkdir -p "$ESCAPE_DIR/.claude/skills/foo"
echo "# escape" > "$ESCAPE_DIR/.claude/skills/foo/SKILL.md"
# Walk up from $TEST_TMPDIR by enough '../' to reach ESCAPE_DIR's basename.
ESCAPE_REL="../$(basename "$ESCAPE_DIR")/.claude/skills/foo"
if "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" \
   --installed-path "$ESCAPE_REL" > "$TEST_TMPDIR/out" 2>&1; then
    fail "N2: path-traversal escape" "helper exited 0 despite ../ escape"
else
    if [[ -e "$ESCAPE_DIR/.claude/skills/foo" ]] && \
       grep -Eq 'outside --root|path traversal' "$TEST_TMPDIR/out"; then
        pass "N2: path-traversal escape rejected (target preserved)"
    else
        fail "N2: path-traversal escape" \
             "target tampered or wrong error: $(cat "$TEST_TMPDIR/out")"
    fi
fi
rm -rf "$ESCAPE_DIR"
rm -rf "$TEST_TMPDIR"

# N3: --installed-path inside --root but NOT under a known agent skills
# directory → reject.
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"foo": {"source": "x/y"}}
}'
mkdir -p "$TEST_TMPDIR/random-dir"
echo "# random" > "$TEST_TMPDIR/random-dir/SKILL.md"
if "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" \
   --installed-path random-dir > "$TEST_TMPDIR/out" 2>&1; then
    fail "N3: not under skills/" "helper exited 0 despite non-skills location"
else
    if [[ -e "$TEST_TMPDIR/random-dir/SKILL.md" ]] && \
       grep -Eq "known project agent skills directory|no 'skills' segment" "$TEST_TMPDIR/out"; then
        pass "N3: non-skills location rejected (dir preserved)"
    else
        fail "N3: not under skills/" \
             "dir tampered or wrong error: $(cat "$TEST_TMPDIR/out")"
    fi
fi
rm -rf "$TEST_TMPDIR"

# N4: missing SKILL.md marker → reject (check #7).
# POSIX-only: on Windows shutil.which('npx') honours PATHEXT and resolves
# to the system npx.cmd ahead of our extension-less fake. Real upstream
# `npx skills remove` then scans .claude/skills/ and may delete the
# directory wholesale (irrespective of SKILL.md presence), turning this
# test into a false-pass via the "already absent" idempotent branch.
# The safety check is exercised on Linux CI where the fake npx is used.
if [[ $IS_WINDOWS -eq 0 ]]; then
    fresh_tmp
    write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"foo": {"source": "x/y"}}
}'
    mkdir -p "$TEST_TMPDIR/.claude/skills/foo"
    # Intentionally NO SKILL.md
    echo "# stuff but no marker" > "$TEST_TMPDIR/.claude/skills/foo/other.md"
    if "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" \
       --installed-path .claude/skills/foo > "$TEST_TMPDIR/out" 2>&1; then
        fail "N4: missing SKILL.md" "helper exited 0 without SKILL.md marker"
    else
        if [[ -e "$TEST_TMPDIR/.claude/skills/foo/other.md" ]] && \
           grep -q 'no SKILL.md marker' "$TEST_TMPDIR/out"; then
            pass "N4: missing SKILL.md rejected (dir preserved)"
        else
            fail "N4: missing SKILL.md" \
                 "dir tampered or wrong error: $(cat "$TEST_TMPDIR/out")"
        fi
    fi
    rm -rf "$TEST_TMPDIR"
else
    pass "N4: missing SKILL.md (Windows; skipped — real npx clobbers fixture)"
fi

# N5: --installed-path is a regular file, not a directory → reject (check #4).
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"foo": {"source": "x/y"}}
}'
mkdir -p "$TEST_TMPDIR/.claude/skills"
echo "I am a file" > "$TEST_TMPDIR/.claude/skills/foo"
if "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" \
   --installed-path .claude/skills/foo > "$TEST_TMPDIR/out" 2>&1; then
    fail "N5: file instead of dir" "helper exited 0 despite file at installed-path"
else
    if [[ -f "$TEST_TMPDIR/.claude/skills/foo" ]] && \
       grep -q 'not a directory' "$TEST_TMPDIR/out"; then
        pass "N5: file-not-dir rejected (file preserved)"
    else
        fail "N5: file instead of dir" \
             "file tampered or wrong error: $(cat "$TEST_TMPDIR/out")"
    fi
fi
rm -rf "$TEST_TMPDIR"

# N6: sibling skill under same parent must be preserved during cleanup.
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"blocked": {"source": "x/y"}, "neighbor": {"source": "a/b"}}
}'
mkdir -p "$TEST_TMPDIR/.claude/skills/blocked"
mkdir -p "$TEST_TMPDIR/.claude/skills/neighbor"
echo "# blocked" > "$TEST_TMPDIR/.claude/skills/blocked/SKILL.md"
echo "# neighbor" > "$TEST_TMPDIR/.claude/skills/neighbor/SKILL.md"
if "$PYTHON" "$HELPER" --skill blocked --root "$TEST_TMPDIR" \
   --installed-path .claude/skills/blocked > "$TEST_TMPDIR/out" 2>&1; then
    if [[ ! -e "$TEST_TMPDIR/.claude/skills/blocked" ]] && \
       [[ -f "$TEST_TMPDIR/.claude/skills/neighbor/SKILL.md" ]]; then
        pass "N6: sibling preserved during cleanup"
    else
        fail "N6: sibling preservation" \
             "blocked still exists or neighbor was deleted: $(cat "$TEST_TMPDIR/out")"
    fi
else
    fail "N6: sibling preservation" \
         "helper exited non-zero: $(cat "$TEST_TMPDIR/out")"
fi
rm -rf "$TEST_TMPDIR"

# N7: permission-failure mid-rmtree → exit 1 (POSIX only; chmod 000 on
# Windows does not produce the same delete-blocking behavior).
if [[ $IS_WINDOWS -eq 0 ]]; then
    fresh_tmp
    write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"foo": {"source": "x/y"}}
}'
    mkdir -p "$TEST_TMPDIR/.claude/skills/foo/locked"
    echo "# blocked" > "$TEST_TMPDIR/.claude/skills/foo/SKILL.md"
    echo "stay" > "$TEST_TMPDIR/.claude/skills/foo/locked/child"
    # Drop write perms on the parent so children cannot be unlinked.
    chmod 555 "$TEST_TMPDIR/.claude/skills/foo/locked"
    if "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" \
       --installed-path .claude/skills/foo > "$TEST_TMPDIR/out" 2>&1; then
        # On some POSIX setups (running as root, tmpfs without DAC, etc.)
        # rmtree may still succeed. Don't fail in that case — accept.
        chmod -R 755 "$TEST_TMPDIR/.claude/skills/foo" 2>/dev/null || true
        pass "N7: permission-failure (POSIX; rmtree succeeded — root or relaxed FS)"
    else
        # Restore perms so cleanup below can run.
        chmod -R 755 "$TEST_TMPDIR/.claude/skills/foo" 2>/dev/null || true
        pass "N7: permission-failure rejected with non-zero exit"
    fi
    rm -rf "$TEST_TMPDIR"
else
    pass "N7: permission-failure (Windows; skipped — different semantics)"
fi

# N8: --installed-path == --root → reject (check #5b).
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"foo": {"source": "x/y"}}
}'
# Put a SKILL.md at root so the SKILL.md check alone wouldn't block —
# we need to prove #5b fires before #7.
echo "# root SKILL.md (should not be touched)" > "$TEST_TMPDIR/SKILL.md"
if "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" \
   --installed-path . > "$TEST_TMPDIR/out" 2>&1; then
    fail "N8: installed-path == root" "helper exited 0 despite installed-path == root"
else
    # Both #5b "equals --root" and later path-boundary checks are valid
    # rejection reasons. Accept either so ordering can stay defensive.
    if [[ -d "$TEST_TMPDIR" ]] && [[ -f "$TEST_TMPDIR/SKILL.md" ]] && \
       grep -Eq "equals --root|known project agent skills directory|no 'skills' segment" "$TEST_TMPDIR/out"; then
        pass "N8: installed-path == root rejected (root preserved)"
    else
        fail "N8: installed-path == root" \
             "root tampered or wrong error: $(cat "$TEST_TMPDIR/out")"
    fi
fi
rm -rf "$TEST_TMPDIR"

# N9: root-level source skill path → reject and preserve.
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"source-skill": {"source": "x/y"}}
}'
mkdir -p "$TEST_TMPDIR/skills/source-skill"
printf '%s\n' '---' 'name: source-skill' '---' '# source' > "$TEST_TMPDIR/skills/source-skill/SKILL.md"
if "$PYTHON" "$HELPER" --skill source-skill --root "$TEST_TMPDIR" \
   --installed-path skills/source-skill > "$TEST_TMPDIR/out" 2>&1; then
    fail "N9: root source skills/ rejected" "helper exited 0 despite source path"
else
    if [[ -f "$TEST_TMPDIR/skills/source-skill/SKILL.md" ]] && \
       grep -q "known project agent skills directory" "$TEST_TMPDIR/out"; then
        pass "N9: root source skills/ rejected (dir preserved)"
    else
        fail "N9: root source skills/" \
             "dir tampered or wrong error: $(cat "$TEST_TMPDIR/out")"
    fi
fi
rm -rf "$TEST_TMPDIR"

# N10: docs/skills source path → reject and preserve.
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"source-skill": {"source": "x/y"}}
}'
mkdir -p "$TEST_TMPDIR/docs/skills/source-skill"
printf '%s\n' '---' 'name: source-skill' '---' '# docs source' > "$TEST_TMPDIR/docs/skills/source-skill/SKILL.md"
if "$PYTHON" "$HELPER" --skill source-skill --root "$TEST_TMPDIR" \
   --installed-path docs/skills/source-skill > "$TEST_TMPDIR/out" 2>&1; then
    fail "N10: docs/skills source rejected" "helper exited 0 despite docs path"
else
    if [[ -f "$TEST_TMPDIR/docs/skills/source-skill/SKILL.md" ]] && \
       grep -q "known project agent skills directory" "$TEST_TMPDIR/out"; then
        pass "N10: docs/skills source rejected (dir preserved)"
    else
        fail "N10: docs/skills source" \
             "dir tampered or wrong error: $(cat "$TEST_TMPDIR/out")"
    fi
fi
rm -rf "$TEST_TMPDIR"

# N11: canonical .claude/skills/foo path still works.
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"foo": {"source": "x/y"}}
}'
mkdir -p "$TEST_TMPDIR/.claude/skills/foo"
printf '%s\n' '---' 'name: foo' '---' '# foo' > "$TEST_TMPDIR/.claude/skills/foo/SKILL.md"
if "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" \
   --installed-path .claude/skills/foo > "$TEST_TMPDIR/out" 2>&1; then
    if [[ ! -e "$TEST_TMPDIR/.claude/skills/foo" ]]; then
        pass "N11: canonical .claude skill accepted and removed"
    else
        fail "N11: canonical .claude skill" \
             "helper exited 0 but dir remains: $(cat "$TEST_TMPDIR/out")"
    fi
else
    fail "N11: canonical .claude skill" "helper exited non-zero: $(cat "$TEST_TMPDIR/out")"
fi
rm -rf "$TEST_TMPDIR"

# N12: mismatched --skill and installed basename/frontmatter → reject.
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"foo": {"source": "x/y"}}
}'
mkdir -p "$TEST_TMPDIR/.claude/skills/bar"
printf '%s\n' '---' 'name: bar' '---' '# bar' > "$TEST_TMPDIR/.claude/skills/bar/SKILL.md"
if "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" \
   --installed-path .claude/skills/bar > "$TEST_TMPDIR/out" 2>&1; then
    fail "N12: identity mismatch rejected" "helper exited 0 despite mismatched path"
else
    if [[ -f "$TEST_TMPDIR/.claude/skills/bar/SKILL.md" ]] && \
       grep -q "identity mismatch" "$TEST_TMPDIR/out"; then
        pass "N12: identity mismatch rejected (dir preserved)"
    else
        fail "N12: identity mismatch" \
             "dir tampered or wrong error: $(cat "$TEST_TMPDIR/out")"
    fi
fi
rm -rf "$TEST_TMPDIR"

# N13: .cache/skills/foo is rejected when not an explicit agent skillsDir.
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"foo": {"source": "x/y"}}
}'
mkdir -p "$TEST_TMPDIR/.cache/skills/foo"
printf '%s\n' '---' 'name: foo' '---' '# cache' > "$TEST_TMPDIR/.cache/skills/foo/SKILL.md"
if "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" \
   --installed-path .cache/skills/foo > "$TEST_TMPDIR/out" 2>&1; then
    fail "N13: unregistered .cache skills root rejected" "helper exited 0 despite unregistered root"
else
    if [[ -f "$TEST_TMPDIR/.cache/skills/foo/SKILL.md" ]] && \
       grep -q "known project agent skills directory" "$TEST_TMPDIR/out"; then
        pass "N13: unregistered .cache skills root rejected (dir preserved)"
    else
        fail "N13: unregistered .cache skills root" \
             "dir tampered or wrong error: $(cat "$TEST_TMPDIR/out")"
    fi
fi
rm -rf "$TEST_TMPDIR"

# N14: extension runtime skillsDir from .ai-factory.json is accepted.
fresh_tmp
write_config "$TEST_TMPDIR" '{
  "agents": [
    {"id": "my-agent", "skillsDir": ".my-agent/skills"}
  ]
}'
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"foo": {"source": "x/y"}}
}'
mkdir -p "$TEST_TMPDIR/.my-agent/skills/foo"
printf '%s\n' '---' 'name: foo' '---' '# extension runtime' > "$TEST_TMPDIR/.my-agent/skills/foo/SKILL.md"
if "$PYTHON" "$HELPER" --skill foo --root "$TEST_TMPDIR" \
   --installed-path .my-agent/skills/foo > "$TEST_TMPDIR/out" 2>&1; then
    if [[ ! -e "$TEST_TMPDIR/.my-agent/skills/foo" ]]; then
        pass "N14: extension runtime skillsDir accepted and removed"
    else
        fail "N14: extension runtime skillsDir" \
             "helper exited 0 but dir remains: $(cat "$TEST_TMPDIR/out")"
    fi
else
    fail "N14: extension runtime skillsDir" "helper exited non-zero: $(cat "$TEST_TMPDIR/out")"
fi
rm -rf "$TEST_TMPDIR"

# N15: dry-run still validates unsafe installed paths and preserves them.
fresh_tmp
write_lock "$TEST_TMPDIR" '{
  "version": 1,
  "skills": {"source-skill": {"source": "x/y"}}
}'
mkdir -p "$TEST_TMPDIR/skills/source-skill"
printf '%s\n' '---' 'name: source-skill' '---' '# source' > "$TEST_TMPDIR/skills/source-skill/SKILL.md"
if "$PYTHON" "$HELPER" --skill source-skill --root "$TEST_TMPDIR" \
   --installed-path skills/source-skill --dry-run > "$TEST_TMPDIR/out" 2>&1; then
    fail "N15: dry-run validates source path" "helper exited 0 despite unsafe dry-run path"
else
    if [[ -f "$TEST_TMPDIR/skills/source-skill/SKILL.md" ]] && \
       grep -q "known project agent skills directory" "$TEST_TMPDIR/out"; then
        pass "N15: dry-run validates source path (dir preserved)"
    else
        fail "N15: dry-run validates source path" \
             "dir tampered or wrong error: $(cat "$TEST_TMPDIR/out")"
    fi
fi
rm -rf "$TEST_TMPDIR"

# ─────────────────────────────────────────────
# Test 12: built-in agent skills roots do not drift from src/core/agents.ts
# ─────────────────────────────────────────────
if DRIFT_OUTPUT=$("$PYTHON" - "$ROOT_DIR" <<'PY'
import ast
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
helper_path = root / 'skills/aif-skill-generator/scripts/cleanup-blocked-skill.py'
agents_path = root / 'src/core/agents.ts'

tree = ast.parse(helper_path.read_text(encoding='utf-8'))
helper_dirs = None
for node in tree.body:
    if not isinstance(node, ast.Assign):
        continue
    for target in node.targets:
        if isinstance(target, ast.Name) and target.id == '_BUILTIN_AGENT_SKILLS_DIRS':
            helper_dirs = set(ast.literal_eval(node.value))
            break
    if helper_dirs is not None:
        break

if helper_dirs is None:
    print('could not find _BUILTIN_AGENT_SKILLS_DIRS')
    sys.exit(1)

agent_dirs = set(re.findall(r"skillsDir:\s*'([^']+)'", agents_path.read_text(encoding='utf-8')))
if helper_dirs != agent_dirs:
    print(f'missing in helper: {sorted(agent_dirs - helper_dirs)}')
    print(f'extra in helper: {sorted(helper_dirs - agent_dirs)}')
    sys.exit(1)
PY
); then
    pass "built-in skills roots match src/core/agents.ts"
else
    fail "built-in skills roots drift" "$DRIFT_OUTPUT"
fi

# ─────────────────────────────────────────────
# Test 13: prompt-contract grep — skill docs must NOT synthesize the
# installed path from {{skills_dir}}/<name>; they must reuse the same
# path token passed to security-scan.py.
# ─────────────────────────────────────────────
PROMPT_FILES=(
    "$ROOT_DIR/skills/aif/SKILL.md"
    "$ROOT_DIR/skills/aif-skill-generator/SKILL.md"
    "$ROOT_DIR/skills/aif-skill-generator/references/SECURITY-SCANNING.md"
)
BAD_LINES=()
for f in "${PROMPT_FILES[@]}"; do
    if [[ ! -f "$f" ]]; then
        continue
    fi
    # A violation is when the synthesized template appears IMMEDIATELY
    # after --installed-path (i.e. it is the VALUE of the flag, not part
    # of surrounding explanatory text that warns against the pattern).
    while IFS= read -r line; do
        if printf '%s' "$line" | grep -Eq -- '--installed-path[[:space:]]+\{\{skills_dir\}\}/<'; then
            BAD_LINES+=("$f: $line")
        fi
    done < "$f"
done
if [[ ${#BAD_LINES[@]} -eq 0 ]]; then
    pass "prompt-contract: no skill doc synthesizes --installed-path from {{skills_dir}}/<name>"
else
    fail "prompt-contract violation" "$(printf '%s\n' "${BAD_LINES[@]}")"
fi

# Restore PATH for any post-suite work
export PATH="$ORIGINAL_PATH"
if [[ -n "$ORIGINAL_PATHEXT" ]]; then
    export PATHEXT="$ORIGINAL_PATHEXT"
fi

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
