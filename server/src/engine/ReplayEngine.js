// ====================================================================
// CRICKET ENGINE: DETERMINISTIC REPLAY & RECONSTITUTION
// ====================================================================

import { CricketScoringEngine } from './CricketScoringEngine.js';

export class ReplayEngine {
  /**
   * Reconstitute complete match state by replaying an append-only delivery stream
   * 
   * @param {Object} initialInningsState
   * @param {Array<Object>} activeDeliveries - Active (non-reverted) deliveries ordered by sequence
   * @param {Object} rulesConfig
   * @param {Function} [onNewOverCallback] - Hook to provide new bowler when over completes
   * @returns {Object} finalInningsState
   */
  static replayInnings(initialInningsState, activeDeliveries, rulesConfig = {}, onNewOverCallback = null) {
    let state = JSON.parse(JSON.stringify(initialInningsState));

    for (let i = 0; i < activeDeliveries.length; i++) {
      const delivery = activeDeliveries[i];

      // If previous over finished and current over has no bowler set, apply hook if provided
      if (state.current_over.is_completed) {
        if (onNewOverCallback) {
          const nextOverData = onNewOverCallback(state, delivery);
          state.current_over = nextOverData.over;
          state.current_bowler_id = nextOverData.bowler_id;
        } else {
          // Advance over
          state.current_over = {
            id: delivery.over_id,
            over_number: state.current_over.over_number + 1,
            bowler_id: delivery.bowler_id,
            ball_number: 0,
            legal_balls: 0,
            total_runs_conceded: 0,
            wickets_taken: 0,
            is_completed: false,
          };
          state.current_bowler_id = delivery.bowler_id;
        }
      }

      // Replay delivery action
      const actionPayload = {
        runs_batter: delivery.runs_batter,
        runs_extras: delivery.runs_extras,
        extra_type: delivery.extra_type,
        is_wicket: delivery.is_wicket,
        wicket_type: delivery.wicket_type,
        dismissed_player_id: delivery.dismissed_player_id,
        assist_player_id: delivery.assist_player_id,
        incoming_batter_id: delivery.incoming_batter_id,
        crossed_on_run_out: delivery.crossed_on_run_out,
        physical_runs_taken: delivery.physical_runs_taken,
        commentary_text: delivery.commentary_text,
      };

      const result = CricketScoringEngine.processDelivery(state, actionPayload, rulesConfig);
      state = result.nextState;
    }

    return state;
  }
}
