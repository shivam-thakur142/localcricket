// ====================================================================
// SUPER ADMIN ROUTES: PLATFORM MANAGEMENT, MONITORING & GOVERNANCE
// ====================================================================

import { Router } from 'express';
import { AdminService } from '../services/adminService.js';
import { PlayerMergeService } from '../services/playerMergeService.js';
import { RosterService } from '../services/rosterService.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { matchEventBus } from '../utils/eventBus.js';

export function createAdminRoutes(db, authMiddleware, requireSuperAdmin) {
  const router = Router();

  const adminService = new AdminService(db);
  const playerMergeService = new PlayerMergeService(db);
  const rosterService = new RosterService(db);

  // All Super Admin routes require authentication and Super Admin global role
  router.use(authMiddleware, requireSuperAdmin);

  // 1. Platform Telemetry Overview
  router.get('/overview', async (req, res, next) => {
    try {
      const overview = await adminService.getPlatformOverview();
      ApiResponse.success(overview).send(res);
    } catch (err) {
      next(err);
    }
  });

  // 2. Cross-Tournament Live Matches Snapshot
  router.get('/matches/live', async (req, res, next) => {
    try {
      const live = await adminService.getLiveMatches(req.query);
      ApiResponse.success(live).send(res);
    } catch (err) {
      next(err);
    }
  });

  // 3. Cross-Tournament Live Matches SSE Stream
  router.get('/matches/live-stream', async (req, res, next) => {
    try {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      // Initial Authoritative Snapshot
      const liveSnapshot = await adminService.getLiveMatches({ limit: 100 });
      res.write(`event: init\ndata: ${JSON.stringify(liveSnapshot.matches)}\n\n`);

      // Heartbeat Keep-Alive
      const pingInterval = setInterval(() => {
        try {
          res.write(`event: ping\ndata: {}\n\n`);
        } catch {
          clearInterval(pingInterval);
        }
      }, 25000);

      // Dispatch real-time match events to stream
      const handleGlobalMatchEvent = async (event) => {
        try {
          const freshLive = await adminService.getLiveMatches({ limit: 100 });
          const payload = {
            eventId: `admin_evt_${Date.now()}`,
            eventType: event.type,
            matchId: event.matchId,
            timestamp: event.timestamp || new Date().toISOString(),
            liveMatches: freshLive.matches,
          };
          res.write(`event: match_update\ndata: ${JSON.stringify(payload)}\n\n`);
        } catch (err) {
          console.error('Error dispatching admin SSE live stream update:', err);
        }
      };

      matchEventBus.onGlobal(handleGlobalMatchEvent);

      req.on('close', () => {
        clearInterval(pingInterval);
        matchEventBus.offGlobal(handleGlobalMatchEvent);
        res.end();
      });
    } catch (err) {
      next(err);
    }
  });

  // 4. Tournaments Management
  router.get('/tournaments', async (req, res, next) => {
    try {
      const result = await adminService.listTournaments(req.query);
      ApiResponse.success(result).send(res);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/tournaments/:id/freeze', async (req, res, next) => {
    try {
      const { isFrozen, reason } = req.body || {};
      const result = await adminService.freezeTournament(
        req.params.id,
        { isFrozen, reason },
        req.user.id,
        req.ip
      );
      ApiResponse.success(result, result.message).send(res);
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments/:id/transfer-ownership', async (req, res, next) => {
    try {
      const { newOwnerUserId, reason } = req.body || {};
      const result = await adminService.transferTournamentOwnership(
        req.params.id,
        { newOwnerUserId, reason },
        req.user.id,
        req.ip
      );
      ApiResponse.success(result, result.message).send(res);
    } catch (err) {
      next(err);
    }
  });

  // 5. User Moderation & Access Control
  router.get('/users', async (req, res, next) => {
    try {
      const result = await adminService.listUsers(req.query);
      ApiResponse.success(result).send(res);
    } catch (err) {
      next(err);
    }
  });

  router.post('/users/:id/unlock', async (req, res, next) => {
    try {
      const { reason } = req.body || {};
      const result = await adminService.unlockUserAccount(
        req.params.id,
        { reason },
        req.user.id,
        req.ip
      );
      ApiResponse.success(result, result.message).send(res);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/users/:id/status', async (req, res, next) => {
    try {
      const { isSuspended, reason } = req.body || {};
      const result = await adminService.updateUserStatus(
        req.params.id,
        { isSuspended, reason },
        req.user.id,
        req.ip
      );
      ApiResponse.success(result, result.message).send(res);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/users/:id/role', async (req, res, next) => {
    try {
      const { globalRole, reason } = req.body || {};
      const result = await adminService.updateUserRole(
        req.params.id,
        { globalRole, reason },
        req.user.id,
        req.ip
      );
      ApiResponse.success(result, result.message).send(res);
    } catch (err) {
      next(err);
    }
  });

  // 6. Player Registry & Atomic Merge Engine
  router.get('/players', async (req, res, next) => {
    try {
      const players = await rosterService.listGlobalPlayers(req.query);
      ApiResponse.success(players).send(res);
    } catch (err) {
      next(err);
    }
  });

  router.post('/players/merge', async (req, res, next) => {
    try {
      const { sourcePlayerId, targetPlayerId, reason } = req.body || {};
      const result = await playerMergeService.mergePlayers({
        sourcePlayerId,
        targetPlayerId,
        reason,
        adminUserId: req.user.id,
        ipAddress: req.ip,
      });
      ApiResponse.success(result, result.message).send(res);
    } catch (err) {
      next(err);
    }
  });

  // 7. Global Teams Management
  router.get('/teams', async (req, res, next) => {
    try {
      const result = await adminService.listTeams(req.query);
      ApiResponse.success(result).send(res);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/teams/:id/verify', async (req, res, next) => {
    try {
      const { isVerified, reason } = req.body || {};
      const result = await adminService.toggleTeamVerification(
        req.params.id,
        { isVerified, reason },
        req.user.id,
        req.ip
      );
      ApiResponse.success(result, result.message).send(res);
    } catch (err) {
      next(err);
    }
  });

  // 8. Venue Blackout Periods
  router.post('/venues/blackouts', async (req, res, next) => {
    try {
      const { venueId, startTime, endTime, reason } = req.body || {};
      const result = await adminService.createVenueBlackout(
        { venueId, startTime, endTime, reason },
        req.user.id,
        req.ip
      );
      ApiResponse.created(result.blackout, result.message).send(res);
    } catch (err) {
      next(err);
    }
  });

  router.get('/venues/blackouts', async (req, res, next) => {
    try {
      const result = await adminService.listVenueBlackouts(req.query);
      ApiResponse.success(result).send(res);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/venues/blackouts/:id', async (req, res, next) => {
    try {
      const { reason } = req.body || {};
      const result = await adminService.deleteVenueBlackout(
        req.params.id,
        { reason },
        req.user.id,
        req.ip
      );
      ApiResponse.success(result, result.message).send(res);
    } catch (err) {
      next(err);
    }
  });

  // 9. Platform Audit Trail (Strictly Read-Only)
  router.get('/audit-logs', async (req, res, next) => {
    try {
      const result = await adminService.listAuditLogs(req.query);
      ApiResponse.success(result).send(res);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
