#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[LocalCricket Restore] ERROR: DATABASE_URL environment variable is required" >&2
  exit 1
fi

if [ -z "${BACKUP_FILE}" ] || [ ! -f "${BACKUP_FILE}" ]; then
  echo "[LocalCricket Restore] ERROR: Valid backup file path required" >&2
  echo "Usage: $0 <path-to-backup.dump>" >&2
  exit 1
fi

echo "[LocalCricket Restore] Validating backup archive format..."
if ! pg_restore --list "${BACKUP_FILE}" > /dev/null 2>&1; then
  echo "[LocalCricket Restore] ERROR: Backup file is invalid or corrupt" >&2
  exit 1
fi

echo "[LocalCricket Restore] Restoring database schema and records..."
pg_restore --clean --if-exists --no-acl --no-owner -d "${DATABASE_URL}" "${BACKUP_FILE}"

echo "[LocalCricket Restore] Database restored successfully. Verifying migration checksums..."
node server/src/migrate.js
