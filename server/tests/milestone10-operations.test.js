// ====================================================================
// MILESTONE 10: TOURNAMENT OPERATIONS, CONCURRENCY-SAFE SCHEDULING,
// OFFICIALS, SQUADS & ARCHIVE EXPORT TESTS
// ====================================================================

import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMilestone10OperationsTests() {
  console.log('\n🏏 ======================================================================');
  console.log('🏏 LocalCricket: Running Milestone 10 Tournament Operations Tests');
  console.log('🏏 ======================================================================\n');

  // Initialize fresh in-memory database
  const db = new PGlite();

  // Run all migrations including 012
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

  let passedTests = 0;
  let totalTests = 0;

  async function assertTest(name, fn) {
    totalTests++;
    process.stdout.write(`🧪 [M10 Test ${totalTests}] ${name}... `);
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

  try {
    // Setup test actors and IDs
    const organizerId = '11111111-1111-1111-1111-111111111111';
    const scorerId = '22222222-2222-2222-2222-222222222222';
    const tournamentId = '33333333-3333-3333-3333-333333333333';

    // Seed additional users: Umpire, Referee, Spectator
    const umpireUserId = '99999999-1111-1111-1111-111111111111';
    const refereeUserId = '99999999-2222-2222-2222-222222222222';
    const viewerUserId = '99999999-3333-3333-3333-333333333333';

    await db.query(`
      INSERT INTO auth.users (id, email)
      VALUES
        ($1, 'umpire@test.local'),
        ($2, 'referee@test.local'),
        ($3, 'fan@test.local')
      ON CONFLICT (id) DO NOTHING;
    `, [umpireUserId, refereeUserId, viewerUserId]);

    await db.query(`
      INSERT INTO users (id, auth_user_id, full_name, email, phone, global_role)
      VALUES
        ($1, $1, 'Nitin Menon (Umpire)', 'umpire@test.local', '+919876543290', 'USER'),
        ($2, $2, 'Javagal Srinath (Referee)', 'referee@test.local', '+919876543291', 'USER'),
        ($3, $3, 'Regular Fan (Viewer)', 'fan@test.local', '+919876543292', 'USER')
      ON CONFLICT (id) DO NOTHING;
    `, [umpireUserId, refereeUserId, viewerUserId]);

    // Enroll in tournament_members
    await db.query(`
      INSERT INTO tournament_members (tournament_id, user_id, role)
      VALUES
        ($1, $2, 'UMPIRE'),
        ($1, $3, 'REFEREE'),
        ($1, $4, 'VIEWER')
      ON CONFLICT (tournament_id, user_id) DO NOTHING;
    `, [tournamentId, umpireUserId, refereeUserId, viewerUserId]);

    // Seed Venue
    const vRes = await db.query(`
      INSERT INTO venues (tournament_id, name, city)
      VALUES ($1, 'Wankhede Stadium', 'Mumbai')
      RETURNING id;
    `, [tournamentId]);
    const venueId = vRes.rows[0].id;

    // Team IDs from migration 004
    const ttAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const ttBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    let scheduledMatchId = null;
    const matchStartTime = new Date(Date.now() + 86400000).toISOString(); // Tomorrow

    // ==================================================================
    // TEST 1: Concurrency-Safe Match Scheduling with Duration Snapshot
    // ==================================================================
    await assertTest('Concurrency-Safe Match Scheduling: Duration snapshot (188 min) & advisory locks', async () => {
      const res = await request(`/api/v1/tournaments/${tournamentId}/schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          teamAId: ttAId,
          teamBId: ttBId,
          venueId,
          scheduledStartTime: matchStartTime,
          stage: 'LEAGUE',
        },
      });

      assert.strictEqual(res.status, 201);
      assert.ok(res.data.success);
      assert.strictEqual(res.data.data.status, 'SCHEDULED');
      // For 20 overs: max(60, round(20 * 2 * 4.2 + 20)) = 188
      assert.strictEqual(res.data.data.estimated_duration_minutes, 188);

      scheduledMatchId = res.data.data.id;

      // Verify audit log
      const auditRes = await db.query(
        `SELECT * FROM tournament_operations_audit WHERE tournament_id = $1 AND action = 'MATCH_SCHEDULED';`,
        [tournamentId]
      );
      assert.ok(auditRes.rows.length >= 1);
      assert.strictEqual(auditRes.rows[0].match_id, scheduledMatchId);
    });

    // ==================================================================
    // TEST 2: Global Team Scheduling Clash Rejection
    // ==================================================================
    await assertTest('Global Team Scheduling Clash Rejection: Same team in overlapping window across tournaments', async () => {
      // Create Tournament 2
      const t2Res = await db.query(`
        INSERT INTO tournaments (
          created_by_user_id, name, short_name, slug, ball_type, format,
          overs_per_innings, balls_per_over, max_overs_per_bowler, city, status
        ) VALUES (
          $1, 'Inter-City Championship 2026', 'ICC26', 'icc-2026', 'LEATHER', 'T20',
          20, 6, 4, 'Pune', 'UPCOMING'
        ) RETURNING id;
      `, [organizerId]);
      const tournament2Id = t2Res.rows[0].id;

      await db.query(`
        INSERT INTO tournament_members (tournament_id, user_id, role)
        VALUES ($1, $2, 'ORGANIZER');
      `, [tournament2Id, organizerId]);

      // Enroll global Team A (Dadar Warriors: 44444444-4444-4444-4444-444444444444) and Team C (Andheri Lions)
      const ttA2Res = await db.query(`
        INSERT INTO tournament_teams (tournament_id, team_id, group_name)
        VALUES ($1, '44444444-4444-4444-4444-444444444444', 'Group 1')
        RETURNING id;
      `, [tournament2Id]);
      const ttA2Id = ttA2Res.rows[0].id;

      const ttC2Res = await db.query(`
        INSERT INTO tournament_teams (tournament_id, team_id, group_name)
        VALUES ($1, '66666666-6666-6666-6666-666666666666', 'Group 1')
        RETURNING id;
      `, [tournament2Id]);
      const ttC2Id = ttC2Res.rows[0].id;

      // Overlapping start time: +30 minutes into match 1
      const overlappingTime = new Date(new Date(matchStartTime).getTime() + 30 * 60000).toISOString();

      const clashRes = await request(`/api/v1/tournaments/${tournament2Id}/schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          teamAId: ttA2Id,
          teamBId: ttC2Id,
          scheduledStartTime: overlappingTime,
        },
      });

      assert.strictEqual(clashRes.status, 409);
      assert.ok(JSON.stringify(clashRes.data.error).includes('Team scheduling conflict'));
    });

    // ==================================================================
    // TEST 3: Venue Double-Booking Clash Rejection
    // ==================================================================
    await assertTest('Venue Double-Booking Clash Rejection: Two matches at same venue in overlapping window', async () => {
      // Register Team C into tournament 1
      const ttC1Res = await db.query(`
        INSERT INTO tournament_teams (tournament_id, team_id, group_name)
        VALUES ($1, '66666666-6666-6666-6666-666666666666', 'Group A')
        RETURNING id;
      `, [tournamentId]);
      const ttC1Id = ttC1Res.rows[0].id;

      // Create a 4th team for tournament 1
      const gTeam4 = await db.query(`
        INSERT INTO teams (name, short_name, city, created_by_user_id)
        VALUES ('Thane Tigers', 'TT', 'Thane', $1)
        RETURNING id;
      `, [organizerId]);
      const ttD1Res = await db.query(`
        INSERT INTO tournament_teams (tournament_id, team_id, group_name)
        VALUES ($1, $2, 'Group A')
        RETURNING id;
      `, [tournamentId, gTeam4.rows[0].id]);
      const ttD1Id = ttD1Res.rows[0].id;

      // Overlapping time (+60 min into match 1) at the same venueId
      const overlappingTime = new Date(new Date(matchStartTime).getTime() + 60 * 60000).toISOString();

      const venueClashRes = await request(`/api/v1/tournaments/${tournamentId}/schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          teamAId: ttC1Id,
          teamBId: ttD1Id,
          venueId,
          scheduledStartTime: overlappingTime,
        },
      });

      assert.strictEqual(venueClashRes.status, 409);
      assert.ok(JSON.stringify(venueClashRes.data.error).includes('Venue scheduling conflict'));
    });

    // ==================================================================
    // TEST 4: Concurrency Race-Condition Scheduling
    // ==================================================================
    await assertTest('Concurrency Race-Condition Scheduling: Concurrent booking for same slot yields 1 success, 1 conflict', async () => {
      // Pick a future slot + 3 days
      const concurrentSlot = new Date(Date.now() + 3 * 86400000).toISOString();

      const globalTeamC = '66666666-6666-6666-6666-666666666666';
      const ttCRes = await db.query('SELECT id FROM tournament_teams WHERE tournament_id = $1 AND team_id = $2;', [tournamentId, globalTeamC]);
      const ttCId = ttCRes.rows[0].id;

      const ttBRes = await db.query('SELECT id FROM tournament_teams WHERE tournament_id = $1 AND team_id = $2;', [tournamentId, '55555555-5555-5555-5555-555555555555']);
      const ttBId = ttBRes.rows[0].id;

      const [res1, res2] = await Promise.all([
        request(`/api/v1/tournaments/${tournamentId}/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': organizerId },
          body: { teamAId: ttCId, teamBId: ttBId, venueId, scheduledStartTime: concurrentSlot },
        }),
        request(`/api/v1/tournaments/${tournamentId}/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': organizerId },
          body: { teamAId: ttCId, teamBId: ttBId, venueId, scheduledStartTime: concurrentSlot },
        }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one must be 201 and one 409
      assert.deepStrictEqual(statuses, [201, 409]);
    });

    // ==================================================================
    // TEST 5: Fixture Rescheduling with Status Guard
    // ==================================================================
    await assertTest('Fixture Rescheduling with Status Guard: Rejects non-SCHEDULED fixtures; logs audit', async () => {
      // Reschedule scheduledMatchId to +5 days
      const newStartTime = new Date(Date.now() + 5 * 86400000).toISOString();
      const res = await request(`/api/v1/matches/${scheduledMatchId}/reschedule`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          scheduledStartTime: newStartTime,
          reason: 'Severe weather forecast - rescheduled to weekend slot',
        },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(new Date(res.data.data.scheduled_start_time).getTime(), new Date(newStartTime).getTime());

      // Status Guard: Create a completed match and attempt to reschedule
      const completedRes = await db.query(`
        INSERT INTO matches (
          tournament_id, match_number, team_a_id, team_b_id, scheduled_start_time, overs_quota, status, stage
        ) VALUES (
          $1, 99, $2, $3, NOW(), 20, 'COMPLETED', 'LEAGUE'
        ) RETURNING id;
      `, [tournamentId, ttAId, ttBId]);
      const completedMatchId = completedRes.rows[0].id;

      const rejectRes = await request(`/api/v1/matches/${completedMatchId}/reschedule`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          scheduledStartTime: newStartTime,
          reason: 'Attempt invalid reschedule',
        },
      });

      assert.strictEqual(rejectRes.status, 422);
      assert.ok(JSON.stringify(rejectRes.data.error).includes('Only SCHEDULED fixtures can be rescheduled'));
    });

    // ==================================================================
    // TEST 6: Official Role Eligibility Enforcement
    // ==================================================================
    await assertTest('Official Role Eligibility: Ineligible roles rejected (422); eligible UMPIRE accepted (201)', async () => {
      // Try assigning VIEWER as UMPIRE_1
      const failViewer = await request(`/api/v1/matches/${scheduledMatchId}/officials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          userId: viewerUserId,
          role: 'UMPIRE_1',
        },
      });
      assert.strictEqual(failViewer.status, 422);

      // Try assigning SCORER as UMPIRE_1
      const failScorer = await request(`/api/v1/matches/${scheduledMatchId}/officials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          userId: scorerId,
          role: 'UMPIRE_1',
        },
      });
      assert.strictEqual(failScorer.status, 422);

      // Assign Nitin Menon (UMPIRE) as UMPIRE_1
      const successUmpire = await request(`/api/v1/matches/${scheduledMatchId}/officials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          userId: umpireUserId,
          role: 'UMPIRE_1',
        },
      });
      assert.strictEqual(successUmpire.status, 201);
      assert.strictEqual(successUmpire.data.data.role, 'UMPIRE_1');
    });

    // ==================================================================
    // TEST 7: Official Concurrency Clash Rejection
    // ==================================================================
    await assertTest('Official Concurrency Clash Rejection: Same official cannot be appointed to overlapping matches', async () => {
      // Get the scheduled match's current start time
      const mData = await db.query('SELECT scheduled_start_time FROM matches WHERE id = $1;', [scheduledMatchId]);
      const mTime = mData.rows[0].scheduled_start_time;

      // Create a second match in Tournament 1 during overlapping window
      const m2Res = await db.query(`
        INSERT INTO matches (
          tournament_id, match_number, team_a_id, team_b_id, scheduled_start_time, estimated_duration_minutes, overs_quota, status, stage
        ) VALUES (
          $1, 101, $2, $3, $4, 180, 20, 'SCHEDULED', 'LEAGUE'
        ) RETURNING id;
      `, [tournamentId, ttAId, ttBId, mTime]);
      const match2Id = m2Res.rows[0].id;

      // Attempt to assign the same umpire to match 2
      const clashRes = await request(`/api/v1/matches/${match2Id}/officials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          userId: umpireUserId,
          role: 'UMPIRE_2',
        },
      });

      assert.strictEqual(clashRes.status, 409);
      assert.ok(JSON.stringify(clashRes.data.error).includes('Official scheduling conflict'));
    });

    // ==================================================================
    // TEST 8: Official Removal Audit Trail
    // ==================================================================
    await assertTest('Official Removal Audit Trail: Removal with mandatory reason updates audit trail', async () => {
      // Look up assignment id for Nitin Menon on scheduledMatchId
      const offRes = await db.query(
        'SELECT id FROM match_officials WHERE match_id = $1 AND user_id = $2;',
        [scheduledMatchId, umpireUserId]
      );
      assert.strictEqual(offRes.rows.length, 1);
      const assignmentId = offRes.rows[0].id;

      // Remove with reason
      const remRes = await request(`/api/v1/matches/${scheduledMatchId}/officials/${assignmentId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          reason: 'Umpire illness - replaced by reserve umpire',
        },
      });

      assert.strictEqual(remRes.status, 200);

      // Verify removal
      const checkRes = await db.query('SELECT * FROM match_officials WHERE id = $1;', [assignmentId]);
      assert.strictEqual(checkRes.rows.length, 0);

      // Verify audit log
      const auditRes = await db.query(
        `SELECT * FROM tournament_operations_audit WHERE tournament_id = $1 AND action = 'OFFICIAL_REMOVED';`,
        [tournamentId]
      );
      assert.ok(auditRes.rows.length >= 1);
      assert.ok(auditRes.rows[0].reason.includes('Umpire illness'));
    });

    // ==================================================================
    // TEST 9: Squad Verification Rules Engine
    // ==================================================================
    await assertTest('Squad Verification Rules Engine: 11-25 players and 1 captain required; rejects non-compliant', async () => {
      // Team A from seed migration has 11 players and exactly 1 captain
      const verifyResA = await request(`/api/v1/tournaments/${tournamentId}/teams/${ttAId}/verify-squad`, {
        method: 'POST',
        headers: {
          'x-user-id': organizerId,
        },
      });
      assert.strictEqual(verifyResA.status, 200);
      assert.strictEqual(verifyResA.data.data.squad_status, 'VERIFIED');

      // Create a team with only 5 players (non-compliant)
      const fakeTeam = await db.query(`
        INSERT INTO teams (name, short_name, city, created_by_user_id)
        VALUES ('Incomplete XI', 'INC', 'Mumbai', $1) RETURNING id;
      `, [organizerId]);
      const ttIncRes = await db.query(`
        INSERT INTO tournament_teams (tournament_id, team_id, squad_status)
        VALUES ($1, $2, 'DRAFT') RETURNING id;
      `, [tournamentId, fakeTeam.rows[0].id]);
      const ttIncId = ttIncRes.rows[0].id;

      // Add 5 players without captain
      const players = await db.query('SELECT id FROM players LIMIT 5;');
      for (const p of players.rows) {
        await db.query(`
          INSERT INTO team_rosters (tournament_team_id, player_id, is_captain)
          VALUES ($1, $2, FALSE);
        `, [ttIncId, p.id]);
      }

      const failVerify = await request(`/api/v1/tournaments/${tournamentId}/teams/${ttIncId}/verify-squad`, {
        method: 'POST',
        headers: {
          'x-user-id': organizerId,
        },
      });
      assert.strictEqual(failVerify.status, 422);
      assert.ok(JSON.stringify(failVerify.data.error).includes('11 active players') || JSON.stringify(failVerify.data.error).includes('captain'));
    });

    // ==================================================================
    // TEST 10: Lifecycle Lock on UPCOMING -> ONGOING
    // ==================================================================
    await assertTest('Lifecycle Lock on UPCOMING -> ONGOING: Transition locks all verified squads', async () => {
      // Create new tournament in UPCOMING status
      const uTournRes = await db.query(`
        INSERT INTO tournaments (
          created_by_user_id, name, short_name, slug, ball_type, format,
          overs_per_innings, balls_per_over, max_overs_per_bowler, city, status
        ) VALUES (
          $1, 'Upcoming Trophy 2026', 'UT26', 'ut-2026', 'TENNIS', 'T20',
          20, 6, 4, 'Nagpur', 'UPCOMING'
        ) RETURNING id;
      `, [organizerId]);
      const uTournId = uTournRes.rows[0].id;

      await db.query(`
        INSERT INTO tournament_members (tournament_id, user_id, role)
        VALUES ($1, $2, 'ORGANIZER');
      `, [uTournId, organizerId]);

      // Register team with VERIFIED squad_status
      const uTeamRes = await db.query(`
        INSERT INTO tournament_teams (tournament_id, team_id, squad_status)
        VALUES ($1, '44444444-4444-4444-4444-444444444444', 'VERIFIED')
        RETURNING id;
      `, [uTournId]);
      const uTournamentTeamId = uTeamRes.rows[0].id;

      // Transition tournament UPCOMING -> ONGOING
      const transitionRes = await request(`/api/v1/tournaments/${uTournId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          status: 'ONGOING',
        },
      });

      assert.strictEqual(transitionRes.status, 200);
      assert.strictEqual(transitionRes.data.data.status, 'ONGOING');

      // Verify that squad_status transitioned to LOCKED
      const squadCheck = await db.query(
        'SELECT squad_status FROM tournament_teams WHERE id = $1;',
        [uTournamentTeamId]
      );
      assert.strictEqual(squadCheck.rows[0].squad_status, 'LOCKED');
    });

    // ==================================================================
    // TEST 11: Locked Roster Overrides with Mandatory Reason
    // ==================================================================
    await assertTest('Locked Roster Overrides: Permitted mutation with reason logs to audit table', async () => {
      // Use Team A which has 11 players and 1 captain, set to LOCKED
      await db.query("UPDATE tournament_teams SET squad_status = 'LOCKED' WHERE id = $1;", [ttAId]);
      const lockedTeam = { id: ttAId, tournament_id: tournamentId };

      // Create a reserve player
      const newPlayerRes = await db.query(`
        INSERT INTO players (full_name, batting_style, bowling_style, primary_role)
        VALUES ('Reserve Player', 'RIGHT_HAND_BAT', 'RIGHT_ARM_MEDIUM', 'ALL_ROUNDER')
        RETURNING id;
      `);
      const newPlayerId = newPlayerRes.rows[0].id;

      const overrideRes = await request(`/api/v1/tournaments/${lockedTeam.tournament_id}/teams/${lockedTeam.id}/override-roster`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          action: 'ADD_PLAYER',
          playerId: newPlayerId,
          reason: 'Emergency injury replacement approved by tournament technical committee',
        },
      });

      assert.strictEqual(overrideRes.status, 200);
      assert.strictEqual(overrideRes.data.data.action, 'ADD_PLAYER');

      // Verify audit log
      const auditRes = await db.query(
        `SELECT * FROM tournament_operations_audit WHERE tournament_id = $1 AND action = 'SQUAD_ROSTER_OVERRIDE';`,
        [lockedTeam.tournament_id]
      );
      assert.ok(auditRes.rows.length >= 1);
      assert.ok(auditRes.rows[0].reason.includes('injury replacement'));
    });

    // ==================================================================
    // TEST 12: Locked Roster Override Reason Guard
    // ==================================================================
    await assertTest('Locked Roster Override Reason Guard: Rejects empty or whitespace reason (400)', async () => {
      const lockedTeamRes = await db.query("SELECT id, tournament_id FROM tournament_teams WHERE squad_status = 'LOCKED' LIMIT 1;");
      const lockedTeam = lockedTeamRes.rows[0];

      const failRes = await request(`/api/v1/tournaments/${lockedTeam.tournament_id}/teams/${lockedTeam.id}/override-roster`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          action: 'ADD_PLAYER',
          playerId: '10000000-0000-0000-0000-000000000001',
          reason: '   ',
        },
      });

      assert.strictEqual(failRes.status, 400);
      assert.ok(JSON.stringify(failRes.data.error).includes('non-empty reason'));
    });

    // ==================================================================
    // TEST 13: Repeatable Read Complete Tournament Archive Export
    // ==================================================================
    await assertTest('Repeatable Read Complete Tournament Archive Export: Valid snapshot JSON payload', async () => {
      const exportRes = await request(`/api/v1/tournaments/${tournamentId}/export`, {
        method: 'GET',
        headers: {
          'x-user-id': organizerId,
        },
      });

      assert.strictEqual(exportRes.status, 200);
      const archive = exportRes.data.data;

      assert.strictEqual(archive.metadata.export_version, '1.0');
      assert.strictEqual(archive.metadata.tournament_id, tournamentId);
      assert.ok(archive.tournament);
      assert.strictEqual(archive.tournament.id, tournamentId);
      assert.ok(Array.isArray(archive.teams));
      assert.ok(Array.isArray(archive.matches));
      assert.ok(Array.isArray(archive.standings));
      assert.ok(Array.isArray(archive.audit_log));
    });

    // ==================================================================
    // TEST 14: Archive Export Delivery Ledger Omission
    // ==================================================================
    await assertTest('Archive Export Delivery Ledger Omission: Innings summary present, raw deliveries excluded', async () => {
      const exportRes = await request(`/api/v1/tournaments/${tournamentId}/export`, {
        method: 'GET',
        headers: {
          'x-user-id': organizerId,
        },
      });

      assert.strictEqual(exportRes.status, 200);
      const archive = exportRes.data.data;

      for (const m of archive.matches) {
        if (m.innings && m.innings.length > 0) {
          for (const inn of m.innings) {
            assert.ok(inn.batting !== undefined, 'Innings must have batting performances');
            assert.ok(inn.bowling !== undefined, 'Innings must have bowling performances');
            assert.strictEqual(inn.deliveries, undefined, 'Deliveries ledger must be omitted from archive');
          }
        }
      }
    });

    // ==================================================================
    // TEST 15: Standings and Fixtures CSV Exports
    // ==================================================================
    await assertTest('Standings and Fixtures CSV Exports: Returns text/csv with authoritative headers', async () => {
      // Standings CSV
      const standingsRes = await request(`/api/v1/tournaments/${tournamentId}/export/standings.csv`, {
        method: 'GET',
        headers: {
          'x-user-id': organizerId,
        },
      });

      assert.strictEqual(standingsRes.status, 200);
      assert.ok(standingsRes.headers['content-type'].includes('text/csv'));
      assert.ok(typeof standingsRes.data === 'string');
      assert.ok(standingsRes.data.includes('Rank,Team,Group,Played,Won,Lost,Tied,No Result,Points,NRR'));

      // Fixtures CSV
      const fixturesRes = await request(`/api/v1/tournaments/${tournamentId}/export/fixtures.csv`, {
        method: 'GET',
        headers: {
          'x-user-id': organizerId,
        },
      });

      assert.strictEqual(fixturesRes.status, 200);
      assert.ok(fixturesRes.headers['content-type'].includes('text/csv'));
      assert.ok(typeof fixturesRes.data === 'string');
      assert.ok(fixturesRes.data.includes('Match Number,Stage,Team A,Team B,Venue,Scheduled Start,Status,Winner,Margin,Umpire 1,Umpire 2'));
    });

    // ==================================================================
    // TEST 16: Export RBAC Guard
    // ==================================================================
    await assertTest('Export RBAC Guard: Non-organizer caller receives 403 Forbidden', async () => {
      // Fan/Viewer caller
      const failJson = await request(`/api/v1/tournaments/${tournamentId}/export`, {
        method: 'GET',
        headers: {
          'x-user-id': viewerUserId,
        },
      });
      assert.strictEqual(failJson.status, 403);

      const failStandingsCsv = await request(`/api/v1/tournaments/${tournamentId}/export/standings.csv`, {
        method: 'GET',
        headers: {
          'x-user-id': viewerUserId,
        },
      });
      assert.strictEqual(failStandingsCsv.status, 403);

      const failFixturesCsv = await request(`/api/v1/tournaments/${tournamentId}/export/fixtures.csv`, {
        method: 'GET',
        headers: {
          'x-user-id': viewerUserId,
        },
      });
      assert.strictEqual(failFixturesCsv.status, 403);
    });

  } finally {
    server.close();
  }

  console.log('\n======================================================================');
  console.log(`🏆 ALL ${passedTests} OF ${totalTests} MILESTONE 10 OPERATIONS TESTS PASSED!`);
  console.log('======================================================================\n');

  return { passedTests, totalTests };
}
