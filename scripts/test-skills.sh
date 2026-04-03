#!/bin/bash
# Test suite: validates all skills with validate.sh
# Usage: ./scripts/test-skills.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VALIDATOR="$ROOT_DIR/skills/aif-skill-generator/scripts/validate.sh"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

PASSED=0
FAILED=0
TOTAL=0

pass() {
    PASSED=$((PASSED + 1))
    TOTAL=$((TOTAL + 1))
    echo -e "  ${GREEN}✓${NC} $1"
}

fail() {
    FAILED=$((FAILED + 1))
    TOTAL=$((TOTAL + 1))
    echo -e "  ${RED}✗${NC} $1"
}

# ─────────────────────────────────────────────
# Part 1: All real skills must pass validation
# ─────────────────────────────────────────────
echo -e "\n${BOLD}=== Validate all skills ===${NC}\n"

SKILL_WARNINGS=0
for skill_dir in "$ROOT_DIR"/skills/*/; do
    skill_name=$(basename "$skill_dir")
    if [[ "$skill_name" != "aif" && "$skill_name" != aif-* ]]; then
        continue
    fi
    set +e
    OUTPUT=$(bash "$VALIDATOR" "$skill_dir" 2>&1)
    EXIT_CODE=$?
    set -e
    WARNS=$(echo "$OUTPUT" | grep -c 'WARNING' || true)
    if [[ $EXIT_CODE -ne 0 ]]; then
        fail "$skill_name"
        echo "$OUTPUT" | grep -E 'ERROR|WARNING' | sed 's/^/      /'
        echo ""
    elif [[ $WARNS -gt 0 ]]; then
        pass "$skill_name ${YELLOW}($WARNS warnings)${NC}"
        echo "$OUTPUT" | grep 'WARNING' | sed "s/^/      /"
        SKILL_WARNINGS=$((SKILL_WARNINGS + WARNS))
    else
        pass "$skill_name"
    fi
done

# ─────────────────────────────────────────────
# Part 2: Negative tests (must FAIL validation)
# ─────────────────────────────────────────────
echo -e "\n${BOLD}=== Negative tests (expect failure) ===${NC}\n"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Test: dotted name must fail
mkdir -p "$TMPDIR/dotted-name"
cat > "$TMPDIR/dotted-name/SKILL.md" << 'EOF'
---
name: my-org.dotted-name
description: Dotted names are no longer allowed. Use when testing validator rejects dots.
---

# Test
EOF
if bash "$VALIDATOR" "$TMPDIR/dotted-name" > /dev/null 2>&1; then
    fail "dotted name should be rejected"
else
    pass "dotted name rejected"
fi

# Test: name ≠ directory must fail
mkdir -p "$TMPDIR/wrong-dir"
cat > "$TMPDIR/wrong-dir/SKILL.md" << 'EOF'
---
name: mismatched-name
description: Name does not match directory. Use when testing validator catches mismatch.
---

# Test
EOF
if bash "$VALIDATOR" "$TMPDIR/wrong-dir" > /dev/null 2>&1; then
    fail "name/directory mismatch should be rejected"
else
    pass "name/directory mismatch rejected"
fi

# Test: missing name must fail
mkdir -p "$TMPDIR/no-name"
cat > "$TMPDIR/no-name/SKILL.md" << 'EOF'
---
description: No name field present. Use when testing validator requires name.
---

# Test
EOF
if bash "$VALIDATOR" "$TMPDIR/no-name" > /dev/null 2>&1; then
    fail "missing name should be rejected"
else
    pass "missing name rejected"
fi

# Test: consecutive hyphens must fail
mkdir -p "$TMPDIR/bad--hyphens"
cat > "$TMPDIR/bad--hyphens/SKILL.md" << 'EOF'
---
name: bad--hyphens
description: Consecutive hyphens not allowed. Use when testing validator catches double hyphens.
---

# Test
EOF
if bash "$VALIDATOR" "$TMPDIR/bad--hyphens" > /dev/null 2>&1; then
    fail "consecutive hyphens should be rejected"
else
    pass "consecutive hyphens rejected"
fi

# Test: uppercase in name must fail
mkdir -p "$TMPDIR/BadName"
cat > "$TMPDIR/BadName/SKILL.md" << 'EOF'
---
name: BadName
description: Uppercase not allowed in name. Use when testing validator rejects uppercase.
---

# Test
EOF
if bash "$VALIDATOR" "$TMPDIR/BadName" > /dev/null 2>&1; then
    fail "uppercase name should be rejected"
else
    pass "uppercase name rejected"
fi

# Test: oversized frontmatter must fail
mkdir -p "$TMPDIR/big-meta"
cat > "$TMPDIR/big-meta/SKILL.md" << 'EOF'
---
name: big-meta
description: >
  This is an extremely verbose description that goes on and on and on with many many words
  to simulate what happens when someone writes way too much content in the frontmatter section
  of their skill file which should be kept concise and focused on the essential metadata only
  but instead they decided to write a novel about what the skill does and how it works and
  all the various use cases and scenarios and edge cases and special considerations and
  caveats and warnings and notes and tips and tricks and best practices and anti-patterns
  and everything else they could think of including the kitchen sink and more words here
  to push this well over the one hundred token limit that we have established as the maximum
  acceptable size for frontmatter metadata in a skill definition file period end of story
  and yet still more words because we need to be absolutely sure this exceeds the limit
  by a comfortable margin so the test is reliable and not flaky or borderline at all
---

# Test
EOF
if bash "$VALIDATOR" "$TMPDIR/big-meta" > /dev/null 2>&1; then
    fail "oversized frontmatter should be rejected"
else
    pass "oversized frontmatter rejected"
fi

# Test: unquoted argument-hint brackets must fail
mkdir -p "$TMPDIR/bad-hint"
cat > "$TMPDIR/bad-hint/SKILL.md" << 'EOF'
---
name: bad-hint
description: Unquoted brackets in argument-hint. Use when testing validator catches bad hints.
argument-hint: [topic] description here
---

# Test
EOF
if bash "$VALIDATOR" "$TMPDIR/bad-hint" > /dev/null 2>&1; then
    fail "unquoted argument-hint brackets should be rejected"
else
    pass "unquoted argument-hint brackets rejected"
fi

# ─────────────────────────────────────────────
# Part 3: No dotted references in codebase
# ─────────────────────────────────────────────
echo -e "\n${BOLD}=== Codebase integrity checks ===${NC}\n"

# No dotted name: in frontmatter
DOTTED_NAMES=$(grep -r 'name: aif\.' "$ROOT_DIR/skills/" --include='*.md' 2>/dev/null | wc -l | tr -d ' ' || true)
if [[ "$DOTTED_NAMES" -eq 0 ]]; then
    pass "no dotted name: fields in skills/"
else
    fail "found $DOTTED_NAMES dotted name: fields in skills/"
fi

# No dotted /aif. invocations in markdown (slash-command context only, not URLs)
DOTTED_REFS=$(grep -rE "(^|[[:space:]\`\"(>])/aif\\.[a-z]" "$ROOT_DIR/skills/" "$ROOT_DIR/docs/" "$ROOT_DIR/README.md" "$ROOT_DIR/AGENTS.md" --include='*.md' 2>/dev/null | grep -v 'ai-factory\.json' | wc -l | tr -d ' ' || true)
if [[ "$DOTTED_REFS" -eq 0 ]]; then
    pass "no dotted /aif.xxx invocations in docs"
else
    fail "found $DOTTED_REFS dotted invocations in docs"
fi

# No hardcoded agent-specific values (must use {{template_vars}})
# skills_dir patterns
HARDCODED_SKILLS_DIR=$(grep -rE '\.(claude|cursor|codex|github|gemini|junie|qwen|windsurf|warp)/skills' "$ROOT_DIR/skills/" "$ROOT_DIR/subagents/" --include='*.md' 2>/dev/null | grep -v '{{' | wc -l | tr -d ' ' || true)
if [[ "$HARDCODED_SKILLS_DIR" -eq 0 ]]; then
    pass "no hardcoded skills_dir in skills/ and subagents/"
else
    fail "found $HARDCODED_SKILLS_DIR hardcoded skills_dir values (use {{skills_dir}} or {{home_skills_dir}})"
    grep -rEn '\.(claude|cursor|codex|github|gemini|junie|qwen|windsurf|warp)/skills' "$ROOT_DIR/skills/" "$ROOT_DIR/subagents/" --include='*.md' 2>/dev/null | grep -v '{{' | sed 's/^/      /'
fi

# settings_file patterns
HARDCODED_SETTINGS=$(grep -rE '(\.mcp\.json|settings\.local\.json|\.cursor/mcp\.json|\.vscode/mcp\.json|\.qwen/settings\.json)' "$ROOT_DIR/skills/" "$ROOT_DIR/subagents/" --include='*.md' 2>/dev/null | grep -v '{{' | wc -l | tr -d ' ' || true)
if [[ "$HARDCODED_SETTINGS" -eq 0 ]]; then
    pass "no hardcoded settings_file in skills/ and subagents/"
else
    fail "found $HARDCODED_SETTINGS hardcoded settings_file values (use {{settings_file}})"
    grep -rEn '(\.mcp\.json|settings\.local\.json|\.cursor/mcp\.json|\.vscode/mcp\.json|\.qwen/settings\.json)' "$ROOT_DIR/skills/" "$ROOT_DIR/subagents/" --include='*.md' 2>/dev/null | grep -v '{{' | sed 's/^/      /'
fi

# skills_cli_agent_flag patterns
HARDCODED_AGENT_FLAG=$(grep -rE '--agent (claude-code|cursor|codex|github-copilot|gemini-cli|junie|windsurf)' "$ROOT_DIR/skills/" "$ROOT_DIR/subagents/" --include='*.md' 2>/dev/null | grep -v '{{' | wc -l | tr -d ' ' || true)
if [[ "$HARDCODED_AGENT_FLAG" -eq 0 ]]; then
    pass "no hardcoded skills_cli_agent_flag in skills/ and subagents/"
else
    fail "found $HARDCODED_AGENT_FLAG hardcoded --agent flags (use {{skills_cli_agent_flag}})"
    grep -rEn '--agent (claude-code|cursor|codex|github-copilot|gemini-cli|junie|windsurf)' "$ROOT_DIR/skills/" "$ROOT_DIR/subagents/" --include='*.md' 2>/dev/null | grep -v '{{' | sed 's/^/      /'
fi

# ─────────────────────────────────────────────
# Part 4: Subagent integrity checks
# ─────────────────────────────────────────────
echo -e "\n${BOLD}=== Subagent integrity checks ===${NC}\n"

set +e
SUBAGENT_LINT_OUTPUT=$(ROOT_DIR="$ROOT_DIR" node --input-type=module <<'EOF' 2>&1
import fs from 'fs';
import path from 'path';

const root = process.env.ROOT_DIR;
const subagentsDir = path.join(root, 'subagents');
const docsPath = path.join(root, 'docs', 'subagents.md');
const refsPath = path.join(root, '.references', 'CLAUDE-SUBAGENTS.md');

const files = fs.readdirSync(subagentsDir).filter(file => file.endsWith('.md')).sort();
const docsContent = fs.readFileSync(docsPath, 'utf8');
const refsContent = fs.readFileSync(refsPath, 'utf8');
const errors = [];

function getFrontmatter(content, file) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    errors.push(`${file}: missing frontmatter`);
    return '';
  }
  return match[1];
}

function getField(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

for (const file of files) {
  const content = fs.readFileSync(path.join(subagentsDir, file), 'utf8');
  const frontmatter = getFrontmatter(content, file);
  const expectedName = path.basename(file, '.md');
  const name = getField(frontmatter, 'name');
  const tools = getField(frontmatter, 'tools') ?? '';
  const background = getField(frontmatter, 'background') === 'true';
  const hasWriterTools = /\bWrite\b|\bEdit\b/.test(tools);

  if (name !== expectedName) {
    errors.push(`${file}: frontmatter name "${name}" does not match filename "${expectedName}"`);
  }

  if (background && hasWriterTools) {
    errors.push(`${file}: background agents must be read-only`);
  }

  if (docsContent.includes(`\`${expectedName}\``) === false) {
    errors.push(`${file}: missing from docs/subagents.md inventory`);
  }

  if (refsContent.includes(`\`${expectedName}\``) === false) {
    errors.push(`${file}: missing from .references/CLAUDE-SUBAGENTS.md inventory`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}
EOF
)
SUBAGENT_LINT_EXIT=$?
set -e

if [[ $SUBAGENT_LINT_EXIT -eq 0 ]]; then
    pass "subagent inventory and frontmatter integrity"
else
    fail "subagent inventory and frontmatter integrity"
    echo "$SUBAGENT_LINT_OUTPUT" | sed 's/^/      /'
fi

# ─────────────────────────────────────────────
# Part 5: Internal security self-scan
# ─────────────────────────────────────────────
echo -e "\n${BOLD}=== Internal security self-scan ===${NC}\n"

set +e
SELF_SCAN_OUTPUT=$(bash "$ROOT_DIR/scripts/security-self-scan.sh" 2>&1)
SELF_SCAN_EXIT=$?
set -e

if [[ $SELF_SCAN_EXIT -eq 0 ]]; then
    pass "self-scan passed (no critical threats after allowlist)"
    echo "$SELF_SCAN_OUTPUT" | grep -E 'Critical:|Warnings:|Ignored by allowlist' | sed 's/^/      /' || true
elif [[ $SELF_SCAN_EXIT -eq 3 ]]; then
    pass "self-scan skipped ${YELLOW}(Python 3 not found)${NC}"
    echo "      Install Python 3 to enable internal self-scan."
else
    fail "self-scan failed (critical threats or scanner error)"
    echo "$SELF_SCAN_OUTPUT" | sed 's/^/      /'
fi

# ─────────────────────────────────────────────
# Part 6: Update command smoke tests
# ─────────────────────────────────────────────
echo -e "\n${BOLD}=== Update command smoke tests ===${NC}\n"

set +e
UPDATE_SMOKE_OUTPUT=$(bash "$ROOT_DIR/scripts/test-update.sh" 2>&1)
UPDATE_SMOKE_EXIT=$?
set -e

if [[ $UPDATE_SMOKE_EXIT -eq 0 ]]; then
    pass "update smoke tests"
else
    fail "update smoke tests"
    echo "$UPDATE_SMOKE_OUTPUT" | sed 's/^/      /'
fi

# ─────────────────────────────────────────────
# Part 7: Init command smoke tests
# ─────────────────────────────────────────────
echo -e "\n${BOLD}=== Init command smoke tests ===${NC}\n"

set +e
INIT_SMOKE_OUTPUT=$(bash "$ROOT_DIR/scripts/test-init.sh" 2>&1)
INIT_SMOKE_EXIT=$?
set -e

if [[ $INIT_SMOKE_EXIT -eq 0 ]]; then
    pass "init smoke tests"
else
    fail "init smoke tests"
    echo "$INIT_SMOKE_OUTPUT" | sed 's/^/      /'
fi

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
echo -e "\n${BOLD}=== Results ===${NC}"
echo -e "  Total:    $TOTAL"
echo -e "  Passed:   ${GREEN}$PASSED${NC}"
echo -e "  Failed:   ${RED}$FAILED${NC}"
echo -e "  Warnings: ${YELLOW}$SKILL_WARNINGS${NC}"

if [[ $FAILED -gt 0 ]]; then
    echo -e "\n${RED}TESTS FAILED${NC}\n"
    exit 1
else
    echo -e "\n${GREEN}ALL TESTS PASSED${NC}\n"
    exit 0
fi
