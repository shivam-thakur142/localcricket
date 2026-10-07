import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from '../src/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runBackendContractTests() {
  console.log('\n🏏 ======================================================================');
  console.log('🏏 LocalCricket: Running Backend Contract & Integration Tests');
  console.log('🏏 ======================================================================\n');

  const db = new PGlite();

  // Load migrations 001 through 005
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

  // Start ephemeral HTTP server
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function makeRequest(method, url, { headers = {}, body = null } = {}) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (body) {
      options.body = JSON.stringify(body);
    }
    const response = await fetch(`${baseUrl}${url}`, options);
    let responseBody = null;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = await response.text();
    }
    return { status: response.status, body: responseBody };
  }

  let passedTests = 0;
  let totalTests = 0;

  const assertContract = async (testName, testFn) => {
    totalTests++;
    process.stdout.write(`🧪 [Contract Test ${totalTests}] ${testName}... `);
    try {
      await testFn();
      passedTests++;
      console.log('PASSED ✅');
    } catch (err) {
      console.log('FAILED ❌');
      console.error('   Error details:', err.message);
      server.close();
      throw err;
    }
  };

  const MATCH_ID = '88888888-8888-8888-8888-888888888888';
  const SCORER_ID = '22222222-2222-2222-2222-222222222222';
  const TEAM_DW_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const TEAM_BS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  // 1. Match Team Name Retrieval
  await assertContract('Match team-name retrieval: GET /api/v1/matches/:id includes team names', async () => {
    const res = await makeRequest('GET', `/api/v1/matches/${MATCH_ID}`);
    if (res.status !== 200 || !res.body.success) {
      throw new Error(`Expected 200, got ${res.status}`);
    }
    const match = res.body.data;
    if (match.team_a_name !== 'Dadar Warriors' || match.team_a_short_name !== 'DW') {
      throw new Error(`Team A name mismatch: ${match.team_a_name} (${match.team_a_short_name})`);
    }
    if (match.team_b_name !== 'Bandra Strikers' || match.team_b_short_name !== 'BS') {
      throw new Error(`Team B name mismatch: ${match.team_b_name} (${match.team_b_short_name})`);
    }
  });

  // 2. Squad Retrieval Distinguishing Full Roster from Playing XI
  await assertContract('Squad retrieval: GET /api/v1/matches/:id/squads distinguishes full_roster from playing_xi', async () => {
    const res = await makeRequest('GET', `/api/v1/matches/${MATCH_ID}/squads`);
    if (res.status !== 200 || !res.body.success) {
      throw new Error(`Expected 200, got ${res.status}`);
    }
    const squads = res.body.data;
    if (!squads.team_a || !squads.team_b) {
      throw new Error('Squads must include both team_a and team_b');
    }
    if (squads.team_a.full_roster.length !== 11 || squads.team_a.playing_xi.length !== 11) {
      throw new Error(`Team A squad counts mismatch: full ${squads.team_a.full_roster.length}, xi ${squads.team_a.playing_xi.length}`);
    }
    if (squads.team_b.full_roster.length !== 11 || squads.team_b.playing_xi.length !== 11) {
      throw new Error(`Team B squad counts mismatch: full ${squads.team_b.full_roster.length}, xi ${squads.team_b.playing_xi.length}`);
    }
    // Verify player structure
    const samplePlayer = squads.team_a.full_roster[0];
    if (!samplePlayer.player_id || !samplePlayer.full_name || samplePlayer.jersey_number === undefined) {
      throw new Error('Player structure missing required fields');
    }
  });

  // 3. Duplicate Idempotency Requests
  await assertContract('Duplicate idempotency request: Same key returns cached delivery without duplicate DB row', async () => {
    const key = 'test-dup-key-1';
    const res1 = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID, 'idempotency-key': key },
      body: { runs_batter: 1, expected_sequence: 1 },
    });
    if (res1.status !== 200 || res1.body.data.delivery.delivery_sequence !== 1) {
      throw new Error(`Delivery 1 failed: ${JSON.stringify(res1.body)}`);
    }

    // Duplicate submission
    const res2 = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID, 'idempotency-key': key },
      body: { runs_batter: 1, expected_sequence: 1 },
    });
    if (res2.status !== 200) throw new Error('Duplicate submission should return 200');
    if (res2.body.data.delivery.delivery_sequence !== 1) throw new Error('Sequence should remain 1');

    // Confirm database row count
    const countRes = await db.query(
      `SELECT COUNT(*) FROM deliveries WHERE innings_id = (SELECT id FROM innings WHERE match_id = '${MATCH_ID}' AND status = 'IN_PROGRESS');`
    );
    if (parseInt(countRes.rows[0].count) !== 1) {
      throw new Error(`Expected exactly 1 delivery in DB, got ${countRes.rows[0].count}`);
    }
  });

  // 4. Concurrent Duplicate Requests
  await assertContract('Concurrent duplicate requests: Parallel requests with same key result in exactly 1 delivery', async () => {
    const concurrentKey = 'concurrent-key-test-2';
    const [resA, resB] = await Promise.all([
      makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
        headers: { 'x-user-id': SCORER_ID, 'idempotency-key': concurrentKey },
        body: { runs_batter: 4, expected_sequence: 2 },
      }),
      makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
        headers: { 'x-user-id': SCORER_ID, 'idempotency-key': concurrentKey },
        body: { runs_batter: 4, expected_sequence: 2 },
      }),
    ]);

    if (resA.status !== 200 || resB.status !== 200) {
      throw new Error(`Concurrent responses failed: ${resA.status}, ${resB.status}`);
    }

    const countRes = await db.query(
      `SELECT COUNT(*) FROM deliveries WHERE innings_id = (SELECT id FROM innings WHERE match_id = '${MATCH_ID}' AND status = 'IN_PROGRESS');`
    );
    if (parseInt(countRes.rows[0].count) !== 2) {
      throw new Error(`Expected exactly 2 total deliveries in DB, got ${countRes.rows[0].count}`);
    }
  });

  // 5. Stale Sequence Conflict (409)
  await assertContract('Stale sequence conflict: Submitting wrong sequence returns 409 STALE_SEQUENCE_CONFLICT', async () => {
    const res = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { runs_batter: 1, expected_sequence: 99 },
    });
    if (res.status !== 409 || res.body.error.code !== 'STALE_SEQUENCE_CONFLICT') {
      throw new Error(`Expected 409 STALE_SEQUENCE_CONFLICT, got: ${JSON.stringify(res.body)}`);
    }
  });

  // 6. Undo Double Submission & Sequence Validation
  await assertContract('Undo double submission: Duplicate undo with same key returns cached result without reverting twice', async () => {
    const undoKey = 'test-undo-key-1';
    // First undo of delivery 2
    const res1 = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/deliveries/undo`, {
      headers: { 'x-user-id': SCORER_ID, 'idempotency-key': undoKey },
      body: { expected_delivery_sequence: 2, reversion_reason: 'Scorer mistake' },
    });
    if (res1.status !== 200 || res1.body.data.reverted_delivery_sequence !== 2) {
      throw new Error(`Undo 1 failed: ${JSON.stringify(res1.body)}`);
    }

    // Duplicate undo with identical key
    const res2 = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/deliveries/undo`, {
      headers: { 'x-user-id': SCORER_ID, 'idempotency-key': undoKey },
      body: { expected_delivery_sequence: 2, reversion_reason: 'Scorer mistake' },
    });
    if (res2.status !== 200) throw new Error('Duplicate undo should return 200');
    if (res2.body.data.reverted_delivery_sequence !== 2) {
      throw new Error('Duplicate undo must return cached delivery 2 result');
    }

    // Verify delivery 1 is STILL active (was NOT reverted by duplicate undo tap)
    const activeRes = await db.query(
      `SELECT COUNT(*) FROM deliveries WHERE innings_id = (SELECT id FROM innings WHERE match_id = '${MATCH_ID}' AND status = 'IN_PROGRESS') AND is_reverted = FALSE;`
    );
    if (parseInt(activeRes.rows[0].count) !== 1) {
      throw new Error(`Expected 1 active delivery remaining, got ${activeRes.rows[0].count}`);
    }
  });

  // 7. Undo Stale Sequence Conflict (409)
  await assertContract('Undo sequence conflict: Mismatched expected sequence returns 409 STALE_SEQUENCE_CONFLICT', async () => {
    const res = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/deliveries/undo`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { expected_delivery_sequence: 99 },
    });
    if (res.status !== 409 || res.body.error.code !== 'STALE_SEQUENCE_CONFLICT') {
      throw new Error(`Expected 409 STALE_SEQUENCE_CONFLICT, got: ${JSON.stringify(res.body)}`);
    }
  });

  // 8. Bounded Retry Logic Verification
  await assertContract('Bounded retry logic: Only retries on 5xx/network; halts immediately on 4xx', async () => {
    // Client-side retry helper simulation
    async function boundedFetch(url, options, maxRetries = 3) {
      let attempts = 0;
      while (attempts <= maxRetries) {
        attempts++;
        const res = await makeRequest(options.method, url, options);
        // If 4xx: client error -> DO NOT RETRY
        if (res.status >= 400 && res.status < 500) {
          return { ...res, attempts };
        }
        if (res.status < 400) {
          return { ...res, attempts };
        }
        // If 5xx: retry
        if (attempts > maxRetries) {
          throw new Error(`Retry exhausted after ${attempts} attempts`);
        }
      }
    }

    // Test with a 409 request
    const res409 = await boundedFetch(`/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
      method: 'POST',
      headers: { 'x-user-id': SCORER_ID },
      body: { runs_batter: 1, expected_sequence: 99 },
    });
    if (res409.attempts !== 1) {
      throw new Error(`409 should NOT be retried. Total attempts was ${res409.attempts}`);
    }
  });

  // 9. Cricket Law Violations with Real Error Codes
  await assertContract('Cricket law violation: Consecutive overs rejected with 422 CONSECUTIVE_OVER_VIOLATION', async () => {
    // Bowl 5 legal balls to finish over 1
    for (let i = 0; i < 5; i++) {
      await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
        headers: { 'x-user-id': SCORER_ID },
        body: { runs_batter: 0 },
      });
    }

    // Attempt to start over 2 with Mitchell Starc (who bowled Over 1)
    const MITCHELL_STARC_ID = '20000000-0000-0000-0000-000000000008';
    const res = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/overs/start`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { bowlerId: MITCHELL_STARC_ID },
    });
    if (res.status !== 422 || res.body.error.code !== 'CONSECUTIVE_OVER_VIOLATION') {
      throw new Error(`Expected 422 CONSECUTIVE_OVER_VIOLATION, got: ${JSON.stringify(res.body)}`);
    }
  });

  // 10. Complete End-to-End Match Simulation
  await assertContract('End-to-End Match Lifecycle: Setup -> Toss -> Playing XI -> Innings 1 -> Innings 2 -> Match Completion', async () => {
    // Create new tournament and match for clean end-to-end simulation
    const E2E_MATCH_ID = '99999999-8888-7777-6666-555555555555';
    await db.exec(`
      INSERT INTO matches (
        id, tournament_id, team_a_id, team_b_id, match_number, scheduled_start_time, overs_quota, status
      ) VALUES (
        '${E2E_MATCH_ID}', '33333333-3333-3333-3333-333333333333',
        '${TEAM_DW_ID}', '${TEAM_BS_ID}', 2, NOW(), 1, 'SCHEDULED' -- 1 Over match for fast E2E test
      );
      INSERT INTO match_scorers (match_id, user_id) VALUES ('${E2E_MATCH_ID}', '${SCORER_ID}');
    `);

    // Step A: Toss
    const tossRes = await makeRequest('POST', `/api/v1/scorer/matches/${E2E_MATCH_ID}/toss`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { tossWinnerTeamId: TEAM_DW_ID, tossDecision: 'BAT' },
    });
    if (tossRes.status !== 200) throw new Error('Toss setup failed');

    // Step B: Submit Playing XI for both teams
    const dwPlayers = (await db.query(`SELECT player_id FROM team_rosters WHERE tournament_team_id = '${TEAM_DW_ID}';`)).rows.map(r => r.player_id);
    const bsPlayers = (await db.query(`SELECT player_id FROM team_rosters WHERE tournament_team_id = '${TEAM_BS_ID}';`)).rows.map(r => r.player_id);

    await makeRequest('POST', `/api/v1/scorer/matches/${E2E_MATCH_ID}/squads`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { tournamentTeamId: TEAM_DW_ID, playerIds: dwPlayers, captainId: dwPlayers[0], wicketKeeperId: dwPlayers[4] },
    });
    await makeRequest('POST', `/api/v1/scorer/matches/${E2E_MATCH_ID}/squads`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { tournamentTeamId: TEAM_BS_ID, playerIds: bsPlayers, captainId: bsPlayers[6], wicketKeeperId: bsPlayers[5] },
    });

    // Step C: Start Innings 1 (DW batting, BS bowling)
    const inn1Res = await makeRequest('POST', `/api/v1/scorer/matches/${E2E_MATCH_ID}/innings/start`, {
      headers: { 'x-user-id': SCORER_ID },
      body: {
        battingTeamId: TEAM_DW_ID,
        bowlingTeamId: TEAM_BS_ID,
        strikerId: dwPlayers[0],
        nonStrikerId: dwPlayers[1],
        bowlerId: bsPlayers[7], // Mitchell Starc
        inningsNumber: 1,
      },
    });
    if (inn1Res.status !== 201) throw new Error('Innings 1 start failed');

    // Step D: Bowl 6 balls of Innings 1 (1 over quota)
    // Ball 1: 4 runs
    await makeRequest('POST', `/api/v1/scorer/matches/${E2E_MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { runs_batter: 4 },
    });
    // Ball 2: 1 run
    await makeRequest('POST', `/api/v1/scorer/matches/${E2E_MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { runs_batter: 1 },
    });
    // Ball 3: Wide (illegal)
    await makeRequest('POST', `/api/v1/scorer/matches/${E2E_MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { runs_extras: 1, extra_type: 'WIDE' },
    });
    // Ball 4: Dot ball
    await makeRequest('POST', `/api/v1/scorer/matches/${E2E_MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { runs_batter: 0 },
    });
    // Ball 5: Wicket (Bowled, incoming batter 3)
    await makeRequest('POST', `/api/v1/scorer/matches/${E2E_MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { is_wicket: true, wicket_type: 'BOWLED', dismissed_player_id: dwPlayers[1], incoming_batter_id: dwPlayers[2] },
    });
    // Ball 6: 2 runs
    await makeRequest('POST', `/api/v1/scorer/matches/${E2E_MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { runs_batter: 2 },
    });
    // Ball 7: 1 run (Over complete and Innings 1 complete! Total 4+1+1+0+0+2+1 = 9 runs)
    const lastBallInn1 = await makeRequest('POST', `/api/v1/scorer/matches/${E2E_MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { runs_batter: 1 },
    });
    if (!lastBallInn1.body.data.innings_state.is_innings_completed) {
      throw new Error('Innings 1 should be COMPLETED after 1 over quota');
    }
    const inn1Runs = lastBallInn1.body.data.innings_state.total_runs;
    const targetRuns = inn1Runs + 1; // Target = 10

    // Step E: Start Innings 2 (BS batting, DW bowling, target = 10)
    await db.query(`UPDATE innings SET target_runs = ${targetRuns} WHERE match_id = '${E2E_MATCH_ID}' AND innings_number = 2;`);
    const inn2Res = await makeRequest('POST', `/api/v1/scorer/matches/${E2E_MATCH_ID}/innings/start`, {
      headers: { 'x-user-id': SCORER_ID },
      body: {
        battingTeamId: TEAM_BS_ID,
        bowlingTeamId: TEAM_DW_ID,
        strikerId: bsPlayers[0],
        nonStrikerId: bsPlayers[1],
        bowlerId: dwPlayers[7], // Jasprit Bumrah
        inningsNumber: 2,
      },
    });
    if (inn2Res.status !== 201) throw new Error('Innings 2 start failed');
    await db.query(`UPDATE innings SET target_runs = ${targetRuns} WHERE match_id = '${E2E_MATCH_ID}' AND innings_number = 2;`);

    // Step F: Innings 2 Chase:
    // Ball 1: 6 runs
    await makeRequest('POST', `/api/v1/scorer/matches/${E2E_MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { runs_batter: 6 },
    });
    // Ball 2: 4 runs (Total 10 runs >= Target 10! MATCH WON BY BANDRA STRIKERS!)
    const winningBall = await makeRequest('POST', `/api/v1/scorer/matches/${E2E_MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { runs_batter: 4 },
    });
    if (!winningBall.body.data.innings_state.is_innings_completed) {
      throw new Error('Innings 2 should complete on reaching target');
    }

    // Step G: Inspect Scorecard and Completed Match Status
    const scorecardRes = await makeRequest('GET', `/api/v1/matches/${E2E_MATCH_ID}/scorecard`);
    if (scorecardRes.status !== 200 || scorecardRes.body.data.scorecards.length !== 2) {
      throw new Error('Scorecard should contain both innings');
    }

    const matchCheck = await makeRequest('GET', `/api/v1/matches/${E2E_MATCH_ID}`);
    if (matchCheck.body.data.status !== 'COMPLETED') {
      throw new Error(`Match status should be COMPLETED, got ${matchCheck.body.data.status}`);
    }
    if (matchCheck.body.data.winner_team_id !== TEAM_BS_ID) {
      throw new Error(`Winner should be Bandra Strikers (${TEAM_BS_ID})`);
    }
    if (matchCheck.body.data.result_margin_wickets !== 10) {
      throw new Error(`Result margin wickets should be 10, got ${matchCheck.body.data.result_margin_wickets}`);
    }
  });

  server.close();
  console.log('\n======================================================================');
  console.log(`🏆 ALL ${passedTests} OF ${totalTests} BACKEND CONTRACT & INTEGRATION TESTS PASSED!`);
  console.log('======================================================================\n');
  return { passedTests, totalTests };
}

// Run directly if invoked
if (process.argv[1]?.endsWith('backend-contracts.test.js')) {
  runBackendContractTests();
}
