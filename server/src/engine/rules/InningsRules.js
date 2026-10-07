// ====================================================================
// CRICKET ENGINE: INNINGS & MATCH TERMINATION RULES
// ====================================================================

import { MATCH_RESULTS } from '../../../../shared/constants/cricketConstants.js';

export class InningsRules {
  /**
   * Determine if an innings has completed after a delivery
   */
  static evaluateInningsStatus({
    inningsNumber,
    totalRuns,
    totalWickets,
    totalLegalBalls,
    targetRuns = null,
    oversQuota = 20,
    ballsPerOver = 6,
    maxWickets = 10,
    battingTeamId,
    bowlingTeamId,
  }) {
    const totalBallsQuota = oversQuota * ballsPerOver;

    // 1. Target chased down in 2nd innings
    if (inningsNumber === 2 && targetRuns !== null && totalRuns >= targetRuns) {
      const wicketsInHand = maxWickets - totalWickets;
      return {
        isCompleted: true,
        completionReason: 'TARGET_REACHED',
        isMatchCompleted: true,
        winnerTeamId: battingTeamId,
        resultType: MATCH_RESULTS.NORMAL,
        resultMarginRuns: null,
        resultMarginWickets: wicketsInHand,
      };
    }

    // 2. All Out
    if (totalWickets >= maxWickets) {
      if (inningsNumber === 1) {
        return {
          isCompleted: true,
          completionReason: 'ALL_OUT',
          isMatchCompleted: false,
          nextTargetRuns: totalRuns + 1,
        };
      } else {
        // 2nd innings all out
        return this.resolveSecondInningsResult({
          totalRuns,
          targetRuns,
          battingTeamId,
          bowlingTeamId,
          completionReason: 'ALL_OUT',
        });
      }
    }

    // 3. Overs Quota Exhausted
    if (totalLegalBalls >= totalBallsQuota) {
      if (inningsNumber === 1) {
        return {
          isCompleted: true,
          completionReason: 'OVERS_EXHAUSTED',
          isMatchCompleted: false,
          nextTargetRuns: totalRuns + 1,
        };
      } else {
        // 2nd innings overs finished
        return this.resolveSecondInningsResult({
          totalRuns,
          targetRuns,
          battingTeamId,
          bowlingTeamId,
          completionReason: 'OVERS_EXHAUSTED',
        });
      }
    }

    // Innings is still in progress
    return {
      isCompleted: false,
      completionReason: null,
      isMatchCompleted: false,
    };
  }

  /**
   * Helper to resolve 2nd innings completion outcome (Win / Loss / Tie)
   */
  static resolveSecondInningsResult({
    totalRuns,
    targetRuns,
    battingTeamId,
    bowlingTeamId,
    completionReason,
  }) {
    const runsDifference = (targetRuns - 1) - totalRuns;

    if (totalRuns >= targetRuns) {
      return {
        isCompleted: true,
        completionReason,
        isMatchCompleted: true,
        winnerTeamId: battingTeamId,
        resultType: MATCH_RESULTS.NORMAL,
        resultMarginRuns: null,
        resultMarginWickets: 0,
      };
    }

    if (runsDifference === 0) {
      // Scores level -> Tied match
      return {
        isCompleted: true,
        completionReason,
        isMatchCompleted: true,
        winnerTeamId: null,
        resultType: MATCH_RESULTS.TIED,
        resultMarginRuns: 0,
        resultMarginWickets: null,
      };
    }

    // Bowling team defended the total
    return {
      isCompleted: true,
      completionReason,
      isMatchCompleted: true,
      winnerTeamId: bowlingTeamId,
      resultType: MATCH_RESULTS.NORMAL,
      resultMarginRuns: runsDifference,
      resultMarginWickets: null,
    };
  }
}
