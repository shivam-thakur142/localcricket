// ====================================================================
// CRICKET ENGINE: WICKET RULES & DISMISSAL INVARIANTS
// ====================================================================

import { WICKET_TYPES, EXTRAS_TYPES } from '../../../../shared/constants/cricketConstants.js';
import { ApiError } from '../../utils/ApiError.js';

export class WicketRules {
  /**
   * Allowed dismissals during a Free Hit
   */
  static FREE_HIT_ALLOWED_WICKETS = [
    WICKET_TYPES.RUN_OUT,
    WICKET_TYPES.OBSTRUCTING_FIELD,
    WICKET_TYPES.HIT_BALL_TWICE,
  ];

  /**
   * Allowed dismissals on a Wide delivery
   */
  static WIDE_ALLOWED_WICKETS = [
    WICKET_TYPES.STUMPED,
    WICKET_TYPES.RUN_OUT,
    WICKET_TYPES.HIT_WICKET,
    WICKET_TYPES.OBSTRUCTING_FIELD,
  ];

  /**
   * Dismissals that count towards the bowler's wicket tally
   */
  static BOWLER_CREDITED_WICKETS = [
    WICKET_TYPES.BOWLED,
    WICKET_TYPES.CAUGHT,
    WICKET_TYPES.LBW,
    WICKET_TYPES.STUMPED,
    WICKET_TYPES.HIT_WICKET,
  ];

  /**
   * Validate a dismissal against cricket laws, free hit state, and delivery extra type
   */
  static validateDismissal({
    isWicket,
    wicketType,
    dismissedPlayerId,
    strikerId,
    nonStrikerId,
    isFreeHit,
    extraType,
  }) {
    if (!isWicket) {
      if (wicketType && wicketType !== WICKET_TYPES.NONE) {
        throw ApiError.badRequest('wicket_type must be NONE when is_wicket is FALSE', 'INVALID_WICKET_INVARIANT');
      }
      if (dismissedPlayerId) {
        throw ApiError.badRequest('dismissed_player_id must be null when is_wicket is FALSE', 'INVALID_WICKET_INVARIANT');
      }
      return;
    }

    // When is_wicket is TRUE
    if (!wicketType || wicketType === WICKET_TYPES.NONE) {
      throw ApiError.badRequest('wicket_type cannot be NONE when is_wicket is TRUE', 'INVALID_WICKET_TYPE');
    }

    if (!dismissedPlayerId) {
      throw ApiError.badRequest('dismissed_player_id is required when is_wicket is TRUE', 'DISMISSED_PLAYER_REQUIRED');
    }

    if (dismissedPlayerId !== strikerId && dismissedPlayerId !== nonStrikerId) {
      throw ApiError.unprocessable(
        `Dismissed player ${dismissedPlayerId} is not on the pitch (Striker: ${strikerId}, Non-Striker: ${nonStrikerId})`,
        'DISMISSED_PLAYER_NOT_ON_PITCH'
      );
    }

    // 1. Enforce Free Hit restrictions
    if (isFreeHit && !this.FREE_HIT_ALLOWED_WICKETS.includes(wicketType)) {
      throw ApiError.unprocessable(
        `Dismissal type ${wicketType} is not permitted on a Free Hit. Allowed: ${this.FREE_HIT_ALLOWED_WICKETS.join(', ')}`,
        'FREE_HIT_DISMISSAL_NOT_PERMITTED'
      );
    }

    // 2. Enforce No-Ball restrictions (Identical to Free Hit)
    if (extraType === EXTRAS_TYPES.NO_BALL && !this.FREE_HIT_ALLOWED_WICKETS.includes(wicketType)) {
      throw ApiError.unprocessable(
        `Dismissal type ${wicketType} is not permitted on a No-Ball delivery. Allowed: ${this.FREE_HIT_ALLOWED_WICKETS.join(', ')}`,
        'NO_BALL_DISMISSAL_NOT_PERMITTED'
      );
    }

    // 3. Enforce Wide restrictions
    if (extraType === EXTRAS_TYPES.WIDE && !this.WIDE_ALLOWED_WICKETS.includes(wicketType)) {
      throw ApiError.unprocessable(
        `Dismissal type ${wicketType} is not permitted on a Wide delivery. Allowed: ${this.WIDE_ALLOWED_WICKETS.join(', ')}`,
        'WIDE_DISMISSAL_NOT_PERMITTED'
      );
    }
  }

  /**
   * Check if a wicket type credits the bowler's figures
   */
  static isBowlerWicket(wicketType) {
    return this.BOWLER_CREDITED_WICKETS.includes(wicketType);
  }
}
