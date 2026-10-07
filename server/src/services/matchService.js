// ====================================================================
// MATCH SERVICE: SPECTATOR READ-ONLY QUERIES, LIVE AGGREGATIONS & LIFECYCLE
// ====================================================================

import { ApiError } from '../utils/ApiError.js';
import { MATCH_STATUS, MATCH_RESULTS, MATCH_STAGES } from '../../../shared/constants/cricketConstants.js';
import { PointsTableService } from './pointsTableService.js';
import { PlayoffService } from './playoffService.js';

export class MatchService {
  constructor(db) {
    this.db = db;
    this.playoffService = new PlayoffService(db);
  }

  /**
   * Get basic match overview
   */
  async getMatch(matchId) {
    const res = await this.db.query(
      `SELECT m.*,
              ta.group_name as team_a_group,
              tb.group_name as team_b_group,
              tea.name as team_a_name,
              tea.short_name as team_a_short_name,
              teb.name as team_b_name,
              teb.short_name as team_b_short_name,
              v.name as venue_name, v.city as venue_city,
              t.name as tournament_name, t.overs_per_innings, t.balls_per_over
       FROM matches m
       JOIN tournaments t ON m.tournament_id = t.id
       JOIN tournament_teams ta ON m.team_a_id = ta.id
       JOIN tournament_teams tb ON m.team_b_id = tb.id
       JOIN teams tea ON ta.team_id = tea.id
       JOIN teams teb ON tb.team_id = teb.id
       LEFT JOIN venues v ON m.venue_id = v.id
       WHERE m.id = $1;`,
      [matchId]
    );
    if (res.rows.length === 0) {
      throw ApiError.notFound(`Match with ID ${matchId} not found`);
    }
    return res.rows[0];
  }

  /**
   * Get match squads: clearly distinguishes full roster from confirmed Playing XI for both teams
   */
  async getMatchSquads(matchId) {
    const match = await this.getMatch(matchId);

    // Fetch team details and full rosters
    const fetchTeamSquad = async (tournamentTeamId, teamName, shortName) => {
      // Full tournament roster for this team
      const rosterRes = await this.db.query(
        `SELECT tr.id as roster_id, tr.tournament_team_id, tr.player_id, tr.jersey_number,
                tr.is_captain as roster_captain, tr.is_wicket_keeper as roster_wicket_keeper,
                p.full_name, p.nickname, p.batting_style, p.bowling_style, p.primary_role, p.avatar_url
         FROM team_rosters tr
         JOIN players p ON tr.player_id = p.id
         WHERE tr.tournament_team_id = $1 AND tr.is_active = TRUE
         ORDER BY tr.jersey_number ASC, p.full_name ASC;`,
        [tournamentTeamId]
      );

      // Confirmed Playing XI for this match
      const playingXiRes = await this.db.query(
        `SELECT mp.id as match_player_id, mp.match_id, mp.tournament_team_id, mp.player_id,
                mp.is_playing_xi, mp.is_captain, mp.is_wicket_keeper,
                p.full_name, p.nickname, p.batting_style, p.bowling_style, p.primary_role
         FROM match_players mp
         JOIN players p ON mp.player_id = p.id
         WHERE mp.match_id = $1 AND mp.tournament_team_id = $2 AND mp.is_playing_xi = TRUE
         ORDER BY p.full_name ASC;`,
        [matchId, tournamentTeamId]
      );

      return {
        tournament_team_id: tournamentTeamId,
        team_name: teamName,
        short_name: shortName,
        full_roster: rosterRes.rows,
        playing_xi: playingXiRes.rows,
      };
    };

    const teamA = await fetchTeamSquad(match.team_a_id, match.team_a_name, match.team_a_short_name);
    const teamB = await fetchTeamSquad(match.team_b_id, match.team_b_name, match.team_b_short_name);

    return {
      match_id: matchId,
      team_a: teamA,
      team_b: teamB,
    };
  }

  /**
   * Get live match center data (current batters, bowler, over strip, RRR, target context, partnership)
   */
  async getMatchLive(matchId) {
    const match = await this.getMatch(matchId);

    // Fetch active innings
    const innRes = await this.db.query(
      `SELECT * FROM innings WHERE match_id = $1 ORDER BY innings_number DESC LIMIT 1;`,
      [matchId]
    );
    const activeInnings = innRes.rows[0] || null;

    if (!activeInnings) {
      return {
        match,
        innings: null,
        batting_team: null,
        bowling_team: null,
        current_batters: [],
        current_bowler: null,
        current_over_balls: [],
        active_partnership: null,
      };
    }

    // Batting & Bowling Teams
    const isTeamA = activeInnings.batting_team_id === match.team_a_id;
    const battingTeam = {
      id: isTeamA ? match.team_a_id : match.team_b_id,
      name: isTeamA ? match.team_a_name : match.team_b_name,
      short_name: isTeamA ? match.team_a_short_name : match.team_b_short_name,
    };
    const bowlingTeam = {
      id: isTeamA ? match.team_b_id : match.team_a_id,
      name: isTeamA ? match.team_b_name : match.team_a_name,
      short_name: isTeamA ? match.team_b_short_name : match.team_a_short_name,
    };

    // Current Striker & Non-Striker details
    const batters = [];
    if (activeInnings.current_striker_id) {
      const sRes = await this.db.query(
        `SELECT b.*, p.full_name, p.batting_style
         FROM batting_performances b
         JOIN players p ON b.player_id = p.id
         WHERE b.innings_id = $1 AND b.player_id = $2;`,
        [activeInnings.id, activeInnings.current_striker_id]
      );
      if (sRes.rows.length > 0) {
        batters.push({ ...sRes.rows[0], is_striker: true });
      }
    }
    if (activeInnings.current_non_striker_id) {
      const nsRes = await this.db.query(
        `SELECT b.*, p.full_name, p.batting_style
         FROM batting_performances b
         JOIN players p ON b.player_id = p.id
         WHERE b.innings_id = $1 AND b.player_id = $2;`,
        [activeInnings.id, activeInnings.current_non_striker_id]
      );
      if (nsRes.rows.length > 0) {
        batters.push({ ...nsRes.rows[0], is_striker: false });
      }
    }

    // Current Bowler details
    let currentBowler = null;
    if (activeInnings.current_bowler_id) {
      const bRes = await this.db.query(
        `SELECT bi.*, p.full_name, p.bowling_style
         FROM bowling_performances bi
         JOIN players p ON bi.player_id = p.id
         WHERE bi.innings_id = $1 AND bi.player_id = $2;`,
        [activeInnings.id, activeInnings.current_bowler_id]
      );
      currentBowler = bRes.rows[0] || null;
    }

    // Current Over Ball Strip (Active over un-reverted deliveries)
    const overRes = await this.db.query(
      `SELECT * FROM overs WHERE innings_id = $1 ORDER BY over_number DESC LIMIT 1;`,
      [activeInnings.id]
    );
    const activeOver = overRes.rows[0] || null;
    let currentOverBalls = [];
    if (activeOver) {
      const ballsRes = await this.db.query(
        `SELECT d.*, p.full_name as bowler_name, s.full_name as striker_name
         FROM deliveries d
         JOIN players p ON d.bowler_id = p.id
         JOIN players s ON d.striker_id = s.id
         WHERE d.over_id = $1 AND d.is_reverted = FALSE
         ORDER BY d.delivery_sequence ASC;`,
        [activeOver.id]
      );
      currentOverBalls = ballsRes.rows;
    }

    // Active Partnership Calculation
    let activePartnership = null;
    if (activeInnings.current_striker_id && activeInnings.current_non_striker_id) {
      // Find the last wicket delivery sequence in this innings
      const lastWicketRes = await this.db.query(
        `SELECT MAX(delivery_sequence) as max_seq FROM deliveries
         WHERE innings_id = $1 AND is_wicket = TRUE AND is_reverted = FALSE;`,
        [activeInnings.id]
      );
      const sinceSeq = lastWicketRes.rows[0]?.max_seq || 0;

      const pDelsRes = await this.db.query(
        `SELECT runs_batter, runs_extras, is_legal, striker_id
         FROM deliveries
         WHERE innings_id = $1 AND is_reverted = FALSE AND delivery_sequence > $2;`,
        [activeInnings.id, sinceSeq]
      );

      let pRuns = 0;
      let pBalls = 0;
      let batter1Runs = 0;
      let batter1Balls = 0;
      let batter2Runs = 0;
      let batter2Balls = 0;

      const sId = activeInnings.current_striker_id;
      const nsId = activeInnings.current_non_striker_id;

      for (const d of pDelsRes.rows) {
        pRuns += d.runs_batter + d.runs_extras;
        if (d.is_legal) {
          pBalls += 1;
        }

        if (d.striker_id === sId) {
          batter1Runs += d.runs_batter;
          if (d.is_legal) batter1Balls += 1;
        } else if (d.striker_id === nsId) {
          batter2Runs += d.runs_batter;
          if (d.is_legal) batter2Balls += 1;
        }
      }

      const strikerInfo = batters.find((b) => b.is_striker);
      const nonStrikerInfo = batters.find((b) => !b.is_striker);

      activePartnership = {
        runs: pRuns,
        balls: pBalls,
        batter1: {
          id: sId,
          name: strikerInfo?.full_name || 'Striker',
          runs: batter1Runs,
          balls: batter1Balls,
        },
        batter2: {
          id: nsId,
          name: nonStrikerInfo?.full_name || 'Non-Striker',
          runs: batter2Runs,
          balls: batter2Balls,
        },
      };
    }

    // Required Run Rate & Target Calculations
    let requiredRunRate = null;
    let ballsRemaining = null;
    let runsNeeded = null;

    if (activeInnings.target_runs) {
      const maxBalls = match.overs_quota * 6;
      ballsRemaining = Math.max(0, maxBalls - activeInnings.total_legal_balls);
      runsNeeded = Math.max(0, activeInnings.target_runs - activeInnings.total_runs);
      if (ballsRemaining > 0) {
        requiredRunRate = Number(((runsNeeded / ballsRemaining) * 6).toFixed(2));
      } else {
        requiredRunRate = runsNeeded > 0 ? 99.99 : 0.0;
      }
    }

    const currentRunRate =
      activeInnings.total_legal_balls > 0
        ? Number(((activeInnings.total_runs / activeInnings.total_legal_balls) * 6).toFixed(2))
        : 0.0;

    // Latest delivery sequence
    const maxSeqRes = await this.db.query(
      `SELECT COALESCE(MAX(delivery_sequence), 0)::int as max_seq FROM deliveries WHERE innings_id = $1 AND is_reverted = FALSE;`,
      [activeInnings.id]
    );
    const latestDeliverySequence = maxSeqRes.rows[0]?.max_seq || 0;

    return {
      match,
      innings: {
        ...activeInnings,
        current_run_rate: currentRunRate,
        required_run_rate: requiredRunRate,
        runs_needed: runsNeeded,
        balls_remaining: ballsRemaining,
      },
      latest_delivery_sequence: latestDeliverySequence,
      batting_team: battingTeam,
      bowling_team: bowlingTeam,
      current_batters: batters,
      current_bowler: currentBowler,
      current_over_balls: currentOverBalls,
      active_partnership: activePartnership,
      current_partnership: activePartnership,
    };
  }

  /**
   * Get full match scorecard (all completed/active innings, itemized extras, did-not-bat rosters)
   */
  async getMatchScorecard(matchId) {
    const match = await this.getMatch(matchId);

    const inningsRes = await this.db.query(
      `SELECT * FROM innings WHERE match_id = $1 ORDER BY innings_number ASC;`,
      [matchId]
    );

    const scorecards = [];
    for (const inn of inningsRes.rows) {
      // Batting stats
      const battingRes = await this.db.query(
        `SELECT b.*, p.full_name, p.batting_style,
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

      // Bowling stats
      const bowlingRes = await this.db.query(
        `SELECT bi.*, p.full_name, p.bowling_style
         FROM bowling_performances bi
         JOIN players p ON bi.player_id = p.id
         WHERE bi.innings_id = $1
         ORDER BY bi.bowling_order ASC;`,
        [inn.id]
      );

      // Itemized Extras breakdown
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

      // Did Not Bat Roster (players in Playing XI for batting team who have not batted)
      const dnbRes = await this.db.query(
        `SELECT p.id as player_id, p.full_name, p.primary_role
         FROM match_players mp
         JOIN players p ON mp.player_id = p.id
         WHERE mp.match_id = $1 AND mp.tournament_team_id = $2 AND mp.is_playing_xi = TRUE
           AND mp.player_id NOT IN (
             SELECT player_id FROM batting_performances WHERE innings_id = $3
           )
         ORDER BY p.full_name ASC;`,
        [matchId, inn.batting_team_id, inn.id]
      );

      // Fall of Wickets
      const fowRes = await this.db.query(
        `SELECT d.delivery_sequence, d.runs_batter, d.runs_extras, d.wicket_type,
                d.dismissed_player_id, p.full_name as dismissed_player_name,
                o.over_number, d.legal_ball_number, d.commentary_text, d.created_at
         FROM deliveries d
         JOIN overs o ON d.over_id = o.id
         JOIN players p ON d.dismissed_player_id = p.id
         WHERE d.innings_id = $1 AND d.is_wicket = TRUE AND d.is_reverted = FALSE
         ORDER BY d.delivery_sequence ASC;`,
        [inn.id]
      );

      scorecards.push({
        innings: inn,
        batting: battingRes.rows,
        bowling: bowlingRes.rows,
        extras_breakdown: extrasRes.rows[0] || { wides: 0, no_balls: 0, byes: 0, leg_byes: 0, penalty: 0, total: 0 },
        did_not_bat: dnbRes.rows,
        fall_of_wickets: fowRes.rows,
      });
    }

    return { match, scorecards };
  }

  /**
   * Get ball-by-ball commentary with filtering support (all, wickets, boundaries)
   */
  async getMatchCommentary(matchId, { limit = 50, offset = 0, filter = 'all' } = {}) {
    const innRes = await this.db.query(
      `SELECT id FROM innings WHERE match_id = $1 ORDER BY innings_number DESC LIMIT 1;`,
      [matchId]
    );
    if (innRes.rows.length === 0) {
      return { commentary: [], total: 0 };
    }
    const inningsId = innRes.rows[0].id;

    let filterClause = '';
    if (filter === 'wickets') {
      filterClause = 'AND d.is_wicket = TRUE';
    } else if (filter === 'boundaries') {
      filterClause = 'AND (d.runs_batter = 4 OR d.runs_batter = 6)';
    }

    const delsRes = await this.db.query(
      `SELECT d.*,
              b.full_name as bowler_name,
              s.full_name as striker_name,
              ns.full_name as non_striker_name,
              o.over_number
       FROM deliveries d
       JOIN overs o ON d.over_id = o.id
       JOIN players b ON d.bowler_id = b.id
       JOIN players s ON d.striker_id = s.id
       JOIN players ns ON d.non_striker_id = ns.id
       WHERE d.innings_id = $1 AND d.is_reverted = FALSE ${filterClause}
       ORDER BY d.delivery_sequence DESC
       LIMIT $2 OFFSET $3;`,
      [inningsId, limit, offset]
    );

    return {
      commentary: delsRes.rows,
      filter,
      limit,
      offset,
    };
  }

  // ====================================================================
  // MILESTONE 6: ADMIN STUDIO & MATCH LIFECYCLE OPERATIONS
  // ====================================================================

  /**
   * Global Live Matches Ticker query
   */
  async listLiveMatches() {
    const res = await this.db.query(
      `SELECT m.id, m.tournament_id, m.match_number, m.stage, m.status, m.overs_quota,
              m.scheduled_start_time,
              t.name AS tournament_name, t.city AS tournament_city,
              tea.name AS team_a_name, tea.short_name AS team_a_short_name,
              teb.name AS team_b_name, teb.short_name AS team_b_short_name,
              v.name AS venue_name, v.city AS venue_city
       FROM matches m
       JOIN tournaments t ON m.tournament_id = t.id
       JOIN tournament_teams ta ON m.team_a_id = ta.id
       JOIN tournament_teams tb ON m.team_b_id = tb.id
       JOIN teams tea ON ta.team_id = tea.id
       JOIN teams teb ON tb.team_id = teb.id
       LEFT JOIN venues v ON m.venue_id = v.id
       WHERE m.status IN ('IN_PROGRESS', 'INNINGS_BREAK')
       ORDER BY m.updated_at DESC, m.scheduled_start_time ASC;`
    );

    const liveMatches = [];
    for (const match of res.rows) {
      const innRes = await this.db.query(
        `SELECT id, innings_number, batting_team_id, bowling_team_id,
                total_runs, total_wickets, total_legal_balls, target_runs, status
         FROM innings
         WHERE match_id = $1
         ORDER BY innings_number DESC
         LIMIT 1;`,
        [match.id]
      );
      liveMatches.push({
        ...match,
        current_innings: innRes.rows[0] || null,
      });
    }

    return liveMatches;
  }

  /**
   * Allocate venue to a fixture with same-tournament ownership validation
   */
  async allocateMatchVenue(matchId, venueId) {
    const matchRes = await this.db.query('SELECT id, tournament_id FROM matches WHERE id = $1', [matchId]);
    if (matchRes.rows.length === 0) {
      throw ApiError.notFound(`Match with ID ${matchId} not found`);
    }
    const match = matchRes.rows[0];

    if (venueId) {
      const vRes = await this.db.query('SELECT id, tournament_id FROM venues WHERE id = $1', [venueId]);
      if (vRes.rows.length === 0 || vRes.rows[0].tournament_id !== match.tournament_id) {
        throw ApiError.unprocessable(
          'Venue belongs to a different tournament',
          'CROSS_TOURNAMENT_VENUE_ERROR'
        );
      }
    }

    const res = await this.db.query(
      `UPDATE matches
       SET venue_id = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *;`,
      [venueId, matchId]
    );
    return res.rows[0];
  }

  /**
   * Assign an authorized scorer to a match with tournament membership validation
   */
  async assignMatchScorer(matchId, userId) {
    const matchRes = await this.db.query('SELECT id, tournament_id FROM matches WHERE id = $1', [matchId]);
    if (matchRes.rows.length === 0) {
      throw ApiError.notFound(`Match with ID ${matchId} not found`);
    }
    const match = matchRes.rows[0];

    // Verify user exists
    const uRes = await this.db.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (uRes.rows.length === 0) {
      throw ApiError.notFound(`User with ID ${userId} not found`);
    }

    // Verify target user is a member of the same tournament with SCORER or ORGANIZER role
    const memRes = await this.db.query(
      `SELECT role FROM tournament_members WHERE tournament_id = $1 AND user_id = $2`,
      [match.tournament_id, userId]
    );
    if (memRes.rows.length === 0 || !['SCORER', 'ORGANIZER'].includes(memRes.rows[0].role)) {
      throw ApiError.unprocessable(
        'Target user is not an enrolled scorer or organizer of this tournament',
        'INVALID_SCORER_MEMBERSHIP'
      );
    }

    const res = await this.db.query(
      `INSERT INTO match_scorers (match_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (match_id, user_id) DO NOTHING
       RETURNING *;`,
      [matchId, userId]
    );

    return res.rows[0] || { match_id: matchId, user_id: userId };
  }

  /**
   * List all assigned scorers for a match
   */
  async listMatchScorers(matchId) {
    const res = await this.db.query(
      `SELECT ms.id AS assignment_id, ms.match_id, ms.user_id, ms.assigned_at,
              u.full_name, u.email, u.phone
       FROM match_scorers ms
       JOIN users u ON ms.user_id = u.id
       WHERE ms.match_id = $1
       ORDER BY ms.assigned_at ASC;`,
      [matchId]
    );
    return res.rows;
  }

  /**
   * Remove an assigned scorer from a match
   */
  async removeMatchScorer(matchId, userId) {
    const res = await this.db.query(
      `DELETE FROM match_scorers WHERE match_id = $1 AND user_id = $2 RETURNING *;`,
      [matchId, userId]
    );
    return res.rows[0] || { match_id: matchId, user_id: userId, deleted: true };
  }

  /**
   * Atomic match resolution: enforces non-terminal state, validates POTM in playing XI,
   * performs DB update, points table recalculation, and audit record in a single transaction.
   */
  async resolveMatch(matchId, resolveData, changedByUserId, pointsTableService = null) {
    const {
      status,
      resultType,
      winnerTeamId = null,
      resultMarginRuns = null,
      resultMarginWickets = null,
      playerOfTheMatchId = null,
      abandonmentReason = null,
    } = resolveData;

    const matchRes = await this.db.query('SELECT * FROM matches WHERE id = $1', [matchId]);
    if (matchRes.rows.length === 0) {
      throw ApiError.notFound(`Match with ID ${matchId} not found`);
    }
    const currentMatch = matchRes.rows[0];

    // Check if tournament is in a terminal state
    const tournRes = await this.db.query('SELECT status FROM tournaments WHERE id = $1', [currentMatch.tournament_id]);
    const tournamentStatus = tournRes.rows[0]?.status;
    if (['COMPLETED', 'CANCELLED'].includes(tournamentStatus)) {
      throw ApiError.conflict('Cannot resolve matches for a tournament in terminal state', 'TERMINAL_TOURNAMENT_IMMUTABLE');
    }

    // Check if teams are unpopulated
    if (!currentMatch.team_a_id || !currentMatch.team_b_id) {
      throw ApiError.unprocessable('Cannot resolve a match whose competing teams are not yet determined', 'UNPOPULATED_MATCH_TEAMS');
    }

    // Reject re-resolving terminal matches
    if (currentMatch.status === MATCH_STATUS.COMPLETED || currentMatch.status === MATCH_STATUS.ABANDONED) {
      throw ApiError.unprocessable('Terminal matches cannot be re-resolved', 'MATCH_ALREADY_RESOLVED');
    }

    if (!['COMPLETED', 'ABANDONED'].includes(status)) {
      throw ApiError.badRequest('Match resolution status must be COMPLETED or ABANDONED');
    }

    if (resultType === 'AWARDED') {
      throw ApiError.unprocessable('AWARDED matches are not supported in Milestone 6', 'UNSUPPORTED_RESULT_TYPE');
    }

    let finalStatus = status;
    let finalResultType = resultType;
    let finalWinnerTeamId = winnerTeamId;
    let finalMarginRuns = resultMarginRuns;
    let finalMarginWickets = resultMarginWickets;
    let finalReason = abandonmentReason;

    const isKnockout = currentMatch.stage && currentMatch.stage !== 'LEAGUE';

    if (status === 'ABANDONED') {
      finalStatus = 'ABANDONED';
      finalResultType = 'NO_RESULT';
      finalMarginRuns = null;
      finalMarginWickets = null;

      if (isKnockout) {
        // Knockout match abandoned: server-calculated higher league seed
        const { higherSeedTeamId, lowerSeedTeamId, higherRank, lowerRank } =
          await this.playoffService.calculateHigherSeededTeam(
            currentMatch.tournament_id,
            currentMatch.team_a_id,
            currentMatch.team_b_id,
            this.db
          );

        if (winnerTeamId && winnerTeamId === lowerSeedTeamId) {
          throw ApiError.unprocessable(
            `In an abandoned knockout, the higher regular season seed must advance (Team A: Rank ${higherRank}, Team B: Rank ${lowerRank})`,
            'LOWER_SEED_ADVANCE_PROHIBITED'
          );
        }

        finalWinnerTeamId = higherSeedTeamId;
        finalReason = `Knockout match abandoned due to weather/unplayable conditions; higher regular season seed advanced (Rank ${higherRank} vs Rank ${lowerRank})`;
      } else {
        finalWinnerTeamId = null;
        finalReason = abandonmentReason || 'Match abandoned by tournament administration';
      }
    } else {
      // COMPLETED match
      if (['WIN_CHASE', 'WIN_DEFEND', 'NORMAL'].includes(resultType)) {
        finalResultType = 'NORMAL';
      } else if (resultType === 'TIED') {
        finalResultType = 'TIED';
      } else if (resultType === 'SUPER_OVER') {
        finalResultType = 'SUPER_OVER';
      } else {
        throw ApiError.badRequest(`Invalid result_type for completed match: ${resultType}`);
      }

      // Check if scorecard is tied
      const innRes = await this.db.query(
        'SELECT innings_number, total_runs FROM innings WHERE match_id = $1 ORDER BY innings_number ASC',
        [matchId]
      );
      const innings = innRes.rows;
      const isScoreTied = innings.length === 2 && innings[0].total_runs === innings[1].total_runs;

      if (isKnockout) {
        if (finalResultType === 'TIED') {
          throw ApiError.unprocessable(
            'Knockout matches cannot end in a draw/tie without an advancing team',
            'KNOCKOUT_TIE_PROHIBITED'
          );
        }

        if (isScoreTied) {
          if (finalResultType !== 'SUPER_OVER') {
            throw ApiError.unprocessable(
              'Tied knockout match requires SUPER_OVER resolution',
              'SUPER_OVER_REQUIRED'
            );
          }
        } else if (innings.length === 2 && innings[0].total_runs !== innings[1].total_runs) {
          if (finalResultType === 'SUPER_OVER') {
            throw ApiError.unprocessable(
              'Cannot resolve match as SUPER_OVER when regular overs produced a decisive result',
              'INVALID_SUPER_OVER_RESOLUTION'
            );
          }
        }

        if (finalResultType === 'SUPER_OVER') {
          if (!finalWinnerTeamId || (finalWinnerTeamId !== currentMatch.team_a_id && finalWinnerTeamId !== currentMatch.team_b_id)) {
            throw ApiError.unprocessable(
              'SUPER_OVER resolution requires a server-validated winner_team_id from competing teams',
              'INVALID_SUPER_OVER_WINNER'
            );
          }
          finalReason = finalReason || 'Decided via Super Over';
        }
      }

      if (finalResultType === 'TIED') {
        finalWinnerTeamId = null;
        finalMarginRuns = null;
        finalMarginWickets = null;
      } else if (finalWinnerTeamId) {
        if (finalWinnerTeamId !== currentMatch.team_a_id && finalWinnerTeamId !== currentMatch.team_b_id) {
          throw ApiError.unprocessable('Winner team must be one of the competing teams', 'INVALID_WINNER_TEAM');
        }
      }
    }

    // POTM Validation: Must belong to confirmed playing XI
    if (playerOfTheMatchId) {
      const xiRes = await this.db.query(
        `SELECT id FROM match_players WHERE match_id = $1 AND player_id = $2 AND is_playing_xi = TRUE`,
        [matchId, playerOfTheMatchId]
      );
      if (xiRes.rows.length === 0) {
        throw ApiError.unprocessable(
          'Player of the Match must belong to the confirmed playing XI',
          'INVALID_POTM_PLAYER'
        );
      }
    }

    // Atomic transaction for match resolution, points table recalculation & audit logging
    const pts = pointsTableService || new PointsTableService(this.db);

    await this.db.query('BEGIN');
    try {
      const updateRes = await this.db.query(
        `UPDATE matches
         SET status = $1,
             result_type = $2,
             winner_team_id = $3,
             result_margin_runs = $4,
             result_margin_wickets = $5,
             player_of_the_match_id = $6,
             abandonment_reason = $7,
             updated_at = NOW()
         WHERE id = $8
         RETURNING *;`,
        [
          finalStatus,
          finalResultType,
          finalWinnerTeamId,
          finalMarginRuns,
          finalMarginWickets,
          playerOfTheMatchId,
          finalReason,
          matchId,
        ]
      );

      // Audit trail record
      await this.db.query(
        `INSERT INTO match_lifecycle_audit (
          match_id, tournament_id, previous_status, new_status,
          result_type, winner_team_id, player_of_the_match_id, reason, changed_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
        [
          matchId,
          currentMatch.tournament_id,
          currentMatch.status,
          finalStatus,
          finalResultType,
          finalWinnerTeamId,
          playerOfTheMatchId,
          finalReason,
          changedByUserId,
        ]
      );

      // If knockout match, advance playoff progression atomically
      if (isKnockout && finalWinnerTeamId) {
        const loserTeamId = finalWinnerTeamId === currentMatch.team_a_id ? currentMatch.team_b_id : currentMatch.team_a_id;
        await this.playoffService.advancePlayoffProgression(
          matchId,
          finalWinnerTeamId,
          loserTeamId,
          this.db
        );
      }

      // Recalculate standings atomically within the transaction
      await pts.recalculateTournamentPoints(currentMatch.tournament_id);

      await this.db.query('COMMIT');
      return updateRes.rows[0];
    } catch (err) {
      await this.db.query('ROLLBACK');
      throw err;
    }
  }

  /**
   * Get match lifecycle audit trail
   */
  async getMatchAuditTrail(matchId) {
    const res = await this.db.query(
      `SELECT mla.*,
              u.full_name AS changed_by_name,
              w.name AS winner_team_name,
              p.full_name AS potm_name
       FROM match_lifecycle_audit mla
       JOIN users u ON mla.changed_by_user_id = u.id
       LEFT JOIN tournament_teams tw ON mla.winner_team_id = tw.id
       LEFT JOIN teams w ON tw.team_id = w.id
       LEFT JOIN players p ON mla.player_of_the_match_id = p.id
       WHERE mla.match_id = $1
       ORDER BY mla.created_at ASC;`,
      [matchId]
    );
    return res.rows;
  }
}
