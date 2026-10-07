// ====================================================================
// SCORER ROUTES (PROTECTED BY JWT & SCORER RBAC)
// ====================================================================

import { Router } from 'express';

export function createScorerRoutes(scorerController, authMiddleware, rbacMiddleware, freezeGuard = null) {
  const router = Router();

  const middlewares = [authMiddleware];
  if (freezeGuard) middlewares.push(freezeGuard);
  middlewares.push(rbacMiddleware);

  // All scorer routes require authentication and match-level scorer authorization
  router.use('/:matchId', ...middlewares);

  router.post('/:matchId/toss', scorerController.recordToss);
  router.post('/:matchId/squads', scorerController.submitSquad);
  router.post('/:matchId/innings/start', scorerController.startInnings);
  router.post('/:matchId/overs/start', scorerController.startOver);
  router.post('/:matchId/deliveries', scorerController.recordDelivery);
  router.post('/:matchId/deliveries/undo', scorerController.undoDelivery);

  return router;
}
