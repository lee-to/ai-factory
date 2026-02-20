#!/usr/bin/env bash

# ===================================================================
# Database Backup Script
# ===================================================================
# Creates timestamped, compressed database backups with retention
# policy (7 daily, 4 weekly, 12 monthly).
#
# Usage: ./deploy/scripts/backup.sh
# ===================================================================

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/compose.yml"
COMPOSE_PROD="${PROJECT_ROOT}/compose.production.yml"
dc() { docker compose -f "${COMPOSE_FILE}" -f "${COMPOSE_PROD}" "$@"; }
BACKUP_DIR="${PROJECT_ROOT}/backups"

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
error_exit()  { log_error "$1"; exit 1; }

# Load env
[ -f "${PROJECT_ROOT}/.env" ] && source "${PROJECT_ROOT}/.env" 2>/dev/null

DB_USER="${DB_USER:-app}"
DB_NAME="${DB_NAME:-mydb}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}-${TIMESTAMP}.sql"

mkdir -p "${BACKUP_DIR}"

log_info "Backing up database: ${DB_NAME}"

# Check database service is running
dc ps --format '{{.State}}' db 2>/dev/null | grep -q "running" || error_exit "Database container is not running"

# Create backup
dc exec -T db pg_dump \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --clean --if-exists --create \
    > "${BACKUP_FILE}" || error_exit "Backup failed"

# Verify backup is non-empty
if [ ! -s "${BACKUP_FILE}" ]; then
    rm -f "${BACKUP_FILE}"
    error_exit "Backup file is empty — pg_dump may have failed silently"
fi

# Compress
gzip -f "${BACKUP_FILE}" || error_exit "Compression failed"
COMPRESSED="${BACKUP_FILE}.gz"
SIZE=$(du -h "${COMPRESSED}" | cut -f1)

log_success "Backup created: ${COMPRESSED} (${SIZE})"

# Retention: 7 daily, 4 weekly, 12 monthly
# - Keep all backups from last 7 days
# - Keep oldest backup per week for last 30 days
# - Keep oldest backup per month for last 365 days
# - Delete everything else
log_info "Applying retention policy..."
find "${BACKUP_DIR}" -name "*.sql.gz" -mtime +7 | sort | while read -r file; do
    FILENAME=$(basename "$file")
    # Extract date from filename (YYYYMMDD)
    FILEDATE=$(echo "$FILENAME" | grep -oE '[0-9]{8}' | head -1)
    [ -z "$FILEDATE" ] && continue

    DAY="${FILEDATE:6:2}"
    AGE_DAYS=$(( ( $(date +%s) - $(date -j -f "%Y%m%d" "$FILEDATE" +%s 2>/dev/null || date -d "${FILEDATE:0:4}-${FILEDATE:4:2}-${FILEDATE:6:2}" +%s 2>/dev/null || echo 0) ) / 86400 ))

    # Keep 1st-of-month backups for 365 days (monthly)
    if [ "$DAY" = "01" ] && [ "$AGE_DAYS" -le 365 ]; then
        continue
    fi

    # Keep Sunday backups for 30 days (weekly) — day-of-week: 0=Sunday
    DOW=$(date -j -f "%Y%m%d" "$FILEDATE" +%w 2>/dev/null || date -d "${FILEDATE:0:4}-${FILEDATE:4:2}-${FILEDATE:6:2}" +%w 2>/dev/null || echo "")
    if [ "$DOW" = "0" ] && [ "$AGE_DAYS" -le 30 ]; then
        continue
    fi

    rm -f "$file"
done
log_info "Retention policy applied (7 daily, 4 weekly, 12 monthly)"

# Summary
echo ""
log_info "Recent backups:"
ls -lh "${BACKUP_DIR}"/*.sql.gz 2>/dev/null | tail -5 || echo "  None"

log_success "Backup complete"
