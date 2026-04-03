---
name: aif-security-checklist
description: Security audit checklist based on OWASP Top 10 and best practices. Covers authentication, injection, XSS, CSRF, secrets management, and more. Use when reviewing security, before deploy, asking "is this secure", "security check", "vulnerability".
argument-hint: "[auth|injection|xss|csrf|secrets|api|infra|prompt-injection|race-condition|ignore <item>]"
allowed-tools: Read Glob Grep Write Edit Bash(npm audit) Bash(grep *)
disable-model-invocation: false
---

# Security Checklist

Comprehensive security checklist based on OWASP Top 10 (2021) and industry best practices.

## Quick Reference

- `/aif-security-checklist` — Full audit checklist
- `/aif-security-checklist auth` — Authentication & sessions
- `/aif-security-checklist injection` — SQL/NoSQL/Command injection
- `/aif-security-checklist xss` — Cross-site scripting
- `/aif-security-checklist csrf` — Cross-site request forgery
- `/aif-security-checklist secrets` — Secrets & credentials
- `/aif-security-checklist api` — API security
- `/aif-security-checklist infra` — Infrastructure security
- `/aif-security-checklist prompt-injection` — LLM prompt injection
- `/aif-security-checklist race-condition` — Race conditions & TOCTOU
- `/aif-security-checklist ignore <item>` — Ignore a specific check item

## Config

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:
- **Paths:** `paths.security`
- **Language:** `language.ui` for prompts

If config.yaml doesn't exist, use defaults:
- SECURITY.md: `.ai-factory/SECURITY.md`
- Language: `en` (English)

## Ignored Items (SECURITY.md)

Before running any audit, **always read** the resolved SECURITY.md path (default: `.ai-factory/SECURITY.md`). If it exists, it contains a list of security checks the team has decided to ignore.

### How ignoring works

**When the user runs `/aif-security-checklist ignore <item>`:**

1. Read the current resolved SECURITY.md file (create if it doesn't exist)
2. Ask the user for the reason why this item should be ignored
3. Add the item to the file following the format below
4. Confirm the item was added

**When running any audit (`/aif-security-checklist` or a specific category):**

1. Read the resolved SECURITY.md file at the start
2. For each ignored item that matches the current audit scope:
   - Do NOT flag it as a finding
   - Instead, show it in a separate section at the end: **"⏭️ Ignored Items"**
   - Display each ignored item with its reason and date, so the team stays aware
3. Non-ignored items are audited as usual

### SECURITY.md format

```markdown
# Security: Ignored Items

Items below are excluded from security-checklist audits.
Review periodically — ignored risks may become relevant.

| Item | Reason | Date | Author |
|------|--------|------|--------|
| no-csrf | SPA with token auth, no cookies used | 2025-03-15 | @dev |
| no-rate-limit | Internal microservice, behind API gateway | 2025-03-15 | @dev |
```

**Item naming convention** — use short kebab-case IDs:
- `no-csrf` — CSRF tokens not implemented
- `no-rate-limit` — Rate limiting not configured
- `no-https` — HTTPS not enforced
- `no-xss-csp` — CSP header missing
- `no-sql-injection` — SQL injection not fully prevented
- `no-prompt-injection` — LLM prompt injection not mitigated
- `no-race-condition` — Race condition prevention missing
- `no-secret-rotation` — Secrets not rotated
- `no-auth-{route}` — Auth missing on specific route
- `verbose-errors` — Detailed errors exposed
- Or any custom descriptive ID

### Output example for ignored items

When audit results are shown, append this section at the end:

```
⏭️ Ignored Items (from the resolved SECURITY.md artifact)
┌─────────────────┬──────────────────────────────────────┬────────────┐
│ Item            │ Reason                               │ Date       │
├─────────────────┼──────────────────────────────────────┼────────────┤
│ no-csrf         │ SPA with token auth, no cookies used │ 2025-03-15 │
│ no-rate-limit   │ Internal service, behind API gateway │ 2025-03-15 │
└─────────────────┴──────────────────────────────────────┴────────────┘
⚠️  2 items ignored. Run `/aif-security-checklist` without ignores to see full audit.
```

---

### Project Context

**Read `.ai-factory/skill-context/aif-security-checklist/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**
- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including security
  checklists, the Pre-Deployment Checklist, and SECURITY.md. If a skill-context rule says
  "checklist MUST include X" or "audit MUST cover Y" — you MUST augment the checklists accordingly.
  Producing a security report that ignores skill-context rules is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

---

## Quick Automated Audit

Run the automated security audit script:

```bash
bash ~/{{skills_dir}}/security-checklist/scripts/audit.sh
```

This checks:
- Hardcoded secrets in code
- .env tracked in git
- .gitignore configuration
- npm audit (vulnerabilities)
- console.log in production code
- Security task markers

---

## 🔴 Critical: Pre-Deployment Checklist

### Must Fix Before Production
- [ ] No secrets in code or git history
- [ ] All user input is validated and sanitized
- [ ] Authentication on all protected routes
- [ ] HTTPS enforced (no HTTP)
- [ ] SQL/NoSQL injection prevented
- [ ] XSS protection in place
- [ ] CSRF tokens on state-changing requests
- [ ] Rate limiting enabled
- [ ] Error messages don't leak sensitive info
- [ ] Dependencies scanned for vulnerabilities
- [ ] LLM prompt injection mitigated (if using AI)
- [ ] Race conditions prevented on critical operations (payments, inventory)

---

## Authentication & Sessions

### Password Security
```
✅ Requirements:
- [ ] Minimum 12 characters
- [ ] Hashed with bcrypt/argon2 (cost factor ≥ 12)
- [ ] Never stored in plain text
- [ ] Never logged
- [ ] Breach detection (HaveIBeenPwned API)
```

For implementation patterns (argon2, bcrypt, PHP, Laravel) → read `references/AUTH-PATTERNS.md`

### Session Management
```
✅ Checklist:
- [ ] Session ID regenerated after login
- [ ] Session timeout implemented (idle + absolute)
- [ ] Secure cookie flags set
- [ ] Session invalidation on logout
- [ ] Concurrent session limits (optional)
```

For secure cookie settings example → read `references/AUTH-PATTERNS.md`

### JWT Security
```
✅ Checklist:
- [ ] Use RS256 or ES256 (not HS256 for distributed systems)
- [ ] Short expiration (15 min access, 7 day refresh)
- [ ] Validate all claims (iss, aud, exp, iat)
- [ ] Store refresh tokens securely (httpOnly cookie)
- [ ] Implement token revocation
- [ ] Never store sensitive data in payload
```

---

## Injection Prevention

### SQL Injection
```typescript
// ❌ VULNERABLE: String concatenation
const query = `SELECT * FROM users WHERE id = ${userId}`;

// ✅ SAFE: Parameterized query
const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);

// ✅ SAFE: ORM (Prisma/Eloquent/SQLAlchemy)
const user = await prisma.user.findUnique({ where: { id: userId } });
```

### NoSQL Injection
```typescript
// ❌ VULNERABLE: Direct user input — attack: { "$ne": "" }
const user = await db.users.findOne({ username: req.body.username });

// ✅ SAFE: Type validation
const username = z.string().parse(req.body.username);
```

### Command Injection
```typescript
// ❌ VULNERABLE: exec(`convert ${userFilename} output.png`);
// ✅ SAFE: execFile('convert', [userFilename, 'output.png']);
```

---

## Cross-Site Scripting (XSS)

### Prevention Checklist
```
- [ ] All user output HTML-encoded by default
- [ ] Content-Security-Policy header configured
- [ ] X-Content-Type-Options: nosniff
- [ ] Sanitize HTML if allowing rich text
- [ ] Validate URLs before rendering links
```

### Output Encoding
```typescript
// ❌ VULNERABLE: element.innerHTML = userInput; / dangerouslySetInnerHTML
// ✅ SAFE: element.textContent = userInput; / React: <div>{userInput}</div>
// ✅ If HTML needed: DOMPurify.sanitize(userInput)
```

```php
// ❌ VULNERABLE: <?= $userInput ?> / {!! $userInput !!}
// ✅ SAFE: {{ $userInput }} (Blade) / htmlspecialchars($input, ENT_QUOTES, 'UTF-8')
```

### Content Security Policy

Set CSP header: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`

---

## CSRF Protection

### Checklist
```
- [ ] CSRF tokens on all state-changing requests
- [ ] SameSite=Strict or Lax on cookies
- [ ] Verify Origin/Referer headers
- [ ] Don't use GET for state changes
```

### Implementation
- **Server-rendered**: Use `csurf` middleware, embed token in hidden form field and AJAX headers
- **SPAs**: Double-submit cookie pattern — set readable cookie with `sameSite: 'strict'`, client sends token in header, server compares

---

## Secrets Management

### Never Do This
```
❌ Secrets in code
const API_KEY = "sk_live_abc123";

❌ Secrets in git
.env committed to repository

❌ Secrets in logs
console.log(`Connecting with password: ${password}`);

❌ Secrets in error messages
throw new Error(`DB connection failed: ${connectionString}`);
```

### Checklist
```
- [ ] Secrets in environment variables or vault
- [ ] .env in .gitignore
- [ ] Different secrets per environment
- [ ] Secrets rotated regularly
- [ ] Access to secrets audited
- [ ] No secrets in client-side code
```

### Git History Cleanup
```bash
# If secrets were committed, remove from history
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch path/to/secret-file" \
  --prune-empty --tag-name-filter cat -- --all

# Or use BFG Repo-Cleaner (faster)
bfg --delete-files .env
bfg --replace-text passwords.txt

# Force push (coordinate with team!)
git push origin --force --all

# Rotate ALL exposed secrets immediately!
```

---

## API Security

### Authentication
```
- [ ] API keys not in URLs (use headers)
- [ ] Rate limiting per user/IP
- [ ] Request signing for sensitive operations
- [ ] OAuth 2.0 for third-party access
```

### Input Validation
```typescript
// ✅ Validate all input with schema
import { z } from 'zod';

const CreateUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100),
  age: z.number().int().min(0).max(150).optional(),
});

app.post('/users', (req, res) => {
  const result = CreateUserSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  // result.data is typed and validated
});
```

### Response Security
```typescript
// ✅ Don't expose internal errors
app.use((err, req, res, next) => {
  console.error(err); // Log full error internally

  // Return generic message to client
  res.status(500).json({
    error: 'Internal server error',
    requestId: req.id, // For support reference
  });
});

// ✅ Don't expose sensitive fields
const userResponse = {
  id: user.id,
  name: user.name,
  email: user.email,
  // ❌ Never: password, passwordHash, internalId, etc.
};
```

---

## Infrastructure Security

### Headers Checklist
```typescript
app.use(helmet()); // Sets many security headers

// Or manually:
res.setHeader('X-Content-Type-Options', 'nosniff');
res.setHeader('X-Frame-Options', 'DENY');
res.setHeader('X-XSS-Protection', '0'); // Disabled, use CSP instead
res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
```

### Dependency Security
```bash
# Check for vulnerabilities
npm audit
pip-audit
cargo audit

# Auto-fix where possible
npm audit fix

# Keep dependencies updated
npx npm-check-updates -u
```

### Deployment Checklist
```
- [ ] HTTPS only (redirect HTTP)
- [ ] TLS 1.2+ only
- [ ] Security headers configured
- [ ] Debug mode disabled
- [ ] Default credentials changed
- [ ] Unnecessary ports closed
- [ ] File permissions restricted
- [ ] Logging enabled (but no secrets)
- [ ] Backups encrypted
- [ ] WAF/DDoS protection (for public APIs)
```

---

## Race Conditions

For detailed race condition patterns (double-spend, TOCTOU, optimistic locking, idempotency keys, distributed locks) → read `references/RACE-CONDITIONS.md`

### Prevention Checklist
```
- [ ] Financial operations use database transactions with proper isolation
- [ ] Inventory/stock checks use atomic decrement (not read-then-write)
- [ ] Idempotency keys on payment and mutation endpoints
- [ ] Optimistic locking (version column) on concurrent updates
- [ ] File operations use exclusive locks where needed
- [ ] No TOCTOU gaps between permission check and action
- [ ] Rate limiting to reduce exploitation window
```

---

## Prompt Injection (LLM Security)

For detailed prompt injection patterns (direct, indirect, tool safety, output validation, RAG) → read `references/PROMPT-INJECTION.md`

### Prevention Checklist
```
- [ ] User input never concatenated directly into system prompts
- [ ] Input/output boundaries clearly separated (delimiters, roles)
- [ ] LLM output treated as untrusted (never executed as code/commands)
- [ ] Tool calls from LLM validated and sandboxed
- [ ] Sensitive data excluded from LLM context
- [ ] Rate limiting on LLM endpoints
- [ ] Output filtered for PII/secrets leakage
- [ ] Logging & monitoring for anomalous prompts
```

---

## Quick Audit Commands

```bash
# Find hardcoded secrets
grep -rn "password\|secret\|api_key\|token" --include="*.ts" --include="*.js" .

# Check for vulnerable dependencies
npm audit --audit-level=high

# Find unfinished security markers
grep -rn "[T][O][D][O].*security\|[F][I][X][M][E].*security\|[X][X][X].*security" .

# Check for console.log in production code
grep -rn "console\.log" src/

# Find prompt injection risks (unsanitized input in LLM calls)
grep -rn "system.*\${.*}" --include="*.ts" --include="*.js" .
grep -rn "innerHTML.*llm\|innerHTML.*response\|innerHTML.*completion" --include="*.ts" --include="*.js" .
```

---

## Severity Reference

| Issue | Severity | Fix Timeline |
|-------|----------|--------------|
| SQL Injection | 🔴 Critical | Immediate |
| Auth Bypass | 🔴 Critical | Immediate |
| Secrets Exposed | 🔴 Critical | Immediate |
| XSS (Stored) | 🔴 Critical | < 24 hours |
| Prompt Injection (Direct) | 🔴 Critical | Immediate |
| Race Condition (Financial) | 🔴 Critical | Immediate |
| Prompt Injection (Indirect) | 🟠 High | < 1 week |
| Race Condition (Data) | 🟠 High | < 1 week |
| CSRF | 🟠 High | < 1 week |
| XSS (Reflected) | 🟠 High | < 1 week |
| Missing Rate Limit | 🟡 Medium | < 2 weeks |
| Verbose Errors | 🟡 Medium | < 2 weeks |
| Missing Headers | 🟢 Low | < 1 month |

> **Tip:** Context is heavy after security audit. Consider `/clear` or `/compact` before continuing with other tasks.

## Artifact Ownership and Config Policy

- Primary ownership: the resolved SECURITY.md artifact (default: `.ai-factory/SECURITY.md`) for ignored-item state created through the `ignore` flow.
- Write policy: audit findings are normally conversational output; persistent writes are limited to the ignore-state artifact above unless the user explicitly asks for more.
- Config policy: config-aware. Use `paths.security` for the ignore-state artifact while deriving audit scope from repo evidence and audit commands.
