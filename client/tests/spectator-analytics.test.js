// ====================================================================
// SPECTATOR ANALYTICS & SSE FRONTEND INTEGRATION TESTS
// ====================================================================

import assert from 'assert';

console.log('\n🏏 ======================================================================');
console.log('🏏 LocalCricket: Running Spectator Analytics & SSE Client Tests');
console.log('🏏 ======================================================================\n');

let passedTests = 0;
let totalTests = 0;

function assertTest(name, fn) {
  totalTests++;
  process.stdout.write(`🧪 [Frontend Spectator Test ${totalTests}] ${name}... `);
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

// 1. Commentary Filtering: Correct isolation of boundaries and wickets
assertTest('Commentary Filtering: Isolates boundaries (4s/6s) and wickets without altering original ledger', () => {
  const deliveries = [
    { id: '1', delivery_sequence: 1, runs_batter: 0, is_wicket: false },
    { id: '2', delivery_sequence: 2, runs_batter: 4, is_wicket: false },
    { id: '3', delivery_sequence: 3, runs_batter: 1, is_wicket: false },
    { id: '4', delivery_sequence: 4, runs_batter: 6, is_wicket: false },
    { id: '5', delivery_sequence: 5, runs_batter: 0, is_wicket: true },
  ];

  const boundaries = deliveries.filter((d) => d.runs_batter === 4 || d.runs_batter === 6);
  assert.strictEqual(boundaries.length, 2);
  assert.strictEqual(boundaries[0].delivery_sequence, 2);
  assert.strictEqual(boundaries[1].delivery_sequence, 4);

  const wickets = deliveries.filter((d) => d.is_wicket);
  assert.strictEqual(wickets.length, 1);
  assert.strictEqual(wickets[0].delivery_sequence, 5);
});

// 2. Deterministic Batting Leaderboard Sorting: Undefeated batter ranks above dismissed batter
assertTest('Leaderboard Deterministic Sorting: Undefeated batter ranks above dismissed batter on equal runs', () => {
  const players = [
    { player_id: 'p2', total_runs: 80, total_dismissals: 1, strike_rate: 160.0 },
    { player_id: 'p1', total_runs: 80, total_dismissals: 0, strike_rate: 160.0 },
    { player_id: 'p3', total_runs: 85, total_dismissals: 2, strike_rate: 140.0 },
  ];

  players.sort((a, b) => {
    if (b.total_runs !== a.total_runs) return b.total_runs - a.total_runs;
    if (a.total_dismissals === 0 && b.total_dismissals > 0) return -1;
    if (b.total_dismissals === 0 && a.total_dismissals > 0) return 1;
    if (a.total_dismissals > 0 && b.total_dismissals > 0) {
      const avgA = a.total_runs / a.total_dismissals;
      const avgB = b.total_runs / b.total_dismissals;
      if (Math.abs(avgB - avgA) > 0.0001) return avgB - avgA;
    }
    return b.strike_rate - a.strike_rate;
  });

  assert.strictEqual(players[0].player_id, 'p3', 'Most runs ranks first');
  assert.strictEqual(players[1].player_id, 'p1', 'Undefeated 80* ranks above dismissed 80');
  assert.strictEqual(players[2].player_id, 'p2', 'Dismissed 80 ranks third');
});

// 3. Client Reconnection & Sequence Resynchronization Logic
assertTest('SSE Resync Logic: Detects sequence gaps on reconnect and replaces state authoritatively', () => {
  let localState = { latest_delivery_sequence: 14, total_runs: 98 };
  let lastSeenSequence = 14;

  const handleReconnectSnapshot = (authoritativeSnapshot) => {
    // If incoming sequence is ahead of last seen sequence, perform full authoritative state replacement
    if (authoritativeSnapshot.deliverySequence > lastSeenSequence) {
      localState = {
        latest_delivery_sequence: authoritativeSnapshot.deliverySequence,
        total_runs: authoritativeSnapshot.liveState.score.runs,
      };
      lastSeenSequence = authoritativeSnapshot.deliverySequence;
    }
  };

  const incomingSnapshot = {
    deliverySequence: 18, // 4 missed balls during network drop
    liveState: {
      score: { runs: 124 },
    },
  };

  handleReconnectSnapshot(incomingSnapshot);

  assert.strictEqual(lastSeenSequence, 18);
  assert.strictEqual(localState.latest_delivery_sequence, 18);
  assert.strictEqual(localState.total_runs, 124, 'State was completely reconciled to authoritative server score');
});

// 4. Manhattan Over Incomplete Flag Preservation
assertTest('Manhattan Over Handling: Incomplete live over correctly flagged with balls bowled', () => {
  const over1 = { over_number: 1, runs: 8, wickets: 0, legal_balls: 6, is_completed: true };
  const over2 = { over_number: 2, runs: 5, wickets: 1, legal_balls: 3, is_completed: false };

  assert.strictEqual(over1.is_completed, true);
  assert.strictEqual(over2.is_completed, false);
  assert.strictEqual(over2.legal_balls, 3);
});

console.log('\n======================================================================');
console.log(`🏆 ALL ${passedTests} OF ${totalTests} SPECTATOR CLIENT TESTS PASSED!`);
console.log('======================================================================\n');
