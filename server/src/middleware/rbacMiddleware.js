// ====================================================================
// RBAC MIDDLEWARE: SCORER & TOURNAMENT PERMISSIONS
// ====================================================================

import { ApiError } from '../utils/ApiError.js';
import { GLOBAL_ROLES, TOURNAMENT_ROLES } from '../../../shared/constants/cricketConstants.js';

export function createScorerRbacMiddleware(db) {
  return async function requireScorerRole(req, res, next) {
    try {
      const user = req.user;
      const matchId = req.params.matchId;

      if (!user) {
        throw ApiError.unauthorized('User must be authenticated');
      }

      if (!matchId) {
        throw ApiError.badRequest('matchId route parameter is required');
      }

      // 1. Super Admin is globally authorized
      if (user.global_role === GLOBAL_ROLES.SUPER_ADMIN) {
        return next();
      }

      // 2. Lookup match and tournament
      const matchRes = await db.query(
        'SELECT id, tournament_id FROM matches WHERE id = $1',
        [matchId]
      );
      if (matchRes.rows.length === 0) {
        throw ApiError.notFound(`Match with ID ${matchId} not found`);
      }
      const tournamentId = matchRes.rows[0].tournament_id;

      // 3. Check if user is an ORGANIZER of this tournament
      const memberRes = await db.query(
        'SELECT role FROM tournament_members WHERE tournament_id = $1 AND user_id = $2',
        [tournamentId, user.id]
      );
      if (memberRes.rows.length > 0 && memberRes.rows[0].role === TOURNAMENT_ROLES.ORGANIZER) {
        return next();
      }

      // 4. Check if user is assigned as SCORER for this specific match
      const scorerRes = await db.query(
        'SELECT id FROM match_scorers WHERE match_id = $1 AND user_id = $2',
        [matchId, user.id]
      );
      if (scorerRes.rows.length > 0) {
        return next();
      }

      // 5. Unauthorized
      throw ApiError.forbidden(
        `User ${user.id} (${user.full_name}) is not authorized to score match ${matchId}`
      );
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware requiring ORGANIZER role for a specific tournament
 */
export function createTournamentOrganizerMiddleware(db) {
  return async function requireTournamentOrganizer(req, res, next) {
    try {
      const user = req.user;
      const tournamentId = req.params.tournamentId || req.params.id;

      if (!user) {
        throw ApiError.unauthorized('User must be authenticated');
      }

      if (!tournamentId) {
        throw ApiError.badRequest('tournamentId route parameter is required');
      }

      // 1. Super Admin is globally authorized
      if (user.global_role === GLOBAL_ROLES.SUPER_ADMIN) {
        return next();
      }

      // 2. Check tournament existence
      const tournRes = await db.query(
        'SELECT id, created_by_user_id FROM tournaments WHERE id = $1',
        [tournamentId]
      );
      if (tournRes.rows.length === 0) {
        throw ApiError.notFound(`Tournament ${tournamentId} not found`);
      }

      // 3. Check if user is the creator
      if (tournRes.rows[0].created_by_user_id === user.id) {
        return next();
      }

      // 4. Check if user is an ORGANIZER in tournament_members
      const memberRes = await db.query(
        'SELECT role FROM tournament_members WHERE tournament_id = $1 AND user_id = $2',
        [tournamentId, user.id]
      );
      if (memberRes.rows.length > 0 && memberRes.rows[0].role === TOURNAMENT_ROLES.ORGANIZER) {
        return next();
      }

      // 5. Forbidden
      throw ApiError.forbidden(
        `User ${user.id} (${user.full_name}) is not an organizer of tournament ${tournamentId}`
      );
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware requiring ORGANIZER role for the tournament owning a specific match
 */
export function createMatchOrganizerMiddleware(db) {
  return async function requireMatchOrganizer(req, res, next) {
    try {
      const user = req.user;
      const matchId = req.params.matchId || req.params.id;

      if (!user) {
        throw ApiError.unauthorized('User must be authenticated');
      }

      if (!matchId) {
        throw ApiError.badRequest('matchId route parameter is required');
      }

      // 1. Super Admin is globally authorized
      if (user.global_role === GLOBAL_ROLES.SUPER_ADMIN) {
        return next();
      }

      // 2. Lookup match and tournament
      const matchRes = await db.query('SELECT tournament_id FROM matches WHERE id = $1', [matchId]);
      if (matchRes.rows.length === 0) {
        throw ApiError.notFound(`Match with ID ${matchId} not found`);
      }
      const tournamentId = matchRes.rows[0].tournament_id;

      // 3. Check if user is tournament creator
      const tournRes = await db.query('SELECT created_by_user_id FROM tournaments WHERE id = $1', [tournamentId]);
      if (tournRes.rows.length > 0 && tournRes.rows[0].created_by_user_id === user.id) {
        return next();
      }

      // 4. Check if user is an ORGANIZER in tournament_members
      const memberRes = await db.query(
        'SELECT role FROM tournament_members WHERE tournament_id = $1 AND user_id = $2',
        [tournamentId, user.id]
      );
      if (memberRes.rows.length > 0 && memberRes.rows[0].role === TOURNAMENT_ROLES.ORGANIZER) {
        return next();
      }

      // 5. Forbidden
      throw ApiError.forbidden(
        `User ${user.id} (${user.full_name}) is not an organizer of tournament ${tournamentId}`
      );
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Super Admin authorization middleware enforcing global_role === 'SUPER_ADMIN'
 */
export function createSuperAdminMiddleware(db) {
  return async function requireSuperAdmin(req, res, next) {
    try {
      const user = req.user;
      if (!user) {
        throw ApiError.unauthorized('User must be authenticated');
      }

      if (user.is_suspended) {
        throw ApiError.forbidden(
          `Your account has been suspended by a platform administrator: ${user.suspension_reason || 'Administrative action'}`,
          'ACCOUNT_SUSPENDED'
        );
      }

      if (user.global_role !== GLOBAL_ROLES.SUPER_ADMIN) {
        throw ApiError.forbidden(
          `User ${user.id} (${user.full_name || user.email}) is not authorized as a Super Administrator`,
          'SUPER_ADMIN_REQUIRED'
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Helper to assert that a tournament is not frozen
 */
export async function assertTournamentNotFrozen(db, tournamentId) {
  if (!tournamentId) return;
  const colRes = await db.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = 'tournaments' AND column_name = 'is_frozen';"
  );
  if (colRes.rows.length === 0) return;

  const res = await db.query('SELECT is_frozen, frozen_reason FROM tournaments WHERE id = $1', [tournamentId]);
  if (res.rows.length > 0 && res.rows[0].is_frozen) {
    const reason = res.rows[0].frozen_reason ? `: ${res.rows[0].frozen_reason}` : '';
    const err = new ApiError(423, `Tournament is frozen by platform administrator${reason}`, 'TOURNAMENT_FROZEN');
    throw err;
  }
}

/**
 * Centralized middleware rejecting all state mutations on frozen tournaments
 */
export function createTournamentFreezeGuard(db) {
  return async function requireTournamentNotFrozen(req, res, next) {
    try {
      let tournamentId = req.params.tournamentId;

      // If route is scoped to match, resolve tournamentId from matchId
      const matchId = req.params.matchId;
      if (!tournamentId && matchId) {
        const mRes = await db.query('SELECT tournament_id FROM matches WHERE id = $1', [matchId]);
        if (mRes.rows.length > 0) {
          tournamentId = mRes.rows[0].tournament_id;
        }
      }

      if (!tournamentId && req.params.id) {
        // req.params.id could be tournamentId or matchId
        const mRes = await db.query('SELECT tournament_id FROM matches WHERE id = $1', [req.params.id]);
        if (mRes.rows.length > 0) {
          tournamentId = mRes.rows[0].tournament_id;
        } else {
          tournamentId = req.params.id;
        }
      }

      if (tournamentId) {
        await assertTournamentNotFrozen(db, tournamentId);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

