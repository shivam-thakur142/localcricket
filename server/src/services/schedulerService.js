// ====================================================================
// SCHEDULER SERVICE: CONCURRENCY-SAFE FIXTURE SCHEDULING & CLASH DETECTION
// ====================================================================

import { ApiError } from '../utils/ApiError.js';

export function hashStringToBigInt(str) {
  let hash = 0n;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31n + BigInt(str.charCodeAt(i))) & 0x7fffffffffffffffn;
  }
  return hash.toString();
}

export class SchedulerService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Helper: Calculate frozen estimated duration snapshot in minutes
   * Formula: max(60, (overs_quota * 2 * 4.2) + 20)
   */
  calculateEstimatedDuration(oversQuota, customDurationMinutes = null) {
    if (customDurationMinutes && Number.isInteger(Number(customDurationMinutes))) {
      return Math.max(60, Number(customDurationMinutes));
    }
    const quota = Number(oversQuota) || 20;
    return Math.max(60, Math.round((quota * 2 * 4.2) + 20));
  }

  /**
   * Check for scheduling conflicts with transaction-level advisory locks
   * Checks global team overlap and tournament-owned venue overlap.
   */
  async checkClashes(client, {
    globalTeamAId,
    globalTeamBId,
    venueId,
    startTime,
    durationMinutes,
    excludeMatchId = null,
  }) {
    const start = new Date(startTime);
    const end = new Date(start.getTime() + durationMinutes * 60000);

    // 1. Global Team A Concurrency Clash
    const teamAConflictRes = await client.query(
      `SELECT m.id, m.match_number, m.tournament_id, m.scheduled_start_time, m.estimated_duration_minutes,
              t.name as tournament_name, t_a.name as team_a_name, t_b.name as team_b_name
       FROM matches m
       JOIN tournaments t ON m.tournament_id = t.id
       JOIN tournament_teams tt_a ON m.team_a_id = tt_a.id
       JOIN tournament_teams tt_b ON m.team_b_id = tt_b.id
       JOIN teams t_a ON tt_a.team_id = t_a.id
       JOIN teams t_b ON tt_b.team_id = t_b.id
       WHERE m.status IN ('SCHEDULED', 'TOSS_DONE', 'IN_PROGRESS', 'INNINGS_BREAK')
         AND (tt_a.team_id = $1 OR tt_b.team_id = $1)
         AND ($2::uuid IS NULL OR m.id <> $2)
         AND (
           m.scheduled_start_time < $4 AND
           (m.scheduled_start_time + (COALESCE(m.estimated_duration_minutes, 180) * INTERVAL '1 minute')) > $3
         )
       FOR SHARE;`,
      [globalTeamAId, excludeMatchId, start.toISOString(), end.toISOString()]
    );

    if (teamAConflictRes.rows.length > 0) {
      const conf = teamAConflictRes.rows[0];
      throw ApiError.conflict(
        `Team scheduling conflict: Team is already participating in Match #${conf.match_number} (${conf.tournament_name}) during this time window`
      );
    }

    // 2. Global Team B Concurrency Clash
    const teamBConflictRes = await client.query(
      `SELECT m.id, m.match_number, m.tournament_id, m.scheduled_start_time, m.estimated_duration_minutes,
              t.name as tournament_name, t_a.name as team_a_name, t_b.name as team_b_name
       FROM matches m
       JOIN tournaments t ON m.tournament_id = t.id
       JOIN tournament_teams tt_a ON m.team_a_id = tt_a.id
       JOIN tournament_teams tt_b ON m.team_b_id = tt_b.id
       JOIN teams t_a ON tt_a.team_id = t_a.id
       JOIN teams t_b ON tt_b.team_id = t_b.id
       WHERE m.status IN ('SCHEDULED', 'TOSS_DONE', 'IN_PROGRESS', 'INNINGS_BREAK')
         AND (tt_a.team_id = $1 OR tt_b.team_id = $1)
         AND ($2::uuid IS NULL OR m.id <> $2)
         AND (
           m.scheduled_start_time < $4 AND
           (m.scheduled_start_time + (COALESCE(m.estimated_duration_minutes, 180) * INTERVAL '1 minute')) > $3
         )
       FOR SHARE;`,
      [globalTeamBId, excludeMatchId, start.toISOString(), end.toISOString()]
    );

    if (teamBConflictRes.rows.length > 0) {
      const conf = teamBConflictRes.rows[0];
      throw ApiError.conflict(
        `Team scheduling conflict: Team is already participating in Match #${conf.match_number} (${conf.tournament_name}) during this time window`
      );
    }

    // 3. Venue Concurrency Clash (if venue is assigned)
    if (venueId) {
      const venueConflictRes = await client.query(
        `SELECT m.id, m.match_number, m.tournament_id, v.name as venue_name, t.name as tournament_name
         FROM matches m
         JOIN tournaments t ON m.tournament_id = t.id
         JOIN venues v ON m.venue_id = v.id
         WHERE m.venue_id = $1
           AND m.status IN ('SCHEDULED', 'TOSS_DONE', 'IN_PROGRESS', 'INNINGS_BREAK')
           AND ($2::uuid IS NULL OR m.id <> $2)
           AND (
             m.scheduled_start_time < $4 AND
             (m.scheduled_start_time + (COALESCE(m.estimated_duration_minutes, 180) * INTERVAL '1 minute')) > $3
           )
         FOR SHARE;`,
        [venueId, excludeMatchId, start.toISOString(), end.toISOString()]
      );

      if (venueConflictRes.rows.length > 0) {
        const conf = venueConflictRes.rows[0];
        throw ApiError.conflict(
          `Venue scheduling conflict: ${conf.venue_name} is already booked for Match #${conf.match_number} (${conf.tournament_name}) during this time window`
        );
      }

      // 4. Venue Administrative Blackout Period Clash
      const tblCheck = await client.query("SELECT to_regclass('venue_blackouts') as tbl;");
      if (tblCheck.rows[0]?.tbl) {
        const blackoutRes = await client.query(
          `SELECT id, reason, start_time, end_time
           FROM venue_blackouts
           WHERE venue_id = $1
             AND (start_time, end_time) OVERLAPS ($2::timestamptz, $3::timestamptz)
           FOR SHARE;`,
          [venueId, start.toISOString(), end.toISOString()]
        );

        if (blackoutRes.rows.length > 0) {
          const blk = blackoutRes.rows[0];
          throw ApiError.conflict(
            `Venue scheduling conflict: Venue is unavailable due to an administrative blackout period (${blk.reason})`,
            'VENUE_BLACKOUT_CONFLICT'
          );
        }
      }
    }
  }

  /**
   * Schedule fixture with transaction-scoped advisory locks & audit logging
   */
  async scheduleMatch(tournamentId, data, actorUserId) {
    const {
      teamAId,
      teamBId,
      venueId = null,
      scheduledStartTime,
      stage = 'LEAGUE',
      customDurationMinutes = null,
    } = data;

    if (!teamAId || !teamBId || !scheduledStartTime) {
      throw ApiError.badRequest('teamAId, teamBId, and scheduledStartTime are required');
    }

    if (teamAId === teamBId) {
      throw ApiError.badRequest('teamAId and teamBId must be distinct');
    }

    const client = this.db;
    await client.query('BEGIN;');

    try {
      // 1. Resolve Tournament metadata & overs quota
      const tournRes = await client.query(
        `SELECT id, name, overs_per_innings, status FROM tournaments WHERE id = $1;`,
        [tournamentId]
      );
      if (tournRes.rows.length === 0) {
        throw ApiError.notFound('Tournament not found');
      }
      const tournament = tournRes.rows[0];

      // 2. Resolve Global Team IDs from tournament_teams
      const ttRes = await client.query(
        `SELECT id, team_id FROM tournament_teams WHERE id IN ($1, $2) AND tournament_id = $3;`,
        [teamAId, teamBId, tournamentId]
      );
      if (ttRes.rows.length < 2) {
        throw ApiError.badRequest('Both teams must be registered in this tournament');
      }

      const ttA = ttRes.rows.find((r) => r.id === teamAId);
      const ttB = ttRes.rows.find((r) => r.id === teamBId);
      const globalTeamAId = ttA.team_id;
      const globalTeamBId = ttB.team_id;

      // 3. Calculate frozen estimated duration snapshot
      const durationMinutes = this.calculateEstimatedDuration(
        tournament.overs_per_innings,
        customDurationMinutes
      );

      // 4. Acquire Transaction-Scoped Advisory Locks
      // Prevents concurrent requests from race-condition scheduling for the same resources
      const lockA = hashStringToBigInt(`schedule:team:${globalTeamAId}`);
      const lockB = hashStringToBigInt(`schedule:team:${globalTeamBId}`);
      await client.query(`SELECT pg_advisory_xact_lock(${lockA}), pg_advisory_xact_lock(${lockB});`);

      if (venueId) {
        const lockVenue = hashStringToBigInt(`schedule:venue:${venueId}`);
        await client.query(`SELECT pg_advisory_xact_lock(${lockVenue});`);
      }

      // 5. Check Clashes across global teams and venue
      await this.checkClashes(client, {
        globalTeamAId,
        globalTeamBId,
        venueId,
        startTime: scheduledStartTime,
        durationMinutes,
      });

      // 6. Get Next Match Number
      const numRes = await client.query(
        `SELECT COALESCE(MAX(match_number), 0) + 1 as next_num FROM matches WHERE tournament_id = $1;`,
        [tournamentId]
      );
      const nextMatchNumber = numRes.rows[0].next_num;

      // 7. Insert Match Record
      const insertMatchRes = await client.query(
        `INSERT INTO matches (
          tournament_id, match_number, stage, status, overs_quota,
          team_a_id, team_b_id, venue_id, scheduled_start_time, estimated_duration_minutes
        ) VALUES (
          $1, $2, $3, 'SCHEDULED', $4,
          $5, $6, $7, $8, $9
        ) RETURNING *;`,
        [
          tournamentId,
          nextMatchNumber,
          stage,
          tournament.overs_per_innings,
          teamAId,
          teamBId,
          venueId,
          scheduledStartTime,
          durationMinutes,
        ]
      );
      const newMatch = insertMatchRes.rows[0];

      // 8. Atomic Audit Log
      await client.query(
        `INSERT INTO tournament_operations_audit (
          tournament_id, match_id, entity_type, action, actor_user_id, reason, previous_state, new_state
        ) VALUES ($1, $2, 'MATCH', 'MATCH_SCHEDULED', $3, 'Initial fixture scheduling', NULL, $4);`,
        [
          tournamentId,
          newMatch.id,
          actorUserId,
          JSON.stringify({
            match_number: newMatch.match_number,
            team_a_id: teamAId,
            team_b_id: teamBId,
            venue_id: venueId,
            scheduled_start_time: scheduledStartTime,
            estimated_duration_minutes: durationMinutes,
          }),
        ]
      );

      await client.query('COMMIT;');
      return newMatch;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Reschedule fixture with transaction-scoped advisory locks, validation & audit logging
   */
  async rescheduleMatch(...args) {
    let tournamentId, matchId, data, actorUserId;
    if (args.length === 4) {
      [tournamentId, matchId, data, actorUserId] = args;
    } else {
      [matchId, data, actorUserId] = args;
    }

    const { scheduledStartTime, venueId, reason } = data || {};

    if (!scheduledStartTime) {
      throw ApiError.badRequest('scheduledStartTime is required');
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      throw ApiError.badRequest('A non-empty reason is mandatory for operational rescheduling');
    }

    const client = this.db;
    await client.query('BEGIN;');

    try {
      // 1. Fetch match and verify status
      let mRes;
      if (tournamentId) {
        mRes = await client.query(
          `SELECT m.*, tt_a.team_id as global_team_a_id, tt_b.team_id as global_team_b_id,
                  v.name as venue_name
           FROM matches m
           JOIN tournament_teams tt_a ON m.team_a_id = tt_a.id
           JOIN tournament_teams tt_b ON m.team_b_id = tt_b.id
           LEFT JOIN venues v ON m.venue_id = v.id
           WHERE m.id = $1 AND m.tournament_id = $2
           FOR UPDATE OF m;`,
          [matchId, tournamentId]
        );
      } else {
        mRes = await client.query(
          `SELECT m.*, tt_a.team_id as global_team_a_id, tt_b.team_id as global_team_b_id,
                  v.name as venue_name
           FROM matches m
           JOIN tournament_teams tt_a ON m.team_a_id = tt_a.id
           JOIN tournament_teams tt_b ON m.team_b_id = tt_b.id
           LEFT JOIN venues v ON m.venue_id = v.id
           WHERE m.id = $1
           FOR UPDATE OF m;`,
          [matchId]
        );
      }

      if (mRes.rows.length === 0) {
        throw ApiError.notFound('Match not found');
      }

      const match = mRes.rows[0];
      tournamentId = match.tournament_id;

      // Guard: Can only reschedule SCHEDULED matches
      if (match.status !== 'SCHEDULED') {
        throw ApiError.unprocessable(
          `Cannot reschedule match in '${match.status}' status. Only SCHEDULED fixtures can be rescheduled.`
        );
      }

      const effectiveVenueId = venueId !== undefined ? venueId : match.venue_id;
      const durationMinutes = match.estimated_duration_minutes || 180;

      // 2. Acquire Transaction-Scoped Advisory Locks
      const lockA = hashStringToBigInt(`schedule:team:${match.global_team_a_id}`);
      const lockB = hashStringToBigInt(`schedule:team:${match.global_team_b_id}`);
      await client.query(`SELECT pg_advisory_xact_lock(${lockA}), pg_advisory_xact_lock(${lockB});`);

      if (effectiveVenueId) {
        const lockVenue = hashStringToBigInt(`schedule:venue:${effectiveVenueId}`);
        await client.query(`SELECT pg_advisory_xact_lock(${lockVenue});`);
      }

      // 3. Check Clashes on new time/venue
      await this.checkClashes(client, {
        globalTeamAId: match.global_team_a_id,
        globalTeamBId: match.global_team_b_id,
        venueId: effectiveVenueId,
        startTime: scheduledStartTime,
        durationMinutes,
        excludeMatchId: matchId,
      });

      // 4. Update Match Record
      const updateRes = await client.query(
        `UPDATE matches
         SET scheduled_start_time = $1,
             venue_id = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *;`,
        [scheduledStartTime, effectiveVenueId, matchId]
      );
      const updatedMatch = updateRes.rows[0];

      // 5. Atomic Audit Log
      await client.query(
        `INSERT INTO tournament_operations_audit (
          tournament_id, match_id, entity_type, action, actor_user_id, reason, previous_state, new_state
        ) VALUES ($1, $2, 'MATCH', 'MATCH_RESCHEDULED', $3, $4, $5, $6);`,
        [
          tournamentId,
          matchId,
          actorUserId,
          reason.trim(),
          JSON.stringify({
            scheduled_start_time: match.scheduled_start_time,
            venue_id: match.venue_id,
            venue_name: match.venue_name,
          }),
          JSON.stringify({
            scheduled_start_time: updatedMatch.scheduled_start_time,
            venue_id: updatedMatch.venue_id,
          }),
        ]
      );

      await client.query('COMMIT;');
      return updatedMatch;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    }
  }
}
