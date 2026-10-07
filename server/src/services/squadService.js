// ====================================================================
// SQUAD SERVICE: SQUAD VERIFICATION, ROSTER LOCKS & AUDITED OVERRIDES
// ====================================================================

import { ApiError } from '../utils/ApiError.js';

export class SquadService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Verify squad meets tournament quotas (11-25 players, exactly 1 captain)
   */
  async verifySquad(tournamentId, tournamentTeamId, actorUserId) {
    const client = this.db;
    await client.query('BEGIN;');

    try {
      const ttRes = await client.query(
        `SELECT tt.*, t.name as team_name, tourn.status as tournament_status
         FROM tournament_teams tt
         JOIN teams t ON tt.team_id = t.id
         JOIN tournaments tourn ON tt.tournament_id = tourn.id
         WHERE tt.id = $1 AND tt.tournament_id = $2
         FOR UPDATE;`,
        [tournamentTeamId, tournamentId]
      );

      if (ttRes.rows.length === 0) {
        throw ApiError.notFound('Team registration not found in this tournament');
      }

      const team = ttRes.rows[0];

      if (team.squad_status === 'LOCKED') {
        throw ApiError.unprocessable('Squad is already LOCKED and cannot be verified through standard flow');
      }

      // Fetch active roster
      const rosterRes = await client.query(
        `SELECT * FROM team_rosters WHERE tournament_team_id = $1 AND is_active = TRUE;`,
        [tournamentTeamId]
      );
      const players = rosterRes.rows;

      if (players.length < 11) {
        throw ApiError.unprocessable(
          `Squad verification failed: Minimum 11 active players required. Found ${players.length}.`
        );
      }

      if (players.length > 25) {
        throw ApiError.unprocessable(
          `Squad verification failed: Maximum 25 active players permitted. Found ${players.length}.`
        );
      }

      const captains = players.filter((p) => p.is_captain);
      if (captains.length !== 1) {
        throw ApiError.unprocessable(
          `Squad verification failed: Exactly 1 designated captain is required. Found ${captains.length}.`
        );
      }

      // Update to VERIFIED
      await client.query(
        `UPDATE tournament_teams SET squad_status = 'VERIFIED' WHERE id = $1;`,
        [tournamentTeamId]
      );

      // Audit Log
      await client.query(
        `INSERT INTO tournament_operations_audit (
          tournament_id, match_id, entity_type, action, actor_user_id, reason, previous_state, new_state
        ) VALUES ($1, NULL, 'SQUAD', 'SQUAD_VERIFIED', $2, 'Organizer squad verification', $3, $4);`,
        [
          tournamentId,
          actorUserId,
          JSON.stringify({ squad_status: team.squad_status }),
          JSON.stringify({
            squad_status: 'VERIFIED',
            active_player_count: players.length,
            captain_player_id: captains[0].player_id,
          }),
        ]
      );

      await client.query('COMMIT;');
      return {
        tournament_team_id: tournamentTeamId,
        team_name: team.team_name,
        squad_status: 'VERIFIED',
        player_count: players.length,
        captain_id: captains[0].player_id,
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Execute authorized operational override on a LOCKED roster
   */
  async overrideLockedRoster(tournamentId, tournamentTeamId, data, actorUserId) {
    const { action, reason } = data || {};
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      throw ApiError.badRequest('A non-empty reason is mandatory for locked roster overrides');
    }

    const payload = data.payload || data;

    const validActions = ['ADD_PLAYER', 'REMOVE_PLAYER', 'CAPTAIN_CHANGE', 'JERSEY_CHANGE'];
    if (!validActions.includes(action)) {
      throw ApiError.badRequest(`Invalid override action. Must be one of: ${validActions.join(', ')}`);
    }

    const client = this.db;
    await client.query('BEGIN;');

    try {
      const ttRes = await client.query(
        `SELECT tt.*, t.name as team_name
         FROM tournament_teams tt
         JOIN teams t ON tt.team_id = t.id
         WHERE tt.id = $1 AND tt.tournament_id = $2
         FOR UPDATE;`,
        [tournamentTeamId, tournamentId]
      );

      if (ttRes.rows.length === 0) {
        throw ApiError.notFound('Team registration not found in this tournament');
      }

      const team = ttRes.rows[0];

      // Fetch current active roster snapshot
      const currentRosterRes = await client.query(
        `SELECT * FROM team_rosters WHERE tournament_team_id = $1 AND is_active = TRUE;`,
        [tournamentTeamId]
      );
      const prevRoster = currentRosterRes.rows;

      if (action === 'ADD_PLAYER') {
        const playerId = payload.playerId || data.playerId;
        const jerseyNumber = payload.jerseyNumber !== undefined ? payload.jerseyNumber : (data.jerseyNumber || null);
        if (!playerId) throw ApiError.badRequest('playerId is required to add player');

        // Check if player already exists
        const exist = prevRoster.find((p) => p.player_id === playerId);
        if (exist) throw ApiError.conflict('Player is already in this team roster');

        await client.query(
          `INSERT INTO team_rosters (tournament_team_id, player_id, jersey_number, is_active)
           VALUES ($1, $2, $3, TRUE);`,
          [tournamentTeamId, playerId, jerseyNumber]
        );
      } else if (action === 'REMOVE_PLAYER') {
        const playerId = payload.playerId || data.playerId;
        if (!playerId) throw ApiError.badRequest('playerId is required to remove player');

        const exist = prevRoster.find((p) => p.player_id === playerId);
        if (!exist) throw ApiError.notFound('Player not found in this roster');

        await client.query(
          `UPDATE team_rosters
           SET is_active = FALSE, withdrawn_at = NOW(), withdrawal_reason = $1
           WHERE tournament_team_id = $2 AND player_id = $3;`,
          [reason.trim(), tournamentTeamId, playerId]
        );
      } else if (action === 'CAPTAIN_CHANGE') {
        const captainPlayerId = payload.captainPlayerId || data.captainPlayerId || payload.playerId || data.playerId;
        if (!captainPlayerId) throw ApiError.badRequest('captainPlayerId is required');

        const exist = prevRoster.find((p) => p.player_id === captainPlayerId);
        if (!exist) throw ApiError.notFound('Target captain player not in active roster');

        // Reset previous captain
        await client.query(
          `UPDATE team_rosters SET is_captain = FALSE WHERE tournament_team_id = $1;`,
          [tournamentTeamId]
        );
        // Set new captain
        await client.query(
          `UPDATE team_rosters SET is_captain = TRUE WHERE tournament_team_id = $1 AND player_id = $2;`,
          [tournamentTeamId, captainPlayerId]
        );
      } else if (action === 'JERSEY_CHANGE') {
        const playerId = payload.playerId || data.playerId;
        const jerseyNumber = payload.jerseyNumber !== undefined ? payload.jerseyNumber : data.jerseyNumber;
        if (!playerId || jerseyNumber === undefined) {
          throw ApiError.badRequest('playerId and jerseyNumber are required');
        }

        await client.query(
          `UPDATE team_rosters SET jersey_number = $1 WHERE tournament_team_id = $2 AND player_id = $3;`,
          [jerseyNumber, tournamentTeamId, playerId]
        );
      }

      // Verify invariants still hold
      const newRosterRes = await client.query(
        `SELECT * FROM team_rosters WHERE tournament_team_id = $1 AND is_active = TRUE;`,
        [tournamentTeamId]
      );
      const newRoster = newRosterRes.rows;

      if (newRoster.length < 11) {
        throw ApiError.unprocessable(`Override would leave squad with fewer than 11 active players (${newRoster.length})`);
      }
      if (newRoster.length > 25) {
        throw ApiError.unprocessable(`Override would exceed maximum 25 active players (${newRoster.length})`);
      }
      const captains = newRoster.filter((p) => p.is_captain);
      if (captains.length !== 1) {
        throw ApiError.unprocessable(`Override must leave exactly 1 designated captain (found ${captains.length})`);
      }

      // Atomic Audit Log
      await client.query(
        `INSERT INTO tournament_operations_audit (
          tournament_id, match_id, entity_type, action, actor_user_id, reason, previous_state, new_state
        ) VALUES ($1, NULL, 'SQUAD', 'SQUAD_ROSTER_OVERRIDE', $2, $3, $4, $5);`,
        [
          tournamentId,
          actorUserId,
          reason.trim(),
          JSON.stringify({
            action,
            team_name: team.team_name,
            active_player_count: prevRoster.length,
          }),
          JSON.stringify({
            action,
            payload,
            reason: reason.trim(),
            active_player_count: newRoster.length,
            captain_player_id: captains[0].player_id,
          }),
        ]
      );

      await client.query('COMMIT;');
      return {
        success: true,
        action,
        active_player_count: newRoster.length,
        captain_id: captains[0].player_id,
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    }
  }
}
