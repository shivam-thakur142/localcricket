// ====================================================================
// TOURNAMENT OPERATIONS & OFFICIALS FRONTEND TESTS (MILESTONE 10)
// ====================================================================

import assert from 'assert';

console.log('\n🏏 ======================================================================');
console.log('🏏 LocalCricket: Running Milestone 10 Tournament Operations Frontend Tests');
console.log('🏏 ======================================================================\n');

let passedTests = 0;
let totalTests = 0;

function assertTest(name, fn) {
  totalTests++;
  process.stdout.write(`🧪 [Frontend Operations Test ${totalTests}] ${name}... `);
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
// TEST 1: Schedule Conflict & Window Detection Helper
// ----------------------------------------------------
assertTest('Schedule Conflict Helper: Detects overlapping time windows for teams and venues', () => {
  const detectSlotClash = (newMatch, existingMatches) => {
    const newStart = new Date(newMatch.scheduledStartTime).getTime();
    const newEnd = newStart + (newMatch.durationMinutes || 188) * 60000;

    for (const m of existingMatches) {
      if (m.status === 'CANCELLED' || m.status === 'ABANDONED') continue;
      const mStart = new Date(m.scheduledStartTime).getTime();
      const mEnd = mStart + (m.durationMinutes || 188) * 60000;

      // Check overlap: StartA < EndB and EndA > StartB
      const hasOverlap = newStart < mEnd && newEnd > mStart;
      if (!hasOverlap) continue;

      if (m.venueId && newMatch.venueId && m.venueId === newMatch.venueId) {
        return { clash: true, type: 'VENUE', conflictingMatchId: m.id };
      }
      if (
        m.teamAId === newMatch.teamAId ||
        m.teamAId === newMatch.teamBId ||
        m.teamBId === newMatch.teamAId ||
        m.teamBId === newMatch.teamBId
      ) {
        return { clash: true, type: 'TEAM', conflictingMatchId: m.id };
      }
    }
    return { clash: false };
  };

  const existingMatches = [
    {
      id: 'm1',
      teamAId: 'team-1',
      teamBId: 'team-2',
      venueId: 'venue-north',
      scheduledStartTime: '2026-10-15T09:00:00Z',
      durationMinutes: 180, // 09:00 to 12:00
      status: 'SCHEDULED',
    },
    {
      id: 'm2',
      teamAId: 'team-3',
      teamBId: 'team-4',
      venueId: 'venue-south',
      scheduledStartTime: '2026-10-15T14:00:00Z',
      durationMinutes: 180, // 14:00 to 17:00
      status: 'SCHEDULED',
    },
  ];

  // 1. Team overlap at 10:00 (during m1)
  const teamClash = detectSlotClash(
    {
      teamAId: 'team-1',
      teamBId: 'team-5',
      venueId: 'venue-other',
      scheduledStartTime: '2026-10-15T10:00:00Z',
      durationMinutes: 180,
    },
    existingMatches
  );
  assert.strictEqual(teamClash.clash, true);
  assert.strictEqual(teamClash.type, 'TEAM');
  assert.strictEqual(teamClash.conflictingMatchId, 'm1');

  // 2. Venue overlap at 11:00 (during m1)
  const venueClash = detectSlotClash(
    {
      teamAId: 'team-5',
      teamBId: 'team-6',
      venueId: 'venue-north',
      scheduledStartTime: '2026-10-15T11:00:00Z',
      durationMinutes: 180,
    },
    existingMatches
  );
  assert.strictEqual(venueClash.clash, true);
  assert.strictEqual(venueClash.type, 'VENUE');

  // 3. Clean slot at 12:30 (no overlap with m1 or m2)
  const cleanSlot = detectSlotClash(
    {
      teamAId: 'team-1',
      teamBId: 'team-5',
      venueId: 'venue-north',
      scheduledStartTime: '2026-10-15T12:05:00Z',
      durationMinutes: 100, // 12:05 to 13:45
    },
    existingMatches
  );
  assert.strictEqual(cleanSlot.clash, false);
});

// ----------------------------------------------------
// TEST 2: Officials Role Validation & Eligibility Model
// ----------------------------------------------------
assertTest('Official Role Validation: Enforces role permissions and duplicate role prevention', () => {
  const validateOfficialAssignment = (matchOfficials, newAssignment, userTournamentRole) => {
    const { role } = newAssignment;
    const isUmpireRole = ['UMPIRE_1', 'UMPIRE_2', 'THIRD_UMPIRE'].includes(role);
    const isRefereeRole = role === 'MATCH_REFEREE';

    if (!isUmpireRole && !isRefereeRole) {
      return { valid: false, error: 'Invalid match official role' };
    }

    if (isUmpireRole && userTournamentRole !== 'UMPIRE' && userTournamentRole !== 'ORGANIZER') {
      return { valid: false, error: 'User does not possess UMPIRE or ORGANIZER tournament credential' };
    }

    if (isRefereeRole && userTournamentRole !== 'REFEREE' && userTournamentRole !== 'ORGANIZER') {
      return { valid: false, error: 'User does not possess REFEREE or ORGANIZER tournament credential' };
    }

    // Check duplicate role in match
    const roleTaken = matchOfficials.some((o) => o.role === role);
    if (roleTaken) {
      return { valid: false, error: `Position ${role} is already assigned for this match` };
    }

    // Check same user already assigned to match
    const userAssigned = matchOfficials.some((o) => o.userId === newAssignment.userId);
    if (userAssigned) {
      return { valid: false, error: 'Official is already assigned in another role for this match' };
    }

    return { valid: true };
  };

  const currentOfficials = [
    { role: 'UMPIRE_1', userId: 'usr-10' },
  ];

  // Ineligible viewer
  const resViewer = validateOfficialAssignment(currentOfficials, { role: 'UMPIRE_2', userId: 'usr-20' }, 'VIEWER');
  assert.strictEqual(resViewer.valid, false);
  assert.ok(resViewer.error.includes('credential'));

  // Duplicate role
  const resDupRole = validateOfficialAssignment(currentOfficials, { role: 'UMPIRE_1', userId: 'usr-30' }, 'UMPIRE');
  assert.strictEqual(resDupRole.valid, false);
  assert.ok(resDupRole.error.includes('already assigned'));

  // Duplicate user in different role
  const resDupUser = validateOfficialAssignment(currentOfficials, { role: 'UMPIRE_2', userId: 'usr-10' }, 'UMPIRE');
  assert.strictEqual(resDupUser.valid, false);
  assert.ok(resDupUser.error.includes('already assigned in another role'));

  // Eligible assignment
  const resValid = validateOfficialAssignment(currentOfficials, { role: 'UMPIRE_2', userId: 'usr-25' }, 'UMPIRE');
  assert.strictEqual(resValid.valid, true);
});

// ----------------------------------------------------
// TEST 3: Squad Verification Checklist & Lifecycle Badge
// ----------------------------------------------------
assertTest('Squad Verification Rules: Verifies 11-25 player range and exactly 1 captain invariant', () => {
  const evaluateSquadCompliance = (roster, squadStatus) => {
    const activePlayers = (roster || []).filter((p) => p.isActive !== false);
    const playerCount = activePlayers.length;
    const captains = activePlayers.filter((p) => p.isCaptain);
    const captainCount = captains.length;

    const isCountValid = playerCount >= 11 && playerCount <= 25;
    const isCaptainValid = captainCount === 1;
    const canVerify = isCountValid && isCaptainValid && squadStatus !== 'LOCKED' && squadStatus !== 'VERIFIED';
    const isLocked = squadStatus === 'LOCKED';

    return {
      playerCount,
      captainCount,
      isCountValid,
      isCaptainValid,
      isCompliant: isCountValid && isCaptainValid,
      canVerify,
      isLocked,
    };
  };

  // 1. Under-manned squad (8 players)
  const underSquad = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, isActive: true, isCaptain: i === 0 }));
  const evalUnder = evaluateSquadCompliance(underSquad, 'DRAFT');
  assert.strictEqual(evalUnder.isCountValid, false);
  assert.strictEqual(evalUnder.isCompliant, false);
  assert.strictEqual(evalUnder.canVerify, false);

  // 2. Multi-captain squad (12 players, 2 captains)
  const multiCapSquad = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, isActive: true, isCaptain: i < 2 }));
  const evalMulti = evaluateSquadCompliance(multiCapSquad, 'DRAFT');
  assert.strictEqual(evalMulti.isCaptainValid, false);
  assert.strictEqual(evalMulti.isCompliant, false);
  assert.strictEqual(evalMulti.canVerify, false);

  // 3. Compliant squad (15 players, 1 captain)
  const validSquad = Array.from({ length: 15 }, (_, i) => ({ id: `p${i}`, isActive: true, isCaptain: i === 0 }));
  const evalValid = evaluateSquadCompliance(validSquad, 'DRAFT');
  assert.strictEqual(evalValid.isCountValid, true);
  assert.strictEqual(evalValid.isCaptainValid, true);
  assert.strictEqual(evalValid.isCompliant, true);
  assert.strictEqual(evalValid.canVerify, true);
  assert.strictEqual(evalValid.isLocked, false);
});

// ----------------------------------------------------
// TEST 4: Locked Roster Override Guard
// ----------------------------------------------------
assertTest('Locked Roster Override Guard: Requires non-empty reason and preserves invariants', () => {
  const validateRosterOverride = ({ squadStatus, action, reason, targetRoster, newPlayerCount }) => {
    if (squadStatus !== 'LOCKED') {
      return { allowed: false, error: 'Overrides only apply to locked squads' };
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return { allowed: false, error: 'A non-empty reason is mandatory for locked roster overrides' };
    }
    if (action === 'REMOVE_PLAYER' && newPlayerCount < 11) {
      return { allowed: false, error: 'Cannot remove player: squad would fall below mandatory 11 active players' };
    }
    return { allowed: true };
  };

  // Empty reason rejection
  const resEmpty = validateRosterOverride({
    squadStatus: 'LOCKED',
    action: 'ADD_PLAYER',
    reason: '   ',
    newPlayerCount: 12,
  });
  assert.strictEqual(resEmpty.allowed, false);
  assert.ok(resEmpty.error.includes('non-empty reason'));

  // Drop below 11 players rejection
  const resUnder = validateRosterOverride({
    squadStatus: 'LOCKED',
    action: 'REMOVE_PLAYER',
    reason: 'Player personal emergency leave',
    newPlayerCount: 10,
  });
  assert.strictEqual(resUnder.allowed, false);
  assert.ok(resUnder.error.includes('11 active players'));

  // Valid emergency addition
  const resValid = validateRosterOverride({
    squadStatus: 'LOCKED',
    action: 'ADD_PLAYER',
    reason: 'Emergency injury replacement approved by tournament technical committee',
    newPlayerCount: 12,
  });
  assert.strictEqual(resValid.allowed, true);
});

// ----------------------------------------------------
// TEST 5: Tournament Archive CSV Serializer
// ----------------------------------------------------
assertTest('Archive CSV Serializer: Complies with RFC 4180 escaping and accurate column headers', () => {
  const serializeToCsv = (headers, rows) => {
    const escapeField = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerLine = headers.join(',');
    const dataLines = rows.map((r) => headers.map((h) => escapeField(r[h])).join(','));
    return [headerLine, ...dataLines].join('\n');
  };

  const headers = ['Rank', 'Team', 'Points', 'NRR'];
  const testRows = [
    { Rank: 1, Team: 'Royal Challengers, Bangalore', Points: 10, NRR: '+1.450' },
    { Rank: 2, Team: 'Mumbai "Indians"', Points: 8, NRR: '+0.820' },
  ];

  const csv = serializeToCsv(headers, testRows);
  const lines = csv.split('\n');

  assert.strictEqual(lines[0], 'Rank,Team,Points,NRR');
  // Row 1 contains comma -> must be quoted
  assert.strictEqual(lines[1], '1,"Royal Challengers, Bangalore",10,+1.450');
  // Row 2 contains double quotes -> must be escaped as ""
  assert.strictEqual(lines[2], '2,"Mumbai ""Indians""",8,+0.820');
});

console.log('\n======================================================================');
console.log(`🏆 ALL ${passedTests} OF ${totalTests} MILESTONE 10 FRONTEND TESTS PASSED!`);
console.log('======================================================================\n');
