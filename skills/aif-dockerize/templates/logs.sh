#!/usr/bin/env bash

# ===================================================================
# Log Aggregation Utility
# ===================================================================
# View and filter container logs across all services.
#
# Usage:
#   ./deploy/scripts/logs.sh              # All services, follow mode
#   ./deploy/scripts/logs.sh app          # App service only
#   ./deploy/scripts/logs.sh --tail=100   # Last 100 lines
#   ./deploy/scripts/logs.sh --since=1h   # Last hour
#   ./deploy/scripts/logs.sh --error      # Filter errors only
# ===================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/compose.yml"
COMPOSE_PROD="${PROJECT_ROOT}/compose.production.yml"
dc() { docker compose -f "${COMPOSE_FILE}" -f "${COMPOSE_PROD}" "$@"; }

# Defaults
SERVICE=""
TAIL="50"
FOLLOW="-f"
SINCE=""
FILTER=""

# Parse arguments
while [ $# -gt 0 ]; do
    case "$1" in
        --tail=*)     TAIL="${1#*=}"; FOLLOW=""; shift ;;
        --since=*)    SINCE="--since=${1#*=}"; shift ;;
        --error)      FILTER="error"; FOLLOW=""; shift ;;
        --warn)       FILTER="warn"; FOLLOW=""; shift ;;
        --no-follow)  FOLLOW=""; shift ;;
        -h|--help)
            cat << 'EOF'
Log Aggregation Utility

Usage: ./deploy/scripts/logs.sh [service] [options]

Services:
  app         Application logs
  db          Database logs
  redis       Redis cache logs
  (none)      All services

Options:
  --tail=N         Show last N lines (default: 50, disables follow)
  --since=TIME     Show logs since timestamp (e.g., 1h, 30m, 2024-01-01)
  --error          Filter error messages only
  --warn           Filter warning messages only
  --no-follow      Don't follow logs
  -h, --help       Show this help

Examples:
  ./deploy/scripts/logs.sh                   # All services, follow
  ./deploy/scripts/logs.sh app               # App logs, follow
  ./deploy/scripts/logs.sh app --tail=100    # Last 100 app lines
  ./deploy/scripts/logs.sh --since=1h        # All logs from last hour
  ./deploy/scripts/logs.sh --error           # All errors
  ./deploy/scripts/logs.sh app --error       # App errors only
EOF
            exit 0
            ;;
        *)  SERVICE="$1"; shift ;;
    esac
done

# Build and run command
CMD="dc logs --tail=${TAIL} ${SINCE} ${FOLLOW} ${SERVICE}"

if [ -n "$FILTER" ]; then
    echo "Filtering logs for: $FILTER"
    echo ""
    $CMD 2>/dev/null | grep -i "$FILTER" --color=always || echo "No ${FILTER} messages found"
else
    $CMD
fi
