// ====================================================================
// DEVELOPMENT/TEST DATABASE SEED UTILITY (server/src/seed.js)
// ====================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDbPool } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Seeds initial fixtures for development and testing.
 * Strictly forbidden in production environments.
 */
export async function seedDevelopmentData(poolOrDb) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Automatic fixture seeding is strictly forbidden in production environments');
  }

  const seedFile = path.resolve(__dirname, '..', 'migrations', '004_seed_test_data.sql');
  if (fs.existsSync(seedFile)) {
    const sql = fs.readFileSync(seedFile, 'utf-8');
    await poolOrDb.query(sql);
    return true;
  }
  return false;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  (async () => {
    try {
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ Refusing to seed database in production mode.');
        process.exit(1);
      }
      console.log('🏏 [LocalCricket Seed] Seeding development fixtures...');
      const pool = createDbPool();
      await seedDevelopmentData(pool);
      console.log('✅ [LocalCricket Seed] Development fixtures seeded successfully.');
      await pool.end();
      process.exit(0);
    } catch (err) {
      console.error('❌ [LocalCricket Seed] Seeding failed:', err.message);
      process.exit(1);
    }
  })();
}
