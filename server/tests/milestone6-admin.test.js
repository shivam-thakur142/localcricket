// ====================================================================
// MILESTONE 6: TOURNAMENT ADMIN STUDIO & MATCH LIFECYCLE TESTS
// ====================================================================

import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import http from 'http';
import { createApp } from '../src/app.js';
import { TournamentService } from '../src/services/tournamentService.js';
import { MatchService } from '../src/services/matchService.js';
import { RosterService } from '../src/services/rosterService.js';
import { PointsTableService } from '../src/services/pointsTableService.js';
import { VenueService } from '../src/services/venueService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMilestone6AdminTests() {
  console.log('\n🏏 ======================================================================');
  console.log('🏏 LocalCricket: Running Milestone 6 Admin Studio & Lifecycle Tests');
  console.log('🏏 ======================================================================\n');

  const db = new PGlite();

  // Load migrations 001 through 008
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
  const tournamentService = new TournamentService(db);
  const matchService = new MatchService(db);
  const rosterService = new RosterService(db);
  const pointsTableService = new PointsTableService(db);
  const venueService = new VenueService(db);

  // Ephemeral server for HTTP testing
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Helper HTTP request function
  async function makeRequest(method, urlPath, { headers = {}, body = null } = {}) {
    const url = `${baseUrl}${urlPath}`;
    const options = {
      method,
      headers: { ...headers },
    };
    if (body) {
      options.headers['Content-Type'] = 'application/json';
    }

    return new Promise((resolve, reject) => {
      const req = http.request(url, options, (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let data = null;
          try {
            data = rawData ? JSON.parse(rawData) : null;
          } catch {
            data = rawData;
          }
          resolve({ status: res.statusCode, headers: res.headers, data });
        });
      });
      req.on('error', reject);
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  let totalTests = 0;
  let passedTests = 0;

  async function runTest(testName, testFn) {
    totalTests++;
    process.stdout.write(`🧪 [M6 Test ${totalTests}] ${testName}... `);
    try {
      await testFn();
      passedTests++;
      console.log('PASSED ✅');
    } catch (err) {
      console.log('FAILED ❌');
      console.error(err);
      throw err;
    }
  }

  // Pre-seeded references from Migration 004
  const organizerId = '11111111-1111-1111-1111-111111111111';
  const scorerId = '22222222-2222-2222-2222-222222222222';
  const tournamentAId = '33333333-3333-3333-3333-333333333333';
  const matchAId = '88888888-8888-8888-8888-888888888888';
  const teamDadarId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const teamBandraId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  // Create additional test users for testing RBAC and Scorer enrollment
  const newUserId = '99999999-9999-9999-9999-999999999999';
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'newuser@localcricket.test') ON CONFLICT DO NOTHING;`, [newUserId]);
  await db.query(
    `INSERT INTO users (id, auth_user_id, full_name, email, phone)
     VALUES ($1, $1, 'Ravi Shastri', 'newuser@localcricket.test', '+919876543299')
     ON CONFLICT DO NOTHING;`,
    [newUserId]
  );

  // ----------------------------------------------------
  // TEST 1: Public Tournament Directory API with Search & Filters
  // ----------------------------------------------------
  await runTest('Public Tournament Directory: GET /api/v1/tournaments with counts and filters', async () => {
    // 1. List all tournaments
    const allRes = await makeRequest('GET', '/api/v1/tournaments');
    assert.strictEqual(allRes.status, 200);
    assert.ok(Array.isArray(allRes.data.data));
    assert.ok(allRes.data.data.length >= 1);

    const seeded = allRes.data.data.find((t) => t.id === tournamentAId);
    assert.ok(seeded);
    assert.strictEqual(seeded.name, 'Shivaji Park Premier League 2026');
    assert.strictEqual(seeded.city, 'Mumbai');
    assert.strictEqual(seeded.teams_count, 2);
    assert.strictEqual(seeded.matches_count, 1);

    // 2. Filter by search
    const searchRes = await makeRequest('GET', '/api/v1/tournaments?search=Shivaji');
    assert.strictEqual(searchRes.status, 200);
    assert.strictEqual(searchRes.data.data.length, 1);

    // 3. Filter by city
    const cityRes = await makeRequest('GET', '/api/v1/tournaments?city=Mumbai');
    assert.strictEqual(cityRes.status, 200);
    assert.ok(cityRes.data.data.length >= 1);

    // 4. Filter by status
    const ongoingRes = await makeRequest('GET', '/api/v1/tournaments?status=ONGOING');
    assert.strictEqual(ongoingRes.status, 200);
    assert.ok(ongoingRes.data.data.length >= 1);
  });

  // ----------------------------------------------------
  // TEST 2: Tournament Lifecycle State Machine Validation & Immutability
  // ----------------------------------------------------
  await runTest('Tournament Lifecycle State Machine: Valid transitions and terminal immutability', async () => {
    // 1. Create a tournament in DRAFT status
    const createRes = await makeRequest('POST', '/api/v1/tournaments', {
      headers: { 'x-user-id': organizerId },
      body: {
        name: 'Monsoon Trophy 2026',
        short_name: 'MT26',
        city: 'Thane',
        status: 'DRAFT',
      },
    });
    assert.strictEqual(createRes.status, 201);
    const tournId = createRes.data.data.id;
    assert.strictEqual(createRes.data.data.status, 'DRAFT');

    // 2. Invalid transition: DRAFT -> COMPLETED rejected with 422
    const invalidRes = await makeRequest('PATCH', `/api/v1/tournaments/${tournId}/status`, {
      headers: { 'x-user-id': organizerId },
      body: { status: 'COMPLETED' },
    });
    assert.strictEqual(invalidRes.status, 422);
    assert.strictEqual(invalidRes.data.error.code, 'INVALID_LIFECYCLE_TRANSITION');

    // 3. Valid transition: DRAFT -> UPCOMING
    const upRes = await makeRequest('PATCH', `/api/v1/tournaments/${tournId}/status`, {
      headers: { 'x-user-id': organizerId },
      body: { status: 'UPCOMING' },
    });
    assert.strictEqual(upRes.status, 200);
    assert.strictEqual(upRes.data.data.status, 'UPCOMING');

    // 4. Valid transition: UPCOMING -> ONGOING
    const onRes = await makeRequest('PATCH', `/api/v1/tournaments/${tournId}/status`, {
      headers: { 'x-user-id': organizerId },
      body: { status: 'ONGOING' },
    });
    assert.strictEqual(onRes.status, 200);
    assert.strictEqual(onRes.data.data.status, 'ONGOING');

    // 5. Valid transition: ONGOING -> CANCELLED
    const canRes = await makeRequest('PATCH', `/api/v1/tournaments/${tournId}/status`, {
      headers: { 'x-user-id': organizerId },
      body: { status: 'CANCELLED' },
    });
    assert.strictEqual(canRes.status, 200);
    assert.strictEqual(canRes.data.data.status, 'CANCELLED');

    // 6. Terminal immutability: CANCELLED cannot transition to anything
    const terminalRes = await makeRequest('PATCH', `/api/v1/tournaments/${tournId}/status`, {
      headers: { 'x-user-id': organizerId },
      body: { status: 'ONGOING' },
    });
    assert.strictEqual(terminalRes.status, 422);
    assert.strictEqual(terminalRes.data.error.code, 'INVALID_LIFECYCLE_TRANSITION');
  });

  // ----------------------------------------------------
  // TEST 3: Venue Allocation & Cross-Tournament Ownership Enforcement
  // ----------------------------------------------------
  await runTest('Venue Allocation: Same-tournament ownership enforced, cross-tournament rejected with 422', async () => {
    // 1. Create venue for Tournament A
    const vResA = await makeRequest('POST', `/api/v1/tournaments/${tournamentAId}/venues`, {
      headers: { 'x-user-id': organizerId },
      body: {
        name: 'Wankhede Practice Ground',
        city: 'Mumbai',
        ground_name: 'Ground A',
      },
    });
    assert.strictEqual(vResA.status, 201);
    const venueAId = vResA.data.data.id;

    // 2. Allocate venue to Match A (both belong to Tournament A) -> 200 OK
    const allocRes = await makeRequest('PUT', `/api/v1/matches/${matchAId}/venue`, {
      headers: { 'x-user-id': organizerId },
      body: { venue_id: venueAId },
    });
    assert.strictEqual(allocRes.status, 200);
    assert.strictEqual(allocRes.data.data.venue_id, venueAId);

    // 3. Create Tournament B and a venue for Tournament B
    const createBRes = await makeRequest('POST', '/api/v1/tournaments', {
      headers: { 'x-user-id': organizerId },
      body: { name: 'Navi Mumbai Cup', short_name: 'NMC', city: 'Navi Mumbai' },
    });
    assert.strictEqual(createBRes.status, 201);
    const tournamentBId = createBRes.data.data.id;

    const vResB = await makeRequest('POST', `/api/v1/tournaments/${tournamentBId}/venues`, {
      headers: { 'x-user-id': organizerId },
      body: { name: 'DY Patil Stadium', city: 'Navi Mumbai' },
    });
    assert.strictEqual(vResB.status, 201);
    const venueBId = vResB.data.data.id;

    // 4. Attempt to allocate Tournament B's venue to Match A (Tournament A) -> 422 CROSS_TOURNAMENT_VENUE_ERROR
    const crossAllocRes = await makeRequest('PUT', `/api/v1/matches/${matchAId}/venue`, {
      headers: { 'x-user-id': organizerId },
      body: { venue_id: venueBId },
    });
    assert.strictEqual(crossAllocRes.status, 422);
    assert.strictEqual(crossAllocRes.data.error.code, 'CROSS_TOURNAMENT_VENUE_ERROR');
  });

  // ----------------------------------------------------
  // TEST 4: Global Teams & Players Registry
  // ----------------------------------------------------
  await runTest('Global Registry: Teams and Players creation and listing', async () => {
    // 1. Create global team
    const teamRes = await makeRequest('POST', '/api/v1/teams', {
      headers: { 'x-user-id': organizerId },
      body: { name: 'Pune Panthers', short_name: 'PP', city: 'Pune' },
    });
    assert.strictEqual(teamRes.status, 201);
    assert.strictEqual(teamRes.data.data.name, 'Pune Panthers');

    // 2. List global teams
    const teamsList = await makeRequest('GET', '/api/v1/teams?search=Pune');
    assert.strictEqual(teamsList.status, 200);
    assert.strictEqual(teamsList.data.data.length, 1);

    // 3. Create global player
    const playerRes = await makeRequest('POST', '/api/v1/players', {
      headers: { 'x-user-id': organizerId },
      body: {
        full_name: 'Sanju Samson',
        batting_style: 'RIGHT_HAND_BAT',
        primary_role: 'WICKET_KEEPER',
      },
    });
    assert.strictEqual(playerRes.status, 201);
    assert.strictEqual(playerRes.data.data.full_name, 'Sanju Samson');

    // 4. List global players
    const playersList = await makeRequest('GET', '/api/v1/players?search=Samson');
    assert.strictEqual(playersList.status, 200);
    assert.strictEqual(playersList.data.data.length, 1);
  });

  // ----------------------------------------------------
  // TEST 5: Scorer Assignment & Tournament Membership Verification
  // ----------------------------------------------------
  await runTest('Scorer Assignment: Requires tournament membership; non-member rejected with 422', async () => {
    // 1. Attempt to assign newUserId (not a tournament member) to matchA -> 422 INVALID_SCORER_MEMBERSHIP
    const assignFailRes = await makeRequest('POST', `/api/v1/matches/${matchAId}/scorers`, {
      headers: { 'x-user-id': organizerId },
      body: { user_id: newUserId },
    });
    assert.strictEqual(assignFailRes.status, 422);
    assert.strictEqual(assignFailRes.data.error.code, 'INVALID_SCORER_MEMBERSHIP');

    // 2. Add newUserId as SCORER member in Tournament A
    const addMemRes = await makeRequest('POST', `/api/v1/tournaments/${tournamentAId}/members`, {
      headers: { 'x-user-id': organizerId },
      body: { userId: newUserId, role: 'SCORER' },
    });
    assert.strictEqual(addMemRes.status, 201);

    // 3. Now assign newUserId to matchA -> 201 Created
    const assignSuccessRes = await makeRequest('POST', `/api/v1/matches/${matchAId}/scorers`, {
      headers: { 'x-user-id': organizerId },
      body: { user_id: newUserId },
    });
    assert.strictEqual(assignSuccessRes.status, 201);

    // 4. List match scorers -> contains newUserId
    const listScorersRes = await makeRequest('GET', `/api/v1/matches/${matchAId}/scorers`, {
      headers: { 'x-user-id': organizerId },
    });
    assert.strictEqual(listScorersRes.status, 200);
    const assigned = listScorersRes.data.data.find((s) => s.user_id === newUserId);
    assert.ok(assigned);
  });

  // ----------------------------------------------------
  // TEST 6: Match Resolution & Abandonment (Operational ABANDONED vs Result NO_RESULT)
  // ----------------------------------------------------
  await runTest('Match Abandonment: Operational ABANDONED, result NO_RESULT, atomic points table & audit', async () => {
    // 1. Schedule a new fixture for Tournament A
    const schedRes = await makeRequest('POST', `/api/v1/tournaments/${tournamentAId}/matches`, {
      headers: { 'x-user-id': organizerId },
      body: {
        team_a_id: teamDadarId,
        team_b_id: teamBandraId,
        match_number: 10,
        stage: 'LEAGUE',
        scheduled_start_time: new Date().toISOString(),
        overs_quota: 20,
      },
    });
    assert.strictEqual(schedRes.status, 201);
    const newMatchId = schedRes.data.data.id;

    // Get baseline points table
    const ptsBefore = await pointsTableService.getPointsTable(tournamentAId);
    const dadarPtsBefore = ptsBefore.find((p) => p.tournament_team_id === teamDadarId)?.points || 0;
    const bandraPtsBefore = ptsBefore.find((p) => p.tournament_team_id === teamBandraId)?.points || 0;

    // 2. Resolve match as ABANDONED
    const resolveRes = await makeRequest('POST', `/api/v1/matches/${newMatchId}/resolve`, {
      headers: { 'x-user-id': organizerId },
      body: {
        status: 'ABANDONED',
        abandonmentReason: 'Waterlogged outfield due to unseasonal rain',
      },
    });
    assert.strictEqual(resolveRes.status, 200);
    assert.strictEqual(resolveRes.data.data.status, 'ABANDONED');
    assert.strictEqual(resolveRes.data.data.result_type, 'NO_RESULT');
    assert.strictEqual(resolveRes.data.data.abandonment_reason, 'Waterlogged outfield due to unseasonal rain');

    // 3. Verify Points Table: Both teams receive 1 point, 0 runs, 0 overs to NRR
    const ptsAfter = await pointsTableService.getPointsTable(tournamentAId);
    const dadarPtsAfter = ptsAfter.find((p) => p.tournament_team_id === teamDadarId);
    const bandraPtsAfter = ptsAfter.find((p) => p.tournament_team_id === teamBandraId);

    assert.strictEqual(dadarPtsAfter.points, dadarPtsBefore + 1);
    assert.strictEqual(bandraPtsAfter.points, bandraPtsBefore + 1);
    assert.strictEqual(dadarPtsAfter.matches_no_result, 1);
    assert.strictEqual(bandraPtsAfter.matches_no_result, 1);

    // 4. Verify Audit Trail record
    const auditRes = await makeRequest('GET', `/api/v1/matches/${newMatchId}/audit`);
    assert.strictEqual(auditRes.status, 200);
    assert.ok(Array.isArray(auditRes.data.data));
    assert.strictEqual(auditRes.data.data.length, 1);
    assert.strictEqual(auditRes.data.data[0].previous_status, 'SCHEDULED');
    assert.strictEqual(auditRes.data.data[0].new_status, 'ABANDONED');
    assert.strictEqual(auditRes.data.data[0].result_type, 'NO_RESULT');
    assert.strictEqual(auditRes.data.data[0].reason, 'Waterlogged outfield due to unseasonal rain');
  });

  // ----------------------------------------------------
  // TEST 7: POTM Playing XI Validation & Terminal Re-resolution Guards
  // ----------------------------------------------------
  await runTest('Resolution Guards: Invalid POTM rejected, terminal re-resolution rejected, AWARDED rejected', async () => {
    // 1. Schedule another match
    const schedRes = await makeRequest('POST', `/api/v1/tournaments/${tournamentAId}/matches`, {
      headers: { 'x-user-id': organizerId },
      body: {
        team_a_id: teamDadarId,
        team_b_id: teamBandraId,
        match_number: 11,
        stage: 'LEAGUE',
        scheduled_start_time: new Date().toISOString(),
        overs_quota: 20,
      },
    });
    const match11Id = schedRes.data.data.id;

    // 2. Reject AWARDED result type with 422
    const awardedRes = await makeRequest('POST', `/api/v1/matches/${match11Id}/resolve`, {
      headers: { 'x-user-id': organizerId },
      body: {
        status: 'COMPLETED',
        resultType: 'AWARDED',
      },
    });
    assert.strictEqual(awardedRes.status, 422);
    assert.strictEqual(awardedRes.data.error.code, 'UNSUPPORTED_RESULT_TYPE');

    // 3. Reject playerOfTheMatchId when player is not in confirmed playing XI (match has no playing XI set)
    const unconfirmedPlayerId = '10000000-0000-0000-0000-000000000001'; // Rohit Varma
    const potmFailRes = await makeRequest('POST', `/api/v1/matches/${match11Id}/resolve`, {
      headers: { 'x-user-id': organizerId },
      body: {
        status: 'COMPLETED',
        resultType: 'WIN_DEFEND',
        winnerTeamId: teamDadarId,
        resultMarginRuns: 25,
        playerOfTheMatchId: unconfirmedPlayerId,
      },
    });
    assert.strictEqual(potmFailRes.status, 422);
    assert.strictEqual(potmFailRes.data.error.code, 'INVALID_POTM_PLAYER');

    // 4. Resolve successfully without POTM
    const completeRes = await makeRequest('POST', `/api/v1/matches/${match11Id}/resolve`, {
      headers: { 'x-user-id': organizerId },
      body: {
        status: 'COMPLETED',
        resultType: 'WIN_DEFEND',
        winnerTeamId: teamDadarId,
        resultMarginRuns: 25,
      },
    });
    assert.strictEqual(completeRes.status, 200);
    assert.strictEqual(completeRes.data.data.status, 'COMPLETED');

    // 5. Attempting to re-resolve terminal COMPLETED match -> 422 MATCH_ALREADY_RESOLVED
    const reResolveRes = await makeRequest('POST', `/api/v1/matches/${match11Id}/resolve`, {
      headers: { 'x-user-id': organizerId },
      body: {
        status: 'ABANDONED',
      },
    });
    assert.strictEqual(reResolveRes.status, 422);
    assert.strictEqual(reResolveRes.data.error.code, 'MATCH_ALREADY_RESOLVED');
  });

  // ----------------------------------------------------
  // TEST 8: Global Live Matches Ticker API
  // ----------------------------------------------------
  await runTest('Live Ticker: GET /api/v1/matches/live returns matches in IN_PROGRESS and INNINGS_BREAK', async () => {
    // Match A (matchAId) was seeded as IN_PROGRESS in migration 004
    const liveRes = await makeRequest('GET', '/api/v1/matches/live');
    assert.strictEqual(liveRes.status, 200);
    assert.ok(Array.isArray(liveRes.data.data));

    const liveMatch = liveRes.data.data.find((m) => m.id === matchAId);
    assert.ok(liveMatch);
    assert.strictEqual(liveMatch.tournament_name, 'Shivaji Park Premier League 2026');
    assert.strictEqual(liveMatch.team_a_name, 'Dadar Warriors');
    assert.strictEqual(liveMatch.team_b_name, 'Bandra Strikers');
    assert.strictEqual(liveMatch.status, 'IN_PROGRESS');
  });

  // Close server
  await new Promise((resolve) => server.close(resolve));

  console.log('\n======================================================================');
  console.log(`🏆 ALL ${passedTests} OF ${totalTests} MILESTONE 6 ADMIN TESTS PASSED!`);
  console.log('======================================================================\n');

  return { totalTests, passedTests };
}

// Auto-run if executed directly
if (process.argv[1] && process.argv[1].endsWith('milestone6-admin.test.js')) {
  runMilestone6AdminTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
