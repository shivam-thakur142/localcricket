// ====================================================================
// MILESTONE 13: BACKEND OFFLINE REPLAY & CONCURRENCY CONTRACTS TESTS
// ====================================================================

import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app.js';
import { generateAccessToken } from '../src/services/tokenService.js';
import { resetRateLimits } from '../src/services/authService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMilestone13OfflineContractTests() {
  console.log('\n🏏 ======================================================================');
  console.log('🏏 LocalCricket: Running Milestone 13 Offline Replay & Concurrency Tests');
  console.log('🏏 ======================================================================\n');

  process.env.NODE_ENV = 'test';
  process.env.RATE_LIMIT_DISABLED = 'true';
  resetRateLimits();

  const db = new PGlite();

  // Run all migrations 001 through 014
  const migrationFiles = [
    '001_initial_schema.sql',
    '002_triggers_and_integrity.sql',
    '003_rls_policies.sql',
    '004_seed_test_data.sql',
    '005_idempotency_keys.sql',
    '006_tournament_points_config.sql',
    '007_spectator_analytics_indexes.sql',
    '008_tournament_admin_enhancements.sql',
    '009_tournament_playoffs_and_brackets.sql',
    '010_player_team_profile_indexes.sql',
    '011_records_and_h2h_indexes.sql',
    '012_tournament_operations_and_officials.sql',
    '013_production_authentication_and_jwt.sql',
    '014_super_admin_and_platform_management.sql',
  ];

  for (const file of migrationFiles) {
    const filePath = path.join(__dirname, '..', 'migrations', file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    await db.exec(sql);
  }

  const app = createApp(db);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const request = (pathStr, options = {}) => {
    return new Promise((resolve, reject) => {
      const url = new URL(pathStr, baseUrl);
      const headers = { ...(options.headers || {}) };
      let bodyPayload = null;
      if (options.body) {
        bodyPayload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(bodyPayload);
      }
      const reqOptions = {
        method: options.method || 'GET',
        headers,
      };
      const req = http.request(url, reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        });
      });
      req.on('error', reject);
      if (bodyPayload) req.write(bodyPayload);
      req.end();
    });
  };

  let passedTests = 0;
  let totalTests = 0;

  const test = async (name, fn) => {
    totalTests++;
    try {
      await fn();
      passedTests++;
      console.log(`  ✅ Test ${totalTests}: ${name}`);
    } catch (err) {
      console.error(`  ❌ Test ${totalTests} FAILED: ${name}`);
      console.error('     Details:', err.message);
      if (err.stack) console.error(err.stack);
      throw err;
    }
  };

  const MATCH_ID = '88888888-8888-8888-8888-888888888888';
  const TOURNAMENT_ID = '33333333-3333-3333-3333-333333333333';
  const SCORER_ID = '22222222-2222-2222-2222-222222222222';
  const ADMIN_ID = '00000000-0000-0000-0000-000000000001';

  const scorerToken = generateAccessToken({
    id: SCORER_ID,
    sub: SCORER_ID,
    email: 'scorer@localcricket.test',
    full_name: 'Suresh Raina',
    global_role: 'USER',
  });
  const adminToken = generateAccessToken({
    id: ADMIN_ID,
    sub: ADMIN_ID,
    email: 'admin@localcricket.test',
    full_name: 'Super Administrator',
    global_role: 'SUPER_ADMIN',
  });

  try {
    // Setup innings 1 for match
    const startInnRes = await request(`/api/v1/scorer/matches/${MATCH_ID}/innings/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${scorerToken}`, 'x-user-id': SCORER_ID },
      body: {
        battingTeamId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        bowlingTeamId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        strikerId: '10000000-0000-0000-0000-000000000001',
        nonStrikerId: '10000000-0000-0000-0000-000000000002',
        bowlerId: '20000000-0000-0000-0000-000000000001',
        inningsNumber: 1,
      },
    });
    assert.strictEqual(startInnRes.status, 201, 'Innings 1 started');

    // ------------------------------------------------------------------
    // TEST 1: Replay Idempotency
    // ------------------------------------------------------------------
    await test('Replay Idempotency: Batch replay with client idempotency keys returns deterministic response and zero duplicate ledger rows', async () => {
      const keys = [
        'offline-idem-ball-1',
        'offline-idem-ball-2',
        'offline-idem-ball-3',
        'offline-idem-ball-4',
        'offline-idem-ball-5',
        'offline-idem-ball-6',
      ];

      // Replay first time
      for (let i = 0; i < 6; i++) {
        const res = await request(`/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${scorerToken}`,
            'x-user-id': SCORER_ID,
            'Idempotency-Key': keys[i],
          },
          body: {
            runs_batter: 1,
            expected_sequence: i + 1,
            idempotency_key: keys[i],
          },
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.data.delivery.delivery_sequence, i + 1);
      }

      // Replay second time with identical idempotency keys (simulating offline replay after network glitch)
      for (let i = 0; i < 6; i++) {
        const resReplay = await request(`/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${scorerToken}`,
            'x-user-id': SCORER_ID,
            'Idempotency-Key': keys[i],
          },
          body: {
            runs_batter: 1,
            expected_sequence: i + 1,
            idempotency_key: keys[i],
          },
        });
        assert.strictEqual(resReplay.status, 200);
        assert.strictEqual(resReplay.data.data.delivery.delivery_sequence, i + 1);
      }

      // Verify database contains exactly 6 deliveries, not 12
      const delCountRes = await db.query(
        `SELECT COUNT(*) FROM deliveries WHERE innings_id = (SELECT id FROM innings WHERE match_id = $1 AND innings_number = 1);`,
        [MATCH_ID]
      );
      assert.strictEqual(parseInt(delCountRes.rows[0].count), 6, 'Exactly 6 deliveries in ledger');
    });

    // ------------------------------------------------------------------
    // TEST 2: Offline Undo Verification
    // ------------------------------------------------------------------
    await test('Offline Undo Verification: Replaying offline undo with expected_delivery_sequence reverts target delivery', async () => {
      // Start Over 2 with different bowler
      const startOverRes = await request(`/api/v1/scorer/matches/${MATCH_ID}/overs/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${scorerToken}`, 'x-user-id': SCORER_ID },
        body: { bowlerId: '20000000-0000-0000-0000-000000000002' },
      });
      assert.strictEqual(startOverRes.status, 201);

      // Record delivery #7
      const delRes = await request(`/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${scorerToken}`, 'x-user-id': SCORER_ID },
        body: { runs_batter: 4, idempotency_key: 'offline-ball-7' },
      });
      assert.strictEqual(delRes.status, 200);
      assert.strictEqual(delRes.data.data.delivery.delivery_sequence, 7);

      // Replay offline undo targeting delivery #7
      const undoRes = await request(`/api/v1/scorer/matches/${MATCH_ID}/deliveries/undo`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${scorerToken}`,
          'x-user-id': SCORER_ID,
          'x-offline-replay': 'true',
        },
        body: {
          expected_delivery_sequence: 7,
          reversion_reason: 'Offline undo verification test',
          is_offline: true,
        },
      });
      assert.strictEqual(undoRes.status, 200, 'Undo succeeded');
      assert.strictEqual(undoRes.data.success, true);

      // Verify delivery #7 is flagged reverted
      const revertedCheck = await db.query(
        `SELECT is_reverted FROM deliveries WHERE innings_id = (SELECT id FROM innings WHERE match_id = $1 AND innings_number = 1) AND delivery_sequence = 7;`,
        [MATCH_ID]
      );
      assert.strictEqual(revertedCheck.rows[0].is_reverted, true, 'Delivery 7 is reverted');
    });

    // ------------------------------------------------------------------
    // TEST 3: Offline Undo Conflict
    // ------------------------------------------------------------------
    await test('Offline Undo Conflict: Replaying undo when subsequent deliveries recorded in interim returns 409 OFFLINE_UNDO_CONFLICT', async () => {
      // Record delivery #8
      const del8 = await request(`/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${scorerToken}`, 'x-user-id': SCORER_ID },
        body: { runs_batter: 1, idempotency_key: 'offline-ball-8' },
      });
      assert.strictEqual(del8.status, 200);
      assert.strictEqual(del8.data.data.delivery.delivery_sequence, 8);

      // Record delivery #9
      const del9 = await request(`/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${scorerToken}`, 'x-user-id': SCORER_ID },
        body: { runs_batter: 2, idempotency_key: 'offline-ball-9' },
      });
      assert.strictEqual(del9.status, 200);
      assert.strictEqual(del9.data.data.delivery.delivery_sequence, 9);

      // Now offline client tries to undo delivery #8 while latest active is #9
      const undoConflictRes = await request(`/api/v1/scorer/matches/${MATCH_ID}/deliveries/undo`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${scorerToken}`,
          'x-user-id': SCORER_ID,
          'x-offline-replay': 'true',
        },
        body: {
          expected_delivery_sequence: 8,
          reversion_reason: 'Offline undo stale sequence conflict',
          is_offline: true,
        },
      });

      assert.strictEqual(undoConflictRes.status, 409, 'Returns 409 Conflict');
      assert.strictEqual(undoConflictRes.data.error.code, 'OFFLINE_UNDO_CONFLICT');
      assert.strictEqual(undoConflictRes.data.error.details.requestedSequence, 8);
      assert.strictEqual(undoConflictRes.data.error.details.currentSequence, 9);

      // Verify delivery #8 remains active
      const checkDel8 = await db.query(
        `SELECT is_reverted FROM deliveries WHERE innings_id = (SELECT id FROM innings WHERE match_id = $1 AND innings_number = 1) AND delivery_sequence = 8;`,
        [MATCH_ID]
      );
      assert.strictEqual(checkDel8.rows[0].is_reverted, false, 'Delivery 8 remains active');
    });

    // ------------------------------------------------------------------
    // TEST 4: Offline Undo Already Reverted
    // ------------------------------------------------------------------
    await test('Offline Undo Already Reverted: Replaying undo for already reverted delivery returns 409 OFFLINE_UNDO_CONFLICT', async () => {
      // Revert delivery #9 legally
      const undo9 = await request(`/api/v1/scorer/matches/${MATCH_ID}/deliveries/undo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${scorerToken}`, 'x-user-id': SCORER_ID },
        body: { expected_delivery_sequence: 9, reversion_reason: 'Legitimate undo of ball 9' },
      });
      assert.strictEqual(undo9.status, 200);

      // Replaying undo for delivery #9 again
      const undo9Again = await request(`/api/v1/scorer/matches/${MATCH_ID}/deliveries/undo`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${scorerToken}`,
          'x-user-id': SCORER_ID,
          'x-offline-replay': 'true',
        },
        body: {
          expected_delivery_sequence: 9,
          reversion_reason: 'Duplicate replay of already reverted ball 9',
          is_offline: true,
        },
      });

      assert.strictEqual(undo9Again.status, 409, 'Returns 409 Conflict');
      assert.strictEqual(undo9Again.data.error.code, 'OFFLINE_UNDO_CONFLICT');
      assert.strictEqual(undo9Again.data.error.details.alreadyReverted, true);
    });

    // ------------------------------------------------------------------
    // TEST 5: Frozen Tournament Replay Shield
    // ------------------------------------------------------------------
    await test('Frozen Tournament Replay Shield: Replaying queued deliveries on frozen tournament returns 423 TOURNAMENT_FROZEN without mutation', async () => {
      // Super Admin freezes the tournament
      const freezeRes = await request(`/api/v1/admin/tournaments/${TOURNAMENT_ID}/freeze`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isFrozen: true, reason: 'Field dispute freeze for M13 testing' },
      });
      assert.strictEqual(freezeRes.status, 200, 'Tournament frozen');

      // Attempt offline delivery replay
      const replayDuringFreeze = await request(`/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${scorerToken}`, 'x-user-id': SCORER_ID },
        body: { runs_batter: 6, idempotency_key: 'offline-during-freeze-key' },
      });

      assert.strictEqual(replayDuringFreeze.status, 423, 'Returns 423 Locked');
      assert.strictEqual(replayDuringFreeze.data.error.code, 'TOURNAMENT_FROZEN');

      // Attempt offline undo replay during freeze
      const undoDuringFreeze = await request(`/api/v1/scorer/matches/${MATCH_ID}/deliveries/undo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${scorerToken}`, 'x-user-id': SCORER_ID },
        body: { expected_delivery_sequence: 8, is_offline: true },
      });

      assert.strictEqual(undoDuringFreeze.status, 423, 'Returns 423 Locked');
      assert.strictEqual(undoDuringFreeze.data.error.code, 'TOURNAMENT_FROZEN');

      // Verify no delivery with the key was persisted
      const keyCheck = await db.query(
        `SELECT * FROM idempotency_keys WHERE key = 'offline-during-freeze-key';`
      );
      assert.strictEqual(keyCheck.rows.length, 0, 'No key persisted during freeze');

      // Unfreeze tournament
      const unfreezeRes = await request(`/api/v1/admin/tournaments/${TOURNAMENT_ID}/freeze`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isFrozen: false, reason: 'Dispute resolved, unfreezing' },
      });
      assert.strictEqual(unfreezeRes.status, 200, 'Tournament unfrozen');
    });

    // ------------------------------------------------------------------
    // TEST 6: Rapid Sequential Replay Stress
    // ------------------------------------------------------------------
    await test('Rapid Sequential Replay Stress: Drains queued deliveries sequentially with monotonic sequences and over completion trigger', async () => {
      // Revert active ball #8 to clean up over 2
      const cleanUndo = await request(`/api/v1/scorer/matches/${MATCH_ID}/deliveries/undo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${scorerToken}`, 'x-user-id': SCORER_ID },
        body: { expected_delivery_sequence: 8 },
      });
      assert.strictEqual(cleanUndo.status, 200);

      // Now over 2 has 0 active legal deliveries (balls 7, 8, 9 were undone/reverted)
      // Drain a full queued over of 6 balls sequentially as the sync manager does
      const stressKeys = [
        'stress-replay-b1',
        'stress-replay-b2',
        'stress-replay-b3',
        'stress-replay-b4',
        'stress-replay-b5',
        'stress-replay-b6',
      ];

      let lastSequence = 9; // next will be 10
      let lastOverCompleted = false;

      for (let i = 0; i < 6; i++) {
        const res = await request(`/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${scorerToken}`,
            'x-user-id': SCORER_ID,
            'Idempotency-Key': stressKeys[i],
          },
          body: {
            runs_batter: (i % 2 === 0) ? 1 : 2,
            idempotency_key: stressKeys[i],
          },
        });

        assert.strictEqual(res.status, 200);
        const seq = res.data.data.delivery.delivery_sequence;
        assert.ok(seq > lastSequence, `Sequence ${seq} strictly greater than ${lastSequence}`);
        lastSequence = seq;
        lastOverCompleted = res.data.data.innings_state.is_over_completed;
      }

      // 6th legal delivery of over 2 must mark the over as completed
      assert.strictEqual(lastOverCompleted, true, 'Over 2 completed after 6 legal deliveries');
    });

    console.log('\n======================================================================');
    console.log(`🎉 Milestone 13 Offline Contracts Suite: ${passedTests} / ${totalTests} Passed ✅`);
    console.log('======================================================================\n');
  } finally {
    server.close();
  }

  return { passedTests, totalTests };
}
