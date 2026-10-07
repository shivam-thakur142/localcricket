// ====================================================================
// DATABASE CONNECTION POOL & TRANSACTION HELPER (server/src/db.js)
// ====================================================================

import pg from 'pg';

const { Pool } = pg;

/**
 * Creates and configures a production-ready PostgreSQL connection pool
 * with TLS enforcement, connection timeouts, and statement timeouts.
 *
 * @param {Object} [customConfig={}] Optional configuration overrides
 * @returns {import('pg').Pool} Configured pg.Pool instance
 */
export function createDbPool(customConfig = {}) {
  const isProduction = (customConfig.nodeEnv || process.env.NODE_ENV) === 'production';
  const connectionString = customConfig.connectionString || process.env.DATABASE_URL;

  // SSL Configuration
  let ssl = false;
  if (customConfig.ssl !== undefined) {
    ssl = customConfig.ssl;
  } else if (process.env.DB_SSL === 'true') {
    const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' && process.env.DB_SSL_ALLOW_SELF_SIGNED !== 'true';
    ssl = {
      rejectUnauthorized,
      ca: process.env.DB_SSL_CA || undefined,
    };
  } else if (isProduction) {
    // In production, DB_SSL=true is mandatory. If somehow called without it, enforce rejection.
    ssl = {
      rejectUnauthorized: true,
      ca: process.env.DB_SSL_CA || undefined,
    };
  }

  const poolConfig = {
    connectionString,
    max: customConfig.max || parseInt(process.env.DB_POOL_MAX || '20', 10),
    idleTimeoutMillis: customConfig.idleTimeoutMillis || 30000,
    connectionTimeoutMillis: customConfig.connectionTimeoutMillis || 5000,
    statement_timeout: customConfig.statement_timeout || 30000,
    ssl,
    ...customConfig,
  };

  const pool = new Pool(poolConfig);

  // Monitor unexpected idle client errors
  pool.on('error', (err) => {
    console.error('[DB Pool Error] Unexpected idle client error:', err.message);
  });

  return pool;
}

/**
 * Executes a callback within a managed database transaction.
 * Automatically manages BEGIN, COMMIT, ROLLBACK, and client release.
 * Supports both pg.Pool and in-memory PGlite test instances.
 *
 * @template T
 * @param {import('pg').Pool | Object} poolOrDb Database pool or instance
 * @param {(client: import('pg').PoolClient | Object) => Promise<T>} callback Transaction operations
 * @returns {Promise<T>} Result of callback execution
 */
export async function withTransaction(poolOrDb, callback) {
  // If connection pooling is supported (pg.Pool)
  if (poolOrDb && typeof poolOrDb.connect === 'function') {
    const client = await poolOrDb.connect();
    try {
      await client.query('BEGIN;');
      const result = await callback(client);
      await client.query('COMMIT;');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK;');
      } catch (rollbackErr) {
        console.error('[DB withTransaction] Rollback failed:', rollbackErr.message);
      }
      throw err;
    } finally {
      client.release();
    }
  }

  // Fallback for non-pooled / in-memory PGlite test databases
  await poolOrDb.query('BEGIN;');
  try {
    const result = await callback(poolOrDb);
    await poolOrDb.query('COMMIT;');
    return result;
  } catch (err) {
    try {
      await poolOrDb.query('ROLLBACK;');
    } catch (rollbackErr) {
      console.error('[DB withTransaction] Rollback failed on fallback:', rollbackErr.message);
    }
    throw err;
  }
}
