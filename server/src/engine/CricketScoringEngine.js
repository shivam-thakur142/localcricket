// ====================================================================
// CRICKET ENGINE: DETERMINISTIC CORE SCORING STATE MACHINE
// ====================================================================

import { ExtraRules } from './rules/ExtraRules.js';
import { WicketRules } from './rules/WicketRules.js';
import { StrikeRotation } from './rules/StrikeRotation.js';
import { InningsRules } from './rules/InningsRules.js';
import { EXTRAS_TYPES, WICKET_TYPES } from '../../../shared/constants/cricketConstants.js';
import { ApiError } from '../utils/ApiError.js';

export class CricketScoringEngine {
  /**
   * Process a single delivery against the current state
   * 
   * @param {Object} currentState
   * @param {Object} actionPayload
   * @param {Object} rulesConfig
   * @returns {Object} nextState, deliveryRecord, scorecardUpdates, events
   */
  static processDelivery(currentState, actionPayload, rulesConfig = {}) {
    const {
      ballsPerOver = 6,
      oversQuota = 20,
      freeHitOnNoBall = true,
      maxWickets = 10,
    } = rulesConfig;

    // 1. Guard match & innings state
    if (currentState.status === 'COMPLETED') {
      throw ApiError.badRequest('Innings is already completed', 'INNINGS_ALREADY_COMPLETED');
    }

    if (!currentState.current_striker_id || !currentState.current_non_striker_id) {
      throw ApiError.badRequest('Both striker and non-striker must be present on the pitch', 'BATTERS_NOT_ON_PITCH');
    }

    if (!currentState.current_bowler_id) {
      throw ApiError.badRequest('An active bowler must be nominated to bowl', 'BOWLER_NOT_NOMINATED');
    }

    if (currentState.current_over.is_completed) {
      throw ApiError.badRequest('Current over is completed. A new over must be started with a nominated bowler', 'OVER_ALREADY_COMPLETED');
    }

    // 2. Parse delivery attributes
    const runsBatter = Number(actionPayload.runs_batter || 0);
    const runsExtras = Number(actionPayload.runs_extras || 0);
    const extraType = actionPayload.extra_type || EXTRAS_TYPES.NONE;
    const isWicket = Boolean(actionPayload.is_wicket);
    const wicketType = isWicket ? (actionPayload.wicket_type || WICKET_TYPES.NONE) : WICKET_TYPES.NONE;
    const dismissedPlayerId = isWicket ? actionPayload.dismissed_player_id : null;
    const assistPlayerId = isWicket ? (actionPayload.assist_player_id || null) : null;
    const incomingBatterId = actionPayload.incoming_batter_id || null;
    const crossedOnRunOut = Boolean(actionPayload.crossed_on_run_out);
    const commentaryText = actionPayload.commentary_text || null;

    // 3. Physical runs taken for strike rotation
    let physicalRunsTaken = 0;
    if (actionPayload.physical_runs_taken !== undefined) {
      physicalRunsTaken = Number(actionPayload.physical_runs_taken);
    } else if (extraType === EXTRAS_TYPES.BYE || extraType === EXTRAS_TYPES.LEG_BYE) {
      physicalRunsTaken = runsExtras;
    } else if (extraType === EXTRAS_TYPES.NONE || extraType === EXTRAS_TYPES.NO_BALL) {
      physicalRunsTaken = runsBatter;
    }

    // 4. Validate Extras & Legality
    const { isLegal, facesBall, bowlerChargesExtras } = ExtraRules.validateDeliveryExtras(
      extraType,
      runsBatter,
      runsExtras
    );

    // 5. Validate Dismissals
    const isFreeHit = Boolean(currentState.is_free_hit);
    WicketRules.validateDismissal({
      isWicket,
      wicketType,
      dismissedPlayerId,
      strikerId: currentState.current_striker_id,
      nonStrikerId: currentState.current_non_striker_id,
      isFreeHit,
      extraType,
    });

    // 6. Compute delivery numbers
    const deliverySequence = (currentState.last_delivery_sequence || 0) + 1;
    const ballNumber = (currentState.current_over.ball_number || 0) + 1;
    const legalBallNumber = isLegal
      ? (currentState.current_over.legal_balls || 0) + 1
      : (currentState.current_over.legal_balls || 0);

    const isOverCompleted = isLegal && legalBallNumber >= ballsPerOver;

    // 7. Calculate Batters for Next Ball
    let nextStrikerId = currentState.current_striker_id;
    let nextNonStrikerId = currentState.current_non_striker_id;

    if (isWicket) {
      const remainingWickets = maxWickets - (currentState.total_wickets + 1);
      if (remainingWickets > 0 && !incomingBatterId) {
        throw ApiError.badRequest(
          'incoming_batter_id is required when a wicket falls and team is not all out',
          'INCOMING_BATTER_REQUIRED'
        );
      }
    }

    const { nextStrikerId: newStriker, nextNonStrikerId: newNonStriker } = StrikeRotation.calculateNextBatters({
      currentStrikerId: currentState.current_striker_id,
      currentNonStrikerId: currentState.current_non_striker_id,
      physicalRunsTaken,
      isWicket,
      wicketType,
      dismissedPlayerId,
      crossedOnRunOut,
      incomingBatterId,
      isOverCompleted,
    });

    nextStrikerId = newStriker;
    nextNonStrikerId = newNonStriker;

    // 8. Calculate Runs & Extras
    const totalDeliveryRuns = runsBatter + runsExtras;
    const bowlerRunsConceded = ExtraRules.calculateBowlerRunsConceded(extraType, runsBatter, runsExtras);
    const isBowlerWicket = isWicket && WicketRules.isBowlerWicket(wicketType);

    const nextTotalRuns = currentState.total_runs + totalDeliveryRuns;
    const nextTotalWickets = currentState.total_wickets + (isWicket ? 1 : 0);
    const nextTotalLegalBalls = currentState.total_legal_balls + (isLegal ? 1 : 0);
    const nextTotalExtras = currentState.total_extras + runsExtras;

    // 9. Free-Hit State Progression
    let nextIsFreeHit = false;
    if (extraType === EXTRAS_TYPES.NO_BALL && freeHitOnNoBall) {
      nextIsFreeHit = true;
    } else if (isFreeHit) {
      // Free hit carries through intervening illegal deliveries (Wide or No-Ball)
      nextIsFreeHit = !isLegal;
    }

    // 10. Check Innings & Match Termination
    const inningsResult = InningsRules.evaluateInningsStatus({
      inningsNumber: currentState.innings_number,
      totalRuns: nextTotalRuns,
      totalWickets: nextTotalWickets,
      totalLegalBalls: nextTotalLegalBalls,
      targetRuns: currentState.target_runs,
      oversQuota,
      ballsPerOver,
      maxWickets,
      battingTeamId: currentState.batting_team_id,
      bowlingTeamId: currentState.bowling_team_id,
    });

    const isMatchEnded = inningsResult.isCompleted;

    // 11. Prepare Database Delivery Record
    const deliveryRecord = {
      innings_id: currentState.id,
      over_id: currentState.current_over.id,
      delivery_sequence: deliverySequence,
      ball_number: ballNumber,
      legal_ball_number: legalBallNumber,
      bowler_id: currentState.current_bowler_id,
      striker_id: currentState.current_striker_id,
      non_striker_id: currentState.current_non_striker_id,
      runs_batter: runsBatter,
      runs_extras: runsExtras,
      extra_type: extraType,
      is_legal: isLegal,
      is_wicket: isWicket,
      wicket_type: wicketType,
      dismissed_player_id: dismissedPlayerId,
      assist_player_id: assistPlayerId,
      commentary_text: commentaryText,
      is_reverted: false,
    };

    // 12. Prepare Updated State Snapshot
    const nextState = {
      id: currentState.id,
      match_id: currentState.match_id,
      innings_number: currentState.innings_number,
      batting_team_id: currentState.batting_team_id,
      bowling_team_id: currentState.bowling_team_id,
      total_runs: nextTotalRuns,
      total_wickets: nextTotalWickets,
      total_legal_balls: nextTotalLegalBalls,
      total_extras: nextTotalExtras,
      target_runs: currentState.target_runs,
      status: inningsResult.isCompleted ? 'COMPLETED' : 'IN_PROGRESS',
      current_striker_id: isMatchEnded ? null : nextStrikerId,
      current_non_striker_id: isMatchEnded ? null : nextNonStrikerId,
      current_bowler_id: (isMatchEnded || isOverCompleted) ? null : currentState.current_bowler_id,
      is_free_hit: nextIsFreeHit,
      last_delivery_sequence: deliverySequence,
      current_over: {
        id: currentState.current_over.id,
        over_number: currentState.current_over.over_number,
        bowler_id: currentState.current_bowler_id,
        ball_number: ballNumber,
        legal_balls: legalBallNumber,
        total_runs_conceded: currentState.current_over.total_runs_conceded + bowlerRunsConceded,
        wickets_taken: currentState.current_over.wickets_taken + (isBowlerWicket ? 1 : 0),
        is_completed: isOverCompleted,
      },
      matchOutcome: inningsResult,
    };

    return {
      deliveryRecord,
      nextState,
      deliveryRuns: totalDeliveryRuns,
      bowlerRunsConceded,
      facesBall,
      isBowlerWicket,
    };
  }
}
