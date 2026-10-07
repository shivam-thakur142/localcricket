// ====================================================================
// SCORING SERVICE: BUSINESS ORCHESTRATION & DATABASE PERSISTENCE
// ====================================================================

import { CricketScoringEngine } from '../engine/CricketScoringEngine.js';
import { ReplayEngine } from '../engine/ReplayEngine.js';
import { ApiError } from '../utils/ApiError.js';
import { PointsTableService } from './pointsTableService.js';
import { MATCH_STATUS, INNINGS_STATUS } from '../../../shared/constants/cricketConstants.js';
import { matchEventBus, MATCH_INTERNAL_EVENTS } from '../utils/eventBus.js';


export class ScoringService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Record Toss outcome
   */
  async recordToss(matchId, { tossWinnerTeamId, tossDecision }) {
    const mCheck = await this.db.query('SELECT team_a_id, team_b_id, status FROM matches WHERE id = $1', [matchId]);
    if (mCheck.rows.length === 0) {
      throw ApiError.notFound(`Match with ID ${matchId} not found`);
    }
    const match = mCheck.rows[0];
    if (!match.team_a_id || !match.team_b_id) {
      throw ApiError.unprocessable(
        'Cannot conduct toss for a match where participating teams are not yet determined',
        'UNPOPULATED_MATCH_TEAMS'
      );
    }

    const res = await this.db.query(
      `UPDATE matches
       SET toss_winner_team_id = $1,
           toss_decision = $2,
           status = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *;`,
      [tossWinnerTeamId, tossDecision, MATCH_STATUS.TOSS_DONE, matchId]
    );
    return res.rows[0];
  }

  /**
   * Submit or confirm Playing XI squads
   */
  async submitSquad(matchId, { tournamentTeamId, playerIds, captainId, wicketKeeperId }) {
    for (const playerId of playerIds) {
      await this.db.query(
        `INSERT INTO match_players (match_id, tournament_team_id, player_id, is_playing_xi, is_captain, is_wicket_keeper)
         VALUES ($1, $2, $3, TRUE, $4, $5)
         ON CONFLICT (match_id, player_id) DO UPDATE
         SET is_playing_xi = TRUE,
             is_captain = $4,
             is_wicket_keeper = $5;`,
        [matchId, tournamentTeamId, playerId, playerId === captainId, playerId === wicketKeeperId]
      );
    }
    return { matchId, tournamentTeamId, playerCount: playerIds.length };
  }

  /**
   * Start an innings (Openers and Opening Bowler)
   */
  async startInnings(matchId, {
    battingTeamId,
    bowlingTeamId,
    strikerId,
    nonStrikerId,
    bowlerId,
    inningsNumber = 1,
  }) {
    // 1. Update match to IN_PROGRESS
    await this.db.query(
      `UPDATE matches SET status = $1, updated_at = NOW() WHERE id = $2;`,
      [MATCH_STATUS.IN_PROGRESS, matchId]
    );

    // 2. Insert Innings record
    const inningsRes = await this.db.query(
      `INSERT INTO innings (
         match_id, innings_number, batting_team_id, bowling_team_id,
         status, current_striker_id, current_non_striker_id, current_bowler_id,
         started_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (match_id, innings_number) DO UPDATE
       SET current_striker_id = $6,
           current_non_striker_id = $7,
           current_bowler_id = $8,
           status = $5
       RETURNING *;`,
      [matchId, inningsNumber, battingTeamId, bowlingTeamId, INNINGS_STATUS.IN_PROGRESS, strikerId, nonStrikerId, bowlerId]
    );
    const innings = inningsRes.rows[0];

    // 3. Insert Over 1
    const overRes = await this.db.query(
      `INSERT INTO overs (innings_id, over_number, bowler_id)
       VALUES ($1, 1, $2)
       ON CONFLICT (innings_id, over_number) DO UPDATE SET bowler_id = $2
       RETURNING *;`,
      [innings.id, bowlerId]
    );

    // 4. Initialize Batting Performances for Openers
    await this.db.query(
      `INSERT INTO batting_performances (innings_id, player_id, batting_order)
       VALUES ($1, $2, 1) ON CONFLICT (innings_id, player_id) DO NOTHING;`,
      [innings.id, strikerId]
    );
    await this.db.query(
      `INSERT INTO batting_performances (innings_id, player_id, batting_order)
       VALUES ($1, $2, 2) ON CONFLICT (innings_id, player_id) DO NOTHING;`,
      [innings.id, nonStrikerId]
    );

    // 5. Initialize Bowling Performance for Bowler
    await this.db.query(
      `INSERT INTO bowling_performances (innings_id, player_id, bowling_order)
       VALUES ($1, $2, 1) ON CONFLICT (innings_id, player_id) DO NOTHING;`,
      [innings.id, bowlerId]
    );

    // Emit live event for connected spectators
    matchEventBus.emitMatchEvent(matchId, {
      type: MATCH_INTERNAL_EVENTS.INNINGS_STATE_CHANGED,
      inningsId: innings.id,
      status: innings.status,
    });

    return { innings, over: overRes.rows[0] };
  }

  /**
   * Start a new over with a nominated bowler
   */
  async startOver(matchId, { bowlerId }) {
    // 1. Fetch active innings
    const innRes = await this.db.query(
      `SELECT * FROM innings WHERE match_id = $1 AND status = 'IN_PROGRESS';`,
      [matchId]
    );
    if (innRes.rows.length === 0) {
      throw ApiError.badRequest('No active innings in progress for this match');
    }
    const innings = innRes.rows[0];

    // 2. Fetch latest over
    const lastOverRes = await this.db.query(
      `SELECT * FROM overs WHERE innings_id = $1 ORDER BY over_number DESC LIMIT 1;`,
      [innings.id]
    );
    if (lastOverRes.rows.length === 0) {
      throw ApiError.badRequest('No overs found in innings');
    }
    const lastOver = lastOverRes.rows[0];

    if (!lastOver.is_completed) {
      throw ApiError.badRequest(`Over ${lastOver.over_number} is still in progress`, 'OVER_NOT_COMPLETED');
    }

    if (lastOver.bowler_id === bowlerId) {
      throw ApiError.unprocessable(
        'A bowler cannot bowl two consecutive overs from either end',
        'CONSECUTIVE_OVER_VIOLATION'
      );
    }

    // 3. Insert next over
    const nextOverNumber = lastOver.over_number + 1;
    const newOverRes = await this.db.query(
      `INSERT INTO overs (innings_id, over_number, bowler_id)
       VALUES ($1, $2, $3)
       RETURNING *;`,
      [innings.id, nextOverNumber, bowlerId]
    );

    // 4. Update innings current bowler
    await this.db.query(
      `UPDATE innings SET current_bowler_id = $1 WHERE id = $2;`,
      [bowlerId, innings.id]
    );

    // 5. Initialize bowling performance if not exists
    const bowlingCountRes = await this.db.query(
      `SELECT COUNT(*) FROM bowling_performances WHERE innings_id = $1;`,
      [innings.id]
    );
    const bowlingOrder = parseInt(bowlingCountRes.rows[0].count) + 1;

    await this.db.query(
      `INSERT INTO bowling_performances (innings_id, player_id, bowling_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (innings_id, player_id) DO NOTHING;`,
      [innings.id, bowlerId, bowlingOrder]
    );

    return { over: newOverRes.rows[0] };
  }

  /**
   * Record a single ball delivery (Idempotent & Transactionally Safe)
   */
  async recordDelivery(matchId, actionPayload, userId, idempotencyKey = null) {
    // 1. Idempotency Check
    if (idempotencyKey) {
      const existingKeyRes = await this.db.query(
        'SELECT response_body FROM idempotency_keys WHERE key = $1 AND match_id = $2',
        [idempotencyKey, matchId]
      );
      if (existingKeyRes.rows.length > 0) {
        return existingKeyRes.rows[0].response_body;
      }
    }

    // 2. Fetch match and tournament config
    const matchRes = await this.db.query(
      `SELECT m.*, t.balls_per_over, t.overs_per_innings, t.free_hit_on_no_ball
       FROM matches m
       JOIN tournaments t ON m.tournament_id = t.id
       WHERE m.id = $1;`,
      [matchId]
    );
    if (matchRes.rows.length === 0) {
      throw ApiError.notFound(`Match with ID ${matchId} not found`);
    }
    const match = matchRes.rows[0];

    if (match.status !== MATCH_STATUS.IN_PROGRESS) {
      throw ApiError.badRequest(`Cannot score delivery when match is in ${match.status} state`, 'INVALID_MATCH_STATUS');
    }

    // 3. Fetch active innings
    const innRes = await this.db.query(
      `SELECT * FROM innings WHERE match_id = $1 AND status = 'IN_PROGRESS';`,
      [matchId]
    );
    if (innRes.rows.length === 0) {
      throw ApiError.badRequest('No active innings in progress');
    }
    const innings = innRes.rows[0];

    // 4. Fetch latest active over
    const overRes = await this.db.query(
      `SELECT * FROM overs WHERE innings_id = $1 ORDER BY over_number DESC LIMIT 1;`,
      [innings.id]
    );
    if (overRes.rows.length === 0) {
      throw ApiError.badRequest('No active over found');
    }
    const currentOver = overRes.rows[0];

    if (currentOver.is_completed) {
      throw ApiError.badRequest('Current over is completed. Please start a new over with a nominated bowler.', 'OVER_ALREADY_COMPLETED');
    }

    // 5. Monotonic sequence check
    const lastSeqRes = await this.db.query(
      `SELECT COALESCE(MAX(delivery_sequence), 0) as last_seq,
              COALESCE(MAX(ball_number), 0) as balls_count
       FROM deliveries WHERE innings_id = $1;`,
      [innings.id]
    );
    const lastSequence = parseInt(lastSeqRes.rows[0].last_seq);
    const nextExpectedSequence = lastSequence + 1;

    if (actionPayload.expected_sequence && actionPayload.expected_sequence !== nextExpectedSequence) {
      throw ApiError.conflict(
        `Sequence mismatch: Expected sequence was ${actionPayload.expected_sequence}, but server is at ${nextExpectedSequence}`,
        'STALE_SEQUENCE_CONFLICT'
      );
    }

    // 6. Check free hit status from preceding non-reverted delivery
    let isFreeHit = false;
    const lastDeliveryRes = await this.db.query(
      `SELECT * FROM deliveries WHERE innings_id = $1 AND is_reverted = FALSE ORDER BY delivery_sequence DESC LIMIT 1;`,
      [innings.id]
    );
    if (lastDeliveryRes.rows.length > 0) {
      const prev = lastDeliveryRes.rows[0];
      if (prev.extra_type === 'NO_BALL' && match.free_hit_on_no_ball) {
        isFreeHit = true;
      } else if (!prev.is_legal && prev.commentary_text && prev.commentary_text.includes('[FREE_HIT]')) {
        isFreeHit = true;
      }
    }

    // 7. Build current engine state
    const currentEngineState = {
      id: innings.id,
      match_id: match.id,
      innings_number: innings.innings_number,
      batting_team_id: innings.batting_team_id,
      bowling_team_id: innings.bowling_team_id,
      total_runs: innings.total_runs,
      total_wickets: innings.total_wickets,
      total_legal_balls: innings.total_legal_balls,
      total_extras: innings.total_extras,
      target_runs: innings.target_runs,
      status: innings.status,
      current_striker_id: innings.current_striker_id,
      current_non_striker_id: innings.current_non_striker_id,
      current_bowler_id: innings.current_bowler_id || currentOver.bowler_id,
      is_free_hit: isFreeHit,
      last_delivery_sequence: lastSequence,
      current_over: {
        id: currentOver.id,
        over_number: currentOver.over_number,
        bowler_id: currentOver.bowler_id,
        ball_number: parseInt(lastSeqRes.rows[0].balls_count) || 0,
        legal_balls: currentOver.legal_balls,
        total_runs_conceded: currentOver.total_runs_conceded,
        wickets_taken: currentOver.wickets_taken,
        is_completed: currentOver.is_completed,
      },
    };

    const rulesConfig = {
      ballsPerOver: match.balls_per_over || 6,
      oversQuota: match.overs_quota || 20,
      freeHitOnNoBall: match.free_hit_on_no_ball !== false,
      maxWickets: 10,
    };

    // 8. Execute Pure Scoring State Machine
    const engineResult = CricketScoringEngine.processDelivery(currentEngineState, actionPayload, rulesConfig);
    const { deliveryRecord, nextState, facesBall, isBowlerWicket } = engineResult;

    // Attach free-hit annotation in commentary if active
    if (isFreeHit && !deliveryRecord.commentary_text) {
      deliveryRecord.commentary_text = '[FREE_HIT]';
    } else if (isFreeHit) {
      deliveryRecord.commentary_text = `[FREE_HIT] ${deliveryRecord.commentary_text}`;
    }

    // 9. Persist into Database
    // 9.1 Insert delivery
    const insertedDelRes = await this.db.query(
      `INSERT INTO deliveries (
         innings_id, over_id, delivery_sequence, ball_number, legal_ball_number,
         bowler_id, striker_id, non_striker_id, runs_batter, runs_extras,
         extra_type, is_legal, is_wicket, wicket_type, dismissed_player_id,
         assist_player_id, commentary_text, created_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *;`,
      [
        deliveryRecord.innings_id,
        deliveryRecord.over_id,
        deliveryRecord.delivery_sequence,
        deliveryRecord.ball_number,
        deliveryRecord.legal_ball_number,
        deliveryRecord.bowler_id,
        deliveryRecord.striker_id,
        deliveryRecord.non_striker_id,
        deliveryRecord.runs_batter,
        deliveryRecord.runs_extras,
        deliveryRecord.extra_type,
        deliveryRecord.is_legal,
        deliveryRecord.is_wicket,
        deliveryRecord.wicket_type,
        deliveryRecord.dismissed_player_id,
        deliveryRecord.assist_player_id,
        deliveryRecord.commentary_text,
        userId,
      ]
    );

    // 9.2 Update innings
    await this.db.query(
      `UPDATE innings
       SET total_runs = $1,
           total_wickets = $2,
           total_legal_balls = $3,
           total_extras = $4,
           status = $5,
           current_striker_id = $6,
           current_non_striker_id = $7,
           current_bowler_id = $8,
           completed_at = $9
       WHERE id = $10;`,
      [
        nextState.total_runs,
        nextState.total_wickets,
        nextState.total_legal_balls,
        nextState.total_extras,
        nextState.status,
        nextState.current_striker_id,
        nextState.current_non_striker_id,
        nextState.current_bowler_id,
        nextState.status === 'COMPLETED' ? new Date() : null,
        innings.id,
      ]
    );

    // 9.3 Update over
    await this.db.query(
      `UPDATE overs
       SET legal_balls = $1,
           total_runs_conceded = $2,
           wickets_taken = $3,
           is_completed = $4
       WHERE id = $5;`,
      [
        nextState.current_over.legal_balls,
        nextState.current_over.total_runs_conceded,
        nextState.current_over.wickets_taken,
        nextState.current_over.is_completed,
        currentOver.id,
      ]
    );

    // 9.4 Update Batting Performance for Striker
    await this.db.query(
      `UPDATE batting_performances
       SET runs_scored = runs_scored + $1,
           balls_faced = balls_faced + $2,
           fours = fours + $3,
           sixes = sixes + $4,
           is_out = CASE WHEN player_id = $5 THEN TRUE ELSE is_out END,
           wicket_type = CASE WHEN player_id = $5 THEN $6 ELSE wicket_type END,
           dismissal_text = CASE WHEN player_id = $5 THEN $7 ELSE dismissal_text END
       WHERE innings_id = $8 AND player_id = $9;`,
      [
        deliveryRecord.runs_batter,
        facesBall ? 1 : 0,
        deliveryRecord.runs_batter === 4 ? 1 : 0,
        deliveryRecord.runs_batter === 6 ? 1 : 0,
        deliveryRecord.dismissed_player_id,
        deliveryRecord.wicket_type,
        deliveryRecord.is_wicket ? `b ${currentOver.bowler_id}` : null,
        innings.id,
        deliveryRecord.striker_id,
      ]
    );

    // If Non-striker was dismissed (e.g. run out)
    if (deliveryRecord.is_wicket && deliveryRecord.dismissed_player_id === deliveryRecord.non_striker_id) {
      await this.db.query(
        `UPDATE batting_performances
         SET is_out = TRUE,
             wicket_type = $1,
             dismissal_text = 'run out'
         WHERE innings_id = $2 AND player_id = $3;`,
        [deliveryRecord.wicket_type, innings.id, deliveryRecord.non_striker_id]
      );
    }

    // If incoming batter nominated, ensure they have a batting scorecard entry
    if (actionPayload.incoming_batter_id) {
      const batterCountRes = await this.db.query(
        `SELECT COUNT(*) FROM batting_performances WHERE innings_id = $1;`,
        [innings.id]
      );
      const battingOrder = parseInt(batterCountRes.rows[0].count) + 1;
      await this.db.query(
        `INSERT INTO batting_performances (innings_id, player_id, batting_order)
         VALUES ($1, $2, $3)
         ON CONFLICT (innings_id, player_id) DO NOTHING;`,
        [innings.id, actionPayload.incoming_batter_id, battingOrder]
      );
    }

    // 9.5 Update Bowling Performance for Bowler
    const bowlerConceded = engineResult.bowlerRunsConceded;
    await this.db.query(
      `UPDATE bowling_performances
       SET legal_balls_bowled = legal_balls_bowled + $1,
           runs_conceded = runs_conceded + $2,
           wickets = wickets + $3,
           wides = wides + $4,
           no_balls = no_balls + $5
       WHERE innings_id = $6 AND player_id = $7;`,
      [
        deliveryRecord.is_legal ? 1 : 0,
        bowlerConceded,
        isBowlerWicket ? 1 : 0,
        deliveryRecord.extra_type === 'WIDE' ? deliveryRecord.runs_extras : 0,
        deliveryRecord.extra_type === 'NO_BALL' ? 1 : 0,
        innings.id,
        deliveryRecord.bowler_id,
      ]
    );

    // 9.6 Check if match outcome concluded
    if (nextState.matchOutcome.isMatchCompleted) {
      await this.db.query(
        `UPDATE matches
         SET status = $1,
             winner_team_id = $2,
             result_type = $3,
             result_margin_runs = $4,
             result_margin_wickets = $5,
             updated_at = NOW()
         WHERE id = $6;`,
        [
          MATCH_STATUS.COMPLETED,
          nextState.matchOutcome.winnerTeamId,
          nextState.matchOutcome.resultType,
          nextState.matchOutcome.resultMarginRuns,
          nextState.matchOutcome.resultMarginWickets,
          match.id,
        ]
      );

      // Automatically recalculate tournament standings on match completion
      if (match.tournament_id) {
        try {
          const pointsTableService = new PointsTableService(this.db);
          await pointsTableService.recalculateTournamentPoints(match.tournament_id);
        } catch (e) {
          console.error('Failed to auto-recalculate points table:', e);
        }
      }
    }

    const responsePayload = {
      delivery: insertedDelRes.rows[0],
      innings_state: {
        total_runs: nextState.total_runs,
        total_wickets: nextState.total_wickets,
        overs_completed_str: `${Math.floor(nextState.total_legal_balls / (match.balls_per_over || 6))}.${nextState.total_legal_balls % (match.balls_per_over || 6)}`,
        current_striker_id: nextState.current_striker_id,
        current_non_striker_id: nextState.current_non_striker_id,
        current_bowler_id: nextState.current_bowler_id,
        is_free_hit: nextState.is_free_hit,
        is_over_completed: nextState.current_over.is_completed,
        is_innings_completed: nextState.status === 'COMPLETED',
      },
    };

    // 10. Store idempotency response if key provided
    if (idempotencyKey) {
      await this.db.query(
        `INSERT INTO idempotency_keys (key, match_id, response_body)
         VALUES ($1, $2, $3)
         ON CONFLICT (match_id, key) DO NOTHING;`,
        [idempotencyKey, matchId, JSON.stringify(responsePayload)]
      );
    }

    // 11. Emit live match event to in-process bus for connected spectators
    matchEventBus.emitMatchEvent(match.id, {
      type: MATCH_INTERNAL_EVENTS.DELIVERY_RECORDED,
      deliverySequence: deliveryRecord.delivery_sequence,
      inningsId: innings.id,
      delivery: insertedDelRes.rows[0],
      inningsState: responsePayload.innings_state,
    });

    if (nextState.matchOutcome.isMatchCompleted) {
      matchEventBus.emitMatchEvent(match.id, {
        type: MATCH_INTERNAL_EVENTS.MATCH_COMPLETED,
        winnerTeamId: nextState.matchOutcome.winnerTeamId,
      });
    }

    return responsePayload;
  }

  /**
   * Non-destructive Undo of latest active delivery (Idempotent & Sequence Guarded)
   */
  async undoDelivery(matchId, userId, options = {}) {
    const reversionReason = options.reversionReason || (typeof options === 'string' ? options : 'Scorer initiated undo');
    const expectedDeliverySequence = options.expectedDeliverySequence || null;
    const idempotencyKey = options.idempotencyKey || null;

    // 1. Idempotency Check for Undo (Prevents double-click undo)
    if (idempotencyKey) {
      const existingKeyRes = await this.db.query(
        'SELECT response_body FROM idempotency_keys WHERE match_id = $1 AND key = $2;',
        [matchId, idempotencyKey]
      );
      if (existingKeyRes.rows.length > 0) {
        return existingKeyRes.rows[0].response_body;
      }
    }

    // 2. Fetch active innings
    const innRes = await this.db.query(
      `SELECT * FROM innings WHERE match_id = $1 AND status IN ('IN_PROGRESS', 'COMPLETED')
       ORDER BY innings_number DESC LIMIT 1;`,
      [matchId]
    );
    if (innRes.rows.length === 0) {
      throw ApiError.badRequest('No innings found to undo');
    }
    const innings = innRes.rows[0];

    // 3. Find latest non-reverted delivery
    const delRes = await this.db.query(
      `SELECT * FROM deliveries
       WHERE innings_id = $1 AND is_reverted = FALSE
       ORDER BY delivery_sequence DESC LIMIT 1;`,
      [innings.id]
    );

    // Check if expected delivery was already reverted
    if (expectedDeliverySequence) {
      const alreadyRevertedRes = await this.db.query(
        `SELECT * FROM deliveries
         WHERE innings_id = $1 AND delivery_sequence = $2 AND is_reverted = TRUE;`,
        [innings.id, expectedDeliverySequence]
      );
      if (alreadyRevertedRes.rows.length > 0) {
        throw ApiError.conflict(
          `Cannot undo delivery #${expectedDeliverySequence}: delivery was already reverted`,
          'OFFLINE_UNDO_CONFLICT',
          { requestedSequence: expectedDeliverySequence, alreadyReverted: true }
        );
      }
    }

    if (delRes.rows.length === 0) {
      throw ApiError.badRequest('No active delivery available to undo in this innings');
    }
    const deliveryToRevert = delRes.rows[0];

    // 4. Sequence Validation on Undo
    if (expectedDeliverySequence && expectedDeliverySequence !== deliveryToRevert.delivery_sequence) {
      const isOffline = options.isOffline || Boolean(options.targetDeliveryId);
      const pastDelRes = await this.db.query(
        `SELECT * FROM deliveries WHERE innings_id = $1 AND delivery_sequence = $2;`,
        [innings.id, expectedDeliverySequence]
      );
      const isPastOrOffline = isOffline || pastDelRes.rows.length > 0;
      const errorCode = isPastOrOffline ? 'OFFLINE_UNDO_CONFLICT' : 'STALE_SEQUENCE_CONFLICT';

      throw ApiError.conflict(
        `Cannot undo delivery #${expectedDeliverySequence}: current active delivery is #${deliveryToRevert.delivery_sequence}`,
        errorCode,
        {
          requestedSequence: expectedDeliverySequence,
          currentSequence: deliveryToRevert.delivery_sequence,
        }
      );
    }

    if (options.targetDeliveryId && options.targetDeliveryId !== deliveryToRevert.id) {
      const targetRevertedRes = await this.db.query(
        `SELECT * FROM deliveries WHERE id = $1 AND is_reverted = TRUE;`,
        [options.targetDeliveryId]
      );
      if (targetRevertedRes.rows.length > 0) {
        throw ApiError.conflict(
          `Cannot undo delivery: target delivery was already reverted`,
          'OFFLINE_UNDO_CONFLICT',
          { targetDeliveryId: options.targetDeliveryId, alreadyReverted: true }
        );
      }
      throw ApiError.conflict(
        `Cannot undo delivery: target delivery is not the latest active delivery`,
        'OFFLINE_UNDO_CONFLICT',
        {
          requestedDeliveryId: options.targetDeliveryId,
          currentDeliveryId: deliveryToRevert.id,
        }
      );
    }

    // 5. Flag delivery as reverted non-destructively
    await this.db.query(
      `UPDATE deliveries
       SET is_reverted = TRUE,
           reverted_at = NOW(),
           reverted_by_user_id = $1,
           reversion_reason = $2
       WHERE id = $3;`,
      [userId, reversionReason, deliveryToRevert.id]
    );

    // 4. Fetch all remaining active deliveries in sequence
    const activeDelsRes = await this.db.query(
      `SELECT * FROM deliveries
       WHERE innings_id = $1 AND is_reverted = FALSE
       ORDER BY delivery_sequence ASC;`,
      [innings.id]
    );
    const activeDeliveries = activeDelsRes.rows;

    // 5. Fetch match rules
    const matchRes = await this.db.query(
      `SELECT m.*, t.balls_per_over, t.overs_per_innings, t.free_hit_on_no_ball
       FROM matches m
       JOIN tournaments t ON m.tournament_id = t.id
       WHERE m.id = $1;`,
      [matchId]
    );
    const match = matchRes.rows[0];

    // 6. Fetch initial openers & first bowler
    const firstOverRes = await this.db.query(
      `SELECT * FROM overs WHERE innings_id = $1 AND over_number = 1;`,
      [innings.id]
    );
    const initialBowlerId = firstOverRes.rows[0]?.bowler_id || null;

    const openersRes = await this.db.query(
      `SELECT player_id FROM batting_performances WHERE innings_id = $1 ORDER BY batting_order ASC LIMIT 2;`,
      [innings.id]
    );
    let initialStrikerId = openersRes.rows[0]?.player_id || null;
    let initialNonStrikerId = openersRes.rows[1]?.player_id || null;

    if (!initialStrikerId || !initialNonStrikerId) {
      const firstDelRes = await this.db.query(
        `SELECT striker_id, non_striker_id FROM deliveries WHERE innings_id = $1 ORDER BY delivery_sequence ASC LIMIT 1;`,
        [innings.id]
      );
      if (firstDelRes.rows.length > 0) {
        if (!initialStrikerId) initialStrikerId = firstDelRes.rows[0].striker_id;
        if (!initialNonStrikerId) initialNonStrikerId = firstDelRes.rows[0].non_striker_id;
      }
    }

    if (!initialStrikerId || !initialNonStrikerId) {
      if (!initialStrikerId) initialStrikerId = innings.current_striker_id;
      if (!initialNonStrikerId) initialNonStrikerId = innings.current_non_striker_id;
    }

    const initialInningsState = {
      id: innings.id,
      match_id: match.id,
      innings_number: innings.innings_number,
      batting_team_id: innings.batting_team_id,
      bowling_team_id: innings.bowling_team_id,
      total_runs: 0,
      total_wickets: 0,
      total_legal_balls: 0,
      total_extras: 0,
      target_runs: innings.target_runs,
      status: 'IN_PROGRESS',
      current_striker_id: initialStrikerId,
      current_non_striker_id: initialNonStrikerId,
      current_bowler_id: initialBowlerId,
      is_free_hit: false,
      last_delivery_sequence: 0,
      current_over: {
        id: firstOverRes.rows[0]?.id,
        over_number: 1,
        bowler_id: initialBowlerId,
        ball_number: 0,
        legal_balls: 0,
        total_runs_conceded: 0,
        wickets_taken: 0,
        is_completed: false,
      },
    };

    const rulesConfig = {
      ballsPerOver: match.balls_per_over || 6,
      oversQuota: match.overs_quota || 20,
      freeHitOnNoBall: match.free_hit_on_no_ball !== false,
      maxWickets: 10,
    };

    // 7. Deterministically Replay remaining deliveries
    const replayedState = ReplayEngine.replayInnings(initialInningsState, activeDeliveries, rulesConfig);

    // 8. Update database with replayed state
    const activeOverRes = await this.db.query(
      `SELECT bowler_id FROM overs WHERE innings_id = $1 AND is_completed = FALSE ORDER BY over_number DESC LIMIT 1;`,
      [innings.id]
    );
    const activeBowlerId = (activeOverRes.rows.length > 0 && activeOverRes.rows[0].bowler_id)
      ? activeOverRes.rows[0].bowler_id
      : replayedState.current_bowler_id;

    await this.db.query(
      `UPDATE innings
       SET total_runs = $1,
           total_wickets = $2,
           total_legal_balls = $3,
           total_extras = $4,
           status = $5,
           current_striker_id = $6,
           current_non_striker_id = $7,
           current_bowler_id = $8
       WHERE id = $9;`,
      [
        replayedState.total_runs,
        replayedState.total_wickets,
        replayedState.total_legal_balls,
        replayedState.total_extras,
        replayedState.status,
        replayedState.current_striker_id,
        replayedState.current_non_striker_id,
        activeBowlerId,
        innings.id,
      ]
    );

    // Update all overs for this innings to accurately reflect remaining active deliveries
    const ballsPerOver = match.balls_per_over || 6;
    await this.db.query(
      `UPDATE overs o
       SET legal_balls = sub.legal_balls,
           total_runs_conceded = sub.total_runs_conceded,
           wickets_taken = sub.wickets_taken,
           is_completed = (sub.legal_balls >= $2)
       FROM (
         SELECT ov.id,
                COUNT(d.id) FILTER (WHERE d.is_legal = TRUE)::int as legal_balls,
                COALESCE(SUM(d.runs_batter + d.runs_extras), 0)::int as total_runs_conceded,
                COUNT(d.id) FILTER (WHERE d.is_wicket = TRUE)::int as wickets_taken
         FROM overs ov
         LEFT JOIN deliveries d ON d.over_id = ov.id AND d.is_reverted = FALSE
         WHERE ov.innings_id = $1
         GROUP BY ov.id
       ) sub
       WHERE o.id = sub.id;`,
      [innings.id, ballsPerOver]
    );

    // Reset and recalculate performance scorecards
    await this.db.query(
      `UPDATE batting_performances
       SET runs_scored = 0, balls_faced = 0, fours = 0, sixes = 0, is_out = FALSE, wicket_type = 'NONE', dismissal_text = NULL
       WHERE innings_id = $1;`,
      [innings.id]
    );

    await this.db.query(
      `UPDATE bowling_performances
       SET legal_balls_bowled = 0, runs_conceded = 0, wickets = 0, wides = 0, no_balls = 0
       WHERE innings_id = $1;`,
      [innings.id]
    );

    for (const d of activeDeliveries) {
      await this.db.query(
        `UPDATE batting_performances
         SET runs_scored = runs_scored + $1,
             balls_faced = balls_faced + $2,
             fours = fours + $3,
             sixes = sixes + $4,
             is_out = CASE WHEN player_id = $5 THEN TRUE ELSE is_out END,
             wicket_type = CASE WHEN player_id = $5 THEN $6 ELSE wicket_type END
         WHERE innings_id = $7 AND player_id = $8;`,
        [
          d.runs_batter,
          d.extra_type !== 'WIDE' ? 1 : 0,
          d.runs_batter === 4 ? 1 : 0,
          d.runs_batter === 6 ? 1 : 0,
          d.dismissed_player_id,
          d.wicket_type,
          innings.id,
          d.striker_id,
        ]
      );

      const bowlerRuns = (d.extra_type === 'WIDE' || d.extra_type === 'NO_BALL')
        ? (d.runs_batter + d.runs_extras)
        : (d.extra_type === 'BYE' || d.extra_type === 'LEG_BYE' ? 0 : d.runs_batter);

      await this.db.query(
        `UPDATE bowling_performances
         SET legal_balls_bowled = legal_balls_bowled + $1,
             runs_conceded = runs_conceded + $2,
             wickets = wickets + $3,
             wides = wides + $4,
             no_balls = no_balls + $5
         WHERE innings_id = $6 AND player_id = $7;`,
        [
          d.is_legal ? 1 : 0,
          bowlerRuns,
          d.is_wicket && !['RUN_OUT', 'RETIRED_HURT'].includes(d.wicket_type) ? 1 : 0,
          d.extra_type === 'WIDE' ? d.runs_extras : 0,
          d.extra_type === 'NO_BALL' ? 1 : 0,
          innings.id,
          d.bowler_id,
        ]
      );
    }

    const undoResponsePayload = {
      reverted_delivery_sequence: deliveryToRevert.delivery_sequence,
      current_innings_state: {
        total_runs: replayedState.total_runs,
        total_wickets: replayedState.total_wickets,
        overs_completed_str: `${Math.floor(replayedState.total_legal_balls / (match.balls_per_over || 6))}.${replayedState.total_legal_balls % (match.balls_per_over || 6)}`,
        current_striker_id: replayedState.current_striker_id,
        current_non_striker_id: replayedState.current_non_striker_id,
        current_bowler_id: replayedState.current_bowler_id,
      },
    };

    if (idempotencyKey) {
      await this.db.query(
        `INSERT INTO idempotency_keys (key, match_id, response_body)
         VALUES ($1, $2, $3)
         ON CONFLICT (match_id, key) DO NOTHING;`,
        [idempotencyKey, matchId, JSON.stringify(undoResponsePayload)]
      );
    }

    // Automatically recalculate tournament standings on undo if in a tournament
    if (match.tournament_id) {
      try {
        const pointsTableService = new PointsTableService(this.db);
        await pointsTableService.recalculateTournamentPoints(match.tournament_id);
      } catch (e) {
        console.error('Failed to auto-recalculate points table on undo:', e);
      }
    }

    // Emit live match event to in-process bus for connected spectators
    matchEventBus.emitMatchEvent(matchId, {
      type: MATCH_INTERNAL_EVENTS.DELIVERY_REVERTED,
      deliverySequence: deliveryToRevert.delivery_sequence,
      inningsId: innings.id,
      replayedState: undoResponsePayload.current_innings_state,
    });

    return undoResponsePayload;
  }
}
