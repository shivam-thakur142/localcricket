// ====================================================================
// MATCH CONTROLLER: PUBLIC SPECTATOR HTTP HANDLERS, SSE STREAM & ADMIN
// ====================================================================

import { ApiResponse } from '../utils/ApiResponse.js';
import { matchEventBus } from '../utils/eventBus.js';

export class MatchController {
  constructor(matchService, analyticsService) {
    this.matchService = matchService;
    this.analyticsService = analyticsService;
  }

  getMatch = async (req, res, next) => {
    try {
      const match = await this.matchService.getMatch(req.params.matchId);
      ApiResponse.success(match, 'Match details retrieved').send(res);
    } catch (err) {
      next(err);
    }
  };

  getMatchSquads = async (req, res, next) => {
    try {
      const squads = await this.matchService.getMatchSquads(req.params.matchId);
      ApiResponse.success(squads, 'Match squads retrieved').send(res);
    } catch (err) {
      next(err);
    }
  };

  getMatchLive = async (req, res, next) => {
    try {
      const liveData = await this.matchService.getMatchLive(req.params.matchId);
      ApiResponse.success(liveData, 'Live match data retrieved').send(res);
    } catch (err) {
      next(err);
    }
  };

  getMatchScorecard = async (req, res, next) => {
    try {
      const scorecard = await this.matchService.getMatchScorecard(req.params.matchId);
      ApiResponse.success(scorecard, 'Scorecard retrieved').send(res);
    } catch (err) {
      next(err);
    }
  };

  getMatchCommentary = async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      const filter = req.query.filter || 'all';
      const commentary = await this.matchService.getMatchCommentary(req.params.matchId, { limit, offset, filter });
      ApiResponse.success(commentary, 'Commentary retrieved').send(res);
    } catch (err) {
      next(err);
    }
  };

  getMatchAnalytics = async (req, res, next) => {
    try {
      if (!this.analyticsService) {
        throw new Error('Analytics service not configured');
      }
      const analytics = await this.analyticsService.getMatchAnalytics(req.params.matchId);
      ApiResponse.success(analytics, 'Match analytics retrieved').send(res);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Server-Sent Events (SSE) live broadcast stream
   */
  streamMatch = async (req, res, next) => {
    const matchId = req.params.matchId;

    try {
      // 1. Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      if (res.flushHeaders) {
        res.flushHeaders();
      }

      // 2. Immediately send the authoritative initial_snapshot
      const liveData = await this.matchService.getMatchLive(matchId);
      const snapshotSeq = liveData.latest_delivery_sequence || 0;
      const initialSnapshot = {
        eventId: `snap_${Date.now()}_${snapshotSeq}`,
        eventType: 'INITIAL_SNAPSHOT',
        matchId,
        deliverySequence: snapshotSeq,
        version: snapshotSeq,
        timestamp: new Date().toISOString(),
        liveState: liveData,
      };

      res.write(`event: initial_snapshot\ndata: ${JSON.stringify(initialSnapshot)}\n\n`);

      // 3. Keep-alive heartbeat ping every 25 seconds
      const pingInterval = setInterval(() => {
        try {
          res.write(`event: ping\ndata: {}\n\n`);
        } catch (err) {
          clearInterval(pingInterval);
        }
      }, 25000);

      // 4. Register listener on in-process MatchEventBus
      const handleMatchEvent = async (event) => {
        try {
          const freshLive = await this.matchService.getMatchLive(matchId);
          const seq = event.deliverySequence || freshLive.latest_delivery_sequence || 0;
          const publicPayload = {
            eventId: `evt_${Date.now()}_${seq}`,
            eventType: event.type,
            matchId,
            deliverySequence: seq,
            version: seq,
            timestamp: event.timestamp || new Date().toISOString(),
            liveState: freshLive,
          };
          res.write(`event: match_update\ndata: ${JSON.stringify(publicPayload)}\n\n`);
        } catch (err) {
          console.error('Error dispatching match SSE update:', err);
        }
      };

      matchEventBus.onMatch(matchId, handleMatchEvent);

      // 5. Clean up listeners on client disconnect
      req.on('close', () => {
        clearInterval(pingInterval);
        matchEventBus.offMatch(matchId, handleMatchEvent);
        res.end();
      });
    } catch (err) {
      next(err);
    }
  };

  // ====================================================================
  // MILESTONE 6: ADMIN OPERATIONS & MATCH LIFECYCLE
  // ====================================================================

  listLiveMatches = async (req, res, next) => {
    try {
      const liveMatches = await this.matchService.listLiveMatches();
      ApiResponse.success(liveMatches, 'Live matches retrieved').send(res);
    } catch (err) {
      next(err);
    }
  };

  allocateVenue = async (req, res, next) => {
    try {
      const matchId = req.params.matchId || req.params.id;
      const venueId = req.body.venue_id || req.body.venueId;
      const updatedMatch = await this.matchService.allocateMatchVenue(matchId, venueId);
      ApiResponse.success(updatedMatch, 'Venue allocated successfully').send(res);
    } catch (err) {
      next(err);
    }
  };

  assignScorer = async (req, res, next) => {
    try {
      const matchId = req.params.matchId || req.params.id;
      const targetUserId = req.body.user_id || req.body.userId;
      const scorer = await this.matchService.assignMatchScorer(matchId, targetUserId);
      ApiResponse.created(scorer, 'Scorer assigned successfully').send(res);
    } catch (err) {
      next(err);
    }
  };

  listScorers = async (req, res, next) => {
    try {
      const matchId = req.params.matchId || req.params.id;
      const scorers = await this.matchService.listMatchScorers(matchId);
      ApiResponse.success(scorers, 'Match scorers retrieved').send(res);
    } catch (err) {
      next(err);
    }
  };

  removeScorer = async (req, res, next) => {
    try {
      const matchId = req.params.matchId || req.params.id;
      const targetUserId = req.params.userId;
      const result = await this.matchService.removeMatchScorer(matchId, targetUserId);
      ApiResponse.success(result, 'Scorer removed successfully').send(res);
    } catch (err) {
      next(err);
    }
  };

  resolveMatch = async (req, res, next) => {
    try {
      const matchId = req.params.matchId || req.params.id;
      const resolvedMatch = await this.matchService.resolveMatch(matchId, req.body, req.user.id);
      ApiResponse.success(resolvedMatch, 'Match resolved successfully').send(res);
    } catch (err) {
      next(err);
    }
  };

  getAuditTrail = async (req, res, next) => {
    try {
      const matchId = req.params.matchId || req.params.id;
      const auditTrail = await this.matchService.getMatchAuditTrail(matchId);
      ApiResponse.success(auditTrail, 'Match lifecycle audit trail retrieved').send(res);
    } catch (err) {
      next(err);
    }
  };
}
