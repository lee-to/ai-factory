#!/bin/bash
# Scan AI Factory built-in skills with strict rules + internal allowlist.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SCANNER="$ROOT_DIR/skills/aif-skill-generator/scripts/security-scan.py"
ALLOWLIST="$ROOT_DIR/scripts/security-scan-allowlist-ai-factory.json"

try_python3() {
    # Some environments (notably Windows Git Bash) may have a non-functional
    # python3 shim earlier in PATH. Verify we can actually execute Python 3.
    local -a cmd=("$@")
    "${cmd[@]}" -c 'import sys; raise SystemExit(0 if sys.version_info[0] == 3 else 1)' >/dev/null 2>&1
}

PYTHON_CMD=()
if try_python3 python3; then
    PYTHON_CMD=(python3)
elif try_python3 python; then
    PYTHON_CMD=(python)
elif try_python3 py -3; then
    PYTHON_CMD=(py -3)
elif try_python3 py; then
    PYTHON_CMD=(py)
else
    echo "ERROR: Python 3 not found (python3/python/py)."
    exit 3
fi

set +e
# Self-scan focuses on skill markdown/reference content; scanner source code is out of scope here.
"${PYTHON_CMD[@]}" "$SCANNER" --md-only --allowlist "$ALLOWLIST" "$ROOT_DIR/skills"
EXIT_CODE=$?
set -e

# Warnings are expected in internal docs/examples. Only fail on critical/usage errors.
if [[ $EXIT_CODE -eq 2 ]]; then
    exit 0
fi

exit $EXIT_CODE
