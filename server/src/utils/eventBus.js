// ====================================================================
// EVENT BUS: IN-PROCESS SINGLE-NODE EVENT DISPATCHER FOR MATCH EVENTS
// ====================================================================

import { EventEmitter } from 'events';

export const MATCH_INTERNAL_EVENTS = {
  DELIVERY_RECORDED: 'DELIVERY_RECORDED',
  DELIVERY_REVERTED: 'DELIVERY_REVERTED',
  INNINGS_STATE_CHANGED: 'INNINGS_STATE_CHANGED',
  MATCH_COMPLETED: 'MATCH_COMPLETED',
};

class MatchEventBus extends EventEmitter {
  constructor() {
    super();
    // Allow ample listeners for concurrent spectator connections in test/dev
    this.setMaxListeners(1000);
  }

  /**
   * Emit internal match event scoped to a specific match
   * @param {string} matchId
   * @param {Object} eventPayload
   */
  emitMatchEvent(matchId, eventPayload) {
    if (!matchId) return;
    const payload = {
      ...eventPayload,
      matchId,
      timestamp: new Date().toISOString(),
    };
    this.emit(`match:${matchId}`, payload);
    this.emit('global_match_update', payload);
  }

  /**
   * Subscribe to match-specific events
   * @param {string} matchId
   * @param {Function} handler
   */
  onMatch(matchId, handler) {
    this.on(`match:${matchId}`, handler);
  }

  /**
   * Unsubscribe from match-specific events
   * @param {string} matchId
   * @param {Function} handler
   */
  offMatch(matchId, handler) {
    this.off(`match:${matchId}`, handler);
  }

  /**
   * Subscribe to platform-wide live match updates (Super Admin stream)
   * @param {Function} handler
   */
  onGlobal(handler) {
    this.on('global_match_update', handler);
  }

  /**
   * Unsubscribe from platform-wide live match updates
   * @param {Function} handler
   */
  offGlobal(handler) {
    this.off('global_match_update', handler);
  }
}

// Global in-process singleton instance
export const matchEventBus = new MatchEventBus();
