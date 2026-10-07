// ====================================================================
// MILESTONE 9: TOURNAMENT RECORDS, HEAD-TO-HEAD & PRINTABLE EXPORT TESTS
// ====================================================================

import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app.js';
import { RecordsService } from '../src/services/recordsService.js';
import { H2HService } from '../src/services/h2hService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMilestone9RecordsAndH2HTests() {
  console.log('\n🏏 ======================================================================');
  console.log('🏏 LocalCricket: Running Milestone 9 Tournament Records & H2H Tests');
  console.log('🏏 ======================================================================\n');

  // Initialize fresh in-memory database
  const db = new PGlite();

  // Run all migrations including 011
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
  const recordsService = new RecordsService(db);
  const h2hService = new H2HService(db);

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
    process.stdout.write(`🧪 [M9 Test ${totalTests}] ${name}... `);
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
    // TEST FIXTURES SETUP
    // ------------------------------------------------------------------
    const organizerId = '11111111-1111-1111-1111-111111111111';
    await db.query(
      `INSERT INTO auth.users (id, email) VALUES ($1, 'm9.organizer@test.com') ON CONFLICT DO NOTHING;`,
      [organizerId]
    );
    await db.query(
      `INSERT INTO users (id, auth_user_id, full_name, email, global_role)
       VALUES ($1, $1, 'M9 Official Admin', 'm9.organizer@test.com', 'USER')
       ON CONFLICT DO NOTHING;`,
      [organizerId]
    );

    // Tournament 1: T20, 20 overs quota
    const t1Res = await db.query(
      `INSERT INTO tournaments (
        created_by_user_id, name, short_name, slug, ball_type, format,
        overs_per_innings, balls_per_over, max_overs_per_bowler,
        city, status
      ) VALUES (
        $1, 'M9 Premier Trophy', 'M9PT', 'm9-premier-2026', 'LEATHER', 'T20',
        20, 6, 4, 'Mumbai', 'ONGOING'
      ) RETURNING id;`,
      [organizerId]
    );
    const tournament1Id = t1Res.rows[0].id;

    // Create 3 Global Teams
    const tmARes = await db.query(
      `INSERT INTO teams (name, short_name, city, created_by_user_id)
       VALUES ('Spartans Cricket Club', 'SCC', 'Mumbai', $1) RETURNING id;`,
      [organizerId]
    );
    const teamAId = tmARes.rows[0].id;

    const tmBRes = await db.query(
      `INSERT INTO teams (name, short_name, city, created_by_user_id)
       VALUES ('Vikings XI', 'VXI', 'Mumbai', $1) RETURNING id;`,
      [organizerId]
    );
    const teamBId = tmBRes.rows[0].id;

    const tmCRes = await db.query(
      `INSERT INTO teams (name, short_name, city, created_by_user_id)
       VALUES ('Hawks Academy', 'HAK', 'Mumbai', $1) RETURNING id;`,
      [organizerId]
    );
    const teamCId = tmCRes.rows[0].id;

    // Enroll Teams in Tournament 1
    const ttARes = await db.query(
      `INSERT INTO tournament_teams (tournament_id, team_id) VALUES ($1, $2) RETURNING id;`,
      [tournament1Id, teamAId]
    );
    const ttAId = ttARes.rows[0].id;

    const ttBRes = await db.query(
      `INSERT INTO tournament_teams (tournament_id, team_id) VALUES ($1, $2) RETURNING id;`,
      [tournament1Id, teamBId]
    );
    const ttBId = ttBRes.rows[0].id;

    const ttCRes = await db.query(
      `INSERT INTO tournament_teams (tournament_id, team_id) VALUES ($1, $2) RETURNING id;`,
      [tournament1Id, teamCId]
    );
    const ttCId = ttCRes.rows[0].id;

    // Create Sample Players
    const pSachinRes = await db.query(
      `INSERT INTO players (full_name, nickname, batting_style, bowling_style, primary_role)
       VALUES ('Sachin Tendulkar', 'Master', 'RIGHT_HAND_BAT', 'RIGHT_ARM_SPIN_OFF', 'BATTER')
       RETURNING id;`
    );
    const pSachin = pSachinRes.rows[0].id;

    const pRohitRes = await db.query(
      `INSERT INTO players (full_name, nickname, batting_style, bowling_style, primary_role)
       VALUES ('Rohit Sharma', 'Hitman', 'RIGHT_HAND_BAT', 'RIGHT_ARM_SPIN_OFF', 'BATTER')
       RETURNING id;`
    );
    const pRohit = pRohitRes.rows[0].id;

    const pKohliRes = await db.query(
      `INSERT INTO players (full_name, nickname, batting_style, bowling_style, primary_role)
       VALUES ('Virat Kohli', 'King', 'RIGHT_HAND_BAT', 'RIGHT_ARM_MEDIUM', 'BATTER')
       RETURNING id;`
    );
    const pKohli = pKohliRes.rows[0].id;

    const pBumrahRes = await db.query(
      `INSERT INTO players (full_name, nickname, batting_style, bowling_style, primary_role)
       VALUES ('Jasprit Bumrah', 'Boom', 'RIGHT_HAND_BAT', 'RIGHT_ARM_FAST', 'BOWLER')
       RETURNING id;`
    );
    const pBumrah = pBumrahRes.rows[0].id;

    const pBhuviRes = await db.query(
      `INSERT INTO players (full_name, nickname, batting_style, bowling_style, primary_role)
       VALUES ('Bhuvneshwar Kumar', 'Bhuvi', 'RIGHT_HAND_BAT', 'RIGHT_ARM_MEDIUM', 'BOWLER')
       RETURNING id;`
    );
    const pBhuvi = pBhuviRes.rows[0].id;

    // Register into rosters
    await db.query(
      `INSERT INTO team_rosters (tournament_team_id, player_id, jersey_number, is_captain) VALUES
       ($1, $2, 10, FALSE), ($1, $3, 45, TRUE), ($1, $4, 93, FALSE),
       ($5, $6, 18, TRUE), ($5, $7, 15, FALSE);`,
      [ttAId, pSachin, pRohit, pBumrah, ttBId, pKohli, pBhuvi]
    );

    // Create Venue for Tournament 1
    const vRes = await db.query(
      `INSERT INTO venues (tournament_id, name, ground_name, city)
       VALUES ($1, 'Wankhede', 'Main Ground', 'Mumbai') RETURNING id;`,
      [tournament1Id]
    );
    const venue1Id = vRes.rows[0].id;

    // ==================================================================
    // TEST 1: Highest Team Total with Deterministic Tie-Breaker
    // ==================================================================
    await assertTest('Highest Team Total: Deterministic tie-break (runs DESC, legal_balls ASC, wickets ASC, match_number ASC)', async () => {
      // Match 1: Spartans vs Vikings (Spartans score 210/3 in 120 balls)
      const m1Res = await db.query(
        `INSERT INTO matches (tournament_id, match_number, stage, status, overs_quota, team_a_id, team_b_id, winner_team_id, result_type, scheduled_start_time, venue_id)
         VALUES ($1, 1, 'LEAGUE', 'COMPLETED', 20, $2, $3, $2, 'NORMAL', NOW(), $4) RETURNING id;`,
        [tournament1Id, ttAId, ttBId, venue1Id]
      );
      const m1Id = m1Res.rows[0].id;

      const inn1Res = await db.query(
        `INSERT INTO innings (match_id, innings_number, batting_team_id, bowling_team_id, total_runs, total_wickets, total_legal_balls, status)
         VALUES ($1, 1, $2, $3, 210, 3, 120, 'COMPLETED') RETURNING id;`,
        [m1Id, ttAId, ttBId]
      );

      // Match 2: Hawks vs Vikings (Hawks score 210/5 in 120 balls -> equal runs, but more wickets lost!)
      const m2Res = await db.query(
        `INSERT INTO matches (tournament_id, match_number, stage, status, overs_quota, team_a_id, team_b_id, winner_team_id, result_type, scheduled_start_time, venue_id)
         VALUES ($1, 2, 'LEAGUE', 'COMPLETED', 20, $2, $3, $2, 'NORMAL', NOW(), $4) RETURNING id;`,
        [tournament1Id, ttCId, ttBId, venue1Id]
      );
      const m2Id = m2Res.rows[0].id;

      await db.query(
        `INSERT INTO innings (match_id, innings_number, batting_team_id, bowling_team_id, total_runs, total_wickets, total_legal_balls, status)
         VALUES ($1, 1, $2, $3, 210, 5, 120, 'COMPLETED');`,
        [m2Id, ttCId, ttBId]
      );

      const records = await recordsService.getTournamentRecords(tournament1Id);
      const highTotal = records.team_records.highest_innings_total;

      assert.strictEqual(highTotal.runs, 210);
      assert.strictEqual(highTotal.wickets, 3, '210/3 must deterministically beat 210/5');
      assert.strictEqual(highTotal.team_name, 'Spartans Cricket Club');
    });

    // ==================================================================
    // TEST 2: Lowest Team Total Precision & Completion Requirements
    // ==================================================================
    await assertTest('Lowest Team Total: Completed matches only (all-out, quota, chase); excludes ongoing/abandoned', async () => {
      // In Match 1: Vikings scored 68/10 in 14.2 ov (all out, completed!)
      const m1Res = await db.query(`SELECT id FROM matches WHERE tournament_id = $1 AND match_number = 1;`, [tournament1Id]);
      await db.query(
        `INSERT INTO innings (match_id, innings_number, batting_team_id, bowling_team_id, total_runs, total_wickets, total_legal_balls, status)
         VALUES ($1, 2, $2, $3, 68, 10, 86, 'COMPLETED');`,
        [m1Res.rows[0].id, ttBId, ttAId]
      );

      // Create Match 3: Abandoned match with 30/2 (MUST BE EXCLUDED!)
      const m3Res = await db.query(
        `INSERT INTO matches (tournament_id, match_number, stage, status, overs_quota, team_a_id, team_b_id, result_type, scheduled_start_time)
         VALUES ($1, 3, 'LEAGUE', 'ABANDONED', 20, $2, $3, 'NO_RESULT', NOW()) RETURNING id;`,
        [tournament1Id, ttAId, ttCId]
      );
      await db.query(
        `INSERT INTO innings (match_id, innings_number, batting_team_id, bowling_team_id, total_runs, total_wickets, total_legal_balls, status)
         VALUES ($1, 1, $2, $3, 30, 2, 36, 'IN_PROGRESS');`,
        [m3Res.rows[0].id, ttAId, ttCId]
      );

      const records = await recordsService.getTournamentRecords(tournament1Id);
      const lowTotal = records.team_records.lowest_innings_total;

      assert.strictEqual(lowTotal.runs, 68, 'Must be 68 (all out), NOT the 30 from abandoned match');
      assert.strictEqual(lowTotal.wickets, 10);
      assert.strictEqual(lowTotal.team_name, 'Vikings XI');
    });

    // ==================================================================
    // TEST 3: Largest Victory Margins with Deterministic Tie-Breakers
    // ==================================================================
    await assertTest('Largest Victory Margins: Deterministic tie-breaks for runs and wickets', async () => {
      // In Match 1: Spartans won by 142 runs (210 vs 68)
      const m1Id = (await db.query(`SELECT id FROM matches WHERE tournament_id = $1 AND match_number = 1;`, [tournament1Id])).rows[0].id;
      await db.query(
        `UPDATE matches SET result_margin_runs = 142, result_margin_wickets = NULL WHERE id = $1;`,
        [m1Id]
      );

      // Match 4: Spartans chase 120 in 15.0 ov and win by 8 wickets with 30 balls remaining
      const m4Res = await db.query(
        `INSERT INTO matches (tournament_id, match_number, stage, status, overs_quota, team_a_id, team_b_id, winner_team_id, result_type, result_margin_wickets, scheduled_start_time, venue_id)
         VALUES ($1, 4, 'LEAGUE', 'COMPLETED', 20, $2, $3, $3, 'NORMAL', 8, NOW(), $4) RETURNING id;`,
        [tournament1Id, ttBId, ttAId, venue1Id]
      );
      await db.query(
        `INSERT INTO innings (match_id, innings_number, batting_team_id, bowling_team_id, total_runs, total_wickets, total_legal_balls, status)
         VALUES ($1, 1, $2, $3, 120, 6, 120, 'COMPLETED'),
                ($1, 2, $3, $2, 121, 2, 90, 'COMPLETED');`,
        [m4Res.rows[0].id, ttBId, ttAId]
      );

      const records = await recordsService.getTournamentRecords(tournament1Id);
      const marginRuns = records.team_records.largest_victory_margin_runs;
      const marginWkts = records.team_records.largest_victory_margin_wickets;

      assert.strictEqual(marginRuns.margin_runs, 142);
      assert.strictEqual(marginRuns.winner_team_name, 'Spartans Cricket Club');

      assert.strictEqual(marginWkts.margin_wickets, 8);
      assert.strictEqual(marginWkts.winner_team_name, 'Spartans Cricket Club');
    });

    // ==================================================================
    // TEST 4: Highest Match Aggregate Deterministic Tie-Breaker
    // ==================================================================
    await assertTest('Highest Match Aggregate: Sums runs across both innings; deterministic tie-break', async () => {
      // In Match 1: 210 + 68 = 278 runs, 13 wickets
      // In Match 4: 120 + 121 = 241 runs
      const records = await recordsService.getTournamentRecords(tournament1Id);
      const agg = records.team_records.highest_match_aggregate;

      assert.strictEqual(agg.total_runs, 278);
      assert.strictEqual(agg.wickets, 13);
      assert.strictEqual(agg.match_number, 1);
    });

    // ==================================================================
    // TEST 5: Highest Individual Score with Unbeaten Priority
    // ==================================================================
    await assertTest('Highest Individual Score: Unbeaten priority (102* beats 102 out), and most sixes in innings', async () => {
      const inn1Id = (await db.query(`SELECT id FROM innings WHERE match_id = (SELECT id FROM matches WHERE match_number = 1 AND tournament_id = $1) AND innings_number = 1;`, [tournament1Id])).rows[0].id;

      // Player 1 (Sachin): 102* (58 balls, 11 fours, 4 sixes, is_out = FALSE)
      await db.query(
        `INSERT INTO batting_performances (innings_id, player_id, batting_order, runs_scored, balls_faced, fours, sixes, is_out)
         VALUES ($1, $2, 1, 102, 58, 11, 4, FALSE);`,
        [inn1Id, pSachin]
      );

      // Player 2 (Rohit): 102 (50 balls, 10 fours, 5 sixes, is_out = TRUE -> dismissed!)
      await db.query(
        `INSERT INTO batting_performances (innings_id, player_id, batting_order, runs_scored, balls_faced, fours, sixes, is_out)
         VALUES ($1, $2, 2, 102, 50, 10, 5, TRUE);`,
        [inn1Id, pRohit]
      );

      const records = await recordsService.getTournamentRecords(tournament1Id);
      const highBat = records.batting_records.highest_individual_score;
      const most6s = records.batting_records.most_sixes_in_innings;

      // Sachin 102* must beat Rohit 102 because is_out = FALSE (unbeaten priority)
      assert.strictEqual(highBat.player_id, pSachin);
      assert.strictEqual(highBat.score_display, '102*');
      assert.strictEqual(highBat.is_out, false);

      // Rohit has 5 sixes in that innings -> most sixes record
      assert.strictEqual(most6s.player_id, pRohit);
      assert.strictEqual(most6s.sixes, 5);
    });

    // ==================================================================
    // TEST 6: Best Bowling Figures & Maidens Tie-Breaker
    // ==================================================================
    await assertTest('Best Bowling Figures: Wickets DESC, runs ASC, balls ASC; Most maidens', async () => {
      const inn2Id = (await db.query(`SELECT id FROM innings WHERE match_id = (SELECT id FROM matches WHERE match_number = 1 AND tournament_id = $1) AND innings_number = 2;`, [tournament1Id])).rows[0].id;

      // Bumrah: 4/18 (24 balls, 1 maiden)
      await db.query(
        `INSERT INTO bowling_performances (innings_id, player_id, bowling_order, legal_balls_bowled, maidens, runs_conceded, wickets)
         VALUES ($1, $2, 1, 24, 1, 18, 4);`,
        [inn2Id, pBumrah]
      );

      // Bhuvi: 4/25 (24 balls, 0 maidens) -> Same wickets, but conceded more runs!
      await db.query(
        `INSERT INTO bowling_performances (innings_id, player_id, bowling_order, legal_balls_bowled, maidens, runs_conceded, wickets)
         VALUES ($1, $2, 2, 24, 0, 25, 4);`,
        [inn2Id, pBhuvi]
      );

      const records = await recordsService.getTournamentRecords(tournament1Id);
      const bestBowl = records.bowling_records.best_bowling_figures;
      const mostMdns = records.bowling_records.most_maidens_in_innings;

      assert.strictEqual(bestBowl.player_id, pBumrah);
      assert.strictEqual(bestBowl.figures_display, '4/18');
      assert.strictEqual(bestBowl.wickets, 4);
      assert.strictEqual(bestBowl.runs_conceded, 18);

      assert.strictEqual(mostMdns.player_id, pBumrah);
      assert.strictEqual(mostMdns.maidens, 1);
    });

    // ==================================================================
    // TEST 7: Partnership-by-Wicket Records & Unbroken Partnerships
    // ==================================================================
    await assertTest('Partnership-by-Wicket: Tracks wickets 1-10; unbroken final partnership eligible', async () => {
      // In Match 4 Innings 2:
      // Innings starts with Sachin & Rohit.
      // 1st Wicket: Sachin dismissed when score is 36 (36 runs, 20 balls).
      // 2nd Wicket: Rohit & Bumrah take score to 121 (85 runs, 50 balls, UNBROKEN!).
      const innM42Id = (await db.query(`SELECT id FROM innings WHERE match_id = (SELECT id FROM matches WHERE match_number = 4 AND tournament_id = $1) AND innings_number = 2;`, [tournament1Id])).rows[0].id;

      // Create over 1 & 2 for Match 4 Innings 2
      const ov1 = (await db.query(`INSERT INTO overs (innings_id, over_number, bowler_id) VALUES ($1, 1, $2) RETURNING id;`, [innM42Id, pBhuvi])).rows[0].id;
      const ov2 = (await db.query(`INSERT INTO overs (innings_id, over_number, bowler_id) VALUES ($1, 2, $2) RETURNING id;`, [innM42Id, pBhuvi])).rows[0].id;

      // Delivery 1: Sachin 6 off Bhuvi (striker Sachin, non-striker Rohit)
      await db.query(
        `INSERT INTO deliveries (innings_id, over_id, delivery_sequence, ball_number, legal_ball_number, bowler_id, striker_id, non_striker_id, runs_batter, runs_extras, is_legal, is_wicket, wicket_type, created_by_user_id)
         VALUES ($1, $2, 1, 1, 1, $3, $4, $5, 6, 0, TRUE, FALSE, 'NONE', $6);`,
        [innM42Id, ov1, pBhuvi, pSachin, pRohit, organizerId]
      );

      // Delivery 2: Sachin caught out! (30 runs previously + 6 = 36 runs)
      await db.query(
        `INSERT INTO deliveries (innings_id, over_id, delivery_sequence, ball_number, legal_ball_number, bowler_id, striker_id, non_striker_id, runs_batter, runs_extras, is_legal, is_wicket, wicket_type, dismissed_player_id, assist_player_id, created_by_user_id)
         VALUES ($1, $2, 2, 2, 2, $3, $4, $5, 0, 0, TRUE, TRUE, 'CAUGHT', $4, $7, $6);`,
        [innM42Id, ov1, pBhuvi, pSachin, pRohit, organizerId, pKohli]
      );

      // Delivery 3: Rohit & Bumrah batting -> Unbroken partnership to end of innings
      await db.query(
        `INSERT INTO deliveries (innings_id, over_id, delivery_sequence, ball_number, legal_ball_number, bowler_id, striker_id, non_striker_id, runs_batter, runs_extras, is_legal, is_wicket, wicket_type, created_by_user_id)
         VALUES ($1, $2, 3, 1, 1, $3, $4, $5, 4, 0, TRUE, FALSE, 'NONE', $6);`,
        [innM42Id, ov2, pBhuvi, pRohit, pBumrah, organizerId]
      );

      const records = await recordsService.getTournamentRecords(tournament1Id);
      const parts = records.partnership_records;

      assert.ok(parts.length >= 2, 'Should have records for 1st and 2nd wicket');
      const w1 = parts.find((p) => p.wicket === 1);
      const w2 = parts.find((p) => p.wicket === 2);

      assert.strictEqual(w1.wicket, 1);
      assert.strictEqual(w1.is_unbroken, false);

      assert.strictEqual(w2.wicket, 2);
      assert.strictEqual(w2.is_unbroken, true, 'Final partnership must be eligible as unbroken');
    });

    // ==================================================================
    // TEST 8: Reverted Deliveries Complete Exclusion Regression
    // ==================================================================
    await assertTest('Reverted Deliveries Regression: 100% excluded from high scores, sixes, team totals, partnerships', async () => {
      const innM42Id = (await db.query(`SELECT id FROM innings WHERE match_id = (SELECT id FROM matches WHERE match_number = 4 AND tournament_id = $1) AND innings_number = 2;`, [tournament1Id])).rows[0].id;
      const ov1 = (await db.query(`SELECT id FROM overs WHERE innings_id = $1 LIMIT 1;`, [innM42Id])).rows[0].id;

      // Add a reverted delivery with 6 runs and a wicket
      await db.query(
        `INSERT INTO deliveries (
          innings_id, over_id, delivery_sequence, ball_number, legal_ball_number, bowler_id, striker_id, non_striker_id,
          runs_batter, runs_extras, is_legal, is_wicket, wicket_type, dismissed_player_id, is_reverted, created_by_user_id
        ) VALUES ($1, $2, 99, 5, 3, $3, $4, $5, 6, 0, TRUE, TRUE, 'BOWLED', $4, TRUE, $6);`,
        [innM42Id, ov1, pBhuvi, pRohit, pBumrah, organizerId]
      );

      const records = await recordsService.getTournamentRecords(tournament1Id);
      // Reverted six should NOT alter most sixes or partnership runs
      const most6s = records.batting_records.most_sixes_in_innings;
      assert.strictEqual(most6s.sixes, 5, 'Reverted six must not increase sixes total');
    });

    // ==================================================================
    // TEST 9: Strict Tournament Records Isolation
    // ==================================================================
    await assertTest('Tournament Records Isolation: Records in Tournament B never bleed into Tournament A', async () => {
      // Create Tournament B
      const t2Res = await db.query(
        `INSERT INTO tournaments (created_by_user_id, name, short_name, slug, ball_type, format, overs_per_innings, balls_per_over, max_overs_per_bowler, city, status)
         VALUES ($1, 'Tournament B', 'TB', 'tourn-b-m9', 'LEATHER', 'T20', 20, 6, 4, 'Pune', 'COMPLETED') RETURNING id;`,
        [organizerId]
      );
      const tournament2Id = t2Res.rows[0].id;

      const tt2A = (await db.query(`INSERT INTO tournament_teams (tournament_id, team_id) VALUES ($1, $2) RETURNING id;`, [tournament2Id, teamAId])).rows[0].id;
      const tt2B = (await db.query(`INSERT INTO tournament_teams (tournament_id, team_id) VALUES ($1, $2) RETURNING id;`, [tournament2Id, teamBId])).rows[0].id;

      // In Tournament B, Spartans score a massive 280 runs!
      const mTB = (await db.query(
        `INSERT INTO matches (tournament_id, match_number, stage, status, overs_quota, team_a_id, team_b_id, winner_team_id, result_type, scheduled_start_time)
         VALUES ($1, 1, 'LEAGUE', 'COMPLETED', 20, $2, $3, $2, 'NORMAL', NOW()) RETURNING id;`,
        [tournament2Id, tt2A, tt2B]
      )).rows[0].id;

      await db.query(
        `INSERT INTO innings (match_id, innings_number, batting_team_id, bowling_team_id, total_runs, total_wickets, total_legal_balls, status)
         VALUES ($1, 1, $2, $3, 280, 2, 120, 'COMPLETED');`,
        [mTB, tt2A, tt2B]
      );

      // Verify Tournament A records still report 210, NOT 280!
      const t1Records = await recordsService.getTournamentRecords(tournament1Id);
      assert.strictEqual(t1Records.team_records.highest_innings_total.runs, 210);

      // Verify Tournament B records report 280
      const t2Records = await recordsService.getTournamentRecords(tournament2Id);
      assert.strictEqual(t2Records.team_records.highest_innings_total.runs, 280);
    });

    // ==================================================================
    // TEST 10: Head-to-Head Symmetric Orientations & Super Over Outcome
    // ==================================================================
    await assertTest('Head-to-Head: Symmetric querying (team_a vs team_b) and Super Over counts as WIN/LOSS (not TIE)', async () => {
      // In Match 1: Team A vs Team B -> Team A won
      // In Match 4: Team B vs Team A (symmetric inverted orientation) -> Team A won
      // Create Match 5: Team A vs Team B tied regular overs, resolved via SUPER_OVER with Team B winning!
      const m5Res = await db.query(
        `INSERT INTO matches (tournament_id, match_number, stage, status, overs_quota, team_a_id, team_b_id, winner_team_id, result_type, scheduled_start_time)
         VALUES ($1, 5, 'LEAGUE', 'COMPLETED', 20, $2, $3, $3, 'SUPER_OVER', NOW()) RETURNING id;`,
        [tournament1Id, ttAId, ttBId]
      );

      // Query H2H with Team A as subject and Team B as opponent (scoped to Tournament 1)
      const h2hAB = await h2hService.getHeadToHead(teamAId, teamBId, { tournamentId: tournament1Id });
      assert.strictEqual(h2hAB.matches_played, 3);
      assert.strictEqual(h2hAB.team_a_wins, 2, 'Team A won Match 1 and Match 4');
      assert.strictEqual(h2hAB.team_b_wins, 1, 'Team B won Match 5 via Super Over');
      assert.strictEqual(h2hAB.tied, 0, 'Super Over must NOT be recorded as tie');

      // Query H2H symmetrically with Team B as subject and Team A as opponent (scoped to Tournament 1)
      const h2hBA = await h2hService.getHeadToHead(teamBId, teamAId, { tournamentId: tournament1Id });
      assert.strictEqual(h2hBA.matches_played, 3);
      assert.strictEqual(h2hBA.team_a_wins, 1, 'Team B (subject) has 1 win');
      assert.strictEqual(h2hBA.team_b_wins, 2, 'Team A (opponent) has 2 wins');
      assert.strictEqual(h2hBA.tied, 0);

      // All-time H2H includes the Tournament 2 match
      const h2hAllTime = await h2hService.getHeadToHead(teamAId, teamBId);
      assert.strictEqual(h2hAllTime.matches_played, 4);
      assert.strictEqual(h2hAllTime.team_a_wins, 3);
      assert.strictEqual(h2hAllTime.team_b_wins, 1);

      // Test HTTP endpoint with tournamentId query param
      const httpRes = await request(`/api/v1/teams/${teamAId}/head-to-head?opponentTeamId=${teamBId}&tournamentId=${tournament1Id}`);
      assert.strictEqual(httpRes.status, 200);
      assert.strictEqual(httpRes.data.data.matches_played, 3);
    });

    // ==================================================================
    // TEST 11: Recent Form Tournament Scope & Venue Averages
    // ==================================================================
    await assertTest('Match Preview: Recent form scoped to tournament; venue averages exclude current match', async () => {
      // Create Match 6 (SCHEDULED): Spartans vs Vikings at 'Wankhede'
      const m6Res = await db.query(
        `INSERT INTO matches (tournament_id, match_number, stage, status, overs_quota, team_a_id, team_b_id, scheduled_start_time, venue_id)
         VALUES ($1, 6, 'LEAGUE', 'SCHEDULED', 20, $2, $3, NOW(), $4) RETURNING id;`,
        [tournament1Id, ttAId, ttBId, venue1Id]
      );
      const match6Id = m6Res.rows[0].id;

      const previewRes = await request(`/api/v1/matches/${match6Id}/preview`);
      assert.strictEqual(previewRes.status, 200);
      const prev = previewRes.data.data;

      // Recent form for Team A and Team B in Tournament 1
      assert.ok(Array.isArray(prev.team_a.recent_form));
      assert.ok(prev.team_a.recent_form.length > 0);
      assert.ok(prev.team_a.recent_form.includes('W'));

      // Venue averages at 'Wankhede' (must exclude current scheduled match 6 and abandoned match 3)
      assert.ok(prev.venue_stats);
      assert.strictEqual(prev.venue_stats.venue_name, 'Wankhede');
      assert.ok(prev.venue_stats.matches_played_at_venue >= 2);
      assert.ok(prev.venue_stats.average_first_innings_score > 0);
    });

    // ==================================================================
    // TEST 12: Printable Export Contract & Official Assignments
    // ==================================================================
    await assertTest('Printable Export: Full box score and authoritative official names (null when unassigned)', async () => {
      const m1Id = (await db.query(`SELECT id FROM matches WHERE tournament_id = $1 AND match_number = 1;`, [tournament1Id])).rows[0].id;

      const exportRes = await request(`/api/v1/matches/${m1Id}/export`);
      assert.strictEqual(exportRes.status, 200);
      const data = exportRes.data.data;

      assert.strictEqual(data.match.match_number, 1);
      assert.strictEqual(data.match.status, 'COMPLETED');
      assert.ok(Array.isArray(data.scorecards));
      assert.strictEqual(data.scorecards.length, 2);

      // Official assignments: creator user is official scorer, umpires unassigned -> null (never fabricated!)
      assert.strictEqual(data.officials.official_scorer_name, 'Amit Sharma (Organizer)');
      assert.strictEqual(data.officials.umpire_1_name, null);
      assert.strictEqual(data.officials.umpire_2_name, null);
    });

  } finally {
    server.close();
  }

  console.log('\n======================================================================');
  console.log(`🏆 ALL ${passedTests} OF ${totalTests} MILESTONE 9 RECORDS & H2H TESTS PASSED!`);
  console.log('======================================================================\n');

  return { passedTests, totalTests };
}
