#!/bin/bash
# Security Audit Script
# Run comprehensive security checks on a project

set -e

echo "🔒 Security Audit"
echo "================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
ISSUES=0

# 1. Check for secrets in code
echo "📝 Checking for hardcoded secrets..."
SECRETS=$(grep -rn --include="*.ts" --include="*.js" --include="*.py" --include="*.php" \
  -E "(password|secret|api_key|apikey|token|private_key)\s*[:=]" . 2>/dev/null | \
  grep -v node_modules | grep -v ".git" | grep -v "test" | head -20 || true)

if [ -n "$SECRETS" ]; then
  echo -e "${RED}⚠️  Potential secrets found:${NC}"
  echo "$SECRETS"
  ((ISSUES++))
else
  echo -e "${GREEN}✅ No obvious hardcoded secrets${NC}"
fi
echo ""

# 2. Check for .env committed
echo "📝 Checking for .env in git..."
if git ls-files --error-unmatch .env 2>/dev/null; then
  echo -e "${RED}⚠️  .env is tracked in git!${NC}"
  ((ISSUES++))
else
  echo -e "${GREEN}✅ .env is not tracked${NC}"
fi
echo ""

# 3. Check .gitignore
echo "📝 Checking .gitignore..."
if [ -f .gitignore ]; then
  if grep -q "\.env" .gitignore; then
    echo -e "${GREEN}✅ .env in .gitignore${NC}"
  else
    echo -e "${YELLOW}⚠️  .env not in .gitignore${NC}"
    ((ISSUES++))
  fi
else
  echo -e "${YELLOW}⚠️  No .gitignore found${NC}"
fi
echo ""

# 4. NPM Audit (if package.json exists)
if [ -f package.json ]; then
  echo "📝 Running npm audit..."
  if npm audit --audit-level=high 2>/dev/null; then
    echo -e "${GREEN}✅ No high/critical vulnerabilities${NC}"
  else
    echo -e "${RED}⚠️  Vulnerabilities found - run 'npm audit' for details${NC}"
    ((ISSUES++))
  fi
  echo ""
fi

# 5. Check for console.log in production code
echo "📝 Checking for console.log statements..."
LOGS=$(grep -rn "console\.log" --include="*.ts" --include="*.js" src/ 2>/dev/null | \
  grep -v "test" | grep -v "spec" | head -10 || true)

if [ -n "$LOGS" ]; then
  echo -e "${YELLOW}⚠️  console.log found (review for production):${NC}"
  echo "$LOGS"
else
  echo -e "${GREEN}✅ No console.log in src/${NC}"
fi
echo ""

# 6. Check for TODO security items
echo "📝 Checking for security TODOs..."
TODOS=$(grep -rn --include="*.ts" --include="*.js" --include="*.py" --include="*.php" \
  -i "todo.*security\|fixme.*security\|xxx.*security\|hack" . 2>/dev/null | \
  grep -v node_modules | head -10 || true)

if [ -n "$TODOS" ]; then
  echo -e "${YELLOW}⚠️  Security TODOs found:${NC}"
  echo "$TODOS"
else
  echo -e "${GREEN}✅ No security TODOs${NC}"
fi
echo ""

# Summary
echo "================="
if [ $ISSUES -gt 0 ]; then
  echo -e "${RED}Found $ISSUES potential issue(s)${NC}"
  echo "Review the items above and fix before deployment."
  exit 1
else
  echo -e "${GREEN}✅ No critical issues found${NC}"
  echo "Remember to also review manually using /aif-security-checklist"
  exit 0
fi
