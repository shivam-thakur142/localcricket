// ====================================================================
// ARCHIVE SERVICE: TOURNAMENT EXPORT & CONSISTENT REPEATABLE READ SNAPSHOTS
// ====================================================================

import { ApiError } from '../utils/ApiError.js';
import { GLOBAL_ROLES, TOURNAMENT_ROLES } from '../../../shared/constants/cricketConstants.js';
import { PointsTableService } from './pointsTableService.js';
import { AwardsService } from './awardsService.js';

export class ArchiveService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Helper: verify caller is tournament organizer or super admin
   */
  async verifyOrganizerAccess(tournamentId, userId) {
    if (!userId) {
      throw ApiError.unauthorized('Authentication required to export tournament archive');
    }

    const uRes = await this.db.query('SELECT global_role FROM users WHERE id = $1;', [userId]);
    if (uRes.rows.length > 0 && uRes.rows[0].global_role === GLOBAL_ROLES.SUPER_ADMIN) {
      return true;
    }

    const tRes = await this.db.query('SELECT created_by_user_id FROM tournaments WHERE id = $1;', [tournamentId]);
    if (tRes.rows.length === 0) {
      throw ApiError.notFound('Tournament not found');
    }
    if (tRes.rows[0].created_by_user_id === userId) {
      return true;
    }

    const mRes = await this.db.query(
      'SELECT role FROM tournament_members WHERE tournament_id = $1 AND user_id = $2;',
      [tournamentId, userId]
    );
    if (mRes.rows.length > 0 && mRes.rows[0].role === TOURNAMENT_ROLES.ORGANIZER) {
      return true;
    }

    throw ApiError.forbidden('Only tournament organizers can export the tournament archive');
  }

  /**
   * Get complete tournament archive as single consolidated JSON payload
   * Executed under REPEATABLE READ READ ONLY transaction
   */
  async getCompleteTournamentArchive(tournamentId, actorUserId) {
    await this.verifyOrganizerAccess(tournamentId, actorUserId);

    try {
      const pointsTableService = new PointsTableService(this.db);
      await pointsTableService.recalculateTournamentPoints(tournamentId);
    } catch {
      // ignore calculation error if tournament has no fixtures yet
    }

    await this.db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;');
    try {
      // 1. Tournament metadata
      const tRes = await this.db.query('SELECT * FROM tournaments WHERE id = $1;', [tournamentId]);
      if (tRes.rows.length === 0) {
        throw ApiError.notFound('Tournament not found');
      }
      const tournament = tRes.rows[0];

      // 2. Teams & Rosters
      const ttRes = await this.db.query(
        `SELECT tt.id AS tournament_team_id, tt.squad_status, tt.group_name,
                t.id AS team_id, t.name, t.short_name, t.logo_url
         FROM tournament_teams tt
         JOIN teams t ON tt.team_id = t.id
         WHERE tt.tournament_id = $1
         ORDER BY t.name ASC;`,
        [tournamentId]
      );

      const teams = [];
      for (const team of ttRes.rows) {
        const pRes = await this.db.query(
          `SELECT tp.id AS roster_id, tp.is_captain, tp.is_wicket_keeper,
                  p.id AS player_id, p.full_name, p.batting_style, p.bowling_style, p.primary_role as role, tp.jersey_number
           FROM team_rosters tp
           JOIN players p ON tp.player_id = p.id
           WHERE tp.tournament_team_id = $1 AND tp.is_active = TRUE
           ORDER BY tp.is_captain DESC, p.full_name ASC;`,
          [team.tournament_team_id]
        );
        teams.push({
          ...team,
          roster: pRes.rows,
        });
      }

      // 3. Matches, Officials, and Innings Summaries (excluding raw deliveries ledger)
      const mRes = await this.db.query(
        `SELECT m.*, v.name AS venue_name,
                t_a.name AS team_a_name, t_a.short_name AS team_a_short_name,
                t_b.name AS team_b_name, t_b.short_name AS team_b_short_name,
                wt.name AS winner_team_name,
                potm.full_name AS player_of_match_name
         FROM matches m
         LEFT JOIN venues v ON m.venue_id = v.id
         JOIN tournament_teams tt_a ON m.team_a_id = tt_a.id
         JOIN teams t_a ON tt_a.team_id = t_a.id
         JOIN tournament_teams tt_b ON m.team_b_id = tt_b.id
         JOIN teams t_b ON tt_b.team_id = t_b.id
         LEFT JOIN tournament_teams wtt ON m.winner_team_id = wtt.id
         LEFT JOIN teams wt ON wtt.team_id = wt.id
         LEFT JOIN players potm ON m.player_of_the_match_id = potm.id
         WHERE m.tournament_id = $1
         ORDER BY m.match_number ASC;`,
        [tournamentId]
      );

      const matches = [];
      for (const m of mRes.rows) {
        // Officials
        const offRes = await this.db.query(
          `SELECT mo.role, u.id AS user_id, u.full_name, u.email
           FROM match_officials mo
           JOIN users u ON mo.user_id = u.id
           WHERE mo.match_id = $1
           ORDER BY mo.created_at ASC;`,
          [m.id]
        );

        // Innings & Performances
        const innRes = await this.db.query(
          `SELECT * FROM innings WHERE match_id = $1 ORDER BY innings_number ASC;`,
          [m.id]
        );

        const inningsList = [];
        for (const inn of innRes.rows) {
          const batRes = await this.db.query(
            `SELECT bp.*, p.full_name AS batter_name
             FROM batting_performances bp
             JOIN players p ON bp.player_id = p.id
             WHERE bp.innings_id = $1
             ORDER BY bp.batting_order ASC;`,
            [inn.id]
          );

          const bowlRes = await this.db.query(
            `SELECT bop.*, p.full_name AS bowler_name
             FROM bowling_performances bop
             JOIN players p ON bop.player_id = p.id
             WHERE bop.innings_id = $1
             ORDER BY bop.bowling_order ASC;`,
            [inn.id]
          );

          inningsList.push({
            ...inn,
            batting: batRes.rows,
            bowling: bowlRes.rows,
          });
        }

        matches.push({
          ...m,
          officials: offRes.rows,
          innings: inningsList,
        });
      }

      // 4. Standings
      let standings = [];
      try {
        const pointsTableService = new PointsTableService(this.db);
        standings = await pointsTableService.getPointsTable(tournamentId);
      } catch {
        standings = [];
      }

      // 5. Awards
      let awards = null;
      try {
        const awardsService = new AwardsService(this.db);
        awards = await awardsService.getTournamentAwards(tournamentId);
      } catch {
        awards = null;
      }

      // 6. Operations Audit Log
      const auditRes = await this.db.query(
        `SELECT * FROM tournament_operations_audit WHERE tournament_id = $1 ORDER BY created_at ASC;`,
        [tournamentId]
      );

      await this.db.query('COMMIT;');

      return {
        metadata: {
          export_version: '1.0',
          exported_at: new Date().toISOString(),
          exported_by_user_id: actorUserId,
          tournament_id: tournamentId,
        },
        tournament,
        teams,
        matches,
        standings,
        awards,
        audit_log: auditRes.rows,
      };
    } catch (err) {
      await this.db.query('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Export standings as CSV string
   */
  async getStandingsCsv(tournamentId, actorUserId) {
    await this.verifyOrganizerAccess(tournamentId, actorUserId);
    const pointsTableService = new PointsTableService(this.db);
    let rows = await pointsTableService.getPointsTable(tournamentId);
    if (!rows || rows.length === 0) {
      await pointsTableService.recalculateTournamentPoints(tournamentId);
      rows = await pointsTableService.getPointsTable(tournamentId);
    }

    const headers = [
      'Rank',
      'Team',
      'Group',
      'Played',
      'Won',
      'Lost',
      'Tied',
      'No Result',
      'Points',
      'NRR',
      'Runs For',
      'Overs For',
      'Runs Against',
      'Overs Against',
    ];

    const csvLines = [headers.join(',')];

    for (let i = 0; i < (rows || []).length; i++) {
      const r = rows[i];
      const rank = r.rank ?? (i + 1);
      const line = [
        rank,
        `"${(r.team_name || '').replace(/"/g, '""')}"`,
        `"${(r.group_name || 'General').replace(/"/g, '""')}"`,
        r.matches_played ?? 0,
        r.matches_won ?? 0,
        r.matches_lost ?? 0,
        r.matches_tied ?? 0,
        r.matches_no_result ?? 0,
        r.points ?? 0,
        Number(r.net_run_rate || 0).toFixed(3),
        r.runs_scored_for ?? 0,
        r.overs_faced_display ?? '0.0',
        r.runs_conceded_against ?? 0,
        r.overs_bowled_display ?? '0.0',
      ];
      csvLines.push(line.join(','));
    }

    return csvLines.join('\n');
  }

  /**
   * Export fixtures as CSV string
   */
  async getFixturesCsv(tournamentId, actorUserId) {
    await this.verifyOrganizerAccess(tournamentId, actorUserId);

    const mRes = await this.db.query(
      `SELECT m.match_number, m.stage, m.status, m.result_type,
              m.result_margin_runs, m.result_margin_wickets,
              m.scheduled_start_time,
              v.name AS venue_name,
              t_a.name AS team_a_name,
              t_b.name AS team_b_name,
              wt.name AS winner_name,
              mo1_u.full_name AS umpire_1_name,
              mo2_u.full_name AS umpire_2_name
       FROM matches m
       LEFT JOIN venues v ON m.venue_id = v.id
       JOIN tournament_teams tt_a ON m.team_a_id = tt_a.id
       JOIN teams t_a ON tt_a.team_id = t_a.id
       JOIN tournament_teams tt_b ON m.team_b_id = tt_b.id
       JOIN teams t_b ON tt_b.team_id = t_b.id
       LEFT JOIN tournament_teams wtt ON m.winner_team_id = wtt.id
       LEFT JOIN teams wt ON wtt.team_id = wt.id
       LEFT JOIN match_officials mo1 ON m.id = mo1.match_id AND mo1.role = 'UMPIRE_1'
       LEFT JOIN users mo1_u ON mo1.user_id = mo1_u.id
       LEFT JOIN match_officials mo2 ON m.id = mo2.match_id AND mo2.role = 'UMPIRE_2'
       LEFT JOIN users mo2_u ON mo2.user_id = mo2_u.id
       WHERE m.tournament_id = $1
       ORDER BY m.match_number ASC;`,
      [tournamentId]
    );

    const headers = [
      'Match Number',
      'Stage',
      'Team A',
      'Team B',
      'Venue',
      'Scheduled Start',
      'Status',
      'Winner',
      'Margin',
      'Umpire 1',
      'Umpire 2',
    ];

    const csvLines = [headers.join(',')];

    for (const m of mRes.rows) {
      let margin = '';
      if (m.result_margin_runs) {
        margin = `${m.result_margin_runs} runs`;
      } else if (m.result_margin_wickets) {
        margin = `${m.result_margin_wickets} wickets`;
      } else if (m.result_type === 'SUPER_OVER') {
        margin = 'Super Over';
      } else if (m.result_type === 'TIED') {
        margin = 'Tied';
      }

      const line = [
        m.match_number ?? '',
        m.stage ?? '',
        `"${(m.team_a_name || '').replace(/"/g, '""')}"`,
        `"${(m.team_b_name || '').replace(/"/g, '""')}"`,
        `"${(m.venue_name || 'TBD').replace(/"/g, '""')}"`,
        m.scheduled_start_time ? new Date(m.scheduled_start_time).toISOString() : '',
        m.status ?? '',
        `"${(m.winner_name || '').replace(/"/g, '""')}"`,
        `"${margin}"`,
        `"${(m.umpire_1_name || '').replace(/"/g, '""')}"`,
        `"${(m.umpire_2_name || '').replace(/"/g, '""')}"`,
      ];
      csvLines.push(line.join(','));
    }

    return csvLines.join('\n');
  }
}
