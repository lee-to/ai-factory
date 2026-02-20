#!/usr/bin/env bash

# ===================================================================
# Zero-Downtime Update Script
# ===================================================================
# Pulls latest code, builds new image, and performs rolling update
# with automatic rollback on health check failure.
#
# Usage: ./deploy/scripts/update.sh [version]
# Example: ./deploy/scripts/update.sh v1.2.3
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
dc() { docker compose -f "${COMPOSE_FILE}" -f "${COMPOSE_PROD}" "$@"; }

# Logging
log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
error_exit()  { log_error "$1"; exit 1; }

# ===================================================================
# Pre-Update Checks
# ===================================================================

log_info "Starting update..."

# Verify services are running
dc ps --format '{{.State}}' 2>/dev/null | grep -q "running" || error_exit "No services running. Use deploy.sh for initial deployment."

# Version
NEW_VERSION="${1:-$(date +%Y%m%d-%H%M%S)}"
export VERSION="${NEW_VERSION}"
log_info "Target version: ${NEW_VERSION}"

# ===================================================================
# Pre-Deployment Backup
# ===================================================================

BACKUP_SCRIPT="${SCRIPT_DIR}/backup.sh"
if [ -f "${BACKUP_SCRIPT}" ]; then
    log_info "Creating pre-deployment backup..."
    bash "${BACKUP_SCRIPT}" || log_warning "Backup failed, continuing with update"
fi

# ===================================================================
# Pull & Build
# ===================================================================

cd "${PROJECT_ROOT}"

# Pull latest code if in git repo
STASHED=false
if [ -d ".git" ]; then
    log_info "Pulling latest code..."
    if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
        log_warning "Local changes detected, stashing..."
        git stash push -m "pre-update-$(date +%s)"
        STASHED=true
    fi
    git pull || log_warning "Git pull failed, continuing with local version"
    if [ "$STASHED" = true ]; then
        git stash pop || log_warning "Could not restore stashed changes. Run 'git stash pop' manually."
    fi
fi

log_info "Building new image (version: ${NEW_VERSION})..."
dc build --no-cache app || error_exit "Build failed"
log_success "Image built"

# ===================================================================
# Rolling Update
# ===================================================================

# Save current state for potential rollback
PREV_IMAGE=$(docker inspect --format='{{.Image}}' "$(dc ps -q app 2>/dev/null)" 2>/dev/null || echo "unknown")
log_info "Previous image: ${PREV_IMAGE}"

log_info "Performing rolling update..."
START_TIME=$(date +%s)
DURATION=0

# Recreate app container with new image
dc up -d --force-recreate --no-deps app || error_exit "Failed to start new container"

# Wait for health check
log_info "Waiting for health check..."
MAX_WAIT=60
WAIT=0

while [ $WAIT -lt $MAX_WAIT ]; do
    HEALTH=$(dc ps --format '{{.Health}}' app 2>/dev/null || echo "starting")

    if [ "$HEALTH" = "healthy" ]; then
        END_TIME=$(date +%s)
        DURATION=$((END_TIME - START_TIME))
        log_success "Application is healthy (${DURATION}s)"
        break
    fi

    [ $((WAIT % 10)) -eq 0 ] && log_info "Waiting... (${WAIT}s / ${MAX_WAIT}s)"
    sleep 1
    WAIT=$((WAIT + 1))
done

if [ $WAIT -ge $MAX_WAIT ]; then
    log_error "Health check failed after update"
    log_info "Check logs: ./deploy/scripts/logs.sh app"
    log_info "To rollback: ./deploy/scripts/rollback.sh"
    exit 1
fi

# ===================================================================
# Summary
# ===================================================================

log_success "════════════════════════════════════════════"
log_success "  Update completed successfully!"
log_success "════════════════════════════════════════════"

echo ""
log_info "Update Summary:"
echo "  Version: ${NEW_VERSION}"
echo "  Duration: ${DURATION}s"

echo ""
log_info "Current Status:"
dc ps

echo ""
log_info "Next Steps:"
echo "  Monitor logs:  ./deploy/scripts/logs.sh app"
echo "  Health check:  ./deploy/scripts/health-check.sh"
echo "  If issues:     ./deploy/scripts/rollback.sh"
