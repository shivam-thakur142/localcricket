// ====================================================================
// DISASTER RECOVERY DATA INTEGRITY VERIFIER (scripts/verify-dr-restored-data.js)
// ====================================================================

import assert from 'assert';
import { createDbPool } from '../server/src/db.js';

async function verifyRestoredData() {
  const pool = createDbPool();
  try {
    console.log('[DR Verify] Verifying data integrity in restored database...');

    // 1. Verify User
    const userRes = await pool.query("SELECT email FROM users WHERE email = 'dr_organizer@localcricket.test';");
    assert.strictEqual(userRes.rows.length, 1, 'Restored database must contain DR organizer user');

    // 2. Verify Tournament
    const tournRes = await pool.query("SELECT name, slug FROM tournaments WHERE slug = 'dr-cup-2026';");
    assert.strictEqual(tournRes.rows.length, 1, 'Restored database must contain DR tournament');
    assert.strictEqual(tournRes.rows[0].name, 'DR Premier Cup 2026');

    // 3. Verify Teams
    const teamsRes = await pool.query("SELECT short_name FROM teams WHERE short_name IN ('DRW', 'DRT');");
    assert.strictEqual(teamsRes.rows.length, 2, 'Restored database must contain both DR teams');

    console.log('[DR Verify] Data integrity confirmed across all restored tables.');
  } finally {
    await pool.end();
  }
}

verifyRestoredData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[DR Verify] Integrity check failed:', err.message);
    process.exit(1);
  });
