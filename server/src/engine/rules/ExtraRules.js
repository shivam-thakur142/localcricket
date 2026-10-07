// ====================================================================
// CRICKET ENGINE: EXTRAS RULES & INVARIANTS
// ====================================================================

import { EXTRAS_TYPES } from '../../../../shared/constants/cricketConstants.js';
import { ApiError } from '../../utils/ApiError.js';

export class ExtraRules {
  /**
   * Validate and classify a delivery extra type
   */
  static validateDeliveryExtras(extraType, runsBatter, runsExtras) {
    if (!Object.values(EXTRAS_TYPES).includes(extraType)) {
      throw ApiError.badRequest(
        `Invalid extra_type: "${extraType}". Must be one of ${Object.values(EXTRAS_TYPES).join(', ')}`,
        'INVALID_EXTRA_TYPE'
      );
    }

    if (runsBatter < 0 || runsBatter > 7) {
      throw ApiError.badRequest('runs_batter must be between 0 and 7', 'INVALID_RUNS_BATTER');
    }

    if (runsExtras < 0) {
      throw ApiError.badRequest('runs_extras must be non-negative', 'INVALID_RUNS_EXTRAS');
    }

    switch (extraType) {
      case EXTRAS_TYPES.NONE:
        if (runsExtras !== 0) {
          throw ApiError.badRequest('runs_extras must be 0 when extra_type is NONE', 'INVALID_EXTRAS_INVARIANT');
        }
        return { isLegal: true, facesBall: true, bowlerChargesExtras: false };

      case EXTRAS_TYPES.WIDE:
        if (runsBatter !== 0) {
          throw ApiError.badRequest('runs_batter must be 0 on a WIDE delivery', 'INVALID_WIDE_INVARIANT');
        }
        if (runsExtras < 1) {
          throw ApiError.badRequest('runs_extras must be at least 1 on a WIDE delivery', 'INVALID_WIDE_INVARIANT');
        }
        return { isLegal: false, facesBall: false, bowlerChargesExtras: true };

      case EXTRAS_TYPES.NO_BALL:
        if (runsExtras < 1) {
          throw ApiError.badRequest('runs_extras must be at least 1 on a NO_BALL delivery', 'INVALID_NO_BALL_INVARIANT');
        }
        return { isLegal: false, facesBall: true, bowlerChargesExtras: true };

      case EXTRAS_TYPES.BYE:
      case EXTRAS_TYPES.LEG_BYE:
        if (runsBatter !== 0) {
          throw ApiError.badRequest(
            `runs_batter must be 0 on a ${extraType} delivery`,
            'INVALID_BYES_INVARIANT'
          );
        }
        if (runsExtras < 1) {
          throw ApiError.badRequest(
            `runs_extras must be at least 1 on a ${extraType} delivery`,
            'INVALID_BYES_INVARIANT'
          );
        }
        return { isLegal: true, facesBall: true, bowlerChargesExtras: false };

      case EXTRAS_TYPES.PENALTY:
        if (runsBatter !== 0) {
          throw ApiError.badRequest('runs_batter must be 0 on a PENALTY delivery', 'INVALID_PENALTY_INVARIANT');
        }
        if (runsExtras < 1) {
          throw ApiError.badRequest('runs_extras must be at least 1 on a PENALTY delivery', 'INVALID_PENALTY_INVARIANT');
        }
        return { isLegal: true, facesBall: false, bowlerChargesExtras: false };

      default:
        throw ApiError.badRequest(`Unsupported extra_type: ${extraType}`, 'UNSUPPORTED_EXTRA_TYPE');
    }
  }

  /**
   * Calculate runs conceded by the bowler for this delivery
   */
  static calculateBowlerRunsConceded(extraType, runsBatter, runsExtras) {
    if (extraType === EXTRAS_TYPES.WIDE || extraType === EXTRAS_TYPES.NO_BALL) {
      return runsBatter + runsExtras;
    }
    if (extraType === EXTRAS_TYPES.BYE || extraType === EXTRAS_TYPES.LEG_BYE || extraType === EXTRAS_TYPES.PENALTY) {
      return 0; // Byes and leg byes do not count against the bowler
    }
    return runsBatter;
  }
}
