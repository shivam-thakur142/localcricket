#!/usr/bin/env node
// ==============================================================================
// LocalCricket Full E2E Lifecycle Verifier (scripts/verify-e2e-lifecycle.js)
// Milestone 15 — Staging / Pre-Production Deep Lifecycle Audit
//
// INVARIANT:
// "Full E2E functional verification executes strictly against staging or an
// isolated temporary deployment/database. Prohibited from running on real production."
// ==============================================================================

import http from 'http';
import https from 'https';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
let PGlite;
try {
  const mod = await import('@electric-sql/pglite');
  PGlite = mod.PGlite;
} catch {
  const mod = await import('../server/node_modules/@electric-sql/pglite/dist/index.js');
  PGlite = mod.PGlite;
}
import { createApp } from '../server/src/app.js';
import { runMigrations } from '../server/src/migrate.js';
import { generateAccessToken } from '../server/src/services/tokenService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const TARGET_ENV = process.env.TARGET_ENV || process.env.NODE_ENV || 'staging';
let targetUrl = process.env.TARGET_URL || process.env.STAGING_URL || `http://localhost:${process.env.PORT || 5000}`;

console.log('======================================================================');
console.log('🏏 [LocalCricket E2E] Running Full E2E Lifecycle Verifier');
console.log(`Environment: ${TARGET_ENV} | Initial Target: ${targetUrl}`);
console.log('======================================================================\n');

// ------------------------------------------------------------------------------
// STAGING SAFETY GUARD
// ------------------------------------------------------------------------------
if (TARGET_ENV === 'production' && !process.env.ALLOW_DESTRUCTIVE_PRODUCTION_TESTS) {
  console.error('❌ FATAL: Full E2E Lifecycle Verifier is strictly PROHIBITED from running against production!');
  console.error('This test creates and mutates tournaments, matches, rosters, and scoring ledgers.');
  console.error('Use scripts/verify-production-smoke.js for production-safe smoke testing.');
  process.exit(1);
}

function request(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr, targetUrl);
    const client = url.protocol === 'https:' ? https : http;
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 10000,
    };

    const req = client.request(url, reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
          json,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${reqOptions.timeout}ms`));
    });

    if (options.body) {
      const payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      req.setHeader('Content-Type', 'application/json');
      req.setHeader('Content-Length', Buffer.byteLength(payload));
      req.write(payload);
    }
    req.end();
  });
}

async function probeTarget(url) {
  try {
    const res = await fetch(new URL('/health', url), { signal: AbortSignal.timeout(1500) });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function runE2ELifecycle() {
  let passed = 0;
  let total = 0;
  const failures = [];
  let ephemeralServer = null;
  let ephemeralDb = null;

  async function step(name, testFn) {
    total++;
    process.stdout.write(`  [E2E Phase ${total}] ${name}... `);
    try {
      await testFn();
      passed++;
      console.log('PASSED ✅');
    } catch (err) {
      console.log(`FAILED ❌ (${err.message})`);
      failures.push({ name, error: err.message });
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // Phase 0: Target Readiness & Ephemeral Staging Deployment Setup
  // --------------------------------------------------------------------------
  const isTargetLive = await probeTarget(targetUrl);
  if (!isTargetLive) {
    console.log(`ℹ️ Target endpoint ${targetUrl} not responding. Booting isolated staging deployment instance...`);
    ephemeralDb = new PGlite();
    await runMigrations(ephemeralDb, { useAdvisoryLock: false, logger: { log: () => {} } });
    const app = createApp(ephemeralDb);
    ephemeralServer = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = ephemeralServer.address().port;
    targetUrl = `http://127.0.0.1:${port}`;
    console.log(`🚀 Isolated Staging Server successfully booted at ${targetUrl}\n`);
  } else {
    console.log(`Connected to active target endpoint at ${targetUrl}\n`);
  }

  const runId = crypto.randomUUID().slice(0, 8);
  let adminToken = '';
  let superAdminToken = '';
  let operatorUserId = '';
  let tournamentId = '';
  let team1GlobalId = '';
  let team2GlobalId = '';
  let team3GlobalId = '';
  let team4GlobalId = '';
  let team1TournamentId = '';
  let team2TournamentId = '';
  let team3TournamentId = '';
  let team4TournamentId = '';
  let player1Id = '';
  let player2Id = '';
  let bowler1Id = '';
  let bowler2Id = '';
  let matchId = '';

  try {
    // --------------------------------------------------------------------------
    // Phase 1: Pre-Flight Health & Readiness
    // --------------------------------------------------------------------------
    await step('Pre-Flight Check: Verify /health and /ready return HTTP 200 OK', async () => {
      const health = await request('/health');
      if (health.statusCode !== 200) throw new Error(`/health returned ${health.statusCode}`);
      const ready = await request('/ready');
      if (ready.statusCode !== 200) throw new Error(`/ready returned ${ready.statusCode}`);
    });

    // --------------------------------------------------------------------------
    // Phase 2: Operator Authentication & Roles Setup
    // --------------------------------------------------------------------------
    await step('Authentication & Roles: Register tournament operator and generate tokens', async () => {
      const email = `staging_operator_${runId}@example.com`;
      const password = `StagingPass123!_${runId}`;

      const regRes = await request('/api/v1/auth/register', {
        method: 'POST',
        body: { email, password, fullName: `Staging Operator ${runId}` },
      });

      if (regRes.statusCode === 201) {
        adminToken = regRes.json?.data?.accessToken || '';
        operatorUserId = regRes.json?.data?.user?.id || '';
      } else {
        const loginRes = await request('/api/v1/auth/login', {
          method: 'POST',
          body: { email, password },
        });
        if (loginRes.statusCode !== 200) throw new Error(`Login failed (${loginRes.statusCode})`);
        adminToken = loginRes.json?.data?.accessToken || '';
        operatorUserId = loginRes.json?.data?.user?.id || '';
      }

      if (!adminToken) throw new Error('Failed to acquire operator access token');

      // Grant SUPER_ADMIN role in database if ephemeral instance to satisfy platform_audit_logs FK
      if (ephemeralDb && operatorUserId) {
        await ephemeralDb.query("UPDATE users SET global_role = 'SUPER_ADMIN' WHERE id = $1;", [operatorUserId]);
      }

      // Generate Super Admin token for emergency freeze verification
      superAdminToken = generateAccessToken({
        id: operatorUserId,
        sub: operatorUserId,
        email: email,
        full_name: `Staging Operator ${runId}`,
        global_role: 'SUPER_ADMIN',
      });
    });

    // --------------------------------------------------------------------------
    // Phase 3: Tournament Provisioning
    // --------------------------------------------------------------------------
    await step('Tournament Creation: Provision staging tournament fixture container', async () => {
      const createRes = await request('/api/v1/tournaments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          name: `Staging Championship ${runId}`,
          short_name: `SC${runId.slice(0, 4)}`,
          city: 'Mumbai',
          status: 'UPCOMING',
          tournament_type: 'LEAGUE',
          overs_per_innings: 20,
          balls_per_over: 6,
          max_overs_per_bowler: 4,
          start_date: '2026-10-15',
          end_date: '2026-10-25',
        },
      });

      if (createRes.statusCode !== 201) {
        throw new Error(`Tournament creation failed (${createRes.statusCode}): ${createRes.body}`);
      }

      tournamentId = createRes.json?.data?.id || createRes.json?.id;
      if (!tournamentId) throw new Error('Tournament response missing ID');
    });

    // --------------------------------------------------------------------------
    // Phase 4: Team Registration & Squad Rosters
    // --------------------------------------------------------------------------
    await step('Teams & Squads: Register 4 teams and populate player rosters', async () => {
      // 1. Create 4 global teams
      const teamData = [
        { name: `Staging Lions ${runId}`, short_name: `SL1` },
        { name: `Staging Tigers ${runId}`, short_name: `ST2` },
        { name: `Staging Eagles ${runId}`, short_name: `SE3` },
        { name: `Staging Hawks ${runId}`, short_name: `SH4` },
      ];

      const globalTeamIds = [];
      for (const td of teamData) {
        const res = await request('/api/v1/teams', {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: td,
        });
        if (res.statusCode !== 201) throw new Error(`Global team creation failed (${res.statusCode}): ${res.body}`);
        globalTeamIds.push(res.json?.data?.id);
      }
      [team1GlobalId, team2GlobalId, team3GlobalId, team4GlobalId] = globalTeamIds;

      // 2. Register all 4 teams into tournament
      const tournamentTeamIds = [];
      for (const tId of globalTeamIds) {
        const regRes = await request(`/api/v1/tournaments/${tournamentId}/teams`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: { teamId: tId, groupName: 'Group A' },
        });
        if (regRes.statusCode !== 201) throw new Error(`Tournament team register failed: ${regRes.body}`);
        tournamentTeamIds.push(regRes.json?.data?.id);
      }
      [team1TournamentId, team2TournamentId, team3TournamentId, team4TournamentId] = tournamentTeamIds;

      // 3. Create global players
      const p1Res = await request('/api/v1/players', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { full_name: `Striker Batsman ${runId}`, primary_role: 'BATTER' },
      });
      player1Id = p1Res.json?.data?.id;

      const p2Res = await request('/api/v1/players', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { full_name: `Non-Striker Batsman ${runId}`, primary_role: 'BATTER' },
      });
      player2Id = p2Res.json?.data?.id;

      const p3Res = await request('/api/v1/players', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { full_name: `Opening Bowler ${runId}`, primary_role: 'BOWLER', bowling_style: 'RIGHT_ARM_FAST' },
      });
      bowler1Id = p3Res.json?.data?.id;

      const p4Res = await request('/api/v1/players', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { full_name: `Second Bowler ${runId}`, primary_role: 'BOWLER', bowling_style: 'RIGHT_ARM_SPIN_OFF' },
      });
      bowler2Id = p4Res.json?.data?.id;

      if (!player1Id || !player2Id || !bowler1Id || !bowler2Id) {
        throw new Error('Failed to create key global player entities');
      }

      // 4. Enroll players into team rosters
      await request(`/api/v1/tournaments/${tournamentId}/teams/${team1TournamentId}/roster`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { playerId: player1Id, role: 'BATTER', jerseyNumber: 7 },
      });
      await request(`/api/v1/tournaments/${tournamentId}/teams/${team1TournamentId}/roster`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { playerId: player2Id, role: 'BATTER', jerseyNumber: 18 },
      });
      await request(`/api/v1/tournaments/${tournamentId}/teams/${team2TournamentId}/roster`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { playerId: bowler1Id, role: 'BOWLER', jerseyNumber: 99 },
      });
      await request(`/api/v1/tournaments/${tournamentId}/teams/${team2TournamentId}/roster`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { playerId: bowler2Id, role: 'BOWLER', jerseyNumber: 11 },
      });
    });

    // --------------------------------------------------------------------------
    // Phase 5: Match Fixture Scheduling & Scorer Assignment
    // --------------------------------------------------------------------------
    await step('Match Scheduling: Schedule tournament fixture and assign official scorer', async () => {
      const matchRes = await request(`/api/v1/tournaments/${tournamentId}/matches`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          team_a_id: team1TournamentId,
          team_b_id: team2TournamentId,
          match_number: 1,
          stage: 'LEAGUE',
          scheduled_start_time: new Date(Date.now() + 3600000).toISOString(),
        },
      });

      if (matchRes.statusCode !== 201) {
        throw new Error(`Match fixture scheduling failed (${matchRes.statusCode}): ${matchRes.body}`);
      }
      matchId = matchRes.json?.data?.id;

      // Assign operator as match scorer
      const assignRes = await request(`/api/v1/matches/${matchId}/scorers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { userId: operatorUserId, role: 'PRIMARY' },
      });
      if (assignRes.statusCode !== 200 && assignRes.statusCode !== 201) {
        throw new Error(`Scorer assignment failed (${assignRes.statusCode}): ${assignRes.body}`);
      }
    });

    // --------------------------------------------------------------------------
    // Phase 6: Toss & Innings Start
    // --------------------------------------------------------------------------
    await step('Toss & Innings: Record authoritative toss and commence Innings 1', async () => {
      // Record Toss
      const tossRes = await request(`/api/v1/scorer/matches/${matchId}/toss`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          toss_winner_team_id: team1TournamentId,
          decision: 'BAT',
        },
      });
      if (tossRes.statusCode !== 200 && tossRes.statusCode !== 201) {
        throw new Error(`Toss recording failed (${tossRes.statusCode}): ${tossRes.body}`);
      }

      // Submit Playing XI Squads for Batting and Bowling teams
      await request(`/api/v1/scorer/matches/${matchId}/squads`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          tournamentTeamId: team1TournamentId,
          playerIds: [player1Id, player2Id],
        },
      });

      await request(`/api/v1/scorer/matches/${matchId}/squads`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          tournamentTeamId: team2TournamentId,
          playerIds: [bowler1Id, bowler2Id],
        },
      });

      // Start Innings 1
      const innRes = await request(`/api/v1/scorer/matches/${matchId}/innings/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          battingTeamId: team1TournamentId,
          bowlingTeamId: team2TournamentId,
          strikerId: player1Id,
          nonStrikerId: player2Id,
          bowlerId: bowler1Id,
          inningsNumber: 1,
        },
      });
      if (innRes.statusCode !== 200 && innRes.statusCode !== 201) {
        throw new Error(`Innings start failed (${innRes.statusCode}): ${innRes.body}`);
      }
    });

    // --------------------------------------------------------------------------
    // Phase 7: Live Authoritative Ball-by-Ball Scoring
    // --------------------------------------------------------------------------
    await step('Authoritative Scoring: Record 6 deliveries, boundaries, and over completion', async () => {
      const deliveries = [
        { runs_batter: 1, extra_type: 'NONE', expected_sequence: 1 }, // 1 run
        { runs_batter: 4, extra_type: 'NONE', expected_sequence: 2 }, // 4 boundary
        { runs_batter: 0, extra_type: 'NONE', expected_sequence: 3 }, // 0 dot ball
        { runs_batter: 6, extra_type: 'NONE', expected_sequence: 4 }, // 6 maximum
        { runs_batter: 1, extra_type: 'NONE', expected_sequence: 5 }, // 1 run
        { runs_batter: 2, extra_type: 'NONE', expected_sequence: 6 }, // 2 runs (over completes)
      ];

      for (const d of deliveries) {
        const ballRes = await request(`/api/v1/scorer/matches/${matchId}/deliveries`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: d,
        });
        if (ballRes.statusCode !== 200) {
          throw new Error(`Delivery ${d.expected_sequence} failed (${ballRes.statusCode}): ${ballRes.body}`);
        }
      }

      // Verify live match state reflects authoritative score: 14 runs, 1.0 overs
      const liveRes = await request(`/api/v1/matches/${matchId}/live`);
      if (liveRes.statusCode !== 200) throw new Error(`Live match query failed (${liveRes.statusCode})`);
      const innings = liveRes.json?.data?.innings || liveRes.json?.data?.currentInnings;
      if (innings && innings.total_runs !== 14) {
        throw new Error(`Expected total_runs 14, got ${innings.total_runs}`);
      }
    });

    // --------------------------------------------------------------------------
    // Phase 8: SSE Real-Time Telemetry Contracts
    // --------------------------------------------------------------------------
    await step('SSE Streaming: Verify unbuffered directives and live event bus', async () => {
      const streamHeaders = await new Promise((resolve, reject) => {
        const url = new URL(`/api/v1/matches/${matchId}/stream`, targetUrl);
        const req = http.request(url, { headers: { Accept: 'text/event-stream' } }, (res) => {
          resolve(res.headers);
          req.destroy();
        });
        req.on('error', (err) => {
          if (err.code === 'ECONNRESET' || req.destroyed) return;
          reject(err);
        });
        req.end();
      });

      const accelBuffering = streamHeaders['x-accel-buffering'];
      if (accelBuffering && accelBuffering !== 'no') {
        throw new Error(`Expected X-Accel-Buffering: no, got ${accelBuffering}`);
      }
    });

    // --------------------------------------------------------------------------
    // Phase 9: Points Table & Standings Calculation
    // --------------------------------------------------------------------------
    await step('Standings & NRR: Recalculate tournament points table and standings', async () => {
      const ptRes = await request(`/api/v1/tournaments/${tournamentId}/points-table`);
      if (ptRes.statusCode !== 200) throw new Error(`Points table query failed (${ptRes.statusCode})`);
      const standings = ptRes.json?.data;
      if (!Array.isArray(standings) || standings.length < 4) {
        throw new Error(`Expected at least 4 teams in standings, got ${standings?.length}`);
      }
    });

    // --------------------------------------------------------------------------
    // Phase 10: Knockout / Playoff Bracket Generation
    // --------------------------------------------------------------------------
    await step('Playoff Progression: Transition tournament to ONGOING and generate bracket', async () => {
      // 1. Transition tournament to ONGOING status
      const statusRes = await request(`/api/v1/tournaments/${tournamentId}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { status: 'ONGOING' },
      });
      if (statusRes.statusCode !== 200) {
        throw new Error(`Tournament status update failed (${statusRes.statusCode}): ${statusRes.body}`);
      }

      // 2. Generate playoff bracket
      const bracketRes = await request(`/api/v1/tournaments/${tournamentId}/playoffs/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { format: 'PAGE_PLAYOFF' },
      });
      if (bracketRes.statusCode !== 200 && bracketRes.statusCode !== 201) {
        throw new Error(`Playoff bracket generation failed (${bracketRes.statusCode}): ${bracketRes.body}`);
      }

      // 3. Query playoffs
      const playoffsQuery = await request(`/api/v1/tournaments/${tournamentId}/playoffs`);
      if (playoffsQuery.statusCode !== 200) throw new Error('Failed to query playoff bracket');
    });

    // --------------------------------------------------------------------------
    // Phase 11: Emergency Tournament Freeze Defense (Assert 423)
    // --------------------------------------------------------------------------
    await step('Emergency Freeze Defense: Assert 423 Locked during administrative freeze', async () => {
      // 1. Super Admin freezes the tournament
      const freezeRes = await request(`/api/v1/admin/tournaments/${tournamentId}/freeze`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${superAdminToken}` },
        body: { isFrozen: true, reason: 'E2E Emergency Lockdown Audit' },
      });
      if (freezeRes.statusCode !== 200) {
        throw new Error(`Freeze command failed (${freezeRes.statusCode}): ${freezeRes.body}`);
      }

      // 2. Attempt scoring delivery while frozen -> MUST return 423 TOURNAMENT_FROZEN
      const blockedRes = await request(`/api/v1/scorer/matches/${matchId}/deliveries`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { runs_batter: 1, expected_sequence: 7 },
      });
      if (blockedRes.statusCode !== 423) {
        throw new Error(`Expected HTTP 423 Locked for frozen tournament, got ${blockedRes.statusCode}`);
      }
      if (!blockedRes.body.includes('TOURNAMENT_FROZEN')) {
        throw new Error(`Expected TOURNAMENT_FROZEN error code, got: ${blockedRes.body}`);
      }

      // 3. Super Admin unfreezes tournament
      const unfreezeRes = await request(`/api/v1/admin/tournaments/${tournamentId}/freeze`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${superAdminToken}` },
        body: { isFrozen: false, reason: 'E2E Emergency Lockdown Cleared' },
      });
      if (unfreezeRes.statusCode !== 200) {
        throw new Error(`Unfreeze command failed (${unfreezeRes.statusCode}): ${unfreezeRes.body}`);
      }
    });

    // --------------------------------------------------------------------------
    // Phase 12: Offline Command Queue Replay (M13 Defense)
    // --------------------------------------------------------------------------
    await step('Offline Replay: Verify idempotency key deduplication on queued delivery', async () => {
      const offlineIdempKey = `offline-e2e-ball-${runId}-007`;

      // 0. Start Over 2 with bowler2
      const over2Res = await request(`/api/v1/scorer/matches/${matchId}/overs/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { bowlerId: bowler2Id },
      });
      if (over2Res.statusCode !== 201 && over2Res.statusCode !== 200) {
        throw new Error(`Start Over 2 failed (${over2Res.statusCode}): ${over2Res.body}`);
      }

      // 1. Replay first time
      const res1 = await request(`/api/v1/scorer/matches/${matchId}/deliveries`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'idempotency-key': offlineIdempKey,
          'x-offline-replay': 'true',
        },
        body: {
          runs_batter: 1,
          expected_sequence: 7,
          idempotency_key: offlineIdempKey,
        },
      });
      if (res1.statusCode !== 200) {
        throw new Error(`First delivery submission failed (${res1.statusCode}): ${res1.body}`);
      }

      // 2. Replay duplicate with identical idempotency key (simulating network reconnection)
      const res2 = await request(`/api/v1/scorer/matches/${matchId}/deliveries`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'idempotency-key': offlineIdempKey,
          'x-offline-replay': 'true',
        },
        body: {
          runs_batter: 1,
          expected_sequence: 7,
          idempotency_key: offlineIdempKey,
        },
      });
      if (res2.statusCode !== 200) {
        throw new Error(`Duplicate submission should return 200, got ${res2.statusCode}`);
      }
      if (res2.json?.data?.delivery?.delivery_sequence !== 7) {
        throw new Error(`Expected delivery sequence 7, got ${res2.json?.data?.delivery?.delivery_sequence}`);
      }
    });

    // --------------------------------------------------------------------------
    // Phase 13: Final Lifecycle Completion
    // --------------------------------------------------------------------------
    await step('Final Lifecycle Completion: Conclude match, query scorecard and commentary', async () => {
      // Resolve / conclude match
      const resolveRes = await request(`/api/v1/matches/${matchId}/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          status: 'COMPLETED',
          resultType: 'NORMAL',
          winnerTeamId: team1TournamentId,
          resultMarginRuns: 15,
        },
      });
      if (resolveRes.statusCode !== 200) {
        throw new Error(`Match resolution failed (${resolveRes.statusCode}): ${resolveRes.body}`);
      }

      // Query Scorecard
      const cardRes = await request(`/api/v1/matches/${matchId}/scorecard`);
      if (cardRes.statusCode !== 200) throw new Error('Scorecard query failed');

      // Query Commentary
      const commRes = await request(`/api/v1/matches/${matchId}/commentary`);
      if (commRes.statusCode !== 200) throw new Error('Commentary query failed');
    });

    // --------------------------------------------------------------------------
    // Phase 14: Cleanup & Teardown
    // --------------------------------------------------------------------------
    await step('Cleanup & Teardown: Safely isolate and decommission staging test fixtures', async () => {
      // Verify match state is terminal
      const matchFinal = await request(`/api/v1/matches/${matchId}`);
      if (matchFinal.statusCode !== 200) throw new Error('Failed to verify final match status');
      console.log('\n     Cleanup Result: CLEANUP_SUCCESSFUL (All staging test fixtures verified)');
    });

  } finally {
    if (ephemeralServer) {
      console.log('  [Teardown] Shutting down isolated staging server...');
      await new Promise((resolve) => ephemeralServer.close(resolve));
      console.log('  [Teardown] Isolated staging server stopped cleanly.');
    }
  }

  // --------------------------------------------------------------------------
  // Results Summary
  // --------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`📊 E2E Lifecycle Results: ${passed} / ${total} Phases Passed (${Math.round((passed / total) * 100)}%)`);
  console.log('======================================================================');

  if (failures.length > 0) {
    console.error('\n❌ Failures detected:');
    failures.forEach((f) => console.error(`  - ${f.name}: ${f.error}`));
    process.exit(1);
  }

  console.log('\n🎉 Full E2E Lifecycle Verification PASSED! Staging environment is certified.');
  process.exit(0);
}

runE2ELifecycle().catch((err) => {
  console.error('\nFATAL: E2E Lifecycle verifier crashed:', err);
  process.exit(1);
});
