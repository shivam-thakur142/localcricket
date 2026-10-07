// ====================================================================
// ROSTER SERVICE: TOURNAMENT TEAMS & PLAYER ENROLLMENT
// ====================================================================

import { ApiError } from '../utils/ApiError.js';

export class RosterService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Create a global team
   */
  async createGlobalTeam({ name, short_name, city = null, logo_url = null, created_by_user_id = null }) {
    if (!name || !short_name) {
      throw ApiError.badRequest('Team name and short_name are required');
    }

    const res = await this.db.query(
      `INSERT INTO teams (name, short_name, city, logo_url, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *;`,
      [name, short_name.toUpperCase(), city, logo_url, created_by_user_id]
    );
    return res.rows[0];
  }

  /**
   * List global teams
   */
  async listGlobalTeams(filters = {}) {
    let sql = 'SELECT * FROM teams';
    const conditions = [];
    const params = [];

    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(`(name ILIKE $${params.length} OR short_name ILIKE $${params.length} OR city ILIKE $${params.length})`);
    }

    if (filters.city) {
      params.push(`%${filters.city}%`);
      conditions.push(`city ILIKE $${params.length}`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY name ASC;';
    const res = await this.db.query(sql, params);
    return res.rows;
  }

  /**
   * Create a global player
   */
  async createGlobalPlayer({
    full_name,
    nickname = null,
    phone = null,
    batting_style = 'RIGHT_HAND_BAT',
    bowling_style = 'NONE',
    primary_role = 'ALL_ROUNDER',
    avatar_url = null,
  }) {
    if (!full_name) {
      throw ApiError.badRequest('Player full_name is required');
    }

    const res = await this.db.query(
      `INSERT INTO players (full_name, nickname, phone, batting_style, bowling_style, primary_role, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *;`,
      [full_name, nickname, phone, batting_style, bowling_style, primary_role, avatar_url]
    );
    return res.rows[0];
  }

  /**
   * List global players
   */
  async listGlobalPlayers(filters = {}) {
    let sql = 'SELECT * FROM players';
    const conditions = [];
    const params = [];

    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(`(full_name ILIKE $${params.length} OR nickname ILIKE $${params.length})`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY full_name ASC;';
    const res = await this.db.query(sql, params);
    return res.rows;
  }

  /**
   * Register a global team into a tournament
   */
  async registerTeam(tournamentId, { teamId, groupName = 'General' }) {
    if (!teamId) {
      throw ApiError.badRequest('teamId is required');
    }

    // Verify team exists
    const teamCheck = await this.db.query('SELECT * FROM teams WHERE id = $1', [teamId]);
    if (teamCheck.rows.length === 0) {
      throw ApiError.notFound(`Team with ID ${teamId} not found`);
    }

    // Insert into tournament_teams
    const ttRes = await this.db.query(
      `INSERT INTO tournament_teams (tournament_id, team_id, group_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (tournament_id, team_id) DO NOTHING
       RETURNING *;`,
      [tournamentId, teamId, groupName]
    );

    let tournamentTeam = ttRes.rows[0];
    if (!tournamentTeam) {
      // Already registered, fetch existing
      const existing = await this.db.query(
        'SELECT * FROM tournament_teams WHERE tournament_id = $1 AND team_id = $2',
        [tournamentId, teamId]
      );
      tournamentTeam = existing.rows[0];
    }

    // Initialize row in points_table with 0 values
    await this.db.query(
      `INSERT INTO points_table (tournament_id, tournament_team_id, group_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (tournament_id, tournament_team_id) DO NOTHING;`,
      [tournamentId, tournamentTeam.id, groupName]
    );

    return {
      ...tournamentTeam,
      team_name: teamCheck.rows[0].name,
      short_name: teamCheck.rows[0].short_name,
    };
  }

  /**
   * List all teams registered in a tournament with member counts
   */
  async listTournamentTeams(tournamentId) {
    const res = await this.db.query(
      `SELECT tt.id AS tournament_team_id, tt.tournament_id, tt.team_id, tt.group_name, tt.registered_at,
              t.name AS team_name, t.short_name, t.city, t.logo_url,
              COUNT(tr.id)::int AS roster_player_count
       FROM tournament_teams tt
       JOIN teams t ON tt.team_id = t.id
       LEFT JOIN team_rosters tr ON tt.id = tr.tournament_team_id AND tr.is_active = TRUE
       WHERE tt.tournament_id = $1
       GROUP BY tt.id, t.id
       ORDER BY t.name ASC;`,
      [tournamentId]
    );
    return res.rows;
  }

  /**
   * Enroll an independent player into a tournament team roster
   */
  async addPlayerToRoster(tournamentTeamId, { playerId, jerseyNumber = null, isCaptain = false, isWicketKeeper = false }) {
    if (!playerId) {
      throw ApiError.badRequest('playerId is required');
    }

    // Verify player exists
    const playerCheck = await this.db.query('SELECT * FROM players WHERE id = $1', [playerId]);
    if (playerCheck.rows.length === 0) {
      throw ApiError.notFound(`Player with ID ${playerId} not found`);
    }

    // Verify tournament team exists
    const ttCheck = await this.db.query('SELECT * FROM tournament_teams WHERE id = $1', [tournamentTeamId]);
    if (ttCheck.rows.length === 0) {
      throw ApiError.notFound(`Tournament team with ID ${tournamentTeamId} not found`);
    }

    const res = await this.db.query(
      `INSERT INTO team_rosters (
        tournament_team_id, player_id, jersey_number, is_captain, is_wicket_keeper, is_active
      ) VALUES (
        $1, $2, $3, $4, $5, TRUE
      )
      ON CONFLICT (tournament_team_id, player_id) DO UPDATE SET
        jersey_number = COALESCE(EXCLUDED.jersey_number, team_rosters.jersey_number),
        is_captain = EXCLUDED.is_captain,
        is_wicket_keeper = EXCLUDED.is_wicket_keeper,
        is_active = TRUE
      RETURNING *;`,
      [tournamentTeamId, playerId, jerseyNumber, isCaptain, isWicketKeeper]
    );

    return {
      ...res.rows[0],
      player_name: playerCheck.rows[0].full_name,
      batting_style: playerCheck.rows[0].batting_style,
      bowling_style: playerCheck.rows[0].bowling_style,
      primary_role: playerCheck.rows[0].primary_role,
    };
  }

  /**
   * Get full roster for a tournament team
   */
  async getTeamRoster(tournamentTeamId) {
    const res = await this.db.query(
      `SELECT tr.id AS roster_id, tr.tournament_team_id, tr.player_id,
              tr.jersey_number, tr.is_captain, tr.is_wicket_keeper, tr.is_active,
              p.full_name, p.batting_style, p.bowling_style, p.primary_role
       FROM team_rosters tr
       JOIN players p ON tr.player_id = p.id
       WHERE tr.tournament_team_id = $1 AND tr.is_active = TRUE
       ORDER BY tr.jersey_number ASC NULLS LAST, p.full_name ASC;`,
      [tournamentTeamId]
    );
    return res.rows;
  }
}
