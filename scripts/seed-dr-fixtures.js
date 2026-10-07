// ====================================================================
// DISASTER RECOVERY FIXTURES SEEDER (scripts/seed-dr-fixtures.js)
// ====================================================================

import crypto from 'crypto';
import { createDbPool } from '../server/src/db.js';

async function seedDrFixtures() {
  const pool = createDbPool();
  try {
    console.log('[DR Seed] Inserting representative tournament data for recovery verification...');

    // 1. Insert DR Organizer User
    const authUserId = crypto.randomUUID();
    const userId = authUserId;
    await pool.query(
      `INSERT INTO auth.users (id, email) VALUES ($1, 'dr_organizer@localcricket.test') ON CONFLICT (id) DO NOTHING;`,
      [authUserId]
    );
    await pool.query(
      `INSERT INTO users (id, auth_user_id, email, full_name, global_role, is_suspended)
       VALUES ($1, $2, 'dr_organizer@localcricket.test', 'DR Tournament Organizer', 'USER', FALSE)
       ON CONFLICT (email) DO NOTHING;`,
      [userId, authUserId]
    );
    await pool.query(
      `INSERT INTO user_credentials (user_id, password_hash)
       VALUES ($1, '$2b$12$/qCsressW.39cBScHHb7OOdSjEAQx0DSEFbtqczJC8OcKcrW6MjpC')
       ON CONFLICT (user_id) DO NOTHING;`,
      [userId]
    );

    // 2. Insert DR Tournament
    const tournamentId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO tournaments (id, name, short_name, city, slug, format, overs_per_innings, created_by_user_id, status, is_frozen, created_at, updated_at)
       VALUES ($1, 'DR Premier Cup 2026', 'DRPC', 'Mumbai', 'dr-cup-2026', 'T20', 20, $2, 'ONGOING', FALSE, NOW(), NOW())
       ON CONFLICT DO NOTHING;`,
      [tournamentId, userId]
    );

    // 3. Insert DR Teams
    const teamAId = crypto.randomUUID();
    const teamBId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO teams (id, name, short_name, created_by_user_id, is_verified, created_at, updated_at)
       VALUES 
         ($1, 'DR Warriors', 'DRW', $3, TRUE, NOW(), NOW()),
         ($2, 'DR Titans', 'DRT', $3, TRUE, NOW(), NOW())
       ON CONFLICT DO NOTHING;`,
      [teamAId, teamBId, userId]
    );

    console.log('[DR Seed] Successfully seeded tournament and teams.');
  } finally {
    await pool.end();
  }
}

seedDrFixtures()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[DR Seed] Error seeding fixtures:', err.message);
    process.exit(1);
  });
