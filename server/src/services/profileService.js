// ====================================================================
// PROFILE SERVICE: PUBLIC PLAYER & TEAM PROFILES AND HISTORICAL STATS
// ====================================================================

import { ApiError } from '../utils/ApiError.js';

export class ProfileService {
  constructor(db) {
    this.db = db;
  }

  // ==================================================================
  // PLAYER PROFILES & CAREER STATISTICS
  // ==================================================================

  /**
   * Get basic player bio and roles
   */
  async getPlayerProfile(playerId) {
    const res = await this.db.query(
      `SELECT id, full_name, nickname, primary_role, batting_style, bowling_style,
              avatar_url, created_at
       FROM players
       WHERE id = $1;`,
      [playerId]
    );

    if (res.rows.length === 0) {
      throw ApiError.notFound(`Player with ID ${playerId} not found`);
    }

    return res.rows[0];
  }

  /**
   * Get comprehensive player statistics (career or scoped to a tournament)
   * Derived on-demand directly from authoritative performance ledgers.
   */
  async getPlayerStats(playerId, { tournamentId = null } = {}) {
    // 1. Ensure player exists
    const player = await this.getPlayerProfile(playerId);

    const matchFilterParams = [playerId];
    let tournamentFilterClause = '';
    if (tournamentId) {
      matchFilterParams.push(tournamentId);
      tournamentFilterClause = `AND m.tournament_id = $${matchFilterParams.length}`;
    }

    // 2. Matches Played (where player is in confirmed Playing XI of a completed match)
    const matchesRes = await this.db.query(
      `SELECT COUNT(DISTINCT mp.match_id)::int AS matches_played
       FROM match_players mp
       JOIN matches m ON mp.match_id = m.id
       WHERE mp.player_id = $1 AND mp.is_playing_xi = TRUE AND m.status = 'COMPLETED'
       ${tournamentFilterClause};`,
      matchFilterParams
    );
    const matchesPlayed = matchesRes.rows[0]?.matches_played || 0;

    // 3. Batting Statistics Aggregation
    const battingRes = await this.db.query(
      `SELECT
         COUNT(bp.id)::int AS innings_batted,
         COALESCE(SUM(bp.runs_scored), 0)::int AS runs_scored,
         COALESCE(SUM(bp.balls_faced), 0)::int AS balls_faced,
         COALESCE(SUM(bp.fours), 0)::int AS fours,
         COALESCE(SUM(bp.sixes), 0)::int AS sixes,
         COUNT(CASE WHEN bp.is_out = FALSE THEN 1 END)::int AS not_outs,
         COUNT(CASE WHEN bp.is_out = TRUE THEN 1 END)::int AS dismissals,
         COUNT(CASE WHEN bp.runs_scored >= 50 AND bp.runs_scored < 100 THEN 1 END)::int AS fifties,
         COUNT(CASE WHEN bp.runs_scored >= 100 THEN 1 END)::int AS hundreds,
         COUNT(CASE WHEN bp.runs_scored = 0 AND bp.is_out = TRUE THEN 1 END)::int AS ducks
       FROM batting_performances bp
       JOIN innings inn ON bp.innings_id = inn.id
       JOIN matches m ON inn.match_id = m.id
       WHERE bp.player_id = $1 AND m.status = 'COMPLETED'
       ${tournamentFilterClause};`,
      matchFilterParams
    );
    const bStats = battingRes.rows[0];

    // Highest score calculation
    const highScoreRes = await this.db.query(
      `SELECT bp.runs_scored, bp.is_out
       FROM batting_performances bp
       JOIN innings inn ON bp.innings_id = inn.id
       JOIN matches m ON inn.match_id = m.id
       WHERE bp.player_id = $1 AND m.status = 'COMPLETED'
       ${tournamentFilterClause}
       ORDER BY bp.runs_scored DESC, bp.is_out ASC
       LIMIT 1;`,
      matchFilterParams
    );
    let highestScoreDisplay = '-';
    let highestScore = 0;
    let highestScoreNotOut = false;
    if (highScoreRes.rows.length > 0) {
      highestScore = highScoreRes.rows[0].runs_scored;
      highestScoreNotOut = !highScoreRes.rows[0].is_out;
      highestScoreDisplay = `${highestScore}${highestScoreNotOut ? '*' : ''}`;
    }

    const dismissals = bStats.dismissals;
    const battingAvg = dismissals > 0 ? Number((bStats.runs_scored / dismissals).toFixed(2)) : null;
    const strikeRate = bStats.balls_faced > 0 ? Number(((bStats.runs_scored / bStats.balls_faced) * 100).toFixed(2)) : 0.0;

    // 4. Bowling Statistics Aggregation
    const bowlingRes = await this.db.query(
      `SELECT
         COUNT(bi.id)::int AS innings_bowled,
         COALESCE(SUM(bi.legal_balls_bowled), 0)::int AS legal_balls_bowled,
         COALESCE(SUM(bi.maidens), 0)::int AS maiden_overs,
         COALESCE(SUM(bi.runs_conceded), 0)::int AS runs_conceded,
         COALESCE(SUM(bi.wickets), 0)::int AS wickets_taken,
         COUNT(CASE WHEN bi.wickets >= 3 AND bi.wickets < 5 THEN 1 END)::int AS three_wicket_hauls,
         COUNT(CASE WHEN bi.wickets >= 5 THEN 1 END)::int AS five_wicket_hauls
       FROM bowling_performances bi
       JOIN innings inn ON bi.innings_id = inn.id
       JOIN matches m ON inn.match_id = m.id
       WHERE bi.player_id = $1 AND m.status = 'COMPLETED'
       ${tournamentFilterClause};`,
      matchFilterParams
    );
    const bowlStats = bowlingRes.rows[0];

    // Best bowling figures
    const bestBowlRes = await this.db.query(
      `SELECT bi.wickets, bi.runs_conceded
       FROM bowling_performances bi
       JOIN innings inn ON bi.innings_id = inn.id
       JOIN matches m ON inn.match_id = m.id
       WHERE bi.player_id = $1 AND m.status = 'COMPLETED' AND bi.legal_balls_bowled > 0
       ${tournamentFilterClause}
       ORDER BY bi.wickets DESC, bi.runs_conceded ASC
       LIMIT 1;`,
      matchFilterParams
    );
    let bestBowling = null;
    if (bestBowlRes.rows.length > 0) {
      bestBowling = `${bestBowlRes.rows[0].wickets}/${bestBowlRes.rows[0].runs_conceded}`;
    }

    const bowlingBalls = bowlStats.legal_balls_bowled;
    const bowlingWickets = bowlStats.wickets_taken;
    const bowlingRuns = bowlStats.runs_conceded;
    const bowlingAvg = bowlingWickets > 0 ? Number((bowlingRuns / bowlingWickets).toFixed(2)) : null;
    const economyRate = bowlingBalls > 0 ? Number(((bowlingRuns / bowlingBalls) * 6).toFixed(2)) : 0.0;
    const bowlingStrikeRate = bowlingWickets > 0 ? Number((bowlingBalls / bowlingWickets).toFixed(2)) : null;
    const oversBowledDisplay = `${Math.floor(bowlingBalls / 6)}.${bowlingBalls % 6}`;

    // 5. Fielding Statistics (from un-reverted deliveries ledger)
    const fieldingRes = await this.db.query(
      `SELECT
         COUNT(CASE WHEN d.wicket_type = 'CAUGHT' THEN 1 END)::int AS catches,
         COUNT(CASE WHEN d.wicket_type = 'STUMPED' THEN 1 END)::int AS stumpings,
         COUNT(CASE WHEN d.wicket_type = 'RUN_OUT' THEN 1 END)::int AS run_outs
       FROM deliveries d
       JOIN innings inn ON d.innings_id = inn.id
       JOIN matches m ON inn.match_id = m.id
       WHERE d.assist_player_id = $1
         AND d.is_reverted = FALSE
         AND d.is_wicket = TRUE
         AND m.status = 'COMPLETED'
       ${tournamentFilterClause};`,
      matchFilterParams
    );
    const fStats = fieldingRes.rows[0] || { catches: 0, stumpings: 0, run_outs: 0 };

    return {
      player,
      tournament_id: tournamentId,
      matches_played: matchesPlayed,
      batting: {
        innings: bStats.innings_batted,
        not_outs: bStats.not_outs,
        runs: bStats.runs_scored,
        balls_faced: bStats.balls_faced,
        highest_score: highestScore,
        highest_score_not_out: highestScoreNotOut,
        highest_score_display: highestScoreDisplay,
        average: battingAvg,
        strike_rate: strikeRate,
        fours: bStats.fours,
        sixes: bStats.sixes,
        fifties: bStats.fifties,
        hundreds: bStats.hundreds,
        ducks: bStats.ducks,
      },
      bowling: {
        innings: bowlStats.innings_bowled,
        overs_display: oversBowledDisplay,
        legal_balls: bowlingBalls,
        maidens: bowlStats.maiden_overs,
        runs_conceded: bowlingRuns,
        wickets: bowlingWickets,
        average: bowlingAvg,
        economy: economyRate,
        strike_rate: bowlingStrikeRate,
        best_figures: bestBowling,
        three_wicket_hauls: bowlStats.three_wicket_hauls,
        five_wicket_hauls: bowlStats.five_wicket_hauls,
      },
      fielding: {
        catches: fStats.catches,
        stumpings: fStats.stumpings,
        run_outs: fStats.run_outs,
        total_dismissals: fStats.catches + fStats.stumpings + fStats.run_outs,
      },
    };
  }

  /**
   * Get chronological player match log
   */
  async getPlayerMatchLog(playerId, { limit = 20, offset = 0 } = {}) {
    await this.getPlayerProfile(playerId);

    const res = await this.db.query(
      `SELECT m.id AS match_id, m.match_number, m.stage, m.status, m.result_type,
              m.scheduled_start_time,
              t.id AS tournament_id, t.name AS tournament_name,
              tea.name AS team_a_name, teb.name AS team_b_name,
              w.name AS winner_name,
              bp.runs_scored, bp.balls_faced, bp.fours, bp.sixes, bp.is_out, bp.wicket_type,
              bi.legal_balls_bowled, bi.runs_conceded, bi.wickets AS wickets_taken, bi.maidens AS maiden_overs
       FROM match_players mp
       JOIN matches m ON mp.match_id = m.id
       JOIN tournaments t ON m.tournament_id = t.id
       JOIN tournament_teams ta ON m.team_a_id = ta.id
       JOIN tournament_teams tb ON m.team_b_id = tb.id
       JOIN teams tea ON ta.team_id = tea.id
       JOIN teams teb ON tb.team_id = teb.id
       LEFT JOIN tournament_teams tw ON m.winner_team_id = tw.id
       LEFT JOIN teams w ON tw.team_id = w.id
       LEFT JOIN innings inn1 ON m.id = inn1.match_id
       LEFT JOIN batting_performances bp ON inn1.id = bp.innings_id AND bp.player_id = $1
       LEFT JOIN bowling_performances bi ON inn1.id = bi.innings_id AND bi.player_id = $1
       WHERE mp.player_id = $1 AND mp.is_playing_xi = TRUE AND m.status = 'COMPLETED'
       ORDER BY m.scheduled_start_time DESC
       LIMIT $2 OFFSET $3;`,
      [playerId, limit, offset]
    );

    return res.rows;
  }

  // ==================================================================
  // TEAM PROFILES, ROSTER & HISTORICAL RECORDS
  // ==================================================================

  /**
   * Get global team details
   */
  async getTeamProfile(teamId) {
    const res = await this.db.query(
      `SELECT id, name, short_name, city, logo_url, created_at
       FROM teams
       WHERE id = $1;`,
      [teamId]
    );

    if (res.rows.length === 0) {
      throw ApiError.notFound(`Team with ID ${teamId} not found`);
    }

    return res.rows[0];
  }

  /**
   * Get team statistics (all-time career or tournament-scoped)
   */
  async getTeamStats(teamId, { tournamentId = null } = {}) {
    const team = await this.getTeamProfile(teamId);

    // 1. Tournaments participated
    const tournQuery = tournamentId
      ? `SELECT DISTINCT t.id, t.name, t.city, t.status, t.champion_team_id, t.runner_up_team_id, tt.id as tournament_team_id
         FROM tournaments t
         JOIN tournament_teams tt ON t.id = tt.tournament_id
         WHERE tt.team_id = $1 AND t.id = $2;`
      : `SELECT DISTINCT t.id, t.name, t.city, t.status, t.champion_team_id, t.runner_up_team_id, tt.id as tournament_team_id
         FROM tournaments t
         JOIN tournament_teams tt ON t.id = tt.tournament_id
         WHERE tt.team_id = $1;`;

    const tournParams = tournamentId ? [teamId, tournamentId] : [teamId];
    const tournsRes = await this.db.query(tournQuery, tournParams);
    const tournamentEnrollments = tournsRes.rows;

    const tournamentTeamIds = tournamentEnrollments.map((r) => r.tournament_team_id);

    if (tournamentTeamIds.length === 0) {
      return {
        team,
        tournament_id: tournamentId,
        tournaments_participated_count: 0,
        matches_played: 0,
        matches_won: 0,
        matches_lost: 0,
        matches_tied: 0,
        matches_no_result: 0,
        win_percentage: 0.0,
        trophies: { championships: [], runner_ups: [] },
      };
    }

    // 2. Matches aggregation across all tournament enrollments
    const matchesRes = await this.db.query(
      `SELECT
         COUNT(m.id)::int AS matches_played,
         COUNT(CASE WHEN m.winner_team_id = ANY($1) THEN 1 END)::int AS matches_won,
         COUNT(CASE WHEN m.result_type = 'TIED' THEN 1 END)::int AS matches_tied,
         COUNT(CASE WHEN m.result_type = 'NO_RESULT' OR m.status = 'ABANDONED' THEN 1 END)::int AS matches_no_result,
         COUNT(CASE
           WHEN m.status = 'COMPLETED'
            AND m.result_type NOT IN ('TIED', 'NO_RESULT')
            AND m.winner_team_id IS NOT NULL
            AND m.winner_team_id <> ALL($1)
           THEN 1 END)::int AS matches_lost
       FROM matches m
       WHERE (m.team_a_id = ANY($1) OR m.team_b_id = ANY($1))
         AND m.status IN ('COMPLETED', 'ABANDONED');`,
      [tournamentTeamIds]
    );
    const mStats = matchesRes.rows[0];
    const played = mStats.matches_played;
    const won = mStats.matches_won;
    const winPercentage = played > 0 ? Number(((won / played) * 100).toFixed(1)) : 0.0;

    // 3. Trophies showcase (championships and runner-up finishes)
    const championships = tournamentEnrollments
      .filter((t) => t.champion_team_id && tournamentTeamIds.includes(t.champion_team_id))
      .map((t) => ({ tournament_id: t.id, tournament_name: t.name }));

    const runnerUps = tournamentEnrollments
      .filter((t) => t.runner_up_team_id && tournamentTeamIds.includes(t.runner_up_team_id))
      .map((t) => ({ tournament_id: t.id, tournament_name: t.name }));

    return {
      team,
      tournament_id: tournamentId,
      tournaments_participated_count: tournamentEnrollments.length,
      tournaments: tournamentEnrollments.map((t) => ({ id: t.id, name: t.name, status: t.status })),
      matches_played: played,
      matches_won: won,
      matches_lost: mStats.matches_lost,
      matches_tied: mStats.matches_tied,
      matches_no_result: mStats.matches_no_result,
      win_percentage: winPercentage,
      trophies: {
        championships,
        runner_ups: runnerUps,
        championship_count: championships.length,
        runner_up_count: runnerUps.length,
      },
    };
  }

  /**
   * Get team roster for a specific tournament
   * Enforces both teamId and tournamentId server-side.
   */
  async getTeamRoster(teamId, tournamentId) {
    if (!tournamentId) {
      throw ApiError.badRequest(
        'tournamentId query parameter is required to retrieve a tournament-scoped roster',
        'TOURNAMENT_ID_REQUIRED'
      );
    }

    await this.getTeamProfile(teamId);

    // Verify team is enrolled in tournament
    const ttRes = await this.db.query(
      `SELECT id, tournament_id, team_id, group_name
       FROM tournament_teams
       WHERE team_id = $1 AND tournament_id = $2;`,
      [teamId, tournamentId]
    );

    if (ttRes.rows.length === 0) {
      throw ApiError.notFound(
        `Team ${teamId} is not enrolled in tournament ${tournamentId}`,
        'TEAM_NOT_ENROLLED_IN_TOURNAMENT'
      );
    }

    const tournamentTeam = ttRes.rows[0];

    // Fetch registered roster players
    const rosterRes = await this.db.query(
      `SELECT tr.id AS roster_id, tr.jersey_number, tr.is_captain, tr.is_vice_captain,
              tr.is_wicket_keeper, tr.is_active,
              p.id AS player_id, p.full_name, p.nickname, p.primary_role,
              p.batting_style, p.bowling_style
       FROM team_rosters tr
       JOIN players p ON tr.player_id = p.id
       WHERE tr.tournament_team_id = $1 AND tr.is_active = TRUE
       ORDER BY tr.jersey_number ASC, p.full_name ASC;`,
      [tournamentTeam.id]
    );

    return {
      team_id: teamId,
      tournament_id: tournamentId,
      tournament_team_id: tournamentTeam.id,
      group_name: tournamentTeam.group_name,
      roster: rosterRes.rows,
    };
  }

  /**
   * Get chronological team match history
   */
  async getTeamMatches(teamId, { tournamentId = null, limit = 20, offset = 0 } = {}) {
    await this.getTeamProfile(teamId);

    const ttRes = await this.db.query(
      `SELECT id FROM tournament_teams WHERE team_id = $1 ${tournamentId ? 'AND tournament_id = $2' : ''};`,
      tournamentId ? [teamId, tournamentId] : [teamId]
    );
    const ttIds = ttRes.rows.map((r) => r.id);

    if (ttIds.length === 0) {
      return [];
    }

    const res = await this.db.query(
      `SELECT m.id AS match_id, m.match_number, m.stage, m.status, m.result_type,
              m.scheduled_start_time, m.result_margin_runs, m.result_margin_wickets,
              t.id AS tournament_id, t.name AS tournament_name,
              tea.name AS team_a_name, teb.name AS team_b_name,
              w.name AS winner_name,
              v.name AS venue_name
       FROM matches m
       JOIN tournaments t ON m.tournament_id = t.id
       JOIN tournament_teams ta ON m.team_a_id = ta.id
       JOIN tournament_teams tb ON m.team_b_id = tb.id
       JOIN teams tea ON ta.team_id = tea.id
       JOIN teams teb ON tb.team_id = teb.id
       LEFT JOIN tournament_teams tw ON m.winner_team_id = tw.id
       LEFT JOIN teams w ON tw.team_id = w.id
       LEFT JOIN venues v ON m.venue_id = v.id
       WHERE (m.team_a_id = ANY($1) OR m.team_b_id = ANY($1))
       ORDER BY m.scheduled_start_time DESC
       LIMIT $2 OFFSET $3;`,
      [ttIds, limit, offset]
    );

    return res.rows;
  }
}
