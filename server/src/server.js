// ====================================================================
// PRODUCTION APPLICATION SERVER & LIFECYCLE RUNNER (server/src/server.js)
// ====================================================================

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { createApp } from './app.js';
import { createDbPool } from './db.js';
import { runMigrations } from './migrate.js';
import { validateEnvironment } from './utils/envValidator.js';
import { matchEventBus } from './utils/eventBus.js';

dotenv.config();

/**
 * Boots the LocalCricket production server with full lifecycle management,
 * database connectivity, optional auto-migration, and graceful shutdown.
 *
 * @param {Object} [overrides={}] Optional server configuration overrides
 * @returns {Promise<{ app: import('express').Application, server: import('http').Server, pool: import('pg').Pool, shutdown: () => Promise<void> }>}
 */
export async function startServer(overrides = {}) {
  const env = { ...process.env, ...overrides.env };

  // 1. Validate environment configuration
  validateEnvironment(env);

  // 2. Initialize database connection pool
  const pool = overrides.pool || createDbPool(overrides.dbConfig);

  // 3. Optional startup migration execution
  if (env.AUTO_MIGRATE === 'true') {
    console.log('[LocalCricket Server] AUTO_MIGRATE enabled. Checking pending migrations...');
    await runMigrations(pool, { logger: overrides.logger || console });
  }

  // 4. Create Express application
  const app = createApp(pool);

  // 5. Bind HTTP listener
  const port = parseInt(env.PORT || '5000', 10);
  const host = env.HOST || '0.0.0.0';

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, host, () => {
      console.log(
        `🏏 [LocalCricket Server] Live and listening on ${host}:${port} (PID: ${process.pid}, NODE_ENV: ${env.NODE_ENV || 'development'})`
      );
      resolve(s);
    });
    s.on('error', reject);
  });

  // 6. Bounded Graceful Shutdown Controller
  const shutdownTimeoutMs = parseInt(env.SHUTDOWN_TIMEOUT_MS || '10000', 10);
  let isShuttingDown = false;

  async function shutdown(signal = 'MANUAL') {
    if (isShuttingDown) return;
    isShuttingDown = true;
    app.locals.isShuttingDown = true;
    console.log(`\n[LocalCricket Server] Commencing graceful shutdown on ${signal} (timeout: ${shutdownTimeoutMs}ms)...`);

    // Notify active SSE connections & internal subscribers
    matchEventBus.emit('shutdown');

    // Force-close watchdog timer
    const forceTimer = setTimeout(() => {
      console.warn(`[LocalCricket Server] Shutdown timeout reached (${shutdownTimeoutMs}ms). Force-closing remaining sockets.`);
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
    }, shutdownTimeoutMs);
    if (typeof forceTimer.unref === 'function') forceTimer.unref();

    // Stop accepting new connections and drain active requests
    await new Promise((resolve) => {
      server.close((err) => {
        if (err) console.error('[LocalCricket Server] Error closing HTTP listener:', err.message);
        clearTimeout(forceTimer);
        resolve();
      });
    });

    console.log('[LocalCricket Server] HTTP listener closed. Draining database connection pool...');
    try {
      if (typeof pool.end === 'function') {
        await pool.end();
      }
      console.log('[LocalCricket Server] Database pool closed cleanly.');
    } catch (poolErr) {
      console.error('[LocalCricket Server] Error closing database pool:', poolErr.message);
    }
  }

  return { app, server, pool, shutdown };
}

// Standalone execution entrypoint
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  (async () => {
    try {
      const { shutdown } = await startServer();

      process.on('SIGTERM', async () => {
        await shutdown('SIGTERM');
        process.exit(0);
      });

      process.on('SIGINT', async () => {
        await shutdown('SIGINT');
        process.exit(0);
      });
    } catch (err) {
      console.error('❌ [LocalCricket Server] Fatal startup error:', err.message);
      process.exit(1);
    }
  })();
}
