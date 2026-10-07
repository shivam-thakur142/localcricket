// ====================================================================
// RECORDS SERVICE: TOURNAMENT HISTORICAL HIGH-WATER MARKS & ARCHIVE
// ====================================================================

import { ApiError } from '../utils/ApiError.js';

export class RecordsService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Format legal balls into overs display (e.g. 120 -> "20.0")
   */
  formatOvers(legalBalls) {
    if (legalBalls == null) return '0.0';
    return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
  }

  /**
   * Get all authoritative tournament records with deterministic tie-breaking.
   * Considers COMPLETED matches only (excludes SCHEDULED, IN_PROGRESS, ABANDONED, NO_RESULT).
   */
  async getTournamentRecords(tournamentId) {
    // 1. Validate tournament existence
    const tRes = await this.db.query(
      `SELECT id, name, status, overs_per_innings, balls_per_over FROM tournaments WHERE id = $1;`,
      [tournamentId]
    );

    if (tRes.rows.length === 0) {
      throw ApiError.notFound(`Tournament with ID ${tournamentId} not found`);
    }

    const tournament = tRes.rows[0];

    // 2. Highest Team Total
    // Deterministic cascade: total_runs DESC, total_legal_balls ASC, total_wickets ASC, match_number ASC, innings_number ASC, innings.id ASC
    const highestTotalRes = await this.db.query(
      `SELECT i.id as innings_id, i.match_id, i.innings_number, i.total_runs, i.total_wickets, i.total_legal_balls,
              t.id as team_id, t.name as team_name, opp.name as opponent_name, m.match_number
       FROM innings i
       JOIN matches m ON i.match_id = m.id
       JOIN tournament_teams tt ON i.batting_team_id = tt.id
       JOIN teams t ON tt.team_id = t.id
       JOIN tournament_teams opp_tt ON i.bowling_team_id = opp_tt.id
       JOIN teams opp ON opp_tt.team_id = opp.id
       WHERE m.tournament_id = $1 AND m.status = 'COMPLETED' AND m.result_type <> 'NO_RESULT'
       ORDER BY i.total_runs DESC, i.total_legal_balls ASC, i.total_wickets ASC, m.match_number ASC, i.innings_number ASC, i.id ASC
       LIMIT 1;`,
      [tournamentId]
    );

    // 3. Lowest Team Total
    // Completed innings only (all out, quota completed, or chase completed)
    // Deterministic cascade: total_runs ASC, total_wickets DESC, total_legal_balls ASC, match_number ASC, innings_number ASC, innings.id ASC
    const lowestTotalRes = await this.db.query(
      `SELECT i.id as innings_id, i.match_id, i.innings_number, i.total_runs, i.total_wickets, i.total_legal_balls,
              t.id as team_id, t.name as team_name, opp.name as opponent_name, m.match_number
       FROM innings i
       JOIN matches m ON i.match_id = m.id
       JOIN tournament_teams tt ON i.batting_team_id = tt.id
       JOIN teams t ON tt.team_id = t.id
       JOIN tournament_teams opp_tt ON i.bowling_team_id = opp_tt.id
       JOIN teams opp ON opp_tt.team_id = opp.id
       WHERE m.tournament_id = $1 AND m.status = 'COMPLETED' AND m.result_type <> 'NO_RESULT'
         AND i.status = 'COMPLETED'
         AND (i.total_wickets >= 10 OR i.total_legal_balls >= (m.overs_quota * 6) OR i.innings_number = 2)
       ORDER BY i.total_runs ASC, i.total_wickets DESC, i.total_legal_balls ASC, m.match_number ASC, i.innings_number ASC, i.id ASC
       LIMIT 1;`,
      [tournamentId]
    );

    // 4. Largest Victory Margin by Runs
    // Deterministic cascade: margin_runs DESC, runs_conceded ASC, overs_quota DESC, match_number ASC, match.id ASC
    const largestMarginRunsRes = await this.db.query(
      `SELECT m.id as match_id, m.match_number, m.result_margin_runs as margin_runs, m.overs_quota,
              wt.id as winner_team_id, wt.name as winner_team_name,
              lt.name as opponent_name,
              (SELECT total_runs FROM innings WHERE match_id = m.id AND batting_team_id <> m.winner_team_id LIMIT 1) as runs_conceded
       FROM matches m
       JOIN tournament_teams wtt ON m.winner_team_id = wtt.id
       JOIN teams wt ON wtt.team_id = wt.id
       JOIN tournament_teams ltt ON (CASE WHEN m.team_a_id = m.winner_team_id THEN m.team_b_id ELSE m.team_a_id END) = ltt.id
       JOIN teams lt ON ltt.team_id = lt.id
       WHERE m.tournament_id = $1 AND m.status = 'COMPLETED' AND m.result_type = 'NORMAL' AND m.result_margin_runs IS NOT NULL AND m.result_margin_runs > 0
       ORDER BY m.result_margin_runs DESC, runs_conceded ASC, m.overs_quota DESC, m.match_number ASC, m.id ASC
       LIMIT 1;`,
      [tournamentId]
    );

    // 5. Largest Victory Margin by Wickets
    // Deterministic cascade: margin_wickets DESC, balls_remaining DESC, runs_chased DESC, match_number ASC, match.id ASC
    const largestMarginWktsRes = await this.db.query(
      `SELECT m.id as match_id, m.match_number, m.result_margin_wickets as margin_wickets,
              wt.id as winner_team_id, wt.name as winner_team_name,
              lt.name as opponent_name,
              ((m.overs_quota * 6) - (SELECT total_legal_balls FROM innings WHERE match_id = m.id AND batting_team_id = m.winner_team_id LIMIT 1)) as balls_remaining,
              (SELECT total_runs FROM innings WHERE match_id = m.id AND batting_team_id = m.winner_team_id LIMIT 1) as runs_chased
       FROM matches m
       JOIN tournament_teams wtt ON m.winner_team_id = wtt.id
       JOIN teams wt ON wtt.team_id = wt.id
       JOIN tournament_teams ltt ON (CASE WHEN m.team_a_id = m.winner_team_id THEN m.team_b_id ELSE m.team_a_id END) = ltt.id
       JOIN teams lt ON ltt.team_id = lt.id
       WHERE m.tournament_id = $1 AND m.status = 'COMPLETED' AND m.result_type = 'NORMAL' AND m.result_margin_wickets IS NOT NULL AND m.result_margin_wickets > 0
       ORDER BY m.result_margin_wickets DESC, balls_remaining DESC, runs_chased DESC, m.match_number ASC, m.id ASC
       LIMIT 1;`,
      [tournamentId]
    );

    // 6. Highest Match Aggregate
    // Deterministic cascade: combined_runs DESC, combined_wickets DESC, combined_legal_balls ASC, match_number ASC, match.id ASC
    const highestAggregateRes = await this.db.query(
      `SELECT m.id as match_id, m.match_number,
              t_a.name as team_a_name, t_b.name as team_b_name,
              SUM(i.total_runs)::int as total_runs,
              SUM(i.total_wickets)::int as total_wickets,
              SUM(i.total_legal_balls)::int as total_legal_balls
       FROM matches m
       JOIN innings i ON i.match_id = m.id
       JOIN tournament_teams tt_a ON m.team_a_id = tt_a.id
       JOIN teams t_a ON tt_a.team_id = t_a.id
       JOIN tournament_teams tt_b ON m.team_b_id = tt_b.id
       JOIN teams t_b ON tt_b.team_id = t_b.id
       WHERE m.tournament_id = $1 AND m.status = 'COMPLETED' AND m.result_type <> 'NO_RESULT'
       GROUP BY m.id, m.match_number, t_a.name, t_b.name
       ORDER BY total_runs DESC, total_wickets DESC, total_legal_balls ASC, m.match_number ASC, m.id ASC
       LIMIT 1;`,
      [tournamentId]
    );

    // 7. Highest Individual Score in an Innings
    // Deterministic cascade: runs_scored DESC, is_out ASC (unbeaten first), balls_faced ASC, sixes DESC, fours DESC, match_number ASC, player.id ASC
    const highestIndividualScoreRes = await this.db.query(
      `SELECT bp.player_id, p.full_name as player_name, bp.runs_scored, bp.is_out, bp.balls_faced, bp.fours, bp.sixes,
              t.name as team_name, opp.name as opponent_name, m.id as match_id, m.match_number
       FROM batting_performances bp
       JOIN players p ON bp.player_id = p.id
       JOIN innings i ON bp.innings_id = i.id
       JOIN matches m ON i.match_id = m.id
       JOIN tournament_teams tt ON i.batting_team_id = tt.id
       JOIN teams t ON tt.team_id = t.id
       JOIN tournament_teams opp_tt ON i.bowling_team_id = opp_tt.id
       JOIN teams opp ON opp_tt.team_id = opp.id
       WHERE m.tournament_id = $1 AND m.status = 'COMPLETED' AND m.result_type <> 'NO_RESULT'
       ORDER BY bp.runs_scored DESC, bp.is_out ASC, bp.balls_faced ASC, bp.sixes DESC, bp.fours DESC, m.match_number ASC, p.id ASC
       LIMIT 1;`,
      [tournamentId]
    );

    // 8. Most Sixes in an Innings
    // Deterministic cascade: sixes DESC, balls_faced ASC, runs_scored DESC, match_number ASC, player.id ASC
    const mostSixesRes = await this.db.query(
      `SELECT bp.player_id, p.full_name as player_name, bp.sixes, bp.runs_scored, bp.balls_faced,
              t.name as team_name, m.id as match_id, m.match_number
       FROM batting_performances bp
       JOIN players p ON bp.player_id = p.id
       JOIN innings i ON bp.innings_id = i.id
       JOIN matches m ON i.match_id = m.id
       JOIN tournament_teams tt ON i.batting_team_id = tt.id
       JOIN teams t ON tt.team_id = t.id
       WHERE m.tournament_id = $1 AND m.status = 'COMPLETED' AND m.result_type <> 'NO_RESULT' AND bp.sixes > 0
       ORDER BY bp.sixes DESC, bp.balls_faced ASC, bp.runs_scored DESC, m.match_number ASC, p.id ASC
       LIMIT 1;`,
      [tournamentId]
    );

    // 9. Best Bowling Figures in an Innings
    // Deterministic cascade: wickets DESC, runs_conceded ASC, legal_balls_bowled ASC, maidens DESC, match_number ASC, player.id ASC
    const bestBowlingFiguresRes = await this.db.query(
      `SELECT bi.player_id, p.full_name as player_name, bi.wickets, bi.runs_conceded, bi.legal_balls_bowled, bi.maidens,
              t.name as team_name, opp.name as opponent_name, m.id as match_id, m.match_number
       FROM bowling_performances bi
       JOIN players p ON bi.player_id = p.id
       JOIN innings i ON bi.innings_id = i.id
       JOIN matches m ON i.match_id = m.id
       JOIN tournament_teams tt ON i.bowling_team_id = tt.id
       JOIN teams t ON tt.team_id = t.id
       JOIN tournament_teams opp_tt ON i.batting_team_id = opp_tt.id
       JOIN teams opp ON opp_tt.team_id = opp.id
       WHERE m.tournament_id = $1 AND m.status = 'COMPLETED' AND m.result_type <> 'NO_RESULT' AND bi.legal_balls_bowled > 0
       ORDER BY bi.wickets DESC, bi.runs_conceded ASC, bi.legal_balls_bowled ASC, bi.maidens DESC, m.match_number ASC, p.id ASC
       LIMIT 1;`,
      [tournamentId]
    );

    // 10. Most Maidens in an Innings
    // Deterministic cascade: maidens DESC, runs_conceded ASC, wickets DESC, legal_balls_bowled DESC, match_number ASC, player.id ASC
    const mostMaidensRes = await this.db.query(
      `SELECT bi.player_id, p.full_name as player_name, bi.maidens, bi.runs_conceded, bi.wickets, bi.legal_balls_bowled,
              t.name as team_name, m.id as match_id, m.match_number
       FROM bowling_performances bi
       JOIN players p ON bi.player_id = p.id
       JOIN innings i ON bi.innings_id = i.id
       JOIN matches m ON i.match_id = m.id
       JOIN tournament_teams tt ON i.bowling_team_id = tt.id
       JOIN teams t ON tt.team_id = t.id
       WHERE m.tournament_id = $1 AND m.status = 'COMPLETED' AND m.result_type <> 'NO_RESULT' AND bi.maidens > 0
       ORDER BY bi.maidens DESC, bi.runs_conceded ASC, bi.wickets DESC, bi.legal_balls_bowled DESC, m.match_number ASC, p.id ASC
       LIMIT 1;`,
      [tournamentId]
    );

    // 11. Partnership-by-Wicket Records (Wickets 1 to 10)
    const partnershipRecords = await this.calculatePartnershipRecords(tournamentId);

    // Format Records
    const teamRecords = {
      highest_innings_total: highestTotalRes.rows[0]
        ? {
            team_id: highestTotalRes.rows[0].team_id,
            team_name: highestTotalRes.rows[0].team_name,
            runs: highestTotalRes.rows[0].total_runs,
            wickets: highestTotalRes.rows[0].total_wickets,
            overs: this.formatOvers(highestTotalRes.rows[0].total_legal_balls),
            opponent_name: highestTotalRes.rows[0].opponent_name,
            match_id: highestTotalRes.rows[0].match_id,
            match_number: highestTotalRes.rows[0].match_number,
          }
        : null,
      lowest_innings_total: lowestTotalRes.rows[0]
        ? {
            team_id: lowestTotalRes.rows[0].team_id,
            team_name: lowestTotalRes.rows[0].team_name,
            runs: lowestTotalRes.rows[0].total_runs,
            wickets: lowestTotalRes.rows[0].total_wickets,
            overs: this.formatOvers(lowestTotalRes.rows[0].total_legal_balls),
            opponent_name: lowestTotalRes.rows[0].opponent_name,
            match_id: lowestTotalRes.rows[0].match_id,
            match_number: lowestTotalRes.rows[0].match_number,
          }
        : null,
      largest_victory_margin_runs: largestMarginRunsRes.rows[0]
        ? {
            winner_team_id: largestMarginRunsRes.rows[0].winner_team_id,
            winner_team_name: largestMarginRunsRes.rows[0].winner_team_name,
            margin_runs: largestMarginRunsRes.rows[0].margin_runs,
            opponent_name: largestMarginRunsRes.rows[0].opponent_name,
            match_id: largestMarginRunsRes.rows[0].match_id,
            match_number: largestMarginRunsRes.rows[0].match_number,
          }
        : null,
      largest_victory_margin_wickets: largestMarginWktsRes.rows[0]
        ? {
            winner_team_id: largestMarginWktsRes.rows[0].winner_team_id,
            winner_team_name: largestMarginWktsRes.rows[0].winner_team_name,
            margin_wickets: largestMarginWktsRes.rows[0].margin_wickets,
            opponent_name: largestMarginWktsRes.rows[0].opponent_name,
            match_id: largestMarginWktsRes.rows[0].match_id,
            match_number: largestMarginWktsRes.rows[0].match_number,
          }
        : null,
      highest_match_aggregate: highestAggregateRes.rows[0]
        ? {
            total_runs: highestAggregateRes.rows[0].total_runs,
            wickets: highestAggregateRes.rows[0].total_wickets,
            overs: this.formatOvers(highestAggregateRes.rows[0].total_legal_balls),
            team_a_name: highestAggregateRes.rows[0].team_a_name,
            team_b_name: highestAggregateRes.rows[0].team_b_name,
            match_id: highestAggregateRes.rows[0].match_id,
            match_number: highestAggregateRes.rows[0].match_number,
          }
        : null,
    };

    const battingRecords = {
      highest_individual_score: highestIndividualScoreRes.rows[0]
        ? {
            player_id: highestIndividualScoreRes.rows[0].player_id,
            player_name: highestIndividualScoreRes.rows[0].player_name,
            runs: highestIndividualScoreRes.rows[0].runs_scored,
            is_out: highestIndividualScoreRes.rows[0].is_out,
            score_display: `${highestIndividualScoreRes.rows[0].runs_scored}${highestIndividualScoreRes.rows[0].is_out ? '' : '*'}`,
            balls: highestIndividualScoreRes.rows[0].balls_faced,
            fours: highestIndividualScoreRes.rows[0].fours,
            sixes: highestIndividualScoreRes.rows[0].sixes,
            team_name: highestIndividualScoreRes.rows[0].team_name,
            opponent_name: highestIndividualScoreRes.rows[0].opponent_name,
            match_id: highestIndividualScoreRes.rows[0].match_id,
            match_number: highestIndividualScoreRes.rows[0].match_number,
          }
        : null,
      most_sixes_in_innings: mostSixesRes.rows[0]
        ? {
            player_id: mostSixesRes.rows[0].player_id,
            player_name: mostSixesRes.rows[0].player_name,
            sixes: mostSixesRes.rows[0].sixes,
            runs: mostSixesRes.rows[0].runs_scored,
            balls: mostSixesRes.rows[0].balls_faced,
            team_name: mostSixesRes.rows[0].team_name,
            match_id: mostSixesRes.rows[0].match_id,
            match_number: mostSixesRes.rows[0].match_number,
          }
        : null,
    };

    const bowlingRecords = {
      best_bowling_figures: bestBowlingFiguresRes.rows[0]
        ? {
            player_id: bestBowlingFiguresRes.rows[0].player_id,
            player_name: bestBowlingFiguresRes.rows[0].player_name,
            wickets: bestBowlingFiguresRes.rows[0].wickets,
            runs_conceded: bestBowlingFiguresRes.rows[0].runs_conceded,
            figures_display: `${bestBowlingFiguresRes.rows[0].wickets}/${bestBowlingFiguresRes.rows[0].runs_conceded}`,
            overs: this.formatOvers(bestBowlingFiguresRes.rows[0].legal_balls_bowled),
            maidens: bestBowlingFiguresRes.rows[0].maidens,
            team_name: bestBowlingFiguresRes.rows[0].team_name,
            opponent_name: bestBowlingFiguresRes.rows[0].opponent_name,
            match_id: bestBowlingFiguresRes.rows[0].match_id,
            match_number: bestBowlingFiguresRes.rows[0].match_number,
          }
        : null,
      most_maidens_in_innings: mostMaidensRes.rows[0]
        ? {
            player_id: mostMaidensRes.rows[0].player_id,
            player_name: mostMaidensRes.rows[0].player_name,
            maidens: mostMaidensRes.rows[0].maidens,
            runs_conceded: mostMaidensRes.rows[0].runs_conceded,
            wickets: mostMaidensRes.rows[0].wickets,
            overs: this.formatOvers(mostMaidensRes.rows[0].legal_balls_bowled),
            team_name: mostMaidensRes.rows[0].team_name,
            match_id: mostMaidensRes.rows[0].match_id,
            match_number: mostMaidensRes.rows[0].match_number,
          }
        : null,
    };

    return {
      tournament_id: tournamentId,
      tournament_name: tournament.name,
      team_records: teamRecords,
      batting_records: battingRecords,
      bowling_records: bowlingRecords,
      partnership_records: partnershipRecords,
    };
  }

  /**
   * Deterministically compute the highest partnership for each wicket (1 to 10)
   * Across all completed matches in the tournament, excluding reverted deliveries.
   */
  async calculatePartnershipRecords(tournamentId) {
    // 1. Get all completed innings in tournament
    const innRes = await this.db.query(
      `SELECT i.id as innings_id, i.match_id, i.innings_number, m.match_number,
              t.name as team_name, opp.name as opponent_name
       FROM innings i
       JOIN matches m ON i.match_id = m.id
       JOIN tournament_teams tt ON i.batting_team_id = tt.id
       JOIN teams t ON tt.team_id = t.id
       JOIN tournament_teams opp_tt ON i.bowling_team_id = opp_tt.id
       JOIN teams opp ON opp_tt.team_id = opp.id
       WHERE m.tournament_id = $1 AND m.status = 'COMPLETED' AND m.result_type <> 'NO_RESULT'
       ORDER BY m.match_number ASC, i.innings_number ASC;`,
      [tournamentId]
    );

    const bestPartnershipsByWicket = {};
    for (let w = 1; w <= 10; w++) {
      bestPartnershipsByWicket[w] = null;
    }

    for (const inn of innRes.rows) {
      // Get all un-reverted deliveries for this innings in sequence order
      const delRes = await this.db.query(
        `SELECT d.delivery_sequence, d.striker_id, d.non_striker_id, d.runs_batter, d.runs_extras,
                d.is_legal, d.is_wicket, d.dismissed_player_id,
                p_st.full_name as striker_name, p_ns.full_name as non_striker_name
         FROM deliveries d
         JOIN players p_st ON d.striker_id = p_st.id
         JOIN players p_ns ON d.non_striker_id = p_ns.id
         WHERE d.innings_id = $1 AND d.is_reverted = FALSE
         ORDER BY d.delivery_sequence ASC;`,
        [inn.innings_id]
      );

      if (delRes.rows.length === 0) continue;

      let currentWicket = 1;
      let partRuns = 0;
      let partBalls = 0;
      let batter1 = null;
      let batter2 = null;

      for (const d of delRes.rows) {
        // Track the two batters participating in this partnership
        if (!batter1) {
          batter1 = { id: d.striker_id, name: d.striker_name, runs: 0, balls: 0 };
          batter2 = { id: d.non_striker_id, name: d.non_striker_name, runs: 0, balls: 0 };
        } else if (!batter2) {
          if (d.striker_id === batter1.id) {
            batter2 = { id: d.non_striker_id, name: d.non_striker_name, runs: 0, balls: 0 };
          } else {
            batter2 = { id: d.striker_id, name: d.striker_name, runs: 0, balls: 0 };
          }
        } else {
          // Update batter identity if a new player arrived
          const knownIds = [batter1.id, batter2.id];
          if (!knownIds.includes(d.striker_id)) {
            // New striker replaces someone
            batter2 = { id: d.striker_id, name: d.striker_name, runs: 0, balls: 0 };
          } else if (!knownIds.includes(d.non_striker_id)) {
            // New non-striker replaces someone
            batter2 = { id: d.non_striker_id, name: d.non_striker_name, runs: 0, balls: 0 };
          }
        }

        // Add runs and balls
        partRuns += (d.runs_batter + d.runs_extras);
        if (d.is_legal) {
          partBalls += 1;
        }

        if (batter1 && d.striker_id === batter1.id) {
          batter1.runs += d.runs_batter;
          if (d.is_legal) batter1.balls += 1;
        } else if (batter2 && d.striker_id === batter2.id) {
          batter2.runs += d.runs_batter;
          if (d.is_legal) batter2.balls += 1;
        }

        if (d.is_wicket && d.dismissed_player_id) {
          // Wicket fell! Record partnership for currentWicket (broken)
          this.evaluatePartnershipCandidate(
            bestPartnershipsByWicket,
            currentWicket,
            {
              wicket: currentWicket,
              runs: partRuns,
              balls: partBalls,
              is_unbroken: false,
              batter_1_name: batter1 ? batter1.name : d.striker_name,
              batter_2_name: batter2 ? batter2.name : d.non_striker_name,
              team_name: inn.team_name,
              opponent_name: inn.opponent_name,
              match_id: inn.match_id,
              match_number: inn.match_number,
              innings_id: inn.innings_id,
            }
          );

          // Reset for next wicket
          currentWicket += 1;
          partRuns = 0;
          partBalls = 0;
          // Retain surviving batter
          const survivingBatter = (batter1 && d.dismissed_player_id === batter1.id) ? batter2 : batter1;
          batter1 = survivingBatter ? { id: survivingBatter.id, name: survivingBatter.name, runs: 0, balls: 0 } : null;
          batter2 = null; // will be populated on next ball
        }
      }

      // If the innings completed and there are remaining uncompleted runs/balls,
      // it constitutes an UNBROKEN partnership for currentWicket!
      if (partBalls > 0 || partRuns > 0) {
        if (currentWicket <= 10 && batter1) {
          this.evaluatePartnershipCandidate(
            bestPartnershipsByWicket,
            currentWicket,
            {
              wicket: currentWicket,
              runs: partRuns,
              balls: partBalls,
              is_unbroken: true,
              batter_1_name: batter1.name,
              batter_2_name: batter2 ? batter2.name : 'Partner',
              team_name: inn.team_name,
              opponent_name: inn.opponent_name,
              match_id: inn.match_id,
              match_number: inn.match_number,
              innings_id: inn.innings_id,
            }
          );
        }
      }
    }

    // Convert map to sorted array of non-null records
    const result = [];
    for (let w = 1; w <= 10; w++) {
      if (bestPartnershipsByWicket[w]) {
        result.push(bestPartnershipsByWicket[w]);
      }
    }
    return result;
  }

  /**
   * Deterministic partnership tie-break:
   * runs DESC -> balls ASC -> is_unbroken DESC -> match_number ASC -> innings_id ASC
   */
  evaluatePartnershipCandidate(bestMap, wicket, candidate) {
    if (wicket < 1 || wicket > 10) return;
    const existing = bestMap[wicket];
    if (!existing) {
      bestMap[wicket] = candidate;
      return;
    }

    if (candidate.runs > existing.runs) {
      bestMap[wicket] = candidate;
    } else if (candidate.runs === existing.runs) {
      if (candidate.balls < existing.balls) {
        bestMap[wicket] = candidate;
      } else if (candidate.balls === existing.balls) {
        if (candidate.is_unbroken && !existing.is_unbroken) {
          bestMap[wicket] = candidate;
        } else if (candidate.is_unbroken === existing.is_unbroken) {
          if (candidate.match_number < existing.match_number) {
            bestMap[wicket] = candidate;
          } else if (candidate.match_number === existing.match_number) {
            if (candidate.innings_id < existing.innings_id) {
              bestMap[wicket] = candidate;
            }
          }
        }
      }
    }
  }
}
