#!/usr/bin/env bash

# ===================================================================
# Production Health Check Script
# ===================================================================
# Checks Docker container health status, HTTP endpoints, resource
# usage, and log health indicators.
#
# Usage:
#   ./deploy/scripts/health-check.sh              # Quick check
#   ./deploy/scripts/health-check.sh --detailed   # Full diagnostics
# ===================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/compose.yml"
COMPOSE_PROD="${PROJECT_ROOT}/compose.production.yml"
dc() { docker compose -f "${COMPOSE_FILE}" -f "${COMPOSE_PROD}" "$@"; }
ENV_FILE="${PROJECT_ROOT}/.env"

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
log_error()   { echo -e "${RED}[✗]${NC} $1"; }

# Load env
[ -f "${ENV_FILE}" ] && { set -a; source "${ENV_FILE}" 2>/dev/null; set +a; }

APP_PORT="${APP_PORT:-8080}"
DETAILED=false
[ "${1:-}" = "--detailed" ] && DETAILED=true

# ===================================================================
# Container Health
# ===================================================================

main() {
    echo ""
    log_info "════════════════════════════════════════════"
    log_info "  Production Health Check"
    log_info "════════════════════════════════════════════"
    echo ""

    ALL_HEALTHY=true

    # Check each service
    log_info "Container Status:"
    while IFS= read -r line; do
        SERVICE=$(echo "$line" | awk '{print $1}')
        STATE=$(echo "$line" | awk '{print $2}')
        HEALTH=$(echo "$line" | awk '{print $3}')

        if [ "$HEALTH" = "healthy" ] || [ "$HEALTH" = "(healthy)" ]; then
            log_success "${SERVICE}: running (healthy)"
        elif [ "$STATE" = "running" ]; then
            log_warn "${SERVICE}: running (no healthcheck)"
        else
            log_error "${SERVICE}: ${STATE}"
            ALL_HEALTHY=false
        fi
    done < <(dc ps --format '{{.Service}} {{.State}} {{.Health}}' 2>/dev/null)

    # Verify at least some services are running
    SERVICE_COUNT=$(dc ps -q 2>/dev/null | wc -l | tr -d ' ')
    if [ "$SERVICE_COUNT" -eq 0 ]; then
        log_error "No services are running!"
        ALL_HEALTHY=false
    fi
    echo ""

    # Check HTTP health endpoint
    log_info "HTTP Health Endpoints:"
    for endpoint in "health" "health/ready" "health/live"; do
        URL="http://localhost:${APP_PORT}/${endpoint}"
        if curl -f -s -m 5 "$URL" > /dev/null 2>&1; then
            log_success "${endpoint}"
            if [ "$DETAILED" = true ]; then
                curl -s -m 5 "$URL" 2>/dev/null | jq '.' 2>/dev/null || true
            fi
        else
            log_warn "${endpoint} — not accessible"
        fi
    done
    echo ""

    # Resource usage
    if [ "$DETAILED" = true ]; then
        log_info "Resource Usage:"
        docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.PIDs}}" \
            $(dc ps -q 2>/dev/null) 2>/dev/null || log_warn "Could not fetch resource stats"
        echo ""

        # Disk usage
        log_info "Disk Usage:"
        DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
        if [ "$DISK_USAGE" -gt 90 ]; then
            log_error "Disk usage critical: ${DISK_USAGE}%"
            ALL_HEALTHY=false
        elif [ "$DISK_USAGE" -gt 80 ]; then
            log_warn "Disk usage high: ${DISK_USAGE}%"
        else
            log_success "Disk usage: ${DISK_USAGE}%"
        fi

        log_info "Docker Disk Usage:"
        docker system df 2>/dev/null || true
        echo ""

        # Recent errors in logs
        log_info "Recent Errors (last 100 lines):"
        dc logs --tail=100 --no-color 2>/dev/null | grep -i "error\|fatal\|panic\|exception" --color=always | tail -5 || echo "  No recent errors found"
        echo ""
    fi

    # Verdict
    if [ "$ALL_HEALTHY" = true ]; then
        log_success "════════════════════════════════════════════"
        log_success "  All Health Checks PASSED"
        log_success "════════════════════════════════════════════"
        exit 0
    else
        log_error "════════════════════════════════════════════"
        log_error "  Some Health Checks FAILED"
        log_error "════════════════════════════════════════════"
        echo ""
        log_info "Troubleshooting:"
        echo "  View logs:    ./deploy/scripts/logs.sh"
        echo "  View errors:  ./deploy/scripts/logs.sh --error"
        exit 1
    fi
}

main "$@"
