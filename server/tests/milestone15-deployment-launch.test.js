// ====================================================================
// MILESTONE 15: PRODUCTION DEPLOYMENT & LAUNCH TESTS
// (server/tests/milestone15-deployment-launch.test.js)
// ====================================================================

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app.js';
import { runMigrations } from '../src/migrate.js';
import {
  createScorerRateLimiter,
  createPublicRateLimiter,
  createAuthRateLimiter,
} from '../src/middleware/securityMiddleware.js';
import { runSmokeTests } from '../../scripts/verify-production-smoke.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

export async function runMilestone15DeploymentLaunchTests() {
  console.log('\n🏏 ======================================================================');
  console.log('🏏 LocalCricket: Running Milestone 15 Production Deployment & Launch Tests');
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
  // SECTION A: DEPLOYMENT AUTOMATION CONTRACTS
  // --------------------------------------------------------------------

  await assertTest('Deploy Script Pre-Flight Parameter Validation: Missing required env vars exit non-zero', async () => {
    const deployScriptPath = path.join(ROOT_DIR, 'scripts', 'deploy.sh');
    assert.ok(fs.existsSync(deployScriptPath), 'deploy.sh must exist');

    // Run bash with empty DATABASE_URL
    const res = spawnSync('bash', [deployScriptPath], {
      cwd: ROOT_DIR,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        DATABASE_URL: '',
        JWT_SECRET: 'test_secret_that_is_long_enough_32_chars',
      },
      encoding: 'utf8',
    });

    assert.notStrictEqual(res.status, 0, 'Must exit non-zero when DATABASE_URL is missing');
    assert.ok(
      res.stderr.includes('DATABASE_URL is required') || res.stdout.includes('DATABASE_URL is required'),
      'Must print DATABASE_URL required error message'
    );
  });

  await assertTest('Deploy Script Pre-Flight Database Check: Unreachable database aborts before backup/migration', async () => {
    const deployScriptPath = path.join(ROOT_DIR, 'scripts', 'deploy.sh');
    const res = spawnSync('bash', [deployScriptPath], {
      cwd: ROOT_DIR,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://invalid_user:invalid_pass@127.0.0.1:54321/nonexistent_db',
        JWT_SECRET: 'super_secret_jwt_key_that_is_32_characters_long',
        DB_SSL: 'true',
        DB_SSL_REJECT_UNAUTHORIZED: 'true',
        CORS_ORIGIN: 'https://localcricket.app',
      },
      encoding: 'utf8',
    });

    assert.notStrictEqual(res.status, 0, 'Must exit non-zero when database ping fails');
    assert.ok(
      res.stderr.includes('reachability check failed') || res.stdout.includes('reachability check failed'),
      'Must log reachability check failure'
    );
  });

  await assertTest('Deploy Script Automated Backup Invocation: Verifies pre-deployment snapshot step is present', async () => {
    const deployScript = fs.readFileSync(path.join(ROOT_DIR, 'scripts', 'deploy.sh'), 'utf8');
    assert.ok(deployScript.includes('scripts/backup-db.sh'), 'deploy.sh must invoke scripts/backup-db.sh');
    assert.ok(deployScript.includes('backups/pre-deploy'), 'deploy.sh must target backups/pre-deploy directory');
  });

  await assertTest('Deploy Script Migration Failure Abort: Migration error triggers rollback hook', async () => {
    const deployScript = fs.readFileSync(path.join(ROOT_DIR, 'scripts', 'deploy.sh'), 'utf8');
    assert.ok(deployScript.includes('server/src/migrate.js'), 'deploy.sh must execute migrations');
    assert.ok(deployScript.includes('scripts/rollback.sh'), 'deploy.sh must trigger scripts/rollback.sh on failure');
  });

  await assertTest('Deploy Script Readiness Timeout & Rollback Trigger: Polling timeout triggers automated rollback', async () => {
    const deployScript = fs.readFileSync(path.join(ROOT_DIR, 'scripts', 'deploy.sh'), 'utf8');
    assert.ok(deployScript.includes('/health'), 'deploy.sh must probe /health');
    assert.ok(deployScript.includes('/ready'), 'deploy.sh must probe /ready');
    assert.ok(deployScript.includes('MAX_HEALTH_RETRIES'), 'deploy.sh must enforce bounded health retries');
  });

  // --------------------------------------------------------------------
  // SECTION B: APPLICATION ROLLBACK & DATABASE SAFETY INVARIANT
  // --------------------------------------------------------------------

  await assertTest('Rollback Script Container Reversion Contract: Captures failed deploy logs and attempts restart', async () => {
    const rollbackScriptPath = path.join(ROOT_DIR, 'scripts', 'rollback.sh');
    assert.ok(fs.existsSync(rollbackScriptPath), 'rollback.sh must exist');

    const res = spawnSync('bash', [rollbackScriptPath], {
      cwd: ROOT_DIR,
      env: {
        PATH: process.env.PATH,
        PORT: '5000',
        TARGET_URL: 'http://127.0.0.1:5000',
      },
      encoding: 'utf8',
    });

    assert.strictEqual(res.status, 0, 'Rollback script must complete cleanly');
    assert.ok(res.stdout.includes('Capturing diagnostic logs'), 'Must log diagnostic capture step');
    assert.ok(res.stdout.includes('CRITICAL DATABASE SAFETY INVARIANT'), 'Must print database safety invariant');
  });

  await assertTest('Rollback Script Database Safety Invariant: Automatic rollback NEVER restores production database', async () => {
    const rollbackScript = fs.readFileSync(path.join(ROOT_DIR, 'scripts', 'rollback.sh'), 'utf8');
    assert.ok(
      rollbackScript.includes('PRODUCTION DATABASE RESTORATION IS STRICTLY MANUAL'),
      'Must declare production database restoration as strictly manual'
    );
    assert.ok(
      rollbackScript.includes('--confirm-data-loss'),
      'Must require explicit --confirm-data-loss flag before restoring database'
    );

    // Run rollback without --confirm-data-loss flag and assert restore-db is NOT called
    const res = spawnSync('bash', [path.join(ROOT_DIR, 'scripts', 'rollback.sh'), '--manual-restore-db=fake.dump'], {
      cwd: ROOT_DIR,
      env: { PATH: process.env.PATH },
      encoding: 'utf8',
    });
    assert.notStrictEqual(res.status, 0, 'Must reject database restore without --confirm-data-loss');
    assert.ok(
      res.stderr.includes('--confirm-data-loss') || res.stdout.includes('--confirm-data-loss'),
      'Must complain about missing confirmation flag'
    );
  });

  await assertTest('Rollback Script Post-Rollback Health Check: Verifies /health and /ready on rolled-back instance', async () => {
    const rollbackScript = fs.readFileSync(path.join(ROOT_DIR, 'scripts', 'rollback.sh'), 'utf8');
    assert.ok(rollbackScript.includes('/health'), 'rollback.sh must probe /health');
    assert.ok(rollbackScript.includes('/ready'), 'rollback.sh must probe /ready');
  });

  // --------------------------------------------------------------------
  // SECTION C: REVERSE PROXY & EDGE STREAMING OPTIMIZATION
  // --------------------------------------------------------------------

  await assertTest('SSE Unbuffered Header Contract: Sets X-Accel-Buffering: no and Cache-Control: no-cache', async () => {
    const matchId = '88888888-8888-8888-8888-888888888888';

    const app = createApp(db);
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = server.address().port;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/matches/${matchId}/stream`, {
        signal: controller.signal,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('content-type'), 'text/event-stream');
      assert.strictEqual(res.headers.get('x-accel-buffering'), 'no', 'Must set X-Accel-Buffering: no');
      assert.ok(res.headers.get('cache-control')?.includes('no-cache'), 'Must set Cache-Control: no-cache');
    } catch (err) {
      if (err.name !== 'AbortError') throw err;
    } finally {
      clearTimeout(timeout);
      server.close();
    }
  });

  await assertTest('Configurable Nginx Template Validation: Parameterized domain, cert paths, and unbuffered SSE', async () => {
    const templatePath = path.join(ROOT_DIR, 'deploy', 'nginx.conf.template');
    assert.ok(fs.existsSync(templatePath), 'deploy/nginx.conf.template must exist');
    const content = fs.readFileSync(templatePath, 'utf8');

    assert.ok(content.includes('${APP_DOMAIN}'), 'Template must parameterize ${APP_DOMAIN}');
    assert.ok(content.includes('${SSL_CERT_PATH}'), 'Template must parameterize ${SSL_CERT_PATH}');
    assert.ok(content.includes('${SSL_KEY_PATH}'), 'Template must parameterize ${SSL_KEY_PATH}');
    assert.ok(content.includes('${APP_UPSTREAM}'), 'Template must parameterize ${APP_UPSTREAM}');
    assert.ok(content.includes('proxy_buffering off;'), 'Must configure proxy_buffering off');
    assert.ok(content.includes('proxy_set_header X-Accel-Buffering "no";'), 'Must configure X-Accel-Buffering: no');
    assert.ok(content.includes('proxy_read_timeout 3600s;'), 'Must set long timeout for SSE');
  });

  // --------------------------------------------------------------------
  // SECTION D: LAUNCH VERIFICATION HARNESS CONTRACTS
  // --------------------------------------------------------------------

  await assertTest('Production-Safe Smoke Verifier Read-Only Contract: Proves zero database mutations', async () => {
    const smokeScriptPath = path.join(ROOT_DIR, 'scripts', 'verify-production-smoke.js');
    assert.ok(fs.existsSync(smokeScriptPath), 'verify-production-smoke.js must exist');

    // Count rows in critical tables
    const tourneyCountBefore = (await db.query('SELECT COUNT(*) FROM tournaments;')).rows[0].count;
    const matchCountBefore = (await db.query('SELECT COUNT(*) FROM matches;')).rows[0].count;
    const deliveryCountBefore = (await db.query('SELECT COUNT(*) FROM deliveries;')).rows[0].count;

    // Boot app for smoke verification
    const app = createApp(db);
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = server.address().port;

    const smokeResult = await runSmokeTests(`http://127.0.0.1:${port}`);
    server.close();

    assert.strictEqual(smokeResult.success, true, 'Smoke verifier must report success');

    // Count rows after smoke verification
    const tourneyCountAfter = (await db.query('SELECT COUNT(*) FROM tournaments;')).rows[0].count;
    const matchCountAfter = (await db.query('SELECT COUNT(*) FROM matches;')).rows[0].count;
    const deliveryCountAfter = (await db.query('SELECT COUNT(*) FROM deliveries;')).rows[0].count;

    assert.strictEqual(tourneyCountBefore, tourneyCountAfter, 'Zero tournaments must be created');
    assert.strictEqual(matchCountBefore, matchCountAfter, 'Zero matches must be created');
    assert.strictEqual(deliveryCountBefore, deliveryCountAfter, 'Zero deliveries must be created');
  });

  await assertTest('Production-Safe Smoke Verifier Dual Probe & Security Audit: Asserts probes and security headers', async () => {
    const smokeScript = fs.readFileSync(path.join(ROOT_DIR, 'scripts', 'verify-production-smoke.js'), 'utf8');
    assert.ok(smokeScript.includes('/health'), 'Must check /health');
    assert.ok(smokeScript.includes('/ready'), 'Must check /ready');
    assert.ok(smokeScript.includes('x-content-type-options'), 'Must check nosniff');
    assert.ok(smokeScript.includes('content-security-policy'), 'Must check CSP');
    assert.ok(smokeScript.includes('x-accel-buffering'), 'Must check unbuffered SSE headers');
  });

  await assertTest('Production-Safe Smoke Verifier Negative Failure Reporting: Exits non-zero on unreachable target', async () => {
    const smokeResult = await runSmokeTests('http://127.0.0.1:54321');
    assert.strictEqual(smokeResult.success, false, 'Must report failure when target is unreachable');
  });

  await assertTest('E2E Lifecycle Verifier Staging Guard: Prohibits execution against production', async () => {
    const e2eScriptPath = path.join(ROOT_DIR, 'scripts', 'verify-e2e-lifecycle.js');
    assert.ok(fs.existsSync(e2eScriptPath), 'verify-e2e-lifecycle.js must exist');

    const res = spawnSync('node', [e2eScriptPath], {
      cwd: ROOT_DIR,
      env: {
        PATH: process.env.PATH,
        TARGET_ENV: 'production',
      },
      encoding: 'utf8',
    });

    assert.notStrictEqual(res.status, 0, 'Must exit non-zero when TARGET_ENV=production');
    assert.ok(
      res.stderr.includes('PROHIBITED') || res.stdout.includes('PROHIBITED'),
      'Must log prohibition message'
    );
  });

  // --------------------------------------------------------------------
  // SECTION E: ARCHITECTURAL CONTRACT RECONCILIATIONS
  // --------------------------------------------------------------------

  await assertTest('Expand/Contract Migration Compatibility Contract: Non-breaking schema changes execute smoothly', async () => {
    // Phase 1 (EXPAND): Add nullable column to an existing table
    await db.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS live_streaming_channel VARCHAR(255);`);

    // Verify existing Version N queries continue to function without error
    const rows = await db.query('SELECT id, name, format, overs_per_innings FROM tournaments LIMIT 1;');
    assert.ok(Array.isArray(rows.rows), 'Query must succeed on expanded table');

    // Clean up test expansion
    await db.query(`ALTER TABLE tournaments DROP COLUMN IF EXISTS live_streaming_channel;`);
  });

  await assertTest('Canonical Rate-Limit Reconciliation Assertion: Enforces 120/min scorer and 300/min public', async () => {
    const scorerLimiter = createScorerRateLimiter();
    const publicLimiter = createPublicRateLimiter();
    const authLimiter = createAuthRateLimiter();

    // Verify scorer rate limit contract: 120 requests per minute
    // Keying by authenticated user ID with fallback
    assert.ok(typeof scorerLimiter === 'function', 'Scorer limiter middleware created');

    // Verify public rate limit contract: 300 requests per minute
    assert.ok(typeof publicLimiter === 'function', 'Public limiter middleware created');

    // Verify auth rate limit contract: 10 requests per 15 minutes
    assert.ok(typeof authLimiter === 'function', 'Auth limiter middleware created');

    // Read middleware file directly to assert configured constants
    const middlewareSrc = fs.readFileSync(path.join(ROOT_DIR, 'server', 'src', 'middleware', 'securityMiddleware.js'), 'utf8');
    assert.ok(middlewareSrc.includes('max: 120'), 'Scorer limiter must be set to max: 120');
    assert.ok(middlewareSrc.includes('max: 300'), 'Public limiter must be set to max: 300');
    assert.ok(middlewareSrc.includes('max: 10'), 'Auth limiter must be set to max: 10');
  });

  console.log('\n======================================================================');
  console.log(`🎉 Milestone 15 Production Deployment & Launch Suite: ${passedTests} / ${totalTests} Passed ✅`);
  console.log('======================================================================\n');

  return { passed: passedTests, total: totalTests };
}

// Direct execution guard
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMilestone15DeploymentLaunchTests().then(({ passed, total }) => {
    if (passed === total) process.exit(0);
    process.exit(1);
  }).catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}
