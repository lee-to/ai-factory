# Summary Display Format

## Summary Template

```
## Docker Setup Complete

### Files Created/Updated
- Dockerfile (multi-stage: development + production)
- compose.yml (app + postgres + redis, COMPOSE_PROJECT_NAME from .env)
- compose.override.yml (dev: hot reload, debug ports, mailpit)
- compose.production.yml (hardened: read-only, non-root, resource limits, no infra ports)
- .dockerignore (38 exclusion rules)
- .env.example (with COMPOSE_PROJECT_NAME, DB credentials, app config)
- docker/angie/ (reverse proxy config, if needed)
- deploy/scripts/ (deploy, update, logs, health-check, rollback, backup)

### Quick Start
  # Development
  docker compose up

  # Development with email testing
  docker compose --profile dev up

  # Production (locally)
  docker compose -f compose.yml -f compose.production.yml up -d

  # Build production image
  docker build --target production -t myapp:latest .

### Services
| Service | Port (dev) | Port (prod) | Image |
|---------|------------|-------------|-------|
| app | 3000, 9229 | — | built locally |
| postgres | 5432 | — | postgres:17-alpine |
| redis | 6379 | — | redis:7-alpine |
| mailpit | 8025, 1025 | — | axllent/mailpit |
```

## Follow-Up Suggestions

```
AskUserQuestion: Docker setup complete. What's next?

Options:
1. Build automation — Run /aif-build-automation to add Docker targets to Makefile/Taskfile
2. Update docs — Run /aif-docs to document the Docker setup
3. Both — Build automation first, then docs
4. Done — Skip follow-ups
```

**If build automation** → suggest invoking `/aif-build-automation`
**If docs** → suggest invoking `/aif-docs`
**If both** → suggest build-automation first, then docs
