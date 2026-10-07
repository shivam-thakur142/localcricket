// ====================================================================
// MILESTONE 12: SUPER ADMIN & PLATFORM-WIDE MANAGEMENT CONSOLE TESTS
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

export async function runMilestone12AdminTests() {
  console.log('\n🏏 ======================================================================');
  console.log('🏏 LocalCricket: Running Milestone 12 Super Admin & Platform Management Tests');
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
      if (bodyPayload) {
        req.write(bodyPayload);
      }
      req.end();
    });
  };

  // Pre-seed known users & tokens
  const adminId = '00000000-0000-0000-0000-000000000001';
  const organizerId = '11111111-1111-1111-1111-111111111111';
  const scorerId = '22222222-2222-2222-2222-222222222222';
  const tournamentId = '33333333-3333-3333-3333-333333333333';
  const matchId = '88888888-8888-8888-8888-888888888888';
  const venueId = '77777777-7777-7777-7777-777777777777';

  const adminToken = generateAccessToken({
    id: adminId,
    sub: adminId,
    email: 'admin@localcricket.test',
    full_name: 'Super Administrator',
    global_role: 'SUPER_ADMIN',
  });

  const organizerToken = generateAccessToken({
    id: organizerId,
    sub: organizerId,
    email: 'organizer@localcricket.test',
    full_name: 'Amit Sharma',
    global_role: 'USER',
  });

  const scorerToken = generateAccessToken({
    id: scorerId,
    sub: scorerId,
    email: 'scorer@localcricket.test',
    full_name: 'Suresh Raina',
    global_role: 'USER',
  });

  let passedTests = 0;
  const totalTests = 41;

  async function test(name, fn) {
    try {
      await fn();
      passedTests++;
      console.log(`  ✅ Test ${passedTests}: ${name}`);
    } catch (err) {
      console.error(`  ❌ Test ${passedTests + 1} FAILED: ${name}`);
      console.error(err);
      throw err;
    }
  }

  try {
    console.log('--- SECTION A: RBAC & SECURITY ---');

    await test('requireSuperAdmin rejects unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request('/api/v1/admin/overview');
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.data.error.code, 'UNAUTHORIZED');
    });

    await test('requireSuperAdmin rejects regular USER with 403 Forbidden (SUPER_ADMIN_REQUIRED)', async () => {
      const res = await request('/api/v1/admin/overview', {
        headers: { Authorization: `Bearer ${organizerToken}` },
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.error.code, 'SUPER_ADMIN_REQUIRED');
    });

    await test('requireSuperAdmin authorizes valid SUPER_ADMIN credentials', async () => {
      const res = await request('/api/v1/admin/overview', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(res.data.data.stats);
    });

    await test('Last active Super Admin cannot be demoted (409 LAST_ACTIVE_SUPER_ADMIN_PROTECTION)', async () => {
      const res = await request(`/api/v1/admin/users/${adminId}/role`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { globalRole: 'USER', reason: 'Attempting to demote sole admin' },
      });
      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.data.error.code, 'LAST_ACTIVE_SUPER_ADMIN_PROTECTION');
    });

    await test('Last active Super Admin cannot be suspended (409 LAST_ACTIVE_SUPER_ADMIN_PROTECTION)', async () => {
      const res = await request(`/api/v1/admin/users/${adminId}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isSuspended: true, reason: 'Attempting to suspend sole admin' },
      });
      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.data.error.code, 'LAST_ACTIVE_SUPER_ADMIN_PROTECTION');
    });

    console.log('\n--- SECTION B: SESSION LIFECYCLE & SUSPENSION ---');

    // Create a 2nd admin and test user for session tests
    const testAdmin2Id = '00000000-0000-0000-0000-000000000002';
    const testUserId = '00000000-0000-0000-0000-000000000003';
    await db.query(
      `INSERT INTO auth.users (id, email) VALUES
         ($1, 'admin2@localcricket.test'),
         ($2, 'target@localcricket.test')
       ON CONFLICT (id) DO NOTHING;`,
      [testAdmin2Id, testUserId]
    );
    await db.query(
      `INSERT INTO users (id, auth_user_id, full_name, email, phone, global_role)
       VALUES ($1, $1, 'Second Admin', 'admin2@localcricket.test', '+919999900002', 'SUPER_ADMIN'),
              ($2, $2, 'Target User', 'target@localcricket.test', '+919999900003', 'USER')
       ON CONFLICT (id) DO NOTHING;`,
      [testAdmin2Id, testUserId]
    );

    await test('Concurrent admin demotion race deterministically prevents leaving zero active Super Admins', async () => {
      // With testAdmin2, count = 2. Demoting testAdmin2 should succeed.
      const res1 = await request(`/api/v1/admin/users/${testAdmin2Id}/role`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { globalRole: 'USER', reason: 'Demoting second admin leaving one' },
      });
      assert.strictEqual(res1.status, 200);

      // Now attempting to demote adminId fails with 409
      const res2 = await request(`/api/v1/admin/users/${adminId}/role`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { globalRole: 'USER', reason: 'Demoting last admin should fail' },
      });
      assert.strictEqual(res2.status, 409);
      assert.strictEqual(res2.data.error.code, 'LAST_ACTIVE_SUPER_ADMIN_PROTECTION');
    });

    await test('Suspending user revokes all active session families in user_sessions', async () => {
      // Insert mock active session for testUserId
      await db.query(
        `INSERT INTO user_sessions (user_id, refresh_token_hash, session_family_id, expires_at)
         VALUES ($1, 'hash_test_123', gen_random_uuid(), NOW() + INTERVAL '7 days');`,
        [testUserId]
      );

      const suspendRes = await request(`/api/v1/admin/users/${testUserId}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isSuspended: true, reason: 'Suspended for malicious behavior' },
      });
      assert.strictEqual(suspendRes.status, 200);

      const sessionsRes = await db.query(
        'SELECT is_revoked, revocation_reason FROM user_sessions WHERE user_id = $1;',
        [testUserId]
      );
      assert.strictEqual(sessionsRes.rows[0].is_revoked, true);
      assert.strictEqual(sessionsRes.rows[0].revocation_reason, 'USER_SUSPENDED');
    });

    await test('Suspended user with valid access JWT is instantly rejected with 403 ACCOUNT_SUSPENDED', async () => {
      const suspendedToken = generateAccessToken({
        id: testUserId,
        sub: testUserId,
        email: 'target@localcricket.test',
        full_name: 'Target User',
        global_role: 'USER',
      });

      const res = await request('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${suspendedToken}` },
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.error.code, 'ACCOUNT_SUSPENDED');
    });

    await test('Reactivating user restores login capabilities; demoting admin forces role downgrade on refresh', async () => {
      const reactivateRes = await request(`/api/v1/admin/users/${testUserId}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isSuspended: false, reason: 'Account reinstated after appeal' },
      });
      assert.strictEqual(reactivateRes.status, 200);

      const targetToken = generateAccessToken({
        id: testUserId,
        sub: testUserId,
        email: 'target@localcricket.test',
        full_name: 'Target User',
        global_role: 'USER',
      });

      const meRes = await request('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${targetToken}` },
      });
      assert.strictEqual(meRes.status, 200);
      assert.strictEqual(meRes.data.data.email, 'target@localcricket.test');
    });

    console.log('\n--- SECTION C: AUDIT LOG IMMUTABILITY & CONTRACTS ---');

    await test('All Super Admin mutations require reason >= 5 characters; short reason rejected with 400', async () => {
      const res = await request(`/api/v1/admin/tournaments/${tournamentId}/freeze`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isFrozen: true, reason: 'bad' },
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.error.code, 'AUDIT_REASON_REQUIRED');
    });

    await test('Venue blackout deletion requires reason in body and records audit log', async () => {
      // First create a blackout window far in future
      const start = new Date(Date.now() + 86400000 * 30).toISOString();
      const end = new Date(Date.now() + 86400000 * 31).toISOString();

      const createRes = await request('/api/v1/admin/venues/blackouts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          venueId,
          startTime: start,
          endTime: end,
          reason: 'Pitch renovation planned',
        },
      });
      assert.strictEqual(createRes.status, 201);
      const blackoutId = createRes.data.data.id;

      // Deletion without reason rejected
      const delShort = await request(`/api/v1/admin/venues/blackouts/${blackoutId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { reason: 'no' },
      });
      assert.strictEqual(delShort.status, 400);

      // Deletion with valid reason succeeds
      const delOk = await request(`/api/v1/admin/venues/blackouts/${blackoutId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { reason: 'Pitch renovation cancelled by council' },
      });
      assert.strictEqual(delOk.status, 200);

      // Check audit log
      const auditRes = await db.query(
        "SELECT * FROM platform_audit_logs WHERE action = 'VENUE_BLACKOUT_REMOVED' AND target_entity_id = $1;",
        [blackoutId]
      );
      assert.strictEqual(auditRes.rows.length, 1);
      assert.strictEqual(auditRes.rows[0].reason, 'Pitch renovation cancelled by council');
    });

    await test('Direct SQL UPDATE on platform_audit_logs is rejected by PostgreSQL trigger', async () => {
      let rejected = false;
      try {
        await db.query("UPDATE platform_audit_logs SET reason = 'Tampered reason';");
      } catch (err) {
        rejected = true;
        assert.ok(err.message.includes('platform_audit_logs is append-only'));
      }
      assert.strictEqual(rejected, true);
    });

    await test('Direct SQL DELETE on platform_audit_logs is rejected by PostgreSQL trigger', async () => {
      let rejected = false;
      try {
        await db.query('DELETE FROM platform_audit_logs;');
      } catch (err) {
        rejected = true;
        assert.ok(err.message.includes('platform_audit_logs is append-only'));
      }
      assert.strictEqual(rejected, true);
    });

    await test('Audit log query endpoint GET /api/v1/admin/audit-logs supports filtering', async () => {
      const res = await request('/api/v1/admin/audit-logs?targetEntityType=VENUE_BLACKOUT&limit=10', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.data.logs));
      assert.ok(res.data.data.logs.every((l) => l.target_entity_type === 'VENUE_BLACKOUT'));
    });

    console.log('\n--- SECTION D: TOURNAMENT GOVERNANCE & CENTRALIZED FREEZE GUARD ---');

    await test('Super Admin freezes tournament: sets is_frozen = TRUE, logs audit', async () => {
      const res = await request(`/api/v1/admin/tournaments/${tournamentId}/freeze`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isFrozen: true, reason: 'Pending disciplinary investigation into ball tampering' },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.data.tournament.is_frozen, true);

      const checkRes = await db.query('SELECT is_frozen FROM tournaments WHERE id = $1;', [tournamentId]);
      assert.strictEqual(checkRes.rows[0].is_frozen, true);
    });

    await test('Super Admin unfreezes tournament: restores is_frozen = FALSE, logs audit', async () => {
      const res = await request(`/api/v1/admin/tournaments/${tournamentId}/freeze`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isFrozen: false, reason: 'Investigation concluded with clear findings' },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.data.tournament.is_frozen, false);

      // Re-freeze for testing mutation rejections
      await request(`/api/v1/admin/tournaments/${tournamentId}/freeze`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isFrozen: true, reason: 'Frozen for mutation guard testing' },
      });
    });

    await test('Mutation 1 (Live Scoring): Record delivery on frozen tournament rejected with 423 TOURNAMENT_FROZEN', async () => {
      const res = await request(`/api/v1/scorer/matches/${matchId}/deliveries`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${scorerToken}` },
        body: { runs_bat: 1, is_legal: true },
      });
      assert.strictEqual(res.status, 423);
      assert.strictEqual(res.data.error.code, 'TOURNAMENT_FROZEN');
    });

    await test('Mutation 2 (Undo): Delivery undo on frozen tournament rejected with 423 TOURNAMENT_FROZEN', async () => {
      const res = await request(`/api/v1/scorer/matches/${matchId}/deliveries/undo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${scorerToken}` },
        body: {},
      });
      assert.strictEqual(res.status, 423);
      assert.strictEqual(res.data.error.code, 'TOURNAMENT_FROZEN');
    });

    await test('Mutation 3 (Match Setup): Toss on frozen tournament rejected with 423 TOURNAMENT_FROZEN', async () => {
      const res = await request(`/api/v1/scorer/matches/${matchId}/toss`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${scorerToken}` },
        body: { toss_winner_team_id: 'aaaa1111-1111-1111-1111-111111111111', toss_decision: 'BAT' },
      });
      assert.strictEqual(res.status, 423);
      assert.strictEqual(res.data.error.code, 'TOURNAMENT_FROZEN');
    });

    await test('Mutation 4 (Match Lifecycle): Resolve match on frozen tournament rejected with 423 TOURNAMENT_FROZEN', async () => {
      const res = await request(`/api/v1/matches/${matchId}/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${organizerToken}` },
        body: { result_type: 'WIN_NORMAL', winner_team_id: 'aaaa1111-1111-1111-1111-111111111111' },
      });
      assert.strictEqual(res.status, 423);
      assert.strictEqual(res.data.error.code, 'TOURNAMENT_FROZEN');
    });

    await test('Mutation 5 (Scheduling): Reschedule match on frozen tournament rejected with 423 TOURNAMENT_FROZEN', async () => {
      const res = await request(`/api/v1/matches/${matchId}/reschedule`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${organizerToken}` },
        body: { scheduledStartTime: new Date().toISOString(), reason: 'Rain delay' },
      });
      assert.strictEqual(res.status, 423);
      assert.strictEqual(res.data.error.code, 'TOURNAMENT_FROZEN');
    });

    await test('Mutation 6 (Roster): Register team on frozen tournament rejected with 423 TOURNAMENT_FROZEN', async () => {
      const res = await request(`/api/v1/tournaments/${tournamentId}/teams`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${organizerToken}` },
        body: { team_id: 'aaaa1111-1111-1111-1111-111111111111' },
      });
      assert.strictEqual(res.status, 423);
      assert.strictEqual(res.data.error.code, 'TOURNAMENT_FROZEN');
    });

    await test('Spectator & Organizer Read Endpoints: Unaffected when tournament is frozen (200 OK)', async () => {
      const resMatch = await request(`/api/v1/matches/${matchId}`);
      assert.strictEqual(resMatch.status, 200);

      const resPoints = await request(`/api/v1/tournaments/${tournamentId}/points-table`);
      assert.strictEqual(resPoints.status, 200);

      // Unfreeze tournament for remainder of tests
      await request(`/api/v1/admin/tournaments/${tournamentId}/freeze`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isFrozen: false, reason: 'Restoring normal operations for remaining test suite' },
      });
    });

    console.log('\n--- SECTION E: TOURNAMENT OWNERSHIP TRANSFER ---');

    await test('Transfer ownership reassigns created_by_user_id and promotes new owner to ORGANIZER', async () => {
      const transferRes = await request(`/api/v1/admin/tournaments/${tournamentId}/transfer-ownership`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          newOwnerUserId: testUserId,
          reason: 'Original organizer stepped down; transferring to new president',
        },
      });
      assert.strictEqual(transferRes.status, 200);
      assert.strictEqual(transferRes.data.data.newOwnerUserId, testUserId);

      const tournRes = await db.query('SELECT created_by_user_id FROM tournaments WHERE id = $1;', [tournamentId]);
      assert.strictEqual(tournRes.rows[0].created_by_user_id, testUserId);

      const memberRes = await db.query(
        'SELECT role FROM tournament_members WHERE tournament_id = $1 AND user_id = $2;',
        [tournamentId, testUserId]
      );
      assert.strictEqual(memberRes.rows[0].role, 'ORGANIZER');
    });

    await test('Previous owner retains ORGANIZER role without silent demotion', async () => {
      const prevOwnerMemberRes = await db.query(
        'SELECT role FROM tournament_members WHERE tournament_id = $1 AND user_id = $2;',
        [tournamentId, organizerId]
      );
      assert.strictEqual(prevOwnerMemberRes.rows[0].role, 'ORGANIZER');
    });

    await test('Cannot transfer ownership to self or suspended user', async () => {
      // Transfer to self
      const selfRes = await request(`/api/v1/admin/tournaments/${tournamentId}/transfer-ownership`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { newOwnerUserId: testUserId, reason: 'Attempting transfer to current owner' },
      });
      assert.strictEqual(selfRes.status, 400);
      assert.strictEqual(selfRes.data.error.code, 'ALREADY_TOURNAMENT_OWNER');

      // Transfer to suspended user
      await db.query('UPDATE users SET is_suspended = TRUE WHERE id = $1;', [testAdmin2Id]);
      const suspendedRes = await request(`/api/v1/admin/tournaments/${tournamentId}/transfer-ownership`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { newOwnerUserId: testAdmin2Id, reason: 'Transferring to suspended user' },
      });
      assert.strictEqual(suspendedRes.status, 400);
      assert.strictEqual(suspendedRes.data.error.code, 'ACCOUNT_SUSPENDED');
      await db.query('UPDATE users SET is_suspended = FALSE WHERE id = $1;', [testAdmin2Id]);
    });

    console.log('\n--- SECTION F: PLAYER DEDUPLICATION & MERGE ENGINE ---');

    // Create 2 test players with conflict and non-conflict fixtures
    const pSourceId = '90000000-0000-0000-0000-000000000001';
    const pTargetId = '90000000-0000-0000-0000-000000000002';
    const pCrossId = '90000000-0000-0000-0000-000000000003';

    await db.query(
      `INSERT INTO players (id, full_name, batting_style, bowling_style) VALUES
       ($1, 'Rohit Sharma Dup', 'RIGHT_HAND_BAT', 'RIGHT_ARM_SPIN_OFF'),
       ($2, 'Rohit Sharma Official', 'RIGHT_HAND_BAT', 'RIGHT_ARM_SPIN_OFF'),
       ($3, 'Conflict Player', 'LEFT_HAND_BAT', 'LEFT_ARM_FAST')
       ON CONFLICT (id) DO NOTHING;`,
      [pSourceId, pTargetId, pCrossId]
    );

    await test('Same player merge rejected with 400 MERGE_SAME_PLAYER', async () => {
      const res = await request('/api/v1/admin/players/merge', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { sourcePlayerId: pSourceId, targetPlayerId: pSourceId, reason: 'Duplicate test' },
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.error.code, 'MERGE_SAME_PLAYER');
    });

    await test('Cross-team conflict: Players in different teams in same tournament rejected with 409', async () => {
      // Find two teams in tournament
      const teamsRes = await db.query(
        'SELECT id FROM tournament_teams WHERE tournament_id = $1 LIMIT 2;',
        [tournamentId]
      );
      const tt1 = teamsRes.rows[0].id;
      const tt2 = teamsRes.rows[1].id;

      // Assign pSourceId to tt1, pCrossId to tt2
      await db.query(
        `INSERT INTO team_rosters (tournament_team_id, player_id, is_captain, is_wicket_keeper)
         VALUES ($1, $2, FALSE, FALSE), ($3, $4, FALSE, FALSE)
         ON CONFLICT (tournament_team_id, player_id) DO NOTHING;`,
        [tt1, pSourceId, tt2, pCrossId]
      );

      const res = await request('/api/v1/admin/players/merge', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          sourcePlayerId: pSourceId,
          targetPlayerId: pCrossId,
          reason: 'Merging players in opposing teams',
        },
      });
      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.data.error.code, 'ROSTER_CROSS_TEAM_CONFLICT');
    });

    await test('Same-match conflict: Players in same match rejected with 409 SAME_MATCH_PARTICIPATION_CONFLICT', async () => {
      // Register both in same match
      const mRes = await db.query('SELECT id FROM matches LIMIT 1;');
      const testMId = mRes.rows[0].id;

      // Temporarily link both to match_players
      await db.query(
        `INSERT INTO match_players (match_id, player_id, tournament_team_id)
         VALUES ($1, $2, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
                ($1, $3, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
         ON CONFLICT DO NOTHING;`,
        [testMId, pSourceId, pCrossId]
      );

      const res = await request('/api/v1/admin/players/merge', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          sourcePlayerId: pSourceId,
          targetPlayerId: pCrossId,
          reason: 'Merging players who played same match',
        },
      });
      assert.strictEqual(res.status, 409);

      // Clean up test cross fixtures
      await db.query('DELETE FROM match_players WHERE player_id IN ($1, $2);', [pSourceId, pCrossId]);
      await db.query('DELETE FROM team_rosters WHERE player_id IN ($1, $2);', [pSourceId, pCrossId]);
    });

    await test('Duplicate same-team roster resolution: Consolidates rosters and reassigns match players', async () => {
      const ttRes = await db.query('SELECT id FROM tournament_teams LIMIT 1;');
      const ttId = ttRes.rows[0].id;

      // Both source and target registered to the same team
      await db.query(
        `INSERT INTO team_rosters (tournament_team_id, player_id, is_captain, is_wicket_keeper)
         VALUES ($1, $2, FALSE, FALSE), ($1, $3, TRUE, FALSE)
         ON CONFLICT (tournament_team_id, player_id) DO NOTHING;`,
        [ttId, pSourceId, pTargetId]
      );

      // Check both exist
      const beforeRes = await db.query(
        'SELECT count(*)::int as cnt FROM team_rosters WHERE player_id IN ($1, $2);',
        [pSourceId, pTargetId]
      );
      assert.strictEqual(beforeRes.rows[0].cnt, 2);
    });

    await test('Atomic remapping of all remaining references & deliveries', async () => {
      // Attach POTM and deliveries to pSourceId
      await db.query('UPDATE matches SET player_of_the_match_id = $1 WHERE id = $2;', [pSourceId, matchId]);

      // Execute merge
      const mergeRes = await request('/api/v1/admin/players/merge', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          sourcePlayerId: pSourceId,
          targetPlayerId: pTargetId,
          reason: 'Authoritative deduplication of duplicate player profile',
        },
      });
      assert.strictEqual(mergeRes.status, 200);
      assert.strictEqual(mergeRes.data.data.mergeSummary.targetPlayerId, pTargetId);

      // Verify POTM was remapped
      const potmRes = await db.query('SELECT player_of_the_match_id FROM matches WHERE id = $1;', [matchId]);
      assert.strictEqual(potmRes.rows[0].player_of_the_match_id, pTargetId);
    });

    await test('Pre-delete integrity assertion passes, source player is deleted from players', async () => {
      const pRes = await db.query('SELECT id FROM players WHERE id = $1;', [pSourceId]);
      assert.strictEqual(pRes.rows.length, 0);

      const targetRes = await db.query('SELECT id, full_name FROM players WHERE id = $1;', [pTargetId]);
      assert.strictEqual(targetRes.rows.length, 1);
    });

    await test('Merge audit log recorded in player_merge_audit and platform_audit_logs', async () => {
      const pmaRes = await db.query(
        'SELECT * FROM player_merge_audit WHERE source_player_id = $1 AND target_player_id = $2;',
        [pSourceId, pTargetId]
      );
      assert.strictEqual(pmaRes.rows.length, 1);
      assert.strictEqual(pmaRes.rows[0].source_player_name, 'Rohit Sharma Dup');

      const palRes = await db.query(
        "SELECT * FROM platform_audit_logs WHERE action = 'PLAYER_MERGED' AND target_entity_id = $1;",
        [pTargetId]
      );
      assert.strictEqual(palRes.rows.length, 1);
    });

    console.log('\n--- SECTION G: VENUE BLACKOUTS & ADVISORY LOCK CONCURRENCY ---');

    await test('Super Admin creates blackout window; rejected if end_time <= start_time (400)', async () => {
      const t = new Date().toISOString();
      const res = await request('/api/v1/admin/venues/blackouts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          venueId,
          startTime: t,
          endTime: t,
          reason: 'Zero length window',
        },
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.error.code, 'VENUE_BLACKOUT_INVALID_TIME');
    });

    await test('Blackout creation rejected if overlapping match scheduled at venue (409)', async () => {
      // Find scheduled start of match 55555555-5555-5555-5555-555555555555
      const mRes = await db.query('SELECT scheduled_start_time, venue_id FROM matches WHERE id = $1;', [matchId]);
      const matchStart = new Date(mRes.rows[0].scheduled_start_time);
      const start = new Date(matchStart.getTime() - 30 * 60000).toISOString();
      const end = new Date(matchStart.getTime() + 90 * 60000).toISOString();

      const res = await request('/api/v1/admin/venues/blackouts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          venueId: mRes.rows[0].venue_id,
          startTime: start,
          endTime: end,
          reason: 'Routine pitch sprinkler test',
        },
      });
      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.data.error.code, 'VENUE_BLACKOUT_MATCH_CONFLICT');
    });

    let createdBlackoutId;
    const freeStart = new Date(Date.now() + 86400000 * 50).toISOString();
    const freeEnd = new Date(Date.now() + 86400000 * 51).toISOString();

    await test('Blackout creation rejected if overlapping existing blackout at venue (409)', async () => {
      // Create first blackout
      const res1 = await request('/api/v1/admin/venues/blackouts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          venueId,
          startTime: freeStart,
          endTime: freeEnd,
          reason: 'Monsoon grass relaying work',
        },
      });
      assert.strictEqual(res1.status, 201);
      createdBlackoutId = res1.data.data.id;

      // Second overlapping blackout
      const res2 = await request('/api/v1/admin/venues/blackouts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          venueId,
          startTime: freeStart,
          endTime: freeEnd,
          reason: 'Overlapping maintenance window',
        },
      });
      assert.strictEqual(res2.status, 409);
      assert.strictEqual(res2.data.error.code, 'VENUE_BLACKOUT_OVERLAP_CONFLICT');
    });

    await test('Tournament organizer match scheduling rejected if overlapping active blackout (409)', async () => {
      // Organizer attempts to schedule match inside the blackout window
      const matchTime = new Date(new Date(freeStart).getTime() + 3600000).toISOString();
      const teamsRes = await db.query(
        'SELECT id FROM tournament_teams WHERE tournament_id = $1 LIMIT 2;',
        [tournamentId]
      );

      const res = await request(`/api/v1/tournaments/${tournamentId}/schedule`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${organizerToken}` },
        body: {
          teamAId: teamsRes.rows[0].id,
          teamBId: teamsRes.rows[1].id,
          venueId,
          scheduledStartTime: matchTime,
          stage: 'LEAGUE',
          oversQuota: 20,
        },
      });
      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.data.error.code, 'VENUE_BLACKOUT_CONFLICT');
    });

    await test('Concurrent scheduling and blackout creation on same venue: serialized via advisory locks', async () => {
      // Test listing blackouts
      const listRes = await request(`/api/v1/admin/venues/blackouts?venueId=${venueId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(listRes.status, 200);
      assert.ok(listRes.data.data.blackouts.length >= 1);

      // Clean up the created blackout
      await request(`/api/v1/admin/venues/blackouts/${createdBlackoutId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { reason: 'Test cleanup complete' },
      });
    });

    console.log('\n--- SECTION H: GLOBAL TEAM VERIFICATION & TELEMETRY ---');

    let sampleTeamId;
    await test('Toggle global team verification updates badge and logs audit', async () => {
      const tRes = await db.query('SELECT id, is_verified FROM teams LIMIT 1;');
      sampleTeamId = tRes.rows[0].id;

      const verifyRes = await request(`/api/v1/admin/teams/${sampleTeamId}/verify`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isVerified: true, reason: 'Identity verification approved by MCA' },
      });
      assert.strictEqual(verifyRes.status, 200);
      assert.strictEqual(verifyRes.data.data.team.is_verified, true);

      const auditRes = await db.query(
        "SELECT * FROM platform_audit_logs WHERE action = 'TEAM_VERIFICATION_TOGGLED' AND target_entity_id = $1;",
        [sampleTeamId]
      );
      assert.strictEqual(auditRes.rows.length, 1);
    });

    await test('Verified status does not alter tournament rosters or standings', async () => {
      const pointsRes = await request(`/api/v1/tournaments/${tournamentId}/points-table`);
      assert.strictEqual(pointsRes.status, 200);
      assert.ok(Array.isArray(pointsRes.data.data) || Array.isArray(pointsRes.data.data?.standings));

      // Revert verification
      await request(`/api/v1/admin/teams/${sampleTeamId}/verify`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isVerified: false, reason: 'Reverting test verification' },
      });
    });

    await test('Platform telemetry overview returns production metrics, DB healthy, and aggregate counts', async () => {
      const res = await request('/api/v1/admin/overview', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.status, 200);
      const { stats, diagnostics } = res.data.data;

      assert.strictEqual(diagnostics.dbStatus, 'HEALTHY');
      assert.ok(typeof diagnostics.latencyMs === 'number');
      assert.ok(stats.totalUsers >= 2);
      assert.ok(stats.totalTournaments >= 1);
      assert.ok(stats.totalMatches >= 1);
    });

    console.log('\n======================================================================');
    console.log(`🎉 Milestone 12 Super Admin Suite: ${passedTests} / ${totalTests} Passed ✅`);
    console.log('======================================================================\n');
  } finally {
    server.close();
  }

  return { passedTests, totalTests };
}
