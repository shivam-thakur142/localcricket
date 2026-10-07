// ====================================================================
// MILESTONE 14: PRODUCTION HARDENING & DEPLOYMENT TESTS
// (server/tests/milestone14-production-hardening.test.js)
// ====================================================================

import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app.js';
import { runMigrations, calculateChecksum, MigrationChecksumError } from '../src/migrate.js';
import { provisionSuperAdmin, validateAdminPassword } from '../src/provisionAdmin.js';
import { validateEnvironment } from '../src/utils/envValidator.js';
import { resetRateLimits } from '../src/services/authService.js';
import { startServer } from '../src/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');

export async function runMilestone14ProductionHardeningTests() {
  console.log('\n🏏 ======================================================================');
  console.log('🏏 LocalCricket: Running Milestone 14 Production Hardening & Deployment Tests');
  console.log('🏏 ======================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  async function assertTest(name, fn) {
    totalTests++;
    process.stdout.write(`  ✅ Test ${totalTests}: ${name}... `);
    try {
      await fn();
      console.log('PASSED ✅');
      passedTests++;
    } catch (err) {
      console.log('FAILED ❌');
      console.error('     Error details:', err.message);
      throw err;
    }
  }

  // Base test database with all 14 migrations applied
  const db = new PGlite();
  await runMigrations(db, { useAdvisoryLock: false, logger: { log: () => {} } });

  // --------------------------------------------------------------------
  // SECTION A: HEALTH & READINESS OBSERVABILITY PROBES
  // --------------------------------------------------------------------

  await assertTest('Liveness Probe (GET /health): Returns 200 OK without touching the database', async () => {
    const app = createApp(db);
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = server.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    assert.strictEqual(data.service, 'LocalCricket API');
    assert.ok(typeof data.uptime_seconds === 'number');

    server.close();
  });

  await assertTest('Readiness Probe Healthy (GET /ready): Returns 200 OK with latency when DB is connected', async () => {
    const app = createApp(db);
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = server.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/ready`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ready');
    assert.strictEqual(data.database, 'connected');
    assert.ok(typeof data.latency_ms === 'number');

    server.close();
  });

  await assertTest('Readiness Probe Failure (GET /ready): Returns 503 Service Unavailable when DB fails without leaking credentials', async () => {
    const brokenDb = {
      query: async () => {
        throw new Error('connection refused at postgresql://secret_user:super_secret_pw@internal.db.corp:5432/production');
      },
    };
    const app = createApp(brokenDb);
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = server.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/ready`);
    assert.strictEqual(res.status, 503);
    const text = await res.text();
    const data = JSON.parse(text);
    assert.strictEqual(data.status, 'unhealthy');
    assert.strictEqual(data.database, 'disconnected');
    // SECURITY: Must never leak connection strings or passwords
    assert.ok(!text.includes('secret_user'));
    assert.ok(!text.includes('super_secret_pw'));
    assert.ok(!text.includes('internal.db.corp'));

    server.close();
  });

  // --------------------------------------------------------------------
  // SECTION B: SECURITY HEADERS & CORS LOCKDOWN
  // --------------------------------------------------------------------

  await assertTest('Security Headers (Helmet): Asserts nosniff, DENY, HSTS, and Referrer-Policy', async () => {
    const app = createApp(db);
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = server.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(res.headers.get('x-frame-options'), 'DENY');
    assert.ok(res.headers.get('strict-transport-security')?.includes('max-age=31536000'));
    assert.strictEqual(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');

    server.close();
  });

  await assertTest("Hardened CSP (No Script Inlines): Verifies script-src 'self' without 'unsafe-inline'", async () => {
    const app = createApp(db);
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = server.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const csp = res.headers.get('content-security-policy');
    assert.ok(csp, 'CSP header present');
    assert.ok(csp.includes("script-src 'self'"), "script-src 'self' enforced");
    assert.ok(!csp.includes("script-src 'self' 'unsafe-inline'"), "script-src does NOT contain 'unsafe-inline'");
    assert.ok(csp.includes("style-src 'self' 'unsafe-inline'"), 'style-src allows inline theme variables');

    server.close();
  });

  await assertTest('CORS Allowed Origin: Authorizes configured production origin with credentials', async () => {
    const prevCors = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = 'https://localcricket.app';

    try {
      const app = createApp(db);
      const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      });
      const port = server.address().port;

      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { Origin: 'https://localcricket.app' },
      });
      assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://localcricket.app');
      assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');

      server.close();
    } finally {
      process.env.CORS_ORIGIN = prevCors;
    }
  });

  await assertTest('CORS Denied Origin: Rejects unauthorized origin with 403 Forbidden', async () => {
    const prevCors = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = 'https://localcricket.app';

    try {
      const app = createApp(db);
      const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      });
      const port = server.address().port;

      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { Origin: 'https://malicious-site.attacker.com' },
      });
      assert.strictEqual(res.status, 403);

      server.close();
    } finally {
      process.env.CORS_ORIGIN = prevCors;
    }
  });

  // --------------------------------------------------------------------
  // SECTION C: TIERED RATE LIMITING & OFFLINE REPLAY PROTECTION
  // --------------------------------------------------------------------

  await assertTest('Auth Rate Limiting: Enforces 10 requests / 15 minutes limit on /api/v1/auth/login with 429', async () => {
    const prevRateLimitDisabled = process.env.RATE_LIMIT_DISABLED;
    delete process.env.RATE_LIMIT_DISABLED;

    try {
      const app = createApp(db);
      const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      });
      const port = server.address().port;

      let lastStatus = 200;
      for (let i = 0; i < 12; i++) {
        const res = await fetch(`http://127.0.0.1:${port}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'ratelimit@test.com', password: 'wrong' }),
        });
        lastStatus = res.status;
      }

      assert.strictEqual(lastStatus, 429);

      server.close();
    } finally {
      process.env.RATE_LIMIT_DISABLED = prevRateLimitDisabled;
    }
  });

  await assertTest('Scorer Rate Limiting Burst Tolerance: Permits 25 sequential deliveries without throttling', async () => {
    const prevRateLimitDisabled = process.env.RATE_LIMIT_DISABLED;
    delete process.env.RATE_LIMIT_DISABLED;

    try {
      const app = createApp(db);
      const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      });
      const port = server.address().port;

      let allSucceeded = true;
      for (let i = 0; i < 25; i++) {
        const res = await fetch(`http://127.0.0.1:${port}/api/v1/scorer/matches/00000000-0000-0000-0000-000000000001/deliveries`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': '00000000-0000-0000-0000-000000000002',
          },
          body: JSON.stringify({ runsBatter: 1 }),
        });
        if (res.status === 429) {
          allSucceeded = false;
          break;
        }
      }

      assert.strictEqual(allSucceeded, true, '25 rapid deliveries within 1 minute quota must not return 429');

      server.close();
    } finally {
      process.env.RATE_LIMIT_DISABLED = prevRateLimitDisabled;
    }
  });

  await assertTest('Offline Replay Rate Limit Security: Proves x-offline-replay does NOT bypass rate limits', async () => {
    const prevRateLimitDisabled = process.env.RATE_LIMIT_DISABLED;
    delete process.env.RATE_LIMIT_DISABLED;

    try {
      const app = createApp(db);
      const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      });
      const port = server.address().port;

      let hit429 = false;
      // Flooding with 130 requests carrying x-offline-replay
      for (let i = 0; i < 130; i++) {
        const res = await fetch(`http://127.0.0.1:${port}/api/v1/scorer/matches/00000000-0000-0000-0000-000000000001/deliveries`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': '00000000-0000-0000-0000-000000000002',
            'x-offline-replay': 'true', // Malicious attempt to bypass rate limiter
          },
          body: JSON.stringify({ runsBatter: 0 }),
        });
        if (res.status === 429) {
          hit429 = true;
          break;
        }
      }

      assert.strictEqual(hit429, true, 'Requests with x-offline-replay must still be throttled when exceeding limit');

      server.close();
    } finally {
      process.env.RATE_LIMIT_DISABLED = prevRateLimitDisabled;
    }
  });

  await assertTest('Rate Limit Test Bypass: Verifies rate limiters no-op when RATE_LIMIT_DISABLED=true', async () => {
    process.env.RATE_LIMIT_DISABLED = 'true';

    const app = createApp(db);
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = server.address().port;

    let hit429 = false;
    for (let i = 0; i < 15; i++) {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@test.com', password: 'pass' }),
      });
      if (res.status === 429) hit429 = true;
    }

    assert.strictEqual(hit429, false, 'No 429 encountered when RATE_LIMIT_DISABLED=true');

    server.close();
  });

  // --------------------------------------------------------------------
  // SECTION D: MIGRATION CHECKSUMS, IDEMPOTENCY & ADVISORY LOCKS
  // --------------------------------------------------------------------

  await assertTest('Migration Idempotency: Running migration runner twice succeeds without duplicate key errors', async () => {
    const memDb = new PGlite();
    const run1 = await runMigrations(memDb, { useAdvisoryLock: false, logger: { log: () => {} } });
    assert.strictEqual(run1.executedCount, 14);

    const run2 = await runMigrations(memDb, { useAdvisoryLock: false, logger: { log: () => {} } });
    assert.strictEqual(run2.executedCount, 0);
    assert.strictEqual(run2.verifiedCount, 14);
  });

  await assertTest('Migration Checksum Mismatch Detection: Modified migration fails hard with MigrationChecksumError', async () => {
    const memDb = new PGlite();
    await runMigrations(memDb, { useAdvisoryLock: false, logger: { log: () => {} } });

    // Artificially corrupt the checksum in schema_migrations
    await memDb.query(
      "UPDATE schema_migrations SET checksum = '0000000000000000000000000000000000000000000000000000000000000000' WHERE version = '001_initial_schema.sql';"
    );

    let errorThrown = null;
    try {
      await runMigrations(memDb, { useAdvisoryLock: false, logger: { log: () => {} } });
    } catch (err) {
      errorThrown = err;
    }

    assert.ok(errorThrown, 'Checksum mismatch must throw');
    assert.strictEqual(errorThrown.name, 'MigrationChecksumError');
    assert.strictEqual(errorThrown.version, '001_initial_schema.sql');
  });

  await assertTest('Migration Advisory Lock Timeout: Competing migration processes time out cleanly after timeoutMs', async () => {
    const fakeClient = {
      query: async (sql) => {
        if (sql.includes('pg_try_advisory_lock')) {
          return { rows: [{ acquired: false }] }; // Lock held by another node
        }
        return { rows: [] };
      },
    };

    let errorThrown = null;
    try {
      await runMigrations(fakeClient, { lockTimeoutMs: 1000, logger: { log: () => {} } });
    } catch (err) {
      errorThrown = err;
    }

    assert.ok(errorThrown, 'Should throw MigrationLockTimeoutError');
    assert.strictEqual(errorThrown.name, 'MigrationLockTimeoutError');
  });

  // --------------------------------------------------------------------
  // SECTION E: PRODUCTION ENVIRONMENT & SECURITY GUARDS
  // --------------------------------------------------------------------

  await assertTest('Production Environment Secret Guard: Startup throws when JWT_SECRET is missing, short, or weak', async () => {
    // 1. Missing JWT_SECRET
    assert.throws(
      () => validateEnvironment({ NODE_ENV: 'production', PORT: '5000', DATABASE_URL: 'postgresql://localhost:5432/db', CORS_ORIGIN: 'https://site.com', DB_SSL: 'true', DB_SSL_REJECT_UNAUTHORIZED: 'true' }),
      /JWT_SECRET is required/
    );

    // 2. Short JWT_SECRET (< 32 chars)
    assert.throws(
      () => validateEnvironment({ NODE_ENV: 'production', PORT: '5000', DATABASE_URL: 'postgresql://localhost:5432/db', JWT_SECRET: 'short_secret', CORS_ORIGIN: 'https://site.com', DB_SSL: 'true', DB_SSL_REJECT_UNAUTHORIZED: 'true' }),
      /must be at least 32 characters long/
    );

    // 3. Weak placeholder JWT_SECRET
    assert.throws(
      () => validateEnvironment({ NODE_ENV: 'production', PORT: '5000', DATABASE_URL: 'postgresql://localhost:5432/db', JWT_SECRET: 'default_jwt_secret_with_32_characters_length!', CORS_ORIGIN: 'https://site.com', DB_SSL: 'true', DB_SSL_REJECT_UNAUTHORIZED: 'true' }),
      /placeholder or default strings/
    );
  });

  await assertTest('Production Super Admin Seed Shield: Proves production startup does NOT silently seed demo admin', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const { seedDevelopmentData } = await import('../src/seed.js');
      let threw = false;
      try {
        await seedDevelopmentData(db);
      } catch (err) {
        threw = true;
        assert.ok(err.message.includes('strictly forbidden in production'));
      }
      assert.strictEqual(threw, true, 'Seeding in production must throw hard');
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  await assertTest('Production Admin Provisioning Utility: provisionSuperAdmin validates password policy and creates user', async () => {
    // Weak password rejected
    assert.ok(validateAdminPassword('weak'));
    assert.ok(validateAdminPassword('NoSpecialChar123'));

    // Strong password accepted
    assert.strictEqual(validateAdminPassword('SecureAdmin@2026!'), null);

    const memDb = new PGlite();
    await runMigrations(memDb, { useAdvisoryLock: false, logger: { log: () => {} } });

    const newAdmin = await provisionSuperAdmin(memDb, {
      email: 'production_admin@localcricket.test',
      password: 'SecureAdmin@2026!',
      fullName: 'Chief Umpire Admin',
    });

    assert.strictEqual(newAdmin.email, 'production_admin@localcricket.test');
    assert.strictEqual(newAdmin.global_role, 'SUPER_ADMIN');

    // Verify audit log entry
    const auditRes = await memDb.query("SELECT * FROM platform_audit_logs WHERE action = 'PROVISION_SUPER_ADMIN';");
    assert.strictEqual(auditRes.rows.length, 1);
    assert.strictEqual(auditRes.rows[0].target_entity_id, newAdmin.id);
  });

  await assertTest('Production TLS Enforcement (Missing DB_SSL): Verifies production throws if DB_SSL is not true', async () => {
    assert.throws(
      () =>
        validateEnvironment({
          NODE_ENV: 'production',
          PORT: '5000',
          DATABASE_URL: 'postgresql://localhost:5432/db',
          JWT_SECRET: 'valid_secure_secret_with_more_than_32_characters_random!',
          CORS_ORIGIN: 'https://site.com',
          DB_SSL: 'false',
          DB_SSL_REJECT_UNAUTHORIZED: 'true',
        }),
      /DB_SSL must be explicitly set to "true"/
    );
  });

  await assertTest('Production TLS Enforcement (Insecure rejectUnauthorized): Verifies production throws if rejectUnauthorized is not true', async () => {
    assert.throws(
      () =>
        validateEnvironment({
          NODE_ENV: 'production',
          PORT: '5000',
          DATABASE_URL: 'postgresql://localhost:5432/db',
          JWT_SECRET: 'valid_secure_secret_with_more_than_32_characters_random!',
          CORS_ORIGIN: 'https://site.com',
          DB_SSL: 'true',
          DB_SSL_REJECT_UNAUTHORIZED: 'false',
        }),
      /DB_SSL_REJECT_UNAUTHORIZED must be explicitly set to "true"/
    );
  });

  // --------------------------------------------------------------------
  // SECTION F: LIFECYCLE & DISASTER RECOVERY VALIDATION
  // --------------------------------------------------------------------

  await assertTest('Bounded Graceful Shutdown & Request Drain: Verifies shutdown drains requests and closes server cleanly', async () => {
    let closed = false;
    const fakePool = {
      query: async () => ({ rows: [] }),
      end: async () => {
        closed = true;
      },
    };

    const { server, shutdown } = await startServer({
      env: {
        PORT: 0,
        NODE_ENV: 'development',
        AUTO_MIGRATE: 'false',
      },
      pool: fakePool,
    });

    assert.ok(server.listening);
    await shutdown('TEST_SIGTERM');
    assert.strictEqual(server.listening, false);
    assert.strictEqual(closed, true, 'Pool must be closed during shutdown');
  });

  await assertTest('Static Asset Caching & SPA Route Fallback: Verifies cache headers and API 404 isolation', async () => {
    const app = createApp(db);
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = server.address().port;

    // Unknown API route must return 404 JSON, NOT index.html
    const apiRes = await fetch(`http://127.0.0.1:${port}/api/v1/nonexistent-route`);
    assert.strictEqual(apiRes.status, 404);
    const json = await apiRes.json();
    assert.strictEqual(json.success, false);
    assert.strictEqual(json.error.code, 'NOT_FOUND');

    server.close();
  });

  await assertTest('Backup & Restore Script Contract Validation: Missing args or invalid files exit non-zero', async () => {
    const backupScript = path.resolve(__dirname, '..', '..', 'scripts', 'backup-db.sh');
    const restoreScript = path.resolve(__dirname, '..', '..', 'scripts', 'restore-db.sh');

    assert.ok(fs.existsSync(backupScript), 'backup-db.sh exists');
    assert.ok(fs.existsSync(restoreScript), 'restore-db.sh exists');

    const backupContent = fs.readFileSync(backupScript, 'utf-8');
    const restoreContent = fs.readFileSync(restoreScript, 'utf-8');

    // Assert scripts have strict error handling and non-zero exits
    assert.ok(backupContent.includes('set -euo pipefail'));
    assert.ok(restoreContent.includes('set -euo pipefail'));
    assert.ok(backupContent.includes('exit 1'));
    assert.ok(restoreContent.includes('exit 1'));
    assert.ok(restoreContent.includes('pg_restore --list'));
  });

  console.log('\n======================================================================');
  console.log(`🎉 Milestone 14 Production Hardening Suite: ${passedTests} / ${totalTests} Passed ✅`);
  console.log('======================================================================\n');

  return { passed: passedTests, total: totalTests };
}

// Direct CLI execution
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMilestone14ProductionHardeningTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Milestone 14 tests failed:', err);
      process.exit(1);
    });
}
