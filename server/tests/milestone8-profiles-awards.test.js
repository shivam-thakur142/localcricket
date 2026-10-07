// ====================================================================
// MILESTONE 8: PUBLIC PLAYER & TEAM PROFILES AND AWARDS TESTS
// ====================================================================

import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import http from 'http';
import { createApp } from '../src/app.js';
import { ProfileService } from '../src/services/profileService.js';
import { AwardsService } from '../src/services/awardsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMilestone8ProfileAndAwardTests() {
  console.log('\n🏏 ======================================================================');
  console.log('🏏 LocalCricket: Running Milestone 8 Profiles & Awards Tests');
  console.log('🏏 ======================================================================\n');

  const db = new PGlite();

  // Load migrations 001 through 010
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
  const profileService = new ProfileService(db);
  const awardsService = new AwardsService(db);

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
    process.stdout.write(`🧪 [M8 Test ${totalTests}] ${name}... `);
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
    // TEST FIXTURE SETUP
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

    // Tournament 1: T20, 20 overs, max 4 overs per bowler (qualifying balls = 48)
    const t1Res = await db.query(
      `INSERT INTO tournaments (
        created_by_user_id, name, short_name, slug, ball_type, format,
        overs_per_innings, balls_per_over, max_overs_per_bowler,
        city, status
      ) VALUES (
        $1, 'Super Cup 2026', 'SC26', 'sc-2026-m8', 'LEATHER', 'T20',
        20, 6, 4, 'Mumbai', 'ONGOING'
      ) RETURNING id;`,
      [organizerId]
    );
    const tournament1Id = t1Res.rows[0].id;

    // Create 2 Global Teams
    const tm1Res = await db.query(
      `INSERT INTO teams (name, short_name, city, created_by_user_id)
       VALUES ('Spartans Cricket Club', 'SCC', 'Mumbai', $1) RETURNING id;`,
      [organizerId]
    );
    const team1Id = tm1Res.rows[0].id;

    const tm2Res = await db.query(
      `INSERT INTO teams (name, short_name, city, created_by_user_id)
       VALUES ('Vikings XI', 'VXI', 'Mumbai', $1) RETURNING id;`,
      [organizerId]
    );
    const team2Id = tm2Res.rows[0].id;

    // Enroll Teams in Tournament 1
    const tt1Res = await db.query(
      `INSERT INTO tournament_teams (tournament_id, team_id, group_name)
       VALUES ($1, $2, 'Group A') RETURNING id;`,
      [tournament1Id, team1Id]
    );
    const tournamentTeam1Id = tt1Res.rows[0].id;

    const tt2Res = await db.query(
      `INSERT INTO tournament_teams (tournament_id, team_id, group_name)
       VALUES ($1, $2, 'Group A') RETURNING id;`,
      [tournament1Id, team2Id]
    );
    const tournamentTeam2Id = tt2Res.rows[0].id;

    // Create Players
    const pBatterRes = await db.query(
      `INSERT INTO players (full_name, nickname, batting_style, bowling_style, primary_role)
       VALUES ('Sachin Tendulkar', 'Master', 'RIGHT_HAND_BAT', 'RIGHT_ARM_SPIN_OFF', 'BATTER')
       RETURNING id;`
    );
    const batterId = pBatterRes.rows[0].id;

    const pBowlerRes = await db.query(
      `INSERT INTO players (full_name, nickname, batting_style, bowling_style, primary_role)
       VALUES ('Jasprit Bumrah', 'Boom', 'RIGHT_HAND_BAT', 'RIGHT_ARM_FAST', 'BOWLER')
       RETURNING id;`
    );
    const bowlerId = pBowlerRes.rows[0].id;

    const pFielderRes = await db.query(
      `INSERT INTO players (full_name, nickname, batting_style, bowling_style, primary_role)
       VALUES ('Ravindra Jadeja', 'Jaddu', 'LEFT_HAND_BAT', 'LEFT_ARM_SPIN_ORTHODOX', 'ALL_ROUNDER')
       RETURNING id;`
    );
    const fielderId = pFielderRes.rows[0].id;

    const pNonStrikerRes = await db.query(
      `INSERT INTO players (full_name, nickname, batting_style, bowling_style, primary_role)
       VALUES ('Rahul Dravid', 'Wall', 'RIGHT_HAND_BAT', 'RIGHT_ARM_SPIN_OFF', 'BATTER')
       RETURNING id;`
    );
    const nonStrikerId = pNonStrikerRes.rows[0].id;

    // Add players to team rosters
    await db.query(
      `INSERT INTO team_rosters (tournament_team_id, player_id, jersey_number, is_captain)
       VALUES ($1, $2, 10, TRUE), ($1, $3, 93, FALSE), ($1, $4, 8, FALSE);`,
      [tournamentTeam1Id, batterId, bowlerId, fielderId]
    );
    await db.query(
      `INSERT INTO team_rosters (tournament_team_id, player_id, jersey_number, is_captain)
       VALUES ($1, $2, 19, FALSE);`,
      [tournamentTeam2Id, nonStrikerId]
    );

    // ==================================================================
    // TEST 1: Player Profile & Bio Retrieval
    // ==================================================================
    await assertTest('Player Profile & Bio: Retrieve bio, style, roles; handle 404', async () => {
      const res = await request(`/api/v1/players/${batterId}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.data.full_name, 'Sachin Tendulkar');
      assert.strictEqual(res.data.data.primary_role, 'BATTER');
      assert.strictEqual(res.data.data.batting_style, 'RIGHT_HAND_BAT');

      const notFoundRes = await request(`/api/v1/players/00000000-0000-0000-0000-000000000000`);
      assert.strictEqual(notFoundRes.status, 404);
    });

    // ==================================================================
    // TEST 2: Career Batting Statistics Aggregation
    // ==================================================================
    await assertTest('Career Batting Stats: Runs, avg, SR, 50s/100s, not-outs, high score', async () => {
      // Create Match 1 (Completed)
      const m1Res = await db.query(
        `INSERT INTO matches (
          tournament_id, match_number, stage, status, overs_quota,
          team_a_id, team_b_id, winner_team_id, result_type, scheduled_start_time
        ) VALUES ($1, 1, 'LEAGUE', 'COMPLETED', 20, $2, $3, $2, 'NORMAL', NOW())
        RETURNING id;`,
        [tournament1Id, tournamentTeam1Id, tournamentTeam2Id]
      );
      const match1Id = m1Res.rows[0].id;

      await db.query(
        `INSERT INTO match_players (match_id, tournament_team_id, player_id, is_playing_xi)
         VALUES ($1, $2, $3, TRUE);`,
        [match1Id, tournamentTeam1Id, batterId]
      );

      const inn1Res = await db.query(
        `INSERT INTO innings (match_id, innings_number, batting_team_id, bowling_team_id, total_runs, total_wickets, total_legal_balls, status)
         VALUES ($1, 1, $2, $3, 180, 5, 120, 'COMPLETED') RETURNING id;`,
        [match1Id, tournamentTeam1Id, tournamentTeam2Id]
      );
      const innings1Id = inn1Res.rows[0].id;

      // Innings 1: 54 runs (32 balls, 6 fours, 2 sixes, dismissed)
      await db.query(
        `INSERT INTO batting_performances (innings_id, player_id, batting_order, runs_scored, balls_faced, fours, sixes, is_out)
         VALUES ($1, $2, 1, 54, 32, 6, 2, TRUE);`,
        [innings1Id, batterId]
      );

      // Create Match 2 (Completed)
      const m2Res = await db.query(
        `INSERT INTO matches (
          tournament_id, match_number, stage, status, overs_quota,
          team_a_id, team_b_id, winner_team_id, result_type, scheduled_start_time
        ) VALUES ($1, 2, 'LEAGUE', 'COMPLETED', 20, $2, $3, $2, 'NORMAL', NOW())
        RETURNING id;`,
        [tournament1Id, tournamentTeam1Id, tournamentTeam2Id]
      );
      const match2Id = m2Res.rows[0].id;

      await db.query(
        `INSERT INTO match_players (match_id, tournament_team_id, player_id, is_playing_xi)
         VALUES ($1, $2, $3, TRUE);`,
        [match2Id, tournamentTeam1Id, batterId]
      );

      const inn2Res = await db.query(
        `INSERT INTO innings (match_id, innings_number, batting_team_id, bowling_team_id, total_runs, total_wickets, total_legal_balls, status)
         VALUES ($1, 1, $2, $3, 210, 3, 120, 'COMPLETED') RETURNING id;`,
        [match2Id, tournamentTeam1Id, tournamentTeam2Id]
      );
      const innings2Id = inn2Res.rows[0].id;

      // Innings 2: 102* runs (58 balls, 11 fours, 4 sixes, not out!)
      await db.query(
        `INSERT INTO batting_performances (innings_id, player_id, batting_order, runs_scored, balls_faced, fours, sixes, is_out)
         VALUES ($1, $2, 1, 102, 58, 11, 4, FALSE);`,
        [innings2Id, batterId]
      );

      // Fetch stats
      const statsRes = await request(`/api/v1/players/${batterId}/stats`);
      assert.strictEqual(statsRes.status, 200);
      const b = statsRes.data.data.batting;

      assert.strictEqual(statsRes.data.data.matches_played, 2);
      assert.strictEqual(b.innings, 2);
      assert.strictEqual(b.runs, 156);
      assert.strictEqual(b.not_outs, 1);
      assert.strictEqual(b.balls_faced, 90);
      assert.strictEqual(b.fours, 17);
      assert.strictEqual(b.sixes, 6);
      assert.strictEqual(b.fifties, 1);
      assert.strictEqual(b.hundreds, 1);
      assert.strictEqual(b.ducks, 0);
      assert.strictEqual(b.highest_score, 102);
      assert.strictEqual(b.highest_score_not_out, true);
      assert.strictEqual(b.highest_score_display, '102*');
      assert.strictEqual(b.average, 156.0); // 156 / 1 dismissal
      assert.strictEqual(b.strike_rate, 173.33); // (156 / 90) * 100
    });

    // ==================================================================
    // TEST 3: Career Bowling Statistics Aggregation
    // ==================================================================
    await assertTest('Career Bowling Stats: Overs, wickets, maidens, economy, avg, best figures', async () => {
      // Find matches created above
      const mRes = await db.query(`SELECT id FROM matches WHERE tournament_id = $1 ORDER BY match_number ASC;`, [tournament1Id]);
      const match1Id = mRes.rows[0].id;
      const match2Id = mRes.rows[1].id;

      // Innings 2 in Match 1 (Bumrah bowls 4 overs 4/18, 1 maiden)
      const inn1bRes = await db.query(
        `INSERT INTO innings (match_id, innings_number, batting_team_id, bowling_team_id, total_runs, total_wickets, total_legal_balls, status)
         VALUES ($1, 2, $2, $3, 140, 9, 120, 'COMPLETED') RETURNING id;`,
        [match1Id, tournamentTeam2Id, tournamentTeam1Id]
      );
      await db.query(
        `INSERT INTO bowling_performances (innings_id, player_id, bowling_order, legal_balls_bowled, maidens, runs_conceded, wickets)
         VALUES ($1, $2, 1, 24, 1, 18, 4);`,
        [inn1bRes.rows[0].id, bowlerId]
      );

      // Innings 2 in Match 2 (Bumrah bowls 4 overs 2/30, 0 maidens)
      const inn2bRes = await db.query(
        `INSERT INTO innings (match_id, innings_number, batting_team_id, bowling_team_id, total_runs, total_wickets, total_legal_balls, status)
         VALUES ($1, 2, $2, $3, 150, 7, 120, 'COMPLETED') RETURNING id;`,
        [match2Id, tournamentTeam2Id, tournamentTeam1Id]
      );
      await db.query(
        `INSERT INTO bowling_performances (innings_id, player_id, bowling_order, legal_balls_bowled, maidens, runs_conceded, wickets)
         VALUES ($1, $2, 1, 24, 0, 30, 2);`,
        [inn2bRes.rows[0].id, bowlerId]
      );

      const statsRes = await request(`/api/v1/players/${bowlerId}/stats`);
      assert.strictEqual(statsRes.status, 200);
      const bw = statsRes.data.data.bowling;

      assert.strictEqual(bw.innings, 2);
      assert.strictEqual(bw.legal_balls, 48);
      assert.strictEqual(bw.overs_display, '8.0');
      assert.strictEqual(bw.maidens, 1);
      assert.strictEqual(bw.runs_conceded, 48);
      assert.strictEqual(bw.wickets, 6);
      assert.strictEqual(bw.average, 8.0); // 48 / 6
      assert.strictEqual(bw.economy, 6.0); // (48 / 48) * 6
      assert.strictEqual(bw.strike_rate, 8.0); // 48 / 6
      assert.strictEqual(bw.best_figures, '4/18');
      assert.strictEqual(bw.three_wicket_hauls, 1);
      assert.strictEqual(bw.five_wicket_hauls, 0);
    });

    // ==================================================================
    // TEST 4: Career Fielding Statistics Aggregation
    // ==================================================================
    await assertTest('Career Fielding Stats: Catches, stumpings, run-outs from deliveries ledger', async () => {
      const innRes = await db.query(`SELECT id FROM innings WHERE batting_team_id = $1 LIMIT 1;`, [tournamentTeam2Id]);
      const inningsId = innRes.rows[0].id;

      // Create dummy over
      const ovRes = await db.query(
        `INSERT INTO overs (innings_id, over_number, bowler_id) VALUES ($1, 1, $2) RETURNING id;`,
        [inningsId, bowlerId]
      );
      const overId = ovRes.rows[0].id;

      // Jadeja takes 2 catches, 1 stumping, 1 run-out (all is_reverted = FALSE)
      await db.query(
        `INSERT INTO deliveries (
          innings_id, over_id, delivery_sequence, ball_number, legal_ball_number, bowler_id, striker_id, non_striker_id,
          runs_batter, runs_extras, is_legal, is_wicket, wicket_type, dismissed_player_id, assist_player_id, is_reverted,
          created_by_user_id
        ) VALUES
          ($1, $2, 1, 1, 1, $3, $4, $5, 0, 0, TRUE, TRUE, 'CAUGHT', $4, $6, FALSE, $7),
          ($1, $2, 2, 2, 2, $3, $4, $5, 0, 0, TRUE, TRUE, 'CAUGHT', $4, $6, FALSE, $7),
          ($1, $2, 3, 3, 3, $3, $4, $5, 0, 0, TRUE, TRUE, 'STUMPED', $4, $6, FALSE, $7),
          ($1, $2, 4, 4, 4, $3, $4, $5, 0, 0, TRUE, TRUE, 'RUN_OUT', $4, $6, FALSE, $7);`,
        [inningsId, overId, bowlerId, batterId, nonStrikerId, fielderId, organizerId]
      );

      const statsRes = await request(`/api/v1/players/${fielderId}/stats`);
      assert.strictEqual(statsRes.status, 200);
      const f = statsRes.data.data.fielding;

      assert.strictEqual(f.catches, 2);
      assert.strictEqual(f.stumpings, 1);
      assert.strictEqual(f.run_outs, 1);
      assert.strictEqual(f.total_dismissals, 4);
    });

    // ==================================================================
    // TEST 5: Team Profile & Win/Loss Record Across Tournaments
    // ==================================================================
    await assertTest('Team Profile: All-time matches played, won, lost, and win percentage', async () => {
      // Create Tournament 2 (Team 1 participates in Tournament 2 as well)
      const t2Res = await db.query(
        `INSERT INTO tournaments (
          created_by_user_id, name, short_name, slug, ball_type, format,
          overs_per_innings, balls_per_over, max_overs_per_bowler,
          city, status
        ) VALUES (
          $1, 'Winter League 2026', 'WL26', 'wl-2026-m8', 'LEATHER', 'T20',
          20, 6, 4, 'Pune', 'COMPLETED'
        ) RETURNING id;`,
        [organizerId]
      );
      const tournament2Id = t2Res.rows[0].id;

      // Enroll Team 1 & Team 2 in Tournament 2
      const tt21Res = await db.query(
        `INSERT INTO tournament_teams (tournament_id, team_id, group_name)
         VALUES ($1, $2, 'Group B') RETURNING id;`,
        [tournament2Id, team1Id]
      );
      const tt2Team1Id = tt21Res.rows[0].id;

      const tt22Res = await db.query(
        `INSERT INTO tournament_teams (tournament_id, team_id, group_name)
         VALUES ($1, $2, 'Group B') RETURNING id;`,
        [tournament2Id, team2Id]
      );
      const tt2Team2Id = tt22Res.rows[0].id;

      // Add 2 matches in Tournament 2:
      // Match A: Team 1 wins
      // Match B: Team 1 loses
      await db.query(
        `INSERT INTO matches (tournament_id, match_number, stage, status, overs_quota, team_a_id, team_b_id, winner_team_id, result_type, scheduled_start_time)
         VALUES
          ($1, 1, 'LEAGUE', 'COMPLETED', 20, $2, $3, $2, 'NORMAL', NOW()),
          ($1, 2, 'LEAGUE', 'COMPLETED', 20, $2, $3, $3, 'NORMAL', NOW());`,
        [tournament2Id, tt2Team1Id, tt2Team2Id]
      );

      // In Tournament 1: Team 1 played 2 matches and won both (from Test 2).
      // In Tournament 2: Team 1 played 2 matches (won 1, lost 1).
      // Overall across all tournaments: Played 4, Won 3, Lost 1, Win Rate = 75.0%
      const teamStatsRes = await request(`/api/v1/teams/${team1Id}/stats`);
      assert.strictEqual(teamStatsRes.status, 200);
      const ts = teamStatsRes.data.data;

      assert.strictEqual(ts.tournaments_participated_count, 2);
      assert.strictEqual(ts.matches_played, 4);
      assert.strictEqual(ts.matches_won, 3);
      assert.strictEqual(ts.matches_lost, 1);
      assert.strictEqual(ts.win_percentage, 75.0);

      // Scoped to Tournament 1 only
      const t1StatsRes = await request(`/api/v1/teams/${team1Id}/stats?tournamentId=${tournament1Id}`);
      assert.strictEqual(t1StatsRes.status, 200);
      assert.strictEqual(t1StatsRes.data.data.matches_played, 2);
      assert.strictEqual(t1StatsRes.data.data.matches_won, 2);
      assert.strictEqual(t1StatsRes.data.data.win_percentage, 100.0);
    });

    // ==================================================================
    // TEST 6: Team Roster Tournament Validation
    // ==================================================================
    await assertTest('Team Roster: Requires tournamentId, rejects missing (400) or unenrolled (404)', async () => {
      // 1. Missing tournamentId query parameter -> 400 Bad Request
      const missingRes = await request(`/api/v1/teams/${team1Id}/roster`);
      assert.strictEqual(missingRes.status, 400);
      assert.ok(JSON.stringify(missingRes.data.error).includes('tournamentId'));

      // 2. Unenrolled tournament -> 404 Not Found
      const fakeTournId = '99999999-9999-9999-9999-999999999999';
      await db.query(
        `INSERT INTO tournaments (
          id, created_by_user_id, name, short_name, slug, ball_type, format,
          overs_per_innings, balls_per_over, max_overs_per_bowler, city, status
        ) VALUES (
          $1, $2, 'Other Cup', 'OC', 'oc-m8', 'LEATHER', 'T20', 20, 6, 4, 'Goa', 'DRAFT'
        );`,
        [fakeTournId, organizerId]
      );
      const unenrolledRes = await request(`/api/v1/teams/${team1Id}/roster?tournamentId=${fakeTournId}`);
      assert.strictEqual(unenrolledRes.status, 404);
      assert.ok(JSON.stringify(unenrolledRes.data.error).includes('not enrolled'));

      // 3. Valid tournament roster
      const validRes = await request(`/api/v1/teams/${team1Id}/roster?tournamentId=${tournament1Id}`);
      assert.strictEqual(validRes.status, 200);
      assert.strictEqual(validRes.data.data.team_id, team1Id);
      assert.strictEqual(validRes.data.data.roster.length, 3);
      assert.ok(validRes.data.data.roster.some((p) => p.full_name === 'Sachin Tendulkar'));
    });

    // ==================================================================
    // TEST 7: Team Trophy Showcase
    // ==================================================================
    await assertTest('Team Trophy Showcase: Accurately reports championships and runner-up finishes', async () => {
      // Mark Tournament 1 completed with Team 1 as Champion
      await db.query(
        `UPDATE tournaments
         SET status = 'COMPLETED', champion_team_id = $1, runner_up_team_id = $2
         WHERE id = $3;`,
        [tournamentTeam1Id, tournamentTeam2Id, tournament1Id]
      );

      // Mark Tournament 2 completed with Team 1 as Runner-up
      const tt2Res = await db.query(
        `SELECT id FROM tournament_teams WHERE tournament_id = $1 AND team_id = $2;`,
        [tournamentTeam2Id, team1Id] // Team 1 in Tournament 2
      );
      // Update Tournament 2 with Team 1 as runner-up
      const tt21Id = (await db.query(`SELECT id FROM tournament_teams WHERE tournament_id = (SELECT id FROM tournaments WHERE slug = 'wl-2026-m8') AND team_id = $1;`, [team1Id])).rows[0].id;
      const tt22Id = (await db.query(`SELECT id FROM tournament_teams WHERE tournament_id = (SELECT id FROM tournaments WHERE slug = 'wl-2026-m8') AND team_id = $1;`, [team2Id])).rows[0].id;

      await db.query(
        `UPDATE tournaments
         SET champion_team_id = $1, runner_up_team_id = $2
         WHERE slug = 'wl-2026-m8';`,
        [tt22Id, tt21Id]
      );

      const statsRes = await request(`/api/v1/teams/${team1Id}/stats`);
      assert.strictEqual(statsRes.status, 200);
      const trophies = statsRes.data.data.trophies;

      assert.strictEqual(trophies.championship_count, 1);
      assert.strictEqual(trophies.runner_up_count, 1);
      assert.strictEqual(trophies.championships[0].tournament_name, 'Super Cup 2026');
      assert.strictEqual(trophies.runner_ups[0].tournament_name, 'Winter League 2026');
    });

    // ==================================================================
    // TEST 8: Tournament MVP Calculation & Non-Cumulative Milestone Bonuses
    // ==================================================================
    await assertTest('Tournament MVP: Non-cumulative milestone bonuses (+10 / +25 / +50) and deterministic ranking', async () => {
      // Create new dedicated tournament for exact MVP points verification
      const mvpTournRes = await db.query(
        `INSERT INTO tournaments (
          created_by_user_id, name, short_name, slug, ball_type, format,
          overs_per_innings, balls_per_over, max_overs_per_bowler, city, status
        ) VALUES (
          $1, 'MVP Championship', 'MVP', 'mvp-2026', 'LEATHER', 'T20', 20, 6, 4, 'Delhi', 'ONGOING'
        ) RETURNING id;`,
        [organizerId]
      );
      const mvpTournId = mvpTournRes.rows[0].id;

      const ttA = (await db.query(`INSERT INTO tournament_teams (tournament_id, team_id) VALUES ($1, $2) RETURNING id;`, [mvpTournId, team1Id])).rows[0].id;
      const ttB = (await db.query(`INSERT INTO tournament_teams (tournament_id, team_id) VALUES ($1, $2) RETURNING id;`, [mvpTournId, team2Id])).rows[0].id;

      // Player A: 35 runs (30-49 milestone bonus = +10, NOT cumulative). Total batting = 35 + 2 fours (2) + 1 six (2) + 10 = 49 pts.
      // Player B: 65 runs (50-99 milestone bonus = +25, NOT cumulative). Total batting = 65 + 4 fours (4) + 2 sixes (4) + 25 = 98 pts.
      // Player C: 110 runs (100+ milestone bonus = +50, NOT cumulative). Total batting = 110 + 8 fours (8) + 4 sixes (8) + 50 = 176 pts.
      const pARes = await db.query(`INSERT INTO players (full_name) VALUES ('Player A') RETURNING id;`);
      const pBRes = await db.query(`INSERT INTO players (full_name) VALUES ('Player B') RETURNING id;`);
      const pCRes = await db.query(`INSERT INTO players (full_name) VALUES ('Player C') RETURNING id;`);
      const idA = pARes.rows[0].id;
      const idB = pBRes.rows[0].id;
      const idC = pCRes.rows[0].id;

      const mRes = await db.query(
        `INSERT INTO matches (tournament_id, match_number, stage, status, overs_quota, team_a_id, team_b_id, scheduled_start_time)
         VALUES ($1, 1, 'LEAGUE', 'COMPLETED', 20, $2, $3, NOW()) RETURNING id;`,
        [mvpTournId, ttA, ttB]
      );
      const innRes = await db.query(
        `INSERT INTO innings (match_id, innings_number, batting_team_id, bowling_team_id, total_runs, total_wickets, total_legal_balls, status)
         VALUES ($1, 1, $2, $3, 220, 3, 120, 'COMPLETED') RETURNING id;`,
        [mRes.rows[0].id, ttA, ttB]
      );
      const innId = innRes.rows[0].id;

      await db.query(
        `INSERT INTO batting_performances (innings_id, player_id, batting_order, runs_scored, balls_faced, fours, sixes, is_out)
         VALUES
          ($1, $2, 1, 35, 25, 2, 1, TRUE),
          ($1, $3, 2, 65, 40, 4, 2, TRUE),
          ($1, $4, 3, 110, 55, 8, 4, FALSE);`,
        [innId, idA, idB, idC]
      );

      const awards = await awardsService.getTournamentAwards(mvpTournId);
      const pAData = awards.mvp_podium.find((p) => p.player_id === idA);
      const pBData = awards.mvp_podium.find((p) => p.player_id === idB);
      const pCData = awards.mvp_podium.find((p) => p.player_id === idC);

      // Verify non-cumulative milestone bonuses
      assert.strictEqual(pAData.batting.milestone_bonus, 10);
      assert.strictEqual(pAData.batting.points, 49); // 35 + 2(4s) + 2(6s) + 10

      assert.strictEqual(pBData.batting.milestone_bonus, 25);
      assert.strictEqual(pBData.batting.points, 98); // 65 + 4(4s) + 4(6s) + 25

      assert.strictEqual(pCData.batting.milestone_bonus, 50);
      assert.strictEqual(pCData.batting.points, 176); // 110 + 8(4s) + 8(6s) + 50

      // Player C must be rank 1 MVP
      assert.strictEqual(awards.mvp.player_id, idC);
    });

    // ==================================================================
    // TEST 9: Tournament Awards & Economy Qualification Threshold
    // ==================================================================
    await assertTest('Tournament Awards: Best Batter, Best Bowler, and Economy threshold (48 legal balls)', async () => {
      // In Tournament 1 (max_overs_per_bowler = 4 -> min balls = 48)
      // Sachin Tendulkar has 156 runs -> Best Batter!
      // Jasprit Bumrah bowled 48 legal balls with 6 wickets, conceded 48 runs (economy 6.00)
      // Add Bowler Under-Qualified (bowled only 12 balls, conceded 4 runs -> economy 2.00)
      const pLowBalls = (await db.query(`INSERT INTO players (full_name) VALUES ('Part Timer') RETURNING id;`)).rows[0].id;
      const mRes = await db.query(`SELECT id FROM matches WHERE tournament_id = $1 LIMIT 1;`, [tournament1Id]);
      const innRes = await db.query(`SELECT id FROM innings WHERE match_id = $1 LIMIT 1;`, [mRes.rows[0].id]);

      await db.query(
        `INSERT INTO bowling_performances (innings_id, player_id, bowling_order, legal_balls_bowled, maidens, runs_conceded, wickets)
         VALUES ($1, $2, 5, 12, 0, 4, 1);`,
        [innRes.rows[0].id, pLowBalls]
      );

      const res = await request(`/api/v1/tournaments/${tournament1Id}/awards`);
      assert.strictEqual(res.status, 200);
      const awards = res.data.data;

      assert.strictEqual(awards.qualification_minimum_balls, 48);
      assert.strictEqual(awards.best_batter.player_id, batterId);
      assert.strictEqual(awards.best_batter.runs, 156);
      assert.strictEqual(awards.best_bowler.player_id, bowlerId);
      assert.strictEqual(awards.best_bowler.wickets, 6);

      // Economy Champion MUST be Bumrah (48 balls), NOT Part Timer (12 balls)!
      assert.strictEqual(awards.most_economical_bowler.player_id, bowlerId);
      assert.strictEqual(awards.most_economical_bowler.economy, 6.0);
    });

    // ==================================================================
    // TEST 10: Reverted Deliveries Full Exclusion Regression
    // ==================================================================
    await assertTest('Reverted Deliveries Regression: 100% excluded from batter, bowler, and fielding aggregates', async () => {
      const innRes = await db.query(`SELECT id FROM innings WHERE batting_team_id = $1 LIMIT 1;`, [tournamentTeam2Id]);
      const inningsId = innRes.rows[0].id;

      // Add reverted deliveries:
      // - 1 reverted six off bat
      // - 1 reverted wicket caught by Jadeja
      const ovRes = await db.query(`SELECT id FROM overs WHERE innings_id = $1 LIMIT 1;`, [inningsId]);
      const overId = ovRes.rows[0].id;

      await db.query(
        `INSERT INTO deliveries (
          innings_id, over_id, delivery_sequence, ball_number, legal_ball_number, bowler_id, striker_id, non_striker_id,
          runs_batter, runs_extras, is_legal, is_wicket, wicket_type, dismissed_player_id, assist_player_id, is_reverted,
          created_by_user_id
        ) VALUES
          ($1, $2, 91, 5, 1, $3, $4, $5, 6, 0, TRUE, FALSE, 'NONE', NULL, NULL, TRUE, $7),
          ($1, $2, 92, 6, 2, $3, $4, $5, 0, 0, TRUE, TRUE, 'CAUGHT', $4, $6, TRUE, $7);`,
        [inningsId, overId, bowlerId, batterId, nonStrikerId, fielderId, organizerId]
      );

      // Verify Fielding stats: catches for Jadeja must still be 2 (from Test 4), NOT 3!
      const statsRes = await request(`/api/v1/players/${fielderId}/stats`);
      assert.strictEqual(statsRes.status, 200);
      assert.strictEqual(statsRes.data.data.fielding.catches, 2);

      // Verify awards: reverted balls never appear in sixes count
      const awards = await awardsService.getTournamentAwards(tournament1Id);
      assert.strictEqual(awards.maximum_sixes.sixes, 6); // 2 + 4 from Test 2, the reverted six is ignored
    });

  } finally {
    server.close();
  }

  console.log('\n======================================================================');
  console.log(`🏆 ALL ${passedTests} OF ${totalTests} MILESTONE 8 PROFILE & AWARD TESTS PASSED!`);
  console.log('======================================================================\n');

  return { passedTests, totalTests };
}
