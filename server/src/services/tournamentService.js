// ====================================================================
// TOURNAMENT SERVICE: CRUD, FIXTURES, AND ROLE ASSIGNMENTS
// ====================================================================

import { ApiError } from '../utils/ApiError.js';
import { TOURNAMENT_ROLES, TOURNAMENT_STATUS } from '../../../shared/constants/cricketConstants.js';

// Valid Lifecycle Transitions State Machine
const VALID_LIFECYCLE_TRANSITIONS = {
  [TOURNAMENT_STATUS.DRAFT]: [TOURNAMENT_STATUS.UPCOMING, TOURNAMENT_STATUS.CANCELLED],
  [TOURNAMENT_STATUS.UPCOMING]: [TOURNAMENT_STATUS.ONGOING, TOURNAMENT_STATUS.CANCELLED],
  [TOURNAMENT_STATUS.ONGOING]: [TOURNAMENT_STATUS.COMPLETED, TOURNAMENT_STATUS.CANCELLED],
  [TOURNAMENT_STATUS.COMPLETED]: [], // Terminal & immutable
  [TOURNAMENT_STATUS.CANCELLED]: [], // Terminal & immutable
};

export class TournamentService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Create a new tournament
   */
  async createTournament(userId, data) {
    const {
      name,
      short_name,
      slug,
      ball_type = 'TENNIS',
      format = 'T20',
      overs_per_innings = 20,
      balls_per_over = 6,
      max_overs_per_bowler = 4,
      wide_runs = 1,
      no_ball_runs = 1,
      free_hit_on_no_ball = true,
      points_for_win = 2,
      points_for_tie = 1,
      points_for_no_result = 1,
      nrr_playing_conditions = 'STANDARD_ALL_OUT_QUOTA',
      city,
      banner_url = null,
      start_date = null,
      end_date = null,
    } = data;

    if (!name || !short_name || !city) {
      throw ApiError.badRequest('Tournament name, short_name, and city are required');
    }

    const tournamentSlug = slug || `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;

    // Insert tournament with initial DRAFT or UPCOMING status (default to DRAFT if not specified)
    const initialStatus = data.status || TOURNAMENT_STATUS.DRAFT;

    const res = await this.db.query(
      `INSERT INTO tournaments (
        created_by_user_id, name, short_name, slug, ball_type, format,
        overs_per_innings, balls_per_over, max_overs_per_bowler,
        wide_runs, no_ball_runs, free_hit_on_no_ball,
        points_for_win, points_for_tie, points_for_no_result, nrr_playing_conditions,
        city, banner_url, start_date, end_date, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      ) RETURNING *;`,
      [
        userId, name, short_name, tournamentSlug, ball_type, format,
        overs_per_innings, balls_per_over, max_overs_per_bowler,
        wide_runs, no_ball_runs, free_hit_on_no_ball,
        points_for_win, points_for_tie, points_for_no_result, nrr_playing_conditions,
        city, banner_url, start_date, end_date, initialStatus
      ]
    );
    const tournament = res.rows[0];

    // Automatically make creator an ORGANIZER in tournament_members
    await this.db.query(
      `INSERT INTO tournament_members (tournament_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (tournament_id, user_id) DO NOTHING;`,
      [tournament.id, userId, TOURNAMENT_ROLES.ORGANIZER]
    );

    return tournament;
  }

  /**
   * Get tournament details by ID with metadata counts
   */
  async getTournament(id) {
    const res = await this.db.query(
      `SELECT t.*,
              u.full_name AS organizer_name,
              COUNT(DISTINCT tt.id)::int AS teams_count,
              COUNT(DISTINCT m.id)::int AS matches_count
       FROM tournaments t
       JOIN users u ON t.created_by_user_id = u.id
       LEFT JOIN tournament_teams tt ON t.id = tt.tournament_id
       LEFT JOIN matches m ON t.id = m.tournament_id
       WHERE t.id::text = $1 OR t.slug = $1
       GROUP BY t.id, u.id;`,
      [id]
    );
    if (res.rows.length === 0) {
      throw ApiError.notFound(`Tournament ${id} not found`);
    }
    return res.rows[0];
  }

  /**
   * List tournaments with search, status, and city filters, returning teams and matches counts
   */
  async listTournaments(filters = {}) {
    let sql = `
      SELECT t.*,
             u.full_name AS organizer_name,
             COUNT(DISTINCT tt.id)::int AS teams_count,
             COUNT(DISTINCT m.id)::int AS matches_count
      FROM tournaments t
      LEFT JOIN users u ON t.created_by_user_id = u.id
      LEFT JOIN tournament_teams tt ON t.id = tt.tournament_id
      LEFT JOIN matches m ON t.id = m.tournament_id
    `;
    const conditions = [];
    const params = [];

    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(`(t.name ILIKE $${params.length} OR t.short_name ILIKE $${params.length} OR t.city ILIKE $${params.length})`);
    }

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`t.status = $${params.length}`);
    }

    if (filters.city) {
      params.push(`%${filters.city}%`);
      conditions.push(`t.city ILIKE $${params.length}`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' GROUP BY t.id, u.id ORDER BY t.created_at DESC;';
    const res = await this.db.query(sql, params);
    return res.rows;
  }

  /**
   * Update tournament lifecycle status enforcing state transitions
   */
  async updateTournamentStatus(tournamentId, newStatus) {
    if (!Object.values(TOURNAMENT_STATUS).includes(newStatus)) {
      throw ApiError.badRequest(`Invalid tournament status: ${newStatus}`);
    }

    const tRes = await this.db.query('SELECT id, status FROM tournaments WHERE id = $1', [tournamentId]);
    if (tRes.rows.length === 0) {
      throw ApiError.notFound(`Tournament ${tournamentId} not found`);
    }

    const currentStatus = tRes.rows[0].status;

    // Terminal states cannot transition
    if (currentStatus === TOURNAMENT_STATUS.COMPLETED || currentStatus === TOURNAMENT_STATUS.CANCELLED) {
      throw ApiError.unprocessable(
        `Tournament is in terminal status ${currentStatus} and cannot transition to ${newStatus}`,
        'INVALID_LIFECYCLE_TRANSITION'
      );
    }

    // Check valid transitions
    const allowedTransitions = VALID_LIFECYCLE_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
      throw ApiError.unprocessable(
        `Invalid tournament lifecycle transition from ${currentStatus} to ${newStatus}`,
        'INVALID_LIFECYCLE_TRANSITION'
      );
    }

    await this.db.query('BEGIN;');
    try {
      const res = await this.db.query(
        `UPDATE tournaments
         SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *;`,
        [newStatus, tournamentId]
      );

      // Transition UPCOMING -> ONGOING locks all verified squads
      if (currentStatus === TOURNAMENT_STATUS.UPCOMING && newStatus === TOURNAMENT_STATUS.ONGOING) {
        await this.db.query(
          `UPDATE tournament_teams
           SET squad_status = 'LOCKED'
           WHERE tournament_id = $1 AND squad_status = 'VERIFIED';`,
          [tournamentId]
        );
      }

      await this.db.query('COMMIT;');
      return res.rows[0];
    } catch (err) {
      await this.db.query('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Update tournament settings / configurations
   */
  async updateTournament(tournamentId, data) {
    const tRes = await this.db.query('SELECT id, status FROM tournaments WHERE id = $1', [tournamentId]);
    if (tRes.rows.length === 0) {
      throw ApiError.notFound(`Tournament ${tournamentId} not found`);
    }

    const currentStatus = tRes.rows[0].status;
    if (currentStatus === TOURNAMENT_STATUS.COMPLETED || currentStatus === TOURNAMENT_STATUS.CANCELLED) {
      throw ApiError.unprocessable(
        `Cannot modify tournament in terminal status ${currentStatus}`,
        'TERMINAL_TOURNAMENT_IMMUTABLE'
      );
    }

    const allowedFields = [
      'name', 'short_name', 'city', 'banner_url', 'start_date', 'end_date',
      'points_for_win', 'points_for_tie', 'points_for_no_result',
      'overs_per_innings', 'balls_per_over', 'max_overs_per_bowler',
      'wide_runs', 'no_ball_runs', 'free_hit_on_no_ball'
    ];

    const updates = [];
    const params = [tournamentId];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        params.push(data[field]);
        updates.push(`${field} = $${params.length}`);
      }
    }

    if (updates.length === 0) {
      return this.getTournament(tournamentId);
    }

    updates.push('updated_at = NOW()');
    const sql = `UPDATE tournaments SET ${updates.join(', ')} WHERE id = $1 RETURNING *;`;
    const res = await this.db.query(sql, params);
    return res.rows[0];
  }

  /**
   * Assign a tournament role to a user
   */
  async addTournamentMember(tournamentId, { userId, role }) {
    if (!Object.values(TOURNAMENT_ROLES).includes(role)) {
      throw ApiError.badRequest(`Invalid tournament role: ${role}`);
    }

    const res = await this.db.query(
      `INSERT INTO tournament_members (tournament_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (tournament_id, user_id) DO UPDATE SET role = EXCLUDED.role
       RETURNING *;`,
      [tournamentId, userId, role]
    );
    return res.rows[0];
  }

  /**
   * List members of a tournament
   */
  async listTournamentMembers(tournamentId) {
    const res = await this.db.query(
      `SELECT tm.*, u.full_name, u.email
       FROM tournament_members tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.tournament_id = $1
       ORDER BY tm.created_at ASC;`,
      [tournamentId]
    );
    return res.rows;
  }

  /**
   * Schedule a new tournament fixture/match
   */
  async scheduleMatch(tournamentId, data) {
    const {
      venue_id = null,
      team_a_id,
      team_b_id,
      match_number,
      stage = 'LEAGUE',
      scheduled_start_time,
      overs_quota,
    } = data;

    if (!team_a_id || !team_b_id || !match_number || !scheduled_start_time) {
      throw ApiError.badRequest('team_a_id, team_b_id, match_number, and scheduled_start_time are required');
    }

    if (team_a_id === team_b_id) {
      throw ApiError.badRequest('team_a and team_b cannot be the same team');
    }

    // Verify both teams belong to this tournament
    const teamsCheck = await this.db.query(
      `SELECT id FROM tournament_teams WHERE tournament_id = $1 AND id IN ($2, $3);`,
      [tournamentId, team_a_id, team_b_id]
    );
    if (teamsCheck.rows.length !== 2) {
      throw ApiError.badRequest(
        'Both teams must be valid teams registered in this specific tournament',
        'CROSS_TOURNAMENT_TEAM_ERROR'
      );
    }

    // Verify venue if provided belongs to this tournament
    if (venue_id) {
      const vCheck = await this.db.query('SELECT id, tournament_id FROM venues WHERE id = $1', [venue_id]);
      if (vCheck.rows.length === 0 || vCheck.rows[0].tournament_id !== tournamentId) {
        throw ApiError.unprocessable(
          'Venue belongs to a different tournament',
          'CROSS_TOURNAMENT_VENUE_ERROR'
        );
      }
    }

    // Determine overs quota from tournament if not specified
    let effectiveOversQuota = overs_quota;
    if (!effectiveOversQuota) {
      const tRes = await this.db.query('SELECT overs_per_innings FROM tournaments WHERE id = $1', [tournamentId]);
      effectiveOversQuota = tRes.rows[0]?.overs_per_innings || 20;
    }

    const res = await this.db.query(
      `INSERT INTO matches (
        tournament_id, venue_id, team_a_id, team_b_id,
        match_number, stage, scheduled_start_time, overs_quota, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 'SCHEDULED'
      ) RETURNING *;`,
      [
        tournamentId, venue_id, team_a_id, team_b_id,
        match_number, stage, scheduled_start_time, effectiveOversQuota,
      ]
    );
    return res.rows[0];
  }

  /**
   * List tournament matches/fixtures
   */
  async listTournamentMatches(tournamentId, filters = {}) {
    let sql = `
      SELECT m.*,
             ta.name AS team_a_name, ta.short_name AS team_a_short_name,
             tb.name AS team_b_name, tb.short_name AS team_b_short_name,
             v.name AS venue_name, v.ground_name,
             w.name AS winner_name
      FROM matches m
      JOIN tournament_teams tta ON m.team_a_id = tta.id
      JOIN teams ta ON tta.team_id = ta.id
      JOIN tournament_teams ttb ON m.team_b_id = ttb.id
      JOIN teams tb ON ttb.team_id = tb.id
      LEFT JOIN venues v ON m.venue_id = v.id
      LEFT JOIN tournament_teams tw ON m.winner_team_id = tw.id
      LEFT JOIN teams w ON tw.team_id = w.id
      WHERE m.tournament_id = $1
    `;
    const params = [tournamentId];

    if (filters.status) {
      params.push(filters.status);
      sql += ` AND m.status = $${params.length}`;
    }
    if (filters.stage) {
      params.push(filters.stage);
      sql += ` AND m.stage = $${params.length}`;
    }

    sql += ' ORDER BY m.match_number ASC, m.scheduled_start_time ASC;';
    const res = await this.db.query(sql, params);
    return res.rows;
  }
}
