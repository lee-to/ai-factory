#!/bin/bash
# Regression tests for the /aif config template updater helper.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HELPER="$ROOT_DIR/skills/aif/references/update-config.mjs"
TEMPLATE="$ROOT_DIR/skills/aif/references/config-template.yaml"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

assert_contains() {
  local file="$1"
  local pattern="$2"
  local hint="$3"
  if ! grep -qE "$pattern" "$file"; then
    echo "Assertion failed: $hint"
    echo "Pattern: $pattern"
    echo "--- file: $file ---"
    cat "$file"
    echo "-------------------"
    exit 1
  fi
}

assert_not_contains() {
  local file="$1"
  local pattern="$2"
  local hint="$3"
  if grep -qE "$pattern" "$file"; then
    echo "Assertion failed: $hint"
    echo "Pattern: $pattern"
    echo "--- file: $file ---"
    cat "$file"
    echo "-------------------"
    exit 1
  fi
}

run_helper() {
  local payload="$1"
  local target="$2"
  node "$HELPER" --template "$TEMPLATE" --target "$target" --payload "$payload"
}

CREATE_PAYLOAD="$TMPDIR/create-payload.json"
cat > "$CREATE_PAYLOAD" <<'EOF'
{
  "mode": "create",
  "set": {
    "language.ui": "ru",
    "language.artifacts": "ru",
    "language.technical_terms": "keep",
    "paths.description": ".ai-factory/DESCRIPTION.md",
    "paths.architecture": ".ai-factory/ARCHITECTURE.md",
    "paths.docs": "handbook/",
    "paths.roadmap": ".ai-factory/ROADMAP.md",
    "paths.research": ".ai-factory/RESEARCH.md",
    "paths.rules_file": ".ai-factory/RULES.md",
    "paths.plan": ".ai-factory/PLAN.md",
    "paths.plans": ".ai-factory/plans/",
    "paths.fix_plan": ".ai-factory/FIX_PLAN.md",
    "paths.security": ".ai-factory/SECURITY.md",
    "paths.references": ".ai-factory/references/",
    "paths.patches": ".ai-factory/patches/",
    "paths.evolutions": ".ai-factory/evolutions/",
    "paths.evolution": ".ai-factory/evolution/",
    "paths.specs": ".ai-factory/specs/",
    "paths.rules": ".ai-factory/rules/",
    "paths.qa": ".ai-factory/qa/",
    "workflow.auto_create_dirs": true,
    "workflow.plan_id_format": "slug",
    "workflow.analyze_updates_architecture": true,
    "workflow.architecture_updates_roadmap": true,
    "workflow.verify_mode": "normal",
    "git.enabled": true,
    "git.base_branch": "2.x",
    "git.create_branches": true,
    "git.branch_prefix": "fix/",
    "git.skip_push_after_commit": false,
    "rules.base": ".ai-factory/rules/base.md"
  },
  "fillMissing": {}
}
EOF

CREATE_TARGET="$TMPDIR/create/.ai-factory/config.yaml"
mkdir -p "$(dirname "$CREATE_TARGET")"
run_helper "$CREATE_PAYLOAD" "$CREATE_TARGET"

assert_contains "$CREATE_TARGET" '^# AI Factory Configuration' "fresh create must preserve template header comments"
assert_contains "$CREATE_TARGET" '^# Language Settings' "fresh create must preserve section comments"
assert_contains "$CREATE_TARGET" '^  ui: ru$' "fresh create must set language.ui"
assert_contains "$CREATE_TARGET" '^  docs: handbook/$' "fresh create must set overridden docs path"
assert_contains "$CREATE_TARGET" '^  # QA artifacts root directory$' "fresh create must preserve QA path comments"
assert_contains "$CREATE_TARGET" '^  qa: \.ai-factory/qa/$' "fresh create must set paths.qa"
assert_contains "$CREATE_TARGET" '^  base_branch: 2.x$' "fresh create must set git.base_branch"
assert_contains "$CREATE_TARGET" '^  branch_prefix: fix/$' "fresh create must set git.branch_prefix"
assert_contains "$CREATE_TARGET" '^  # frontend: \.ai-factory/rules/frontend\.md$' "fresh create must preserve commented rules examples"

MERGE_TARGET="$TMPDIR/merge/config.yaml"
mkdir -p "$(dirname "$MERGE_TARGET")"
cat > "$MERGE_TARGET" <<'EOF'
# custom header

paths:
  docs: handbook/
  qa: quality/

git:
  enabled: true
  # keep this comment
  base_branch: main # team-default
  create_branches: true
  skip_push_after_commit: false

rules:
  base: .ai-factory/rules/base.md
  api: .ai-factory/rules/api.md

custom:
  owner: team
EOF

MERGE_PAYLOAD="$TMPDIR/merge-payload.json"
cat > "$MERGE_PAYLOAD" <<'EOF'
{
  "mode": "merge",
  "set": {
    "git.base_branch": "trunk"
  },
  "fillMissing": {
    "paths.docs": "docs/",
    "paths.qa": ".ai-factory/qa/",
    "git.branch_prefix": "feature/",
    "rules.base": ".ai-factory/rules/base.md"
  }
}
EOF

run_helper "$MERGE_PAYLOAD" "$MERGE_TARGET"

assert_contains "$MERGE_TARGET" '^# custom header$' "merge must preserve top-level custom comments"
assert_contains "$MERGE_TARGET" '^  docs: handbook/$' "merge must preserve custom values not explicitly set"
assert_contains "$MERGE_TARGET" '^  qa: quality/$' "merge must preserve custom paths.qa when not explicitly set"
assert_contains "$MERGE_TARGET" '^  # keep this comment$' "merge must preserve comments above managed keys"
assert_contains "$MERGE_TARGET" '^  base_branch: trunk # team-default$' "merge must preserve inline comments while updating the value"
assert_contains "$MERGE_TARGET" '^  api: \.ai-factory/rules/api\.md$' "merge must preserve existing rules.<area> entries"
assert_contains "$MERGE_TARGET" '^custom:$' "merge must preserve unknown sections"
assert_contains "$MERGE_TARGET" '^  # Branch name prefix for new features$' "merge must backfill missing key comments from template"
assert_contains "$MERGE_TARGET" '^  branch_prefix: feature/$' "merge must backfill missing managed keys"
assert_not_contains "$MERGE_TARGET" '^  qa: \.ai-factory/qa/$' "merge fillMissing must not overwrite existing custom paths.qa"

BACKFILL_TARGET="$TMPDIR/backfill/config.yaml"
mkdir -p "$(dirname "$BACKFILL_TARGET")"
cat > "$BACKFILL_TARGET" <<'EOF'
paths:
  docs: handbook/
EOF

BACKFILL_PAYLOAD="$TMPDIR/backfill-payload.json"
cat > "$BACKFILL_PAYLOAD" <<'EOF'
{
  "mode": "merge",
  "set": {},
  "fillMissing": {
    "paths.qa": ".ai-factory/qa/"
  }
}
EOF

run_helper "$BACKFILL_PAYLOAD" "$BACKFILL_TARGET"

assert_contains "$BACKFILL_TARGET" '^  # QA artifacts root directory$' "merge must backfill paths.qa comments from template"
assert_contains "$BACKFILL_TARGET" '^  qa: \.ai-factory/qa/$' "merge must backfill missing paths.qa"

NOOP_TARGET="$TMPDIR/noop/config.yaml"
mkdir -p "$(dirname "$NOOP_TARGET")"
cp "$CREATE_TARGET" "$NOOP_TARGET"
NOOP_BEFORE_HASH=$(node -e "const fs=require('fs');const crypto=require('crypto');const data=fs.readFileSync(process.argv[1]);process.stdout.write(crypto.createHash('sha256').update(data).digest('hex'))" "$NOOP_TARGET")
NOOP_BEFORE_MTIME=$(node -e "const fs=require('fs');process.stdout.write(String(fs.statSync(process.argv[1]).mtimeMs))" "$NOOP_TARGET")
run_helper "$CREATE_PAYLOAD" "$NOOP_TARGET"
NOOP_AFTER_HASH=$(node -e "const fs=require('fs');const crypto=require('crypto');const data=fs.readFileSync(process.argv[1]);process.stdout.write(crypto.createHash('sha256').update(data).digest('hex'))" "$NOOP_TARGET")
NOOP_AFTER_MTIME=$(node -e "const fs=require('fs');process.stdout.write(String(fs.statSync(process.argv[1]).mtimeMs))" "$NOOP_TARGET")

if [[ "$NOOP_BEFORE_HASH" != "$NOOP_AFTER_HASH" ]]; then
  echo "Assertion failed: noop merge must not rewrite file content"
  exit 1
fi

if [[ "$NOOP_BEFORE_MTIME" != "$NOOP_AFTER_MTIME" ]]; then
  echo "Assertion failed: noop merge must not touch mtime"
  exit 1
fi

CRLF_TARGET="$TMPDIR/crlf/config.yaml"
mkdir -p "$(dirname "$CRLF_TARGET")"
node -e "const fs=require('fs');const source=fs.readFileSync(process.argv[1],'utf8');fs.writeFileSync(process.argv[2],source.replace(/\\n/g,'\\r\\n'));" "$MERGE_TARGET" "$CRLF_TARGET"
run_helper "$MERGE_PAYLOAD" "$CRLF_TARGET"
node -e "const fs=require('fs');const text=fs.readFileSync(process.argv[1],'utf8');if(!text.includes('\r\n'))process.exit(1);if(/(^|[^\r])\n/.test(text))process.exit(1);" "$CRLF_TARGET"

UNSAFE_TARGET="$TMPDIR/unsafe/config.yaml"
mkdir -p "$(dirname "$UNSAFE_TARGET")"
cat > "$UNSAFE_TARGET" <<'EOF'
git: { enabled: true }
EOF

UNSAFE_BEFORE=$(cat "$UNSAFE_TARGET")
set +e
node "$HELPER" --template "$TEMPLATE" --target "$UNSAFE_TARGET" --payload "$MERGE_PAYLOAD" > "$TMPDIR/unsafe.log" 2>&1
UNSAFE_EXIT=$?
set -e

if [[ "$UNSAFE_EXIT" -ne 1 ]]; then
  echo "Assertion failed: unsafe structure must fail with exit code 1"
  cat "$TMPDIR/unsafe.log"
  exit 1
fi

UNSAFE_AFTER=$(cat "$UNSAFE_TARGET")
if [[ "$UNSAFE_BEFORE" != "$UNSAFE_AFTER" ]]; then
  echo "Assertion failed: unsafe structure failure must not modify the target file"
  exit 1
fi

assert_contains "$TMPDIR/unsafe.log" 'Unsupported target structure' "unsafe structure failure must explain the rejection"
assert_not_contains "$MERGE_TARGET" '^  docs: docs/$' "merge fillMissing must not overwrite existing custom docs path"

echo "aif config helper regression tests passed"
