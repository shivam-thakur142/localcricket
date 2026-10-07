// ====================================================================
// NRR ENGINE & PLAYING CONDITIONS UNIT TESTS
// ====================================================================

import assert from 'assert';
import { calculateMatchNRR, formatBallsToOversStr } from '../src/services/pointsTableService.js';

export function runNrrEngineTests() {
  console.log('\n🏏 ======================================================================');
  console.log('🏏 LocalCricket: Running NRR Engine & Playing Conditions Unit Tests');
  console.log('🏏 ======================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assertTest(name, fn) {
    totalTests++;
    process.stdout.write(`🧪 [NRR Engine Test ${totalTests}] ${name}... `);
    try {
      fn();
      console.log('PASSED ✅');
      passedTests++;
    } catch (err) {
      console.log('FAILED ❌');
      console.error('   Error details:', err.message);
      throw err;
    }
  }

  // 1. Mandatory Regression Test: Tied Match with All-Out Invariant
  assertTest('Mandatory Regression Test: 20-ov tied match with Team A all out in 19.1 and Team B 160/6 in 20.0', () => {
    const result = calculateMatchNRR({
      oversQuota: 20,
      innings1: {
        teamId: 'team-a',
        runs: 160,
        legalBalls: 115, // 19.1 overs
        isAllOut: true,
      },
      innings2: {
        teamId: 'team-b',
        runs: 160,
        legalBalls: 120, // 20.0 overs
        isAllOut: false,
      },
    });

    const teamA = result['team-a'];
    const teamB = result['team-b'];

    // --- Team A Assertions ---
    assert.strictEqual(teamA.actualBallsFaced, 115, 'Team A actualBallsFaced must be 115');
    assert.strictEqual(teamA.effectiveBallsFaced, 120, 'Team A effectiveBallsFaced must be 120 (all-out rule)');
    assert.strictEqual(teamA.actualBallsBowled, 120, 'Team A actualBallsBowled must be 120');
    assert.strictEqual(teamA.effectiveBallsBowled, 120, 'Team A effectiveBallsBowled must be 120');
    assert.strictEqual(Math.round(teamA.battingRunRate), 8, 'Team A battingRunRate must be 8');
    assert.strictEqual(Math.round(teamA.bowlingConcededRate), 8, 'Team A bowlingConcededRate must be 8');
    assert.strictEqual(teamA.netRunRate, 0, 'Team A netRunRate must be 0.000');

    // --- Team B Assertions ---
    assert.strictEqual(teamB.actualBallsFaced, 120, 'Team B actualBallsFaced must be 120');
    assert.strictEqual(teamB.effectiveBallsFaced, 120, 'Team B effectiveBallsFaced must be 120');
    assert.strictEqual(teamB.actualBallsBowled, 115, 'Team B actualBallsBowled must be 115');
    assert.strictEqual(teamB.effectiveBallsBowled, 120, 'Team B effectiveBallsBowled must be 120 (opponent all-out rule)');
    assert.strictEqual(Math.round(teamB.battingRunRate), 8, 'Team B battingRunRate must be 8');
    assert.strictEqual(Math.round(teamB.bowlingConcededRate), 8, 'Team B bowlingConcededRate must be 8');
    assert.strictEqual(teamB.netRunRate, 0, 'Team B netRunRate must be 0.000');
  });

  // 2. Standard Match with Normal Inning Completion
  assertTest('Standard match: Team A 180/4 in 20.0, Team B 150/8 in 20.0', () => {
    const result = calculateMatchNRR({
      oversQuota: 20,
      innings1: {
        teamId: 'team-a',
        runs: 180,
        legalBalls: 120,
        isAllOut: false,
      },
      innings2: {
        teamId: 'team-b',
        runs: 150,
        legalBalls: 120,
        isAllOut: false,
      },
    });

    const teamA = result['team-a'];
    const teamB = result['team-b'];

    assert.strictEqual(teamA.battingRunRate, 9.0);
    assert.strictEqual(teamA.bowlingConcededRate, 7.5);
    assert.strictEqual(teamA.netRunRate, 1.5);

    assert.strictEqual(teamB.battingRunRate, 7.5);
    assert.strictEqual(teamB.bowlingConcededRate, 9.0);
    assert.strictEqual(teamB.netRunRate, -1.5);
  });

  // 3. Successful Chase in Reduced Balls (Not All-Out)
  assertTest('Successful chase: Team B chases 120 in 12.3 overs (75 balls)', () => {
    const result = calculateMatchNRR({
      oversQuota: 20,
      innings1: {
        teamId: 'team-a',
        runs: 120,
        legalBalls: 120,
        isAllOut: false,
      },
      innings2: {
        teamId: 'team-b',
        runs: 121,
        legalBalls: 75, // 12.3 overs
        isAllOut: false,
      },
    });

    const teamB = result['team-b'];
    assert.strictEqual(teamB.actualBallsFaced, 75);
    assert.strictEqual(teamB.effectiveBallsFaced, 75); // Not all-out, so actual balls used
    assert.strictEqual(teamB.effectiveBallsBowled, 120);
    assert.ok(teamB.battingRunRate > 9.6);
    assert.ok(teamB.netRunRate > 3.6);
  });

  // 4. Formatting Balls to Overs String
  assertTest('Integer legal balls to display overs conversion', () => {
    assert.strictEqual(formatBallsToOversStr(115), '19.1');
    assert.strictEqual(formatBallsToOversStr(120), '20.0');
    assert.strictEqual(formatBallsToOversStr(86), '14.2');
    assert.strictEqual(formatBallsToOversStr(0), '0.0');
    assert.strictEqual(formatBallsToOversStr(5), '0.5');
  });

  console.log('\n======================================================================');
  console.log(`🏆 ALL ${passedTests} OF ${totalTests} NRR ENGINE UNIT TESTS PASSED!`);
  console.log('======================================================================\n');
  return { passedTests, totalTests };
}

// Run directly if invoked
if (process.argv[1]?.endsWith('nrr-engine.test.js')) {
  runNrrEngineTests();
}
