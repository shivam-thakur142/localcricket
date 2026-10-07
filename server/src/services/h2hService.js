// ====================================================================
// H2H SERVICE: HEAD-TO-HEAD INTELLIGENCE, MATCH PREVIEW & EXPORT
// ====================================================================

import { ApiError } from '../utils/ApiError.js';

export class H2HService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Get symmetric Head-to-Head statistics between two teams
   * Supports cross-tournament (default) or tournament-scoped via options.
   */
  async getHeadToHead(teamAId, teamBId, { tournamentId = null } = {}) {
    if (!teamAId || !teamBId) {
      throw ApiError.badRequest('Both team IDs must be provided');
    }
    if (teamAId === teamBId) {
      throw ApiError.badRequest('Cannot compare a team against itself');
    }

    // 1. Validate both teams exist
    const teamsRes = await this.db.query(
      `SELECT id, name, short_name FROM teams WHERE id IN ($1, $2);`,
      [teamAId, teamBId]
    );

    if (teamsRes.rows.length < 2) {
      throw ApiError.notFound('One or both teams not found');
    }

    const teamA = teamsRes.rows.find((t) => t.id === teamAId);
    const teamB = teamsRes.rows.find((t) => t.id === teamBId);

    // 2. Query matches symmetrically where Team A and Team B met
    // (team_a is A and team_b is B) OR (team_a is B and team_b is A)
    const filterParams = [teamAId, teamBId];
    let tournFilter = '';
    if (tournamentId) {
      filterParams.push(tournamentId);
      tournFilter = `AND m.tournament_id = $${filterParams.length}`;
    }

    const matchesRes = await this.db.query(
      `SELECT m.id, m.match_number, m.stage, m.status, m.result_type, m.winner_team_id,
              m.result_margin_runs as margin_runs, m.result_margin_wickets as margin_wickets, m.scheduled_start_time,
              tourn.name as tournament_name,
              tt_a.id as m_tt_a_id, t_a.id as m_team_a_id, t_a.name as team_a_name,
              tt_b.id as m_tt_b_id, t_b.id as m_team_b_id, t_b.name as team_b_name,
              wtt.team_id as winner_global_team_id
       FROM matches m
       JOIN tournaments tourn ON m.tournament_id = tourn.id
       JOIN tournament_teams tt_a ON m.team_a_id = tt_a.id
       JOIN teams t_a ON tt_a.team_id = t_a.id
       JOIN tournament_teams tt_b ON m.team_b_id = tt_b.id
       JOIN teams t_b ON tt_b.team_id = t_b.id
       LEFT JOIN tournament_teams wtt ON m.winner_team_id = wtt.id
       WHERE (
         (t_a.id = $1 AND t_b.id = $2) OR
         (t_a.id = $2 AND t_b.id = $1)
       )
       ${tournFilter}
       ORDER BY m.scheduled_start_time DESC, m.match_number DESC;`,
      filterParams
    );

    let teamAWins = 0;
    let teamBWins = 0;
    let tied = 0;
    let noResult = 0;
    const pastMatches = [];

    for (const m of matchesRes.rows) {
      // Evaluate only resolved/completed or abandoned matches
      let outcome = 'SCHEDULED';
      let winnerName = null;

      if (m.status === 'ABANDONED' || m.result_type === 'NO_RESULT') {
        noResult += 1;
        outcome = 'NO_RESULT';
      } else if (m.result_type === 'SUPER_OVER') {
        // SUPER_OVER outcome: Winner is authoritative match winner, NOT a tie!
        if (m.winner_global_team_id === teamAId) {
          teamAWins += 1;
          outcome = 'TEAM_A_WIN';
          winnerName = teamA.name;
        } else if (m.winner_global_team_id === teamBId) {
          teamBWins += 1;
          outcome = 'TEAM_B_WIN';
          winnerName = teamB.name;
        }
      } else if (m.result_type === 'TIED' && !m.winner_team_id) {
        tied += 1;
        outcome = 'TIED';
      } else if (m.status === 'COMPLETED' && m.winner_global_team_id) {
        if (m.winner_global_team_id === teamAId) {
          teamAWins += 1;
          outcome = 'TEAM_A_WIN';
          winnerName = teamA.name;
        } else if (m.winner_global_team_id === teamBId) {
          teamBWins += 1;
          outcome = 'TEAM_B_WIN';
          winnerName = teamB.name;
        }
      }

      pastMatches.push({
        match_id: m.id,
        match_number: m.match_number,
        tournament_name: m.tournament_name,
        stage: m.stage,
        scheduled_start_time: m.scheduled_start_time,
        team_a_name: m.team_a_name,
        team_b_name: m.team_b_name,
        outcome,
        result_type: m.result_type,
        winner_name: winnerName,
        margin_runs: m.margin_runs,
        margin_wickets: m.margin_wickets,
      });
    }

    const completedCount = teamAWins + teamBWins + tied + noResult;

    return {
      team_a: { id: teamA.id, name: teamA.name, short_name: teamA.short_name },
      team_b: { id: teamB.id, name: teamB.name, short_name: teamB.short_name },
      matches_played: completedCount,
      team_a_wins: teamAWins,
      team_b_wins: teamBWins,
      tied,
      no_result: noResult,
      past_matches: pastMatches,
    };
  }

  /**
   * Get pre-match intelligence and preview
   * Includes tournament-scoped last 5 form, symmetric H2H, and venue averages.
   */
  async getMatchPreview(matchId) {
    // 1. Fetch match metadata
    const mRes = await this.db.query(
      `SELECT m.id, m.tournament_id, m.match_number, m.stage, m.status, m.overs_quota,
              m.scheduled_start_time, m.venue_id, v.name as venue_name, v.city,
              tourn.name as tournament_name, tourn.format,
              m.team_a_id as tt_a_id, t_a.id as global_team_a_id, t_a.name as team_a_name, t_a.short_name as team_a_short_name,
              m.team_b_id as tt_b_id, t_b.id as global_team_b_id, t_b.name as team_b_name, t_b.short_name as team_b_short_name
       FROM matches m
       JOIN tournaments tourn ON m.tournament_id = tourn.id
       LEFT JOIN venues v ON m.venue_id = v.id
       JOIN tournament_teams tt_a ON m.team_a_id = tt_a.id
       JOIN teams t_a ON tt_a.team_id = t_a.id
       JOIN tournament_teams tt_b ON m.team_b_id = tt_b.id
       JOIN teams t_b ON tt_b.team_id = t_b.id
       WHERE m.id = $1;`,
      [matchId]
    );

    if (mRes.rows.length === 0) {
      throw ApiError.notFound(`Match with ID ${matchId} not found`);
    }

    const match = mRes.rows[0];

    // 2. Symmetric Head-to-Head between the two teams
    const h2h = await this.getHeadToHead(match.global_team_a_id, match.global_team_b_id);

    // 3. Recent 5 Form (Tournament-scoped last 5 completed matches, strictly excluding current match)
    const teamAForm = await this.getTournamentRecentForm(match.tournament_id, match.tt_a_id, match.id);
    const teamBForm = await this.getTournamentRecentForm(match.tournament_id, match.tt_b_id, match.id);

    // 4. Venue Averages (Tournament-scoped completed matches at this venue, strictly excluding current match)
    let venueStats = null;
    if (match.venue_id) {
      const vRes = await this.db.query(
        `SELECT i.innings_number,
                COUNT(DISTINCT m.id)::int as matches_count,
                AVG(i.total_runs)::numeric(5,1) as avg_score
         FROM innings i
         JOIN matches m ON i.match_id = m.id
         WHERE m.tournament_id = $1 AND m.id <> $2 AND m.venue_id = $3
           AND m.status = 'COMPLETED' AND m.result_type <> 'NO_RESULT'
         GROUP BY i.innings_number;`,
        [match.tournament_id, match.id, match.venue_id]
      );

      const inn1 = vRes.rows.find((r) => r.innings_number === 1);
      const inn2 = vRes.rows.find((r) => r.innings_number === 2);
      const totalMatchesAtVenue = inn1?.matches_count || inn2?.matches_count || 0;

      venueStats = {
        venue_id: match.venue_id,
        venue_name: match.venue_name,
        city: match.city,
        matches_played_at_venue: totalMatchesAtVenue,
        average_first_innings_score: inn1 ? parseFloat(inn1.avg_score) : null,
        average_second_innings_score: inn2 ? parseFloat(inn2.avg_score) : null,
      };
    }

    return {
      match: {
        id: match.id,
        match_number: match.match_number,
        tournament_id: match.tournament_id,
        tournament_name: match.tournament_name,
        format: match.format,
        stage: match.stage,
        status: match.status,
        scheduled_start_time: match.scheduled_start_time,
        venue_name: match.venue_name,
        city: match.city,
        overs_quota: match.overs_quota,
      },
      team_a: {
        id: match.global_team_a_id,
        tournament_team_id: match.tt_a_id,
        name: match.team_a_name,
        short_name: match.team_a_short_name,
        recent_form: teamAForm,
      },
      team_b: {
        id: match.global_team_b_id,
        tournament_team_id: match.tt_b_id,
        name: match.team_b_name,
        short_name: match.team_b_short_name,
        recent_form: teamBForm,
      },
      head_to_head: h2h,
      venue_stats: venueStats,
    };
  }

  /**
   * Helper: Get recent 5 form for a tournament team
   * Considers COMPLETED matches only in that tournament, excluding target match.
   */
  async getTournamentRecentForm(tournamentId, tournamentTeamId, excludeMatchId) {
    const res = await this.db.query(
      `SELECT m.id, m.winner_team_id, m.result_type, m.scheduled_start_time, m.match_number
       FROM matches m
       WHERE m.tournament_id = $1 AND m.id <> $2
         AND (m.team_a_id = $3 OR m.team_b_id = $3)
         AND m.status = 'COMPLETED' AND m.result_type <> 'NO_RESULT'
       ORDER BY m.scheduled_start_time DESC, m.match_number DESC
       LIMIT 5;`,
      [tournamentId, excludeMatchId, tournamentTeamId]
    );

    return res.rows.map((m) => {
      if (m.result_type === 'SUPER_OVER') {
        return m.winner_team_id === tournamentTeamId ? 'W' : 'L';
      }
      if (m.result_type === 'TIED' && !m.winner_team_id) {
        return 'T';
      }
      return m.winner_team_id === tournamentTeamId ? 'W' : 'L';
    });
  }

  /**
   * Get official printable scoresheet payload
   * Stored assignments only; renders null without fabricating names if unassigned.
   */
  async getPrintableScoresheet(matchId) {
    // 1. Fetch match metadata and tournament
    const mRes = await this.db.query(
      `SELECT m.*, m.result_margin_runs as margin_runs, m.result_margin_wickets as margin_wickets,
              tourn.name as tournament_name, tourn.format,
              v.name as venue_name, v.city,
              t_a.name as team_a_name, t_a.short_name as team_a_short_name,
              t_b.name as team_b_name, t_b.short_name as team_b_short_name,
              wt.name as winner_team_name,
              potm.full_name as player_of_match_name,
              u_creator.full_name as creator_user_name
       FROM matches m
       JOIN tournaments tourn ON m.tournament_id = tourn.id
       LEFT JOIN venues v ON m.venue_id = v.id
       JOIN tournament_teams tt_a ON m.team_a_id = tt_a.id
       JOIN teams t_a ON tt_a.team_id = t_a.id
       JOIN tournament_teams tt_b ON m.team_b_id = tt_b.id
       JOIN teams t_b ON tt_b.team_id = t_b.id
       LEFT JOIN tournament_teams wtt ON m.winner_team_id = wtt.id
       LEFT JOIN teams wt ON wtt.team_id = wt.id
       LEFT JOIN players potm ON m.player_of_the_match_id = potm.id
       LEFT JOIN users u_creator ON tourn.created_by_user_id = u_creator.id
       WHERE m.id = $1;`,
      [matchId]
    );

    if (mRes.rows.length === 0) {
      throw ApiError.notFound(`Match with ID ${matchId} not found`);
    }

    const match = mRes.rows[0];

    // 2. Fetch authoritative match officials
    // Stored assignments only; never fabricate names!
    const officials = {
      official_scorer_name: match.creator_user_name || null,
      umpire_1_name: null,
      umpire_2_name: null,
      match_referee_name: null,
    };

    const offRes = await this.db.query(
      `SELECT mo.role, u.full_name
       FROM match_officials mo
       JOIN users u ON mo.user_id = u.id
       WHERE mo.match_id = $1;`,
      [matchId]
    );
    for (const off of offRes.rows) {
      if (off.role === 'UMPIRE_1') officials.umpire_1_name = off.full_name;
      if (off.role === 'UMPIRE_2') officials.umpire_2_name = off.full_name;
      if (off.role === 'MATCH_REFEREE') officials.match_referee_name = off.full_name;
    }

    // 3. Fetch dual-innings box score
    const inningsRes = await this.db.query(
      `SELECT * FROM innings WHERE match_id = $1 ORDER BY innings_number ASC;`,
      [matchId]
    );

    const scorecards = [];
    for (const inn of inningsRes.rows) {
      // Batting
      const battingRes = await this.db.query(
        `SELECT b.*, p.full_name as batter_name, p.batting_style,
                dismissal_p.full_name as bowler_name,
                catcher_p.full_name as fielder_name
         FROM batting_performances b
         JOIN players p ON b.player_id = p.id
         LEFT JOIN players dismissal_p ON b.bowler_id = dismissal_p.id
         LEFT JOIN players catcher_p ON b.assist_player_id = catcher_p.id
         WHERE b.innings_id = $1
         ORDER BY b.batting_order ASC;`,
        [inn.id]
      );

      // Bowling
      const bowlingRes = await this.db.query(
        `SELECT bi.*, p.full_name as bowler_name, p.bowling_style
         FROM bowling_performances bi
         JOIN players p ON bi.player_id = p.id
         WHERE bi.innings_id = $1
         ORDER BY bi.bowling_order ASC;`,
        [inn.id]
      );

      // Extras
      const extrasRes = await this.db.query(
        `SELECT
           COALESCE(SUM(CASE WHEN extra_type = 'WIDE' THEN runs_extras ELSE 0 END), 0)::int as wides,
           COALESCE(SUM(CASE WHEN extra_type = 'NO_BALL' THEN runs_extras ELSE 0 END), 0)::int as no_balls,
           COALESCE(SUM(CASE WHEN extra_type = 'BYE' THEN runs_extras ELSE 0 END), 0)::int as byes,
           COALESCE(SUM(CASE WHEN extra_type = 'LEG_BYE' THEN runs_extras ELSE 0 END), 0)::int as leg_byes,
           COALESCE(SUM(CASE WHEN extra_type = 'PENALTY' THEN runs_extras ELSE 0 END), 0)::int as penalty,
           COALESCE(SUM(runs_extras), 0)::int as total
         FROM deliveries
         WHERE innings_id = $1 AND is_reverted = FALSE;`,
        [inn.id]
      );

      // Fall of Wickets
      const fowRes = await this.db.query(
        `SELECT d.delivery_sequence, d.runs_batter, d.runs_extras, d.wicket_type,
                p.full_name as dismissed_player_name, o.over_number, d.legal_ball_number
         FROM deliveries d
         JOIN overs o ON d.over_id = o.id
         JOIN players p ON d.dismissed_player_id = p.id
         WHERE d.innings_id = $1 AND d.is_wicket = TRUE AND d.is_reverted = FALSE
         ORDER BY d.delivery_sequence ASC;`,
        [inn.id]
      );

      // Team name
      const battingTeamName = inn.batting_team_id === match.team_a_id ? match.team_a_name : match.team_b_name;

      scorecards.push({
        innings: {
          ...inn,
          batting_team_name: battingTeamName,
        },
        batting: battingRes.rows,
        bowling: bowlingRes.rows,
        extras_breakdown: extrasRes.rows[0] || { wides: 0, no_balls: 0, byes: 0, leg_byes: 0, penalty: 0, total: 0 },
        fall_of_wickets: fowRes.rows,
      });
    }

    return {
      match: {
        id: match.id,
        match_number: match.match_number,
        tournament_name: match.tournament_name,
        format: match.format,
        stage: match.stage,
        status: match.status,
        result_type: match.result_type,
        winner_team_name: match.winner_team_name,
        margin_runs: match.margin_runs,
        margin_wickets: match.margin_wickets,
        scheduled_start_time: match.scheduled_start_time,
        venue_name: match.venue_name,
        city: match.city,
        overs_quota: match.overs_quota,
        player_of_match_name: match.player_of_match_name,
        team_a_name: match.team_a_name,
        team_b_name: match.team_b_name,
      },
      officials,
      scorecards,
    };
  }
}
