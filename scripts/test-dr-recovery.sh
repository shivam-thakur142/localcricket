#!/usr/bin/env bash
set -euo pipefail

echo "======================================================================"
echo "🧪 LocalCricket: Running Disaster Recovery & App Connectivity Smoke Test"
echo "======================================================================"

# Negative Case 1: Missing DATABASE_URL for backup must fail non-zero
echo "Checking Negative Case 1: Missing DATABASE_URL for backup..."
if (unset DATABASE_URL; bash scripts/backup-db.sh 2>/dev/null); then
  echo "ERROR: Missing DATABASE_URL for backup did not fail non-zero!" >&2
  exit 1
fi
echo "Verified: Missing DATABASE_URL fails non-zero."

# Negative Case 2: Missing backup file for restore must fail non-zero
echo "Checking Negative Case 2: Missing backup file for restore..."
if (DATABASE_URL="${RESTORE_DB_URL}" bash scripts/restore-db.sh /nonexistent/file.dump 2>/dev/null); then
  echo "ERROR: Missing backup file for restore did not fail non-zero!" >&2
  exit 1
fi
echo "Verified: Missing backup file fails non-zero."

# Negative Case 3: Missing DATABASE_URL for restore must fail non-zero
echo "Checking Negative Case 3: Missing DATABASE_URL for restore..."
if (unset DATABASE_URL; bash scripts/restore-db.sh /tmp/fake.dump 2>/dev/null); then
  echo "ERROR: Missing DATABASE_URL for restore did not fail non-zero!" >&2
  exit 1
fi
echo "Verified: Missing DATABASE_URL for restore fails non-zero."

# Step 1: Run migrations on Primary Database
echo "1. Applying migrations to Primary Database..."
DATABASE_URL="${PRIMARY_DB_URL}" node server/src/migrate.js

# Step 2: Seed representative production-like data (tournaments, teams, matches, scores)
echo "2. Inserting representative cricket domain data..."
DATABASE_URL="${PRIMARY_DB_URL}" node scripts/seed-dr-fixtures.js

# Step 3: Run backup script
echo "3. Running backup-db.sh..."
BACKUP_DIR="/tmp/dr_backups" DATABASE_URL="${PRIMARY_DB_URL}" bash scripts/backup-db.sh

LATEST_BACKUP=$(ls -t /tmp/dr_backups/localcricket_backup_*.dump | head -n 1)

# Step 4: Validate backup file properties
test -s "${LATEST_BACKUP}" || { echo "ERROR: Backup file missing or empty"; exit 1; }

# Step 5: Run restore script into clean, empty target database
echo "4. Running restore-db.sh into clean target database..."
DATABASE_URL="${RESTORE_DB_URL}" bash scripts/restore-db.sh "${LATEST_BACKUP}"

# Step 6: Validate restored database data integrity
echo "5. Verifying data integrity in restored database..."
DATABASE_URL="${RESTORE_DB_URL}" node scripts/verify-dr-restored-data.js

# Step 7: Re-run migration checksum validation against restored database
echo "6. Re-running migration checksum validator against restored database..."
DATABASE_URL="${RESTORE_DB_URL}" node server/src/migrate.js

# Step 8: Negative Case 4: Corrupt backup archive rejection
echo "7. Verifying Negative Case 4: Corrupt backup archive rejection..."
echo "CORRUPT_BYTES_HEADER" > /tmp/dr_backups/corrupt.dump
if DATABASE_URL="${RESTORE_DB_URL}" bash scripts/restore-db.sh /tmp/dr_backups/corrupt.dump 2>/dev/null; then
  echo "ERROR: Corrupt backup archive was not rejected!" >&2
  exit 1
fi
echo "Verified: Corrupt backup correctly rejected."

# Step 9: Start live application instance on restored database and verify connectivity
echo "8. Starting temporary LocalCricket application instance on restored database..."
DR_APP_PORT=5099
PORT=${DR_APP_PORT} \
NODE_ENV=production \
DATABASE_URL="${RESTORE_DB_URL}" \
JWT_SECRET="temporary_dr_test_jwt_secret_with_more_than_32_characters!" \
CORS_ORIGIN="https://localcricket.app" \
DB_SSL=false \
DB_SSL_REJECT_UNAUTHORIZED=false \
node server/src/server.js &
APP_PID=$!

# Trap to ensure cleanup of temporary application
cleanup_app() {
  if kill -0 "${APP_PID}" 2>/dev/null; then
    echo "Terminating temporary application process ${APP_PID}..."
    kill -TERM "${APP_PID}" || true
    wait "${APP_PID}" 2>/dev/null || true
  fi
}
trap cleanup_app EXIT

# Wait for application to bind to port (up to 15s)
echo "Waiting for application to bind on port ${DR_APP_PORT}..."
for i in {1..15}; do
  if wget -qO- "http://127.0.0.1:${DR_APP_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Verify /health (Liveness)
echo "9. Verifying /health returns HTTP 200..."
HEALTH_RESP=$(wget -qO- "http://127.0.0.1:${DR_APP_PORT}/health")
echo "${HEALTH_RESP}" | grep -q '"status":"ok"' || { echo "ERROR: /health status not ok"; exit 1; }

# Verify /ready (Readiness against restored DB)
echo "10. Verifying /ready returns HTTP 200..."
READY_RESP=$(wget -qO- "http://127.0.0.1:${DR_APP_PORT}/ready")
echo "${READY_RESP}" | grep -q '"status":"ready"' || { echo "ERROR: /ready status not ready"; exit 1; }

# Perform read-only API query verifying restored data accessibility
echo "11. Verifying read-only API query against restored data (GET /api/v1/tournaments)..."
TOURNAMENTS_RESP=$(wget -qO- "http://127.0.0.1:${DR_APP_PORT}/api/v1/tournaments")
echo "${TOURNAMENTS_RESP}" | grep -q '"success":true' || { echo "ERROR: API failed to return tournaments"; exit 1; }

# Clean termination of temporary application
echo "12. Terminating temporary application cleanly..."
cleanup_app
trap - EXIT

echo "======================================================================"
echo "🎉 Disaster Recovery & App Connectivity Smoke Test Passed (100% Verified) ✅"
echo "======================================================================"
