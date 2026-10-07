// ====================================================================
// AWARDS SERVICE: TOURNAMENT MVP & SPECIAL AWARDS CALCULATION ENGINE
// ====================================================================

import { ApiError } from '../utils/ApiError.js';

export class AwardsService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Calculate all tournament awards derived from authoritative completed match records
   * Includes both regular LEAGUE matches and KNOCKOUT playoff fixtures.
   */
  async getTournamentAwards(tournamentId) {
    // 1. Fetch tournament rules & details
    const tRes = await this.db.query(
      `SELECT id, name, status, max_overs_per_bowler, overs_per_innings, balls_per_over
       FROM tournaments
       WHERE id = $1;`,
      [tournamentId]
    );

    if (tRes.rows.length === 0) {
      throw ApiError.notFound(`Tournament with ID ${tournamentId} not found`);
    }

    const tournament = tRes.rows[0];
    const maxOvers = tournament.max_overs_per_bowler || 4;
    // Minimum qualifying legal balls = max_overs * 6 * 2 (e.g., 48 balls in T20)
    const minQualifyingBalls = maxOvers * 6 * 2;

    // 2. Fetch all completed match IDs for this tournament
    const mRes = await this.db.query(
      `SELECT id, player_of_the_match_id
       FROM matches
       WHERE tournament_id = $1 AND status = 'COMPLETED';`,
      [tournamentId]
    );

    const completedMatches = mRes.rows;
    const completedMatchIds = completedMatches.map((m) => m.id);

    if (completedMatchIds.length === 0) {
      return {
        tournament_id: tournamentId,
        tournament_name: tournament.name,
        qualification_minimum_balls: minQualifyingBalls,
        mvp: null,
        mvp_podium: [],
        best_batter: null,
        best_bowler: null,
        maximum_sixes: null,
        most_economical_bowler: null,
      };
    }

    // 3. Batting Performances for all completed matches (un-reverted)
    const battingRes = await this.db.query(
      `SELECT bp.player_id, p.full_name, p.nickname, tea.name AS team_name, tea.short_name AS team_short_name,
              bp.runs_scored, bp.balls_faced, bp.fours, bp.sixes, bp.is_out
       FROM batting_performances bp
       JOIN innings inn ON bp.innings_id = inn.id
       JOIN matches m ON inn.match_id = m.id
       JOIN players p ON bp.player_id = p.id
       JOIN tournament_teams ta ON inn.batting_team_id = ta.id
       JOIN teams tea ON ta.team_id = tea.id
       WHERE m.tournament_id = $1 AND m.status = 'COMPLETED';`,
      [tournamentId]
    );

    // 4. Bowling Performances for all completed matches (un-reverted)
    const bowlingRes = await this.db.query(
      `SELECT bi.player_id, p.full_name, p.nickname, teb.name AS team_name, teb.short_name AS team_short_name,
              bi.legal_balls_bowled, bi.maidens, bi.runs_conceded, bi.wickets
       FROM bowling_performances bi
       JOIN innings inn ON bi.innings_id = inn.id
       JOIN matches m ON inn.match_id = m.id
       JOIN players p ON bi.player_id = p.id
       JOIN tournament_teams tb ON inn.bowling_team_id = tb.id
       JOIN teams teb ON tb.team_id = teb.id
       WHERE m.tournament_id = $1 AND m.status = 'COMPLETED';`,
      [tournamentId]
    );

    // 5. Fielding Dismissals (strictly un-reverted deliveries)
    const fieldingRes = await this.db.query(
      `SELECT d.assist_player_id AS player_id, p.full_name, p.nickname,
              d.wicket_type
       FROM deliveries d
       JOIN innings inn ON d.innings_id = inn.id
       JOIN matches m ON inn.match_id = m.id
       JOIN players p ON d.assist_player_id = p.id
       WHERE m.tournament_id = $1
         AND m.status = 'COMPLETED'
         AND d.is_reverted = FALSE
         AND d.is_wicket = TRUE
         AND d.assist_player_id IS NOT NULL;`,
      [tournamentId]
    );

    // Map POTM counts
    const potmCounts = new Map();
    for (const m of completedMatches) {
      if (m.player_of_the_match_id) {
        potmCounts.set(m.player_of_the_match_id, (potmCounts.get(m.player_of_the_match_id) || 0) + 1);
      }
    }

    // Map player aggregations for MVP and special awards
    const playerMap = new Map();

    const getOrCreatePlayer = (id, name, shortName, teamName, teamShort) => {
      if (!playerMap.has(id)) {
        playerMap.set(id, {
          player_id: id,
          player_name: name,
          team_name: teamName || '',
          team_short_name: teamShort || '',
          batting: {
            innings: 0,
            runs: 0,
            balls: 0,
            fours: 0,
            sixes: 0,
            not_outs: 0,
            dismissals: 0,
            milestone_bonus: 0,
            points: 0,
          },
          bowling: {
            innings: 0,
            legal_balls: 0,
            maidens: 0,
            runs_conceded: 0,
            wickets: 0,
            milestone_bonus: 0,
            economy_bonus: 0,
            points: 0,
          },
          fielding: {
            catches: 0,
            stumpings: 0,
            run_outs: 0,
            points: 0,
          },
          potm_count: potmCounts.get(id) || 0,
          potm_points: (potmCounts.get(id) || 0) * 25,
          total_mvp_points: 0,
        });
      }
      return playerMap.get(id);
    };

    // --- ACCUMULATE BATTING ---
    for (const bp of battingRes.rows) {
      const p = getOrCreatePlayer(bp.player_id, bp.full_name, bp.nickname, bp.team_name, bp.team_short_name);
      p.batting.innings += 1;
      p.batting.runs += bp.runs_scored;
      p.batting.balls += bp.balls_faced;
      p.batting.fours += bp.fours;
      p.batting.sixes += bp.sixes;
      if (bp.is_out) {
        p.batting.dismissals += 1;
      } else {
        p.batting.not_outs += 1;
      }

      // Non-cumulative milestone bonus: highest threshold only per innings
      let bonus = 0;
      if (bp.runs_scored >= 100) {
        bonus = 50;
      } else if (bp.runs_scored >= 50) {
        bonus = 25;
      } else if (bp.runs_scored >= 30) {
        bonus = 10;
      }
      p.batting.milestone_bonus += bonus;

      // Innings batting points: 1 pt per run, +1 per four, +2 per six, + milestone bonus
      const inningsBattingPts = bp.runs_scored + bp.fours * 1 + bp.sixes * 2 + bonus;
      p.batting.points += inningsBattingPts;
    }

    // --- ACCUMULATE BOWLING ---
    for (const bi of bowlingRes.rows) {
      const p = getOrCreatePlayer(bi.player_id, bi.full_name, bi.nickname, bi.team_name, bi.team_short_name);
      p.bowling.innings += 1;
      p.bowling.legal_balls += bi.legal_balls_bowled;
      p.bowling.maidens += bi.maidens;
      p.bowling.runs_conceded += bi.runs_conceded;
      p.bowling.wickets += bi.wickets;

      // Non-cumulative milestone bonus: highest threshold only per innings
      let bonus = 0;
      if (bi.wickets >= 5) {
        bonus = 50;
      } else if (bi.wickets >= 3) {
        bonus = 20;
      }
      p.bowling.milestone_bonus += bonus;

      // Economy bonus per innings: +10 pts if economy < 6.00 and min 12 legal balls bowled
      let econBonus = 0;
      if (bi.legal_balls_bowled >= 12) {
        const econ = (bi.runs_conceded / bi.legal_balls_bowled) * 6;
        if (econ < 6.0) {
          econBonus = 10;
        }
      }
      p.bowling.economy_bonus += econBonus;

      // Innings bowling points: 25 pts per wicket, 15 pts per maiden, + milestone + economy
      const inningsBowlPts = bi.wickets * 25 + bi.maidens * 15 + bonus + econBonus;
      p.bowling.points += inningsBowlPts;
    }

    // --- ACCUMULATE FIELDING ---
    for (const f of fieldingRes.rows) {
      const p = getOrCreatePlayer(f.player_id, f.full_name, f.nickname, '', '');
      if (f.wicket_type === 'CAUGHT') {
        p.fielding.catches += 1;
        p.fielding.points += 10;
      } else if (f.wicket_type === 'STUMPED') {
        p.fielding.stumpings += 1;
        p.fielding.points += 15;
      } else if (f.wicket_type === 'RUN_OUT') {
        p.fielding.run_outs += 1;
        p.fielding.points += 15;
      }
    }

    // Calculate total MVP points for each player
    const allPlayers = Array.from(playerMap.values()).map((p) => {
      p.total_mvp_points = p.batting.points + p.bowling.points + p.fielding.points + p.potm_points;
      return p;
    });

    // ==================================================================
    // 1. MVP RANKINGS (Deterministic Tie-Breaking)
    // ==================================================================
    const mvpSorted = [...allPlayers].sort((a, b) => {
      // 1. Total MVP Points DESC
      if (b.total_mvp_points !== a.total_mvp_points) return b.total_mvp_points - a.total_mvp_points;
      // 2. Runs Scored DESC
      if (b.batting.runs !== a.batting.runs) return b.batting.runs - a.batting.runs;
      // 3. Wickets Taken DESC
      if (b.bowling.wickets !== a.bowling.wickets) return b.bowling.wickets - a.bowling.wickets;
      // 4. Player UUID ASC
      return a.player_id.localeCompare(b.player_id);
    });

    const topMvp = mvpSorted.length > 0 ? mvpSorted[0] : null;
    const mvpPodium = mvpSorted.slice(0, 5);

    // ==================================================================
    // 2. BEST BATTER (ORANGE CAP)
    // ==================================================================
    const batters = allPlayers.filter((p) => p.batting.runs > 0);
    batters.sort((a, b) => {
      // 1. Runs DESC
      if (b.batting.runs !== a.batting.runs) return b.batting.runs - a.batting.runs;
      // 2. Average DESC (treat zero dismissals as high average)
      const avgA = a.batting.dismissals === 0 ? 999999 : a.batting.runs / a.batting.dismissals;
      const avgB = b.batting.dismissals === 0 ? 999999 : b.batting.runs / b.batting.dismissals;
      if (avgB !== avgA) return avgB - avgA;
      // 3. Strike Rate DESC
      const srA = a.batting.balls > 0 ? (a.batting.runs / a.batting.balls) * 100 : 0;
      const srB = b.batting.balls > 0 ? (b.batting.runs / b.batting.balls) * 100 : 0;
      if (srB !== srA) return srB - srA;
      // 4. Sixes DESC
      if (b.batting.sixes !== a.batting.sixes) return b.batting.sixes - a.batting.sixes;
      // 5. Fours DESC
      if (b.batting.fours !== a.batting.fours) return b.batting.fours - a.batting.fours;
      // 6. Player UUID ASC
      return a.player_id.localeCompare(b.player_id);
    });

    const bestBatter = batters.length > 0
      ? {
          player_id: batters[0].player_id,
          player_name: batters[0].player_name,
          team_name: batters[0].team_name,
          team_short_name: batters[0].team_short_name,
          runs: batters[0].batting.runs,
          innings: batters[0].batting.innings,
          average: batters[0].batting.dismissals > 0
            ? Number((batters[0].batting.runs / batters[0].batting.dismissals).toFixed(2))
            : null,
          strike_rate: batters[0].batting.balls > 0
            ? Number(((batters[0].batting.runs / batters[0].batting.balls) * 100).toFixed(2))
            : 0.0,
          fours: batters[0].batting.fours,
          sixes: batters[0].batting.sixes,
        }
      : null;

    // ==================================================================
    // 3. BEST BOWLER (PURPLE CAP)
    // ==================================================================
    const bowlers = allPlayers.filter((p) => p.bowling.wickets > 0);
    bowlers.sort((a, b) => {
      // 1. Wickets DESC
      if (b.bowling.wickets !== a.bowling.wickets) return b.bowling.wickets - a.bowling.wickets;
      // 2. Bowling Average ASC
      const avgA = a.bowling.runs_conceded / a.bowling.wickets;
      const avgB = b.bowling.runs_conceded / b.bowling.wickets;
      if (avgA !== avgB) return avgA - avgB;
      // 3. Economy Rate ASC
      const econA = (a.bowling.runs_conceded / a.bowling.legal_balls) * 6;
      const econB = (b.bowling.runs_conceded / b.bowling.legal_balls) * 6;
      if (econA !== econB) return econA - econB;
      // 4. Balls Bowled DESC
      if (b.bowling.legal_balls !== a.bowling.legal_balls) return b.bowling.legal_balls - a.bowling.legal_balls;
      // 5. Player UUID ASC
      return a.player_id.localeCompare(b.player_id);
    });

    const bestBowler = bowlers.length > 0
      ? {
          player_id: bowlers[0].player_id,
          player_name: bowlers[0].player_name,
          team_name: bowlers[0].team_name,
          team_short_name: bowlers[0].team_short_name,
          wickets: bowlers[0].bowling.wickets,
          innings: bowlers[0].bowling.innings,
          overs_display: `${Math.floor(bowlers[0].bowling.legal_balls / 6)}.${bowlers[0].bowling.legal_balls % 6}`,
          runs_conceded: bowlers[0].bowling.runs_conceded,
          average: Number((bowlers[0].bowling.runs_conceded / bowlers[0].bowling.wickets).toFixed(2)),
          economy: Number(((bowlers[0].bowling.runs_conceded / bowlers[0].bowling.legal_balls) * 6).toFixed(2)),
        }
      : null;

    // ==================================================================
    // 4. MAXIMUM SIXES AWARD
    // ==================================================================
    const sixHitters = allPlayers.filter((p) => p.batting.sixes > 0);
    sixHitters.sort((a, b) => {
      if (b.batting.sixes !== a.batting.sixes) return b.batting.sixes - a.batting.sixes;
      if (b.batting.runs !== a.batting.runs) return b.batting.runs - a.batting.runs;
      return a.player_id.localeCompare(b.player_id);
    });

    const maxSixes = sixHitters.length > 0
      ? {
          player_id: sixHitters[0].player_id,
          player_name: sixHitters[0].player_name,
          team_name: sixHitters[0].team_name,
          team_short_name: sixHitters[0].team_short_name,
          sixes: sixHitters[0].batting.sixes,
          runs: sixHitters[0].batting.runs,
        }
      : null;

    // ==================================================================
    // 5. MOST ECONOMICAL BOWLER (QUALIFICATION THRESHOLD ENFORCED)
    // ==================================================================
    const qualifiedEconBowlers = allPlayers.filter((p) => p.bowling.legal_balls >= minQualifyingBalls);
    qualifiedEconBowlers.sort((a, b) => {
      // 1. Economy Rate ASC
      const econA = (a.bowling.runs_conceded / a.bowling.legal_balls) * 6;
      const econB = (b.bowling.runs_conceded / b.bowling.legal_balls) * 6;
      if (econA !== econB) return econA - econB;
      // 2. Bowling Average ASC
      const avgA = a.bowling.wickets > 0 ? a.bowling.runs_conceded / a.bowling.wickets : 999999;
      const avgB = b.bowling.wickets > 0 ? b.bowling.runs_conceded / b.bowling.wickets : 999999;
      if (avgA !== avgB) return avgA - avgB;
      // 3. Wickets Taken DESC
      if (b.bowling.wickets !== a.bowling.wickets) return b.bowling.wickets - a.bowling.wickets;
      // 4. Player UUID ASC
      return a.player_id.localeCompare(b.player_id);
    });

    const economyWinner = qualifiedEconBowlers.length > 0
      ? {
          player_id: qualifiedEconBowlers[0].player_id,
          player_name: qualifiedEconBowlers[0].player_name,
          team_name: qualifiedEconBowlers[0].team_name,
          team_short_name: qualifiedEconBowlers[0].team_short_name,
          economy: Number(((qualifiedEconBowlers[0].bowling.runs_conceded / qualifiedEconBowlers[0].bowling.legal_balls) * 6).toFixed(2)),
          overs_display: `${Math.floor(qualifiedEconBowlers[0].bowling.legal_balls / 6)}.${qualifiedEconBowlers[0].bowling.legal_balls % 6}`,
          legal_balls: qualifiedEconBowlers[0].bowling.legal_balls,
          wickets: qualifiedEconBowlers[0].bowling.wickets,
          runs_conceded: qualifiedEconBowlers[0].bowling.runs_conceded,
        }
      : null;

    return {
      tournament_id: tournamentId,
      tournament_name: tournament.name,
      qualification_minimum_balls: minQualifyingBalls,
      mvp: topMvp,
      mvp_podium: mvpPodium,
      best_batter: bestBatter,
      best_bowler: bestBowler,
      maximum_sixes: maxSixes,
      most_economical_bowler: economyWinner,
    };
  }
}
