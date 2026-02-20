# Docker & Docker Compose Best Practices

Comprehensive reference for generating production-grade Docker configurations.

---

## 1. Dockerfile Best Practices

### General Principles

1. **Copy lockfiles first, install deps, then copy source** — maximizes layer cache
2. **Use COPY, never ADD** (unless extracting tarballs)
3. **Combine RUN commands** with `&&` to reduce layers
4. **Run as non-root user** in the final stage
5. **Set explicit WORKDIR** — never rely on default `/`
6. **Pin base image versions** to `major.minor` (never `:latest`)
7. **Use BuildKit** — default since Docker 23.0

### Base Image Selection

| Base | Size | Shell | Package Manager | Best For |
|------|------|-------|-----------------|----------|
| `scratch` | 0 MB | No | No | Go static binaries |
| `distroless` | ~2-20 MB | No | No | Go, Java, Node.js |
| `alpine` | ~7 MB | Yes | apk | General purpose |
| `*-slim` | ~45 MB | Yes | apt | Python, Node.js, PHP |
| Full Debian | ~130 MB | Yes | apt | Build stages only |

### Multi-Stage Build Pattern

Every Dockerfile should have at minimum:

```dockerfile
# syntax=docker/dockerfile:1

# --- Dependencies ---
FROM <base> AS deps
WORKDIR /app
COPY lockfiles ./
RUN install dependencies (prod only)

# --- Builder ---
FROM <base> AS builder
WORKDIR /app
COPY lockfiles ./
RUN install all dependencies (including dev)
COPY . .
RUN build

# --- Development ---
FROM <base> AS development
WORKDIR /app
COPY --from=builder ...
EXPOSE <port> <debug-port>
CMD ["dev server with hot reload"]

# --- Production ---
FROM <minimal-base> AS production
WORKDIR /app
RUN create non-root user
COPY --from=deps --chown=appuser:appuser ...
COPY --from=builder --chown=appuser:appuser ...
USER appuser
EXPOSE <port>
CMD ["production entrypoint"]
```

### BuildKit Cache Mounts

Persist package caches between builds (10x speedup):

```dockerfile
# Go modules
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build ...

# npm
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# pip/uv
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen

# Composer
RUN --mount=type=cache,target=/root/.composer/cache \
    composer install
```

### BuildKit Secret Mounts

For build-time credentials (never persisted in layers):

```dockerfile
RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN=$(cat /run/secrets/npm_token) npm ci
```

```bash
docker build --secret id=npm_token,env=NPM_TOKEN .
```

### Non-Root User Pattern

```dockerfile
# Alpine
RUN addgroup -g 1001 -S appuser && \
    adduser -S -u 1001 -G appuser appuser

# Debian/Ubuntu
RUN groupadd -r -g 1001 appuser && \
    useradd -r -u 1001 -g appuser appuser

# Use in final stage
COPY --from=builder --chown=appuser:appuser /app /app
USER appuser
```

### Anti-Patterns

- **Never use `ADD` for copying files** — use `COPY`
- **Never install dev dependencies in production stage**
- **Never store secrets in ENV or ARG** — use BuildKit secret mounts
- **Never use `:latest` tags** — pin to `major.minor` minimum
- **Never run as root in production** — always `USER appuser`
- **Never skip .dockerignore** — `.git`, `node_modules`, `__pycache__` bloat images

---

## 2. Docker Compose Best Practices

### Compose File Structure

```yaml
# YAML anchors for reusable blocks
x-logging: &default-logging
  driver: "json-file"
  options:
    max-size: "20m"
    max-file: "5"

x-security: &default-security
  read_only: true
  security_opt:
    - no-new-privileges:true
  cap_drop:
    - ALL

services:
  ...

volumes:
  ...

networks:
  ...

secrets:
  ...
```

### Profiles

Selectively activate services by context:

```yaml
services:
  app:          # No profile = always starts
    ...
  mailpit:
    profiles: [dev]       # Only with --profile dev
  test-runner:
    profiles: [test]      # Only with --profile test
```

> **Note:** Don't add database admin UIs (pgAdmin, Adminer) to compose. Use native GUI clients (TablePlus, DBeaver, DataGrip) via the exposed DB port instead — less attack surface, fewer services to manage.

```bash
docker compose --profile dev up
docker compose --profile dev --profile debug up
COMPOSE_PROFILES=dev,debug docker compose up
```

### depends_on with Health Checks

Modern approach — no more `wait-for-it.sh`:

```yaml
services:
  app:
    depends_on:
      db:
        condition: service_healthy
        restart: true          # Restart app if db restarts
      migrations:
        condition: service_completed_successfully
```

Three conditions:
- `service_started` — container running (default)
- `service_healthy` — healthcheck passing
- `service_completed_successfully` — exited with code 0

### Health Check Patterns

```yaml
# PostgreSQL
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 30s

# MySQL
healthcheck:
  test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p$${MYSQL_ROOT_PASSWORD}"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 30s

# Redis
healthcheck:
  test: ["CMD", "redis-cli", "ping"]
  interval: 5s
  timeout: 3s
  retries: 3

# RabbitMQ
healthcheck:
  test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
  interval: 10s
  timeout: 10s
  retries: 5
  start_period: 30s

# Elasticsearch
healthcheck:
  test: ["CMD-SHELL", "curl -fs http://localhost:9200/_cluster/health?wait_for_status=yellow&timeout=5s || exit 1"]
  interval: 15s
  timeout: 10s
  retries: 5
  start_period: 60s

# HTTP service
healthcheck:
  test: ["CMD", "wget", "--spider", "-q", "http://localhost:8080/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s

# MinIO
healthcheck:
  test: ["CMD", "mc", "ready", "local"]
  interval: 10s
  timeout: 5s
  retries: 3

# Angie / Nginx (reverse proxy)
healthcheck:
  test: ["CMD-SHELL", "wget --spider -q http://localhost/health || exit 1"]
  interval: 10s
  timeout: 5s
  retries: 3

# Mailpit
healthcheck:
  test: ["CMD", "wget", "--spider", "-q", "http://localhost:8025/readyz"]
  interval: 15s
  timeout: 5s
  retries: 2
```

### Angie vs Nginx

**Prefer Angie** for new projects. Angie is a fully Nginx-compatible fork with:
- Dynamic upstream management without reload
- Built-in Prometheus metrics exporter (`/metrics`)
- Active development and regular releases
- Same configuration syntax as Nginx

```yaml
# Angie service
angie:
  image: docker.angie.software/angie:<version>-alpine
  volumes:
    - ./docker/angie/angie.conf:/etc/angie/angie.conf:ro
    - ./docker/angie/conf.d:/etc/angie/conf.d:ro
  ports:
    - "${HTTP_PORT:-80}:80"
    - "${HTTPS_PORT:-443}:443"
  depends_on:
    app:
      condition: service_healthy
  networks:
    - frontend
```

Reference: https://en.angie.software/angie/docs/configuration/

### Named Volumes vs Bind Mounts

- **Named volumes** → production (managed by Docker, easy backup)
- **Bind mounts** → development only (hot reload, source code editing)

```yaml
# Development (compose.override.yml)
volumes:
  - .:/app                    # Bind mount for hot reload
  - /app/node_modules         # Anonymous volume to protect node_modules

# Production (compose.yml)
volumes:
  - postgres_data:/var/lib/postgresql/data
```

### Network Isolation

```yaml
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true    # No external internet access

services:
  proxy:
    networks: [frontend]
  app:
    networks: [frontend, backend]
  db:
    networks: [backend]   # DB cannot reach internet
```

### Environment Management — `env_file` over `environment`

Use `env_file: .env` on the app service. Only use `environment:` for values that compose needs to compute or that configure infrastructure images.

```yaml
services:
  app:
    env_file: .env                        # App reads all its config from here
    environment:
      # ONLY computed values that compose assembles from parts
      DATABASE_URL: postgres://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}
      REDIS_URL: redis://redis:6379/0

  db:
    environment:
      # Infrastructure image config — these configure the postgres image itself
      POSTGRES_DB: ${DB_NAME:-mydb}
      POSTGRES_USER: ${DB_USER:-app}
      POSTGRES_PASSWORD: ${DB_PASSWORD:?DB_PASSWORD is required}
```

**When to use what:**

| Use case | Where |
|----------|-------|
| App config (API keys, feature flags, timeouts) | `env_file: .env` — app reads directly |
| Computed connection strings (DATABASE_URL) | `environment:` — compose assembles from parts |
| Infrastructure image config (POSTGRES_DB) | `environment:` on that service |

**Anti-pattern — do NOT do this:**
```yaml
# WRONG: duplicating every .env variable in compose
environment:
  OPENAI_API_KEY: ${OPENAI_API_KEY:-}
  ADMIN_PASSWORD: ${ADMIN_PASSWORD:-}
  TOKEN_TTL_DAYS: ${TOKEN_TTL_DAYS:-7}
  MAX_WORKERS: ${MAX_WORKERS:-5}
  # ...20 more lines of pointless pass-through
```

### .env Files

```env
# .env (gitignored, never committed) — real values
COMPOSE_PROJECT_NAME=myapp
DB_PASSWORD=real-secret-value
OPENAI_API_KEY=sk-...
```

```env
# .env.example (committed, with placeholders)
COMPOSE_PROJECT_NAME=myapp
DB_PASSWORD=changeme
OPENAI_API_KEY=
```

**Rules:**
- `.env` in `.gitignore` — never commit real secrets
- `.env.example` committed with safe placeholder values
- Use `${VAR:?error message}` for required values — Compose fails with a clear error if missing
- No secrets in Dockerfile `ENV`/`ARG` — they end up in image layers

> **Note:** Docker Compose `secrets:` directive exists but is designed for Swarm mode. In plain `docker compose up` it's just a file mount — no additional security over `.env`. Use `.env` for simplicity.

### Resource Limits

```yaml
deploy:
  resources:
    limits:
      cpus: "1.0"
      memory: 512M
      pids: 100            # Prevent fork bombs
    reservations:
      cpus: "0.25"
      memory: 128M
```

### Log Rotation

**Mandatory on every service** — unbounded logs fill disks:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "20m"
    max-file: "5"
```

Or use YAML anchor:

```yaml
x-logging: &default-logging
  driver: "json-file"
  options:
    max-size: "20m"
    max-file: "5"

services:
  app:
    logging: *default-logging
```

### Anti-Patterns

- **Never use `network_mode: host`** — breaks isolation
- **Never mount Docker socket** (`/var/run/docker.sock`) unless absolutely needed (and then `:ro`)
- **Never use `privileged: true`** — gives full host access
- **Never use `:latest` for production images** — pin exact versions
- **Never hardcode secrets in compose files** — use `${VAR}` references to `.env`
- **Never skip healthchecks** — `depends_on` without `condition: service_healthy` is useless
- **Never skip log rotation** — containers will fill disk
- **Never use `restart: always`** — use `unless-stopped` (respects manual stops)

---

## 3. Dev vs Production Patterns

### Override Files Strategy

```
compose.yml                 # Base configuration (shared)
compose.override.yml        # Dev overrides (auto-merged)
compose.production.yml      # Production overrides (explicit -f flag)
```

```bash
# Development (auto-merges override)
docker compose up

# Production
docker compose -f compose.yml -f compose.production.yml up -d
```

### What Changes Between Dev and Prod

| Aspect | Development | Production |
|--------|-------------|------------|
| Build target | `development` | `production` |
| Source code | Bind mount (hot reload) | Baked into image |
| Debug ports | Exposed (9229, 5005, etc.) | Not exposed |
| Env vars | `NODE_ENV=development` | `NODE_ENV=production` |
| Log level | `debug` | `warn` or `error` |
| Dev tools | mailpit | Not included |
| DB port | Exposed for local tools | Not exposed |
| Security | Relaxed | Hardened (read_only, cap_drop, etc.) |
| Restart | Not set | `unless-stopped` |
| Resources | Not limited | CPU/memory limits set |
| Volumes | Bind mounts | Named volumes |
| Images | Built locally | Pulled from registry |

### Dockerfile Stage Targeting

```yaml
# compose.override.yml (dev)
services:
  app:
    build:
      target: development
    volumes:
      - .:/app
    ports:
      - "3000:3000"
      - "9229:9229"    # Debug

# compose.production.yml (prod)
services:
  app:
    image: myregistry/myapp:1.5.2   # Pre-built, no build: section
```

---

## 4. Infrastructure Services Reference

### Resource Recommendations

| Service | CPU Limit | Memory Limit | Memory Reservation |
|---------|-----------|--------------|-------------------|
| PostgreSQL | 2.0 | 1G | 256M |
| MySQL | 2.0 | 1G | 256M |
| Redis | 0.5 | 512M | 64M |
| RabbitMQ | 1.0 | 512M | 128M |
| Elasticsearch | 2.0 | 2G | 1G |
| MinIO | 1.0 | 512M | 128M |
| Angie/Nginx | 0.5 | 256M | 64M |
| Traefik | 0.5 | 256M | 64M |
| Mailpit | 0.25 | 128M | 32M |

### Default Ports

| Service | Main Port | Admin/UI Port |
|---------|-----------|---------------|
| PostgreSQL | 5432 | — |
| MySQL | 3306 | — |
| Redis | 6379 | — |
| RabbitMQ | 5672 | 15672 |
| Elasticsearch | 9200 | 9300 |
| MinIO | 9000 | 9001 |
| Mailpit | 1025 (SMTP) | 8025 (Web) |
| Angie/Nginx | 80, 443 | — |
| Traefik | 80, 443 | 8080 |
