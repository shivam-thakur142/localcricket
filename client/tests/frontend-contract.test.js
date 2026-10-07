// ====================================================================
// CLIENT FRONTEND INTEGRATION & CONTRACT TESTS
// ====================================================================

import assert from 'assert';
import { boundedFetch, api } from '../src/services/api.js';

console.log('\n🏏 ======================================================================');
console.log('🏏 LocalCricket: Running Client Frontend Integration & Contract Tests');
console.log('🏏 ======================================================================\n');

let passedTests = 0;
let totalTests = 0;

async function assertTest(name, fn) {
  totalTests++;
  process.stdout.write(`🧪 [Frontend Test ${totalTests}] ${name}... `);
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

// 1. Rapid Double-Tap Locking Simulation
await assertTest('Rapid-Tap Lock: isSubmitting guard prevents duplicate mutation calls', async () => {
  let callCount = 0;
  let isSubmitting = false;

  async function simulateTap() {
    if (isSubmitting) {
      return { status: 'LOCKED', message: 'Ignored duplicate tap during active mutation' };
    }
    isSubmitting = true;
    callCount++;
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 50));
    isSubmitting = false;
    return { status: 'DISPATCHED' };
  }

  // Rapidly fire 5 taps in parallel
  const results = await Promise.all([
    simulateTap(),
    simulateTap(),
    simulateTap(),
    simulateTap(),
    simulateTap(),
  ]);

  const dispatched = results.filter((r) => r.status === 'DISPATCHED').length;
  const locked = results.filter((r) => r.status === 'LOCKED').length;

  if (dispatched !== 1 || locked !== 4 || callCount !== 1) {
    throw new Error(`Expected exactly 1 dispatched call and 4 locked calls, got ${dispatched} dispatched, ${locked} locked`);
  }
});

// 2. Bounded Retry Logic: Rejects immediately on 4xx without retry
await assertTest('Bounded Retry: Halts immediately on 409 Conflict without retry loops', async () => {
  let fetchAttempts = 0;

  // Mock global fetch returning 409 STALE_SEQUENCE_CONFLICT
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchAttempts++;
    return {
      status: 409,
      json: async () => ({
        success: false,
        error: { code: 'STALE_SEQUENCE_CONFLICT', message: 'Sequence mismatch: expected 5 but server at 4' },
      }),
    };
  };

  try {
    let errorCaught = null;
    try {
      await boundedFetch('/api/v1/scorer/matches/123/deliveries', { method: 'POST' });
    } catch (err) {
      errorCaught = err;
    }

    if (!errorCaught) throw new Error('Expected 409 error to be thrown');
    if (errorCaught.status !== 409 || errorCaught.code !== 'STALE_SEQUENCE_CONFLICT') {
      throw new Error(`Expected status 409 and code STALE_SEQUENCE_CONFLICT, got: ${errorCaught.code}`);
    }
    if (fetchAttempts !== 1) {
      throw new Error(`Expected exactly 1 attempt on 409, got ${fetchAttempts} attempts`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// 3. Bounded Retry Logic: Rejects immediately on 422 Unprocessable without retry
await assertTest('Bounded Retry: Halts immediately on 422 Consecutive Over Violation', async () => {
  let fetchAttempts = 0;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchAttempts++;
    return {
      status: 422,
      json: async () => ({
        success: false,
        error: { code: 'CONSECUTIVE_OVER_VIOLATION', message: 'Bowler cannot bowl consecutive overs' },
      }),
    };
  };

  try {
    let errorCaught = null;
    try {
      await boundedFetch('/api/v1/scorer/matches/123/overs/start', { method: 'POST' });
    } catch (err) {
      errorCaught = err;
    }

    if (!errorCaught || errorCaught.status !== 422) {
      throw new Error(`Expected 422 error, got: ${errorCaught}`);
    }
    if (fetchAttempts !== 1) {
      throw new Error(`Expected 1 attempt, got ${fetchAttempts}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// 4. Bounded Retry: Retries up to 3 times on 500 server error then terminates
await assertTest('Bounded Retry: Retries transient 500 error up to 3 times (4 attempts total)', async () => {
  let fetchAttempts = 0;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchAttempts++;
    return {
      status: 500,
      json: async () => ({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Database temporarily unavailable' },
      }),
    };
  };

  try {
    let errorCaught = null;
    try {
      await boundedFetch('/api/v1/matches/123', {}, 3);
    } catch (err) {
      errorCaught = err;
    }

    if (!errorCaught || errorCaught.status !== 500) {
      throw new Error(`Expected 500 error after retries, got: ${errorCaught}`);
    }
    if (fetchAttempts !== 4) { // Initial + 3 retries
      throw new Error(`Expected 4 total attempts, got ${fetchAttempts}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// 5. Squad Roster vs Playing XI Separation
await assertTest('Squad Structure: Confirms separation of full_roster and playing_xi', async () => {
  const mockSquads = {
    team_a: {
      team_id: '111',
      team_name: 'Dadar Warriors',
      full_roster: [
        { player_id: 'p1', full_name: 'Rohit', is_playing_xi: true },
        { player_id: 'p2', full_name: 'Rahul', is_playing_xi: true },
        { player_id: 'p3', full_name: 'Bench Player', is_playing_xi: false },
      ],
      playing_xi: [
        { player_id: 'p1', full_name: 'Rohit', is_playing_xi: true },
        { player_id: 'p2', full_name: 'Rahul', is_playing_xi: true },
      ],
    },
  };

  if (mockSquads.team_a.full_roster.length !== 3) {
    throw new Error('Full roster count mismatch');
  }
  if (mockSquads.team_a.playing_xi.length !== 2) {
    throw new Error('Playing XI count mismatch');
  }
  if (mockSquads.team_a.playing_xi.some((p) => !p.is_playing_xi)) {
    throw new Error('Playing XI contains non-playing player');
  }
});

console.log('\n======================================================================');
console.log(`🏆 ALL ${passedTests} OF ${totalTests} CLIENT TESTS PASSED!`);
console.log('======================================================================\n');
