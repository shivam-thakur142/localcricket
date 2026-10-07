// ====================================================================
// MILESTONE 7: TOURNAMENT PLAYOFFS, BRACKETS & FINALS TESTS
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
import { ScoringService } from '../src/services/scoringService.js';
import { PointsTableService } from '../src/services/pointsTableService.js';
import { PlayoffService } from '../src/services/playoffService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMilestone7PlayoffTests() {
  console.log('\n🏏 ======================================================================');
  console.log('🏏 LocalCricket: Running Milestone 7 Playoffs & Finals Tests');
  console.log('🏏 ======================================================================\n');

  const db = new PGlite();

  // Load migrations 001 through 009
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
  const scoringService = new ScoringService(db);
  const pointsTableService = new PointsTableService(db);
  const playoffService = new PlayoffService(db);

  // Start ephemeral server
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const request = (pathStr, options = {}) => {
    return new Promise((resolve, reject) => {
      const url = new URL(pathStr, baseUrl);
      const reqOptions = {
        method: options.method || 'GET',
        headers: options.headers || {},
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
      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
      req.end();
    });
  };

  let passedTests = 0;
  let totalTests = 0;

  async function assertTest(name, fn) {
    totalTests++;
    process.stdout.write(`🧪 [M7 Test ${totalTests}] ${name}... `);
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
    // ------------------------------------------------------------------
    // TEST SETUP: Organizer User, Tournament, and 4 Teams
    // ------------------------------------------------------------------
    const organizerId = '77777777-7777-7777-7777-777777777777';
    await db.query(
      `INSERT INTO auth.users (id, email) VALUES ($1, 'rohit.sharma@test.com') ON CONFLICT DO NOTHING;`,
      [organizerId]
    );
    await db.query(
      `INSERT INTO users (id, auth_user_id, full_name, email, global_role)
       VALUES ($1, $1, 'Rohit Sharma', 'rohit.sharma@test.com', 'USER')
       ON CONFLICT DO NOTHING;`,
      [organizerId]
    );

    // Create Tournament (status ONGOING)
    const tRes = await db.query(
      `INSERT INTO tournaments (
        id, created_by_user_id, name, short_name, slug, ball_type, format,
        overs_per_innings, balls_per_over, max_overs_per_bowler,
        points_for_win, points_for_tie, points_for_no_result,
        city, status
      ) VALUES (
        gen_random_uuid(), $1, 'Premier Cup 2026', 'PC26', 'pc-2026-m7', 'LEATHER', 'T20',
        20, 6, 4, 2, 1, 1, 'Mumbai', 'ONGOING'
      ) RETURNING id;`,
      [organizerId]
    );
    const tournamentId = tRes.rows[0].id;

    // Make organizer a tournament member
    await db.query(
      `INSERT INTO tournament_members (tournament_id, user_id, role)
       VALUES ($1, $2, 'ORGANIZER');`,
      [tournamentId, organizerId]
    );

    // Register 4 teams with distinct standings
    const teamNames = [
      { name: 'Mumbai Stars', short: 'MS' },
      { name: 'Delhi Royals', short: 'DR' },
      { name: 'Bangalore Blasters', short: 'BB' },
      { name: 'Chennai Kings', short: 'CK' },
    ];
    const tournamentTeamIds = [];

    for (const tn of teamNames) {
      const teamRes = await db.query(
        `INSERT INTO teams (name, short_name, city, created_by_user_id)
         VALUES ($1, $2, 'Mumbai', $3) RETURNING id;`,
        [tn.name, tn.short, organizerId]
      );
      const ttRes = await db.query(
        `INSERT INTO tournament_teams (tournament_id, team_id, group_name)
         VALUES ($1, $2, 'Group A') RETURNING id;`,
        [tournamentId, teamRes.rows[0].id]
      );
      tournamentTeamIds.push(ttRes.rows[0].id);
    }

    // Helper to insert a completed league match with innings
    async function insertCompletedLeagueMatch(matchNum, teamA, teamB, runsA, runsB, winner) {
      const mRes = await db.query(
        `INSERT INTO matches (
          tournament_id, match_number, stage, status, overs_quota,
          team_a_id, team_b_id, winner_team_id, result_type, result_margin_runs,
          scheduled_start_time
        ) VALUES ($1, $2, 'LEAGUE', 'COMPLETED', 20, $3, $4, $5, 'NORMAL', $6, NOW())
        RETURNING id;`,
        [tournamentId, matchNum, teamA, teamB, winner, Math.abs(runsA - runsB)]
      );
      const mId = mRes.rows[0].id;

      await db.query(
        `INSERT INTO innings (
          match_id, innings_number, batting_team_id, bowling_team_id,
          total_runs, total_wickets, total_legal_balls, status
        ) VALUES
          ($1, 1, $2, $3, $4, 5, 120, 'COMPLETED'),
          ($1, 2, $3, $2, $5, 7, 120, 'COMPLETED');`,
        [mId, teamA, teamB, runsA, runsB]
      );
      return mId;
    }

    // Insert 6 round-robin league matches to establish deterministic standings:
    // Rank 1: Mumbai Stars (3 wins, 6 pts)
    // Rank 2: Delhi Royals (2 wins, 4 pts)
    // Rank 3: Bangalore Blasters (1 win, 2 pts)
    // Rank 4: Chennai Kings (0 wins, 0 pts)
    await insertCompletedLeagueMatch(1, tournamentTeamIds[0], tournamentTeamIds[1], 180, 160, tournamentTeamIds[0]);
    await insertCompletedLeagueMatch(2, tournamentTeamIds[0], tournamentTeamIds[2], 170, 150, tournamentTeamIds[0]);
    await insertCompletedLeagueMatch(3, tournamentTeamIds[0], tournamentTeamIds[3], 160, 140, tournamentTeamIds[0]);
    await insertCompletedLeagueMatch(4, tournamentTeamIds[1], tournamentTeamIds[2], 175, 155, tournamentTeamIds[1]);
    await insertCompletedLeagueMatch(5, tournamentTeamIds[1], tournamentTeamIds[3], 165, 145, tournamentTeamIds[1]);
    await insertCompletedLeagueMatch(6, tournamentTeamIds[2], tournamentTeamIds[3], 150, 130, tournamentTeamIds[2]);

    // Compute authoritative initial regular season standings
    await pointsTableService.recalculateTournamentPoints(tournamentId);

    // ==================================================================
    // TEST 1: Playoff Format Configuration & Seeding Validation
    // ==================================================================
    await assertTest('Playoff Format Configuration: Set format, verify teams count = 4, reject invalid formats', async () => {
      // 1. Valid update via PUT /api/v1/tournaments/:id/playoffs/config
      const res = await request(`/api/v1/tournaments/${tournamentId}/playoffs/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: { playoff_format: 'PAGE_PLAYOFF' },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.data.playoff_format, 'PAGE_PLAYOFF');
      assert.strictEqual(res.data.data.playoff_teams_count, 4);

      // 2. Reject unsupported format
      const invalidRes = await request(`/api/v1/tournaments/${tournamentId}/playoffs/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: { playoff_format: 'UNSUPPORTED_FORMAT' },
      });
      assert.strictEqual(invalidRes.status, 400);

      // 3. Reject unauthenticated request (401)
      const unauthRes = await request(`/api/v1/tournaments/${tournamentId}/playoffs/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': '00000000-0000-0000-0000-000000000000',
        },
        body: { playoff_format: 'PAGE_PLAYOFF' },
      });
      assert.strictEqual(unauthRes.status, 401);

      // 4. Reject authenticated non-organizer request (403)
      const nonOrgUserId = '88888888-8888-8888-8888-888888888888';
      await db.query(
        `INSERT INTO auth.users (id, email) VALUES ($1, 'spectator@test.com') ON CONFLICT DO NOTHING;`,
        [nonOrgUserId]
      );
      await db.query(
        `INSERT INTO users (id, auth_user_id, full_name, email, global_role)
         VALUES ($1, $1, 'Spectator User', 'spectator@test.com', 'USER')
         ON CONFLICT DO NOTHING;`,
        [nonOrgUserId]
      );

      const forbiddenRes = await request(`/api/v1/tournaments/${tournamentId}/playoffs/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': nonOrgUserId,
        },
        body: { playoff_format: 'PAGE_PLAYOFF' },
      });
      assert.strictEqual(forbiddenRes.status, 403);
    });

    // ==================================================================
    // TEST 2: Automated Bracket Generation (Page Playoff)
    // ==================================================================
    let pagePlayoffMatches = [];
    await assertTest('Automated Bracket Generation (Page Playoff): Top 4 teams seeded with placeholders', async () => {
      const genRes = await request(`/api/v1/tournaments/${tournamentId}/playoffs/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: { format: 'PAGE_PLAYOFF' },
      });

      assert.strictEqual(genRes.status, 201);
      assert.strictEqual(genRes.data.data.playoff_format, 'PAGE_PLAYOFF');
      pagePlayoffMatches = genRes.data.data.matches;
      assert.strictEqual(pagePlayoffMatches.length, 4);

      const q1 = pagePlayoffMatches.find((m) => m.stage === 'QUALIFIER_1');
      const el = pagePlayoffMatches.find((m) => m.stage === 'ELIMINATOR');
      const q2 = pagePlayoffMatches.find((m) => m.stage === 'QUALIFIER_2');
      const fn = pagePlayoffMatches.find((m) => m.stage === 'FINAL');

      assert.ok(q1 && el && q2 && fn);
      // Q1: Rank 1 (Mumbai Stars) vs Rank 2 (Delhi Royals)
      assert.strictEqual(q1.team_a_id, tournamentTeamIds[0]);
      assert.strictEqual(q1.team_b_id, tournamentTeamIds[1]);

      // Eliminator: Rank 3 (Bangalore Blasters) vs Rank 4 (Chennai Kings)
      assert.strictEqual(el.team_a_id, tournamentTeamIds[2]);
      assert.strictEqual(el.team_b_id, tournamentTeamIds[3]);

      // Q2: Placeholders populated, teams NULL
      assert.strictEqual(q2.team_a_id, null);
      assert.strictEqual(q2.team_b_id, null);
      assert.strictEqual(q2.team_a_placeholder, 'Loser Qualifier 1');
      assert.strictEqual(q2.team_b_placeholder, 'Winner Eliminator');
      assert.strictEqual(q2.team_a_source_match_id, q1.id);
      assert.strictEqual(q2.team_b_source_match_id, el.id);

      // Final: Placeholders populated, teams NULL
      assert.strictEqual(fn.team_a_id, null);
      assert.strictEqual(fn.team_b_id, null);
      assert.strictEqual(fn.team_a_placeholder, 'Winner Qualifier 1');
      assert.strictEqual(fn.team_b_placeholder, 'Winner Qualifier 2');
    });

    // ==================================================================
    // TEST 3: Duplicate Bracket Protection (Database-Level Uniqueness)
    // ==================================================================
    await assertTest('Duplicate Bracket Protection: Rejects concurrent or secondary bracket generation', async () => {
      const dupRes = await request(`/api/v1/tournaments/${tournamentId}/playoffs/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: { format: 'PAGE_PLAYOFF' },
      });
      assert.strictEqual(dupRes.status, 409);
      assert.ok(JSON.stringify(dupRes.data.error).includes('already been generated'));
    });

    // ==================================================================
    // TEST 4: Strict League Points Table Isolation Regression
    // ==================================================================
    await assertTest('Strict League Points Table Isolation: Playoff match does not alter standings or NRR', async () => {
      // 1. Capture snapshot of regular season standings
      const preSnapshotRes = await db.query(
        `SELECT * FROM points_table WHERE tournament_id = $1 ORDER BY points DESC, net_run_rate DESC;`,
        [tournamentId]
      );
      const preSnapshot = preSnapshotRes.rows;

      // 2. Score and complete Qualifier 1 (Q1)
      const q1 = pagePlayoffMatches.find((m) => m.stage === 'QUALIFIER_1');

      // Create dummy players for POTM
      const pRes = await db.query(
        `INSERT INTO players (full_name, nickname, batting_style, bowling_style, primary_role)
         VALUES ('Virat Kohli', 'King', 'RIGHT_HAND_BAT', 'RIGHT_ARM_MEDIUM', 'BATTER') RETURNING id;`
      );
      const potmId = pRes.rows[0].id;

      await db.query(
        `INSERT INTO team_rosters (tournament_team_id, player_id, jersey_number)
         VALUES ($1, $2, 18);`,
        [q1.team_a_id, potmId]
      );

      await db.query(
        `INSERT INTO match_players (match_id, tournament_team_id, player_id, is_playing_xi)
         VALUES ($1, $2, $3, TRUE);`,
        [q1.id, q1.team_a_id, potmId]
      );

      // Create innings for Q1
      await db.query(
        `INSERT INTO innings (match_id, innings_number, batting_team_id, bowling_team_id, total_runs, total_wickets, total_legal_balls, status)
         VALUES
          ($1, 1, $2, $3, 195, 4, 120, 'COMPLETED'),
          ($1, 2, $3, $2, 175, 8, 120, 'COMPLETED');`,
        [q1.id, q1.team_a_id, q1.team_b_id]
      );

      // Resolve Q1 with Team A winning
      const resolveRes = await request(`/api/v1/matches/${q1.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          status: 'COMPLETED',
          resultType: 'NORMAL',
          winnerTeamId: q1.team_a_id,
          resultMarginRuns: 20,
          playerOfTheMatchId: potmId,
        },
      });
      assert.strictEqual(resolveRes.status, 200);

      // 3. Re-query standings
      const postSnapshotRes = await db.query(
        `SELECT * FROM points_table WHERE tournament_id = $1 ORDER BY points DESC, net_run_rate DESC;`,
        [tournamentId]
      );
      const postSnapshot = postSnapshotRes.rows;

      // 4. Assert 100% equality across all teams
      assert.strictEqual(postSnapshot.length, preSnapshot.length);
      for (let i = 0; i < preSnapshot.length; i++) {
        assert.strictEqual(postSnapshot[i].tournament_team_id, preSnapshot[i].tournament_team_id);
        assert.strictEqual(postSnapshot[i].matches_played, preSnapshot[i].matches_played);
        assert.strictEqual(postSnapshot[i].matches_won, preSnapshot[i].matches_won);
        assert.strictEqual(postSnapshot[i].matches_lost, preSnapshot[i].matches_lost);
        assert.strictEqual(postSnapshot[i].points, preSnapshot[i].points);
        assert.strictEqual(postSnapshot[i].runs_scored_for, preSnapshot[i].runs_scored_for);
        assert.strictEqual(postSnapshot[i].runs_conceded_against, preSnapshot[i].runs_conceded_against);
        assert.strictEqual(postSnapshot[i].actual_balls_faced, preSnapshot[i].actual_balls_faced);
        assert.strictEqual(postSnapshot[i].effective_balls_faced, preSnapshot[i].effective_balls_faced);
        assert.strictEqual(postSnapshot[i].net_run_rate, preSnapshot[i].net_run_rate);
      }
    });

    // ==================================================================
    // TEST 5: Super Over Resolution Contract
    // ==================================================================
    await assertTest('Super Over Contract: Tied regular overs require SUPER_OVER; validate winner', async () => {
      const el = pagePlayoffMatches.find((m) => m.stage === 'ELIMINATOR');

      // Create tied regular innings (160 vs 160)
      await db.query(
        `INSERT INTO innings (match_id, innings_number, batting_team_id, bowling_team_id, total_runs, total_wickets, total_legal_balls, status)
         VALUES
          ($1, 1, $2, $3, 160, 6, 120, 'COMPLETED'),
          ($1, 2, $3, $2, 160, 8, 120, 'COMPLETED');`,
        [el.id, el.team_a_id, el.team_b_id]
      );

      // Attempting to resolve tied match as NORMAL or TIED must be rejected
      const failNormal = await request(`/api/v1/matches/${el.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          status: 'COMPLETED',
          resultType: 'NORMAL',
          winnerTeamId: el.team_a_id,
        },
      });
      assert.strictEqual(failNormal.status, 422);
      assert.ok(JSON.stringify(failNormal.data.error).includes('SUPER_OVER'));

      const failTied = await request(`/api/v1/matches/${el.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          status: 'COMPLETED',
          resultType: 'TIED',
        },
      });
      assert.strictEqual(failTied.status, 422);

      // Resolve with valid SUPER_OVER
      const superOverRes = await request(`/api/v1/matches/${el.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          status: 'COMPLETED',
          resultType: 'SUPER_OVER',
          winnerTeamId: el.team_a_id, // Team 3 (Bangalore) wins in Super Over
          resultMarginRuns: 3,
        },
      });
      assert.strictEqual(superOverRes.status, 200);
      assert.strictEqual(superOverRes.data.data.result_type, 'SUPER_OVER');
      assert.strictEqual(superOverRes.data.data.winner_team_id, el.team_a_id);
    });

    // ==================================================================
    // TEST 6: Higher-Seed Abandonment Server Enforcement
    // ==================================================================
    await assertTest('Higher-Seed Abandonment: Server calculates higher seed on weather washout; rejects lower seed', async () => {
      // Create a test knockout fixture between Rank 1 (Mumbai Stars) and Rank 4 (Chennai Kings)
      const numRes = await db.query(
        'SELECT COALESCE(MAX(match_number), 0) + 1 AS next_match_num FROM matches WHERE tournament_id = $1',
        [tournamentId]
      );
      const testKoRes = await db.query(
        `INSERT INTO matches (
          tournament_id, team_a_id, team_b_id, match_number, stage,
          scheduled_start_time, overs_quota, status
        ) VALUES (
          $1, $2, $3, $4, 'SEMI_FINAL_1', NOW(), 20, 'SCHEDULED'
        ) RETURNING id, team_a_id, team_b_id;`,
        [tournamentId, tournamentTeamIds[0], tournamentTeamIds[3], numRes.rows[0].next_match_num]
      );
      const testKoId = testKoRes.rows[0].id;

      // Attempt to submit lower seed (Rank 4, Chennai Kings) as advancing winner on abandonment
      const clientManipulatedRes = await request(`/api/v1/matches/${testKoId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          status: 'ABANDONED',
          resultType: 'NO_RESULT',
          winnerTeamId: tournamentTeamIds[3], // Rank 4!
        },
      });
      assert.strictEqual(clientManipulatedRes.status, 422);
      assert.ok(JSON.stringify(clientManipulatedRes.data.error).includes('higher regular season seed must advance'));

      // Resolving with omitted winner: Server automatically assigns higher seed (Rank 1, Mumbai Stars)
      const validAbandonRes = await request(`/api/v1/matches/${testKoId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          status: 'ABANDONED',
          resultType: 'NO_RESULT',
        },
      });
      assert.strictEqual(validAbandonRes.status, 200);
      assert.strictEqual(validAbandonRes.data.data.status, 'ABANDONED');
      assert.strictEqual(validAbandonRes.data.data.winner_team_id, tournamentTeamIds[0]); // Rank 1 advanced!

      // Verify lifecycle audit records higher seed advancement
      const auditRes = await db.query(
        `SELECT reason FROM match_lifecycle_audit WHERE match_id = $1 ORDER BY created_at DESC LIMIT 1;`,
        [testKoId]
      );
      assert.ok(auditRes.rows[0].reason.includes('higher regular season seed advanced'));
    });

    // ==================================================================
    // TEST 7: Page Playoff Progression (Q1 + Eliminator -> Q2)
    // ==================================================================
    await assertTest('Playoff Progression: Q1 loser and Eliminator winner automatically populated in Q2', async () => {
      // Inspect Qualifier 2 match row
      const q2 = pagePlayoffMatches.find((m) => m.stage === 'QUALIFIER_2');
      const q2Row = await db.query('SELECT * FROM matches WHERE id = $1', [q2.id]);
      const currentQ2 = q2Row.rows[0];

      // In Test 4, Q1 was won by Team A (Mumbai Stars), so Loser = Team B (Delhi Royals)
      assert.strictEqual(currentQ2.team_a_id, tournamentTeamIds[1]);

      // In Test 5, Eliminator was won by Team A (Bangalore Blasters)
      assert.strictEqual(currentQ2.team_b_id, tournamentTeamIds[2]);
    });

    // ==================================================================
    // TEST 8: Championship Crowning & Final Atomicity
    // ==================================================================
    await assertTest('Championship Crowning: Resolving Final atomically crowns champion & completes tournament', async () => {
      const q2 = pagePlayoffMatches.find((m) => m.stage === 'QUALIFIER_2');
      const fn = pagePlayoffMatches.find((m) => m.stage === 'FINAL');

      // Resolve Q2: Delhi Royals (team_a) vs Bangalore Blasters (team_b) -> Delhi wins
      await request(`/api/v1/matches/${q2.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          status: 'COMPLETED',
          resultType: 'NORMAL',
          winnerTeamId: tournamentTeamIds[1], // Delhi Royals advances to Final
          resultMarginWickets: 4,
        },
      });

      // Verify Final now has both teams populated: Q1 Winner (Mumbai) vs Q2 Winner (Delhi)
      const fnRow = await db.query('SELECT * FROM matches WHERE id = $1', [fn.id]);
      assert.strictEqual(fnRow.rows[0].team_a_id, tournamentTeamIds[0]);
      assert.strictEqual(fnRow.rows[0].team_b_id, tournamentTeamIds[1]);

      // Resolve Grand Final: Mumbai Stars defeats Delhi Royals
      const finalResolveRes = await request(`/api/v1/matches/${fn.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          status: 'COMPLETED',
          resultType: 'NORMAL',
          winnerTeamId: tournamentTeamIds[0], // Mumbai Stars Champions!
          resultMarginRuns: 15,
        },
      });
      assert.strictEqual(finalResolveRes.status, 200);

      // Verify Tournament is atomically COMPLETED with Champion and Runner-up set
      const tCheck = await db.query(
        `SELECT status, champion_team_id, runner_up_team_id FROM tournaments WHERE id = $1;`,
        [tournamentId]
      );
      assert.strictEqual(tCheck.rows[0].status, 'COMPLETED');
      assert.strictEqual(tCheck.rows[0].champion_team_id, tournamentTeamIds[0]);
      assert.strictEqual(tCheck.rows[0].runner_up_team_id, tournamentTeamIds[1]);
    });

    // ==================================================================
    // TEST 9: Concurrency Safety & Downstream Progression
    // ==================================================================
    await assertTest('Concurrency Safety: Concurrent progression writes maintain slot integrity', async () => {
      // Create new tournament with 4 teams for concurrent simulation
      const cTournRes = await db.query(
        `INSERT INTO tournaments (
          created_by_user_id, name, short_name, slug, ball_type, format,
          overs_per_innings, balls_per_over, max_overs_per_bowler,
          city, status
        ) VALUES (
          $1, 'Concurrency Cup', 'CC26', 'cc-2026-m7', 'LEATHER', 'T20',
          20, 6, 4, 'Bangalore', 'ONGOING'
        ) RETURNING id;`,
        [organizerId]
      );
      const cTournId = cTournRes.rows[0].id;

      // Register 4 teams for cTournId
      const cTournamentTeamIds = [];
      const globalTeams = await db.query('SELECT id FROM teams LIMIT 4');
      for (const gt of globalTeams.rows) {
        const ttRes = await db.query(
          `INSERT INTO tournament_teams (tournament_id, team_id, group_name)
           VALUES ($1, $2, 'Group A') RETURNING id;`,
          [cTournId, gt.id]
        );
        cTournamentTeamIds.push(ttRes.rows[0].id);
      }

      // Seed 4 teams in points table with distinct ranks
      for (let i = 0; i < cTournamentTeamIds.length; i++) {
        await db.query(
          `INSERT INTO points_table (tournament_id, tournament_team_id, points, net_run_rate)
           VALUES ($1, $2, $3, $4);`,
          [cTournId, cTournamentTeamIds[i], (4 - i) * 2, 0.500 * (4 - i)]
        );
      }

      // Generate Page Playoff bracket
      const gen = await playoffService.generatePlayoffBracket(cTournId, { format: 'PAGE_PLAYOFF' });
      const [mQ1, mEl, mQ2, mFinal] = gen.matches;

      // Concurrently advance mQ1 and mEl into mQ2
      await Promise.all([
        playoffService.advancePlayoffProgression(mQ1.id, cTournamentTeamIds[0], cTournamentTeamIds[1], db),
        playoffService.advancePlayoffProgression(mEl.id, cTournamentTeamIds[2], cTournamentTeamIds[3], db),
      ]);

      // Verify mQ2 slots accurately filled with zero lost updates
      const q2Verify = await db.query('SELECT team_a_id, team_b_id FROM matches WHERE id = $1;', [mQ2.id]);
      assert.strictEqual(q2Verify.rows[0].team_a_id, cTournamentTeamIds[1]); // Loser Q1
      assert.strictEqual(q2Verify.rows[0].team_b_id, cTournamentTeamIds[2]); // Winner Eliminator
    });

    // ==================================================================
    // TEST 10: Playoff Integrity Guards & Unpopulated Protection
    // ==================================================================
    await assertTest('Playoff Integrity Guards: Unpopulated match toss blocked, terminal tournament immutable', async () => {
      // 1. Attempt to conduct toss on an unpopulated playoff match in a fresh tournament
      const gTournRes = await db.query(
        `INSERT INTO tournaments (
          created_by_user_id, name, short_name, slug, ball_type, format,
          overs_per_innings, balls_per_over, max_overs_per_bowler,
          city, status
        ) VALUES (
          $1, 'Guard Cup', 'GC26', 'gc-2026-m7', 'LEATHER', 'T20',
          20, 6, 4, 'Chennai', 'ONGOING'
        ) RETURNING id;`,
        [organizerId]
      );
      const gTournId = gTournRes.rows[0].id;

      const unpopMatchRes = await db.query(
        `INSERT INTO matches (
          tournament_id, team_a_id, team_b_id, match_number, stage,
          scheduled_start_time, overs_quota, status
        ) VALUES (
          $1, NULL, NULL, 99, 'FINAL', NOW(), 20, 'SCHEDULED'
        ) RETURNING id;`,
        [gTournId]
      );
      const unpopMatchId = unpopMatchRes.rows[0].id;

      await assert.rejects(
        async () => {
          await scoringService.recordToss(unpopMatchId, {
            tossWinnerTeamId: tournamentTeamIds[0],
            tossDecision: 'BAT',
          });
        },
        /UNPOPULATED_MATCH_TEAMS|not yet determined/
      );

      // 2. Attempt to resolve match in a COMPLETED terminal tournament (tournamentId was marked COMPLETED in Test 8)
      const q1 = pagePlayoffMatches.find((m) => m.stage === 'QUALIFIER_1');
      const terminalResolve = await request(`/api/v1/matches/${q1.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': organizerId,
        },
        body: {
          status: 'COMPLETED',
          resultType: 'NORMAL',
          winnerTeamId: tournamentTeamIds[0],
        },
      });
      assert.strictEqual(terminalResolve.status, 409);
      assert.ok(JSON.stringify(terminalResolve.data.error).includes('terminal state'));
    });

  } finally {
    server.close();
  }

  console.log('\n======================================================================');
  console.log(`🏆 ALL ${passedTests} OF ${totalTests} MILESTONE 7 PLAYOFF TESTS PASSED!`);
  console.log('======================================================================\n');

  return { passedTests, totalTests };
}
