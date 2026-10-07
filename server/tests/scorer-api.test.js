import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from '../src/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runApiTests() {
  console.log('\n🏏 ========================================================');
  console.log('🏏 LocalCricket: Running Milestone 2 Scorer API Integration Tests');
  console.log('🏏 ========================================================\n');

  const db = new PGlite();

  // Load all migrations including 005_idempotency_keys.sql
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

  // Create Express application
  const app = createApp(db);

  // Start ephemeral HTTP server for end-to-end testing
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Helper function to dispatch HTTP requests
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

  const assertApi = async (testName, testFn) => {
    totalTests++;
    process.stdout.write(`🧪 [API Test ${totalTests}] ${testName}... `);
    try {
      await testFn();
      passedTests++;
      console.log('PASSED ✅');
    } catch (err) {
      console.log('FAILED ❌');
      console.error('   Error details:', err.message);
      throw err;
    }
  };

  const MATCH_ID = '88888888-8888-8888-8888-888888888888';
  const SCORER_ID = '22222222-2222-2222-2222-222222222222';
  const ORGANIZER_ID = '11111111-1111-1111-1111-111111111111';
  const UNAUTHORIZED_USER_ID = '33333333-0000-0000-0000-000000000001';

  // Create a third unrelated user in users
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${UNAUTHORIZED_USER_ID}', 'fan@test.local') ON CONFLICT DO NOTHING;
    INSERT INTO users (id, auth_user_id, full_name, email, global_role)
    VALUES ('${UNAUTHORIZED_USER_ID}', '${UNAUTHORIZED_USER_ID}', 'Public Fan', 'fan@test.local', 'USER')
    ON CONFLICT DO NOTHING;
  `);

  console.log('--- TEST GROUP 1: AUTHENTICATION & RBAC ENFORCEMENT ---');

  await assertApi('Reject scoring request without authentication (401 Unauthorized)', async () => {
    const res = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/toss`, {
      body: { tossWinnerTeamId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', tossDecision: 'BAT' },
    });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  await assertApi('Reject scoring request from unassigned public user (403 Forbidden)', async () => {
    const res = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/toss`, {
      headers: { 'x-user-id': UNAUTHORIZED_USER_ID },
      body: { tossWinnerTeamId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', tossDecision: 'BAT' },
    });
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  await assertApi('Allow scoring request from assigned Scorer (200 OK)', async () => {
    const res = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/toss`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { tossWinnerTeamId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', tossDecision: 'BAT' },
    });
    if (res.status !== 200 || !res.body.success) {
      throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  await assertApi('Allow scoring request from tournament Organizer (200 OK)', async () => {
    const res = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/toss`, {
      headers: { 'x-user-id': ORGANIZER_ID },
      body: { tossWinnerTeamId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', tossDecision: 'BAT' },
    });
    if (res.status !== 200 || !res.body.success) {
      throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  console.log('\n--- TEST GROUP 2: SCORING & IDEMPOTENCY ---');

  const STRIKER_ID = '10000000-0000-0000-0000-000000000001';
  const NON_STRIKER_ID = '10000000-0000-0000-0000-000000000002';
  const BOWLER_ID = '20000000-0000-0000-0000-000000000008';
  const TEAM_DW_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const TEAM_BS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  // Initialize fresh innings
  await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/innings/start`, {
    headers: { 'x-user-id': SCORER_ID },
    body: {
      battingTeamId: TEAM_DW_ID,
      bowlingTeamId: TEAM_BS_ID,
      strikerId: STRIKER_ID,
      nonStrikerId: NON_STRIKER_ID,
      bowlerId: BOWLER_ID,
      inningsNumber: 1,
    },
  });

  await assertApi('Record Delivery #1: 1 run off bat', async () => {
    const res = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID },
      body: {
        runs_batter: 1,
        runs_extras: 0,
        extra_type: 'NONE',
        expected_sequence: 1,
      },
    });
    if (res.status !== 200 || res.body.data.delivery.delivery_sequence !== 1) {
      throw new Error(`Failed to record delivery: ${JSON.stringify(res.body)}`);
    }
    if (res.body.data.innings_state.total_runs !== 1) {
      throw new Error('Total runs should be 1');
    }
  });

  await assertApi('Idempotent Delivery Submission: duplicate idempotency-key returns cached result', async () => {
    const idempKey = 'idemp-uuid-12345';
    // First submission
    const res1 = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID, 'idempotency-key': idempKey },
      body: {
        runs_batter: 4,
        runs_extras: 0,
        extra_type: 'NONE',
        expected_sequence: 2,
      },
    });
    if (res1.status !== 200 || res1.body.data.delivery.delivery_sequence !== 2) {
      throw new Error(`First submission failed: ${JSON.stringify(res1.body)}`);
    }

    // Duplicate submission with same idempotency key
    const res2 = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID, 'idempotency-key': idempKey },
      body: {
        runs_batter: 4,
        runs_extras: 0,
        extra_type: 'NONE',
        expected_sequence: 2,
      },
    });
    if (res2.status !== 200) throw new Error('Duplicate submission should return 200');
    if (res2.body.data.delivery.delivery_sequence !== 2) throw new Error('Cached delivery sequence mismatch');

    // Verify delivery count in database is still 2 (not 3)
    const countRes = await db.query(
      `SELECT COUNT(*) FROM deliveries WHERE innings_id = (SELECT id FROM innings WHERE match_id = '${MATCH_ID}' AND status = 'IN_PROGRESS');`
    );
    if (parseInt(countRes.rows[0].count) !== 2) {
      throw new Error(`Deliveries count should be 2, but got ${countRes.rows[0].count}`);
    }
  });

  await assertApi('Reject Stale Sequence submission with 409 Conflict', async () => {
    const res = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID },
      body: {
        runs_batter: 1,
        expected_sequence: 99, // Server is at sequence 3
      },
    });
    if (res.status !== 409 || res.body.error.code !== 'STALE_SEQUENCE_CONFLICT') {
      throw new Error(`Expected 409 STALE_SEQUENCE_CONFLICT, got: ${JSON.stringify(res.body)}`);
    }
  });

  console.log('\n--- TEST GROUP 3: OVER COMPLETION & BOWLER CONSTRAINTS ---');

  await assertApi('Enforce consecutive over bowler restriction (422 Unprocessable)', async () => {
    // Bowl 4 more legal balls to finish over 1 (total 6 legal balls)
    await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { runs_batter: 0 },
    });
    await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { runs_batter: 0 },
    });
    await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { runs_batter: 0 },
    });
    const lastBallRes = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { runs_batter: 0 },
    });
    if (!lastBallRes.body.data.innings_state.is_over_completed) {
      throw new Error('Over 1 should be completed after 6 legal balls');
    }

    // Attempt to start over 2 with the same bowler
    const consecutiveRes = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/overs/start`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { bowlerId: BOWLER_ID }, // Mitchell Starc again!
    });
    if (consecutiveRes.status !== 422 || consecutiveRes.body.error.code !== 'CONSECUTIVE_OVER_VIOLATION') {
      throw new Error(`Expected 422 CONSECUTIVE_OVER_VIOLATION, got: ${JSON.stringify(consecutiveRes.body)}`);
    }

    // Nominate valid new bowler: Pat Cummins
    const PAT_CUMMINS_ID = '20000000-0000-0000-0000-000000000007';
    const validOverRes = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/overs/start`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { bowlerId: PAT_CUMMINS_ID },
    });
    if (validOverRes.status !== 201 || validOverRes.body.data.over.over_number !== 2) {
      throw new Error(`Failed to start over 2: ${JSON.stringify(validOverRes.body)}`);
    }
  });

  console.log('\n--- TEST GROUP 4: NON-DESTRUCTIVE UNDO VIA API ---');

  await assertApi('Undo latest delivery via API and recompute scorecards', async () => {
    // Bowl ball 1 of over 2
    const delRes = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/deliveries`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { runs_batter: 6 }, // Six!
    });
    if (delRes.status !== 200) throw new Error('Failed to record delivery');
    const runsBeforeUndo = delRes.body.data.innings_state.total_runs;

    // Undo the six
    const undoRes = await makeRequest('POST', `/api/v1/scorer/matches/${MATCH_ID}/deliveries/undo`, {
      headers: { 'x-user-id': SCORER_ID },
      body: { reversion_reason: 'Scorer miscounted runs' },
    });
    if (undoRes.status !== 200 || !undoRes.body.success) {
      throw new Error(`Undo failed: ${JSON.stringify(undoRes.body)}`);
    }
    const runsAfterUndo = undoRes.body.data.current_innings_state.total_runs;
    if (runsAfterUndo !== runsBeforeUndo - 6) {
      throw new Error(`Runs after undo (${runsAfterUndo}) should be 6 less than before undo (${runsBeforeUndo})`);
    }
  });

  console.log('\n--- TEST GROUP 5: PUBLIC SPECTATOR READ-ONLY ENDPOINTS ---');

  await assertApi('GET /api/v1/matches/:id (Public overview)', async () => {
    const res = await makeRequest('GET', `/api/v1/matches/${MATCH_ID}`);
    if (res.status !== 200 || !res.body.data.id) {
      throw new Error(`Public overview failed: ${JSON.stringify(res.body)}`);
    }
  });

  await assertApi('GET /api/v1/matches/:id/live (Live console state)', async () => {
    const res = await makeRequest('GET', `/api/v1/matches/${MATCH_ID}/live`);
    if (res.status !== 200 || !res.body.data.innings) {
      throw new Error(`Live console failed: ${JSON.stringify(res.body)}`);
    }
  });

  await assertApi('GET /api/v1/matches/:id/scorecard (Full scorecard with batting & bowling)', async () => {
    const res = await makeRequest('GET', `/api/v1/matches/${MATCH_ID}/scorecard`);
    if (res.status !== 200 || res.body.data.scorecards.length === 0) {
      throw new Error(`Scorecard query failed: ${JSON.stringify(res.body)}`);
    }
    const card = res.body.data.scorecards[0];
    if (card.batting.length === 0 || card.bowling.length === 0) {
      throw new Error('Scorecard tables must not be empty');
    }
  });

  await assertApi('GET /api/v1/matches/:id/commentary (Reverted deliveries excluded)', async () => {
    const res = await makeRequest('GET', `/api/v1/matches/${MATCH_ID}/commentary`);
    if (res.status !== 200 || !Array.isArray(res.body.data.commentary)) {
      throw new Error(`Commentary query failed: ${JSON.stringify(res.body)}`);
    }
    // Verify no reverted deliveries appear in the public commentary feed
    const revertedItems = res.body.data.commentary.filter((d) => d.is_reverted);
    if (revertedItems.length > 0) {
      throw new Error('Reverted deliveries must not appear in public commentary');
    }
  });

  console.log('\n========================================================');
  console.log(`🏆 ALL ${passedTests} OF ${totalTests} SCORER API TESTS PASSED!`);
  console.log('========================================================\n');
  server.close();
  return { passedTests, totalTests };
}

// Run directly if invoked
if (process.argv[1]?.endsWith('scorer-api.test.js')) {
  runApiTests();
}
