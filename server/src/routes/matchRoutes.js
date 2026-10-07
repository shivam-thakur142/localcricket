// ====================================================================
// MATCH ROUTES (SPECTATOR READ-ONLY & ORGANIZER LIFECYCLE)
// ====================================================================

import { Router } from 'express';

export function createMatchRoutes(matchController, authMiddleware = null, matchOrganizerMiddleware = null, h2hController = null, operationsController = null, freezeGuard = null) {
  const router = Router();

  // ----------------------------------------------------
  // PUBLIC SPECTATOR ENDPOINTS
  // ----------------------------------------------------
  // Global live matches ticker (MUST precede /:matchId)
  router.get('/live', matchController.listLiveMatches);

  router.get('/:matchId', matchController.getMatch);
  router.get('/:matchId/squads', matchController.getMatchSquads);
  router.get('/:matchId/live', matchController.getMatchLive);
  router.get('/:matchId/scorecard', matchController.getMatchScorecard);
  router.get('/:matchId/commentary', matchController.getMatchCommentary);
  router.get('/:matchId/analytics', matchController.getMatchAnalytics);
  router.get('/:matchId/stream', matchController.streamMatch);
  router.get('/:matchId/audit', matchController.getAuditTrail);

  if (h2hController) {
    router.get('/:matchId/preview', h2hController.getMatchPreview);
    router.get('/:matchId/export', h2hController.getMatchExport);
  }

  if (operationsController) {
    router.get('/:matchId/officials', operationsController.getMatchOfficials);
  }

  // ----------------------------------------------------
  // ORGANIZER LIFECYCLE & ADMIN MUTATIONS (GUARDED BY FREEZE CHECK)
  // ----------------------------------------------------
  if (authMiddleware && matchOrganizerMiddleware) {
    const guards = [authMiddleware];
    if (freezeGuard) guards.push(freezeGuard);
    guards.push(matchOrganizerMiddleware);

    router.put('/:matchId/venue', ...guards, matchController.allocateVenue);
    router.post('/:matchId/scorers', ...guards, matchController.assignScorer);
    router.get('/:matchId/scorers', authMiddleware, matchOrganizerMiddleware, matchController.listScorers);
    router.delete('/:matchId/scorers/:userId', ...guards, matchController.removeScorer);
    router.post('/:matchId/resolve', ...guards, matchController.resolveMatch);

    if (operationsController) {
      router.put('/:matchId/reschedule', ...guards, operationsController.rescheduleMatch);
      router.post('/:matchId/officials', ...guards, operationsController.assignOfficial);
      router.delete('/:matchId/officials/:officialId', ...guards, operationsController.removeOfficial);
    }
  }

  return router;
}
