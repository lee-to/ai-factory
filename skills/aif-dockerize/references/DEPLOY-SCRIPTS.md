# Deploy Scripts Guide

## Script Templates

Read and customize each template based on `PROJECT_PROFILE`:

```
Read skills/dockerize/templates/deploy.sh
Read skills/dockerize/templates/update.sh
Read skills/dockerize/templates/logs.sh
Read skills/dockerize/templates/health-check.sh
Read skills/dockerize/templates/rollback.sh
Read skills/dockerize/templates/backup.sh
```

## Script Purposes

| Script | Purpose | Customization |
|--------|---------|---------------|
| `deploy/scripts/deploy.sh` | Initial production deployment | Pre-flight checks, build, start, health verify |
| `deploy/scripts/update.sh` | Zero-downtime rolling update | Pre-backup, pull, build, recreate app, health check |
| `deploy/scripts/logs.sh` | Log aggregation utility | Service names from compose |
| `deploy/scripts/health-check.sh` | Full health diagnostics | App port, health endpoints |
| `deploy/scripts/rollback.sh` | Version rollback | Git-based version detection |
| `deploy/scripts/backup.sh` | Database backup with retention | DB_USER, DB_NAME from .env |

## Customization Points for All Scripts

- `COMPOSE_FILE` / `COMPOSE_PROD` paths (relative from `deploy/scripts/`)
- App port from `PROJECT_PROFILE.port`
- DB user/name from `.env.example`
- Service names from generated `compose.yml`
- Health check endpoint URL

## Script Requirements

**All scripts must:**
- Use `set -euo pipefail`
- Have colored logging (`log_info`, `log_success`, `log_error`)
- Calculate `PROJECT_ROOT` relative to script location
- Use `docker compose -f compose.yml -f compose.production.yml` pattern
- Include usage comments in header

## Write Scripts

```
Write deploy/scripts/deploy.sh
Write deploy/scripts/update.sh
Write deploy/scripts/logs.sh
Write deploy/scripts/health-check.sh
Write deploy/scripts/rollback.sh
Write deploy/scripts/backup.sh
Bash: chmod +x deploy/scripts/*.sh
```

## Skip Condition

If `MODE = "audit"` and deploy scripts already exist:
- Check existing scripts against templates for missing functionality
- Suggest improvements but don't overwrite
