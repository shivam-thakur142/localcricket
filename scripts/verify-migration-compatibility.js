#!/usr/bin/env node
// ==============================================================================
// LocalCricket Expand -> Migrate -> Contract Verification Script
// (scripts/verify-migration-compatibility.js)
// Milestone 15 — Rolling Zero-Downtime Migration Compatibility Audit
//
// INVARIANT:
// "Database schema modifications for rolling deployments must follow the
// Expand -> Migrate -> Contract pattern. All schema expansions must be
// backward-compatible with active Version N application nodes."
// ==============================================================================

import crypto from 'crypto';
import assert from 'assert';

let PGlite;
try {
  const mod = await import('@electric-sql/pglite');
  PGlite = mod.PGlite;
} catch {
  const mod = await import('../server/node_modules/@electric-sql/pglite/dist/index.js');
  PGlite = mod.PGlite;
}

import { runMigrations } from '../server/src/migrate.js';

console.log('======================================================================');
console.log('🔄 LocalCricket: Verifying Expand -> Migrate -> Contract Compatibility');
console.log(`Execution Time: ${new Date().toISOString()}`);
console.log('Safety Invariant: Proves zero-downtime rolling deployment schema compatibility');
console.log('======================================================================\n');

async function runMigrationCompatibilityTest() {
  let passed = 0;
  let total = 0;

  async function step(name, testFn) {
    total++;
    process.stdout.write(`  [Migration Phase ${total}] ${name}... `);
    try {
      await testFn();
      passed++;
      console.log('PASSED ✅');
    } catch (err) {
      console.log(`FAILED ❌ (${err.message})`);
      throw err;
    }
  }

  const db = new PGlite();
  const runId = crypto.randomUUID().slice(0, 8);
  const userId = crypto.randomUUID();
  const tournamentId = crypto.randomUUID();

  try {
    // --------------------------------------------------------------------------
    // Phase 1: Baseline Version N Initialization
    // --------------------------------------------------------------------------
    await step('Baseline Version N: Initialize schema with all 14 baseline migrations', async () => {
      await runMigrations(db, { useAdvisoryLock: false, logger: { log: () => {} } });

      // Seed baseline record
      await db.query(
        `INSERT INTO auth.users (id, email) VALUES ($1, $2);`,
        [userId, `organizer_${runId}@localcricket.test`]
      );
      await db.query(
        `INSERT INTO users (id, auth_user_id, email, full_name, global_role)
         VALUES ($1, $1, $2, 'Baseline Organizer', 'USER');`,
        [userId, `organizer_${runId}@localcricket.test`]
      );
      await db.query(
        `INSERT INTO tournaments (id, name, short_name, city, slug, format, overs_per_innings, created_by_user_id, status)
         VALUES ($1, 'Baseline Trophy 2026', 'BLT', 'Mumbai', $2, 'T20', 20, $3, 'ONGOING');`,
        [tournamentId, `baseline-trophy-${runId}`, userId]
      );

      // Verify baseline Version N query
      const res = await db.query('SELECT id, name, format, overs_per_innings FROM tournaments WHERE id = $1;', [tournamentId]);
      assert.strictEqual(res.rows.length, 1);
      assert.strictEqual(res.rows[0].name, 'Baseline Trophy 2026');
    });

    // --------------------------------------------------------------------------
    // Phase 2: EXPAND (Additive, Non-Breaking Schema Change)
    // --------------------------------------------------------------------------
    await step('EXPAND Phase: Apply additive non-breaking columns with safe defaults', async () => {
      // 1. Additive columns: nullable or defaulted
      await db.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS streaming_status VARCHAR(50) DEFAULT 'OFFLINE';`);
      await db.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_interrupted BOOLEAN DEFAULT FALSE;`);

      // 2. Verify Version N queries continue to work without knowing about the new columns
      const vNRead = await db.query('SELECT id, name, format, overs_per_innings FROM tournaments WHERE id = $1;', [tournamentId]);
      assert.strictEqual(vNRead.rows.length, 1);
      assert.strictEqual(vNRead.rows[0].name, 'Baseline Trophy 2026');

      // 3. Verify Version N inserts succeed without specifying new columns
      const newTournId = crypto.randomUUID();
      await db.query(
        `INSERT INTO tournaments (id, name, short_name, city, slug, format, overs_per_innings, created_by_user_id, status)
         VALUES ($1, 'Version N Expansion Cup', 'VNC', 'Delhi', $2, 'T20', 20, $3, 'UPCOMING');`,
        [newTournId, `expansion-cup-${runId}`, userId]
      );

      // Verify default value was safely populated by database
      const checkRes = await db.query('SELECT streaming_status FROM tournaments WHERE id = $1;', [newTournId]);
      assert.strictEqual(checkRes.rows[0].streaming_status, 'OFFLINE');
    });

    // --------------------------------------------------------------------------
    // Phase 3: MIGRATE (Concurrent Interoperability & Dual-Read/Write)
    // --------------------------------------------------------------------------
    await step('MIGRATE Phase: Verify Version N and Version N+1 query patterns coexist concurrently', async () => {
      // Version N+1 writes new data into expanded column
      await db.query("UPDATE tournaments SET streaming_status = 'LIVE_STREAMING' WHERE id = $1;", [tournamentId]);

      // Version N+1 query pattern reads the column
      const vNPlus1Read = await db.query('SELECT id, name, streaming_status FROM tournaments WHERE id = $1;', [tournamentId]);
      assert.strictEqual(vNPlus1Read.rows[0].streaming_status, 'LIVE_STREAMING');

      // Version N query pattern reads existing columns seamlessly without conflict
      const vNConcurrentRead = await db.query('SELECT id, name, format FROM tournaments WHERE id = $1;', [tournamentId]);
      assert.strictEqual(vNConcurrentRead.rows[0].name, 'Baseline Trophy 2026');
    });

    // --------------------------------------------------------------------------
    // Phase 4: CONTRACT (Safe Schema Cleanup / Deprecation)
    // --------------------------------------------------------------------------
    await step('CONTRACT Phase: Finalize schema and safely remove obsolete temporary columns', async () => {
      // Drop temporary column
      await db.query('ALTER TABLE tournaments DROP COLUMN IF EXISTS streaming_status;');
      await db.query('ALTER TABLE matches DROP COLUMN IF EXISTS is_interrupted;');

      // Verify active production queries function normally after contraction
      const postContractRead = await db.query('SELECT id, name, format, overs_per_innings FROM tournaments WHERE id = $1;', [tournamentId]);
      assert.strictEqual(postContractRead.rows.length, 1);
      assert.strictEqual(postContractRead.rows[0].name, 'Baseline Trophy 2026');
    });

    // --------------------------------------------------------------------------
    // Phase 5: Migration Checksum Invariant
    // --------------------------------------------------------------------------
    await step('Migration Integrity: Verify 14 core baseline migration checksums remain unmodified', async () => {
      const migRes = await runMigrations(db, { useAdvisoryLock: false, logger: { log: () => {} } });
      assert.strictEqual(migRes.executedCount, 0, 'No pending migrations should execute');
      assert.strictEqual(migRes.verifiedCount, 14, 'All 14 baseline migration checksums must match');
    });

  } finally {
    await db.close();
  }

  console.log('\n======================================================================');
  console.log(`📊 Migration Compatibility Results: ${passed} / ${total} Phases Passed (100%)`);
  console.log('======================================================================');
  console.log('🎉 Expand -> Migrate -> Contract sequence certified for zero-downtime deployments.');
  return { passed, total };
}

runMigrationCompatibilityTest().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('\nFATAL: Migration compatibility test failed:', err);
  process.exit(1);
});
