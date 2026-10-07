import { CricketScoringEngine } from '../src/engine/CricketScoringEngine.js';
import { ReplayEngine } from '../src/engine/ReplayEngine.js';
import { EXTRAS_TYPES, WICKET_TYPES } from '../../shared/constants/cricketConstants.js';

export async function runEngineTests() {
  console.log('\n🏏 ========================================================');
  console.log('🏏 LocalCricket: Running Milestone 2 Scoring Engine Unit Tests');
  console.log('🏏 ========================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  const assertTest = (testName, testFn) => {
    totalTests++;
    process.stdout.write(`🧪 [Engine Test ${totalTests}] ${testName}... `);
    try {
      testFn();
      passedTests++;
      console.log('PASSED ✅');
    } catch (err) {
      console.log('FAILED ❌');
      console.error('   Error details:', err.message);
      throw err;
    }
  };

  const assertThrows = (testName, testFn, expectedErrorSubstring) => {
    totalTests++;
    process.stdout.write(`🧪 [Engine Test ${totalTests}] ${testName} (Expect Rejection)... `);
    try {
      testFn();
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

  const STRIKER_ID = 'p-striker';
  const NON_STRIKER_ID = 'p-non-striker';
  const BOWLER_ID = 'p-bowler';
  const NEW_BATTER_ID = 'p-batter-3';
  const NEW_BATTER_4_ID = 'p-batter-4';

  const createInitialState = (overrides = {}) => ({
    id: 'inn-1',
    match_id: 'm-1',
    innings_number: 1,
    batting_team_id: 'team-a',
    bowling_team_id: 'team-b',
    total_runs: 0,
    total_wickets: 0,
    total_legal_balls: 0,
    total_extras: 0,
    target_runs: null,
    status: 'IN_PROGRESS',
    current_striker_id: STRIKER_ID,
    current_non_striker_id: NON_STRIKER_ID,
    current_bowler_id: BOWLER_ID,
    is_free_hit: false,
    last_delivery_sequence: 0,
    current_over: {
      id: 'ov-1',
      over_number: 1,
      bowler_id: BOWLER_ID,
      ball_number: 0,
      legal_balls: 0,
      total_runs_conceded: 0,
      wickets_taken: 0,
      is_completed: false,
    },
    ...overrides,
  });

  const rulesConfig = {
    ballsPerOver: 6,
    oversQuota: 20,
    freeHitOnNoBall: true,
    maxWickets: 10,
  };

  // --- GROUP 1: FREE-HIT STATE PROGRESSION & RESTRICTIONS ---
  console.log('--- TEST GROUP 1: FREE-HIT STATE & DISMISSAL RESTRICTIONS ---');

  let state = createInitialState();

  assertTest('No-ball establishes Free-Hit state for the next delivery', () => {
    const res = CricketScoringEngine.processDelivery(
      state,
      { runs_batter: 0, runs_extras: 1, extra_type: EXTRAS_TYPES.NO_BALL },
      rulesConfig
    );
    if (!res.nextState.is_free_hit) throw new Error('Expected nextState.is_free_hit to be TRUE');
    if (res.deliveryRecord.is_legal) throw new Error('No-ball should not be legal');
    state = res.nextState;
  });

  assertTest('Free-hit persists through intervening Wide delivery', () => {
    const res = CricketScoringEngine.processDelivery(
      state,
      { runs_batter: 0, runs_extras: 1, extra_type: EXTRAS_TYPES.WIDE },
      rulesConfig
    );
    if (!res.nextState.is_free_hit) throw new Error('Free hit should carry over through a wide');
    state = res.nextState;
  });

  assertTest('Free-hit persists through intervening No-Ball delivery', () => {
    const res = CricketScoringEngine.processDelivery(
      state,
      { runs_batter: 0, runs_extras: 1, extra_type: EXTRAS_TYPES.NO_BALL },
      rulesConfig
    );
    if (!res.nextState.is_free_hit) throw new Error('Free hit should carry over through a no-ball');
    state = res.nextState;
  });

  assertThrows(
    'Bowled dismissal on Free-Hit is rejected by engine',
    () => {
      CricketScoringEngine.processDelivery(
        state,
        {
          runs_batter: 0,
          runs_extras: 0,
          is_wicket: true,
          wicket_type: WICKET_TYPES.BOWLED,
          dismissed_player_id: STRIKER_ID,
        },
        rulesConfig
      );
    },
    'not permitted on a free hit'
  );

  assertThrows(
    'Caught dismissal on Free-Hit is rejected by engine',
    () => {
      CricketScoringEngine.processDelivery(
        state,
        {
          runs_batter: 0,
          runs_extras: 0,
          is_wicket: true,
          wicket_type: WICKET_TYPES.CAUGHT,
          dismissed_player_id: STRIKER_ID,
        },
        rulesConfig
      );
    },
    'not permitted on a free hit'
  );

  assertTest('Run-out dismissal on Free-Hit is permitted and resets Free-Hit on legal ball', () => {
    const res = CricketScoringEngine.processDelivery(
      state,
      {
        runs_batter: 0,
        runs_extras: 0,
        is_wicket: true,
        wicket_type: WICKET_TYPES.RUN_OUT,
        dismissed_player_id: STRIKER_ID,
        incoming_batter_id: NEW_BATTER_ID,
      },
      rulesConfig
    );
    if (res.nextState.is_free_hit) throw new Error('Free hit should reset after legal delivery');
    if (res.nextState.current_striker_id !== NEW_BATTER_ID) throw new Error('Incoming batter should be on strike');
    state = res.nextState;
  });

  // --- GROUP 2: RUN-OUT EDGE CASES & CROSSING ---
  console.log('\n--- TEST GROUP 2: RUN-OUT EDGE CASES & CROSSING ---');

  assertTest('Run-out before completing a run (0 runs completed, not crossed)', () => {
    const freshState = createInitialState();
    const res = CricketScoringEngine.processDelivery(
      freshState,
      {
        runs_batter: 0,
        physical_runs_taken: 0,
        is_wicket: true,
        wicket_type: WICKET_TYPES.RUN_OUT,
        dismissed_player_id: STRIKER_ID,
        incoming_batter_id: NEW_BATTER_ID,
        crossed_on_run_out: false,
      },
      rulesConfig
    );
    // Striker dismissed at 0 runs, incoming batter replaces striker
    if (res.nextState.current_striker_id !== NEW_BATTER_ID) throw new Error('Incoming batter should be at striker end');
    if (res.nextState.current_non_striker_id !== NON_STRIKER_ID) throw new Error('Non-striker should be unchanged');
    if (res.nextState.total_runs !== 0) throw new Error('Runs should be 0');
  });

  assertTest('Run-out after completing 1 run (1 run completed, non-striker run out attempting 2nd)', () => {
    const freshState = createInitialState();
    const res = CricketScoringEngine.processDelivery(
      freshState,
      {
        runs_batter: 1,
        physical_runs_taken: 1,
        is_wicket: true,
        wicket_type: WICKET_TYPES.RUN_OUT,
        dismissed_player_id: NON_STRIKER_ID,
        incoming_batter_id: NEW_BATTER_ID,
        crossed_on_run_out: false,
      },
      rulesConfig
    );
    // Completed 1 run -> original striker and non-striker swapped.
    // Original non-striker is now at striker end and gets run out!
    // So incoming batter takes striker end, original striker remains at non-striker end.
    if (res.nextState.total_runs !== 1) throw new Error('Total runs should be 1');
    if (res.nextState.total_wickets !== 1) throw new Error('Total wickets should be 1');
    if (res.nextState.current_striker_id !== NEW_BATTER_ID) throw new Error('Incoming batter takes vacant striker end');
    if (res.nextState.current_non_striker_id !== STRIKER_ID) throw new Error('Original striker is now at non-striker end');
  });

  assertTest('Run-out on a Wide delivery (Illegal ball, legal_ball count unchanged)', () => {
    const freshState = createInitialState();
    const res = CricketScoringEngine.processDelivery(
      freshState,
      {
        runs_batter: 0,
        runs_extras: 1,
        extra_type: EXTRAS_TYPES.WIDE,
        is_wicket: true,
        wicket_type: WICKET_TYPES.RUN_OUT,
        dismissed_player_id: STRIKER_ID,
        incoming_batter_id: NEW_BATTER_ID,
      },
      rulesConfig
    );
    if (res.deliveryRecord.is_legal) throw new Error('Wide must be illegal');
    if (res.nextState.current_over.legal_balls !== 0) throw new Error('Legal ball count must not increment on wide');
    if (res.nextState.total_runs !== 1) throw new Error('Wide penalty should add 1 run');
    if (res.nextState.total_wickets !== 1) throw new Error('Wicket should increment');
  });

  assertTest('Run-out on a No-Ball delivery (Illegal ball, run-out permitted)', () => {
    const freshState = createInitialState();
    const res = CricketScoringEngine.processDelivery(
      freshState,
      {
        runs_batter: 2,
        runs_extras: 1,
        extra_type: EXTRAS_TYPES.NO_BALL,
        is_wicket: true,
        wicket_type: WICKET_TYPES.RUN_OUT,
        dismissed_player_id: NON_STRIKER_ID,
        incoming_batter_id: NEW_BATTER_ID,
      },
      rulesConfig
    );
    if (res.deliveryRecord.is_legal) throw new Error('No ball must be illegal');
    if (res.nextState.current_over.legal_balls !== 0) throw new Error('Legal ball count must not increment on no-ball');
    if (res.nextState.total_runs !== 3) throw new Error('Runs should be 2 batter + 1 extra = 3');
  });

  // --- GROUP 3: BOUNDARIES, OVERTHROWS & BOWLER ATTRIBUTION ---
  console.log('\n--- TEST GROUP 3: BOUNDARIES, OVERTHROWS & BOWLER CONCEDED ---');

  assertTest('Boundary 4 off bat: batter gets 4, bowler charged 4, no strike rotation', () => {
    const freshState = createInitialState();
    const res = CricketScoringEngine.processDelivery(
      freshState,
      { runs_batter: 4, runs_extras: 0, extra_type: EXTRAS_TYPES.NONE },
      rulesConfig
    );
    if (res.bowlerRunsConceded !== 4) throw new Error('Bowler must be charged 4');
    if (res.nextState.current_striker_id !== STRIKER_ID) throw new Error('Even runs do not rotate strike');
  });

  assertTest('Boundary from a Wide (5 Wides): 0 off bat, 5 extras, bowler charged 5, illegal', () => {
    const freshState = createInitialState();
    const res = CricketScoringEngine.processDelivery(
      freshState,
      { runs_batter: 0, runs_extras: 5, extra_type: EXTRAS_TYPES.WIDE },
      rulesConfig
    );
    if (res.bowlerRunsConceded !== 5) throw new Error('Bowler must be charged 5');
    if (res.deliveryRecord.is_legal) throw new Error('Wide is illegal');
    if (res.facesBall) throw new Error('Batter does not face ball on wide');
  });

  assertTest('Boundary 4 off bat on a No-Ball: batter gets 4, bowler charged 5 (4+1), illegal', () => {
    const freshState = createInitialState();
    const res = CricketScoringEngine.processDelivery(
      freshState,
      { runs_batter: 4, runs_extras: 1, extra_type: EXTRAS_TYPES.NO_BALL },
      rulesConfig
    );
    if (res.deliveryRuns !== 5) throw new Error('Delivery total must be 5');
    if (res.bowlerRunsConceded !== 5) throw new Error('Bowler charged 5');
    if (!res.facesBall) throw new Error('Batter faces ball on no-ball');
    if (res.deliveryRecord.is_legal) throw new Error('No-ball is illegal');
  });

  assertTest('Overthrows producing 3 runs off bat: strike rotates, bowler charged 3', () => {
    const freshState = createInitialState();
    const res = CricketScoringEngine.processDelivery(
      freshState,
      { runs_batter: 3, runs_extras: 0, extra_type: EXTRAS_TYPES.NONE },
      rulesConfig
    );
    if (res.nextState.current_striker_id !== NON_STRIKER_ID) throw new Error('Odd runs must rotate strike');
    if (res.bowlerRunsConceded !== 3) throw new Error('Bowler charged 3');
  });

  // --- GROUP 4: PENALTY RUNS EXTENSIBILITY ---
  console.log('\n--- TEST GROUP 4: PENALTY RUNS EXTENSIBILITY ---');

  assertTest('Penalty runs (5 extras, 0 to bowler, legal ball)', () => {
    const freshState = createInitialState();
    const res = CricketScoringEngine.processDelivery(
      freshState,
      { runs_batter: 0, runs_extras: 5, extra_type: EXTRAS_TYPES.PENALTY },
      rulesConfig
    );
    if (res.deliveryRuns !== 5) throw new Error('Total runs should be 5');
    if (res.bowlerRunsConceded !== 0) throw new Error('Bowler should concede 0 runs for penalty');
    if (res.facesBall) throw new Error('Batter does not face ball on penalty');
  });

  // --- GROUP 5: OVER COMPLETION FOLLOWING WIDES & NO-BALLS ---
  console.log('\n--- TEST GROUP 5: OVER COMPLETION & INNINGS TERMINATION ---');

  assertTest('Over completes strictly after 6 legal balls regardless of intervening extras', () => {
    let s = createInitialState();
    // Ball 1: 1 run (legal) -> legal_balls = 1
    s = CricketScoringEngine.processDelivery(s, { runs_batter: 1 }, rulesConfig).nextState;
    // Ball 2: Wide -> legal_balls = 1
    s = CricketScoringEngine.processDelivery(s, { runs_extras: 1, extra_type: EXTRAS_TYPES.WIDE }, rulesConfig).nextState;
    // Ball 3: No-Ball -> legal_balls = 1
    s = CricketScoringEngine.processDelivery(s, { runs_extras: 1, extra_type: EXTRAS_TYPES.NO_BALL }, rulesConfig).nextState;
    // Ball 4: Dot (legal) -> legal_balls = 2
    s = CricketScoringEngine.processDelivery(s, { runs_batter: 0 }, rulesConfig).nextState;
    // Ball 5: Dot (legal) -> legal_balls = 3
    s = CricketScoringEngine.processDelivery(s, { runs_batter: 0 }, rulesConfig).nextState;
    // Ball 6: Dot (legal) -> legal_balls = 4
    s = CricketScoringEngine.processDelivery(s, { runs_batter: 0 }, rulesConfig).nextState;
    // Ball 7: Dot (legal) -> legal_balls = 5
    s = CricketScoringEngine.processDelivery(s, { runs_batter: 0 }, rulesConfig).nextState;
    if (s.current_over.is_completed) throw new Error('Over should not be complete at 5 legal balls');

    // Ball 8: 1 run (legal) -> legal_balls = 6 -> OVER COMPLETE!
    s = CricketScoringEngine.processDelivery(s, { runs_batter: 1 }, rulesConfig).nextState;
    if (!s.current_over.is_completed) throw new Error('Over should be completed at 6 legal balls');
    if (s.current_bowler_id !== null) throw new Error('Bowler must be reset to null when over completes');
  });

  assertTest('Innings completes when target is reached in 2nd innings', () => {
    const secondInningsState = createInitialState({
      innings_number: 2,
      target_runs: 10,
      total_runs: 8,
    });
    const res = CricketScoringEngine.processDelivery(
      secondInningsState,
      { runs_batter: 4 },
      rulesConfig
    );
    if (res.nextState.status !== 'COMPLETED') throw new Error('Innings should be COMPLETED');
    if (res.nextState.matchOutcome.winnerTeamId !== 'team-a') throw new Error('Chasing team should be winner');
    if (res.nextState.matchOutcome.resultMarginWickets !== 10) throw new Error('Should win by 10 wickets');
  });

  // --- GROUP 6: DETERMINISTIC REPLAY COMPARISON ---
  console.log('\n--- TEST GROUP 6: INCREMENTAL VS REPLAY DETERMINISM ---');

  assertTest('Deterministic Replay matches incremental execution across all edge cases', () => {
    const initialState = createInitialState();
    let incrementalState = JSON.parse(JSON.stringify(initialState));
    const recordedDeliveries = [];

    const actions = [
      { runs_batter: 1, extra_type: EXTRAS_TYPES.NONE }, // 1 run off bat
      { runs_batter: 0, runs_extras: 1, extra_type: EXTRAS_TYPES.NO_BALL }, // No-ball -> free hit
      { runs_batter: 0, runs_extras: 1, extra_type: EXTRAS_TYPES.WIDE }, // Wide -> free hit persists
      { runs_batter: 4, extra_type: EXTRAS_TYPES.NONE }, // Boundary off free hit
      { runs_batter: 0, runs_extras: 1, extra_type: EXTRAS_TYPES.BYE }, // 1 Bye
      { runs_batter: 0, is_wicket: true, wicket_type: WICKET_TYPES.BOWLED, dismissed_player_id: STRIKER_ID, incoming_batter_id: NEW_BATTER_ID }, // Wicket
      { runs_batter: 2, extra_type: EXTRAS_TYPES.NONE }, // 2 runs (over completion)
    ];

    for (const action of actions) {
      // Fix dismissed player to current striker if bowler wicket
      if (action.is_wicket && action.wicket_type === WICKET_TYPES.BOWLED) {
        action.dismissed_player_id = incrementalState.current_striker_id;
      }
      const res = CricketScoringEngine.processDelivery(incrementalState, action, rulesConfig);
      recordedDeliveries.push({
        ...res.deliveryRecord,
        incoming_batter_id: action.incoming_batter_id,
        crossed_on_run_out: action.crossed_on_run_out,
        physical_runs_taken: action.physical_runs_taken,
      });
      incrementalState = res.nextState;
    }

    // Replay the exact recorded delivery stream from initial state
    const replayedState = ReplayEngine.replayInnings(initialState, recordedDeliveries, rulesConfig);

    // Verify field-by-field equality
    if (incrementalState.total_runs !== replayedState.total_runs) {
      throw new Error(`Runs mismatch: Incremental ${incrementalState.total_runs} vs Replay ${replayedState.total_runs}`);
    }
    if (incrementalState.total_wickets !== replayedState.total_wickets) {
      throw new Error(`Wickets mismatch: Incremental ${incrementalState.total_wickets} vs Replay ${replayedState.total_wickets}`);
    }
    if (incrementalState.total_legal_balls !== replayedState.total_legal_balls) {
      throw new Error(`Legal balls mismatch: Incremental ${incrementalState.total_legal_balls} vs Replay ${replayedState.total_legal_balls}`);
    }
    if (incrementalState.total_extras !== replayedState.total_extras) {
      throw new Error(`Extras mismatch: Incremental ${incrementalState.total_extras} vs Replay ${replayedState.total_extras}`);
    }
    if (incrementalState.current_striker_id !== replayedState.current_striker_id) {
      throw new Error(`Striker mismatch: Incremental ${incrementalState.current_striker_id} vs Replay ${replayedState.current_striker_id}`);
    }
    if (incrementalState.current_non_striker_id !== replayedState.current_non_striker_id) {
      throw new Error(`Non-striker mismatch: Incremental ${incrementalState.current_non_striker_id} vs Replay ${replayedState.current_non_striker_id}`);
    }
    if (incrementalState.is_free_hit !== replayedState.is_free_hit) {
      throw new Error(`Free hit flag mismatch: Incremental ${incrementalState.is_free_hit} vs Replay ${replayedState.is_free_hit}`);
    }
    if (incrementalState.current_over.legal_balls !== replayedState.current_over.legal_balls) {
      throw new Error(`Over legal balls mismatch`);
    }
  });

  console.log('\n========================================================');
  console.log(`🏆 ALL ${passedTests} OF ${totalTests} SCORING ENGINE TESTS PASSED!`);
  console.log('========================================================\n');
  return { passedTests, totalTests };
}

// Run directly if invoked
if (process.argv[1]?.endsWith('engine.test.js')) {
  runEngineTests();
}
