# File Organization

## Root Directory — only files Docker expects by convention:
- `Dockerfile` — CI/CD, Docker Hub, GitHub Actions look for it in root
- `compose.yml`, `compose.override.yml`, `compose.production.yml` — `docker compose` looks in root
- `.dockerignore` — must be in build context root

## `docker/` Directory — all service configs and supporting files:
```
docker/
├── angie/                    # Reverse proxy (if used)
│   ├── angie.conf
│   └── conf.d/
│       └── default.conf
├── postgres/                 # DB init scripts (if needed)
│   └── init.sql
├── php/                      # PHP-FPM config (if PHP project)
│   ├── php.ini
│   └── php-fpm.conf
└── redis/                    # Custom Redis config (if needed)
    └── redis.conf
```

## `deploy/` Directory — production ops scripts:
```
deploy/
└── scripts/
    ├── deploy.sh
    ├── update.sh
    ├── logs.sh
    ├── health-check.sh
    ├── rollback.sh
    └── backup.sh
```

**Rule:** Only create directories that are needed. If no reverse proxy → no `docker/angie/`. If no custom DB init → no `docker/postgres/`.

## Generate Mode — Files Created

**Always created (root):**

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage (dev + prod) |
| `compose.yml` | Base configuration with `COMPOSE_PROJECT_NAME` |
| `compose.override.yml` | Development overrides |
| `compose.production.yml` | Production hardened |
| `.dockerignore` | Build context exclusions |

**Conditionally created (`docker/`):**

| Directory | When |
|-----------|------|
| `docker/angie/` | Reverse proxy selected (Angie/Nginx) |
| `docker/postgres/` | Custom init scripts needed |
| `docker/php/` | PHP project (php.ini, php-fpm.conf) |
| `docker/redis/` | Custom Redis config needed |

**Always created:**

| Directory | Purpose |
|-----------|---------|
| `deploy/scripts/` | Production ops scripts (Step 8) |

Update compose volumes to reference `docker/` paths:
```yaml
# Example: Angie config mount
volumes:
  - ./docker/angie/angie.conf:/etc/angie/angie.conf:ro
  - ./docker/angie/conf.d:/etc/angie/conf.d:ro
```

## Audit / Enhance Mode

Only write files that were changed or created. Don't overwrite files that passed audit. Respect existing file structure — if project already uses a different layout (e.g. `nginx/` instead of `docker/nginx/`), follow their convention.

## .env.example Generation

If `.env.example` doesn't exist, generate one. **Single file with sections** — no separate `.env.prod.example`. Production-only vars are commented out.

Build from: compose variables + detected app env vars from `.env.example`/code.

```env
# === Project ===
COMPOSE_PROJECT_NAME=myapp

# === Database ===
DB_NAME=mydb
DB_USER=app
DB_PASSWORD=changeme
POSTGRES_VERSION=17

# === Application ===
LOG_LEVEL=debug                          # prod: warn

# (add project-specific vars detected in Step 2.8)

# === Production (uncomment for deploy) ===
# DOCKER_REGISTRY=ghcr.io
# DOCKER_IMAGE=myapp
# VERSION=latest
# ALLOWED_ORIGINS=https://myapp.com
# TRUSTED_PROXIES=172.16.0.0/12
```

Also ensure `.env` is in `.gitignore`.
