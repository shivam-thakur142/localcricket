// ====================================================================
// INVITATION SERVICE: SECURE ORGANIZER INVITATION FLOW & ROLE BINDING
// ====================================================================

import { ApiError } from '../utils/ApiError.js';
import {
  generateInvitationToken,
  hashInvitationToken,
} from './tokenService.js';

/**
 * Checks whether user has ORGANIZER rights on a tournament
 */
async function verifyTournamentOrganizer(db, tournamentId, userId) {
  // 1. Check tournament creator
  const tournRes = await db.query(
    'SELECT id, created_by_user_id FROM tournaments WHERE id = $1',
    [tournamentId]
  );
  if (tournRes.rows.length === 0) {
    throw ApiError.notFound(`Tournament ${tournamentId} not found`, 'TOURNAMENT_NOT_FOUND');
  }

  if (tournRes.rows[0].created_by_user_id === userId) {
    return true;
  }

  // 2. Check tournament_members ORGANIZER role
  const memberRes = await db.query(
    `SELECT role FROM tournament_members WHERE tournament_id = $1 AND user_id = $2`,
    [tournamentId, userId]
  );
  if (memberRes.rows.length > 0 && memberRes.rows[0].role === 'ORGANIZER') {
    return true;
  }

  // 3. Check super admin
  const userRes = await db.query('SELECT global_role FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length > 0 && userRes.rows[0].global_role === 'SUPER_ADMIN') {
    return true;
  }

  throw ApiError.forbidden('Only tournament organizers can perform this action', 'ORGANIZER_REQUIRED');
}

/**
 * Generates a single-use 7-day tournament invitation
 */
export async function createInvitation(db, tournamentId, organizerUserId, { role, invitedEmail, metadata }) {
  await verifyTournamentOrganizer(db, tournamentId, organizerUserId);

  const allowedRoles = ['ORGANIZER', 'SCORER', 'UMPIRE', 'REFEREE', 'VIEWER'];
  if (!role || !allowedRoles.includes(role)) {
    throw ApiError.badRequest(
      `Role must be one of: ${allowedRoles.join(', ')}`,
      'INVALID_INVITATION_ROLE'
    );
  }

  const meta = metadata && typeof metadata === 'object' ? metadata : {};

  // Cross-tournament team validation if team_id provided
  if (meta.team_id) {
    const teamRes = await db.query(
      'SELECT id FROM tournament_teams WHERE id = $1 AND tournament_id = $2',
      [meta.team_id, tournamentId]
    );
    if (teamRes.rows.length === 0) {
      throw ApiError.badRequest(
        'Team does not belong to this tournament',
        'INVALID_TOURNAMENT_TEAM'
      );
    }
  }

  const normalizedEmail = invitedEmail && typeof invitedEmail === 'string'
    ? invitedEmail.trim().toLowerCase()
    : null;

  // Prevent duplicate active pending invitations for the same email
  if (normalizedEmail) {
    const existingInviteRes = await db.query(
      `SELECT id FROM tournament_invitations
       WHERE tournament_id = $1
         AND lower(invited_email) = $2
         AND status = 'PENDING'
         AND expires_at > NOW()`,
      [tournamentId, normalizedEmail]
    );
    if (existingInviteRes.rows.length > 0) {
      throw ApiError.conflict(
        'An active invitation already exists for this email address',
        'PENDING_INVITATION_EXISTS'
      );
    }
  }

  const rawToken = generateInvitationToken();
  const tokenHash = hashInvitationToken(rawToken);

  const insertRes = await db.query(
    `INSERT INTO tournament_invitations (
       tournament_id, invitation_token_hash, invited_email, role, metadata, status, created_by_user_id, expires_at
     ) VALUES (
       $1, $2, $3, $4, $5, 'PENDING', $6, NOW() + INTERVAL '7 days'
     )
     RETURNING id, tournament_id, invited_email, role, metadata, status, expires_at, created_at`,
    [tournamentId, tokenHash, normalizedEmail, role, JSON.stringify(meta), organizerUserId]
  );

  const invitation = insertRes.rows[0];

  return {
    invitation,
    token: rawToken,
    inviteLink: `/invitations/${rawToken}`,
  };
}

/**
 * Lists all invitations for a tournament (Organizer only)
 */
export async function listTournamentInvitations(db, tournamentId, organizerUserId) {
  await verifyTournamentOrganizer(db, tournamentId, organizerUserId);

  const listRes = await db.query(
    `SELECT id, tournament_id, invited_email, role, metadata, status, expires_at, accepted_at, created_at
     FROM tournament_invitations
     WHERE tournament_id = $1
     ORDER BY created_at DESC`,
    [tournamentId]
  );

  return listRes.rows;
}

/**
 * Revokes a pending invitation (Organizer only)
 */
export async function revokeInvitation(db, tournamentId, invitationId, organizerUserId) {
  await verifyTournamentOrganizer(db, tournamentId, organizerUserId);

  const updateRes = await db.query(
    `UPDATE tournament_invitations
     SET status = 'REVOKED'
     WHERE id = $1 AND tournament_id = $2 AND status = 'PENDING'
     RETURNING id`,
    [invitationId, tournamentId]
  );

  if (updateRes.rows.length === 0) {
    throw ApiError.badRequest('Invitation not found or cannot be revoked', 'INVITATION_NOT_REVOCABLE');
  }

  return { success: true, message: 'Invitation revoked successfully' };
}

/**
 * Public preview of an invitation token
 */
export async function previewInvitation(db, rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw ApiError.badRequest('Invitation token is required', 'TOKEN_REQUIRED');
  }

  const tokenHash = hashInvitationToken(rawToken);

  const invRes = await db.query(
    `SELECT i.id, i.tournament_id, i.invited_email, i.role, i.metadata, i.status, i.expires_at,
            t.name AS tournament_name, t.city AS tournament_city, t.format, t.ball_type
     FROM tournament_invitations i
     JOIN tournaments t ON i.tournament_id = t.id
     WHERE i.invitation_token_hash = $1`,
    [tokenHash]
  );

  if (invRes.rows.length === 0) {
    throw ApiError.notFound('Invitation not found', 'INVITATION_NOT_FOUND');
  }

  const inv = invRes.rows[0];
  let effectiveStatus = inv.status;
  if (effectiveStatus === 'PENDING' && new Date(inv.expires_at) <= new Date()) {
    effectiveStatus = 'EXPIRED';
  }

  return {
    tournamentId: inv.tournament_id,
    tournamentName: inv.tournament_name,
    tournamentCity: inv.tournament_city,
    format: inv.format,
    ballType: inv.ball_type,
    invitedEmail: inv.invited_email,
    role: inv.role,
    metadata: inv.metadata,
    status: effectiveStatus,
    expiresAt: inv.expires_at,
  };
}

/**
 * Accepts an invitation atomically with SELECT ... FOR UPDATE row locking
 */
export async function acceptInvitation(db, rawToken, user) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw ApiError.badRequest('Invitation token is required', 'TOKEN_REQUIRED');
  }
  if (!user || !user.id || !user.email) {
    throw ApiError.unauthorized('Authenticated user required to accept invitation', 'UNAUTHORIZED');
  }

  const tokenHash = hashInvitationToken(rawToken);

  try {
    await db.query('BEGIN');

    // 1. Lock invitation row
    const invRes = await db.query(
      `SELECT * FROM tournament_invitations
       WHERE invitation_token_hash = $1
       FOR UPDATE`,
      [tokenHash]
    );

    if (invRes.rows.length === 0) {
      await db.query('ROLLBACK');
      throw ApiError.notFound('Invitation not found', 'INVITATION_NOT_FOUND');
    }

    const invitation = invRes.rows[0];

    // Check if tournament is frozen
    const colCheck = await db.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'tournaments' AND column_name = 'is_frozen';"
    );
    if (colCheck.rows.length > 0) {
      const tournRes = await db.query('SELECT is_frozen, frozen_reason FROM tournaments WHERE id = $1', [invitation.tournament_id]);
      if (tournRes.rows.length > 0 && tournRes.rows[0].is_frozen) {
        await db.query('ROLLBACK');
        const reason = tournRes.rows[0].frozen_reason ? `: ${tournRes.rows[0].frozen_reason}` : '';
        throw new ApiError(423, `Tournament is frozen by platform administrator${reason}`, 'TOURNAMENT_FROZEN');
      }
    }

    // 2. Lifecycle Checks
    if (invitation.status === 'ACCEPTED') {
      await db.query('ROLLBACK');
      throw ApiError.conflict('Invitation has already been accepted', 'INVITATION_ALREADY_ACCEPTED');
    }

    if (invitation.status === 'REVOKED') {
      await db.query('ROLLBACK');
      throw ApiError.badRequest('Invitation has been revoked by the organizer', 'INVITATION_REVOKED');
    }

    if (new Date(invitation.expires_at) <= new Date()) {
      await db.query(
        `UPDATE tournament_invitations SET status = 'EXPIRED' WHERE id = $1`,
        [invitation.id]
      );
      await db.query('COMMIT');
      throw new ApiError(410, 'Invitation has expired', 'INVITATION_EXPIRED');
    }

    // 3. Email Mismatch Guard
    if (invitation.invited_email) {
      const invitedLower = invitation.invited_email.trim().toLowerCase();
      const userLower = user.email.trim().toLowerCase();
      if (invitedLower !== userLower) {
        await db.query('ROLLBACK');
        throw ApiError.forbidden(
          'This invitation was issued for another email address',
          'INVITATION_EMAIL_MISMATCH'
        );
      }
    }

    // 4. Role Conflict & Existing Membership Checks
    const memberRes = await db.query(
      `SELECT role FROM tournament_members WHERE tournament_id = $1 AND user_id = $2`,
      [invitation.tournament_id, user.id]
    );

    if (memberRes.rows.length > 0) {
      const existingRole = memberRes.rows[0].role;
      await db.query('ROLLBACK');
      if (existingRole === invitation.role) {
        throw ApiError.conflict(
          'User is already registered with this role in the tournament',
          'ALREADY_TOURNAMENT_MEMBER'
        );
      } else {
        throw ApiError.conflict(
          'User already holds a different role in this tournament. Role changes require deliberate organizer action.',
          'TOURNAMENT_ROLE_CONFLICT'
        );
      }
    }

    // 5. Cross-Tournament Team Validation (metadata.team_id)
    if (invitation.metadata && invitation.metadata.team_id) {
      const teamRes = await db.query(
        'SELECT id FROM tournament_teams WHERE id = $1 AND tournament_id = $2',
        [invitation.metadata.team_id, invitation.tournament_id]
      );
      if (teamRes.rows.length === 0) {
        await db.query('ROLLBACK');
        throw ApiError.badRequest(
          'Team does not belong to this tournament',
          'INVALID_TOURNAMENT_TEAM'
        );
      }
    }

    // 6. Insert into tournament_members with designated immutable role
    await db.query(
      `INSERT INTO tournament_members (tournament_id, user_id, role)
       VALUES ($1, $2, $3)`,
      [invitation.tournament_id, user.id, invitation.role]
    );

    // 7. Mark invitation accepted
    await db.query(
      `UPDATE tournament_invitations
       SET status = 'ACCEPTED', accepted_by_user_id = $1, accepted_at = NOW()
       WHERE id = $2`,
      [user.id, invitation.id]
    );

    // 8. Log operations audit
    await db.query(
      `INSERT INTO tournament_operations_audit (
         tournament_id, entity_type, action, actor_user_id, reason, new_state
       ) VALUES ($1, 'TOURNAMENT_INVITATION', 'INVITATION_ACCEPTED', $2, 'User accepted tournament invitation', $3)`,
      [
        invitation.tournament_id,
        user.id,
        JSON.stringify({ role: invitation.role, invitation_id: invitation.id }),
      ]
    );

    await db.query('COMMIT');

    return {
      success: true,
      tournamentId: invitation.tournament_id,
      role: invitation.role,
      message: 'Invitation accepted successfully',
    };
  } catch (err) {
    try {
      await db.query('ROLLBACK');
    } catch (_) {
      // suppress rollback error
    }
    throw err;
  }
}
