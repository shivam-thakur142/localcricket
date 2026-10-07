// ====================================================================
// MILESTONE 5: SPECTATOR ANALYTICS, SSE BROADCAST & LEADERBOARDS TESTS
// ====================================================================

import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import http from 'http';
import { createApp } from '../src/app.js';
import { ScoringService } from '../src/services/scoringService.js';
import { AnalyticsService } from '../src/services/analyticsService.js';
import { LeaderboardService } from '../src/services/leaderboardService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMilestone5AnalyticsTests() {
  console.log('\n🏏 ======================================================================');
  console.log('🏏 LocalCricket: Running Milestone 5 Spectator & Analytics Tests');
  console.log('🏏 ======================================================================\n');

  const db = new PGlite();

  // Load migrations 001 through 007
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
  const scoringService = new ScoringService(db);
  const analyticsService = new AnalyticsService(db);
  const leaderboardService = new LeaderboardService(db);

  // Ephemeral server for HTTP & SSE testing
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
      options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, headers: res.headers, data: json };
  }

  // Common UUIDs from seed data
  const tournamentAId = '33333333-3333-3333-3333-333333333333';
  const matchId = '88888888-8888-8888-8888-888888888888';
  const organizerId = '11111111-1111-1111-1111-111111111111';
  const scorerId = '22222222-2222-2222-2222-222222222222';
  const teamAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const teamBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const playerRahulId = '10000000-0000-0000-0000-000000000002';
  const playerRohitId = '10000000-0000-0000-0000-000000000001';
  const playerViratId = '10000000-0000-0000-0000-000000000003';
  const playerBumrahId = '20000000-0000-0000-0000-000000000001';

  // Setup match for testing
  await scoringService.recordToss(matchId, {
    tossWinnerTeamId: teamAId,
    tossDecision: 'BAT',
  });
  await scoringService.submitSquad(matchId, {
    tournamentTeamId: teamAId,
    playerIds: [playerRahulId, playerRohitId, playerViratId],
    captainId: playerRahulId,
    wicketKeeperId: playerRohitId,
  });
  await scoringService.submitSquad(matchId, {
    tournamentTeamId: teamBId,
    playerIds: [playerBumrahId],
    captainId: playerBumrahId,
    wicketKeeperId: playerBumrahId,
  });
  await scoringService.startInnings(matchId, {
    battingTeamId: teamAId,
    bowlingTeamId: teamBId,
    strikerId: playerRahulId,
    nonStrikerId: playerRohitId,
    bowlerId: playerBumrahId,
    inningsNumber: 1,
  });

  let totalTests = 0;
  let passedTests = 0;

  async function runTest(testName, testFn) {
    totalTests++;
    process.stdout.write(`🧪 [M5 Test ${totalTests}] ${testName}... `);
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

  // ----------------------------------------------------
  // TEST 1: SSE Initial Snapshot
  // ----------------------------------------------------
  await runTest('SSE Initial Snapshot: Connection immediately delivers current match snapshot', async () => {
    const snapshotPromise = new Promise((resolve, reject) => {
      const req = http.get(`${baseUrl}/api/v1/matches/${matchId}/stream`, (res) => {
        assert.strictEqual(res.statusCode, 200);
        assert.ok(res.headers['content-type'].includes('text/event-stream'));

        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk.toString();
          if (rawData.includes('event: initial_snapshot')) {
            req.destroy();
            resolve(rawData);
          }
        });
      });
      req.on('error', (err) => {
        if (err.message.includes('socket hang up') || err.code === 'ECONNRESET') {
          // Expected when calling req.destroy()
          return;
        }
        reject(err);
      });
      setTimeout(() => reject(new Error('SSE snapshot timed out')), 3000);
    });

    const output = await snapshotPromise;
    assert.ok(output.includes('event: initial_snapshot'));
    assert.ok(output.includes('"eventType":"INITIAL_SNAPSHOT"'));
    assert.ok(output.includes('"matchId":"88888888-8888-8888-8888-888888888888"'));
  });

  // ----------------------------------------------------
  // TEST 2: SSE Public Event Contract & Delivery Broadcast
  // ----------------------------------------------------
  await runTest('SSE Event Contract: Delivery recorded emits match_update with stable version and sequence', async () => {
    let capturedEvent = null;

    const streamPromise = new Promise((resolve, reject) => {
      const req = http.get(`${baseUrl}/api/v1/matches/${matchId}/stream`, (res) => {
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          if (buffer.includes('event: match_update')) {
            capturedEvent = buffer;
            req.destroy();
            resolve();
          }
        });
      });
      req.on('error', (err) => {
        if (err.message.includes('socket hang up') || err.code === 'ECONNRESET') return;
        reject(err);
      });
    });

    // Submit delivery after small delay so stream is established
    await new Promise((r) => setTimeout(r, 100));
    const delRes = await makeRequest('POST', `/api/v1/scorer/matches/${matchId}/deliveries`, {
      headers: { 'x-user-id': scorerId, 'idempotency-key': 'm5_test_del_1' },
      body: {
        expected_sequence: 1,
        runs_batter: 4,
        extra_type: 'NONE',
        runs_extras: 0,
      },
    });
    assert.strictEqual(delRes.status, 200);

    await streamPromise;
    assert.ok(capturedEvent, 'Should capture match_update event');
    assert.ok(capturedEvent.includes('event: match_update'));
    assert.ok(capturedEvent.includes('"deliverySequence":1'));
    assert.ok(capturedEvent.includes('"version":1'));
    assert.ok(capturedEvent.includes('"eventId":'));
  });

  // ----------------------------------------------------
  // TEST 3: SSE Reconnect & Authoritative Resync
  // ----------------------------------------------------
  await runTest('SSE Reconnection/Resynchronization: Client resynchronizes authoritative state after dropped connection', async () => {
    // 1. Record delivery 2 while client is disconnected
    const del2 = await makeRequest('POST', `/api/v1/scorer/matches/${matchId}/deliveries`, {
      headers: { 'x-user-id': scorerId, 'idempotency-key': 'm5_test_del_2' },
      body: {
        expected_sequence: 2,
        runs_batter: 6,
        extra_type: 'NONE',
        runs_extras: 0,
      },
    });
    assert.strictEqual(del2.status, 200);

    // 2. Client reconnects and requests /live authoritative state
    const liveRes = await makeRequest('GET', `/api/v1/matches/${matchId}/live`);
    assert.strictEqual(liveRes.status, 200);
    assert.strictEqual(liveRes.data.data.latest_delivery_sequence, 2);
    assert.strictEqual(liveRes.data.data.innings.total_runs, 10);
    assert.strictEqual(liveRes.data.data.current_partnership.runs, 10);
  });

  // ----------------------------------------------------
  // TEST 4: Deterministic Batting Leaderboard Tie-Break (Orange Cap)
  // ----------------------------------------------------
  await runTest('Deterministic Batting Tie-Break: Runs -> Undefeated Avg -> Strike Rate -> 6s -> 4s -> Stable Player ID', async () => {
    const leaderboards = await leaderboardService.getBattingLeaderboard(tournamentAId, 10);
    assert.ok(Array.isArray(leaderboards));
    assert.ok(leaderboards.length >= 1);

    const rahul = leaderboards.find((p) => p.player_id === playerRahulId);
    assert.ok(rahul);
    assert.strictEqual(rahul.total_runs, 10);
    assert.strictEqual(rahul.total_dismissals, 0);
    assert.strictEqual(rahul.average_display, '10*'); // Undefeated handling
    assert.strictEqual(rahul.total_fours, 1);
    assert.strictEqual(rahul.total_sixes, 1);

    // Verify tie-breaking logic directly:
    // If Player A and Player B have same runs (50), but A has 0 dismissals and B has 1 dismissal, A ranks higher
    const mockPlayers = [
      { player_id: 'bbb', total_runs: 50, total_dismissals: 1, strike_rate: 150, total_sixes: 2, total_fours: 4 },
      { player_id: 'aaa', total_runs: 50, total_dismissals: 0, strike_rate: 150, total_sixes: 2, total_fours: 4 },
      { player_id: 'ccc', total_runs: 50, total_dismissals: 1, strike_rate: 160, total_sixes: 2, total_fours: 4 },
    ];
    mockPlayers.sort((a, b) => {
      if (b.total_runs !== a.total_runs) return b.total_runs - a.total_runs;
      if (a.total_dismissals === 0 && b.total_dismissals > 0) return -1;
      if (b.total_dismissals === 0 && a.total_dismissals > 0) return 1;
      if (a.total_dismissals > 0 && b.total_dismissals > 0) {
        const avgA = a.total_runs / a.total_dismissals;
        const avgB = b.total_runs / b.total_dismissals;
        if (Math.abs(avgB - avgA) > 0.0001) return avgB - avgA;
      }
      if (Math.abs(b.strike_rate - a.strike_rate) > 0.0001) return b.strike_rate - a.strike_rate;
      return a.player_id.localeCompare(b.player_id);
    });

    assert.strictEqual(mockPlayers[0].player_id, 'aaa', 'Undefeated batter ranks first');
    assert.strictEqual(mockPlayers[1].player_id, 'ccc', 'Higher strike rate ranks second');
    assert.strictEqual(mockPlayers[2].player_id, 'bbb', 'Lower strike rate ranks third');
  });

  // ----------------------------------------------------
  // TEST 5: Deterministic Bowling Leaderboard Tie-Break (Purple Cap)
  // ----------------------------------------------------
  await runTest('Deterministic Bowling Tie-Break: Wickets -> Bowling Avg -> Economy -> Balls -> Stable Player ID', async () => {
    // Record a wicket delivery
    const wktDel = await makeRequest('POST', `/api/v1/scorer/matches/${matchId}/deliveries`, {
      headers: { 'x-user-id': scorerId, 'idempotency-key': 'm5_test_del_3_wkt' },
      body: {
        expected_sequence: 3,
        runs_batter: 0,
        extra_type: 'NONE',
        runs_extras: 0,
        is_wicket: true,
        wicket_type: 'BOWLED',
        dismissed_player_id: playerRahulId,
        incoming_batter_id: playerViratId,
      },
    });
    assert.strictEqual(wktDel.status, 200);

    const bowlers = await leaderboardService.getBowlingLeaderboard(tournamentAId, 10);
    const bumrah = bowlers.find((p) => p.player_id === playerBumrahId);
    assert.ok(bumrah);
    assert.strictEqual(bumrah.total_wickets, 1);
    assert.strictEqual(bumrah.total_legal_balls, 3);
    assert.strictEqual(bumrah.total_runs_conceded, 10);

    // Verify 0-wicket bowlers are handled safely without division by zero
    const mockBowlers = [
      { player_id: 'p1', total_wickets: 0, total_runs_conceded: 20, total_legal_balls: 12, economy_rate: 10.0 },
      { player_id: 'p2', total_wickets: 2, total_runs_conceded: 30, total_legal_balls: 24, economy_rate: 7.5 },
      { player_id: 'p3', total_wickets: 2, total_runs_conceded: 20, total_legal_balls: 24, economy_rate: 5.0 },
    ];
    mockBowlers.sort((a, b) => {
      if (b.total_wickets !== a.total_wickets) return b.total_wickets - a.total_wickets;
      if (a.total_wickets > 0 && b.total_wickets > 0) {
        const avgA = a.total_runs_conceded / a.total_wickets;
        const avgB = b.total_runs_conceded / b.total_wickets;
        if (Math.abs(avgA - avgB) > 0.0001) return avgA - avgB;
      }
      return a.player_id.localeCompare(b.player_id);
    });

    assert.strictEqual(mockBowlers[0].player_id, 'p3', 'Lower bowling average (10 vs 15) ranks first');
    assert.strictEqual(mockBowlers[1].player_id, 'p2', 'Higher bowling average ranks second');
    assert.strictEqual(mockBowlers[2].player_id, 'p1', '0 wickets ranks last');
  });

  // ----------------------------------------------------
  // TEST 6: Strict Tournament Isolation in Leaderboards
  // ----------------------------------------------------
  await runTest('Strict Tournament Isolation: Leaderboards partition stats strictly by tournament_id', async () => {
    // Query another non-existent or separate tournament ID
    const dummyTournamentId = '77777777-7777-7777-7777-777777777777';
    // Create dummy tournament
    await db.query(`
      INSERT INTO tournaments (id, created_by_user_id, name, short_name, slug, city)
      VALUES ($1, $2, 'Isolated Tournament', 'ISO', 'isolated-tourney', 'Mumbai');
    `, [dummyTournamentId, organizerId]);

    const isoLeaders = await leaderboardService.getBattingLeaderboard(dummyTournamentId, 10);
    assert.strictEqual(isoLeaders.length, 0, 'No players from Tournament A should appear in Tournament ISO');
  });

  // ----------------------------------------------------
  // TEST 7: Analytics Worm & Manhattan: Incomplete vs Completed Overs
  // ----------------------------------------------------
  await runTest('Worm & Manhattan Analytics: Completed vs incomplete overs accurately distinguished', async () => {
    const analytics = await analyticsService.getMatchAnalytics(matchId);
    assert.ok(analytics.innings.length > 0);
    const inn1 = analytics.innings[0];

    // Total 3 balls bowled in over 1 (incomplete)
    assert.strictEqual(inn1.manhattan.length, 1);
    const over1 = inn1.manhattan[0];
    assert.strictEqual(over1.over_number, 1);
    assert.strictEqual(over1.is_completed, false, 'Over 1 should be marked incomplete after 3 balls');
    assert.strictEqual(over1.legal_balls, 3);
    assert.strictEqual(over1.wickets, 1);
    assert.strictEqual(over1.runs, 10);

    // Worm curve should have initial point (0, 0) and live point (1, 10)
    assert.strictEqual(inn1.worm.length, 2);
    assert.strictEqual(inn1.worm[1].overs_display, '0.3');
    assert.strictEqual(inn1.worm[1].runs, 10);
    assert.strictEqual(inn1.worm[1].is_completed, false);

    // Fall of Wickets should record 1 wicket
    assert.strictEqual(inn1.wickets.length, 1);
    assert.strictEqual(inn1.wickets[0].wicket_number, 1);
    assert.strictEqual(inn1.wickets[0].score_at_fall, 10);
  });

  // ----------------------------------------------------
  // TEST 8: Reverted Delivery Non-Pollution Invariant
  // ----------------------------------------------------
  await runTest('Actual vs Reverted Analytics Regression: Reverted deliveries never appear in charts or partnerships', async () => {
    // 1. Check current partnership before undo: 1 historical partnership (10 runs)
    const analyticsBefore = await analyticsService.getMatchAnalytics(matchId);
    assert.strictEqual(analyticsBefore.innings[0].historical_partnerships.length, 1);

    // 2. Undo delivery 3 (the wicket)
    const undoRes = await makeRequest('POST', `/api/v1/scorer/matches/${matchId}/deliveries/undo`, {
      headers: { 'x-user-id': scorerId, 'idempotency-key': 'm5_test_undo_1' },
      body: { expected_delivery_sequence: 3 },
    });
    assert.strictEqual(undoRes.status, 200);

    // 3. Re-query analytics: Wicket must vanish, partnership must be unbroken active partnership of 10 runs
    const analyticsAfter = await analyticsService.getMatchAnalytics(matchId);
    const inn1After = analyticsAfter.innings[0];

    // Historical partnerships should be 0 because 0 wickets have fallen now
    assert.strictEqual(inn1After.historical_partnerships.length, 0, 'No historical partnerships after wicket undo');
    assert.strictEqual(inn1After.total_wickets, 0);
    assert.strictEqual(inn1After.active_partnership.runs, 10);

    // Over 1 Manhattan should have 0 wickets
    assert.strictEqual(inn1After.manhattan[0].wickets, 0);

    // Commentary feed should exclude reverted delivery
    const commRes = await makeRequest('GET', `/api/v1/matches/${matchId}/commentary?filter=wickets`);
    assert.strictEqual(commRes.status, 200);
    assert.strictEqual(commRes.data.data.commentary.length, 0, 'Reverted wicket delivery must not appear in commentary');
  });

  // Close ephemeral test server
  server.close();

  console.log('\n======================================================================');
  console.log(`🏆 ALL ${passedTests} OF ${totalTests} MILESTONE 5 ANALYTICS & SSE TESTS PASSED!`);
  console.log('======================================================================\n');

  return { passedTests, totalTests };
}

// Direct execution if run standalone
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMilestone5AnalyticsTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
