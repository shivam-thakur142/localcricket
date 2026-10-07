// ====================================================================
// ANALYTICS SERVICE: WORM CHARTS, MANHATTAN BARS & PARTNERSHIPS
// ====================================================================

import { ApiError } from '../utils/ApiError.js';

export class AnalyticsService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Get complete match analytics: Worm curves, Manhattan charts, and partnerships
   * @param {string} matchId
   */
  async getMatchAnalytics(matchId) {
    // 1. Fetch match and innings
    const matchRes = await this.db.query(
      `SELECT m.*, t.balls_per_over, t.overs_per_innings,
              tea.name as team_a_name, tea.short_name as team_a_short_name,
              teb.name as team_b_name, teb.short_name as team_b_short_name
       FROM matches m
       JOIN tournaments t ON m.tournament_id = t.id
       JOIN tournament_teams ta ON m.team_a_id = ta.id
       JOIN tournament_teams tb ON m.team_b_id = tb.id
       JOIN teams tea ON ta.team_id = tea.id
       JOIN teams teb ON tb.team_id = teb.id
       WHERE m.id = $1;`,
      [matchId]
    );

    if (matchRes.rows.length === 0) {
      throw ApiError.notFound(`Match with ID ${matchId} not found`);
    }
    const match = matchRes.rows[0];
    const ballsPerOver = match.balls_per_over || 6;

    const innRes = await this.db.query(
      `SELECT i.*, tea.name as batting_team_name, tea.short_name as batting_team_short_name
       FROM innings i
       JOIN tournament_teams tt ON i.batting_team_id = tt.id
       JOIN teams tea ON tt.team_id = tea.id
       WHERE i.match_id = $1
       ORDER BY i.innings_number ASC;`,
      [matchId]
    );

    const analyticsByInnings = [];

    for (const inn of innRes.rows) {
      // 2. Fetch all non-reverted deliveries for this innings in chronological sequence
      const delRes = await this.db.query(
        `SELECT d.*, o.over_number, o.bowler_id,
                b.full_name as bowler_name,
                s.full_name as striker_name,
                ns.full_name as non_striker_name,
                dp.full_name as dismissed_player_name
         FROM deliveries d
         JOIN overs o ON d.over_id = o.id
         JOIN players b ON d.bowler_id = b.id
         JOIN players s ON d.striker_id = s.id
         JOIN players ns ON d.non_striker_id = ns.id
         LEFT JOIN players dp ON d.dismissed_player_id = dp.id
         WHERE d.innings_id = $1 AND d.is_reverted = FALSE
         ORDER BY d.delivery_sequence ASC;`,
        [inn.id]
      );
      const deliveries = delRes.rows;

      // 3. Fetch overs metadata for this innings
      const oversRes = await this.db.query(
        `SELECT o.*, b.full_name as bowler_name
         FROM overs o
         JOIN players b ON o.bowler_id = b.id
         WHERE o.innings_id = $1
         ORDER BY o.over_number ASC;`,
        [inn.id]
      );
      const oversList = oversRes.rows;

      // 4. Compute Worm Curve & Manhattan data
      const { wormCurve, manhattanBars, wicketsFallen } = this._computeOverAggregates(
        deliveries,
        oversList,
        ballsPerOver
      );

      // 5. Compute Partnerships (Active and Historical)
      const { activePartnership, historicalPartnerships } = this._computePartnerships(deliveries, inn);

      analyticsByInnings.push({
        innings_id: inn.id,
        innings_number: inn.innings_number,
        batting_team_id: inn.batting_team_id,
        batting_team_name: inn.batting_team_name,
        batting_team_short_name: inn.batting_team_short_name,
        total_runs: inn.total_runs,
        total_wickets: inn.total_wickets,
        total_legal_balls: inn.total_legal_balls,
        status: inn.status,
        worm: wormCurve,
        manhattan: manhattanBars,
        wickets: wicketsFallen,
        active_partnership: activePartnership,
        historical_partnerships: historicalPartnerships,
      });
    }

    return {
      match_id: match.id,
      match_status: match.status,
      balls_per_over: ballsPerOver,
      overs_quota: match.overs_quota,
      innings: analyticsByInnings,
    };
  }

  /**
   * Compute Worm curve points and Manhattan bars with clean distinction
   * between completed and incomplete active overs.
   */
  _computeOverAggregates(deliveries, oversList, ballsPerOver) {
    const wormCurve = [{ over: 0, overs_display: '0.0', runs: 0, wickets: 0, is_completed: true }];
    const manhattanBars = [];
    const wicketsFallen = [];

    // Group deliveries by over_number
    const deliveriesByOver = new Map();
    for (const d of deliveries) {
      if (!deliveriesByOver.has(d.over_number)) {
        deliveriesByOver.set(d.over_number, []);
      }
      deliveriesByOver.get(d.over_number).push(d);
    }

    let cumulativeRuns = 0;
    let cumulativeWickets = 0;
    let wicketCounter = 0;

    for (const ov of oversList) {
      const overDels = deliveriesByOver.get(ov.over_number) || [];
      let overRuns = 0;
      let overWickets = 0;
      let legalBalls = 0;

      for (const d of overDels) {
        const delRuns = d.runs_batter + d.runs_extras;
        overRuns += delRuns;
        cumulativeRuns += delRuns;

        if (d.is_legal) {
          legalBalls++;
        }

        if (d.is_wicket && !['RETIRED_HURT'].includes(d.wicket_type)) {
          overWickets++;
          cumulativeWickets++;
          wicketCounter++;
          wicketsFallen.push({
            wicket_number: wicketCounter,
            player_id: d.dismissed_player_id,
            player_name: d.dismissed_player_name,
            over_number: d.over_number,
            ball_number: d.legal_ball_number || d.ball_number,
            overs_display: `${d.over_number - 1}.${d.legal_ball_number || legalBalls}`,
            score_at_fall: cumulativeRuns,
            wicket_type: d.wicket_type,
            bowler_name: d.bowler_name,
          });
        }
      }

      const isCompleted = ov.is_completed || legalBalls >= ballsPerOver;

      manhattanBars.push({
        over_number: ov.over_number,
        runs: overRuns,
        wickets: overWickets,
        legal_balls: legalBalls,
        is_completed: isCompleted,
        bowler_id: ov.bowler_id,
        bowler_name: ov.bowler_name,
      });

      wormCurve.push({
        over: ov.over_number,
        overs_display: isCompleted
          ? `${ov.over_number}.0`
          : `${ov.over_number - 1}.${legalBalls}`,
        runs: cumulativeRuns,
        wickets: cumulativeWickets,
        is_completed: isCompleted,
      });
    }

    return { wormCurve, manhattanBars, wicketsFallen };
  }

  /**
   * Computes active and historical partnerships across deliveries.
   * Never includes reverted deliveries.
   */
  _computePartnerships(deliveries, innings) {
    const historicalPartnerships = [];

    let currentRuns = 0;
    let currentBalls = 0;
    let currentExtras = 0;
    let batter1 = null;
    let batter2 = null;
    let wicketIndex = 0;

    const initBatter = (id, name) => ({ id, name, runs: 0, balls: 0, fours: 0, sixes: 0 });

    for (const d of deliveries) {
      if (!batter1) {
        batter1 = initBatter(d.striker_id, d.striker_name);
      }
      if (!batter2) {
        batter2 = initBatter(d.non_striker_id, d.non_striker_name);
      }

      // Ensure both current batters match the delivery batters
      if (batter1.id !== d.striker_id && batter1.id !== d.non_striker_id) {
        batter1 = initBatter(d.striker_id, d.striker_name);
      }
      if (batter2.id !== d.striker_id && batter2.id !== d.non_striker_id) {
        batter2 = initBatter(d.non_striker_id, d.non_striker_name);
      }

      // Attribute batter runs
      if (d.striker_id === batter1.id) {
        batter1.runs += d.runs_batter;
        if (d.extra_type !== 'WIDE') batter1.balls += 1;
        if (d.runs_batter === 4) batter1.fours += 1;
        if (d.runs_batter === 6) batter1.sixes += 1;
      } else if (d.striker_id === batter2.id) {
        batter2.runs += d.runs_batter;
        if (d.extra_type !== 'WIDE') batter2.balls += 1;
        if (d.runs_batter === 4) batter2.fours += 1;
        if (d.runs_batter === 6) batter2.sixes += 1;
      }

      currentRuns += (d.runs_batter + d.runs_extras);
      currentExtras += d.runs_extras;
      if (d.is_legal) {
        currentBalls += 1;
      }

      // Check if wicket fell
      if (d.is_wicket && !['RETIRED_HURT'].includes(d.wicket_type)) {
        wicketIndex++;
        historicalPartnerships.push({
          wicket_number: wicketIndex,
          runs: currentRuns,
          balls: currentBalls,
          extras: currentExtras,
          dismissed_player_id: d.dismissed_player_id,
          dismissed_player_name: d.dismissed_player_name,
          batter_1: { ...batter1 },
          batter_2: { ...batter2 },
        });

        // Reset partnership for incoming batter
        currentRuns = 0;
        currentBalls = 0;
        currentExtras = 0;

        // The surviving batter stays, the dismissed batter is cleared
        if (d.dismissed_player_id === batter1.id) {
          batter1 = null;
        } else {
          batter2 = null;
        }
      }
    }

    // Active (unbroken) partnership
    let activePartnership = null;
    if (innings.status !== 'COMPLETED' && (batter1 || batter2 || deliveries.length === 0)) {
      activePartnership = {
        runs: currentRuns,
        balls: currentBalls,
        extras: currentExtras,
        batter_1: batter1 || { id: innings.current_striker_id, name: 'Striker', runs: 0, balls: 0, fours: 0, sixes: 0 },
        batter_2: batter2 || { id: innings.current_non_striker_id, name: 'Non-Striker', runs: 0, balls: 0, fours: 0, sixes: 0 },
      };
    }

    return { activePartnership, historicalPartnerships };
  }
}
