# Production Docker Security Checklist

Use this checklist to audit `compose.production.yml` and Dockerfiles before deploying to production. Based on OWASP Docker Security Cheat Sheet and industry hardening guides.

---

## Dockerfile Security

### Image Selection
- [ ] Base image pinned to specific version (e.g., `node:22.5-alpine`, not `node:latest`)
- [ ] Minimal base image used (distroless, alpine, slim — not full Debian/Ubuntu)
- [ ] Base image from trusted registry (Docker Hub official, gcr.io/distroless, ECR public)
- [ ] No unnecessary packages installed in final stage
- [ ] Multi-stage build used — build tools NOT in production image

### Build Process
- [ ] `COPY` used instead of `ADD` (unless extracting archives)
- [ ] `.dockerignore` exists and excludes: `.git`, `node_modules`, `__pycache__`, `.env*`, `docker-compose*`, `Dockerfile*`, test files, docs
- [ ] No secrets in `ENV` or `ARG` instructions
- [ ] BuildKit secret mounts used for build-time credentials (`--mount=type=secret`)
- [ ] Layer count minimized (combined `RUN` commands)
- [ ] No `curl | bash` patterns (download + verify + install separately)

### Runtime User
- [ ] Non-root user created and used (`USER appuser`)
- [ ] User has minimal UID/GID (e.g., 1001:1001)
- [ ] Application files owned by the non-root user (`--chown=appuser:appuser`)
- [ ] No `sudo` installed in production image

### Exposed Surface
- [ ] Only necessary ports exposed via `EXPOSE`
- [ ] No SSH server installed
- [ ] No package manager in final stage (or `--no-install-recommends` used)
- [ ] `HEALTHCHECK` instruction present in Dockerfile

---

## Compose Security

### Container Isolation
- [ ] `read_only: true` — Root filesystem is read-only
- [ ] `tmpfs` configured for writable temp directories (`/tmp`, `/var/run`)
- [ ] `tmpfs` has `noexec,nosuid` flags and size limits
- [ ] `security_opt: [no-new-privileges:true]` — Prevents privilege escalation via setuid/setgid
- [ ] `cap_drop: [ALL]` — All Linux capabilities dropped
- [ ] Only absolutely necessary capabilities added back via `cap_add`
- [ ] `privileged: true` is NOT used on any service
- [ ] `user: "1001:1001"` specified (matches Dockerfile USER)

### Required Capabilities by Service

Some services need specific capabilities even with `cap_drop: ALL`:

| Service | Required `cap_add` |
|---------|-------------------|
| PostgreSQL | `DAC_READ_SEARCH`, `FOWNER`, `SETGID`, `SETUID` |
| MySQL | `DAC_OVERRIDE`, `SETGID`, `SETUID` |
| Redis | None (runs fine with all dropped) |
| Nginx | `NET_BIND_SERVICE` (if binding port < 1024) |
| Traefik | `NET_BIND_SERVICE` |
| App (general) | None or `NET_BIND_SERVICE` |

### Network Security
- [ ] No `network_mode: host` used
- [ ] Backend network has `internal: true` (databases can't reach internet)
- [ ] Frontend and backend networks are separate
- [ ] Database services only on backend network
- [ ] Docker socket NOT mounted (or `:ro` with justification for Traefik)

### Port Exposure (CRITICAL)
- [ ] **Production compose has NO `ports:` on infrastructure services** — DB, Redis, RabbitMQ etc. communicate via Docker network only, no host binding
- [ ] **Only the reverse proxy (or app if no proxy) exposes ports 80/443** to the host
- [ ] Debug ports (9229, 5005, 40000) are NOT in production compose
- [ ] Admin/monitoring ports are NOT exposed to `0.0.0.0` — if needed, bind to `127.0.0.1:PORT:PORT`
- [ ] No `ports:` in base `compose.yml` for infrastructure — move ALL port exposure to `compose.override.yml` (dev only)
- [ ] If a service MUST expose a port in production, bind to localhost: `127.0.0.1:5432:5432` (not `5432:5432`)

**Production port exposure should be minimal:**

| Service | Dev ports | Prod ports |
|---------|-----------|------------|
| App (behind proxy) | `3000:3000`, `9229:9229` | None (proxy handles) |
| App (no proxy) | `3000:3000`, `9229:9229` | `80:3000` only |
| Reverse proxy | `80:80` | `80:80`, `443:443` |
| PostgreSQL | `5432:5432` | None |
| Redis | `6379:6379` | None |
| RabbitMQ | `5672:5672`, `15672:15672` | None |

> **Common sense exceptions:** If you need to access the DB from the host for migrations or monitoring tools, use `127.0.0.1:5432:5432` — this binds only to localhost, not to all interfaces.

### Secrets Management
- [ ] Sensitive values (passwords, tokens, keys) stored in `.env` file, NOT hardcoded in compose files
- [ ] `.env` is in `.gitignore` — never committed to git
- [ ] `.env.example` exists with placeholder values (no real secrets)
- [ ] No secrets in Dockerfile `ENV` or `ARG` instructions
- [ ] No secrets in image layers (check with `docker history`)
- [ ] No secrets in `docker-compose.yml` directly (use `${VAR}` references to `.env`)

> **Note on `secrets:` directive:** Docker Compose `secrets:` is designed for Swarm mode where secrets are encrypted and distributed via TLS. In plain `docker compose up`, it's just a file mount to `/run/secrets/` — no additional security over `.env`. Use `.env` for simplicity. If you deploy via Swarm or need file-based secrets for compliance, then use `secrets:` directive.

### Resource Limits
- [ ] `deploy.resources.limits.memory` set on every service
- [ ] `deploy.resources.limits.cpus` set on every service
- [ ] `deploy.resources.limits.pids` set (prevents fork bombs)
- [ ] `ulimits` configured where appropriate (file descriptors)
- [ ] Resource reservations set for critical services (DB, cache)

### Health Checks (CRITICAL)
- [ ] **Every service** has a `healthcheck` defined — no exceptions
- [ ] Health checks test actual service readiness (not just process running):
  - App: HTTP request to `/health` endpoint (use `wget --spider` or `curl -f`)
  - PostgreSQL: `pg_isready -U $USER -d $DB`
  - MySQL: `mysqladmin ping -h localhost`
  - Redis: `redis-cli ping`
  - RabbitMQ: `rabbitmq-diagnostics -q ping`
  - Elasticsearch: `curl -f http://localhost:9200/_cluster/health`
- [ ] `start_period` set appropriately (databases need 30s+, app depends on startup time)
- [ ] `interval`, `timeout`, `retries` configured on every healthcheck
- [ ] `depends_on` uses `condition: service_healthy` (not just `service_started`)
- [ ] Health check uses `CMD` or `CMD-SHELL` (never `NONE` or `disable: true`)
- [ ] Dockerfile has `HEALTHCHECK` instruction (not just compose healthcheck)

### Logging (CRITICAL)
- [ ] **All applications log to stdout/stderr** — NEVER write logs to files inside container
  - Node.js: use `console.log/error` or structured logger (pino, winston) writing to stdout
  - Python: `logging.StreamHandler(sys.stdout)` or `uvicorn --log-config`
  - Go: `log.SetOutput(os.Stdout)` or structured logger (slog, zerolog)
  - PHP: `php-fpm` → set `catch_workers_output = yes`, `access.log = /proc/self/fd/2`
- [ ] **Log rotation configured on every service** in compose:
  ```yaml
  logging:
    driver: "json-file"
    options:
      max-size: "20m"
      max-file: "5"
  ```
- [ ] Use YAML anchors (`x-logging: &logging`) to avoid repeating logging config
- [ ] No sensitive data in log output (passwords, tokens, PII)
- [ ] Consider centralized logging for production (ELK, Loki/Grafana, Datadog)
- [ ] Log format is structured (JSON) for easier parsing in production

### Image Supply Chain
- [ ] Images pulled from trusted registries only
- [ ] Image versions pinned (no `:latest` in production)
- [ ] Images scanned for vulnerabilities (Trivy, Snyk, Docker Scout)
- [ ] Consider image signing and verification (cosign, Notary)
- [ ] Base images updated regularly for security patches

### Restart Policy
- [ ] `restart: unless-stopped` set on production services
- [ ] NOT `restart: always` (doesn't respect manual stops)
- [ ] Init containers / one-shot tasks have NO restart policy or `restart: "no"`

### Volumes
- [ ] Named volumes used for persistent data (not bind mounts)
- [ ] Volume data is backed up regularly
- [ ] Read-only mounts used where possible (`:ro` flag)
- [ ] No host path mounts in production (except for specific configs)

### Deploy Scripts
- [ ] `deploy/scripts/` directory exists with production ops scripts
- [ ] Scripts use `set -euo pipefail` for safe execution
- [ ] Deploy script performs pre-flight checks before starting
- [ ] Update script creates backup before applying changes
- [ ] Update script verifies health after rolling update
- [ ] Rollback script exists and can revert to a previous version
- [ ] Backup script has retention policy (delete old backups)
- [ ] All scripts reference `compose.production.yml` explicitly (not just `compose.yml`)
- [ ] Scripts use `COMPOSE_PROJECT_NAME` from `.env`

---

## Quick Audit Commands

```bash
# Check for running-as-root containers
docker compose ps --format json | jq '.[] | {Name, State}'
docker compose exec <service> whoami

# Check capabilities
docker inspect <container> --format '{{.HostConfig.CapDrop}} {{.HostConfig.CapAdd}}'

# Check read-only filesystem
docker inspect <container> --format '{{.HostConfig.ReadonlyRootfs}}'

# Check for secrets in env
docker inspect <container> --format '{{.Config.Env}}' | grep -iE 'password|secret|token|key'

# Check image for vulnerabilities
docker scout cves <image>
trivy image <image>

# Check image layers for leaked secrets
docker history --no-trunc <image>

# Check resource limits
docker stats --no-stream

# Check exposed ports
docker compose port <service> <port>
```

---

## Hardened Service Template

Use as a starting point for every production service:

```yaml
services:
  app:
    image: myregistry/myapp:1.5.2        # Pinned version
    read_only: true                        # Read-only filesystem
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    user: "1001:1001"
    tmpfs:
      - /tmp:noexec,nosuid,size=100m
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
          pids: 100
        reservations:
          cpus: "0.25"
          memory: 128M
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: "json-file"
      options:
        max-size: "20m"
        max-file: "5"
    restart: unless-stopped
    networks:
      - backend
    secrets:
      - db_password
```

---

## Over-Engineering Checklist

Security is important, but avoid adding complexity that the project doesn't need. Run this checklist AFTER the security audit to strip unnecessary bloat.

### Don't Add If Not Needed
- [ ] **No reverse proxy for single-service apps** — If there's only one app container with no SSL termination needs, skip Angie/Nginx. Let the app serve directly.
- [ ] **No Redis if no caching/sessions** — Don't add Redis "just in case". Add it when the code actually uses it.
- [ ] **No RabbitMQ for simple apps** — If there's no async job processing, don't add a message broker.
- [ ] **No Elasticsearch for basic search** — `LIKE`/`ILIKE` or `pg_trgm` may be enough.
- [ ] **No secrets: directive for local-only projects** — If the project only runs locally (no production), `environment:` is fine.
- [ ] **No multi-compose overlay for solo developers** — A single `compose.yml` is fine if there's one developer and no CI/CD.

### Signs of Over-Engineering
- [ ] More infrastructure services than the app actually imports/uses
- [ ] Resource limits set without knowing actual usage (profile first, then limit)
- [ ] Separate frontend/backend networks when there's only one app + one DB
- [ ] YAML anchors for config that appears only once
- [ ] Deploy scripts for a project that deploys via CI/CD pipeline
- [ ] Backup scripts for a project using managed database (RDS, Cloud SQL)
- [ ] Custom health endpoints when the framework provides built-in ones (Next.js, NestJS, FastAPI)

### Right-Sizing Rules
1. **Solo/hobby project** → `compose.yml` only, no production overlay, no deploy scripts
2. **Small team, single server** → `compose.yml` + `compose.production.yml` + deploy scripts
3. **Production with CI/CD** → Full setup but deploy scripts may be replaced by CI pipeline
4. **Kubernetes migration planned** → Keep compose minimal, don't invest in compose-specific tooling
