# LocalCricket Production Launch & Operations Runbook

**Document:** `LAUNCH.md`  
**Milestone:** 15 — Production Deployment, Launch Verification & Operational Go-Live  
**Platform:** LocalCricket — Local Cricket Tournament Management & Live Scoring Platform  

---

## 1. Executive Summary & Launch Architecture

This runbook defines the operational protocol for deploying and maintaining **LocalCricket** in production. It specifies the T-minus go-live timeline, zero-downtime rolling deployment procedures, emergency rollback operations, edge streaming configuration, and incident response playbooks.

```
[ Internet / Browsers / Mobile PWAs ]
                 │
                 ▼ HTTPS (TLS 1.3, Port 443)
       ┌────────────────────────┐
       │   Nginx Reverse Proxy  │
       │  • Parameterized TLS   │
       │  • Unbuffered SSE      │
       │    (X-Accel-Buffering) │
       │  • Static Asset Cache  │
       └───────────┬────────────┘
                   │
                   ▼ HTTP (Internal Network)
       ┌────────────────────────┐
       │  LocalCricket Service  │
       │      (Port 5000)       │
       │  • Helmet (Strict CSP) │
       │  • Tiered Rate Limits  │
       │    (10/15m, 120/m,     │
       │     300/m)             │
       │  • Sole Scorer Engine  │
       │  • /health & /ready    │
       └───────────┬────────────┘
                   │
                   ▼ TLS / SSL (Mandatory)
       ┌────────────────────────┐
       │  Managed PostgreSQL 16 │
       │  • pg.Pool (5–20 conns)│
       │  • Advisory Locks      │
       │  • Checksum Migrations │
       └────────────────────────┘
```

---

## 2. Core Operational Invariants

1. **Zero Hardcoded Secrets:** All secrets (`DATABASE_URL`, `JWT_SECRET`, etc.) are injected via environment variables. Committed code and Dockerfiles contain zero plain-text credentials.
2. **Mandatory Production TLS:** Production startup asserts `DB_SSL=true` and `DB_SSL_REJECT_UNAUTHORIZED=true`.
3. **Expand/Migrate/Contract Migrations:** All schema changes must be backward-compatible with the currently running application during rolling deployments.
4. **Pre-Deployment Backup Safety:** Deployments generate an automated compressed database snapshot (`scripts/backup-db.sh`) before applying any migration or container change.
5. **Separation of Verification Concerns:**
   - **Production Launch Verification (`scripts/verify-production-smoke.js`)** is strictly **read-only / state-safe**. No test tournaments, matches, players, or ledger rows are created in the real production database.
   - **Full E2E Lifecycle Verifier (`scripts/verify-e2e-lifecycle.js`)** executes full destructive lifecycle tests **strictly against staging or isolated databases**.
6. **Rollback Invariant:**
   - Application container rollback is **automated** upon failed health checks.
   - **Production database restoration is strictly manual** and requires explicit operator confirmation and a pre-restore safety dump.

---

## 3. T-Minus Go-Live Timeline & Execution Gates

### 3.1 T-24 Hours: Pre-Launch Infrastructure Readiness
- [ ] **Disaster Recovery Drill:** Run `scripts/test-dr-recovery.sh` in staging to verify backup, restore, checksum verification, and application connectivity.
- [ ] **Secret Scan Audit:** Execute Gitleaks repository-wide scan to ensure zero exposed credentials.
- [ ] **TLS Certificate Verification:** Validate SSL/TLS certificate validity and expiration for target domains.
- [ ] **Database Capacity Planning:** Verify database instance memory, disk storage, and max connection ceiling (minimum 50 for database server).

### 3.2 T-2 Hours: Staging Deep E2E Certification
- [ ] **Automated Test Suite:** Execute complete test suite (`npm test`) — verify all 322+ tests pass at 100%.
- [ ] **Staging Lifecycle Verification:** Run `scripts/verify-e2e-lifecycle.js` against staging to validate tournament creation, advisory-locked scheduling, live scoring, NRR standings, playoffs, and offline replay contracts.
- [ ] **Operator Account Provisioning:** Provision production Super Admin via:
  ```bash
  npm run provision-admin -- --email "operator@localcricket.app" --name "Lead Operator"
  ```

### 3.3 T-0: Production Deployment Execution
1. **Execute Automated Deployment Runner:**
   ```bash
   NODE_ENV=production \
   DATABASE_URL="postgresql://user:pass@db:5432/localcricket" \
   JWT_SECRET="<random-32-char-minimum-entropy-secret>" \
   CORS_ORIGIN="https://localcricket.app" \
   DB_SSL=true \
   DB_SSL_REJECT_UNAUTHORIZED=true \
   bash scripts/deploy.sh
   ```
2. **Monitor Deployment Stages:**
   - Stage 1: Pre-flight parameter validation & database ping.
   - Stage 2: Automated pre-deployment database dump into `./backups/pre-deploy/`.
   - Stage 3: Transactional database migration execution under advisory lock `884729104820194821n`.
   - Stage 4: Container update and probe loop (`/health` and `/ready`).
3. **Execute Production-Safe Smoke Verification:**
   ```bash
   TARGET_URL="https://localcricket.app" \
   OPERATOR_EMAIL="operator@localcricket.app" \
   OPERATOR_PASSWORD="<operator-password>" \
   node scripts/verify-production-smoke.js
   ```
   *Verify all 11 production-safe smoke checks return 100% PASSED.*
4. **Announce Platform Go-Live:** Route DNS / load balancer to new deployment.

### 3.4 T+1 Hour: Post-Launch Telemetry & Monitoring
- [ ] Inspect `/ready` latency and database connection pool saturation.
- [ ] Monitor active SSE spectator connection counts.
- [ ] Check server logs for rate-limiting false positives.

---

## 4. Rate-Limiting Configuration & Invariants

LocalCricket enforces a three-tier rate-limiting hierarchy implemented in `server/src/middleware/securityMiddleware.js`:

| Tier | Endpoints | Limit & Window | Keying Strategy | Purpose |
| :--- | :--- | :---: | :---: | :--- |
| **Tier 1: Auth** | `/api/v1/auth/login`<br>`/api/v1/auth/register`<br>`/api/v1/auth/password` | **10 requests / 15 min** | IP Address | Prevents credential stuffing and brute-force password cracking. |
| **Tier 2: Scorer** | `/api/v1/scorer/matches/:id/deliveries`<br>`/api/v1/scorer/matches/:id/undo`<br>`/api/v1/scorer/matches/:id/start-innings` | **120 requests / 1 min** | Scorer User ID | High burst capacity ensures rapid ball scoring and M13 offline queue drainage are never throttled. |
| **Tier 3: Public** | `/api/v1/tournaments`<br>`/api/v1/matches/live`<br>`/api/v1/teams`, `/api/v1/players` | **300 requests / 1 min** | IP Address | Headroom allows concurrent spectator browsing while preventing automated web scraping. |

---

## 5. Reverse Proxy & Streaming Configuration

The Nginx reverse proxy template is located at `deploy/nginx.conf.template`.

### Generating Deployment Configuration:
```bash
export APP_DOMAIN="localcricket.app"
export SSL_CERT_PATH="/etc/letsencrypt/live/localcricket.app/fullchain.pem"
export SSL_KEY_PATH="/etc/letsencrypt/live/localcricket.app/privkey.pem"
export APP_UPSTREAM="app:5000"

envsubst '$APP_DOMAIN $SSL_CERT_PATH $SSL_KEY_PATH $APP_UPSTREAM' \
  < deploy/nginx.conf.template > deploy/nginx.conf
```

### Unbuffered Server-Sent Events (SSE) Directives:
```nginx
location ~* ^/api/v1/matches/([^/]+)/(live|stream)$ {
    proxy_pass http://${APP_UPSTREAM};
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_set_header X-Accel-Buffering "no";
}
```

---

## 6. Incident Response Playbooks

### Playbook 1: Failed Deployment Health Check (Automated Rollback)
1. **Trigger:** `scripts/deploy.sh` detects that `/ready` failed after 15 retries.
2. **Action:** `scripts/rollback.sh` is automatically invoked:
   - Reverts application container to previous release.
   - Diagnostic logs captured in `./logs/failed-deploys/`.
   - Probes `/health` and `/ready` on the rolled-back instance.
3. **Safety Notice:** Database is **NOT** automatically restored to protect live data.

### Playbook 2: Schema Migration Incompatibility (Manual Database Restore)
1. **Scenario:** A bad migration was applied and breaking errors are affecting traffic.
2. **Action Protocol:**
   - **Step A:** Assess data-loss implications and review schema diff.
   - **Step B:** Create a safety snapshot of the current live database:
     ```bash
     DATABASE_URL=... bash scripts/backup-db.sh
     ```
   - **Step C:** Manually execute database restoration with confirmation:
     ```bash
     DATABASE_URL=... bash scripts/rollback.sh \
       --manual-restore-db="./backups/pre-deploy/localcricket_backup_<timestamp>.dump" \
       --confirm-data-loss
     ```

### Playbook 3: Live Match Scoring Disruption / SSE Connection Storms
1. **Symptoms:** High HTTP latency, spectators not receiving ball updates.
2. **Diagnosis:**
   - Inspect database pool status via `/ready`.
   - Check PostgreSQL advisory locks via:
     ```sql
     SELECT * FROM pg_locks WHERE locktype = 'advisory';
     ```
3. **Mitigation:**
   - Restart unresponsive SSE worker replica.
   - Scale application replicas or increase `DB_POOL_MAX` up to 30.

### Playbook 4: Emergency Tournament Freeze Drill
1. **Trigger:** Match disputes, referee intervention, or fraudulent score entry.
2. **Action:** Super Admin triggers instant freeze via API or CLI:
   ```bash
   curl -X PATCH -H "Authorization: Bearer <super-admin-token>" \
     -H "Content-Type: application/json" \
     -d '{"reason": "Match dispute investigation", "notes": "Freeze authorized by lead umpire"}' \
     https://localcricket.app/api/v1/admin/tournaments/<tournament-id>/freeze
   ```
3. **Outcome:** All scoring mutation endpoints immediately reject requests with `423 TOURNAMENT_FROZEN`. Read-only live scores and spectator streams continue operating normally.
