// ====================================================================
// OFFICIAL SERVICE: MATCH OFFICIAL APPOINTMENTS & CONCURRENCY-SAFE CLASH GUARDS
// ====================================================================

import { ApiError } from '../utils/ApiError.js';

function hashStringToBigInt(str) {
  let hash = 0n;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31n + BigInt(str.charCodeAt(i))) & 0x7fffffffffffffffn;
  }
  return hash.toString();
}

export class OfficialService {
  constructor(db) {
    this.db = db;
  }

  async assignOfficial(...args) {
    let tournamentId, matchId, data, actorUserId;
    if (args.length === 4) {
      [tournamentId, matchId, data, actorUserId] = args;
    } else {
      [matchId, data, actorUserId] = args;
    }

    const { userId, role } = data || {};

    if (!userId || !role) {
      throw ApiError.badRequest('userId and role are required');
    }

    const validRoles = ['UMPIRE_1', 'UMPIRE_2', 'THIRD_UMPIRE', 'TV_UMPIRE', 'MATCH_REFEREE'];
    if (!validRoles.includes(role)) {
      throw ApiError.badRequest(`Invalid official role. Must be one of: ${validRoles.join(', ')}`);
    }

    const client = this.db;
    await client.query('BEGIN;');

    try {
      // 1. Fetch match and verify tournament association
      let mRes;
      if (tournamentId) {
        mRes = await client.query(
          `SELECT id, tournament_id, scheduled_start_time, estimated_duration_minutes, status, match_number
           FROM matches
           WHERE id = $1 AND tournament_id = $2;`,
          [matchId, tournamentId]
        );
      } else {
        mRes = await client.query(
          `SELECT id, tournament_id, scheduled_start_time, estimated_duration_minutes, status, match_number
           FROM matches
           WHERE id = $1;`,
          [matchId]
        );
      }

      if (mRes.rows.length === 0) {
        throw ApiError.notFound('Match not found');
      }

      const match = mRes.rows[0];
      tournamentId = match.tournament_id;
      const durationMinutes = match.estimated_duration_minutes || 180;
      const start = new Date(match.scheduled_start_time);
      const end = new Date(start.getTime() + durationMinutes * 60000);

      // 2. Validate Official Eligibility from tournament_members
      const memRes = await client.query(
        `SELECT tm.role, u.full_name
         FROM tournament_members tm
         JOIN users u ON tm.user_id = u.id
         WHERE tm.tournament_id = $1 AND tm.user_id = $2;`,
        [tournamentId, userId]
      );

      if (memRes.rows.length === 0) {
        throw ApiError.unprocessable('User must be an enrolled member of the tournament to be appointed as an official');
      }

      const member = memRes.rows[0];
      const allowedRoles =
        role === 'MATCH_REFEREE'
          ? ['REFEREE', 'ORGANIZER']
          : ['UMPIRE', 'ORGANIZER'];

      if (!allowedRoles.includes(member.role)) {
        throw ApiError.unprocessable(
          `User has role '${member.role}', but role '${role}' requires a tournament member with role: ${allowedRoles.join(' or ')}`
        );
      }

      // 3. Acquire Advisory Transaction Lock on the official user
      const lockOfficial = hashStringToBigInt(`official:assignment:${userId}`);
      await client.query(`SELECT pg_advisory_xact_lock(${lockOfficial});`);

      // 4. Check Global Official Clash across ALL tournaments
      const clashRes = await client.query(
        `SELECT mo.id, m.match_number, t.name as tournament_name
         FROM match_officials mo
         JOIN matches m ON mo.match_id = m.id
         JOIN tournaments t ON m.tournament_id = t.id
         WHERE mo.user_id = $1
           AND m.id <> $2
           AND m.status IN ('SCHEDULED', 'TOSS_DONE', 'IN_PROGRESS', 'INNINGS_BREAK')
           AND (
             m.scheduled_start_time < $4 AND
             (m.scheduled_start_time + (COALESCE(m.estimated_duration_minutes, 180) * INTERVAL '1 minute')) > $3
           )
         FOR SHARE;`,
        [userId, matchId, start.toISOString(), end.toISOString()]
      );

      if (clashRes.rows.length > 0) {
        const conf = clashRes.rows[0];
        throw ApiError.conflict(
          `Official scheduling conflict: ${member.full_name} is already assigned to officiate Match #${conf.match_number} (${conf.tournament_name}) during this time window`
        );
      }

      // 5. Insert Match Official record
      const insertRes = await client.query(
        `INSERT INTO match_officials (
          match_id, tournament_id, user_id, role, assigned_by_user_id
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *;`,
        [matchId, tournamentId, userId, role, actorUserId]
      );
      const official = insertRes.rows[0];

      // 6. Audit Trail
      await client.query(
        `INSERT INTO tournament_operations_audit (
          tournament_id, match_id, entity_type, action, actor_user_id, reason, previous_state, new_state
        ) VALUES ($1, $2, 'OFFICIAL', 'OFFICIAL_ASSIGNED', $3, 'Official match appointment', NULL, $4);`,
        [
          tournamentId,
          matchId,
          actorUserId,
          JSON.stringify({
            role,
            user_id: userId,
            full_name: member.full_name,
            match_number: match.match_number,
          }),
        ]
      );

      await client.query('COMMIT;');

      return {
        ...official,
        full_name: member.full_name,
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      if (err.code === '23505') {
        throw ApiError.conflict(`Role '${role}' is already assigned or this user is already an official for this match`);
      }
      throw err;
    }
  }

  /**
   * Remove match official appointment with reason and audit log
   * Supports finding by assignment ID (UUID) or Role name
   */
  async removeOfficial(...args) {
    let tournamentId, matchId, officialIdOrRole, reason, actorUserId;
    if (args.length === 5) {
      [tournamentId, matchId, officialIdOrRole, reason, actorUserId] = args;
    } else {
      [matchId, officialIdOrRole, reason, actorUserId] = args;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      throw ApiError.badRequest('A non-empty reason is mandatory for official removal');
    }

    const client = this.db;
    await client.query('BEGIN;');

    try {
      const existingRes = await client.query(
        `SELECT mo.*, u.full_name
         FROM match_officials mo
         JOIN users u ON mo.user_id = u.id
         WHERE mo.match_id = $1 AND (mo.id::text = $2 OR mo.role::text = $2);`,
        [matchId, officialIdOrRole]
      );

      if (existingRes.rows.length === 0) {
        throw ApiError.notFound(`No official assignment found matching '${officialIdOrRole}' for this match`);
      }

      const existing = existingRes.rows[0];
      tournamentId = tournamentId || existing.tournament_id;

      await client.query(
        `DELETE FROM match_officials WHERE id = $1;`,
        [existing.id]
      );

      await client.query(
        `INSERT INTO tournament_operations_audit (
          tournament_id, match_id, entity_type, action, actor_user_id, reason, previous_state, new_state
        ) VALUES ($1, $2, 'OFFICIAL', 'OFFICIAL_REMOVED', $3, $4, $5, 'null'::jsonb);`,
        [
          tournamentId,
          matchId,
          actorUserId,
          reason.trim(),
          JSON.stringify({
            role: existing.role,
            user_id: existing.user_id,
            full_name: existing.full_name,
            reason: reason.trim(),
          }),
        ]
      );

      await client.query('COMMIT;');
      return { success: true, removedRole: existing.role, removedId: existing.id };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    }
  }

  /**
   * List all match officials for a match
   */
  async getMatchOfficials(matchId) {
    const res = await this.db.query(
      `SELECT mo.id, mo.match_id, mo.role, mo.user_id, u.full_name, u.email, mo.created_at
       FROM match_officials mo
       JOIN users u ON mo.user_id = u.id
       WHERE mo.match_id = $1
       ORDER BY mo.created_at ASC;`,
      [matchId]
    );
    return res.rows;
  }
}
