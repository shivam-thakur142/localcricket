// ====================================================================
// PLAYER MERGE SERVICE: ATOMIC 17-REFERENCE DEDUPLICATION ENGINE
// ====================================================================

import { ApiError } from '../utils/ApiError.js';
import { hashStringToBigInt } from './schedulerService.js';

export class PlayerMergeService {
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
   * Executes atomic player merge with complete data dependency remapping,
   * conflict detection, and pre-delete integrity assertions.
   */
  async mergePlayers({ sourcePlayerId, targetPlayerId, reason, adminUserId, ipAddress = null }) {
    if (!sourcePlayerId || !targetPlayerId) {
      throw ApiError.badRequest('Both sourcePlayerId and targetPlayerId are required', 'INVALID_UUID');
    }

    if (sourcePlayerId === targetPlayerId) {
      throw ApiError.badRequest('Source and target player IDs must be different', 'MERGE_SAME_PLAYER');
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

      // 1. Acquire transaction-scoped advisory locks on both player IDs in deterministic order
      const firstId = sourcePlayerId < targetPlayerId ? sourcePlayerId : targetPlayerId;
      const secondId = sourcePlayerId < targetPlayerId ? targetPlayerId : sourcePlayerId;
      const lock1 = hashStringToBigInt(`player:merge:${firstId}`);
      const lock2 = hashStringToBigInt(`player:merge:${secondId}`);
      await client.query(`SELECT pg_advisory_xact_lock(${lock1}), pg_advisory_xact_lock(${lock2});`);

      // 2. Fetch and lock source & target player rows
      const playersRes = await client.query(
        'SELECT id, full_name FROM players WHERE id IN ($1, $2) FOR UPDATE;',
        [sourcePlayerId, targetPlayerId]
      );

      if (playersRes.rows.length < 2) {
        throw ApiError.notFound('One or both players to merge do not exist', 'TARGET_NOT_FOUND');
      }

      const sourcePlayer = playersRes.rows.find((p) => p.id === sourcePlayerId);
      const targetPlayer = playersRes.rows.find((p) => p.id === targetPlayerId);

      // 3. Same-Match Participation Conflict Check
      const matchOverlapRes = await client.query(
        `SELECT mp1.match_id
         FROM match_players mp1
         JOIN match_players mp2 ON mp1.match_id = mp2.match_id
         WHERE mp1.player_id = $1 AND mp2.player_id = $2
         LIMIT 1;`,
        [sourcePlayerId, targetPlayerId]
      );

      if (matchOverlapRes.rows.length > 0) {
        throw ApiError.conflict(
          `Cannot merge: source and target players both participated in match ${matchOverlapRes.rows[0].match_id}`,
          'SAME_MATCH_PARTICIPATION_CONFLICT'
        );
      }

      // 4. Cross-Team Same-Tournament Conflict Check
      const crossTeamConflictRes = await client.query(
        `SELECT tr1.tournament_team_id AS team_1, tr2.tournament_team_id AS team_2,
                tt1.tournament_id, t.name AS tournament_name
         FROM team_rosters tr1
         JOIN team_rosters tr2 ON tr1.player_id = $1 AND tr2.player_id = $2
         JOIN tournament_teams tt1 ON tr1.tournament_team_id = tt1.id
         JOIN tournament_teams tt2 ON tr2.tournament_team_id = tt2.id
         JOIN tournaments t ON tt1.tournament_id = t.id
         WHERE tt1.tournament_id = tt2.tournament_id
           AND tr1.tournament_team_id <> tr2.tournament_team_id
           AND tr1.is_active = TRUE AND tr2.is_active = TRUE
         LIMIT 1;`,
        [sourcePlayerId, targetPlayerId]
      );

      if (crossTeamConflictRes.rows.length > 0) {
        const conf = crossTeamConflictRes.rows[0];
        throw ApiError.conflict(
          `Cannot merge: source and target players are registered to different teams in tournament "${conf.tournament_name}"`,
          'ROSTER_CROSS_TEAM_CONFLICT'
        );
      }

      // 5. Same-Team Duplicate Roster Resolution
      const sameTeamDuplicatesRes = await client.query(
        `SELECT tr1.id AS source_roster_id, tr2.id AS target_roster_id,
                tr1.tournament_team_id,
                tr1.is_captain AS src_cap, tr2.is_captain AS tgt_cap,
                tr1.is_wicket_keeper AS src_wk, tr2.is_wicket_keeper AS tgt_wk,
                tr1.jersey_number AS src_jersey, tr2.jersey_number AS tgt_jersey
         FROM team_rosters tr1
         JOIN team_rosters tr2 ON tr1.tournament_team_id = tr2.tournament_team_id
         WHERE tr1.player_id = $1 AND tr2.player_id = $2;`,
        [sourcePlayerId, targetPlayerId]
      );

      let rostersConsolidated = 0;
      for (const dup of sameTeamDuplicatesRes.rows) {
        // Check squad lock minimum rule
        const lockCheckRes = await client.query(
          `SELECT tt.squad_status AS status,
                  (SELECT count(*) FROM team_rosters WHERE tournament_team_id = $1 AND is_active = TRUE) as active_count
           FROM tournament_teams tt
           WHERE tt.id = $1;`,
          [dup.tournament_team_id]
        );

        if (lockCheckRes.rows.length > 0) {
          const row = lockCheckRes.rows[0];
          if (row.status === 'LOCKED' && parseInt(row.active_count, 10) <= 11) {
            throw ApiError.conflict(
              'Cannot merge: consolidating duplicate player would drop locked squad below 11 players',
              'ROSTER_MINIMUM_VIOLATION'
            );
          }
        }

        // Remap any match_players referencing (tournament_team_id, sourcePlayerId) to target
        await client.query(
          `UPDATE match_players
           SET player_id = $1
           WHERE tournament_team_id = $2 AND player_id = $3;`,
          [targetPlayerId, dup.tournament_team_id, sourcePlayerId]
        );

        // Merge captaincy, keeper, and jersey attributes onto target roster row
        const consolidatedCaptain = dup.src_cap || dup.tgt_cap;
        const consolidatedWk = dup.src_wk || dup.tgt_wk;
        const consolidatedJersey = dup.tgt_jersey !== null ? dup.tgt_jersey : dup.src_jersey;

        await client.query(
          `UPDATE team_rosters
           SET is_captain = $1, is_wicket_keeper = $2, jersey_number = $3
           WHERE id = $4;`,
          [consolidatedCaptain, consolidatedWk, consolidatedJersey, dup.target_roster_id]
        );

        // Delete redundant source roster row
        await client.query('DELETE FROM team_rosters WHERE id = $1;', [dup.source_roster_id]);
        rostersConsolidated++;
      }

      // 6. Remap remaining team_rosters (different tournaments)
      const rostersRemappedRes = await client.query(
        'UPDATE team_rosters SET player_id = $1 WHERE player_id = $2;',
        [targetPlayerId, sourcePlayerId]
      );

      // 7. Remap remaining match_players
      await client.query(
        'UPDATE match_players SET player_id = $1 WHERE player_id = $2;',
        [targetPlayerId, sourcePlayerId]
      );

      // 8. Remap matches player_of_the_match_id
      const matchesRemappedRes = await client.query(
        'UPDATE matches SET player_of_the_match_id = $1 WHERE player_of_the_match_id = $2;',
        [targetPlayerId, sourcePlayerId]
      );

      // 9. Remap innings current active player pointers
      await client.query(
        `UPDATE innings SET
           current_striker_id = CASE WHEN current_striker_id = $1 THEN $2 ELSE current_striker_id END,
           current_non_striker_id = CASE WHEN current_non_striker_id = $1 THEN $2 ELSE current_non_striker_id END,
           current_bowler_id = CASE WHEN current_bowler_id = $1 THEN $2 ELSE current_bowler_id END
         WHERE current_striker_id = $1 OR current_non_striker_id = $1 OR current_bowler_id = $1;`,
        [sourcePlayerId, targetPlayerId]
      );

      // 10. Remap overs bowler_id
      await client.query('UPDATE overs SET bowler_id = $1 WHERE bowler_id = $2;', [targetPlayerId, sourcePlayerId]);

      // 11. Remap deliveries (striker, non-striker, bowler, dismissed, assist)
      const deliveriesRemappedRes = await client.query(
        `UPDATE deliveries SET
           striker_id = CASE WHEN striker_id = $1 THEN $2 ELSE striker_id END,
           non_striker_id = CASE WHEN non_striker_id = $1 THEN $2 ELSE non_striker_id END,
           bowler_id = CASE WHEN bowler_id = $1 THEN $2 ELSE bowler_id END,
           dismissed_player_id = CASE WHEN dismissed_player_id = $1 THEN $2 ELSE dismissed_player_id END,
           assist_player_id = CASE WHEN assist_player_id = $1 THEN $2 ELSE assist_player_id END
         WHERE striker_id = $1 OR non_striker_id = $1 OR bowler_id = $1
            OR dismissed_player_id = $1 OR assist_player_id = $1;`,
        [sourcePlayerId, targetPlayerId]
      );

      // 12. Remap batting_performances (player_id, bowler_id, assist_player_id)
      await client.query(
        `UPDATE batting_performances SET
           player_id = CASE WHEN player_id = $1 THEN $2 ELSE player_id END,
           bowler_id = CASE WHEN bowler_id = $1 THEN $2 ELSE bowler_id END,
           assist_player_id = CASE WHEN assist_player_id = $1 THEN $2 ELSE assist_player_id END
         WHERE player_id = $1 OR bowler_id = $1 OR assist_player_id = $1;`,
        [sourcePlayerId, targetPlayerId]
      );

      // 13. Remap bowling_performances (player_id)
      await client.query(
        'UPDATE bowling_performances SET player_id = $1 WHERE player_id = $2;',
        [targetPlayerId, sourcePlayerId]
      );

      // 14. Pre-Delete Integrity Assertion
      // Verify across all database references that sourcePlayerId has exactly 0 references remaining
      const integrityRes = await client.query(
        `SELECT (
          (SELECT count(*) FROM team_rosters WHERE player_id = $1) +
          (SELECT count(*) FROM match_players WHERE player_id = $1) +
          (SELECT count(*) FROM matches WHERE player_of_the_match_id = $1) +
          (SELECT count(*) FROM innings WHERE current_striker_id = $1 OR current_non_striker_id = $1 OR current_bowler_id = $1) +
          (SELECT count(*) FROM overs WHERE bowler_id = $1) +
          (SELECT count(*) FROM deliveries WHERE striker_id = $1 OR non_striker_id = $1 OR bowler_id = $1 OR dismissed_player_id = $1 OR assist_player_id = $1) +
          (SELECT count(*) FROM batting_performances WHERE player_id = $1 OR bowler_id = $1 OR assist_player_id = $1) +
          (SELECT count(*) FROM bowling_performances WHERE player_id = $1)
        )::int AS remaining_references_count;`,
        [sourcePlayerId]
      );

      const remainingRefs = integrityRes.rows[0].remaining_references_count;
      if (remainingRefs > 0) {
        throw ApiError.internal(
          `Pre-delete integrity assertion failed: ${remainingRefs} references remain for source player ${sourcePlayerId}`,
          'MERGE_INTEGRITY_VIOLATION'
        );
      }

      // 16. Delete Source Player
      await client.query('DELETE FROM players WHERE id = $1;', [sourcePlayerId]);

      // 17. Record Player Merge Audit Log
      const totalRosters = (rostersRemappedRes.rowCount || 0) + rostersConsolidated;
      const totalDeliveries = deliveriesRemappedRes.rowCount || 0;
      const totalMatchesPotm = matchesRemappedRes.rowCount || 0;

      await client.query(
        `INSERT INTO player_merge_audit (
           admin_user_id, source_player_id, target_player_id, source_player_name, target_player_name,
           deliveries_remapped, rosters_remapped, awards_remapped, reason
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
        [
          adminUserId,
          sourcePlayerId,
          targetPlayerId,
          sourcePlayer.full_name,
          targetPlayer.full_name,
          totalDeliveries,
          totalRosters,
          totalMatchesPotm,
          reason,
        ]
      );

      // 18. Record Platform Audit Log
      await client.query(
        `INSERT INTO platform_audit_logs (
           admin_user_id, action, target_entity_type, target_entity_id, reason,
           previous_state, new_state, ip_address
         ) VALUES ($1, 'PLAYER_MERGED', 'PLAYER', $2, $3, $4, $5, $6);`,
        [
          adminUserId,
          targetPlayerId,
          reason,
          JSON.stringify({ sourcePlayerId, sourceName: sourcePlayer.full_name }),
          JSON.stringify({
            targetPlayerId,
            targetName: targetPlayer.full_name,
            deliveriesRemapped: totalDeliveries,
            rostersRemapped: totalRosters,
            potmRemapped: totalMatchesPotm,
          }),
          ipAddress,
        ]
      );

      await client.query('COMMIT;');

      return {
        success: true,
        message: `Successfully merged player "${sourcePlayer.full_name}" into "${targetPlayer.full_name}"`,
        mergeSummary: {
          sourcePlayerId,
          targetPlayerId,
          deliveriesRemapped: totalDeliveries,
          rostersRemapped: totalRosters,
          potmRemapped: totalMatchesPotm,
        },
        targetPlayer: {
          id: targetPlayer.id,
          full_name: targetPlayer.full_name,
        },
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      this.releaseClient(client);
    }
  }
}
