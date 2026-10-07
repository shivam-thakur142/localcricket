// ====================================================================
// POINTS TABLE & NET RUN RATE (NRR) ENGINE
// ====================================================================

import { ApiError } from '../utils/ApiError.js';

export const NRR_PLAYING_CONDITIONS = 'STANDARD_ALL_OUT_QUOTA';

/**
 * Format integer legal balls into cricket overs display string (e.g. 115 balls -> "19.1")
 */
export function formatBallsToOversStr(balls) {
  const overs = Math.floor(balls / 6);
  const remainingBalls = balls % 6;
  return `${overs}.${remainingBalls}`;
}

/**
 * Pure calculation for an individual match's NRR metrics under declared playing conditions:
 * nrr_playing_conditions = 'STANDARD_ALL_OUT_QUOTA'
 *
 * When an innings ends because batting team is all out before quota:
 * - Dismissed team's effective batting denominator = full quota
 * - Opposition's effective bowling denominator = full quota
 * - Actual legal balls are preserved separately
 */
export function calculateMatchNRR({ oversQuota, innings1, innings2 }) {
  const quotaBalls = oversQuota * 6;

  // Innings 1 evaluation
  const inn1ActualFaced = innings1.legalBalls;
  const inn1EffectiveFaced = innings1.isAllOut ? quotaBalls : innings1.legalBalls;
  const inn1EffectiveBowled = innings1.isAllOut ? quotaBalls : innings1.legalBalls;

  // Innings 2 evaluation
  const inn2ActualFaced = innings2.legalBalls;
  const inn2EffectiveFaced = innings2.isAllOut ? quotaBalls : innings2.legalBalls;
  const inn2EffectiveBowled = innings2.isAllOut ? quotaBalls : innings2.legalBalls;

  // Team 1 (batted inn1, bowled inn2)
  const team1RunsFor = innings1.runs;
  const team1ActualFaced = inn1ActualFaced;
  const team1EffectiveFaced = inn1EffectiveFaced;

  const team1RunsAgainst = innings2.runs;
  const team1ActualBowled = inn2ActualFaced;
  const team1EffectiveBowled = inn2EffectiveBowled;

  const team1BattingRate = team1RunsFor / (team1EffectiveFaced / 6);
  const team1BowlingRate = team1RunsAgainst / (team1EffectiveBowled / 6);
  const team1NRR = Number((team1BattingRate - team1BowlingRate).toFixed(3));

  // Team 2 (bowled inn1, batted inn2)
  const team2RunsFor = innings2.runs;
  const team2ActualFaced = inn2ActualFaced;
  const team2EffectiveFaced = inn2EffectiveFaced;

  const team2RunsAgainst = innings1.runs;
  const team2ActualBowled = inn1ActualFaced;
  const team2EffectiveBowled = inn1EffectiveBowled;

  const team2BattingRate = team2RunsFor / (team2EffectiveFaced / 6);
  const team2BowlingRate = team2RunsAgainst / (team2EffectiveBowled / 6);
  const team2NRR = Number((team2BattingRate - team2BowlingRate).toFixed(3));

  return {
    [innings1.teamId]: {
      runsScored: team1RunsFor,
      actualBallsFaced: team1ActualFaced,
      effectiveBallsFaced: team1EffectiveFaced,
      runsConceded: team1RunsAgainst,
      actualBallsBowled: team1ActualBowled,
      effectiveBallsBowled: team1EffectiveBowled,
      battingRunRate: Number(team1BattingRate.toFixed(3)),
      bowlingConcededRate: Number(team1BowlingRate.toFixed(3)),
      netRunRate: team1NRR,
    },
    [innings2.teamId]: {
      runsScored: team2RunsFor,
      actualBallsFaced: team2ActualFaced,
      effectiveBallsFaced: team2EffectiveFaced,
      runsConceded: team2RunsAgainst,
      actualBallsBowled: team2ActualBowled,
      effectiveBallsBowled: team2EffectiveBowled,
      battingRunRate: Number(team2BattingRate.toFixed(3)),
      bowlingConcededRate: Number(team2BowlingRate.toFixed(3)),
      netRunRate: team2NRR,
    },
  };
}

export class PointsTableService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Recalculate complete tournament points table from authoritative match results
   */
  async recalculateTournamentPoints(tournamentId) {
    // 1. Fetch tournament rules & points config
    const tournRes = await this.db.query(
      `SELECT id, name, overs_per_innings, balls_per_over,
              points_for_win, points_for_tie, points_for_no_result, nrr_playing_conditions
       FROM tournaments WHERE id = $1`,
      [tournamentId]
    );
    if (tournRes.rows.length === 0) {
      throw ApiError.notFound(`Tournament ${tournamentId} not found`);
    }
    const tournament = tournRes.rows[0];
    const oversQuota = tournament.overs_per_innings || 20;
    const quotaBalls = oversQuota * (tournament.balls_per_over || 6);

    const pointsForWin = tournament.points_for_win ?? 2;
    const pointsForTie = tournament.points_for_tie ?? 1;
    const pointsForNoResult = tournament.points_for_no_result ?? 1;

    // 2. Fetch all registered tournament teams
    const teamsRes = await this.db.query(
      `SELECT tt.id AS tournament_team_id, tt.group_name, t.name AS team_name, t.short_name
       FROM tournament_teams tt
       JOIN teams t ON tt.team_id = t.id
       WHERE tt.tournament_id = $1`,
      [tournamentId]
    );
    const tournamentTeams = teamsRes.rows;

    // Initialize map
    const standingsMap = new Map();
    for (const tt of tournamentTeams) {
      standingsMap.set(tt.tournament_team_id, {
        tournament_team_id: tt.tournament_team_id,
        team_name: tt.team_name,
        short_name: tt.short_name,
        group_name: tt.group_name || 'General',
        matches_played: 0,
        matches_won: 0,
        matches_lost: 0,
        matches_tied: 0,
        matches_no_result: 0,
        points: 0,
        runs_scored_for: 0,
        actual_balls_faced: 0,
        effective_balls_faced: 0,
        runs_conceded_against: 0,
        actual_balls_bowled: 0,
        effective_balls_bowled: 0,
        net_run_rate: 0.000,
        overs_faced_display: '0.0',
        overs_bowled_display: '0.0',
      });
    }

    // 3. Fetch all completed or abandoned regular league matches in this tournament (strict playoff isolation)
    const matchesRes = await this.db.query(
      `SELECT id, team_a_id, team_b_id, status, result_type, winner_team_id, overs_quota
       FROM matches
       WHERE tournament_id = $1 AND stage = 'LEAGUE' AND status IN ('COMPLETED', 'ABANDONED', 'NO_RESULT')
       ORDER BY scheduled_start_time ASC`,
      [tournamentId]
    );
    const matches = matchesRes.rows;

    for (const match of matches) {
      const teamAStats = standingsMap.get(match.team_a_id);
      const teamBStats = standingsMap.get(match.team_b_id);
      if (!teamAStats || !teamBStats) continue;

      // Increment matches played
      teamAStats.matches_played += 1;
      teamBStats.matches_played += 1;

      // Handle Abandoned / No-Result
      if (
        match.status === 'ABANDONED' ||
        match.status === 'NO_RESULT' ||
        match.result_type === 'ABANDONED' ||
        match.result_type === 'NO_RESULT'
      ) {
        teamAStats.matches_no_result += 1;
        teamBStats.matches_no_result += 1;
        teamAStats.points += pointsForNoResult;
        teamBStats.points += pointsForNoResult;
        // Abandoned/No-Result contributes 0 runs and 0 overs to NRR
        continue;
      }

      // Handle Result Type: Tied vs Win/Loss
      if (match.result_type === 'TIED') {
        teamAStats.matches_tied += 1;
        teamBStats.matches_tied += 1;
        teamAStats.points += pointsForTie;
        teamBStats.points += pointsForTie;
      } else if (match.winner_team_id) {
        if (match.winner_team_id === match.team_a_id) {
          teamAStats.matches_won += 1;
          teamAStats.points += pointsForWin;
          teamBStats.matches_lost += 1;
        } else if (match.winner_team_id === match.team_b_id) {
          teamBStats.matches_won += 1;
          teamBStats.points += pointsForWin;
          teamAStats.matches_lost += 1;
        }
      }

      // Fetch regulation innings for NRR calculation
      const innRes = await this.db.query(
        `SELECT innings_number, batting_team_id, bowling_team_id,
                total_runs, total_wickets, total_legal_balls, status
         FROM innings
         WHERE match_id = $1
         ORDER BY innings_number ASC`,
        [match.id]
      );
      const inningsList = innRes.rows;
      if (inningsList.length === 0) continue;

      const matchQuotaBalls = (match.overs_quota || oversQuota) * 6;

      for (const inn of inningsList) {
        const battingStats = standingsMap.get(inn.batting_team_id);
        const bowlingStats = standingsMap.get(inn.bowling_team_id);
        if (!battingStats || !bowlingStats) continue;

        const runs = inn.total_runs || 0;
        const actualBalls = inn.total_legal_balls || 0;
        const isAllOut = inn.total_wickets >= 10;

        // Symmetric all-out rule under STANDARD_ALL_OUT_QUOTA:
        // When batting team is all out, both effective batting denominator
        // and opposition effective bowling denominator are raised to full quota.
        const effectiveBalls = isAllOut ? matchQuotaBalls : actualBalls;

        battingStats.runs_scored_for += runs;
        battingStats.actual_balls_faced += actualBalls;
        battingStats.effective_balls_faced += effectiveBalls;

        bowlingStats.runs_conceded_against += runs;
        bowlingStats.actual_balls_bowled += actualBalls;
        bowlingStats.effective_balls_bowled += effectiveBalls;
      }
    }

    // 4. Compute NRR, format display strings, and persist in points_table
    const results = [];
    for (const stats of standingsMap.values()) {
      let battingRate = 0;
      let bowlingRate = 0;

      if (stats.effective_balls_faced > 0) {
        battingRate = stats.runs_scored_for / (stats.effective_balls_faced / 6);
      }
      if (stats.effective_balls_bowled > 0) {
        bowlingRate = stats.runs_conceded_against / (stats.effective_balls_bowled / 6);
      }

      stats.net_run_rate = Number((battingRate - bowlingRate).toFixed(3));
      stats.overs_faced_display = formatBallsToOversStr(stats.actual_balls_faced);
      stats.overs_bowled_display = formatBallsToOversStr(stats.actual_balls_bowled);

      // Upsert into points_table
      await this.db.query(
        `INSERT INTO points_table (
          tournament_id, tournament_team_id, group_name,
          matches_played, matches_won, matches_lost, matches_tied, matches_no_result, points,
          runs_scored_for, actual_balls_faced, effective_balls_faced, overs_faced_display,
          runs_conceded_against, actual_balls_bowled, effective_balls_bowled, overs_bowled_display,
          net_run_rate, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW()
        )
        ON CONFLICT (tournament_id, tournament_team_id) DO UPDATE SET
          group_name = EXCLUDED.group_name,
          matches_played = EXCLUDED.matches_played,
          matches_won = EXCLUDED.matches_won,
          matches_lost = EXCLUDED.matches_lost,
          matches_tied = EXCLUDED.matches_tied,
          matches_no_result = EXCLUDED.matches_no_result,
          points = EXCLUDED.points,
          runs_scored_for = EXCLUDED.runs_scored_for,
          actual_balls_faced = EXCLUDED.actual_balls_faced,
          effective_balls_faced = EXCLUDED.effective_balls_faced,
          overs_faced_display = EXCLUDED.overs_faced_display,
          runs_conceded_against = EXCLUDED.runs_conceded_against,
          actual_balls_bowled = EXCLUDED.actual_balls_bowled,
          effective_balls_bowled = EXCLUDED.effective_balls_bowled,
          overs_bowled_display = EXCLUDED.overs_bowled_display,
          net_run_rate = EXCLUDED.net_run_rate,
          updated_at = NOW();`,
        [
          tournamentId,
          stats.tournament_team_id,
          stats.group_name,
          stats.matches_played,
          stats.matches_won,
          stats.matches_lost,
          stats.matches_tied,
          stats.matches_no_result,
          stats.points,
          stats.runs_scored_for,
          stats.actual_balls_faced,
          stats.effective_balls_faced,
          stats.overs_faced_display,
          stats.runs_conceded_against,
          stats.actual_balls_bowled,
          stats.effective_balls_bowled,
          stats.overs_bowled_display,
          stats.net_run_rate,
        ]
      );

      results.push(stats);
    }

    // 5. Sort standings by Points DESC, NRR DESC, Wins DESC, ID ASC
    results.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.net_run_rate !== a.net_run_rate) return b.net_run_rate - a.net_run_rate;
      if (b.matches_won !== a.matches_won) return b.matches_won - a.matches_won;
      return a.tournament_team_id.localeCompare(b.tournament_team_id);
    });

    return results;
  }

  /**
   * Get sorted standings table for a tournament
   */
  async getPointsTable(tournamentId) {
    const res = await this.db.query(
      `SELECT pt.*, t.name AS team_name, t.short_name
       FROM points_table pt
       JOIN tournament_teams tt ON pt.tournament_team_id = tt.id
       JOIN teams t ON tt.team_id = t.id
       WHERE pt.tournament_id = $1
       ORDER BY pt.points DESC, pt.net_run_rate DESC, pt.matches_won DESC, pt.tournament_team_id ASC`,
      [tournamentId]
    );
    return res.rows;
  }
}
