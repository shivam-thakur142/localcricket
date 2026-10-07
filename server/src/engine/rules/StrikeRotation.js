// ====================================================================
// CRICKET ENGINE: STRIKE ROTATION & END CHANGE LOGIC
// ====================================================================

import { WICKET_TYPES } from '../../../../shared/constants/cricketConstants.js';

export class StrikeRotation {
  /**
   * Determine striker and non-striker after a delivery
   * 
   * @param {Object} params
   * @param {string} params.currentStrikerId
   * @param {string} params.currentNonStrikerId
   * @param {number} params.physicalRunsTaken - Runs completed by running between wickets
   * @param {boolean} params.isWicket
   * @param {string} params.wicketType
   * @param {string|null} params.dismissedPlayerId
   * @param {boolean} params.crossedOnRunOut - True if batters crossed on an uncompleted run
   * @param {string|null} params.incomingBatterId - New batter taking field after dismissal
   * @param {boolean} params.isOverCompleted - True if legal ball limit reached
   * @returns {{ nextStrikerId: string|null, nextNonStrikerId: string|null }}
   */
  static calculateNextBatters({
    currentStrikerId,
    currentNonStrikerId,
    physicalRunsTaken = 0,
    isWicket = false,
    wicketType = WICKET_TYPES.NONE,
    dismissedPlayerId = null,
    crossedOnRunOut = false,
    incomingBatterId = null,
    isOverCompleted = false,
  }) {
    let striker = currentStrikerId;
    let nonStriker = currentNonStrikerId;

    if (!isWicket) {
      // 1. In-play strike rotation from running odd runs
      if (physicalRunsTaken % 2 !== 0) {
        [striker, nonStriker] = [nonStriker, striker];
      }

      // 2. End-of-over end swap
      if (isOverCompleted) {
        [striker, nonStriker] = [nonStriker, striker];
      }

      return { nextStrikerId: striker, nextNonStrikerId: nonStriker };
    }

    // --- WICKET CASES ---
    if (wicketType === WICKET_TYPES.RUN_OUT) {
      // Physical runs completed swap ends
      let runsSwapped = (physicalRunsTaken % 2 !== 0);
      if (runsSwapped) {
        [striker, nonStriker] = [nonStriker, striker];
      }

      // If batters crossed on the uncompleted attempt where the run-out happened:
      if (crossedOnRunOut) {
        [striker, nonStriker] = [nonStriker, striker];
      }

      // Place incoming batter at the vacant end of the dismissed player
      if (dismissedPlayerId === currentStrikerId) {
        // Original striker out
        if (striker === currentStrikerId) {
          striker = incomingBatterId;
        } else {
          nonStriker = incomingBatterId;
        }
      } else {
        // Original non-striker out
        if (nonStriker === currentNonStrikerId) {
          nonStriker = incomingBatterId;
        } else {
          striker = incomingBatterId;
        }
      }
    } else if (wicketType === WICKET_TYPES.RETIRED_HURT) {
      // Incoming batter replaces retired batter at their current end
      if (dismissedPlayerId === currentStrikerId) {
        striker = incomingBatterId;
      } else {
        nonStriker = incomingBatterId;
      }

      if (physicalRunsTaken % 2 !== 0) {
        [striker, nonStriker] = [nonStriker, striker];
      }
    } else {
      // Standard dismissals (Bowled, Caught, LBW, Stumped, Hit Wicket):
      // Striker was dismissed. MCC Law 18.11: New batter always takes striker's end.
      striker = incomingBatterId;
      nonStriker = currentNonStrikerId;
    }

    // 3. Over completion end swap
    if (isOverCompleted) {
      [striker, nonStriker] = [nonStriker, striker];
    }

    return { nextStrikerId: striker, nextNonStrikerId: nonStriker };
  }
}
