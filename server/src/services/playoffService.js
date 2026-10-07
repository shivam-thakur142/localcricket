// ====================================================================
// PLAYOFF SERVICE: BRACKET GENERATION, SEEDING & PROGRESSION
// ====================================================================

import { ApiError } from '../utils/ApiError.js';
import {
  PLAYOFF_FORMATS,
  MATCH_STAGES,
  TOURNAMENT_STATUS,
  MATCH_STATUS,
} from '../../../shared/constants/cricketConstants.js';
import { PointsTableService } from './pointsTableService.js';

export class PlayoffService {
  constructor(db) {
    this.db = db;
    this.pointsTableService = new PointsTableService(db);
  }

  /**
   * Get playoff bracket details and current stages for a tournament
   */
  async getPlayoffs(tournamentId) {
    const tRes = await this.db.query(
      `SELECT t.id, t.name, t.status, t.playoff_format, t.playoff_teams_count,
              t.champion_team_id, t.runner_up_team_id,
              champ.name AS champion_team_name, champ.short_name AS champion_team_short_name,
              runner.name AS runner_up_team_name, runner.short_name AS runner_up_team_short_name
       FROM tournaments t
       LEFT JOIN tournament_teams ctt ON t.champion_team_id = ctt.id
       LEFT JOIN teams champ ON ctt.team_id = champ.id
       LEFT JOIN tournament_teams rtt ON t.runner_up_team_id = rtt.id
       LEFT JOIN teams runner ON rtt.team_id = runner.id
       WHERE t.id = $1;`,
      [tournamentId]
    );

    if (tRes.rows.length === 0) {
      throw ApiError.notFound(`Tournament ${tournamentId} not found`);
    }

    const tournament = tRes.rows[0];

    // Query all playoff matches
    const mRes = await this.db.query(
      `SELECT m.*,
              ta.name AS team_a_name, ta.short_name AS team_a_short_name,
              tb.name AS team_b_name, tb.short_name AS team_b_short_name,
              v.name AS venue_name, v.ground_name,
              w.name AS winner_name
       FROM matches m
       LEFT JOIN tournament_teams tta ON m.team_a_id = tta.id
       LEFT JOIN teams ta ON tta.team_id = ta.id
       LEFT JOIN tournament_teams ttb ON m.team_b_id = ttb.id
       LEFT JOIN teams tb ON ttb.team_id = tb.id
       LEFT JOIN venues v ON m.venue_id = v.id
       LEFT JOIN tournament_teams tw ON m.winner_team_id = tw.id
       LEFT JOIN teams w ON tw.team_id = w.id
       WHERE m.tournament_id = $1 AND m.stage <> 'LEAGUE'
       ORDER BY m.playoff_order ASC, m.match_number ASC;`,
      [tournamentId]
    );

    const matches = mRes.rows;

    // Attach brief score summary for each match
    for (const match of matches) {
      const innRes = await this.db.query(
        `SELECT innings_number, batting_team_id, total_runs, total_wickets, total_legal_balls
         FROM innings
         WHERE match_id = $1
         ORDER BY innings_number ASC;`,
        [match.id]
      );
      match.innings_summary = innRes.rows.map((inn) => ({
        innings_number: inn.innings_number,
        batting_team_id: inn.batting_team_id,
        runs: inn.total_runs,
        wickets: inn.total_wickets,
        overs: `${Math.floor(inn.total_legal_balls / 6)}.${inn.total_legal_balls % 6}`,
      }));
    }

    return {
      tournament_id: tournament.id,
      tournament_name: tournament.name,
      tournament_status: tournament.status,
      playoff_format: tournament.playoff_format || PLAYOFF_FORMATS.NONE,
      playoff_teams_count: tournament.playoff_teams_count || 4,
      champion: tournament.champion_team_id
        ? {
            tournament_team_id: tournament.champion_team_id,
            team_name: tournament.champion_team_name,
            short_name: tournament.champion_team_short_name,
          }
        : null,
      runner_up: tournament.runner_up_team_id
        ? {
            tournament_team_id: tournament.runner_up_team_id,
            team_name: tournament.runner_up_team_name,
            short_name: tournament.runner_up_team_short_name,
          }
        : null,
      matches,
    };
  }

  /**
   * Update playoff configuration (only allowed before knockout matches start)
   */
  async updatePlayoffConfig(tournamentId, { playoff_format }) {
    if (![PLAYOFF_FORMATS.NONE, PLAYOFF_FORMATS.PAGE_PLAYOFF, PLAYOFF_FORMATS.SEMI_FINALS].includes(playoff_format)) {
      throw ApiError.badRequest(`Invalid playoff format: ${playoff_format}`);
    }

    const tRes = await this.db.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
    if (tRes.rows.length === 0) {
      throw ApiError.notFound(`Tournament ${tournamentId} not found`);
    }

    const tournament = tRes.rows[0];
    if ([TOURNAMENT_STATUS.COMPLETED, TOURNAMENT_STATUS.CANCELLED].includes(tournament.status)) {
      throw ApiError.conflict('Cannot modify configuration of a terminal tournament', 'TERMINAL_TOURNAMENT_IMMUTABLE');
    }

    // Check if any playoff match has started
    const activePlayoff = await this.db.query(
      `SELECT id FROM matches 
       WHERE tournament_id = $1 AND stage <> 'LEAGUE' AND status NOT IN ('SCHEDULED')`,
      [tournamentId]
    );
    if (activePlayoff.rows.length > 0) {
      throw ApiError.conflict(
        'Cannot alter playoff configuration after knockout stage matches have commenced',
        'PLAYOFF_IN_PROGRESS_LOCK'
      );
    }

    const res = await this.db.query(
      `UPDATE tournaments
       SET playoff_format = $1, playoff_teams_count = 4, updated_at = NOW()
       WHERE id = $2
       RETURNING id, playoff_format, playoff_teams_count;`,
      [playoff_format, tournamentId]
    );

    return res.rows[0];
  }

  /**
   * Deterministically calculate higher seed between two teams from league standings
   */
  async calculateHigherSeededTeam(tournamentId, teamAId, teamBId, dbClient = null) {
    const client = dbClient || this.db;
    const standingsRes = await client.query(
      `SELECT tournament_team_id
       FROM points_table
       WHERE tournament_id = $1
       ORDER BY points DESC, net_run_rate DESC, matches_won DESC, tournament_team_id ASC;`,
      [tournamentId]
    );

    const standings = standingsRes.rows.map((r) => r.tournament_team_id);
    const indexA = standings.indexOf(teamAId);
    const indexB = standings.indexOf(teamBId);

    if (indexA === -1 || indexB === -1) {
      throw ApiError.unprocessable('Both teams must exist in regular season league standings for higher seed lookup');
    }

    // Lower index = higher rank
    if (indexA < indexB) {
      return { higherSeedTeamId: teamAId, lowerSeedTeamId: teamBId, higherRank: indexA + 1, lowerRank: indexB + 1 };
    } else {
      return { higherSeedTeamId: teamBId, lowerSeedTeamId: teamAId, higherRank: indexB + 1, lowerRank: indexA + 1 };
    }
  }

  /**
   * Atomically generate playoff bracket from league standings
   */
  async generatePlayoffBracket(tournamentId, data = {}) {
    const { format = PLAYOFF_FORMATS.PAGE_PLAYOFF, fixtures = [] } = data;

    if (![PLAYOFF_FORMATS.PAGE_PLAYOFF, PLAYOFF_FORMATS.SEMI_FINALS].includes(format)) {
      throw ApiError.badRequest(`Unsupported playoff format: ${format}. Supported formats are PAGE_PLAYOFF and SEMI_FINALS.`);
    }

    await this.db.query('BEGIN');
    try {
      // 1. Lock tournament row
      const tRes = await this.db.query(
        'SELECT id, status, overs_per_innings FROM tournaments WHERE id = $1 FOR UPDATE',
        [tournamentId]
      );
      if (tRes.rows.length === 0) {
        throw ApiError.notFound(`Tournament ${tournamentId} not found`);
      }
      const tournament = tRes.rows[0];

      // 2. Lifecycle State Checks
      if (tournament.status === TOURNAMENT_STATUS.DRAFT) {
        throw ApiError.unprocessable('Cannot generate playoff bracket in DRAFT status', 'INVALID_LIFECYCLE_STATUS');
      }
      if (tournament.status === TOURNAMENT_STATUS.UPCOMING) {
        throw ApiError.unprocessable(
          'Cannot generate playoff bracket before tournament is ONGOING and league stage completed',
          'INVALID_LIFECYCLE_STATUS'
        );
      }
      if ([TOURNAMENT_STATUS.COMPLETED, TOURNAMENT_STATUS.CANCELLED].includes(tournament.status)) {
        throw ApiError.conflict('Cannot generate playoff bracket for a terminal tournament', 'TERMINAL_TOURNAMENT_IMMUTABLE');
      }

      // 3. Duplicate Bracket Check
      const existingPlayoffs = await this.db.query(
        `SELECT id FROM matches WHERE tournament_id = $1 AND stage <> 'LEAGUE'`,
        [tournamentId]
      );
      if (existingPlayoffs.rows.length > 0) {
        throw ApiError.conflict(
          'Playoff bracket has already been generated for this tournament',
          'PLAYOFF_BRACKET_ALREADY_EXISTS'
        );
      }

      // 4. Standings & Seeding (Top 4 required)
      const standingsRes = await this.db.query(
        `SELECT pt.tournament_team_id, pt.points, pt.net_run_rate, pt.matches_won,
                t.name as team_name, t.short_name
         FROM points_table pt
         JOIN tournament_teams tt ON pt.tournament_team_id = tt.id
         JOIN teams t ON tt.team_id = t.id
         WHERE pt.tournament_id = $1
         ORDER BY pt.points DESC, pt.net_run_rate DESC, pt.matches_won DESC, pt.tournament_team_id ASC;`,
        [tournamentId]
      );
      const standings = standingsRes.rows;

      if (standings.length < 4) {
        throw ApiError.unprocessable(
          `At least 4 teams are required in league standings to generate playoffs (found ${standings.length})`,
          'INSUFFICIENT_TEAMS_FOR_PLAYOFFS'
        );
      }

      const rank1 = standings[0];
      const rank2 = standings[1];
      const rank3 = standings[2];
      const rank4 = standings[3];

      // 5. Determine starting match number
      const numRes = await this.db.query(
        'SELECT COALESCE(MAX(match_number), 0) + 1 AS next_match_num FROM matches WHERE tournament_id = $1',
        [tournamentId]
      );
      let matchNumber = numRes.rows[0].next_match_num;
      const oversQuota = tournament.overs_per_innings || 20;

      // Helper to extract fixture schedule details
      const getFixtureMeta = (stageName) => {
        const f = fixtures.find((fix) => fix.stage === stageName) || {};
        return {
          venue_id: f.venue_id || null,
          scheduled_start_time: f.scheduled_start_time || new Date(Date.now() + 86400000 * 2).toISOString(),
        };
      };

      const generatedMatches = [];

      if (format === PLAYOFF_FORMATS.PAGE_PLAYOFF) {
        // --- MATCH 1: QUALIFIER 1 (Rank 1 vs Rank 2) ---
        const q1Meta = getFixtureMeta(MATCH_STAGES.QUALIFIER_1);
        const q1Res = await this.db.query(
          `INSERT INTO matches (
            tournament_id, venue_id, team_a_id, team_b_id, match_number, stage,
            scheduled_start_time, overs_quota, status, team_a_placeholder, team_b_placeholder, playoff_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SCHEDULED', $9, $10, 1) RETURNING *;`,
          [
            tournamentId,
            q1Meta.venue_id,
            rank1.tournament_team_id,
            rank2.tournament_team_id,
            matchNumber++,
            MATCH_STAGES.QUALIFIER_1,
            q1Meta.scheduled_start_time,
            oversQuota,
            `Rank 1 (${rank1.short_name})`,
            `Rank 2 (${rank2.short_name})`,
          ]
        );
        const q1Match = q1Res.rows[0];
        generatedMatches.push(q1Match);

        // --- MATCH 2: ELIMINATOR (Rank 3 vs Rank 4) ---
        const elMeta = getFixtureMeta(MATCH_STAGES.ELIMINATOR);
        const elRes = await this.db.query(
          `INSERT INTO matches (
            tournament_id, venue_id, team_a_id, team_b_id, match_number, stage,
            scheduled_start_time, overs_quota, status, team_a_placeholder, team_b_placeholder, playoff_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SCHEDULED', $9, $10, 2) RETURNING *;`,
          [
            tournamentId,
            elMeta.venue_id,
            rank3.tournament_team_id,
            rank4.tournament_team_id,
            matchNumber++,
            MATCH_STAGES.ELIMINATOR,
            elMeta.scheduled_start_time,
            oversQuota,
            `Rank 3 (${rank3.short_name})`,
            `Rank 4 (${rank4.short_name})`,
          ]
        );
        const elMatch = elRes.rows[0];
        generatedMatches.push(elMatch);

        // --- MATCH 3: QUALIFIER 2 (Loser Q1 vs Winner Eliminator) ---
        const q2Meta = getFixtureMeta(MATCH_STAGES.QUALIFIER_2);
        const q2Res = await this.db.query(
          `INSERT INTO matches (
            tournament_id, venue_id, team_a_id, team_b_id, match_number, stage,
            scheduled_start_time, overs_quota, status, team_a_placeholder, team_b_placeholder,
            playoff_order, team_a_source_match_id, team_a_source_outcome,
            team_b_source_match_id, team_b_source_outcome
          ) VALUES ($1, $2, NULL, NULL, $3, $4, $5, $6, 'SCHEDULED', $7, $8, 3, $9, 'LOSER', $10, 'WINNER')
          RETURNING *;`,
          [
            tournamentId,
            q2Meta.venue_id,
            matchNumber++,
            MATCH_STAGES.QUALIFIER_2,
            q2Meta.scheduled_start_time,
            oversQuota,
            'Loser Qualifier 1',
            'Winner Eliminator',
            q1Match.id,
            elMatch.id,
          ]
        );
        const q2Match = q2Res.rows[0];
        generatedMatches.push(q2Match);

        // --- MATCH 4: FINAL (Winner Q1 vs Winner Q2) ---
        const fnMeta = getFixtureMeta(MATCH_STAGES.FINAL);
        const fnRes = await this.db.query(
          `INSERT INTO matches (
            tournament_id, venue_id, team_a_id, team_b_id, match_number, stage,
            scheduled_start_time, overs_quota, status, team_a_placeholder, team_b_placeholder,
            playoff_order, team_a_source_match_id, team_a_source_outcome,
            team_b_source_match_id, team_b_source_outcome
          ) VALUES ($1, $2, NULL, NULL, $3, $4, $5, $6, 'SCHEDULED', $7, $8, 4, $9, 'WINNER', $10, 'WINNER')
          RETURNING *;`,
          [
            tournamentId,
            fnMeta.venue_id,
            matchNumber++,
            MATCH_STAGES.FINAL,
            fnMeta.scheduled_start_time,
            oversQuota,
            'Winner Qualifier 1',
            'Winner Qualifier 2',
            q1Match.id,
            q2Match.id,
          ]
        );
        const fnMatch = fnRes.rows[0];
        generatedMatches.push(fnMatch);
      } else if (format === PLAYOFF_FORMATS.SEMI_FINALS) {
        // --- MATCH 1: SEMI FINAL 1 (Rank 1 vs Rank 4) ---
        const sf1Meta = getFixtureMeta(MATCH_STAGES.SEMI_FINAL_1);
        const sf1Res = await this.db.query(
          `INSERT INTO matches (
            tournament_id, venue_id, team_a_id, team_b_id, match_number, stage,
            scheduled_start_time, overs_quota, status, team_a_placeholder, team_b_placeholder, playoff_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SCHEDULED', $9, $10, 1) RETURNING *;`,
          [
            tournamentId,
            sf1Meta.venue_id,
            rank1.tournament_team_id,
            rank4.tournament_team_id,
            matchNumber++,
            MATCH_STAGES.SEMI_FINAL_1,
            sf1Meta.scheduled_start_time,
            oversQuota,
            `Rank 1 (${rank1.short_name})`,
            `Rank 4 (${rank4.short_name})`,
          ]
        );
        const sf1Match = sf1Res.rows[0];
        generatedMatches.push(sf1Match);

        // --- MATCH 2: SEMI FINAL 2 (Rank 2 vs Rank 3) ---
        const sf2Meta = getFixtureMeta(MATCH_STAGES.SEMI_FINAL_2);
        const sf2Res = await this.db.query(
          `INSERT INTO matches (
            tournament_id, venue_id, team_a_id, team_b_id, match_number, stage,
            scheduled_start_time, overs_quota, status, team_a_placeholder, team_b_placeholder, playoff_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SCHEDULED', $9, $10, 2) RETURNING *;`,
          [
            tournamentId,
            sf2Meta.venue_id,
            rank2.tournament_team_id,
            rank3.tournament_team_id,
            matchNumber++,
            MATCH_STAGES.SEMI_FINAL_2,
            sf2Meta.scheduled_start_time,
            oversQuota,
            `Rank 2 (${rank2.short_name})`,
            `Rank 3 (${rank3.short_name})`,
          ]
        );
        const sf2Match = sf2Res.rows[0];
        generatedMatches.push(sf2Match);

        // --- MATCH 3: FINAL (Winner SF1 vs Winner SF2) ---
        const fnMeta = getFixtureMeta(MATCH_STAGES.FINAL);
        const fnRes = await this.db.query(
          `INSERT INTO matches (
            tournament_id, venue_id, team_a_id, team_b_id, match_number, stage,
            scheduled_start_time, overs_quota, status, team_a_placeholder, team_b_placeholder,
            playoff_order, team_a_source_match_id, team_a_source_outcome,
            team_b_source_match_id, team_b_source_outcome
          ) VALUES ($1, $2, NULL, NULL, $3, $4, $5, $6, 'SCHEDULED', $7, $8, 3, $9, 'WINNER', $10, 'WINNER')
          RETURNING *;`,
          [
            tournamentId,
            fnMeta.venue_id,
            matchNumber++,
            MATCH_STAGES.FINAL,
            fnMeta.scheduled_start_time,
            oversQuota,
            'Winner Semi-Final 1',
            'Winner Semi-Final 2',
            sf1Match.id,
            sf2Match.id,
          ]
        );
        const fnMatch = fnRes.rows[0];
        generatedMatches.push(fnMatch);
      }

      // 6. Update tournament settings
      await this.db.query(
        `UPDATE tournaments
         SET playoff_format = $1, playoff_teams_count = 4, updated_at = NOW()
         WHERE id = $2;`,
        [format, tournamentId]
      );

      await this.db.query('COMMIT');

      return {
        tournament_id: tournamentId,
        playoff_format: format,
        matches: generatedMatches,
      };
    } catch (err) {
      await this.db.query('ROLLBACK');
      throw err;
    }
  }

  /**
   * Atomically advance playoff progression when a knockout match resolves
   * Called inside matchService.resolveMatch transaction using dbClient
   */
  async advancePlayoffProgression(matchId, winnerTeamId, loserTeamId, dbClient = null) {
    const client = dbClient || this.db;

    // Fetch the resolved match
    const mRes = await client.query(
      'SELECT id, tournament_id, stage, team_a_id, team_b_id FROM matches WHERE id = $1',
      [matchId]
    );
    if (mRes.rows.length === 0) return;
    const currentMatch = mRes.rows[0];

    // Find and row-lock downstream fixtures that depend on this match
    const downstreamRes = await client.query(
      `SELECT id, team_a_source_match_id, team_a_source_outcome,
              team_b_source_match_id, team_b_source_outcome,
              team_a_id, team_b_id, stage
       FROM matches
       WHERE (team_a_source_match_id = $1 OR team_b_source_match_id = $1)
       FOR UPDATE;`,
      [matchId]
    );

    for (const dMatch of downstreamRes.rows) {
      const updates = [];
      const values = [];
      let pIdx = 1;

      if (dMatch.team_a_source_match_id === matchId) {
        const teamAVal = dMatch.team_a_source_outcome === 'WINNER' ? winnerTeamId : loserTeamId;
        updates.push(`team_a_id = $${pIdx++}`);
        values.push(teamAVal);
      }
      if (dMatch.team_b_source_match_id === matchId) {
        const teamBVal = dMatch.team_b_source_outcome === 'WINNER' ? winnerTeamId : loserTeamId;
        updates.push(`team_b_id = $${pIdx++}`);
        values.push(teamBVal);
      }

      if (updates.length > 0) {
        values.push(dMatch.id);
        await client.query(
          `UPDATE matches
           SET ${updates.join(', ')}, updated_at = NOW()
           WHERE id = $${pIdx};`,
          values
        );
      }
    }

    // If this is the FINAL, crown champion and runner-up and mark tournament COMPLETED
    if (currentMatch.stage === MATCH_STAGES.FINAL) {
      await client.query(
        `UPDATE tournaments
         SET champion_team_id = $1,
             runner_up_team_id = $2,
             status = 'COMPLETED',
             updated_at = NOW()
         WHERE id = $3;`,
        [winnerTeamId, loserTeamId, currentMatch.tournament_id]
      );
    }
  }
}
