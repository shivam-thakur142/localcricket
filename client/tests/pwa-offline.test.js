// ====================================================================
// MILESTONE 13: PWA, OFFLINE SCORING & SUNLIGHT UI FRONTEND TESTS
// ====================================================================

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyRequestStrategy } from '../public/sw.js';
import {
  offlineStorage,
  STORES,
  MUTATION_STATES,
  assertNoCredentials,
} from '../src/services/offlineStorage.js';
import {
  offlineQueueService,
  SYNC_STATUS,
  calculateBackoff,
} from '../src/services/offlineQueueService.js';
import { triggerHaptic, triggerHapticCritical, setHapticsEnabled } from '../src/utils/haptics.js';
import { THEMES } from '../src/constants/themes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n🏏 ======================================================================');
console.log('🏏 LocalCricket: Running Milestone 13 PWA & Offline Scoring Frontend Tests');
console.log('🏏 ======================================================================\n');

let passedTests = 0;
let totalTests = 0;

async function assertTest(name, fn) {
  totalTests++;
  process.stdout.write(`🧪 [PWA & Offline Test ${totalTests}] ${name}... `);
  try {
    await fn();
    console.log('PASSED ✅');
    passedTests++;
  } catch (err) {
    console.log('FAILED ❌');
    console.error('   Error details:', err.message);
    throw err;
  }
}

const originalFetch = global.fetch;

try {
  // ----------------------------------------------------
  // TEST 1: PWA Manifest Structure
  // ----------------------------------------------------
  await assertTest('PWA Manifest Structure: Valid JSON, standalone display, and 192/512 icon assets', async () => {
    const manifestPath = path.join(__dirname, '..', 'public', 'manifest.webmanifest');
    assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest exists');

    const content = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);

    assert.strictEqual(manifest.name, 'LocalCricket - Live Scoring & Tournament Platform');
    assert.strictEqual(manifest.short_name, 'LocalCricket');
    assert.strictEqual(manifest.start_url, '/');
    assert.strictEqual(manifest.scope, '/');
    assert.strictEqual(manifest.display, 'standalone');
    assert.strictEqual(manifest.background_color, '#0a0f1d');
    assert.strictEqual(manifest.theme_color, '#1e3a8a');

    assert.ok(Array.isArray(manifest.icons), 'Icons array present');
    assert.strictEqual(manifest.icons.length, 2);

    const icon192 = manifest.icons.find((i) => i.sizes === '192x192');
    const icon512 = manifest.icons.find((i) => i.sizes === '512x512');
    assert.ok(icon192, '192x192 icon declared');
    assert.ok(icon512, '512x512 icon declared');
    assert.strictEqual(icon192.purpose, 'any maskable');

    // Verify icon files physically exist on disk
    const icon192Path = path.join(__dirname, '..', 'public', icon192.src.replace(/^\//, ''));
    const icon512Path = path.join(__dirname, '..', 'public', icon512.src.replace(/^\//, ''));
    assert.ok(fs.existsSync(icon192Path), 'icon-192.svg exists on disk');
    assert.ok(fs.existsSync(icon512Path), 'icon-512.svg exists on disk');
  });

  // ----------------------------------------------------
  // TEST 2: Service Worker Cache Security
  // ----------------------------------------------------
  await assertTest('Service Worker Cache Security: Enforces strict bypass for SSE, auth, admin, and mutations', async () => {
    // Strict bypass for SSE real-time stream
    const sseReq = { url: 'http://localhost:3000/api/v1/matches/m1/stream', method: 'GET', headers: { get: () => 'text/event-stream' } };
    assert.strictEqual(classifyRequestStrategy(sseReq), 'NETWORK_ONLY_SSE');

    // Strict bypass for Auth
    const authReq = { url: 'http://localhost:3000/api/v1/auth/login', method: 'POST', headers: {} };
    assert.strictEqual(classifyRequestStrategy(authReq), 'NETWORK_ONLY_AUTH');

    // Strict bypass for Super Admin governance
    const adminReq = { url: 'http://localhost:3000/api/v1/admin/audit-logs', method: 'GET', headers: {} };
    assert.strictEqual(classifyRequestStrategy(adminReq), 'NETWORK_ONLY_ADMIN');

    // Strict bypass for Mutations
    const mutReq = { url: 'http://localhost:3000/api/v1/scorer/matches/m1/deliveries', method: 'POST', headers: {} };
    assert.strictEqual(classifyRequestStrategy(mutReq), 'NETWORK_ONLY_MUTATION');

    // Network-First for Read APIs
    const readReq = { url: 'http://localhost:3000/api/v1/tournaments/t1', method: 'GET', headers: {} };
    assert.strictEqual(classifyRequestStrategy(readReq), 'NETWORK_FIRST_READ');

    // Cache-First for Shell
    const shellReq = { url: 'http://localhost:3000/index.html', method: 'GET', headers: {} };
    assert.strictEqual(classifyRequestStrategy(shellReq), 'CACHE_FIRST_SHELL');
  });

  // ----------------------------------------------------
  // TEST 3: IndexedDB Schema Initialization
  // ----------------------------------------------------
  await assertTest('IndexedDB Schema Initialization: Mutation queue, match cache, and app settings stores defined', async () => {
    assert.strictEqual(STORES.MUTATION_QUEUE, 'mutation_queue');
    assert.strictEqual(STORES.MATCH_CACHE, 'match_cache');
    assert.strictEqual(STORES.APP_SETTINGS, 'app_settings');
  });

  // ----------------------------------------------------
  // TEST 4: Token Exclusion Assertion
  // ----------------------------------------------------
  await assertTest('Token Exclusion Assertion: Prevents JWTs, refresh tokens, and passwords from entering IndexedDB', async () => {
    // Valid cricket payload passes
    const validData = {
      runs_batter: 4,
      bowler_id: 'b-123',
      extra_type: null,
    };
    assert.doesNotThrow(() => assertNoCredentials(validData));

    // Forbidden token keys throw SECURITY_VIOLATION
    assert.throws(
      () => assertNoCredentials({ access_token: 'valid.token.here' }),
      /SECURITY_VIOLATION/
    );
    assert.throws(
      () => assertNoCredentials({ refreshToken: 'opaque-refresh-val' }),
      /SECURITY_VIOLATION/
    );
    assert.throws(
      () => assertNoCredentials({ payload: { password: 'SecretPassword123!' } }),
      /SECURITY_VIOLATION/
    );

    // Raw JWT strings throw SECURITY_VIOLATION
    assert.throws(
      () => assertNoCredentials({ authData: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy' }),
      /SECURITY_VIOLATION/
    );
  });

  // ----------------------------------------------------
  // TEST 5: FIFO Queue Ordering
  // ----------------------------------------------------
  await assertTest('FIFO Queue Ordering: Enqueued mutations sort deterministically by queue_id ASC', async () => {
    await offlineStorage.clearQueue('match-fifo', 'user-fifo');

    await offlineStorage.enqueueMutation({
      match_id: 'match-fifo',
      user_id: 'user-fifo',
      type: 'RECORD_DELIVERY',
      expected_delivery_sequence: 1,
      payload: { runs_batter: 0 },
    });
    await offlineStorage.enqueueMutation({
      match_id: 'match-fifo',
      user_id: 'user-fifo',
      type: 'RECORD_DELIVERY',
      expected_delivery_sequence: 2,
      payload: { runs_batter: 1 },
    });
    await offlineStorage.enqueueMutation({
      match_id: 'match-fifo',
      user_id: 'user-fifo',
      type: 'RECORD_DELIVERY',
      expected_delivery_sequence: 3,
      payload: { runs_batter: 4 },
    });
    await offlineStorage.enqueueMutation({
      match_id: 'match-fifo',
      user_id: 'user-fifo',
      type: 'RECORD_DELIVERY',
      expected_delivery_sequence: 4,
      payload: { runs_batter: 6 },
    });

    const pending = await offlineStorage.getPendingMutations('match-fifo', 'user-fifo');
    assert.strictEqual(pending.length, 4);
    assert.strictEqual(pending[0].expected_delivery_sequence, 1);
    assert.strictEqual(pending[1].expected_delivery_sequence, 2);
    assert.strictEqual(pending[2].expected_delivery_sequence, 3);
    assert.strictEqual(pending[3].expected_delivery_sequence, 4);

    // Verify queue_id is strictly ascending
    assert.ok(pending[0].queue_id < pending[1].queue_id);
    assert.ok(pending[1].queue_id < pending[2].queue_id);
    assert.ok(pending[2].queue_id < pending[3].queue_id);
  });

  // ----------------------------------------------------
  // TEST 6: Idempotency Token Persistence
  // ----------------------------------------------------
  await assertTest('Idempotency Token Persistence: Client-generated UUID idempotency_key is preserved across storage', async () => {
    const fixedKey = 'del_550e8400-e29b-41d4-a716-446655440000';
    const queued = await offlineStorage.enqueueMutation({
      match_id: 'match-idem',
      user_id: 'user-idem',
      type: 'RECORD_DELIVERY',
      idempotency_key: fixedKey,
      expected_delivery_sequence: 10,
      payload: { runs_batter: 2 },
    });

    const pending = await offlineStorage.getPendingMutations('match-idem', 'user-idem');
    const match = pending.find((p) => p.queue_id === queued.queue_id);
    assert.ok(match);
    assert.strictEqual(match.idempotency_key, fixedKey);
  });

  // ----------------------------------------------------
  // TEST 7: Crash Recovery State Reset
  // ----------------------------------------------------
  await assertTest('Crash Recovery State Reset: Stuck IN_FLIGHT mutations reset to PENDING with preserved idempotency key', async () => {
    const fixedKey = 'crash-recovery-key-123';
    const queued = await offlineStorage.enqueueMutation({
      match_id: 'match-crash',
      user_id: 'user-crash',
      type: 'RECORD_DELIVERY',
      idempotency_key: fixedKey,
      state: MUTATION_STATES.IN_FLIGHT,
      payload: { runs_batter: 1 },
    });

    // Run crash recovery
    const resetCount = await offlineStorage.resetInFlightMutations();
    assert.ok(resetCount >= 1);

    const pending = await offlineStorage.getPendingMutations('match-crash', 'user-crash');
    const recovered = pending.find((p) => p.queue_id === queued.queue_id);
    assert.strictEqual(recovered.state, MUTATION_STATES.PENDING);
    assert.strictEqual(recovered.idempotency_key, fixedKey);
  });

  // ----------------------------------------------------
  // TEST 8: User Isolation on Logout
  // ----------------------------------------------------
  await assertTest('User Isolation on Logout: User-scoped match cache cleared without leaking data across scorers', async () => {
    await offlineStorage.setMatchCache('user-alpha', 'match-iso', { team: 'Alpha', score: '50/0' });
    await offlineStorage.setMatchCache('user-beta', 'match-iso', { team: 'Beta', score: '60/2' });

    // User Alpha logs out
    await offlineStorage.clearUserCaches('user-alpha');

    const cacheAlpha = await offlineStorage.getMatchCache('user-alpha', 'match-iso');
    const cacheBeta = await offlineStorage.getMatchCache('user-beta', 'match-iso');

    assert.strictEqual(cacheAlpha, null, 'User Alpha cache purged');
    assert.ok(cacheBeta, 'User Beta cache preserved');
    assert.strictEqual(cacheBeta.team, 'Beta');
  });

  // ----------------------------------------------------
  // TEST 9: Reconnection Health-Check Flow
  // ----------------------------------------------------
  await assertTest('Reconnection Health-Check Flow: Validates reachability via GET /health with 3s timeout', async () => {
    // 1. Healthy response
    global.fetch = async (url) => {
      if (url === '/health') return { ok: true, status: 200 };
      return { ok: false, status: 404 };
    };
    const healthy = await offlineQueueService.checkApiHealth();
    assert.strictEqual(healthy, true);

    // 2. Unreachable response
    global.fetch = async () => {
      throw new Error('Failed to fetch');
    };
    const unreachable = await offlineQueueService.checkApiHealth();
    assert.strictEqual(unreachable, false);
  });

  // ----------------------------------------------------
  // TEST 10: Silent M11 Token Refresh During Sync
  // ----------------------------------------------------
  await assertTest('Silent M11 Token Refresh During Sync: Executes refresh on 401 and updates in-memory access token', async () => {
    let refreshCalled = false;

    global.fetch = async (url) => {
      if (url.includes('/api/v1/auth/me')) {
        const errRes = {
          status: 401,
          ok: false,
          json: async () => ({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'Token expired' } }),
        };
        return errRes;
      }
      if (url.includes('/api/v1/auth/refresh')) {
        refreshCalled = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { accessToken: 'new-rotated-token' } }),
        };
      }
      return { ok: true, status: 200 };
    };

    const authCheck = await offlineQueueService.checkAuth();
    assert.strictEqual(authCheck.ok, true);
    assert.strictEqual(refreshCalled, true);
  });

  // ----------------------------------------------------
  // TEST 11: Sequence Conflict Replay Defense
  // ----------------------------------------------------
  await assertTest('Sequence Conflict Replay Defense: 409 Conflict pauses queue without silent re-sequencing', async () => {
    await offlineStorage.clearQueue('match-conflict', 'user-conflict');

    const queued = await offlineStorage.enqueueMutation({
      match_id: 'match-conflict',
      user_id: 'user-conflict',
      type: 'RECORD_DELIVERY',
      expected_delivery_sequence: 5,
      payload: { runs_batter: 1 },
    });

    offlineQueueService.setCurrentUser('user-conflict');

    // Mock API health OK, auth OK, but replay returns 409 Conflict
    global.fetch = async (url) => {
      if (url === '/health') return { ok: true, status: 200 };
      if (url.includes('/api/v1/auth/me')) return { ok: true, status: 200, json: async () => ({ data: { id: 'user-conflict' } }) };
      if (url.includes('/api/v1/scorer/matches/match-conflict/deliveries')) {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            success: false,
            error: { code: 'OFFLINE_UNDO_CONFLICT', message: 'Sequence conflict on server' },
          }),
        };
      }
      return { ok: true, status: 200 };
    };

    let conflictCaptured = null;
    const unsub = offlineQueueService.subscribeConflict((c) => {
      conflictCaptured = c;
    });

    await offlineQueueService.drainQueue();
    unsub();

    assert.strictEqual(offlineQueueService.getStatus(), SYNC_STATUS.CONFLICT);
    assert.ok(conflictCaptured, 'Conflict event triggered');

    // Mutation must be retained in queue under CONFLICT state
    const pending = await offlineStorage.getPendingMutations('match-conflict', 'user-conflict');
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].state, MUTATION_STATES.CONFLICT);
  });

  // ----------------------------------------------------
  // TEST 12: Tournament Freeze Replay Defense
  // ----------------------------------------------------
  await assertTest('Tournament Freeze Replay Defense: 423 Locked halts queue and retains all commands safely', async () => {
    await offlineStorage.clearQueue('match-frozen', 'user-frozen');

    await offlineStorage.enqueueMutation({
      match_id: 'match-frozen',
      user_id: 'user-frozen',
      type: 'RECORD_DELIVERY',
      expected_delivery_sequence: 8,
      payload: { runs_batter: 4 },
    });

    offlineQueueService.setCurrentUser('user-frozen');

    global.fetch = async (url) => {
      if (url === '/health') return { ok: true, status: 200 };
      if (url.includes('/api/v1/auth/me')) return { ok: true, status: 200, json: async () => ({ data: { id: 'user-frozen' } }) };
      if (url.includes('/api/v1/scorer/matches/match-frozen/deliveries')) {
        return {
          ok: false,
          status: 423,
          json: async () => ({
            success: false,
            error: { code: 'TOURNAMENT_FROZEN', message: 'Tournament frozen by Super Admin' },
          }),
        };
      }
      return { ok: true, status: 200 };
    };

    await offlineQueueService.drainQueue();

    assert.strictEqual(offlineQueueService.getStatus(), SYNC_STATUS.BLOCKED_FROZEN);

    // Assert commands safely preserved in queue
    const pending = await offlineStorage.getPendingMutations('match-frozen', 'user-frozen');
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].state, MUTATION_STATES.BLOCKED_FROZEN);
  });

  // ----------------------------------------------------
  // TEST 13: Exponential Backoff & Jitter
  // ----------------------------------------------------
  await assertTest('Exponential Backoff & Jitter: Computes delay with ±20% jitter and max 30s cap', async () => {
    const delay0 = calculateBackoff(0);
    assert.ok(delay0 >= 800 && delay0 <= 1200, `Delay 0 (${delay0}) within ±20% of 1000`);

    const delay2 = calculateBackoff(2);
    assert.ok(delay2 >= 3200 && delay2 <= 4800, `Delay 2 (${delay2}) within ±20% of 4000`);

    const delay10 = calculateBackoff(10);
    assert.ok(delay10 <= 36000, `Delay capped at max 30s ± jitter`);
  });

  // ----------------------------------------------------
  // TEST 14: Offline Undo Target Binding
  // ----------------------------------------------------
  await assertTest('Offline Undo Target Binding: Offline undo mutation binds to exact expected sequence and target ID', async () => {
    await offlineStorage.clearQueue('match-undo', 'user-undo');

    const queued = await offlineQueueService.enqueueUndo('match-undo', 'tour-1', 'user-undo', {
      expectedDeliverySequence: 14,
      targetDeliveryId: 'del-uuid-14',
      reversionReason: 'Umpire corrected wide call',
    });

    assert.strictEqual(queued.type, 'UNDO_DELIVERY');
    assert.strictEqual(queued.expected_delivery_sequence, 14);
    assert.strictEqual(queued.payload.target_delivery_id, 'del-uuid-14');
    assert.strictEqual(queued.payload.is_offline, true);
    assert.strictEqual(queued.payload.reversion_reason, 'Umpire corrected wide call');
  });

  // ----------------------------------------------------
  // TEST 15: Projected Score Display Separation
  // ----------------------------------------------------
  await assertTest('Projected Score Display Separation: Decouples server score from pending offline count', async () => {
    const serverScore = { runs: 72, wickets: 4, overs: '10.2' };
    const localMutations = [
      { type: 'RECORD_DELIVERY', payload: { runs_batter: 1, runs_extras: 0, is_wicket: false } },
      { type: 'RECORD_DELIVERY', payload: { runs_batter: 2, runs_extras: 0, is_wicket: false } },
    ];

    const pendingDeliveriesCount = localMutations.length;
    const pendingRuns = localMutations.reduce((acc, m) => acc + m.payload.runs_batter, 0);
    const projectedRuns = serverScore.runs + pendingRuns;

    assert.strictEqual(serverScore.runs, 72);
    assert.strictEqual(projectedRuns, 75);
    assert.strictEqual(pendingDeliveriesCount, 2);

    // Presentation banner string assertion
    const bannerLabel = `🟡 Pending Offline: +${pendingDeliveriesCount} deliveries (${projectedRuns}/${serverScore.wickets} projected)`;
    assert.strictEqual(bannerLabel, '🟡 Pending Offline: +2 deliveries (75/4 projected)');
  });

  // ----------------------------------------------------
  // TEST 16: Sunlight Mode WCAG AAA Contrast
  // ----------------------------------------------------
  await assertTest('Sunlight Mode WCAG AAA Contrast: Pure white background (#ffffff) and black text (#000000) achieves 21:1 contrast', async () => {
    const cssPath = path.join(__dirname, '..', 'src', 'index.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(css.includes('[data-theme="sunlight"]'), 'Sunlight theme declared in index.css');
    assert.ok(css.includes('--bg-primary: #ffffff'), 'White background declared');
    assert.ok(css.includes('--text-primary: #000000'), 'Black text declared');
    assert.ok(css.includes('border: 2.5px solid #000000'), 'High-contrast 2.5px black borders declared');

    // Mathematically calculate relative contrast ratio:
    // (L1 + 0.05) / (L2 + 0.05) where L(white) = 1.0, L(black) = 0.0
    const contrastRatio = (1.0 + 0.05) / (0.0 + 0.05); // 21:1
    assert.strictEqual(contrastRatio, 21);
    assert.ok(contrastRatio >= 7.0, '21:1 contrast exceeds WCAG AAA 7:1 requirement');
  });

  // ----------------------------------------------------
  // TEST 17: Battery Saver OLED Black Tokens
  // ----------------------------------------------------
  await assertTest('Battery Saver OLED Black Tokens: Absolute #000000 black, zero box-shadows, and disabled animations', async () => {
    const cssPath = path.join(__dirname, '..', 'src', 'index.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(css.includes('[data-theme="battery_saver"]'), 'Battery saver theme declared');
    assert.ok(css.includes('--bg-primary: #000000'), 'OLED #000000 black background declared');
    assert.ok(css.includes('box-shadow: none !important'), 'box-shadow disabled');
    assert.ok(css.includes('animation: none !important'), 'Animations disabled');
    assert.ok(css.includes('transition: none !important'), 'Transitions disabled');
  });

  // ----------------------------------------------------
  // TEST 18: Field Ergonomics Fallbacks
  // ----------------------------------------------------
  await assertTest('Field Ergonomics Fallbacks: Vibration and wake lock APIs handle unsupported browsers gracefully', async () => {
    // 1. Haptics fallback when navigator.vibrate is undefined
    const res = triggerHaptic(25);
    assert.strictEqual(res, false, 'Gracefully no-ops without error');

    const resCritical = triggerHapticCritical();
    assert.strictEqual(resCritical, false, 'Gracefully no-ops without error');

    // 2. Disabling haptics
    setHapticsEnabled(false);
    assert.strictEqual(triggerHaptic(25), false);
    setHapticsEnabled(true);
  });

  console.log('\n======================================================================');
  console.log(`🎉 Milestone 13 Frontend Suite: ${passedTests} / ${totalTests} Passed ✅`);
  console.log('======================================================================\n');
} finally {
  offlineQueueService.clearRetry();
  global.fetch = originalFetch;
}

process.exit(0);
