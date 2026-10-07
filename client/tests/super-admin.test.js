// ====================================================================
// SUPER ADMIN & PLATFORM MANAGEMENT FRONTEND TESTS (MILESTONE 12)
// ====================================================================

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { api, setAccessToken } from '../src/services/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n🏏 ======================================================================');
console.log('🏏 LocalCricket: Running Milestone 12 Super Admin Frontend Tests');
console.log('🏏 ======================================================================\n');

let passedTests = 0;
let totalTests = 0;

async function assertTest(name, fn) {
  totalTests++;
  process.stdout.write(`🧪 [Frontend Admin Test ${totalTests}] ${name}... `);
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

// Mock Global Fetch
const originalFetch = global.fetch;

try {
  // ----------------------------------------------------
  // TEST 1: Overview Telemetry Payload Structure
  // ----------------------------------------------------
  await assertTest('Overview Telemetry: getPlatformOverview calls /api/v1/admin/overview', async () => {
    let capturedUrl = null;
    let capturedHeaders = null;

    global.fetch = async (url, options = {}) => {
      capturedUrl = url;
      capturedHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          success: true,
          data: {
            stats: {
              totalUsers: 42,
              totalTournaments: 5,
              totalMatches: 20,
              liveMatchesCount: 3,
              totalBallsBowled: 720,
              lockedAccounts: 0,
              suspendedUsers: 1,
              superAdminsCount: 2,
              activeSessions: 14,
            },
            diagnostics: {
              dbStatus: 'HEALTHY',
              latencyMs: 4,
            },
          },
        }),
      };
    };

    const res = await api.getPlatformOverview();
    assert.strictEqual(capturedUrl, '/api/v1/admin/overview');
    assert.strictEqual(res.data.stats.totalUsers, 42);
    assert.strictEqual(res.data.diagnostics.dbStatus, 'HEALTHY');
  });

  // ----------------------------------------------------
  // TEST 2: Cross-Tournament Live Matches Retrieval
  // ----------------------------------------------------
  await assertTest('Live Monitor: getAdminLiveMatches queries /api/v1/admin/live-matches', async () => {
    let capturedUrl = null;

    global.fetch = async (url) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          success: true,
          data: [
            {
              id: '88888888-8888-8888-8888-888888888888',
              tournament_name: 'Shivaji Park Premier League',
              team_a_name: 'Dadar Warriors',
              team_b_name: 'Bandra Strikers',
              status: 'IN_PROGRESS',
              current_score: '142/3',
              overs_summary: '15.4',
            },
          ],
        }),
      };
    };

    const res = await api.getAdminLiveMatches();
    assert.strictEqual(capturedUrl, '/api/v1/admin/live-matches');
    assert.strictEqual(res.data.length, 1);
    assert.strictEqual(res.data[0].status, 'IN_PROGRESS');
  });

  // ----------------------------------------------------
  // TEST 3: Tournament Freeze Mutation Contract
  // ----------------------------------------------------
  await assertTest('Tournament Governance: freezeTournament dispatches PATCH with reason', async () => {
    let capturedUrl = null;
    let capturedMethod = null;
    let capturedBody = null;

    global.fetch = async (url, options = {}) => {
      capturedUrl = url;
      capturedMethod = options.method;
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          success: true,
          data: {
            tournament: { id: '33333333-3333-3333-3333-333333333333', is_frozen: true },
          },
        }),
      };
    };

    const res = await api.freezeTournament('33333333-3333-3333-3333-333333333333', {
      isFrozen: true,
      reason: 'Disciplinary investigation pending',
    });

    assert.strictEqual(capturedUrl, '/api/v1/admin/tournaments/33333333-3333-3333-3333-333333333333/freeze');
    assert.strictEqual(capturedMethod, 'PATCH');
    assert.strictEqual(capturedBody.isFrozen, true);
    assert.strictEqual(capturedBody.reason, 'Disciplinary investigation pending');
    assert.strictEqual(res.data.tournament.is_frozen, true);
  });

  // ----------------------------------------------------
  // TEST 4: Tournament Ownership Transfer Contract
  // ----------------------------------------------------
  await assertTest('Tournament Transfer: transferTournamentOwnership reassigns created_by_user_id', async () => {
    let capturedUrl = null;
    let capturedMethod = null;
    let capturedBody = null;

    global.fetch = async (url, options = {}) => {
      capturedUrl = url;
      capturedMethod = options.method;
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          success: true,
          data: {
            tournamentId: '33333333-3333-3333-3333-333333333333',
            newOwnerUserId: '44444444-4444-4444-4444-444444444444',
          },
        }),
      };
    };

    const res = await api.transferTournamentOwnership('33333333-3333-3333-3333-333333333333', {
      newOwnerUserId: '44444444-4444-4444-4444-444444444444',
      reason: 'Former president stepped down',
    });

    assert.strictEqual(capturedUrl, '/api/v1/admin/tournaments/33333333-3333-3333-3333-333333333333/transfer-ownership');
    assert.strictEqual(capturedMethod, 'POST');
    assert.strictEqual(capturedBody.newOwnerUserId, '44444444-4444-4444-4444-444444444444');
    assert.strictEqual(res.data.newOwnerUserId, '44444444-4444-4444-4444-444444444444');
  });

  // ----------------------------------------------------
  // TEST 5: User Moderation Status & Role Contracts
  // ----------------------------------------------------
  await assertTest('User Moderation: updateUserStatus, updateUserRole, unlockUserAccount', async () => {
    const calls = [];

    global.fetch = async (url, options = {}) => {
      calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true, data: { status: 'OK' } }),
      };
    };

    const uId = '12345678-1234-1234-1234-123456789abc';
    await api.unlockUserAccount(uId, { reason: 'Admin manual reset' });
    await api.updateUserStatus(uId, { isSuspended: true, reason: 'Abuse detected' });
    await api.updateUserRole(uId, { globalRole: 'SUPER_ADMIN', reason: 'Promotion approved' });

    assert.strictEqual(calls.length, 3);
    assert.strictEqual(calls[0].url, `/api/v1/admin/users/${uId}/unlock`);
    assert.strictEqual(calls[0].method, 'POST');
    assert.strictEqual(calls[1].url, `/api/v1/admin/users/${uId}/status`);
    assert.strictEqual(calls[1].method, 'PATCH');
    assert.strictEqual(calls[1].body.isSuspended, true);
    assert.strictEqual(calls[2].url, `/api/v1/admin/users/${uId}/role`);
    assert.strictEqual(calls[2].method, 'PATCH');
    assert.strictEqual(calls[2].body.globalRole, 'SUPER_ADMIN');
  });

  // ----------------------------------------------------
  // TEST 6: Atomic Player Merge Contract
  // ----------------------------------------------------
  await assertTest('Player Merge: mergePlayers passes source, target, and mandatory reason', async () => {
    let capturedBody = null;

    global.fetch = async (url, options = {}) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          success: true,
          data: {
            mergeSummary: {
              sourcePlayerId: '11111111-0000-0000-0000-000000000001',
              targetPlayerId: '22222222-0000-0000-0000-000000000002',
              rostersRemapped: 2,
              deliveriesRemapped: 15,
              awardsRemapped: 1,
            },
          },
        }),
      };
    };

    const res = await api.mergePlayers({
      sourcePlayerId: '11111111-0000-0000-0000-000000000001',
      targetPlayerId: '22222222-0000-0000-0000-000000000002',
      reason: 'Authoritative profile deduplication',
    });

    assert.strictEqual(capturedBody.sourcePlayerId, '11111111-0000-0000-0000-000000000001');
    assert.strictEqual(capturedBody.targetPlayerId, '22222222-0000-0000-0000-000000000002');
    assert.strictEqual(res.data.mergeSummary.rostersRemapped, 2);
  });

  // ----------------------------------------------------
  // TEST 7: Global Team Verification Toggle Contract
  // ----------------------------------------------------
  await assertTest('Team Verification: toggleTeamVerification dispatches PATCH with reason', async () => {
    let capturedUrl = null;
    let capturedBody = null;

    global.fetch = async (url, options = {}) => {
      capturedUrl = url;
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          success: true,
          data: {
            team: { id: 'team-123', is_verified: true },
          },
        }),
      };
    };

    const res = await api.toggleTeamVerification('team-123', {
      isVerified: true,
      reason: 'Registration verified with MCA',
    });

    assert.strictEqual(capturedUrl, '/api/v1/admin/teams/team-123/verify');
    assert.strictEqual(capturedBody.isVerified, true);
    assert.strictEqual(res.data.team.is_verified, true);
  });

  // ----------------------------------------------------
  // TEST 8: Venue Blackouts Scheduling & Removal Contracts
  // ----------------------------------------------------
  await assertTest('Venue Blackouts: create, list, and delete blackout with reason', async () => {
    const blackoutCalls = [];

    global.fetch = async (url, options = {}) => {
      blackoutCalls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
      return {
        ok: true,
        status: options.method === 'POST' ? 201 : 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          success: true,
          data: { id: 'blackout-abc', status: 'OK' },
        }),
      };
    };

    await api.createVenueBlackout({
      venueId: 'v-1',
      startTime: '2026-06-01T00:00:00Z',
      endTime: '2026-06-02T00:00:00Z',
      reason: 'Monsoon pitch maintenance',
    });
    await api.listVenueBlackouts('v-1');
    await api.deleteVenueBlackout('blackout-abc', { reason: 'Early completion of work' });

    assert.strictEqual(blackoutCalls.length, 3);
    assert.strictEqual(blackoutCalls[0].url, '/api/v1/admin/venues/blackouts');
    assert.strictEqual(blackoutCalls[0].method, 'POST');
    assert.strictEqual(blackoutCalls[1].url, '/api/v1/admin/venues/blackouts?venueId=v-1');
    assert.strictEqual(blackoutCalls[2].url, '/api/v1/admin/venues/blackouts/blackout-abc');
    assert.strictEqual(blackoutCalls[2].method, 'DELETE');
    assert.strictEqual(blackoutCalls[2].body.reason, 'Early completion of work');
  });

  // ----------------------------------------------------
  // TEST 9: Persona Switcher Super Admin Inclusion
  // ----------------------------------------------------
  await assertTest('Persona Switcher: Includes Super Admin with authoritative seed ID and email', () => {
    const switcherPath = path.join(__dirname, '../src/components/layout/PersonaSwitcher.jsx');
    const content = fs.readFileSync(switcherPath, 'utf-8');
    assert.ok(content.includes('00000000-0000-0000-0000-000000000001'), 'Must include Super Admin seed ID');
    assert.ok(content.includes('SUPER_ADMIN'), 'Must specify SUPER_ADMIN role');
    assert.ok(content.includes('admin@localcricket.test'), 'Must specify admin email');
    assert.ok(content.includes('⚡ Super Admin'), 'Must specify Super Admin badge');
  });

} finally {
  global.fetch = originalFetch;
}

console.log('\n======================================================================');
console.log(`🏆 ALL ${passedTests} OF ${totalTests} SUPER ADMIN FRONTEND TESTS PASSED!`);
console.log('======================================================================\n');
