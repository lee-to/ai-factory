#!/usr/bin/env bash

# ===================================================================
# Production Deployment Script
# ===================================================================
# Initial deployment with pre-flight checks, service startup,
# and health verification.
#
# Usage: ./deploy/scripts/deploy.sh
# ===================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/compose.yml"
COMPOSE_PROD="${PROJECT_ROOT}/compose.production.yml"
ENV_FILE="${PROJECT_ROOT}/.env"

# Logging
log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
error_exit()  { log_error "$1"; exit 1; }

# ===================================================================
# Pre-flight Checks
# ===================================================================

log_info "Starting pre-flight checks..."

# Check Docker
command -v docker &>/dev/null || error_exit "Docker is not installed"
docker compose version &>/dev/null || error_exit "Docker Compose v2 is not installed"
docker info &>/dev/null || error_exit "Docker daemon is not running"

# Check files
[ -f "${COMPOSE_FILE}" ] || error_exit "compose.yml not found: ${COMPOSE_FILE}"
[ -f "${COMPOSE_PROD}" ] || error_exit "compose.production.yml not found: ${COMPOSE_PROD}"
[ -f "${ENV_FILE}" ] || error_exit ".env not found. Copy .env.example to .env and configure it."

# Load and verify environment
set -a
source "${ENV_FILE}" 2>/dev/null || error_exit "Failed to load .env file"
set +a

# Verify required variables (customize per project)
# REQUIRED_VARS=("DB_PASSWORD" "SECRET_KEY")
# for var in "${REQUIRED_VARS[@]}"; do
#     [ -z "${!var:-}" ] && error_exit "Required variable $var is not set in .env"
# done

## Check if ports are already in use
APP_PORT="${APP_PORT:-8080}"
if command -v lsof &>/dev/null; then
    lsof -iTCP:"${APP_PORT}" -sTCP:LISTEN &>/dev/null && error_exit "Port ${APP_PORT} is already in use"
elif command -v ss &>/dev/null; then
    ss -tlnp | grep -q ":${APP_PORT} " && error_exit "Port ${APP_PORT} is already in use"
fi

log_success "Pre-flight checks passed"

# ===================================================================
# Pull & Build
# ===================================================================

cd "${PROJECT_ROOT}"

VERSION="${VERSION:-$(git describe --tags --always --dirty 2>/dev/null || date +%Y%m%d-%H%M%S)}"
export VERSION

log_info "Building application image (version: ${VERSION})..."
docker compose -f "${COMPOSE_FILE}" -f "${COMPOSE_PROD}" build || error_exit "Build failed"
log_success "Image built successfully"

# ===================================================================
# Start Services
# ===================================================================

log_info "Starting infrastructure services..."
docker compose -f "${COMPOSE_FILE}" -f "${COMPOSE_PROD}" up -d db redis 2>/dev/null || true

# Wait for infrastructure to be healthy
log_info "Waiting for infrastructure to be ready..."
MAX_WAIT=60
WAIT=0

while [ $WAIT -lt $MAX_WAIT ]; do
    ALL_HEALTHY=true

    for svc in $(docker compose -f "${COMPOSE_FILE}" -f "${COMPOSE_PROD}" ps --format '{{.Service}}' 2>/dev/null); do
        HEALTH=$(docker compose -f "${COMPOSE_FILE}" -f "${COMPOSE_PROD}" ps --format '{{.Health}}' "${svc}" 2>/dev/null || echo "starting")
        if [ "$HEALTH" != "healthy" ] && [ "$HEALTH" != "" ]; then
            ALL_HEALTHY=false
        fi
    done

    if [ "$ALL_HEALTHY" = true ]; then
        log_success "Infrastructure is ready"
        break
    fi

    [ $((WAIT % 10)) -eq 0 ] && log_info "Waiting... (${WAIT}s / ${MAX_WAIT}s)"
    sleep 1
    WAIT=$((WAIT + 1))
done

[ $WAIT -ge $MAX_WAIT ] && error_exit "Infrastructure failed to become healthy within ${MAX_WAIT}s"

# Start application
log_info "Starting application..."
docker compose -f "${COMPOSE_FILE}" -f "${COMPOSE_PROD}" up -d || error_exit "Failed to start application"

# ===================================================================
# Health Verification
# ===================================================================

log_info "Verifying deployment health..."
MAX_WAIT=60
WAIT=0

while [ $WAIT -lt $MAX_WAIT ]; do
    HEALTH=$(docker compose -f "${COMPOSE_FILE}" -f "${COMPOSE_PROD}" ps --format '{{.Health}}' app 2>/dev/null || echo "starting")
    if [ "$HEALTH" = "healthy" ]; then
        log_success "Application is healthy"
        break
    fi
    [ $((WAIT % 10)) -eq 0 ] && log_info "Waiting for health check... (${WAIT}s / ${MAX_WAIT}s)"
    sleep 1
    WAIT=$((WAIT + 1))
done

if [ $WAIT -ge $MAX_WAIT ]; then
    log_error "Application failed health check"
    log_info "Recent logs:"
    docker compose -f "${COMPOSE_FILE}" -f "${COMPOSE_PROD}" logs --tail=30
    error_exit "Deployment failed"
fi

# ===================================================================
# Summary
# ===================================================================

log_success "════════════════════════════════════════════"
log_success "  Deployment completed successfully!"
log_success "════════════════════════════════════════════"

echo ""
log_info "Service Status:"
docker compose -f "${COMPOSE_FILE}" -f "${COMPOSE_PROD}" ps

echo ""
log_info "Useful Commands:"
echo "  View logs:      ./deploy/scripts/logs.sh"
echo "  Health check:   ./deploy/scripts/health-check.sh"
echo "  Update:         ./deploy/scripts/update.sh"
echo "  Rollback:       ./deploy/scripts/rollback.sh"
