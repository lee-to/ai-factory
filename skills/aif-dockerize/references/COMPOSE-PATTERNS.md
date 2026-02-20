# Compose Environment & Service Configuration Patterns

## Environment Variable Strategy — `env_file` over `environment`

Use `env_file: .env` on `app` service. Do NOT list every app variable in `environment:`.

Only use `environment:` for:
1. **Computed values** that compose assembles from parts: `DATABASE_URL: postgres://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}`
2. **Infrastructure image config** on their own services: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` on `db` service

Everything else (API keys, feature flags, app settings) — the app reads from `.env` directly via `env_file:`.

```yaml
# CORRECT
services:
  app:
    env_file: .env
    environment:
      DATABASE_URL: postgres://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}

# WRONG — duplicating .env in compose, maintenance burden
services:
  app:
    environment:
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-}
      TOKEN_TTL_DAYS: ${TOKEN_TTL_DAYS:-7}
      # ...20 more lines of the same
```

**Service inclusion is conditional** — only add services that were detected in Step 2.5.
