// ====================================================================
// ADMIN SERVICE: SUPER ADMIN PLATFORM GOVERNANCE & TELEMETRY
// ====================================================================

import { ApiError } from '../utils/ApiError.js';
import { hashStringToBigInt } from './schedulerService.js';

export class AdminService {
  constructor(db) {
    this.db = db;
  }

  async getClient() {
    if (typeof this.db.connect === 'function') {
      return await this.db.connect();
    }
    return this.db;
  }

  releaseClient(client) {
    if (client && typeof client.release === 'function' && client !== this.db) {
      client.release();
    }
  }

  /**
   * Platform-wide telemetry & system health metrics
   */
  async getPlatformOverview() {
    const t0 = Date.now();
    await this.db.query('SELECT 1;');
    const latencyMs = Date.now() - t0;

    const [
      usersRes,
      tournamentsRes,
      matchesRes,
      liveMatchesRes,
      ballsRes,
      lockedRes,
      suspendedRes,
      adminsRes,
      sessionsRes,
    ] = await Promise.all([
      this.db.query('SELECT count(*)::int as total FROM users;'),
      this.db.query('SELECT count(*)::int as total FROM tournaments;'),
      this.db.query('SELECT count(*)::int as total FROM matches;'),
      this.db.query(
        "SELECT count(*)::int as total FROM matches WHERE status IN ('IN_PROGRESS', 'INNINGS_BREAK', 'TOSS_DONE');"
      ),
      this.db.query('SELECT count(*)::int as total FROM deliveries WHERE is_reverted = FALSE;'),
      this.db.query('SELECT count(*)::int as total FROM user_credentials WHERE locked_until > NOW();'),
      this.db.query('SELECT count(*)::int as total FROM users WHERE is_suspended = TRUE;'),
      this.db.query("SELECT count(*)::int as total FROM users WHERE global_role = 'SUPER_ADMIN' AND is_suspended = FALSE;"),
      this.db.query('SELECT count(*)::int as total FROM user_sessions WHERE is_revoked = FALSE AND expires_at > NOW();'),
    ]);

    const tournamentStatusRes = await this.db.query(
      'SELECT status, count(*)::int as count FROM tournaments GROUP BY status;'
    );
    const tournamentsByStatus = tournamentStatusRes.rows.reduce((acc, r) => {
      acc[r.status] = r.count;
      return acc;
    }, {});

    const matchStatusRes = await this.db.query(
      'SELECT status, count(*)::int as count FROM matches GROUP BY status;'
    );
    const matchesByStatus = matchStatusRes.rows.reduce((acc, r) => {
      acc[r.status] = r.count;
      return acc;
    }, {});

    return {
      stats: {
        totalUsers: usersRes.rows[0].total,
        totalTournaments: tournamentsRes.rows[0].total,
        totalMatches: matchesRes.rows[0].total,
        liveMatchesCount: liveMatchesRes.rows[0].total,
        totalBallsBowled: ballsRes.rows[0].total,
        lockedAccountsCount: lockedRes.rows[0].total,
        suspendedUsersCount: suspendedRes.rows[0].total,
        activeSuperAdminsCount: adminsRes.rows[0].total,
        activeSessionsCount: sessionsRes.rows[0].total,
        tournamentsByStatus,
        matchesByStatus,
      },
      diagnostics: {
        dbStatus: 'HEALTHY',
        latencyMs,
        uptimeSeconds: Math.floor(process.uptime()),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        nodeEnv: process.env.NODE_ENV || 'development',
      },
    };
  }

  /**
   * Cross-tournament live matches monitor (authoritative snapshot)
   */
  async getLiveMatches({ page = 1, limit = 50 } = {}) {
    const validPage = Math.max(1, parseInt(page, 10) || 1);
    const validLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (validPage - 1) * validLimit;

    const countRes = await this.db.query(
      "SELECT count(*)::int as total FROM matches WHERE status IN ('IN_PROGRESS', 'INNINGS_BREAK', 'TOSS_DONE');"
    );
    const total = countRes.rows[0].total;

    const res = await this.db.query(
      `SELECT m.id, m.match_number, m.status, m.stage, m.overs_quota, m.scheduled_start_time,
              t.id as tournament_id, t.name as tournament_name, t.city as tournament_city,
              t_a.name as team_a_name, t_a.short_name as team_a_short,
              t_b.name as team_b_name, t_b.short_name as team_b_short,
              v.name as venue_name,
              i.id as current_innings_id, i.innings_number, i.total_runs, i.wickets_lost,
              i.overs_completed, i.legal_balls_in_over,
              bat_team.name as batting_team_name,
              bowl_team.name as bowling_team_name
       FROM matches m
       JOIN tournaments t ON m.tournament_id = t.id
       JOIN tournament_teams tt_a ON m.team_a_id = tt_a.id
       JOIN tournament_teams tt_b ON m.team_b_id = tt_b.id
       JOIN teams t_a ON tt_a.team_id = t_a.id
       JOIN teams t_b ON tt_b.team_id = t_b.id
       LEFT JOIN venues v ON m.venue_id = v.id
       LEFT JOIN innings i ON i.match_id = m.id AND i.status = 'IN_PROGRESS'
       LEFT JOIN tournament_teams bat_tt ON i.batting_team_id = bat_tt.id
       LEFT JOIN teams bat_team ON bat_tt.team_id = bat_team.id
       LEFT JOIN tournament_teams bowl_tt ON i.bowling_team_id = bowl_tt.id
       LEFT JOIN teams bowl_team ON bowl_tt.team_id = bowl_team.id
       WHERE m.status IN ('IN_PROGRESS', 'INNINGS_BREAK', 'TOSS_DONE')
       ORDER BY m.status ASC, m.created_at DESC, m.id DESC
       LIMIT $1 OFFSET $2;`,
      [validLimit, offset]
    );

    return {
      matches: res.rows,
      pagination: {
        total,
        page: validPage,
        limit: validLimit,
        totalPages: Math.ceil(total / validLimit) || 1,
      },
    };
  }

  /**
   * List all tournaments with multi-attribute filtering & pagination
   */
  async listTournaments({ status, city, search, page = 1, limit = 25 } = {}) {
    const validPage = Math.max(1, parseInt(page, 10) || 1);
    const validLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const offset = (validPage - 1) * validLimit;

    const conditions = [];
    const params = [];

    if (status && status !== 'ALL') {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }

    if (city) {
      params.push(`%${city}%`);
      conditions.push(`t.city ILIKE $${params.length}`);
    }

    if (search) {
      params.push(`%${search.trim().slice(0, 100)}%`);
      conditions.push(`(t.name ILIKE $${params.length} OR t.short_name ILIKE $${params.length} OR t.city ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.db.query(
      `SELECT count(*)::int as total FROM tournaments t ${whereClause};`,
      params
    );
    const total = countRes.rows[0].total;

    params.push(validLimit, offset);
    const res = await this.db.query(
      `SELECT t.id, t.name, t.short_name, t.slug, t.city, t.format, t.ball_type,
              t.status, t.is_frozen, t.frozen_reason, t.frozen_at,
              t.created_by_user_id, u.full_name as organizer_name, u.email as organizer_email,
              t.created_at,
              (SELECT count(*)::int FROM tournament_teams tt WHERE tt.tournament_id = t.id) as team_count,
              (SELECT count(*)::int FROM matches m WHERE m.tournament_id = t.id) as match_count
       FROM tournaments t
       LEFT JOIN users u ON t.created_by_user_id = u.id
       ${whereClause}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length};`,
      params
    );

    return {
      tournaments: res.rows,
      pagination: {
        total,
        page: validPage,
        limit: validLimit,
        totalPages: Math.ceil(total / validLimit) || 1,
      },
    };
  }

  /**
   * Freeze or unfreeze tournament with mandatory audit log
   */
  async freezeTournament(tournamentId, { isFrozen, reason }, adminUserId, ipAddress = null) {
    if (!tournamentId) throw ApiError.badRequest('Tournament ID is required', 'INVALID_UUID');
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      throw ApiError.badRequest(
        'A detailed reason of at least 5 characters is required for administrative audit',
        'AUDIT_REASON_REQUIRED'
      );
    }

    const client = await this.getClient();
    try {
      await client.query('BEGIN;');

      const tournRes = await client.query(
        'SELECT id, name, is_frozen, frozen_reason FROM tournaments WHERE id = $1 FOR UPDATE;',
        [tournamentId]
      );

      if (tournRes.rows.length === 0) {
        throw ApiError.notFound(`Tournament ${tournamentId} not found`, 'TARGET_NOT_FOUND');
      }

      const prev = tournRes.rows[0];
      const action = isFrozen ? 'TOURNAMENT_FROZEN' : 'TOURNAMENT_UNFROZEN';

      const updateRes = await client.query(
        `UPDATE tournaments
         SET is_frozen = $1,
             frozen_reason = CASE WHEN $1 THEN $2 ELSE NULL END,
             frozen_at = CASE WHEN $1 THEN NOW() ELSE NULL END
         WHERE id = $3
         RETURNING id, name, is_frozen, frozen_reason, frozen_at;`,
        [!!isFrozen, reason.trim(), tournamentId]
      );

      await client.query(
        `INSERT INTO platform_audit_logs (
           admin_user_id, action, target_entity_type, target_entity_id, reason,
           previous_state, new_state, ip_address
         ) VALUES ($1, $2, 'TOURNAMENT', $3, $4, $5, $6, $7);`,
        [
          adminUserId,
          action,
          tournamentId,
          reason.trim(),
          JSON.stringify({ isFrozen: prev.is_frozen, reason: prev.frozen_reason }),
          JSON.stringify(updateRes.rows[0]),
          ipAddress,
        ]
      );

      await client.query('COMMIT;');
      return {
        tournament: updateRes.rows[0],
        message: isFrozen
          ? `Tournament "${prev.name}" has been frozen. All live scoring and state mutations are locked.`
          : `Tournament "${prev.name}" has been unfrozen. Normal operations restored.`,
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Transfer tournament root creator ownership to another active user
   */
  async transferTournamentOwnership(tournamentId, { newOwnerUserId, reason }, adminUserId, ipAddress = null) {
    if (!tournamentId || !newOwnerUserId) {
      throw ApiError.badRequest('Both tournamentId and newOwnerUserId are required', 'INVALID_UUID');
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      throw ApiError.badRequest(
        'A detailed reason of at least 5 characters is required for administrative audit',
        'AUDIT_REASON_REQUIRED'
      );
    }

    const client = await this.getClient();
    try {
      await client.query('BEGIN;');

      const tournRes = await client.query(
        'SELECT id, name, created_by_user_id FROM tournaments WHERE id = $1 FOR UPDATE;',
        [tournamentId]
      );
      if (tournRes.rows.length === 0) {
        throw ApiError.notFound(`Tournament ${tournamentId} not found`, 'TARGET_NOT_FOUND');
      }
      const tourn = tournRes.rows[0];

      if (tourn.created_by_user_id === newOwnerUserId) {
        throw ApiError.badRequest('Target user is already the tournament owner', 'ALREADY_TOURNAMENT_OWNER');
      }

      const userRes = await client.query(
        'SELECT id, full_name, email, is_suspended FROM users WHERE id = $1 FOR UPDATE;',
        [newOwnerUserId]
      );
      if (userRes.rows.length === 0) {
        throw ApiError.notFound(`Target user ${newOwnerUserId} not found`, 'TARGET_NOT_FOUND');
      }
      const newOwner = userRes.rows[0];
      if (newOwner.is_suspended) {
        throw ApiError.badRequest('Cannot transfer ownership to a suspended user', 'ACCOUNT_SUSPENDED');
      }

      // 1. Reassign created_by_user_id
      await client.query('UPDATE tournaments SET created_by_user_id = $1 WHERE id = $2;', [newOwnerUserId, tournamentId]);

      // 2. Upsert new owner in tournament_members as ORGANIZER
      await client.query(
        `INSERT INTO tournament_members (tournament_id, user_id, role)
         VALUES ($1, $2, 'ORGANIZER')
         ON CONFLICT (tournament_id, user_id) DO UPDATE SET role = 'ORGANIZER';`,
        [tournamentId, newOwnerUserId]
      );

      // 3. Retain previous owner as ORGANIZER member without silent demotion

      // 4. Record audit log
      await client.query(
        `INSERT INTO platform_audit_logs (
           admin_user_id, action, target_entity_type, target_entity_id, reason,
           previous_state, new_state, ip_address
         ) VALUES ($1, 'TOURNAMENT_OWNERSHIP_TRANSFERRED', 'TOURNAMENT', $2, $3, $4, $5, $6);`,
        [
          adminUserId,
          tournamentId,
          reason.trim(),
          JSON.stringify({ previousOwnerId: tourn.created_by_user_id }),
          JSON.stringify({ newOwnerId: newOwnerUserId, newOwnerName: newOwner.full_name }),
          ipAddress,
        ]
      );

      await client.query('COMMIT;');
      return {
        success: true,
        message: `Tournament "${tourn.name}" ownership transferred to ${newOwner.full_name}`,
        tournamentId,
        newOwnerUserId,
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * List global users with status filtering & pagination
   */
  async listUsers({ role, isSuspended, isLocked, search, page = 1, limit = 25 } = {}) {
    const validPage = Math.max(1, parseInt(page, 10) || 1);
    const validLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const offset = (validPage - 1) * validLimit;

    const conditions = [];
    const params = [];

    if (role && role !== 'ALL') {
      params.push(role);
      conditions.push(`u.global_role = $${params.length}`);
    }

    if (isSuspended !== undefined && isSuspended !== '') {
      params.push(isSuspended === 'true' || isSuspended === true);
      conditions.push(`u.is_suspended = $${params.length}`);
    }

    if (isLocked === 'true' || isLocked === true) {
      conditions.push(`uc.locked_until > NOW()`);
    }

    if (search) {
      params.push(`%${search.trim().slice(0, 100)}%`);
      conditions.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.db.query(
      `SELECT count(*)::int as total
       FROM users u
       LEFT JOIN user_credentials uc ON u.id = uc.user_id
       ${whereClause};`,
      params
    );
    const total = countRes.rows[0].total;

    params.push(validLimit, offset);
    const res = await this.db.query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.global_role,
              u.is_suspended, u.suspension_reason, u.suspended_at,
              u.created_at,
              COALESCE(uc.failed_login_attempts, 0) as failed_login_attempts,
              uc.locked_until,
              (CASE WHEN uc.locked_until > NOW() THEN TRUE ELSE FALSE END) as is_locked,
              (SELECT count(*)::int FROM tournament_members tm WHERE tm.user_id = u.id) as memberships_count
       FROM users u
       LEFT JOIN user_credentials uc ON u.id = uc.user_id
       ${whereClause}
       ORDER BY u.created_at DESC, u.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length};`,
      params
    );

    return {
      users: res.rows,
      pagination: {
        total,
        page: validPage,
        limit: validLimit,
        totalPages: Math.ceil(total / validLimit) || 1,
      },
    };
  }

  /**
   * Unlock account lockout from failed login attempts
   */
  async unlockUserAccount(targetUserId, { reason }, adminUserId, ipAddress = null) {
    if (!targetUserId) throw ApiError.badRequest('Target user ID is required', 'INVALID_UUID');
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      throw ApiError.badRequest(
        'A detailed reason of at least 5 characters is required for administrative audit',
        'AUDIT_REASON_REQUIRED'
      );
    }

    const client = await this.getClient();
    try {
      await client.query('BEGIN;');

      const uRes = await client.query('SELECT id, email, full_name FROM users WHERE id = $1 FOR UPDATE;', [targetUserId]);
      if (uRes.rows.length === 0) {
        throw ApiError.notFound(`User ${targetUserId} not found`, 'TARGET_NOT_FOUND');
      }

      await client.query(
        `UPDATE user_credentials
         SET failed_login_attempts = 0, locked_until = NULL
         WHERE user_id = $1;`,
        [targetUserId]
      );

      await client.query(
        `INSERT INTO platform_audit_logs (
           admin_user_id, action, target_entity_type, target_entity_id, reason,
           previous_state, new_state, ip_address
         ) VALUES ($1, 'USER_ACCOUNT_UNLOCKED', 'USER', $2, $3, $4, $5, $6);`,
        [
          adminUserId,
          targetUserId,
          reason.trim(),
          JSON.stringify({ targetUserId }),
          JSON.stringify({ unlocked: true, failed_login_attempts: 0 }),
          ipAddress,
        ]
      );

      await client.query('COMMIT;');
      return { success: true, message: `Account lockout cleared for ${uRes.rows[0].email}` };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Suspend or reactivate user account with session invalidation
   */
  async updateUserStatus(targetUserId, { isSuspended, reason }, adminUserId, ipAddress = null) {
    if (!targetUserId) throw ApiError.badRequest('Target user ID is required', 'INVALID_UUID');
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      throw ApiError.badRequest(
        'A detailed reason of at least 5 characters is required for administrative audit',
        'AUDIT_REASON_REQUIRED'
      );
    }

    const client = await this.getClient();
    try {
      await client.query('BEGIN;');

      const uRes = await client.query(
        'SELECT id, email, full_name, global_role, is_suspended FROM users WHERE id = $1 FOR UPDATE;',
        [targetUserId]
      );
      if (uRes.rows.length === 0) {
        throw ApiError.notFound(`User ${targetUserId} not found`, 'TARGET_NOT_FOUND');
      }
      const user = uRes.rows[0];

      // Last Active Super Admin Protection: Cannot suspend the last active Super Admin
      if (isSuspended && user.global_role === 'SUPER_ADMIN') {
        const adminCountRes = await client.query(
          "SELECT id FROM users WHERE global_role = 'SUPER_ADMIN' AND is_suspended = FALSE FOR UPDATE;"
        );
        if (adminCountRes.rows.length <= 1) {
          throw ApiError.conflict(
            'Cannot suspend the sole active Super Administrator on the platform',
            'LAST_ACTIVE_SUPER_ADMIN_PROTECTION'
          );
        }
      }

      const action = isSuspended ? 'USER_SUSPENDED' : 'USER_REACTIVATED';

      await client.query(
        `UPDATE users
         SET is_suspended = $1,
             suspension_reason = CASE WHEN $1 THEN $2 ELSE NULL END,
             suspended_at = CASE WHEN $1 THEN NOW() ELSE NULL END
         WHERE id = $3;`,
        [!!isSuspended, reason.trim(), targetUserId]
      );

      // If suspended, atomically revoke all active refresh session families
      if (isSuspended) {
        await client.query(
          `UPDATE user_sessions
           SET is_revoked = TRUE, revocation_reason = 'USER_SUSPENDED'
           WHERE user_id = $1 AND is_revoked = FALSE;`,
          [targetUserId]
        );
      }

      await client.query(
        `INSERT INTO platform_audit_logs (
           admin_user_id, action, target_entity_type, target_entity_id, reason,
           previous_state, new_state, ip_address
         ) VALUES ($1, $2, 'USER', $3, $4, $5, $6, $7);`,
        [
          adminUserId,
          action,
          targetUserId,
          reason.trim(),
          JSON.stringify({ isSuspended: user.is_suspended }),
          JSON.stringify({ isSuspended: !!isSuspended, reason: reason.trim() }),
          ipAddress,
        ]
      );

      await client.query('COMMIT;');
      return {
        success: true,
        message: isSuspended
          ? `User ${user.email} has been suspended and all active sessions revoked.`
          : `User ${user.email} has been reactivated.`,
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Promote or demote global user role with last-active-admin protection
   */
  async updateUserRole(targetUserId, { globalRole, reason }, adminUserId, ipAddress = null) {
    if (!targetUserId) throw ApiError.badRequest('Target user ID is required', 'INVALID_UUID');
    if (!['SUPER_ADMIN', 'USER'].includes(globalRole)) {
      throw ApiError.badRequest("Role must be 'SUPER_ADMIN' or 'USER'", 'BAD_REQUEST');
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      throw ApiError.badRequest(
        'A detailed reason of at least 5 characters is required for administrative audit',
        'AUDIT_REASON_REQUIRED'
      );
    }

    const client = await this.getClient();
    try {
      await client.query('BEGIN;');

      const uRes = await client.query(
        'SELECT id, email, full_name, global_role, is_suspended FROM users WHERE id = $1 FOR UPDATE;',
        [targetUserId]
      );
      if (uRes.rows.length === 0) {
        throw ApiError.notFound(`User ${targetUserId} not found`, 'TARGET_NOT_FOUND');
      }
      const user = uRes.rows[0];

      // Last Active Super Admin Protection: Cannot demote the last active Super Admin
      if (user.global_role === 'SUPER_ADMIN' && globalRole === 'USER') {
        const adminCountRes = await client.query(
          "SELECT id FROM users WHERE global_role = 'SUPER_ADMIN' AND is_suspended = FALSE FOR UPDATE;"
        );
        if (adminCountRes.rows.length <= 1) {
          throw ApiError.conflict(
            'Cannot demote the sole active Super Administrator on the platform',
            'LAST_ACTIVE_SUPER_ADMIN_PROTECTION'
          );
        }
      }

      const action = globalRole === 'SUPER_ADMIN' ? 'USER_ROLE_PROMOTED' : 'USER_ROLE_DEMOTED';

      await client.query('UPDATE users SET global_role = $1 WHERE id = $2;', [globalRole, targetUserId]);

      // Revoke all active sessions so user must refresh/re-login with updated claims
      await client.query(
        `UPDATE user_sessions
         SET is_revoked = TRUE, revocation_reason = 'ROLE_CHANGED'
         WHERE user_id = $1 AND is_revoked = FALSE;`,
        [targetUserId]
      );

      await client.query(
        `INSERT INTO platform_audit_logs (
           admin_user_id, action, target_entity_type, target_entity_id, reason,
           previous_state, new_state, ip_address
         ) VALUES ($1, $2, 'USER', $3, $4, $5, $6, $7);`,
        [
          adminUserId,
          action,
          targetUserId,
          reason.trim(),
          JSON.stringify({ globalRole: user.global_role }),
          JSON.stringify({ globalRole }),
          ipAddress,
        ]
      );

      await client.query('COMMIT;');
      return {
        success: true,
        message: `User ${user.email} role updated to ${globalRole}`,
        userId: targetUserId,
        globalRole,
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * List global teams with verification status & pagination
   */
  async listTeams({ search, isVerified, page = 1, limit = 25 } = {}) {
    const validPage = Math.max(1, parseInt(page, 10) || 1);
    const validLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const offset = (validPage - 1) * validLimit;

    const conditions = [];
    const params = [];

    if (isVerified !== undefined && isVerified !== '') {
      params.push(isVerified === 'true' || isVerified === true);
      conditions.push(`t.is_verified = $${params.length}`);
    }

    if (search) {
      params.push(`%${search.trim().slice(0, 100)}%`);
      conditions.push(`(t.name ILIKE $${params.length} OR t.short_name ILIKE $${params.length} OR t.city ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.db.query(`SELECT count(*)::int as total FROM teams t ${whereClause};`, params);
    const total = countRes.rows[0].total;

    params.push(validLimit, offset);
    const res = await this.db.query(
      `SELECT t.id, t.name, t.short_name, t.city, t.logo_url, t.is_verified, t.verified_at, t.created_at,
              (SELECT count(*)::int FROM tournament_teams tt WHERE tt.team_id = t.id) as tournaments_entered_count
       FROM teams t
       ${whereClause}
       ORDER BY t.name ASC, t.id ASC
       LIMIT $${params.length - 1} OFFSET $${params.length};`,
      params
    );

    return {
      teams: res.rows,
      pagination: {
        total,
        page: validPage,
        limit: validLimit,
        totalPages: Math.ceil(total / validLimit) || 1,
      },
    };
  }

  /**
   * Toggle global team verification badge
   */
  async toggleTeamVerification(teamId, { isVerified, reason }, adminUserId, ipAddress = null) {
    if (!teamId) throw ApiError.badRequest('Team ID is required', 'INVALID_UUID');
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      throw ApiError.badRequest(
        'A detailed reason of at least 5 characters is required for administrative audit',
        'AUDIT_REASON_REQUIRED'
      );
    }

    const client = await this.getClient();
    try {
      await client.query('BEGIN;');

      const tRes = await client.query('SELECT id, name, is_verified FROM teams WHERE id = $1 FOR UPDATE;', [teamId]);
      if (tRes.rows.length === 0) {
        throw ApiError.notFound(`Team ${teamId} not found`, 'TARGET_NOT_FOUND');
      }
      const prev = tRes.rows[0];

      const updateRes = await client.query(
        `UPDATE teams
         SET is_verified = $1, verified_at = CASE WHEN $1 THEN NOW() ELSE NULL END
         WHERE id = $2
         RETURNING id, name, is_verified, verified_at;`,
        [!!isVerified, teamId]
      );

      await client.query(
        `INSERT INTO platform_audit_logs (
           admin_user_id, action, target_entity_type, target_entity_id, reason,
           previous_state, new_state, ip_address
         ) VALUES ($1, 'TEAM_VERIFICATION_TOGGLED', 'TEAM', $2, $3, $4, $5, $6);`,
        [
          adminUserId,
          teamId,
          reason.trim(),
          JSON.stringify({ isVerified: prev.is_verified }),
          JSON.stringify(updateRes.rows[0]),
          ipAddress,
        ]
      );

      await client.query('COMMIT;');
      return {
        team: updateRes.rows[0],
        message: isVerified
          ? `Team "${prev.name}" has been granted official verified club status.`
          : `Team "${prev.name}" verified club status removed.`,
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Schedule venue blackout maintenance window with advisory lock concurrency protection
   */
  async createVenueBlackout({ venueId, startTime, endTime, reason }, adminUserId, ipAddress = null) {
    if (!venueId || !startTime || !endTime) {
      throw ApiError.badRequest('venueId, startTime, and endTime are required', 'BAD_REQUEST');
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      throw ApiError.badRequest('End time must be after start time', 'VENUE_BLACKOUT_INVALID_TIME');
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      throw ApiError.badRequest(
        'A detailed reason of at least 5 characters is required for administrative audit',
        'AUDIT_REASON_REQUIRED'
      );
    }

    const client = await this.getClient();
    try {
      await client.query('BEGIN;');

      // 1. Acquire transaction-scoped advisory lock on venue
      const lockVenue = hashStringToBigInt(`schedule:venue:${venueId}`);
      await client.query(`SELECT pg_advisory_xact_lock(${lockVenue});`);

      // 2. Verify venue exists
      const vRes = await client.query('SELECT id, name FROM venues WHERE id = $1;', [venueId]);
      if (vRes.rows.length === 0) {
        throw ApiError.notFound(`Venue ${venueId} not found`, 'TARGET_NOT_FOUND');
      }

      // 3. Overlap check against matches scheduled on this venue
      const matchConflictRes = await client.query(
        `SELECT m.id, m.match_number, m.tournament_id, t.name as tournament_name
         FROM matches m
         JOIN tournaments t ON m.tournament_id = t.id
         WHERE m.venue_id = $1
           AND m.status IN ('SCHEDULED', 'TOSS_DONE', 'IN_PROGRESS', 'INNINGS_BREAK')
           AND (
             m.scheduled_start_time < $3 AND
             (m.scheduled_start_time + (COALESCE(m.estimated_duration_minutes, 180) * INTERVAL '1 minute')) > $2
           )
         FOR SHARE;`,
        [venueId, start.toISOString(), end.toISOString()]
      );

      if (matchConflictRes.rows.length > 0) {
        const conf = matchConflictRes.rows[0];
        throw ApiError.conflict(
          `Cannot schedule blackout: Match #${conf.match_number} (${conf.tournament_name}) is already scheduled on this venue during the requested window`,
          'VENUE_BLACKOUT_MATCH_CONFLICT'
        );
      }

      // 4. Overlap check against existing blackouts on this venue
      const blackoutConflictRes = await client.query(
        `SELECT id, reason FROM venue_blackouts
         WHERE venue_id = $1
           AND (start_time, end_time) OVERLAPS ($2::timestamptz, $3::timestamptz)
         FOR SHARE;`,
        [venueId, start.toISOString(), end.toISOString()]
      );

      if (blackoutConflictRes.rows.length > 0) {
        throw ApiError.conflict(
          `An active blackout period already covers this time window (${blackoutConflictRes.rows[0].reason})`,
          'VENUE_BLACKOUT_OVERLAP_CONFLICT'
        );
      }

      // 5. Insert venue blackout record
      const insertRes = await client.query(
        `INSERT INTO venue_blackouts (venue_id, start_time, end_time, reason, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *;`,
        [venueId, start.toISOString(), end.toISOString(), reason.trim(), adminUserId]
      );
      const blackout = insertRes.rows[0];

      // 6. Record platform audit log
      await client.query(
        `INSERT INTO platform_audit_logs (
           admin_user_id, action, target_entity_type, target_entity_id, reason,
           new_state, ip_address
         ) VALUES ($1, 'VENUE_BLACKOUT_CREATED', 'VENUE_BLACKOUT', $2, $3, $4, $5);`,
        [adminUserId, blackout.id, reason.trim(), JSON.stringify(blackout), ipAddress]
      );

      await client.query('COMMIT;');
      return {
        blackout,
        message: `Blackout period scheduled successfully for ${vRes.rows[0].name}`,
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Delete venue blackout maintenance window with mandatory audit reason
   */
  async deleteVenueBlackout(blackoutId, { reason }, adminUserId, ipAddress = null) {
    if (!blackoutId) throw ApiError.badRequest('Blackout ID is required', 'INVALID_UUID');
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      throw ApiError.badRequest(
        'A detailed reason of at least 5 characters is required for administrative audit',
        'AUDIT_REASON_REQUIRED'
      );
    }

    const client = await this.getClient();
    try {
      await client.query('BEGIN;');

      const bRes = await client.query('SELECT * FROM venue_blackouts WHERE id = $1 FOR UPDATE;', [blackoutId]);
      if (bRes.rows.length === 0) {
        throw ApiError.notFound(`Venue blackout ${blackoutId} not found`, 'TARGET_NOT_FOUND');
      }
      const blackout = bRes.rows[0];

      // Acquire advisory lock
      const lockVenue = hashStringToBigInt(`schedule:venue:${blackout.venue_id}`);
      await client.query(`SELECT pg_advisory_xact_lock(${lockVenue});`);

      await client.query('DELETE FROM venue_blackouts WHERE id = $1;', [blackoutId]);

      await client.query(
        `INSERT INTO platform_audit_logs (
           admin_user_id, action, target_entity_type, target_entity_id, reason,
           previous_state, ip_address
         ) VALUES ($1, 'VENUE_BLACKOUT_REMOVED', 'VENUE_BLACKOUT', $2, $3, $4, $5);`,
        [adminUserId, blackoutId, reason.trim(), JSON.stringify(blackout), ipAddress]
      );

      await client.query('COMMIT;');
      return { success: true, message: 'Venue blackout period removed successfully' };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * List venue blackouts
   */
  async listVenueBlackouts({ venueId, page = 1, limit = 50 } = {}) {
    const validPage = Math.max(1, parseInt(page, 10) || 1);
    const validLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (validPage - 1) * validLimit;

    const conditions = [];
    const params = [];

    if (venueId) {
      params.push(venueId);
      conditions.push(`vb.venue_id = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.db.query(`SELECT count(*)::int as total FROM venue_blackouts vb ${whereClause};`, params);
    const total = countRes.rows[0].total;

    params.push(validLimit, offset);
    const res = await this.db.query(
      `SELECT vb.id, vb.venue_id, vb.start_time, vb.end_time, vb.reason, vb.created_at,
              v.name as venue_name, v.ground_name,
              u.full_name as created_by_name
       FROM venue_blackouts vb
       JOIN venues v ON vb.venue_id = v.id
       LEFT JOIN users u ON vb.created_by_user_id = u.id
       ${whereClause}
       ORDER BY vb.start_time DESC, vb.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length};`,
      params
    );

    return {
      blackouts: res.rows,
      pagination: {
        total,
        page: validPage,
        limit: validLimit,
        totalPages: Math.ceil(total / validLimit) || 1,
      },
    };
  }

  /**
   * Query immutable platform audit logs trail
   */
  async listAuditLogs({ targetEntityType, targetEntityId, action, page = 1, limit = 50 } = {}) {
    const validPage = Math.max(1, parseInt(page, 10) || 1);
    const validLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (validPage - 1) * validLimit;

    const conditions = [];
    const params = [];

    if (targetEntityType) {
      params.push(targetEntityType);
      conditions.push(`pal.target_entity_type = $${params.length}`);
    }

    if (targetEntityId) {
      params.push(targetEntityId);
      conditions.push(`pal.target_entity_id = $${params.length}`);
    }

    if (action) {
      params.push(action);
      conditions.push(`pal.action = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.db.query(`SELECT count(*)::int as total FROM platform_audit_logs pal ${whereClause};`, params);
    const total = countRes.rows[0].total;

    params.push(validLimit, offset);
    const res = await this.db.query(
      `SELECT pal.id, pal.action, pal.target_entity_type, pal.target_entity_id, pal.reason,
              pal.previous_state, pal.new_state, pal.ip_address, pal.created_at,
              u.full_name as admin_name, u.email as admin_email
       FROM platform_audit_logs pal
       LEFT JOIN users u ON pal.admin_user_id = u.id
       ${whereClause}
       ORDER BY pal.created_at DESC, pal.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length};`,
      params
    );

    return {
      logs: res.rows,
      pagination: {
        total,
        page: validPage,
        limit: validLimit,
        totalPages: Math.ceil(total / validLimit) || 1,
      },
    };
  }
}
