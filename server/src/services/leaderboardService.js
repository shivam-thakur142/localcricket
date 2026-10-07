// ====================================================================
// LEADERBOARD SERVICE: DETERMINISTIC TOURNAMENT PLAYER STATISTICS
// ====================================================================

import { ApiError } from '../utils/ApiError.js';

export class LeaderboardService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Get all tournament leaderboards (Batting, Bowling, Most Sixes, Most Fours)
   * Strictly isolated to the given tournamentId.
   */
  async getTournamentLeaderboards(tournamentId, { category = 'all', limit = 10 } = {}) {
    // 1. Verify tournament exists
    const tRes = await this.db.query(`SELECT id, name FROM tournaments WHERE id = $1;`, [tournamentId]);
    if (tRes.rows.length === 0) {
      throw ApiError.notFound(`Tournament with ID ${tournamentId} not found`);
    }

    const result = {
      tournament_id: tournamentId,
      tournament_name: tRes.rows[0].name,
      batting: [],
      bowling: [],
      sixes: [],
      fours: [],
    };

    if (category === 'all' || category === 'batting') {
      result.batting = await this.getBattingLeaderboard(tournamentId, limit);
    }
    if (category === 'all' || category === 'bowling') {
      result.bowling = await this.getBowlingLeaderboard(tournamentId, limit);
    }
    if (category === 'all' || category === 'sixes' || category === 'boundaries') {
      result.sixes = await this.getBoundariesLeaderboard(tournamentId, 'sixes', limit);
    }
    if (category === 'all' || category === 'fours' || category === 'boundaries') {
      result.fours = await this.getBoundariesLeaderboard(tournamentId, 'fours', limit);
    }

    return result;
  }

  /**
   * Deterministic Batting Leaderboard (Orange Cap)
   * Tie-breaking rules:
   * 1. runs_scored DESC
   * 2. batting_average DESC (undefeated 0 dismissals explicitly ranked higher than dismissed)
   * 3. strike_rate DESC
   * 4. sixes DESC
   * 5. fours DESC
   * 6. player_id ASC (stable tie-breaker)
   */
  async getBattingLeaderboard(tournamentId, limit = 10) {
    const res = await this.db.query(
      `SELECT p.id as player_id,
              p.full_name as player_name,
              tea.name as team_name,
              tea.short_name as team_short_name,
              COUNT(DISTINCT bp.innings_id)::int as innings_batted,
              COUNT(DISTINCT m.id)::int as matches_played,
              COALESCE(SUM(bp.runs_scored), 0)::int as total_runs,
              COALESCE(SUM(bp.balls_faced), 0)::int as total_balls_faced,
              COALESCE(SUM(bp.fours), 0)::int as total_fours,
              COALESCE(SUM(bp.sixes), 0)::int as total_sixes,
              COALESCE(MAX(bp.runs_scored), 0)::int as high_score,
              COALESCE(SUM(CASE WHEN bp.is_out = TRUE THEN 1 ELSE 0 END), 0)::int as total_dismissals
       FROM matches m
       JOIN innings inn ON inn.match_id = m.id
       JOIN batting_performances bp ON bp.innings_id = inn.id
       JOIN players p ON bp.player_id = p.id
       JOIN tournament_teams tt ON inn.batting_team_id = tt.id
       JOIN teams tea ON tt.team_id = tea.id
       WHERE m.tournament_id = $1
       GROUP BY p.id, p.full_name, tea.name, tea.short_name;`,
      [tournamentId]
    );

    const players = res.rows.map((row) => {
      const runs = row.total_runs;
      const balls = row.total_balls_faced;
      const dismissals = row.total_dismissals;

      // Explicit handling of zero dismissals vs dismissed
      let averageDisplay = '0.00';
      if (dismissals === 0) {
        averageDisplay = runs > 0 ? `${runs}*` : '0.00';
      } else {
        averageDisplay = (runs / dismissals).toFixed(2);
      }

      const strikeRate = balls > 0 ? ((runs / balls) * 100).toFixed(2) : '0.00';

      return {
        ...row,
        strike_rate: parseFloat(strikeRate),
        average_display: averageDisplay,
      };
    });

    // Pure deterministic sort function
    players.sort((a, b) => {
      // 1. Total runs DESC
      if (b.total_runs !== a.total_runs) {
        return b.total_runs - a.total_runs;
      }

      // 2. Batting average DESC (Explicit handling of zero dismissals)
      if (a.total_dismissals === 0 && b.total_dismissals > 0) {
        return -1; // a is undefeated, ranks higher
      }
      if (b.total_dismissals === 0 && a.total_dismissals > 0) {
        return 1; // b is undefeated, ranks higher
      }
      if (a.total_dismissals > 0 && b.total_dismissals > 0) {
        const avgA = a.total_runs / a.total_dismissals;
        const avgB = b.total_runs / b.total_dismissals;
        if (Math.abs(avgB - avgA) > 0.0001) {
          return avgB - avgA;
        }
      }

      // 3. Strike rate DESC
      if (Math.abs(b.strike_rate - a.strike_rate) > 0.0001) {
        return b.strike_rate - a.strike_rate;
      }

      // 4. Sixes DESC
      if (b.total_sixes !== a.total_sixes) {
        return b.total_sixes - a.total_sixes;
      }

      // 5. Fours DESC
      if (b.total_fours !== a.total_fours) {
        return b.total_fours - a.total_fours;
      }

      // 6. Stable tie-breaker: player_id ASC
      return a.player_id.localeCompare(b.player_id);
    });

    return players.slice(0, limit).map((p, idx) => ({ rank: idx + 1, ...p }));
  }

  /**
   * Deterministic Bowling Leaderboard (Purple Cap)
   * Tie-breaking rules:
   * 1. wickets DESC
   * 2. bowling_average ASC (runs_conceded / wickets; explicit handling of zero wickets)
   * 3. economy_rate ASC
   * 4. legal_balls_bowled DESC
   * 5. player_id ASC (stable tie-breaker)
   */
  async getBowlingLeaderboard(tournamentId, limit = 10) {
    const res = await this.db.query(
      `SELECT p.id as player_id,
              p.full_name as player_name,
              tea.name as team_name,
              tea.short_name as team_short_name,
              COUNT(DISTINCT bp.innings_id)::int as innings_bowled,
              COUNT(DISTINCT m.id)::int as matches_played,
              COALESCE(SUM(bp.wickets), 0)::int as total_wickets,
              COALESCE(SUM(bp.legal_balls_bowled), 0)::int as total_legal_balls,
              COALESCE(SUM(bp.runs_conceded), 0)::int as total_runs_conceded,
              COALESCE(SUM(bp.maidens), 0)::int as total_maidens
       FROM matches m
       JOIN innings inn ON inn.match_id = m.id
       JOIN bowling_performances bp ON bp.innings_id = inn.id
       JOIN players p ON bp.player_id = p.id
       JOIN tournament_teams tt ON inn.bowling_team_id = tt.id
       JOIN teams tea ON tt.team_id = tea.id
       WHERE m.tournament_id = $1
       GROUP BY p.id, p.full_name, tea.name, tea.short_name;`,
      [tournamentId]
    );

    const players = res.rows.map((row) => {
      const wickets = row.total_wickets;
      const balls = row.total_legal_balls;
      const runs = row.total_runs_conceded;

      const oversDisplay = `${Math.floor(balls / 6)}.${balls % 6}`;
      const oversDecimal = balls / 6.0;

      // Explicit handling of zero wickets
      const averageDisplay = wickets > 0 ? (runs / wickets).toFixed(2) : '-';
      const economyRate = oversDecimal > 0 ? parseFloat((runs / oversDecimal).toFixed(2)) : 0.0;

      return {
        ...row,
        overs_display: oversDisplay,
        average_display: averageDisplay,
        economy_rate: economyRate,
      };
    });

    players.sort((a, b) => {
      // 1. Total wickets DESC
      if (b.total_wickets !== a.total_wickets) {
        return b.total_wickets - a.total_wickets;
      }

      // 2. Bowling average ASC (lower is better, explicit check for zero wickets)
      if (a.total_wickets > 0 && b.total_wickets > 0) {
        const avgA = a.total_runs_conceded / a.total_wickets;
        const avgB = b.total_runs_conceded / b.total_wickets;
        if (Math.abs(avgA - avgB) > 0.0001) {
          return avgA - avgB;
        }
      }

      // 3. Economy rate ASC (lower is better)
      if (Math.abs(a.economy_rate - b.economy_rate) > 0.0001) {
        return a.economy_rate - b.economy_rate;
      }

      // 4. Legal balls bowled DESC (more balls bowled breaks tie)
      if (b.total_legal_balls !== a.total_legal_balls) {
        return b.total_legal_balls - a.total_legal_balls;
      }

      // 5. Stable tie-breaker: player_id ASC
      return a.player_id.localeCompare(b.player_id);
    });

    return players.slice(0, limit).map((p, idx) => ({ rank: idx + 1, ...p }));
  }

  /**
   * Deterministic Most Boundaries Leaderboard (Sixes or Fours)
   */
  async getBoundariesLeaderboard(tournamentId, type = 'sixes', limit = 10) {
    const isSixes = type === 'sixes';
    const battingLeaders = await this.getBattingLeaderboard(tournamentId, 100);

    battingLeaders.sort((a, b) => {
      const boundA = isSixes ? a.total_sixes : a.total_fours;
      const boundB = isSixes ? b.total_sixes : b.total_fours;

      if (boundB !== boundA) {
        return boundB - boundA;
      }
      if (Math.abs(b.strike_rate - a.strike_rate) > 0.0001) {
        return b.strike_rate - a.strike_rate;
      }
      if (b.total_runs !== a.total_runs) {
        return b.total_runs - a.total_runs;
      }
      return a.player_id.localeCompare(b.player_id);
    });

    return battingLeaders
      .filter((p) => (isSixes ? p.total_sixes : p.total_fours) > 0)
      .slice(0, limit)
      .map((p, idx) => ({ rank: idx + 1, ...p }));
  }
}
