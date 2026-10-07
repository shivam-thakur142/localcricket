import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('🏏 ========================================================');
  console.log('🏏 LocalCricket: Running Milestone 1 Integrity Tests');
  console.log('🏏 ========================================================\n');

  const db = new PGlite();

  // Helper to run SQL files
  const runSqlFile = async (fileName) => {
    const filePath = path.join(__dirname, '..', 'migrations', fileName);
    const sql = fs.readFileSync(filePath, 'utf-8');
    console.log(`📄 Executing ${fileName}...`);
    await db.exec(sql);
    console.log(`✅ ${fileName} executed successfully.\n`);
  };

  try {
    // 1. Run migrations and seed data
    await runSqlFile('001_initial_schema.sql');
    await runSqlFile('002_triggers_and_integrity.sql');
    await runSqlFile('003_rls_policies.sql');
    await runSqlFile('004_seed_test_data.sql');

    let passedTests = 0;
    let totalTests = 0;

    const assertTest = async (testName, testFn) => {
      totalTests++;
      process.stdout.write(`🧪 [Test ${totalTests}] ${testName}... `);
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

    const assertThrows = async (testName, testFn, expectedErrorSubstring) => {
      totalTests++;
      process.stdout.write(`🧪 [Test ${totalTests}] ${testName} (Expect Rejection)... `);
      try {
        await testFn();
        console.log('FAILED ❌ (Expected exception but operation succeeded)');
        throw new Error(`Test failed: Expected exception containing "${expectedErrorSubstring}", but succeeded.`);
      } catch (err) {
        if (expectedErrorSubstring && !err.message.toLowerCase().includes(expectedErrorSubstring.toLowerCase())) {
          console.log(`FAILED ❌ (Wrong error message: ${err.message})`);
          throw err;
        }
        passedTests++;
        console.log('PASSED ✅');
      }
    };

    // Constant UUIDs from seed
    const INNINGS_ID = '99999999-9999-9999-9999-999999999999';
    const OVER_ID = 'aaaaaaaa-1111-aaaa-1111-aaaaaaaaaaaa';
    const MATCH_ID = '88888888-8888-8888-8888-888888888888';
    const TOURNEY_ID = '33333333-3333-3333-3333-333333333333';
    const TEAM_DW_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const TEAM_BS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const STRIKER_ID = '10000000-0000-0000-0000-000000000001'; // Rohit Varma
    const NON_STRIKER_ID = '10000000-0000-0000-0000-000000000002'; // Rahul Dravid Jr
    const BOWLER_ID = '20000000-0000-0000-0000-000000000008'; // Mitchell Starc
    const SCORER_USER_ID = '22222222-2222-2222-2222-222222222222';

    console.log('--- TEST GROUP 1: NORMAL LEGAL DELIVERIES ---');

    await assertTest('Record 1 run off the bat (Legal delivery)', async () => {
      const res = await db.query(`
        INSERT INTO deliveries (
          innings_id, over_id, delivery_sequence, ball_number, legal_ball_number,
          bowler_id, striker_id, non_striker_id, runs_batter, runs_extras,
          extra_type, is_legal, is_wicket, created_by_user_id
        ) VALUES (
          '${INNINGS_ID}', '${OVER_ID}', 1, 1, 1,
          '${BOWLER_ID}', '${STRIKER_ID}', '${NON_STRIKER_ID}', 1, 0,
          'NONE', TRUE, FALSE, '${SCORER_USER_ID}'
        ) RETURNING *;
      `);
      if (res.rows.length !== 1) throw new Error('Expected 1 inserted row');
      const row = res.rows[0];
      if (row.delivery_sequence !== 1 || row.legal_ball_number !== 1 || row.is_legal !== true) {
        throw new Error('Delivery values mismatch');
      }
    });

    await assertTest('Record 4 runs boundary off the bat (Legal delivery)', async () => {
      const res = await db.query(`
        INSERT INTO deliveries (
          innings_id, over_id, delivery_sequence, ball_number, legal_ball_number,
          bowler_id, striker_id, non_striker_id, runs_batter, runs_extras,
          extra_type, is_legal, is_wicket, created_by_user_id
        ) VALUES (
          '${INNINGS_ID}', '${OVER_ID}', 2, 2, 2,
          '${BOWLER_ID}', '${STRIKER_ID}', '${NON_STRIKER_ID}', 4, 0,
          'NONE', TRUE, FALSE, '${SCORER_USER_ID}'
        ) RETURNING *;
      `);
      const row = res.rows[0];
      if (row.delivery_sequence !== 2 || row.legal_ball_number !== 2 || row.runs_batter !== 4) {
        throw new Error('Boundary delivery values mismatch');
      }
    });

    console.log('\n--- TEST GROUP 2: WIDES & EXTRA INVARIANTS ---');

    await assertTest('Record Wide ball (Illegal delivery, legal_ball_number unchanged)', async () => {
      const res = await db.query(`
        INSERT INTO deliveries (
          innings_id, over_id, delivery_sequence, ball_number, legal_ball_number,
          bowler_id, striker_id, non_striker_id, runs_batter, runs_extras,
          extra_type, is_legal, is_wicket, created_by_user_id
        ) VALUES (
          '${INNINGS_ID}', '${OVER_ID}', 3, 3, 2,
          '${BOWLER_ID}', '${STRIKER_ID}', '${NON_STRIKER_ID}', 0, 1,
          'WIDE', FALSE, FALSE, '${SCORER_USER_ID}'
        ) RETURNING *;
      `);
      const row = res.rows[0];
      if (row.is_legal !== false || row.legal_ball_number !== 2 || row.runs_extras !== 1) {
        throw new Error('Wide ball values mismatch');
      }
    });

    await assertThrows(
      'Reject Wide ball with runs off bat > 0 (Wide invariant violation)',
      async () => {
        await db.query(`
          INSERT INTO deliveries (
            innings_id, over_id, delivery_sequence, ball_number, legal_ball_number,
            bowler_id, striker_id, non_striker_id, runs_batter, runs_extras,
            extra_type, is_legal, created_by_user_id
          ) VALUES (
            '${INNINGS_ID}', '${OVER_ID}', 4, 4, 2,
            '${BOWLER_ID}', '${STRIKER_ID}', '${NON_STRIKER_ID}', 2, 1,
            'WIDE', FALSE, '${SCORER_USER_ID}'
          );
        `);
      },
      'chk_delivery_wide_rules'
    );

    await assertThrows(
      'Reject Wide ball marked as is_legal = TRUE (Legality invariant violation)',
      async () => {
        await db.query(`
          INSERT INTO deliveries (
            innings_id, over_id, delivery_sequence, ball_number, legal_ball_number,
            bowler_id, striker_id, non_striker_id, runs_batter, runs_extras,
            extra_type, is_legal, created_by_user_id
          ) VALUES (
            '${INNINGS_ID}', '${OVER_ID}', 4, 4, 2,
            '${BOWLER_ID}', '${STRIKER_ID}', '${NON_STRIKER_ID}', 0, 1,
            'WIDE', TRUE, '${SCORER_USER_ID}'
          );
        `);
      },
      'chk_delivery_legality'
    );

    console.log('\n--- TEST GROUP 3: NO-BALLS & EXTRA INVARIANTS ---');

    await assertTest('Record No-Ball with 4 runs off bat (Total 5 runs, illegal delivery)', async () => {
      const res = await db.query(`
        INSERT INTO deliveries (
          innings_id, over_id, delivery_sequence, ball_number, legal_ball_number,
          bowler_id, striker_id, non_striker_id, runs_batter, runs_extras,
          extra_type, is_legal, is_wicket, created_by_user_id
        ) VALUES (
          '${INNINGS_ID}', '${OVER_ID}', 4, 4, 2,
          '${BOWLER_ID}', '${STRIKER_ID}', '${NON_STRIKER_ID}', 4, 1,
          'NO_BALL', FALSE, FALSE, '${SCORER_USER_ID}'
        ) RETURNING *;
      `);
      const row = res.rows[0];
      if (row.is_legal !== false || row.runs_batter !== 4 || row.runs_extras !== 1) {
        throw new Error('No ball with boundary values mismatch');
      }
    });

    await assertThrows(
      'Reject No-Ball marked as is_legal = TRUE (Legality invariant violation)',
      async () => {
        await db.query(`
          INSERT INTO deliveries (
            innings_id, over_id, delivery_sequence, ball_number, legal_ball_number,
            bowler_id, striker_id, non_striker_id, runs_batter, runs_extras,
            extra_type, is_legal, created_by_user_id
          ) VALUES (
            '${INNINGS_ID}', '${OVER_ID}', 5, 5, 2,
            '${BOWLER_ID}', '${STRIKER_ID}', '${NON_STRIKER_ID}', 1, 1,
            'NO_BALL', TRUE, '${SCORER_USER_ID}'
          );
        `);
      },
      'chk_delivery_legality'
    );

    console.log('\n--- TEST GROUP 4: BYES & LEG BYES ---');

    await assertTest('Record 1 Bye (Legal delivery, 0 off bat, 1 extra)', async () => {
      const res = await db.query(`
        INSERT INTO deliveries (
          innings_id, over_id, delivery_sequence, ball_number, legal_ball_number,
          bowler_id, striker_id, non_striker_id, runs_batter, runs_extras,
          extra_type, is_legal, is_wicket, created_by_user_id
        ) VALUES (
          '${INNINGS_ID}', '${OVER_ID}', 5, 5, 3,
          '${BOWLER_ID}', '${STRIKER_ID}', '${NON_STRIKER_ID}', 0, 1,
          'BYE', TRUE, FALSE, '${SCORER_USER_ID}'
        ) RETURNING *;
      `);
      const row = res.rows[0];
      if (row.is_legal !== true || row.extra_type !== 'BYE' || row.legal_ball_number !== 3) {
        throw new Error('Bye delivery values mismatch');
      }
    });

    await assertThrows(
      'Reject Bye with runs off bat > 0 (Byes invariant violation)',
      async () => {
        await db.query(`
          INSERT INTO deliveries (
            innings_id, over_id, delivery_sequence, ball_number, legal_ball_number,
            bowler_id, striker_id, non_striker_id, runs_batter, runs_extras,
            extra_type, is_legal, created_by_user_id
          ) VALUES (
            '${INNINGS_ID}', '${OVER_ID}', 6, 6, 4,
            '${BOWLER_ID}', '${STRIKER_ID}', '${NON_STRIKER_ID}', 1, 1,
            'BYE', TRUE, '${SCORER_USER_ID}'
          );
        `);
      },
      'chk_delivery_byes_rules'
    );

    console.log('\n--- TEST GROUP 5: WICKETS & DISMISSAL INTEGRITY ---');

    await assertTest('Record Bowled dismissal of Striker', async () => {
      const res = await db.query(`
        INSERT INTO deliveries (
          innings_id, over_id, delivery_sequence, ball_number, legal_ball_number,
          bowler_id, striker_id, non_striker_id, runs_batter, runs_extras,
          extra_type, is_legal, is_wicket, wicket_type, dismissed_player_id, created_by_user_id
        ) VALUES (
          '${INNINGS_ID}', '${OVER_ID}', 6, 6, 4,
          '${BOWLER_ID}', '${STRIKER_ID}', '${NON_STRIKER_ID}', 0, 0,
          'NONE', TRUE, TRUE, 'BOWLED', '${STRIKER_ID}', '${SCORER_USER_ID}'
        ) RETURNING *;
      `);
      const row = res.rows[0];
      if (row.is_wicket !== true || row.wicket_type !== 'BOWLED' || row.dismissed_player_id !== STRIKER_ID) {
        throw new Error('Wicket values mismatch');
      }
    });

    await assertThrows(
      'Reject wicket when is_wicket = TRUE but dismissed_player_id is NULL',
      async () => {
        await db.query(`
          INSERT INTO deliveries (
            innings_id, over_id, delivery_sequence, ball_number, legal_ball_number,
            bowler_id, striker_id, non_striker_id, runs_batter, runs_extras,
            extra_type, is_legal, is_wicket, wicket_type, dismissed_player_id, created_by_user_id
          ) VALUES (
            '${INNINGS_ID}', '${OVER_ID}', 7, 7, 5,
            '${BOWLER_ID}', '${STRIKER_ID}', '${NON_STRIKER_ID}', 0, 0,
            'NONE', TRUE, TRUE, 'BOWLED', NULL, '${SCORER_USER_ID}'
          );
        `);
      },
      'chk_delivery_wicket_rules'
    );

    await assertThrows(
      'Reject wicket when dismissed player is NOT on the pitch (neither striker nor non-striker)',
      async () => {
        // Player 3 is in squad but not on pitch
        const BENCH_PLAYER_ID = '10000000-0000-0000-0000-000000000003';
        await db.query(`
          INSERT INTO deliveries (
            innings_id, over_id, delivery_sequence, ball_number, legal_ball_number,
            bowler_id, striker_id, non_striker_id, runs_batter, runs_extras,
            extra_type, is_legal, is_wicket, wicket_type, dismissed_player_id, created_by_user_id
          ) VALUES (
            '${INNINGS_ID}', '${OVER_ID}', 7, 7, 5,
            '${BOWLER_ID}', '${STRIKER_ID}', '${NON_STRIKER_ID}', 0, 0,
            'NONE', TRUE, TRUE, 'BOWLED', '${BENCH_PLAYER_ID}', '${SCORER_USER_ID}'
          );
        `);
      },
      'must be either striker'
    );

    console.log('\n--- TEST GROUP 6: INVALID PLAYERS & ROSTER INTEGRITY ---');

    await assertThrows(
      'Reject match_player if player is NOT in tournament team_roster (Composite FK)',
      async () => {
        // Create un-rostered player
        const roguePlayerId = '99999999-0000-0000-0000-000000000099';
        await db.query(`
          INSERT INTO players (id, full_name, batting_style, bowling_style, primary_role)
          VALUES ('${roguePlayerId}', 'Rogue Player', 'RIGHT_HAND_BAT', 'NONE', 'BATTER');
        `);
        // Attempt to insert directly into match_players without team_rosters registration
        await db.query(`
          INSERT INTO match_players (match_id, tournament_team_id, player_id, is_playing_xi)
          VALUES ('${MATCH_ID}', '${TEAM_DW_ID}', '${roguePlayerId}', TRUE);
        `);
      },
      'fk_match_player_roster'
    );

    await assertThrows(
      'Reject innings where striker and non-striker are the SAME player',
      async () => {
        await db.query(`
          UPDATE innings
          SET current_non_striker_id = '${STRIKER_ID}'
          WHERE id = '${INNINGS_ID}';
        `);
      },
      'chk_innings_distinct_batters'
    );

    await assertThrows(
      'Reject innings where striker is from the BOWLING team (Trigger check)',
      async () => {
        await db.query(`
          UPDATE innings
          SET current_striker_id = '${BOWLER_ID}'
          WHERE id = '${INNINGS_ID}';
        `);
      },
      'not in batting team playing xi'
    );

    await assertThrows(
      'Reject delivery where bowler does NOT match the over bowler (Trigger check)',
      async () => {
        // Another bowler from Bandra Strikers
        const OTHER_BOWLER_ID = '20000000-0000-0000-0000-000000000007'; // Pat Cummins
        await db.query(`
          INSERT INTO deliveries (
            innings_id, over_id, delivery_sequence, ball_number, legal_ball_number,
            bowler_id, striker_id, non_striker_id, runs_batter, runs_extras,
            extra_type, is_legal, created_by_user_id
          ) VALUES (
            '${INNINGS_ID}', '${OVER_ID}', 7, 7, 5,
            '${OTHER_BOWLER_ID}', '${STRIKER_ID}', '${NON_STRIKER_ID}', 0, 0,
            'NONE', TRUE, '${SCORER_USER_ID}'
          );
        `);
      },
      'does not match over bowler'
    );

    console.log('\n--- TEST GROUP 7: WRONG TEAMS & TOURNAMENT INTEGRITY ---');

    await assertThrows(
      'Reject match_player from a third team NOT participating in the match (Trigger check)',
      async () => {
        // Third team: Andheri Lions
        const TT_AL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
        await db.exec(`
          INSERT INTO tournament_teams (id, tournament_id, team_id, group_name)
          VALUES ('${TT_AL_ID}', '${TOURNEY_ID}', '66666666-6666-6666-6666-666666666666', 'Group B');
        `);
        const alPlayerId = '30000000-0000-0000-0000-000000000001';
        await db.exec(`
          INSERT INTO players (id, full_name, batting_style, bowling_style, primary_role)
          VALUES ('${alPlayerId}', 'AL Player', 'RIGHT_HAND_BAT', 'NONE', 'BATTER');
          INSERT INTO team_rosters (tournament_team_id, player_id)
          VALUES ('${TT_AL_ID}', '${alPlayerId}');
        `);
        // Attempt to insert AL player into match 1
        await db.query(`
          INSERT INTO match_players (match_id, tournament_team_id, player_id, is_playing_xi)
          VALUES ('${MATCH_ID}', '${TT_AL_ID}', '${alPlayerId}', TRUE);
        `);
      },
      'does not participate in match'
    );

    await assertThrows(
      'Reject match where team_a and team_b are the SAME team (Check constraint)',
      async () => {
        await db.query(`
          INSERT INTO matches (
            tournament_id, team_a_id, team_b_id, match_number, scheduled_start_time, overs_quota
          ) VALUES (
            '${TOURNEY_ID}', '${TEAM_DW_ID}', '${TEAM_DW_ID}', 2, NOW(), 20
          );
        `);
      },
      'chk_different_teams'
    );

    await assertThrows(
      'Reject innings where batting team and bowling team are the SAME team',
      async () => {
        await db.query(`
          INSERT INTO innings (
            match_id, innings_number, batting_team_id, bowling_team_id
          ) VALUES (
            '${MATCH_ID}', 2, '${TEAM_DW_ID}', '${TEAM_DW_ID}'
          );
        `);
      },
      'do not match match teams'
    );

    console.log('\n--- TEST GROUP 8: MONOTONIC SEQUENCE & AUDIT UNDO ---');

    await assertThrows(
      'Reject duplicate delivery_sequence in the same innings (Unique constraint)',
      async () => {
        // Sequence 1 was already used
        await db.query(`
          INSERT INTO deliveries (
            innings_id, over_id, delivery_sequence, ball_number, legal_ball_number,
            bowler_id, striker_id, non_striker_id, runs_batter, runs_extras,
            extra_type, is_legal, created_by_user_id
          ) VALUES (
            '${INNINGS_ID}', '${OVER_ID}', 1, 7, 5,
            '${BOWLER_ID}', '${STRIKER_ID}', '${NON_STRIKER_ID}', 0, 0,
            'NONE', TRUE, '${SCORER_USER_ID}'
          );
        `);
      },
      'duplicate key value violates unique constraint'
    );

    await assertTest('Perform non-destructive Undo/Reversion on delivery 6', async () => {
      const res = await db.query(`
        UPDATE deliveries
        SET is_reverted = TRUE,
            reverted_at = NOW(),
            reverted_by_user_id = '${SCORER_USER_ID}',
            reversion_reason = 'Incorrect batsman dismissal entered by scorer'
        WHERE innings_id = '${INNINGS_ID}' AND delivery_sequence = 6
        RETURNING *;
      `);
      if (res.rows.length !== 1) throw new Error('Expected 1 reverted delivery');
      const row = res.rows[0];
      if (row.is_reverted !== true || !row.reversion_reason) {
        throw new Error('Undo fields mismatch');
      }

      // Verify that the record is still physically in the table (non-destructive)
      const countRes = await db.query(`
        SELECT COUNT(*) as total,
               COUNT(*) FILTER (WHERE is_reverted = FALSE) as active,
               COUNT(*) FILTER (WHERE is_reverted = TRUE) as reverted
        FROM deliveries
        WHERE innings_id = '${INNINGS_ID}';
      `);
      const counts = countRes.rows[0];
      if (parseInt(counts.total) !== 6 || parseInt(counts.active) !== 5 || parseInt(counts.reverted) !== 1) {
        throw new Error(`Audit counts mismatch: ${JSON.stringify(counts)}`);
      }
    });

    console.log('\n========================================================');
    console.log(`🏆 ALL ${passedTests} OF ${totalTests} INTEGRITY TESTS PASSED SUCCESSFULLY!`);
    console.log('========================================================\n');
    return { passedTests, totalTests };
  } catch (error) {
    console.error('\n❌ TEST RUNNER ABORTED ON ERROR:', error);
    process.exit(1);
  }
}

export { runTests as runIntegrityTests };

if (process.argv[1]?.endsWith('run-integrity-tests.js')) {
  runTests();
}
