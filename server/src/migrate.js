// ====================================================================
// TRANSACTIONAL DATABASE MIGRATION ENGINE (server/src/migrate.js)
// ====================================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createDbPool, withTransaction } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');

// Deterministic 64-bit advisory lock key for LocalCricket migrations
export const MIGRATION_ADVISORY_LOCK_ID = '884729104820194821';

export class MigrationChecksumError extends Error {
  constructor(version, expectedChecksum, actualChecksum) {
    super(
      `Migration Checksum Mismatch for version "${version}".\n` +
      `Database recorded checksum: ${expectedChecksum}\n` +
      `File on disk checksum:      ${actualChecksum}\n` +
      `Aborting startup to prevent schema corruption.`
    );
    this.name = 'MigrationChecksumError';
    this.version = version;
    this.expectedChecksum = expectedChecksum;
    this.actualChecksum = actualChecksum;
  }
}

export class MigrationLockTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`Timed out waiting for migration advisory lock after ${timeoutMs}ms.`);
    this.name = 'MigrationLockTimeoutError';
  }
}

/**
 * Calculates SHA-256 checksum for migration file contents.
 * Normalizes CRLF to LF to ensure deterministic hashes across OS environments.
 */
export function calculateChecksum(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

/**
 * Acquires a migration advisory lock with bounded timeout.
 */
async function acquireAdvisoryLock(client, timeoutMs = 15000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      const res = await client.query('SELECT pg_try_advisory_lock($1) AS acquired;', [MIGRATION_ADVISORY_LOCK_ID]);
      if (res.rows?.[0]?.acquired) {
        return true;
      }
    } catch (err) {
      // If advisory locks are not supported (e.g. in minimal PGlite mocks), continue gracefully
      if (err.message && err.message.includes('function pg_try_advisory_lock')) {
        return false;
      }
      throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new MigrationLockTimeoutError(timeoutMs);
}

/**
 * Releases the migration advisory lock.
 */
async function releaseAdvisoryLock(client) {
  try {
    await client.query('SELECT pg_advisory_unlock($1);', [MIGRATION_ADVISORY_LOCK_ID]);
  } catch (err) {
    // Graceful no-op if unsupported
  }
}

/**
 * Executes all pending database migrations in deterministic sequence,
 * validating SHA-256 checksums of previously applied migrations.
 *
 * @param {import('pg').Pool | Object} poolOrDb Database pool or instance
 * @param {Object} [options={}] Migration options
 * @returns {Promise<{ executedCount: number, verifiedCount: number }>}
 */
export async function runMigrations(poolOrDb, options = {}) {
  const migrationsDir = options.migrationsDir || MIGRATIONS_DIR;
  const timeoutMs = options.lockTimeoutMs || parseInt(process.env.MIGRATION_LOCK_TIMEOUT_MS || '15000', 10);
  const logger = options.logger || console;

  // 1. Resolve client for advisory locking and ledger setup
  const client = poolOrDb.connect ? await poolOrDb.connect() : poolOrDb;
  let lockAcquired = false;

  try {
    // 2. Acquire advisory lock with bounded timeout
    if (options.useAdvisoryLock !== false) {
      lockAcquired = await acquireAdvisoryLock(client, timeoutMs);
    }

    // 3. Ensure schema_migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        execution_time_ms INTEGER NOT NULL,
        checksum VARCHAR(64) NOT NULL
      );
    `);

    // 4. Query already applied migrations
    const appliedRes = await client.query(`
      SELECT version, checksum, executed_at FROM schema_migrations ORDER BY version ASC;
    `);
    const appliedMap = new Map();
    for (const row of appliedRes.rows) {
      appliedMap.set(row.version, row.checksum);
    }

    // 5. Read and sort migration files
    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    // Verify no duplicate version prefixes
    const prefixSet = new Set();
    for (const file of files) {
      const prefix = file.split('_')[0];
      if (prefixSet.has(prefix)) {
        throw new Error(`Duplicate migration prefix detected: "${prefix}" in ${file}`);
      }
      prefixSet.add(prefix);
    }

    let executedCount = 0;
    let verifiedCount = 0;

    // 6. Process each migration in deterministic order
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf-8');
      const fileChecksum = calculateChecksum(sqlContent);

      if (appliedMap.has(file)) {
        // Verification step: Checksum comparison
        const recordedChecksum = appliedMap.get(file);
        if (recordedChecksum !== fileChecksum) {
          throw new MigrationChecksumError(file, recordedChecksum, fileChecksum);
        }
        verifiedCount++;
      } else {
        // Execution step: Apply unexecuted migration within a transaction
        logger.log(`[Migrations] Applying ${file}...`);
        const t0 = Date.now();

        await withTransaction(poolOrDb, async (txClient) => {
          if (typeof txClient.exec === 'function') {
            await txClient.exec(sqlContent);
          } else {
            await txClient.query(sqlContent);
          }
          const duration = Date.now() - t0;
          await txClient.query(
            `INSERT INTO schema_migrations (version, executed_at, execution_time_ms, checksum)
             VALUES ($1, NOW(), $2, $3);`,
            [file, duration, fileChecksum]
          );
        });

        logger.log(`[Migrations] Applied ${file} successfully in ${Date.now() - t0}ms.`);
        executedCount++;
      }
    }

    return { executedCount, verifiedCount };
  } finally {
    if (lockAcquired) {
      await releaseAdvisoryLock(client);
    }
    if (poolOrDb.connect && typeof client.release === 'function') {
      client.release();
    }
  }
}

// CLI Execution entrypoint
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  (async () => {
    try {
      console.log('🏏 [LocalCricket Migrations] Initializing database migration runner...');
      const pool = createDbPool();
      const result = await runMigrations(pool);
      console.log(
        `✅ [LocalCricket Migrations] Complete: ${result.verifiedCount} verified, ${result.executedCount} newly applied.`
      );
      await pool.end();
      process.exit(0);
    } catch (err) {
      console.error('❌ [LocalCricket Migrations] Migration failed:', err.message);
      process.exit(1);
    }
  })();
}
