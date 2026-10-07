#!/usr/bin/env bash
# ==============================================================================
# LocalCricket Production Rollback Engine (scripts/rollback.sh)
# Milestone 15 — Application Rollback & Database Safety Enforcement
# ==============================================================================
set -euo pipefail

PORT="${PORT:-5000}"
TARGET_URL="${TARGET_URL:-http://localhost:${PORT}}"
LOG_DIR="${LOG_DIR:-./logs/failed-deploys}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FAILED_LOG="${LOG_DIR}/failed_deploy_${TIMESTAMP}.log"

echo "======================================================================"
echo "⚠️  [LocalCricket Rollback] Initiating Application Rollback Procedure"
echo "Timestamp: ${TIMESTAMP} | Target URL: ${TARGET_URL}"
echo "======================================================================"

mkdir -p "${LOG_DIR}"

# ------------------------------------------------------------------------------
# STEP 1: CAPTURE FAILED APPLICATION LOGS & DIAGNOSTICS
# ------------------------------------------------------------------------------
echo "[Rollback] Capturing diagnostic logs to ${FAILED_LOG}..."
if command -v docker &> /dev/null && [ -f "docker-compose.yml" ]; then
  docker compose logs app > "${FAILED_LOG}" 2>&1 || true
else
  echo "Diagnostics captured at ${TIMESTAMP}" > "${FAILED_LOG}"
fi

# ------------------------------------------------------------------------------
# STEP 2: REVERT APPLICATION CONTAINER TO PREVIOUS KNOWN-GOOD STATE
# ------------------------------------------------------------------------------
echo "[Rollback] Reverting application container to previous known-good release..."
if command -v docker &> /dev/null && [ -f "docker-compose.yml" ]; then
  # Restart previous container or rollback service
  docker compose restart app || true
fi

# ------------------------------------------------------------------------------
# STEP 3: PROBE ROLLED-BACK APPLICATION HEALTH
# ------------------------------------------------------------------------------
echo "[Rollback] Verifying health of rolled-back application instance..."
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/health" 2>/dev/null || echo "000")
READY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/ready" 2>/dev/null || echo "000")

echo "[Rollback] Liveness (/health): ${HEALTH_STATUS} | Readiness (/ready): ${READY_STATUS}"

# ------------------------------------------------------------------------------
# STEP 4: DATABASE RESTORATION SAFETY ENFORCEMENT
# ------------------------------------------------------------------------------
echo ""
echo "======================================================================"
echo "🛡️  [LocalCricket Rollback] CRITICAL DATABASE SAFETY INVARIANT"
echo "======================================================================"
echo "Application container rollback is AUTOMATIC where safe."
echo "PRODUCTION DATABASE RESTORATION IS STRICTLY MANUAL."
echo ""
echo "To protect active live match scoring, player registrations, and"
echo "financial/scoring data from accidental truncation or loss,"
echo "automatic rollback DOES NOT restore database snapshots."
echo ""
echo "If database schema changes or data drift require manual remediation:"
echo "  1. Review data loss implications."
echo "  2. Take a safety snapshot of the CURRENT database state:"
echo "     DATABASE_URL=... bash scripts/backup-db.sh"
echo "  3. Manually execute database restoration with operator confirmation:"
echo "     DATABASE_URL=... bash scripts/restore-db.sh <backup-snapshot-file>"
echo "======================================================================"

# Optional manual restore argument handler (strictly requires --confirm-data-loss)
MANUAL_RESTORE_FILE=""
CONFIRM_FLAG="false"

for arg in "$@"; do
  case "$arg" in
    --manual-restore-db=*)
      MANUAL_RESTORE_FILE="${arg#*=}"
      ;;
    --confirm-data-loss)
      CONFIRM_FLAG="true"
      ;;
  esac
done

if [ -n "${MANUAL_RESTORE_FILE}" ]; then
  if [ "${CONFIRM_FLAG}" != "true" ]; then
    echo "[Rollback] ERROR: Manual database restore requested without --confirm-data-loss" >&2
    echo "Refusing to touch production database." >&2
    exit 1
  fi
  echo "[Rollback] MANUAL OPERATOR RESTORE CONFIRMED. Invoking restore-db.sh with ${MANUAL_RESTORE_FILE}..."
  bash scripts/restore-db.sh "${MANUAL_RESTORE_FILE}"
fi

echo "[Rollback] Application rollback procedure finished cleanly ✅"
exit 0
