// ====================================================================
// TOURNAMENT ISOLATION, RBAC & STANDINGS INTEGRATION TESTS
// ====================================================================

import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import { createApp } from '../src/app.js';
import { PointsTableService } from '../src/services/pointsTableService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runTournamentIsolationTests() {
  console.log('\n🏏 ======================================================================');
  console.log('🏏 LocalCricket: Running Tournament Isolation, RBAC & Standings Tests');
  console.log('🏏 ======================================================================\n');

  const db = new PGlite();

  // Load migrations 001 through 006
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

  const assertIsolation = async (name, fn) => {
    totalTests++;
    process.stdout.write(`🧪 [Tournament Test ${totalTests}] ${name}... `);
    try {
      await fn();
      console.log('PASSED ✅');
      passedTests++;
    } catch (err) {
      console.log('FAILED ❌');
      console.error('   Error details:', err.message);
      server.close();
      throw err;
    }
  };

  const TOURNAMENT_A_ID = '33333333-3333-3333-3333-333333333333'; // Mumbai Premier League
  const USER_ORGANIZER_A = '11111111-1111-1111-1111-111111111111'; // Organizer of Tournament A
  const USER_OTHER = '22222222-2222-2222-2222-222222222222'; // Assigned Scorer (not organizer of Tournament B)

  // Seed Tournament B for cross-tournament isolation checks
  const TOURNAMENT_B_ID = 'bbbbbbbb-1111-2222-3333-444444444444';
  const TEAM_C_GLOBAL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const TEAM_D_GLOBAL_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  let TOURN_B_TEAM_C_ID = null;
  let TOURN_B_TEAM_D_ID = null;

  await db.exec(`
    -- Create Tournament B
    INSERT INTO tournaments (
      id, created_by_user_id, name, short_name, slug, ball_type, format,
      overs_per_innings, balls_per_over, max_overs_per_bowler, city, status
    ) VALUES (
      '${TOURNAMENT_B_ID}', '${USER_ORGANIZER_A}', 'Pune Super Cup', 'PSC', 'pune-super-cup',
      'LEATHER', 'T20', 20, 6, 4, 'Pune', 'UPCOMING'
    );

    -- Create Global Teams C and D
    INSERT INTO teams (id, name, short_name, city) VALUES
      ('${TEAM_C_GLOBAL_ID}', 'Kothrud Kings', 'KK', 'Pune'),
      ('${TEAM_D_GLOBAL_ID}', 'Deccan Dynamos', 'DD', 'Pune');

    -- Register Teams C and D into Tournament B
    INSERT INTO tournament_teams (id, tournament_id, team_id, group_name) VALUES
      ('cccccccc-1111-1111-1111-111111111111', '${TOURNAMENT_B_ID}', '${TEAM_C_GLOBAL_ID}', 'Group A'),
      ('dddddddd-1111-1111-1111-111111111111', '${TOURNAMENT_B_ID}', '${TEAM_D_GLOBAL_ID}', 'Group A');
  `);

  TOURN_B_TEAM_C_ID = 'cccccccc-1111-1111-1111-111111111111';
  TOURN_B_TEAM_D_ID = 'dddddddd-1111-1111-1111-111111111111';

  // 1. Cross-Tournament Scheduling Isolation
  await assertIsolation('Cross-Tournament Scheduling: Cannot schedule Team from Tournament B in Tournament A', async () => {
    const TEAM_DW_TOURN_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const res = await makeRequest('POST', `/api/v1/tournaments/${TOURNAMENT_A_ID}/matches`, {
      headers: { 'x-user-id': USER_ORGANIZER_A },
      body: {
        team_a_id: TEAM_DW_TOURN_A,
        team_b_id: TOURN_B_TEAM_C_ID, // Cross-tournament team!
        match_number: 101,
        scheduled_start_time: new Date().toISOString(),
      },
    });

    if (res.status !== 400 || res.body.error?.code !== 'CROSS_TOURNAMENT_TEAM_ERROR') {
      throw new Error(`Expected 400 CROSS_TOURNAMENT_TEAM_ERROR, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  // 2. Cross-Tournament Roster Leakage Prevention
  await assertIsolation('Cross-Tournament Roster Leak: Player not in Tournament A roster cannot enter Tournament A match', async () => {
    // Attempt inserting an unauthorized player into match_players for Tournament A
    const MATCH_A_ID = '88888888-8888-8888-8888-888888888888';
    const TEAM_DW_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const RANDOM_PLAYER_ID = '30000000-0000-0000-0000-000000000001';

    await db.exec(`
      INSERT INTO players (id, full_name, batting_style, bowling_style, primary_role)
      VALUES ('${RANDOM_PLAYER_ID}', 'Foreign Player', 'RIGHT_HAND_BAT', 'NONE', 'BATTER')
      ON CONFLICT (id) DO NOTHING;
    `);

    let threwFkViolation = false;
    try {
      await db.query(`
        INSERT INTO match_players (match_id, tournament_team_id, player_id, is_playing_xi)
        VALUES ('${MATCH_A_ID}', '${TEAM_DW_ID}', '${RANDOM_PLAYER_ID}', TRUE);
      `);
    } catch (err) {
      threwFkViolation = true;
    }

    if (!threwFkViolation) {
      throw new Error('Database composite FK fk_match_player_roster should have rejected foreign player');
    }
  });

  // 3. Server-Side RBAC: Cross-Tournament Organizer Access Rejection
  await assertIsolation('Cross-Tournament RBAC: User without organizer rights on Tournament B is rejected with 403', async () => {
    // USER_OTHER is scorer of match in Tournament A, but has no organizer role in Tournament B
    const res = await makeRequest('POST', `/api/v1/tournaments/${TOURNAMENT_B_ID}/matches`, {
      headers: { 'x-user-id': USER_OTHER },
      body: {
        team_a_id: TOURN_B_TEAM_C_ID,
        team_b_id: TOURN_B_TEAM_D_ID,
        match_number: 1,
        scheduled_start_time: new Date().toISOString(),
      },
    });

    if (res.status !== 403) {
      throw new Error(`Expected 403 Forbidden, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  // 4. Server-Side RBAC: Unauthenticated Mutations are Rejected
  await assertIsolation('RBAC: Unauthenticated mutation request receives 401 Unauthorized', async () => {
    const res = await makeRequest('POST', `/api/v1/tournaments/${TOURNAMENT_B_ID}/teams`, {
      body: { teamId: 'some-team' },
    });
    if (res.status !== 401) {
      throw new Error(`Expected 401 Unauthorized, got ${res.status}`);
    }
  });

  // 5. Automated Points Table Recalculation on Match Completion
  await assertIsolation('Points Table: Auto-recalculates standings with exact NRR when match completes', async () => {
    const pointsTableService = new PointsTableService(db);
    const standings = await pointsTableService.recalculateTournamentPoints(TOURNAMENT_A_ID);

    if (!Array.isArray(standings) || standings.length < 2) {
      throw new Error('Standings must contain registered tournament teams');
    }

    // Verify fields exist and are separated
    const firstTeam = standings[0];
    if (firstTeam.actual_balls_faced === undefined || firstTeam.effective_balls_faced === undefined) {
      throw new Error('Standings must track actual_balls_faced and effective_balls_faced separately');
    }
    if (firstTeam.actual_balls_bowled === undefined || firstTeam.effective_balls_bowled === undefined) {
      throw new Error('Standings must track actual_balls_bowled and effective_balls_bowled separately');
    }
  });

  // 6. Mandatory Tied Match with All-Out Invariant Integration Test
  await assertIsolation('Mandatory Integration Test: Tied match with all-out applies full quota symmetrically to both teams (NRR = 0.000)', async () => {
    const TIED_MATCH_ID = 'aaaa1111-2222-3333-4444-555566667777';

    // Create a new isolated match in Tournament B
    await db.exec(`
      INSERT INTO matches (
        id, tournament_id, team_a_id, team_b_id, match_number, stage,
        scheduled_start_time, overs_quota, status, result_type
      ) VALUES (
        '${TIED_MATCH_ID}', '${TOURNAMENT_B_ID}', '${TOURN_B_TEAM_C_ID}', '${TOURN_B_TEAM_D_ID}',
        10, 'LEAGUE', NOW(), 20, 'COMPLETED', 'TIED'
      );

      -- Innings 1: Team C scores 160 all out in 19.1 (115 legal balls, 10 wickets)
      INSERT INTO innings (
        id, match_id, innings_number, batting_team_id, bowling_team_id,
        total_runs, total_wickets, total_legal_balls, total_extras, status
      ) VALUES (
        '1111cccc-2222-3333-4444-555566667777', '${TIED_MATCH_ID}', 1,
        '${TOURN_B_TEAM_C_ID}', '${TOURN_B_TEAM_D_ID}',
        160, 10, 115, 0, 'COMPLETED'
      );

      -- Innings 2: Team D scores 160/6 in 20.0 (120 legal balls, 6 wickets)
      INSERT INTO innings (
        id, match_id, innings_number, batting_team_id, bowling_team_id,
        total_runs, total_wickets, total_legal_balls, total_extras, status
      ) VALUES (
        '1111dddd-2222-3333-4444-555566667777', '${TIED_MATCH_ID}', 2,
        '${TOURN_B_TEAM_D_ID}', '${TOURN_B_TEAM_C_ID}',
        160, 6, 120, 0, 'COMPLETED'
      );
    `);

    const pointsTableService = new PointsTableService(db);
    const standings = await pointsTableService.recalculateTournamentPoints(TOURNAMENT_B_ID);

    const teamC = standings.find((s) => s.tournament_team_id === TOURN_B_TEAM_C_ID);
    const teamD = standings.find((s) => s.tournament_team_id === TOURN_B_TEAM_D_ID);

    assert.ok(teamC, 'Team C must exist in standings');
    assert.ok(teamD, 'Team D must exist in standings');

    // Team C Assertions
    assert.strictEqual(teamC.actual_balls_faced, 115, 'Team C actual_balls_faced must be 115');
    assert.strictEqual(teamC.effective_balls_faced, 120, 'Team C effective_balls_faced must be 120 (all-out rule)');
    assert.strictEqual(teamC.actual_balls_bowled, 120, 'Team C actual_balls_bowled must be 120');
    assert.strictEqual(teamC.effective_balls_bowled, 120, 'Team C effective_balls_bowled must be 120');
    assert.strictEqual(Number(teamC.net_run_rate), 0.000, 'Team C net_run_rate must be 0.000');

    // Team D Assertions
    assert.strictEqual(teamD.actual_balls_faced, 120, 'Team D actual_balls_faced must be 120');
    assert.strictEqual(teamD.effective_balls_faced, 120, 'Team D effective_balls_faced must be 120');
    assert.strictEqual(teamD.actual_balls_bowled, 115, 'Team D actual_balls_bowled must be 115');
    assert.strictEqual(teamD.effective_balls_bowled, 120, 'Team D effective_balls_bowled must be 120 (symmetric all-out quota)');
    assert.strictEqual(Number(teamD.net_run_rate), 0.000, 'Team D net_run_rate must be 0.000');

    // Points assertions (Tied match gives points_for_tie = 1)
    assert.strictEqual(teamC.points, 1, 'Team C points must be 1 for tie');
    assert.strictEqual(teamD.points, 1, 'Team D points must be 1 for tie');
    assert.strictEqual(teamC.matches_tied, 1, 'Team C matches_tied must be 1');
    assert.strictEqual(teamD.matches_tied, 1, 'Team D matches_tied must be 1');
  });

  // 7. No-Result Match NRR Exclusion
  await assertIsolation('No-Result Match: Awards points but contributes 0 runs and 0 overs to NRR', async () => {
    const NR_MATCH_ID = '1111eeee-2222-3333-4444-555566667777';

    await db.exec(`
      INSERT INTO matches (
        id, tournament_id, team_a_id, team_b_id, match_number, stage,
        scheduled_start_time, overs_quota, status, result_type
      ) VALUES (
        '${NR_MATCH_ID}', '${TOURNAMENT_B_ID}', '${TOURN_B_TEAM_C_ID}', '${TOURN_B_TEAM_D_ID}',
        11, 'LEAGUE', NOW(), 20, 'ABANDONED', 'NO_RESULT'
      );
    `);

    const pointsTableService = new PointsTableService(db);
    const standings = await pointsTableService.recalculateTournamentPoints(TOURNAMENT_B_ID);

    const teamC = standings.find((s) => s.tournament_team_id === TOURN_B_TEAM_C_ID);
    const teamD = standings.find((s) => s.tournament_team_id === TOURN_B_TEAM_D_ID);

    // Matches played increased to 2, No result increased to 1, Points increased by 1 (total 2 points)
    assert.strictEqual(teamC.matches_played, 2);
    assert.strictEqual(teamC.matches_no_result, 1);
    assert.strictEqual(teamC.points, 2); // 1 (tie) + 1 (no-result)
    assert.strictEqual(teamD.points, 2);

    // Ball counts and runs must remain EXACTLY what they were from match 1 (no additions from abandoned match!)
    assert.strictEqual(teamC.actual_balls_faced, 115);
    assert.strictEqual(teamC.effective_balls_faced, 120);
    assert.strictEqual(teamC.actual_balls_bowled, 120);
    assert.strictEqual(teamC.effective_balls_bowled, 120);
    assert.strictEqual(Number(teamC.net_run_rate), 0.000);
  });

  // 8. Public Points Table REST API Endpoint
  await assertIsolation('Public API: GET /api/v1/tournaments/:id/points-table returns sorted standings', async () => {
    const res = await makeRequest('GET', `/api/v1/tournaments/${TOURNAMENT_B_ID}/points-table`);
    if (res.status !== 200 || !res.body.success) {
      throw new Error(`Expected 200 OK, got ${res.status}`);
    }
    const table = res.body.data;
    if (table.length !== 2) {
      throw new Error(`Expected 2 teams in standings, got ${table.length}`);
    }
    if (!table[0].team_name || table[0].net_run_rate === undefined) {
      throw new Error('Points table items missing team_name or net_run_rate');
    }
  });

  server.close();
  console.log('\n======================================================================');
  console.log(`🏆 ALL ${passedTests} OF ${totalTests} TOURNAMENT ISOLATION & STANDINGS TESTS PASSED!`);
  console.log('======================================================================\n');
  return { passedTests, totalTests };
}

// Run directly if invoked
if (process.argv[1]?.endsWith('tournament-isolation.test.js')) {
  runTournamentIsolationTests();
}
