# Docker Audit Guide

## Dockerfile Audit

Read each section from `references/SECURITY-CHECKLIST.md` → "Dockerfile Security" and check:

- Image pinning (no `:latest`)
- Minimal base image
- Multi-stage build present
- Non-root user in final stage
- No secrets in ENV/ARG
- .dockerignore exists and is comprehensive
- BuildKit features used (cache mounts)
- HEALTHCHECK instruction present

## Compose Security Audit

Read each section from `references/SECURITY-CHECKLIST.md` → "Compose Security" and check:

**For each service:**
- `read_only: true`?
- `security_opt: [no-new-privileges:true]`?
- `cap_drop: [ALL]`?
- `user:` specified?
- `tmpfs` for temp directories?
- Resource limits set?
- Healthcheck defined?
- Log rotation configured?
- Restart policy set?

**Network security:**
- Backend network `internal: true`?
- No `network_mode: host`?
- No Docker socket mounted?

**Secrets:**
- Sensitive values via `.env` (not hardcoded in compose)?
- `.env` in `.gitignore`?
- `.env.example` exists with placeholder values?

## Gap Analysis

Compare existing compose against `PROJECT_PROFILE`:
- Services detected in code but missing from compose?
- .env variables referenced but no matching service?
- Dev override file exists?
- Production hardening file exists?

## Audit Report Format

```
## Docker Security Audit

### Dockerfile
| Check | Status | Detail |
|-------|--------|--------|
| Pinned base image | ✅ | node:22.5-alpine |
| Multi-stage build | ✅ | 3 stages |
| Non-root user | ❌ | Running as root in final stage |
| No secrets in ENV | ✅ | |
| .dockerignore | ⚠️ | Missing: .env*, docker-compose* |
| Healthcheck | ❌ | No HEALTHCHECK instruction |

### compose.yml
| Service | read_only | no-new-privs | cap_drop | resources | healthcheck | logging |
|---------|-----------|-------------|----------|-----------|-------------|---------|
| app | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| db | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| redis | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Missing Infrastructure
- Redis detected in code but not in compose
- RabbitMQ connection string found but no service defined

### Recommendations
1. CRITICAL: Add non-root user to Dockerfile
2. CRITICAL: Create compose.production.yml with security hardening
3. HIGH: Add resource limits to all services
4. HIGH: Add log rotation to all services
5. MEDIUM: Add healthcheck to redis service
6. LOW: Update .dockerignore to exclude .env files
```

## Fix Options

```
AskUserQuestion: Audit found issues. What should we do?

Options:
1. Fix all — Apply all recommendations
2. Fix critical only — Fix security issues, skip improvements
3. Show details — Explain each issue before deciding
4. Export report — Save audit report to .ai-factory/docker-audit.md
```

**If fixing:**
- For Dockerfile issues → edit existing Dockerfile
- For missing compose.production.yml → generate it (Step 4.4)
- For missing services → add to existing compose
- For security hardening → add to compose.production.yml
- Preserve existing structure and naming conventions

## Enhance Mode — Create Production Config

**Only for `MODE = "enhance"`** (local Docker exists, no production config):

After auditing and fixing local compose, proceed to generate missing production files:

1. **Ask infrastructure questions** (same as Step 1.3) for any services not yet in compose:
   - Database type if not already present
   - Reverse proxy (Angie preferred) if needed for production
   - Additional services

2. **Generate missing files:**
   - `compose.production.yml` → hardened overlay (Step 4.4)
   - `.dockerignore` → if missing (Step 4.5)
   - `.env.example` → if missing (Step 6.3)
   - Deploy scripts → (Step 8)

3. **Improve existing files:**
   - Add `COMPOSE_PROJECT_NAME` to compose.yml if missing
   - Add healthchecks to services missing them
   - Add `depends_on` with `condition: service_healthy`
   - Ensure logging to stdout/stderr in Dockerfile
   - Preserve existing structure and naming conventions
