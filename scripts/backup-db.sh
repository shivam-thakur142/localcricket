#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/localcricket_backup_${TIMESTAMP}.dump"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[LocalCricket Backup] ERROR: DATABASE_URL environment variable is required" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

echo "[LocalCricket Backup] Initiating PostgreSQL backup at ${TIMESTAMP}..."
pg_dump -Fc --no-acl --no-owner "${DATABASE_URL}" > "${BACKUP_FILE}"

# Verify backup file is non-empty
if [ ! -s "${BACKUP_FILE}" ]; then
  echo "[LocalCricket Backup] ERROR: Generated backup file is empty!" >&2
  rm -f "${BACKUP_FILE}"
  exit 1
fi

echo "[LocalCricket Backup] Successfully generated: ${BACKUP_FILE} ($(du -h "${BACKUP_FILE}" | cut -f1))"

# Retention: Prune backups older than 30 days
find "${BACKUP_DIR}" -name "localcricket_backup_*.dump" -mtime +30 -delete 2>/dev/null || true
