#!/usr/bin/env bash
# ==============================================================================
# LocalCricket Production Deployment Runner (scripts/deploy.sh)
# Milestone 15 — Zero-Downtime Deployment Automation
# ==============================================================================
set -euo pipefail

NODE_ENV="${NODE_ENV:-production}"
PORT="${PORT:-5000}"
DATABASE_URL="${DATABASE_URL:-}"
JWT_SECRET="${JWT_SECRET:-}"
CORS_ORIGIN="${CORS_ORIGIN:-}"
DB_SSL="${DB_SSL:-}"
DB_SSL_REJECT_UNAUTHORIZED="${DB_SSL_REJECT_UNAUTHORIZED:-}"
TARGET_URL="${TARGET_URL:-http://localhost:${PORT}}"
SKIP_CONTAINER_RESTART="${SKIP_CONTAINER_RESTART:-false}"
SKIP_PRE_BACKUP="${SKIP_PRE_BACKUP:-false}"
MAX_HEALTH_RETRIES="${MAX_HEALTH_RETRIES:-15}"
HEALTH_RETRY_INTERVAL="${HEALTH_RETRY_INTERVAL:-2}"

echo "======================================================================"
echo "🏏 [LocalCricket Deploy] Commencing Production Deployment Pipeline"
echo "Target Environment: ${NODE_ENV} | Port: ${PORT} | Target URL: ${TARGET_URL}"
echo "======================================================================"

# ------------------------------------------------------------------------------
# PHASE 1: PRE-FLIGHT VALIDATION GATE
# ------------------------------------------------------------------------------
echo "--- Phase 1: Pre-Flight Parameter & Security Assertions ---"

if [ -z "${DATABASE_URL}" ]; then
  echo "[Deploy] FATAL: DATABASE_URL is required for deployment." >&2
  exit 1
fi

if [ -z "${JWT_SECRET}" ] || [ "${#JWT_SECRET}" -lt 32 ]; then
  echo "[Deploy] FATAL: JWT_SECRET is required and must be at least 32 characters." >&2
  exit 1
fi

if [ "${NODE_ENV}" = "production" ]; then
  if [ "${DB_SSL}" != "true" ]; then
    echo "[Deploy] FATAL: Production deployments require DB_SSL=true." >&2
    exit 1
  fi
  if [ "${DB_SSL_REJECT_UNAUTHORIZED}" != "true" ]; then
    echo "[Deploy] FATAL: Production deployments require DB_SSL_REJECT_UNAUTHORIZED=true." >&2
    exit 1
  fi
  if [ -z "${CORS_ORIGIN}" ] || [[ "${CORS_ORIGIN}" == *"*"* ]]; then
    echo "[Deploy] FATAL: Production deployments require explicit CORS_ORIGIN without wildcards." >&2
    exit 1
  fi
fi

# Pre-flight Database Reachability Test
echo "[Deploy] Checking database reachability..."
node -e '
  const { Client } = require("pg");
  const isProd = process.env.NODE_ENV === "production";
  const ssl = isProd ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true" } : false;
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl });
  client.connect()
    .then(() => client.query("SELECT 1;"))
    .then(() => { client.end(); process.exit(0); })
    .catch((err) => {
      console.error("[Deploy] Database ping failed:", err.message);
      process.exit(1);
    });
' || {
  echo "[Deploy] FATAL: Pre-flight database reachability check failed." >&2
  exit 1
}
echo "[Deploy] Pre-flight assertions passed ✅"

# ------------------------------------------------------------------------------
# PHASE 2: PRE-DEPLOYMENT BACKUP SNAPSHOT
# ------------------------------------------------------------------------------
echo "--- Phase 2: Pre-Deployment Database Snapshot ---"
if [ "${SKIP_PRE_BACKUP}" = "true" ]; then
  echo "[Deploy] Skipping pre-deployment backup (SKIP_PRE_BACKUP=true)"
else
  export BACKUP_DIR="${BACKUP_DIR:-./backups/pre-deploy}"
  mkdir -p "${BACKUP_DIR}"
  echo "[Deploy] Generating pre-deployment database backup in ${BACKUP_DIR}..."
  bash scripts/backup-db.sh || {
    echo "[Deploy] FATAL: Pre-deployment database backup failed. Aborting deployment." >&2
    exit 1
  }
  echo "[Deploy] Pre-deployment backup generated successfully ✅"
fi

# ------------------------------------------------------------------------------
# PHASE 3: TRANSACTIONAL DATABASE MIGRATION GATE
# ------------------------------------------------------------------------------
echo "--- Phase 3: Transactional Database Migrations (Advisory Locked) ---"
node server/src/migrate.js || {
  echo "[Deploy] FATAL: Database migrations failed. Aborting deployment and triggering rollback..." >&2
  bash scripts/rollback.sh
  exit 1
}
echo "[Deploy] Database migrations verified & applied ✅"

# ------------------------------------------------------------------------------
# PHASE 4: CONTAINER UPDATE & SERVICE HEALTH PROBING
# ------------------------------------------------------------------------------
echo "--- Phase 4: Application Health & Readiness Probe Verification ---"
if [ "${SKIP_CONTAINER_RESTART}" != "true" ]; then
  if command -v docker &> /dev/null && [ -f "docker-compose.yml" ]; then
    echo "[Deploy] Restarting application service via Docker Compose..."
    docker compose up -d --no-deps --build app || true
  fi
fi

echo "[Deploy] Polling application probes at ${TARGET_URL}..."
HEALTHY=false
for i in $(seq 1 "${MAX_HEALTH_RETRIES}"); do
  echo "[Deploy] Probe attempt ${i}/${MAX_HEALTH_RETRIES}..."
  
  HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/health" 2>/dev/null || echo "000")
  READY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/ready" 2>/dev/null || echo "000")

  if [ "${HEALTH_STATUS}" = "200" ] && [ "${READY_STATUS}" = "200" ]; then
    HEALTHY=true
    echo "[Deploy] Liveness (/health): 200 OK | Readiness (/ready): 200 OK ✅"
    break
  fi

  sleep "${HEALTH_RETRY_INTERVAL}"
done

if [ "${HEALTHY}" != "true" ]; then
  echo "[Deploy] ERROR: Application readiness probes timed out or failed." >&2
  echo "[Deploy] Triggering automated application rollback..." >&2
  bash scripts/rollback.sh
  exit 1
fi

# ------------------------------------------------------------------------------
# PHASE 5: DEPLOYMENT SUCCESS & CUTOVER
# ------------------------------------------------------------------------------
echo "======================================================================"
echo "🎉 [LocalCricket Deploy] Deployment Successful & Verified!"
echo "Production application is LIVE and healthy on ${TARGET_URL}"
echo "Next step: Run 'npm run verify:smoke' to execute production-safe smoke audit."
echo "======================================================================"
exit 0
