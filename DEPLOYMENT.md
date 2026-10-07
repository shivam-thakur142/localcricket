# LocalCricket Production Deployment & Operations Runbook

This runbook describes the architecture, deployment targets, configuration contracts, and disaster recovery procedures for **LocalCricket** in production.

## Free-tier launch (Render + Supabase)

The repository includes a Render Blueprint in `render.yaml`. It deploys the Docker app as one service, serving the React app and API on the same origin. PostgreSQL is hosted separately on Supabase.

1. Create a Supabase project and set a strong database password.
2. In Supabase, open **Connect**, select **Session pooler**, and copy its PostgreSQL connection string. Render's free service uses IPv4, so use the session pooler rather than the Supabase direct connection. Session mode preserves the database session features used by this app's migrations.
3. In Render, create a Blueprint from this GitHub repository and select `render.yaml`. When prompted, set `DATABASE_URL` to the Supabase session-pooler connection string. Keep the username, host, and port supplied by Supabase; URL-encode special characters in the password.
4. Wait for the first deploy and check `https://<your-render-service>.onrender.com/health` and `/ready`. The service runs database migrations automatically on startup.
5. In Render's Environment settings, update `CORS_ORIGIN` to the exact `https://<your-render-service>.onrender.com` origin if Render assigned a different hostname. Redeploy after changing it.
6. Provision the first Super Admin from Render's service shell with `npm run provision-admin`, then use that account to create tournaments and assign scorers.

This setup can stay within the providers' free tiers for light use, with service availability limits: Render free web services sleep after 15 minutes without traffic and wake on the next request; Supabase may pause a free project after seven days of low activity. Supabase free projects also do not include downloadable database backups, so export tournament data regularly before relying on it for official records. See [Render free services](https://render.com/docs/free), [Supabase connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres), and [Supabase production availability](https://supabase.com/docs/guides/deployment/going-into-prod).

---

## 1. Environment Configuration

All production configurations must be supplied via external environment variables or cloud secrets management (e.g. AWS Secrets Manager, Doppler, Railway Secrets, Render Environment Groups). **Never commit real credentials into version control.**

### 1.1 Required Environment Variables

| Variable | Type | Example / Format | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | String | `production` | Enables production security assertions and optimizations. |
| `PORT` | Integer | `5000` | HTTP port the Node.js application binds to. |
| `DATABASE_URL` | URI | `postgresql://user:pass@host:5432/dbname` | Full PostgreSQL 16 connection URI. |
| `DB_POOL_MAX` | Integer | `20` | Maximum simultaneous pooled clients. |
| `DB_SSL` | Boolean | `true` | **Mandatory `true` in production.** Enforces TLS transport. |
| `DB_SSL_REJECT_UNAUTHORIZED` | Boolean | `true` | **Mandatory `true` in production.** Enforces certificate validation. |
| `DB_SSL_CA` | String | PEM content or path | Custom Root CA certificate (required for private PKI or AWS RDS). |
| `JWT_SECRET` | String | $\ge 32$ random chars | HS256 secret key for signing 15-minute access JWTs. |
| `JWT_EXPIRY` | String | `15m` | Lifetime of in-memory access tokens. |
| `REFRESH_TOKEN_EXPIRY_DAYS`| Integer | `7` | Lifetime of opaque rotation-tracked refresh tokens. |
| `CORS_ORIGIN` | String | `https://localcricket.app` | Comma-separated list of authorized origins. Wildcard `*` prohibited. |
| `AUTO_MIGRATE` | Boolean | `true` | Runs pending database migrations with advisory locks on container boot. |
| `SHUTDOWN_TIMEOUT_MS` | Integer | `10000` | Milliseconds allowed for connection draining before forced shutdown. |

---

## 2. Production Deployment Targets

### Option A: Single-Host Docker Compose (Cloud VPS)
Recommended for simple, low-cost deployments on Ubuntu/Debian VPS (e.g. DigitalOcean, Hetzner, Linode):

1. **Clone repository on host:**
   ```bash
   git clone https://github.com/your-org/LocalCricket.git /opt/localcricket
   cd /opt/localcricket
   ```
2. **Create production environment file:**
   ```bash
   cp .env.example .env
   chmod 600 .env
   # Populate .env with strong, unique secrets (e.g. openssl rand -hex 32)
   ```
3. **Launch container stack:**
   ```bash
   docker compose up -d --build
   ```
4. **Provision initial Super Admin account:**
   ```bash
   docker compose exec app npm run provision-admin
   ```
5. **Verify deployment health:**
   ```bash
   curl -f http://localhost:5000/health
   curl -f http://localhost:5000/ready
   ```

---

### Option B: Platform-as-a-Service (Render / Railway / Fly.io)

1. **Deploy Managed PostgreSQL:**
   - Provision a PostgreSQL 16 database.
   - Note the connection string (`DATABASE_URL`).
2. **Deploy Application Container:**
   - Point service to repository root Dockerfile (`./Dockerfile`).
   - Configure environment variables in dashboard:
     - `NODE_ENV=production`
     - `PORT=5000`
     - `DATABASE_URL=<managed-database-url>`
     - `DB_SSL=true`
     - `DB_SSL_REJECT_UNAUTHORIZED=true`
     - `JWT_SECRET=<strong-random-secret>`
     - `CORS_ORIGIN=https://your-domain.com`
     - `AUTO_MIGRATE=true`
3. **Health Check Probes:**
   - Liveness Probe: `GET /health` (timeout 5s, interval 30s)
   - Readiness Probe: `GET /ready` (timeout 5s, interval 10s)
4. **Initial Provisioning:**
   - Open SSH/Web Console: `npm run provision-admin`

---

### Option C: Enterprise Cloud (AWS ECS Fargate + RDS PostgreSQL)

1. **RDS PostgreSQL:**
   - PostgreSQL 16 engine, Multi-AZ for high availability.
   - Security group allowing inbound port 5432 strictly from ECS task security group.
   - SSL/TLS enforced via parameter group `rds.force_ssl = 1`.
2. **ECS Fargate Task Definition:**
   - Multi-stage image stored in Amazon ECR.
   - CPU: 0.5 vCPU, Memory: 1024 MB.
   - Non-root execution: `USER node` (UID 1000).
   - Injected secrets from AWS Secrets Manager: `DATABASE_URL`, `JWT_SECRET`.
3. **Application Load Balancer (ALB):**
   - Target group health check path: `/ready` (returns 200 when ready, 503 during rolling deployment drain).

---

## 3. Database Migrations & Zero-Downtime Strategy

Migrations are executed via `server/src/migrate.js`.
- **Advisory Lock Safety:** Distributed replicas synchronize using PostgreSQL 64-bit advisory locks (`884729104820194821n`) with a 15-second bounded timeout, preventing duplicate or conflicting execution during zero-downtime rolling deploys.
- **SHA-256 Checksum Enforcement:** Checks previously executed migrations in `schema_migrations`. Any tampering or mismatch immediately halts deployment with exit code 1.
- **Execution Command:**
  ```bash
  npm run migrate
  ```

---

## 4. Disaster Recovery & Backup Runbook

### Operational Targets
- **Recovery Point Objective (RPO):** $\le 1\text{ hour}$ with automated hourly dump snapshots (or near-zero with RDS WAL archiving).
- **Recovery Time Objective (RTO):** $\le 15\text{ minutes}$ for automated container redeploy and database restore.

### 4.1 Creating a Database Backup
Backups are created using PostgreSQL custom archive format (`-Fc`):
```bash
DATABASE_URL="postgresql://user:pass@host:5432/dbname" BACKUP_DIR="/var/backups" bash scripts/backup-db.sh
```
- Validates that the backup archive is non-empty.
- Automatically prunes archives older than 30 days.

### 4.2 Restoring from Backup
```bash
DATABASE_URL="postgresql://user:pass@host:5432/dbname" bash scripts/restore-db.sh /var/backups/localcricket_backup_20261006_203000.dump
```
- Validates archive integrity with `pg_restore --list`.
- Restores database schema and rows.
- Re-runs `node server/src/migrate.js` to assert migration checksum verification.

---

## 5. Security Invariants & Incident Response

1. **Zero Secret Leakage:** Never print `JWT_SECRET` or `DATABASE_URL` in application logs, error payloads, or CI summaries.
2. **Account Lockouts:** In the event of brute-force login attempts, accounts lock automatically for 15 minutes. Super Admins can manually unlock via `POST /api/v1/admin/users/:userId/unlock`.
3. **Emergency Tournament Freeze:** If scoring fraud or match disputes arise, Super Admins can freeze the tournament immediately via `PATCH /api/v1/admin/tournaments/:id/freeze`. All live scoring mutations are blocked instantly with `423 Locked`.
4. **Graceful Shutdown:** On `SIGTERM`, server drains active requests within 10 seconds, notifies SSE streams, closes database pools, and exits cleanly.
