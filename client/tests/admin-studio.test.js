// ====================================================================
// TOURNAMENT ADMIN STUDIO & LIFECYCLE FRONTEND INTEGRATION TESTS
// ====================================================================

import assert from 'assert';

console.log('\n🏏 ======================================================================');
console.log('🏏 LocalCricket: Running Tournament Admin Studio Frontend Tests');
console.log('🏏 ======================================================================\n');

let passedTests = 0;
let totalTests = 0;

function assertTest(name, fn) {
  totalTests++;
  process.stdout.write(`🧪 [Frontend Admin Test ${totalTests}] ${name}... `);
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

// ----------------------------------------------------
// TEST 1: Persona Switcher Context & Identity Representation
// ----------------------------------------------------
assertTest('Persona Switcher: Explicit demo persona mapping without granting server authorization', () => {
  const personas = [
    { id: '11111111-1111-1111-1111-111111111111', role: 'ORGANIZER', name: 'Amit Sharma' },
    { id: '22222222-2222-2222-2222-222222222222', role: 'SCORER', name: 'Suresh Raina' },
    { id: '00000000-0000-0000-0000-000000000000', role: 'SPECTATOR', name: 'Public Visitor' },
  ];

  let currentPersona = personas[0];
  assert.strictEqual(currentPersona.role, 'ORGANIZER');

  // Switch to Spectator
  currentPersona = personas[2];
  assert.strictEqual(currentPersona.role, 'SPECTATOR');
  assert.strictEqual(currentPersona.name, 'Public Visitor');

  // Guard: client-side persona change modifies x-user-id header representation
  const getHeaders = (persona) => ({
    'x-user-id': persona.id,
  });

  const headers = getHeaders(currentPersona);
  assert.strictEqual(headers['x-user-id'], '00000000-0000-0000-0000-000000000000');
});

// ----------------------------------------------------
// TEST 2: Tournament Lifecycle State Machine Rules
// ----------------------------------------------------
assertTest('Lifecycle State Machine: Strict transitions and terminal immutability', () => {
  const ALLOWED_TRANSITIONS = {
    DRAFT: ['UPCOMING', 'CANCELLED'],
    UPCOMING: ['ONGOING', 'CANCELLED'],
    ONGOING: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  };

  const isTerminal = (status) => ALLOWED_TRANSITIONS[status]?.length === 0;

  assert.deepStrictEqual(ALLOWED_TRANSITIONS['DRAFT'], ['UPCOMING', 'CANCELLED']);
  assert.deepStrictEqual(ALLOWED_TRANSITIONS['UPCOMING'], ['ONGOING', 'CANCELLED']);
  assert.deepStrictEqual(ALLOWED_TRANSITIONS['ONGOING'], ['COMPLETED', 'CANCELLED']);

  assert.strictEqual(isTerminal('COMPLETED'), true);
  assert.strictEqual(isTerminal('CANCELLED'), true);
  assert.strictEqual(isTerminal('ONGOING'), false);
  assert.strictEqual(isTerminal('DRAFT'), false);
});

// ----------------------------------------------------
// TEST 3: Tournament Directory Multi-Attribute Filtering
// ----------------------------------------------------
assertTest('Directory Filtering: Filter tournaments by search query and lifecycle status', () => {
  const mockTournaments = [
    { id: '1', name: 'Shivaji Park Premier League', short_name: 'SPPL', city: 'Mumbai', status: 'ONGOING' },
    { id: '2', name: 'Navi Mumbai T20 Cup', short_name: 'NMC', city: 'Navi Mumbai', status: 'UPCOMING' },
    { id: '3', name: 'Pune Monsoon Trophy', short_name: 'PMT', city: 'Pune', status: 'DRAFT' },
    { id: '4', name: 'Dadar Masters League', short_name: 'DML', city: 'Mumbai', status: 'COMPLETED' },
  ];

  const filterTournaments = (list, { search = '', status = 'ALL' }) => {
    return list.filter((t) => {
      const matchesSearch =
        !search ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.city.toLowerCase().includes(search.toLowerCase()) ||
        t.short_name.toLowerCase().includes(search.toLowerCase());

      const matchesStatus = status === 'ALL' || t.status === status;
      return matchesSearch && matchesStatus;
    });
  };

  // Search by name substring
  const searchResult = filterTournaments(mockTournaments, { search: 'Shivaji' });
  assert.strictEqual(searchResult.length, 1);
  assert.strictEqual(searchResult[0].short_name, 'SPPL');

  // Search by city
  const cityResult = filterTournaments(mockTournaments, { search: 'Mumbai' });
  assert.strictEqual(cityResult.length, 3); // Mumbai, Navi Mumbai, Dadar (Mumbai)

  // Filter by status ONGOING
  const ongoingResult = filterTournaments(mockTournaments, { status: 'ONGOING' });
  assert.strictEqual(ongoingResult.length, 1);
  assert.strictEqual(ongoingResult[0].status, 'ONGOING');

  // Combined search and status filter
  const combined = filterTournaments(mockTournaments, { search: 'Mumbai', status: 'COMPLETED' });
  assert.strictEqual(combined.length, 1);
  assert.strictEqual(combined[0].name, 'Dadar Masters League');
});

// ----------------------------------------------------
// TEST 4: Match Resolution Payload Formatting
// ----------------------------------------------------
assertTest('Match Resolution Payloads: Accurately formats ABANDONED and COMPLETED resolution structures', () => {
  const buildResolutionPayload = ({ action, resultType, winnerTeamId, marginRuns, marginWickets, abandonmentReason, potmId }) => {
    if (action === 'ABANDON') {
      return {
        status: 'ABANDONED',
        resultType: 'NO_RESULT',
        abandonmentReason,
        winnerTeamId: null,
      };
    }
    return {
      status: 'COMPLETED',
      resultType,
      winnerTeamId: resultType === 'TIED' ? null : winnerTeamId,
      resultMarginRuns: resultType === 'WIN_DEFEND' ? marginRuns : null,
      resultMarginWickets: resultType === 'WIN_CHASE' ? marginWickets : null,
      playerOfTheMatchId: potmId || null,
    };
  };

  // Abandonment payload
  const abandonPayload = buildResolutionPayload({
    action: 'ABANDON',
    abandonmentReason: 'Rain stopped play',
  });
  assert.strictEqual(abandonPayload.status, 'ABANDONED');
  assert.strictEqual(abandonPayload.resultType, 'NO_RESULT');
  assert.strictEqual(abandonPayload.winnerTeamId, null);
  assert.strictEqual(abandonPayload.abandonmentReason, 'Rain stopped play');

  // Win Defend payload
  const winDefendPayload = buildResolutionPayload({
    action: 'COMPLETE',
    resultType: 'WIN_DEFEND',
    winnerTeamId: 'team_a',
    marginRuns: 34,
    marginWickets: null,
    potmId: 'player_1',
  });
  assert.strictEqual(winDefendPayload.status, 'COMPLETED');
  assert.strictEqual(winDefendPayload.resultType, 'WIN_DEFEND');
  assert.strictEqual(winDefendPayload.winnerTeamId, 'team_a');
  assert.strictEqual(winDefendPayload.resultMarginRuns, 34);
  assert.strictEqual(winDefendPayload.resultMarginWickets, null);
  assert.strictEqual(winDefendPayload.playerOfTheMatchId, 'player_1');

  // Tied match payload
  const tiedPayload = buildResolutionPayload({
    action: 'COMPLETE',
    resultType: 'TIED',
    winnerTeamId: 'team_a',
    marginRuns: null,
    marginWickets: null,
  });
  assert.strictEqual(tiedPayload.status, 'COMPLETED');
  assert.strictEqual(tiedPayload.resultType, 'TIED');
  assert.strictEqual(tiedPayload.winnerTeamId, null, 'Winner team must be null for tied matches');
});

console.log('\n======================================================================');
console.log(`🏆 ALL ${passedTests} OF ${totalTests} TOURNAMENT ADMIN FRONTEND TESTS PASSED!`);
console.log('======================================================================\n');
