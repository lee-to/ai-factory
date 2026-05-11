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

# /aif localization contract regression checks
AIF_SKILL="$ROOT_DIR/skills/aif/SKILL.md"
AIF_ARCH_SKILL="$ROOT_DIR/skills/aif-architecture/SKILL.md"
MODE1_SECTION="$(awk '
    /^### Mode 1: Analyze Existing Project$/ { capture=1 }
    capture { print }
    capture && /^---$/ { exit }
' "$AIF_SKILL")"
MODE2_SECTION="$(awk '
    /^### Mode 2: New Project with Description$/ { capture=1 }
    capture { print }
    capture && /^---$/ { exit }
' "$AIF_SKILL")"
MODE3_SECTION="$(awk '
    /^### Mode 3: Interactive New Project \(Empty Directory\)$/ { capture=1 }
    capture { print }
    capture && /^---$/ { exit }
' "$AIF_SKILL")"
AGENTS_TEMPLATE_SECTION="$(awk '
    /^## AGENTS\.md Generation$/ { in_section=1 }
    in_section && /^\*\*Template:\*\*$/ { capture=1 }
    capture { print }
    capture && /^\*\*Rules for AGENTS\.md:\*\*$/ { exit }
' "$AIF_SKILL")"
SUMMARY_SECTION="$(awk '
    /^Present the completion summary and next-step recommendations in resolved `language\.ui`\. Cover:$/ { capture=1 }
    capture { print }
    /^\*\*For existing projects \(Mode 1\), also suggest next steps:\*\*$/ { if (capture) exit }
' "$AIF_SKILL")"
EXISTING_PROJECT_SUGGESTIONS_SECTION="$(awk '
    /^Present these suggestions in resolved `language\.ui`:$/ { capture=1 }
    capture { print }
    /^Present these as `AskUserQuestion` with multi-select options:$/ { if (capture) exit }
' "$AIF_SKILL")"
AIF_ARCH_DESCRIPTION_SECTION="$(awk '
    /^### Step 3: Update DESCRIPTION\.md$/ { capture=1 }
    capture { print }
    /^### Step 4: Update AGENTS\.md$/ { if (capture) exit }
' "$AIF_ARCH_SKILL")"
AIF_ARCH_AGENTS_SECTION="$(awk '
    /^### Step 4: Update AGENTS\.md$/ { capture=1 }
    capture { print }
    /^### Step 5: Confirm$/ { if (capture) exit }
' "$AIF_ARCH_SKILL")"
AIF_ARCH_CONFIRM_SECTION="$(awk '
    /^### Step 5: Confirm$/ { capture=1 }
    capture { print }
    /^## Artifact Ownership$/ { if (capture) exit }
' "$AIF_ARCH_SKILL")"
AIF_ARCH_OWNERSHIP_SECTION="$(awk '
    /^## Artifact Ownership$/ { capture=1 }
    capture { print }
    capture && /^---$/ { exit }
' "$AIF_ARCH_SKILL")"

if grep -Fq 'Immediately after determining Mode 1, Mode 2, or Mode 3, resolve the project language settings for the entire `/aif` run.' "$AIF_SKILL"; then
    pass "/aif resolves language immediately after mode detection"
else
    fail "/aif language resolution order missing immediate post-mode contract"
fi

if grep -Fq 'Write or update `.ai-factory/config.yaml` immediately after resolving the run-scoped language state.' "$AIF_SKILL" \
   && grep -Fq 'This write MUST happen before writing the first setup artifact and before invoking `/aif-architecture`.' "$AIF_SKILL"; then
    pass "/aif writes config before first artifact and /aif-architecture"
else
    fail "/aif config write ordering contract missing"
fi

if grep -Fq 'Never reconstruct `config.yaml` from memory or by free-writing YAML text.' "$AIF_SKILL" \
   && grep -Fq 'Always use `skills/aif/references/update-config.mjs` with `skills/aif/references/config-template.yaml` as the canonical source.' "$AIF_SKILL" \
   && grep -Fq 'If the helper reports an unsafe structure or invalid payload, STOP. Do **not** fall back to free-form YAML generation.' "$AIF_SKILL"; then
    pass "/aif uses helper-only deterministic config updates"
else
    fail "/aif helper-only config update contract missing"
fi

if grep -Fq '`paths.*` (including current schema keys such as `paths.qa`)' "$AIF_SKILL" \
   && grep -Fq '"paths.qa": ".ai-factory/qa/"' "$AIF_SKILL"; then
    pass "/aif helper contract includes current paths.qa schema"
else
    fail "/aif helper contract missing paths.qa coverage"
fi

if grep -Fq '`language.technical_terms` — preserve the existing value if it is already set; default to `keep` only when the key is missing' "$AIF_SKILL" \
   && grep -Fq 'Preserve `language.technical_terms` from existing config when present; otherwise set it to `keep` when writing config.' "$AIF_SKILL"; then
    pass "/aif preserves language.technical_terms semantics"
else
    fail "/aif language.technical_terms preservation contract missing"
fi

if grep -Fq 'use for all `AskUserQuestion` prompts, intermediate explanations, final summary, and next-step recommendations' "$AIF_SKILL" \
   && grep -Fq 'use for all setup-time text artifacts created in this run:' "$AIF_SKILL"; then
    pass "/aif documents language.ui vs language.artifacts split"
else
    fail "/aif language.ui vs language.artifacts split missing"
fi

if grep -Fq 'After creating DESCRIPTION.md, resolve the project language settings.' "$AIF_SKILL"; then
    fail "late language resolution wording reintroduced in /aif"
else
    pass "no late language resolution wording in /aif"
fi

if grep -Fq '[Enhanced, clear description of the project in English]' "$AIF_SKILL"; then
    fail "hard-coded English DESCRIPTION placeholder reintroduced in /aif"
else
    pass "no hard-coded English DESCRIPTION placeholder in /aif"
fi

if printf '%s\n' "$MODE2_SECTION" | grep -Fq '# [Localized project title in resolved artifacts language]' \
   && printf '%s\n' "$MODE2_SECTION" | grep -Fq '## [Localized heading: Tech Stack]' \
   && printf '%s\n' "$MODE2_SECTION" | grep -Fq '**[Localized label: Programming language]:** [user choice]'; then
    pass "/aif DESCRIPTION template uses localized artifact placeholders"
else
    fail "/aif DESCRIPTION template localization placeholders missing"
fi

MODE1_PERSIST_LINE=$(printf '%s\n' "$MODE1_SECTION" | grep -nF '**Step 3: Persist config.yaml**' | cut -d: -f1 | head -n1)
MODE1_DESCRIPTION_LINE=$(printf '%s\n' "$MODE1_SECTION" | grep -nF '**Step 4: Generate .ai-factory/DESCRIPTION.md**' | cut -d: -f1 | head -n1)
if [[ -n "$MODE1_PERSIST_LINE" && -n "$MODE1_DESCRIPTION_LINE" && "$MODE1_PERSIST_LINE" -lt "$MODE1_DESCRIPTION_LINE" ]]; then
    pass "/aif Mode 1 persists config before DESCRIPTION generation"
else
    fail "/aif Mode 1 config/DESCRIPTION ordering is wrong"
fi

MODE2_PERSIST_LINE=$(printf '%s\n' "$MODE2_SECTION" | grep -nF '**Step 2: Persist config.yaml**' | cut -d: -f1 | head -n1)
MODE2_STACK_LINE=$(printf '%s\n' "$MODE2_SECTION" | grep -nF '**Step 3: Interactive Stack Selection**' | cut -d: -f1 | head -n1)
MODE2_DESCRIPTION_LINE=$(printf '%s\n' "$MODE2_SECTION" | grep -nF '**Step 4: Create .ai-factory/DESCRIPTION.md**' | cut -d: -f1 | head -n1)
if [[ -n "$MODE2_PERSIST_LINE" && -n "$MODE2_STACK_LINE" && -n "$MODE2_DESCRIPTION_LINE" && "$MODE2_PERSIST_LINE" -lt "$MODE2_STACK_LINE" && "$MODE2_STACK_LINE" -lt "$MODE2_DESCRIPTION_LINE" ]]; then
    pass "/aif Mode 2 persists config immediately after language resolution"
else
    fail "/aif Mode 2 config timing is wrong"
fi

MODE3_PERSIST_LINE=$(printf '%s\n' "$MODE3_SECTION" | grep -nF '**Step 2: Persist config.yaml**' | cut -d: -f1 | head -n1)
MODE3_ASK_LINE=$(printf '%s\n' "$MODE3_SECTION" | grep -nF '**Step 3: Ask Project Description**' | cut -d: -f1 | head -n1)
if [[ -n "$MODE3_PERSIST_LINE" && -n "$MODE3_ASK_LINE" && "$MODE3_PERSIST_LINE" -lt "$MODE3_ASK_LINE" ]]; then
    pass "/aif Mode 3 persists config immediately after language resolution"
else
    fail "/aif Mode 3 config timing is wrong"
fi

if printf '%s\n' "$MODE2_SECTION" | grep -Fq '# Project: [Project Name]' \
   || printf '%s\n' "$MODE2_SECTION" | grep -Fq '## Overview' \
   || printf '%s\n' "$MODE2_SECTION" | grep -Fq '## Core Features' \
   || printf '%s\n' "$MODE2_SECTION" | grep -Fq '## Tech Stack' \
   || printf '%s\n' "$MODE2_SECTION" | grep -Fq '## Architecture Notes' \
   || printf '%s\n' "$MODE2_SECTION" | grep -Fq '## Non-Functional Requirements'; then
    fail "English DESCRIPTION template headings reintroduced in /aif"
else
    pass "no English DESCRIPTION template headings in /aif"
fi

if printf '%s\n' "$AGENTS_TEMPLATE_SECTION" | grep -Fq '| [Localized header: File] | [Localized header: Purpose] |' \
   && printf '%s\n' "$AGENTS_TEMPLATE_SECTION" | grep -Fq '| [Localized header: Document] | [Localized header: Path] | [Localized header: Description] |' \
   && printf '%s\n' "$AGENTS_TEMPLATE_SECTION" | grep -Fq '**[Localized label: Framework]:** [framework]' \
   && printf '%s\n' "$AGENTS_TEMPLATE_SECTION" | grep -Fq '[Localized shell-command decomposition rule in resolved artifacts language]'; then
    pass "/aif AGENTS template uses localized artifact placeholders"
else
    fail "/aif AGENTS template localization placeholders missing"
fi

if printf '%s\n' "$AGENTS_TEMPLATE_SECTION" | grep -Fq '| File | Purpose |' \
   || printf '%s\n' "$AGENTS_TEMPLATE_SECTION" | grep -Fq '| Document | Path | Description |' \
   || printf '%s\n' "$AGENTS_TEMPLATE_SECTION" | grep -Fq 'Project landing page' \
   || printf '%s\n' "$AGENTS_TEMPLATE_SECTION" | grep -Fq '**Programming language:** [language]' \
   || printf '%s\n' "$AGENTS_TEMPLATE_SECTION" | grep -Fq '**Framework:** [framework]' \
   || printf '%s\n' "$AGENTS_TEMPLATE_SECTION" | grep -Fq '**Database:** [database]' \
   || printf '%s\n' "$AGENTS_TEMPLATE_SECTION" | grep -Fq '**ORM:** [orm]' \
   || printf '%s\n' "$AGENTS_TEMPLATE_SECTION" | grep -Fq 'Never combine shell commands with `&&`, `||`, or `;`'; then
    fail "English AGENTS template text reintroduced in /aif"
else
    pass "no English AGENTS template text in /aif"
fi

if printf '%s\n' "$SUMMARY_SECTION" | grep -Fq '[Localized completion heading in `language.ui`]' \
   && printf '%s\n' "$SUMMARY_SECTION" | grep -Fq '[Localized roadmap recommendation in `language.ui`]' \
   && printf '%s\n' "$SUMMARY_SECTION" | grep -Fq '[Localized execution recommendation in `language.ui`]'; then
    pass "/aif summary template uses localized UI placeholders"
else
    fail "/aif summary template localization placeholders missing"
fi

if printf '%s\n' "$SUMMARY_SECTION" | grep -Fq -- '- Project description:' \
   || printf '%s\n' "$SUMMARY_SECTION" | grep -Fq -- '- Skills installed:' \
   || printf '%s\n' "$SUMMARY_SECTION" | grep -Fq -- '- Next steps:'; then
    fail "English summary template text reintroduced in /aif"
else
    pass "no English summary template text in /aif"
fi

if printf '%s\n' "$EXISTING_PROJECT_SUGGESTIONS_SECTION" | grep -Fq '[Localized documentation recommendation in `language.ui`]' \
   && printf '%s\n' "$EXISTING_PROJECT_SUGGESTIONS_SECTION" | grep -Fq '[Localized CI recommendation in `language.ui`]' \
   && printf '%s\n' "$EXISTING_PROJECT_SUGGESTIONS_SECTION" | grep -Fq '[Localized containerization recommendation in `language.ui`]'; then
    pass "/aif existing-project suggestions use localized UI placeholders"
else
    fail "/aif existing-project suggestions localization placeholders missing"
fi

if printf '%s\n' "$EXISTING_PROJECT_SUGGESTIONS_SECTION" | grep -Fq 'Generate project documentation' \
   || printf '%s\n' "$EXISTING_PROJECT_SUGGESTIONS_SECTION" | grep -Fq 'Add project-specific rules and conventions' \
   || printf '%s\n' "$EXISTING_PROJECT_SUGGESTIONS_SECTION" | grep -Fq 'Configure build scripts and automation' \
   || printf '%s\n' "$EXISTING_PROJECT_SUGGESTIONS_SECTION" | grep -Fq 'Set up CI/CD pipeline' \
   || printf '%s\n' "$EXISTING_PROJECT_SUGGESTIONS_SECTION" | grep -Fq 'Containerize the project'; then
    fail "English existing-project suggestions reintroduced in /aif"
else
    pass "no English existing-project suggestions in /aif"
fi

if printf '%s\n' "$AIF_ARCH_DESCRIPTION_SECTION" | grep -Fq 'resolved `language.artifacts`' \
   && printf '%s\n' "$AIF_ARCH_DESCRIPTION_SECTION" | grep -Fq 'Use the resolved architecture path from config, not the default path literal.' \
   && printf '%s\n' "$AIF_ARCH_DESCRIPTION_SECTION" | grep -Fq '## [Localized heading: Architecture]' \
   && printf '%s\n' "$AIF_ARCH_DESCRIPTION_SECTION" | grep -Fq '[Localized sentence in resolved artifacts language referencing the resolved architecture artifact path for detailed architecture guidelines.]'; then
    pass "/aif-architecture keeps DESCRIPTION companion update path-aware and localized"
else
    fail "/aif-architecture DESCRIPTION companion update contract missing"
fi

if printf '%s\n' "$AIF_ARCH_DESCRIPTION_SECTION" | grep -Fq '## Architecture' \
   || printf '%s\n' "$AIF_ARCH_DESCRIPTION_SECTION" | grep -Fq 'Pattern: [chosen pattern name]'; then
    fail "English DESCRIPTION companion update reintroduced in /aif-architecture"
else
    pass "no English DESCRIPTION companion update in /aif-architecture"
fi

if printf '%s\n' "$AIF_ARCH_AGENTS_SECTION" | grep -Fq 'resolved `language.artifacts`' \
   && printf '%s\n' "$AIF_ARCH_AGENTS_SECTION" | grep -Fq '| [resolved-architecture-path] | [Localized architecture artifact description in resolved artifacts language] |' \
   && printf '%s\n' "$AIF_ARCH_AGENTS_SECTION" | grep -Fq 'Only add if the resolved architecture path is not already present.'; then
    pass "/aif-architecture keeps AGENTS companion update path-aware and localized"
else
    fail "/aif-architecture AGENTS companion update contract missing"
fi

if printf '%s\n' "$AIF_ARCH_CONFIRM_SECTION" | grep -Fq 'resolved `language.ui`' \
   && printf '%s\n' "$AIF_ARCH_CONFIRM_SECTION" | grep -Fq '[Localized pattern label in `language.ui`]: [chosen pattern]' \
   && printf '%s\n' "$AIF_ARCH_CONFIRM_SECTION" | grep -Fq '[Localized file label in `language.ui`]: [resolved architecture path]' \
   && printf '%s\n' "$AIF_ARCH_CONFIRM_SECTION" | grep -Fq '[Localized success heading in `language.ui`]' \
   && printf '%s\n' "$AIF_ARCH_CONFIRM_SECTION" | grep -Fq '[Localized closing sentence in `language.ui` about workflow skills following these architecture guidelines.]'; then
    pass "/aif-architecture confirmation uses resolved UI language and path"
else
    fail "/aif-architecture confirmation localization/path contract missing"
fi

if printf '%s\n' "$AIF_ARCH_CONFIRM_SECTION" | grep -Fq 'Architecture document generated!' \
   || printf '%s\n' "$AIF_ARCH_CONFIRM_SECTION" | grep -Fq 'Pattern: [chosen pattern]' \
   || printf '%s\n' "$AIF_ARCH_CONFIRM_SECTION" | grep -Fq 'File: .ai-factory/ARCHITECTURE.md' \
   || printf '%s\n' "$AIF_ARCH_CONFIRM_SECTION" | grep -Fq 'Key rules:' \
   || printf '%s\n' "$AIF_ARCH_CONFIRM_SECTION" | grep -Fq 'All workflow skills (/aif-plan, /aif-implement) will now follow these architecture guidelines.'; then
    fail "English default-path confirmation text reintroduced in /aif-architecture"
else
    pass "no English default-path confirmation text in /aif-architecture"
fi

if printf '%s\n' "$AIF_ARCH_OWNERSHIP_SECTION" | grep -Fq 'resolved DESCRIPTION path from `config.yaml`' \
   && printf '%s\n' "$AIF_ARCH_OWNERSHIP_SECTION" | grep -Fq 'architecture row in `AGENTS.md` context table.'; then
    pass "/aif-architecture Artifact Ownership keeps companion updates path-aware"
else
    fail "/aif-architecture Artifact Ownership companion update contract missing"
fi

if printf '%s\n' "$AIF_ARCH_OWNERSHIP_SECTION" | grep -Fq '.ai-factory/DESCRIPTION.md'; then
    fail "default DESCRIPTION path leaked into /aif-architecture Artifact Ownership"
else
    pass "no default DESCRIPTION path leak in /aif-architecture Artifact Ownership"
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
HARDCODED_SETTINGS=$(grep -rE '(opencode\.json|\.mcp\.json|settings\.local\.json|\.cursor/mcp\.json|\.vscode/mcp\.json|\.roo/mcp\.json|\.kilocode/mcp\.json|\.qwen/settings\.json)' "$ROOT_DIR/skills/" "$ROOT_DIR/subagents/" --include='*.md' 2>/dev/null | grep -v '{{' | wc -l | tr -d ' ' || true)
if [[ "$HARDCODED_SETTINGS" -eq 0 ]]; then
    pass "no hardcoded settings_file in skills/ and subagents/"
else
    fail "found $HARDCODED_SETTINGS hardcoded settings_file values (use {{settings_file}})"
    grep -rEn '(opencode\.json|\.mcp\.json|settings\.local\.json|\.cursor/mcp\.json|\.vscode/mcp\.json|\.roo/mcp\.json|\.kilocode/mcp\.json|\.qwen/settings\.json)' "$ROOT_DIR/skills/" "$ROOT_DIR/subagents/" --include='*.md' 2>/dev/null | grep -v '{{' | sed 's/^/      /'
fi

# /aif MCP runtime-contract wording
AIF_MCP_SECTION=$(awk '
  /^## MCP Configuration$/ { capture=1; next }
  capture && /^---$/ { exit }
  capture { print }
' "$ROOT_DIR/skills/aif/SKILL.md")
DOCS_MCP_SECTION=$(awk '
  /^## MCP Configuration$/ { capture=1; next }
  capture && /^## / { exit }
  capture { print }
' "$ROOT_DIR/docs/configuration.md")

if [[ -z "$AIF_MCP_SECTION" ]]; then
    fail "/aif MCP Configuration section missing"
else
    pass "/aif MCP Configuration section present"
fi

if grep -Fq "depends on the runtime" <<< "$AIF_MCP_SECTION"; then
    pass "/aif MCP section states that MCP shape depends on runtime"
else
    fail "/aif MCP section does not state runtime-dependent MCP shape"
fi

if grep -Fq "OpenCode" <<< "$AIF_MCP_SECTION" && grep -Fq 'mcp.<server>' <<< "$AIF_MCP_SECTION" && grep -Fq '"type": "local"' <<< "$AIF_MCP_SECTION"; then
    pass "/aif MCP section includes OpenCode runtime contract"
else
    fail "/aif MCP section missing OpenCode runtime contract"
fi

if grep -Fq "GitHub Copilot" <<< "$AIF_MCP_SECTION" && grep -Fq 'servers.<server>' <<< "$AIF_MCP_SECTION" && grep -Fq '"type": "stdio"' <<< "$AIF_MCP_SECTION"; then
    pass "/aif MCP section includes GitHub Copilot runtime contract"
else
    fail "/aif MCP section missing GitHub Copilot runtime contract"
fi

if grep -Eiq '(all|every|any).*(supported )?(agents|runtimes).*(mcpServers)|mcpServers.*(all|every|any).*(supported )?(agents|runtimes)|(works|work).*(across|for).*(agents|runtimes).*(mcpServers)' <<< "$AIF_MCP_SECTION"; then
    fail "/aif MCP section still implies universal mcpServers usage"
else
    pass "/aif MCP section does not imply universal mcpServers usage"
fi

if [[ -z "$DOCS_MCP_SECTION" ]]; then
    fail "docs MCP Configuration section missing"
else
    pass "docs MCP Configuration section present"
fi

if grep -Fq '../skills/aif/SKILL.md#mcp-configuration' <<< "$DOCS_MCP_SECTION" && grep -Fq 'Source of truth' <<< "$DOCS_MCP_SECTION"; then
    pass "docs MCP section links to canonical /aif MCP source-of-truth"
else
    fail "docs MCP section must link to canonical /aif MCP source-of-truth"
fi

if grep -Fq 'mcpServers.<server>' <<< "$DOCS_MCP_SECTION" && grep -Fq 'mcp.<server>' <<< "$DOCS_MCP_SECTION" && grep -Fq 'servers.<server>' <<< "$DOCS_MCP_SECTION"; then
    pass "docs MCP section includes runtime key mapping reminders"
else
    fail "docs MCP section missing runtime key mapping reminders"
fi

if grep -Fq '| Runtime | Root key | Entry shape |' <<< "$DOCS_MCP_SECTION"; then
    fail "docs MCP section reintroduced duplicated runtime matrix table"
else
    pass "docs MCP section avoids duplicated runtime matrix table"
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
SUBAGENT_LINT_OUTPUT=$(
ROOT_DIR="$ROOT_DIR" node --input-type=module - 2>&1 <<'EOF'
import fs from 'fs';
import path from 'path';

const root = process.env.ROOT_DIR;
const subagentsDir = path.join(root, 'subagents', 'claude', 'agents');
const docsPath = path.join(root, 'docs', 'subagents.md');
const refsPath = path.join(root, '.references', 'CLAUDE-SUBAGENTS.md');

const files = fs.readdirSync(subagentsDir).filter(file => file.endsWith('.md')).sort();
const docsContent = fs.readFileSync(docsPath, 'utf8');
const refsContent = fs.readFileSync(refsPath, 'utf8');
const errors = [];

function getFrontmatter(content, file) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    errors.push(file + ': missing frontmatter');
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
    errors.push(file + ': frontmatter name "' + name + '" does not match filename "' + expectedName + '"');
  }

  if (background && hasWriterTools) {
    errors.push(file + ': background agents must be read-only');
  }

  if (docsContent.includes('`' + expectedName + '`') === false) {
    errors.push(file + ': missing from docs/subagents.md inventory');
  }

  if (refsContent.includes('`' + expectedName + '`') === false) {
    errors.push(file + ': missing from .references/CLAUDE-SUBAGENTS.md inventory');
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
# Part 4.5: Planner parity contract regressions
# ─────────────────────────────────────────────
echo -e "\n${BOLD}=== Planner parity contract checks ===${NC}\n"

CLAUDE_SUBAGENTS_DIR="$ROOT_DIR/subagents/claude/agents"

if grep -qE 'git checkout main|git pull origin main' "$CLAUDE_SUBAGENTS_DIR/plan-polisher.md"; then
    fail "plan-polisher must not hardcode main as the base branch"
else
    pass "plan-polisher base-branch contract"
fi

if grep -qF '| mode           | full' "$CLAUDE_SUBAGENTS_DIR/plan-coordinator.md" \
    && grep -qF -- '- mode: `full`' "$CLAUDE_SUBAGENTS_DIR/plan-polisher.md"; then
    pass "planner defaults stay on the richer full contract"
else
    fail "planner defaults stay on the richer full contract"
fi

if grep -qF '`paths.plan`' "$CLAUDE_SUBAGENTS_DIR/plan-polisher.md" \
    && grep -qF '`paths.plans`' "$CLAUDE_SUBAGENTS_DIR/plan-polisher.md" \
    && grep -qF '`git.base_branch`' "$CLAUDE_SUBAGENTS_DIR/plan-polisher.md" \
    && grep -qF '`git.create_branches`' "$CLAUDE_SUBAGENTS_DIR/plan-polisher.md" \
    && grep -qF '`git.branch_prefix`' "$CLAUDE_SUBAGENTS_DIR/plan-polisher.md" \
    && grep -qF 'Treat the current branch as an AI Factory feature branch only if it starts with the configured `git.branch_prefix`.' "$CLAUDE_SUBAGENTS_DIR/plan-polisher.md"; then
    pass "plan-polisher stays config-aware for plan paths and branch prefix"
else
    fail "plan-polisher config-aware path/branch-prefix contract missing"
fi

if grep -qF 'Your write scope is limited to the resolved planning paths from `.ai-factory/config.yaml`:' "$CLAUDE_SUBAGENTS_DIR/plan-polisher.md" \
    && grep -qF 'the configured `paths.plan`' "$CLAUDE_SUBAGENTS_DIR/plan-polisher.md" \
    && grep -qF 'files under the configured `paths.plans`' "$CLAUDE_SUBAGENTS_DIR/plan-polisher.md"; then
    pass "plan-polisher write scope follows resolved config paths"
else
    fail "plan-polisher write scope must follow resolved config paths"
fi

if grep -qF 'Your write scope is limited to `.ai-factory/PLAN.md`, `.ai-factory/plans/*.md`' "$CLAUDE_SUBAGENTS_DIR/plan-polisher.md"; then
    fail "plan-polisher must not hardcode write scope to default .ai-factory paths"
else
    pass "plan-polisher avoids hardcoded default write scope"
fi

if grep -qF 'contains `/` in the name' "$CLAUDE_SUBAGENTS_DIR/plan-polisher.md"; then
    fail "plan-polisher must not use slash-presence branch heuristic"
else
    pass "plan-polisher avoids slash-presence branch heuristic"
fi

if grep -qF 'Do not discard, stash, or overwrite them.' "$CLAUDE_SUBAGENTS_DIR/plan-polisher.md" \
    && grep -qF 'If `origin` is unavailable or the remote base branch cannot be reached, skip `git pull`' "$CLAUDE_SUBAGENTS_DIR/plan-polisher.md"; then
    pass "plan-polisher branch safety fallback contract"
else
    fail "plan-polisher branch safety fallback contract missing"
fi

if grep -qF 'If `git.enabled = false` or `git.create_branches = false` → do NOT create or switch branches.' "$CLAUDE_SUBAGENTS_DIR/plan-polisher.md"; then
    pass "plan-polisher disables branch creation when config says so"
else
    fail "plan-polisher must disable branch creation when config says so"
fi

if grep -qF 'HANDOFF_TASK_ID: <value from plan annotation>' "$CLAUDE_SUBAGENTS_DIR/plan-coordinator.md" \
    && grep -qF 'Do this even though `HANDOFF_MODE` stays unset or non-`1` in manual sessions.' "$CLAUDE_SUBAGENTS_DIR/plan-coordinator.md" \
    && grep -qF '`HANDOFF_TASK_ID` by itself when manual mode is refining a plan that already has a Handoff annotation' "$CLAUDE_SUBAGENTS_DIR/plan-coordinator.md"; then
    pass "plan-coordinator preserves manual handoff task ids"
else
    fail "plan-coordinator manual handoff dispatch contract missing"
fi

if grep -qF 'bounded helper workers' "$ROOT_DIR/docs/configuration.md" \
    && grep -qF 'runtime-local settings such as `model`, `model_reasoning_effort`, `sandbox_mode`, and `developer_instructions`' "$ROOT_DIR/docs/extensions.md" \
    && grep -qF 'one-shot workers' "$ROOT_DIR/docs/subagents.md"; then
    pass "extension runtime helper docs stay synchronized"
else
    fail "extension runtime helper docs stay synchronized"
fi

# ─────────────────────────────────────────────
# Part 5: Internal security self-scan
# ─────────────────────────────────────────────
if grep -qE '^[[:space:]]*reasoning_effort = |^[[:space:]]*prompt = """' "$ROOT_DIR/examples/extensions/aif-ext-hello/agent-files/codex/hello_reviewer.toml" \
    || grep -qE '^[[:space:]]*reasoning_effort = |^[[:space:]]*prompt = """' "$ROOT_DIR/examples/extensions/aif-ext-hello/agent-files/test-agent/hello_helper.toml"; then
    fail "example extension agent files must use canonical TOML keys"
else
    pass "example extension agent file schema"
fi

if grep -qF 'model = "gpt-5.4-mini"' "$ROOT_DIR/examples/extensions/aif-ext-hello/agent-files/codex/hello_reviewer.toml" \
    && grep -qF 'model_reasoning_effort = "medium"' "$ROOT_DIR/examples/extensions/aif-ext-hello/agent-files/codex/hello_reviewer.toml" \
    && grep -qF 'sandbox_mode = "read-only"' "$ROOT_DIR/examples/extensions/aif-ext-hello/agent-files/codex/hello_reviewer.toml" \
    && grep -qF 'developer_instructions = """' "$ROOT_DIR/examples/extensions/aif-ext-hello/agent-files/codex/hello_reviewer.toml" \
    && grep -qF 'model_reasoning_effort = "medium"' "$ROOT_DIR/examples/extensions/aif-ext-hello/agent-files/test-agent/hello_helper.toml" \
    && grep -qF 'sandbox_mode = "read-only"' "$ROOT_DIR/examples/extensions/aif-ext-hello/agent-files/test-agent/hello_helper.toml"; then
    pass "example extension agent file runtime contract"
else
    fail "example extension agent file runtime contract"
fi

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
# Part 6: /aif config helper regression tests
# ─────────────────────────────────────────────
echo -e "\n${BOLD}=== /aif config helper regression tests ===${NC}\n"

set +e
CONFIG_HELPER_OUTPUT=$(bash "$ROOT_DIR/scripts/test-aif-config.sh" 2>&1)
CONFIG_HELPER_EXIT=$?
set -e

if [[ $CONFIG_HELPER_EXIT -eq 0 ]]; then
    pass "aif config helper regression tests"
else
    fail "aif config helper regression tests"
    echo "$CONFIG_HELPER_OUTPUT" | sed 's/^/      /'
fi

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
# Part 8: Init command smoke tests
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
# Part 8: aif-qa skill smoke tests
# ─────────────────────────────────────────────
echo -e "\n${BOLD}=== Extension resolver unit tests ===${NC}\n"

set +e
EXTENSION_UNIT_OUTPUT=$(bash "$ROOT_DIR/scripts/test-extensions.sh" 2>&1)
EXTENSION_UNIT_EXIT=$?
set -e

if [[ $EXTENSION_UNIT_EXIT -eq 0 ]]; then
    pass "extension resolver unit tests"
else
    fail "extension resolver unit tests"
    echo "$EXTENSION_UNIT_OUTPUT" | sed 's/^/      /'
fi

echo -e "\n${BOLD}=== aif-qa skill smoke tests ===${NC}\n"

set +e
QA_SMOKE_OUTPUT=$(bash "$ROOT_DIR/scripts/test-aif-qa.sh" 2>&1)
QA_SMOKE_EXIT=$?
set -e

if [[ $QA_SMOKE_EXIT -eq 0 ]]; then
    pass "aif-qa smoke tests"
else
    fail "aif-qa smoke tests"
    echo "$QA_SMOKE_OUTPUT" | sed 's/^/      /'
fi

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
echo -e "\n${BOLD}=== aif-rules-check skill smoke tests ===${NC}\n"

set +e
RULES_CHECK_SMOKE_OUTPUT=$(bash "$ROOT_DIR/scripts/test-aif-rules-check.sh" 2>&1)
RULES_CHECK_SMOKE_EXIT=$?
set -e

if [[ $RULES_CHECK_SMOKE_EXIT -eq 0 ]]; then
    pass "aif-rules-check smoke tests"
else
    fail "aif-rules-check smoke tests"
    echo "$RULES_CHECK_SMOKE_OUTPUT" | sed 's/^/      /'
fi

echo -e "\n${BOLD}=== Gate result contract smoke tests ===${NC}\n"

set +e
GATE_RESULT_SMOKE_OUTPUT=$(bash "$ROOT_DIR/scripts/test-gate-result-contract.sh" 2>&1)
GATE_RESULT_SMOKE_EXIT=$?
set -e

if [[ $GATE_RESULT_SMOKE_EXIT -eq 0 ]]; then
    pass "gate result contract smoke tests"
else
    fail "gate result contract smoke tests"
    echo "$GATE_RESULT_SMOKE_OUTPUT" | sed 's/^/      /'
fi

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
