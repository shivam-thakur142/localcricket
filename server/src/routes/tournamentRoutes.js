// ====================================================================
// TOURNAMENT ROUTES: TOURNAMENT, ROSTER, FIXTURES & STANDINGS
// ====================================================================

import { Router } from 'express';
import { TournamentService } from '../services/tournamentService.js';
import { RosterService } from '../services/rosterService.js';
import { PointsTableService } from '../services/pointsTableService.js';
import { LeaderboardService } from '../services/leaderboardService.js';
import { VenueService } from '../services/venueService.js';
import { TournamentController } from '../controllers/tournamentController.js';
import { PlayoffService } from '../services/playoffService.js';
import { PlayoffController } from '../controllers/playoffController.js';
import { AwardsService } from '../services/awardsService.js';
import { AwardsController } from '../controllers/awardsController.js';
import { RecordsService } from '../services/recordsService.js';
import { RecordsController } from '../controllers/recordsController.js';
import { SchedulerService } from '../services/schedulerService.js';
import { OfficialService } from '../services/officialService.js';
import { SquadService } from '../services/squadService.js';
import { ArchiveService } from '../services/archiveService.js';
import { OperationsController } from '../controllers/operationsController.js';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';
import { createTournamentOrganizerMiddleware, createTournamentFreezeGuard } from '../middleware/rbacMiddleware.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import {
  createInvitation,
  listTournamentInvitations,
  revokeInvitation,
} from '../services/invitationService.js';

export function createTournamentRoutes(db) {
  const router = Router();

  const tournamentService = new TournamentService(db);
  const rosterService = new RosterService(db);
  const pointsTableService = new PointsTableService(db);
  const leaderboardService = new LeaderboardService(db);
  const venueService = new VenueService(db);
  const playoffService = new PlayoffService(db);
  const awardsService = new AwardsService(db);
  const recordsService = new RecordsService(db);
  const schedulerService = new SchedulerService(db);
  const officialService = new OfficialService(db);
  const squadService = new SquadService(db);
  const archiveService = new ArchiveService(db);

  const controller = new TournamentController(
    tournamentService,
    rosterService,
    pointsTableService,
    leaderboardService,
    venueService
  );
  const playoffController = new PlayoffController(playoffService);
  const awardsController = new AwardsController(awardsService);
  const recordsController = new RecordsController(recordsService);
  const operationsController = new OperationsController(
    schedulerService,
    officialService,
    squadService,
    archiveService
  );

  const authenticate = createAuthMiddleware(db);
  const requireOrganizer = createTournamentOrganizerMiddleware(db);
  const freezeGuard = createTournamentFreezeGuard(db);

  // ----------------------------------------------------
  // PUBLIC READ-ONLY ENDPOINTS
  // ----------------------------------------------------
  router.get('/', controller.listTournaments);
  router.get('/:id', controller.getTournament);
  router.get('/:id/venues', controller.listVenues);
  router.get('/:id/teams', controller.listTeams);
  router.get('/:id/teams/:teamId/roster', controller.getRoster);
  router.get('/:id/matches', controller.listMatches);
  router.get('/:id/points-table', controller.getPointsTable);
  router.get('/:id/leaderboards', controller.getLeaderboards);
  router.get('/:id/awards', awardsController.getTournamentAwards);
  router.get('/:id/records', recordsController.getTournamentRecords);
  router.get('/:id/playoffs', playoffController.getPlayoffs);
  router.get('/:id/squad-status', operationsController.getTournamentSquadStatuses);

  // ----------------------------------------------------
  // AUTHENTICATED CREATION
  // ----------------------------------------------------
  router.post('/', authenticate, controller.createTournament);

  // ----------------------------------------------------
  // ORGANIZER-ONLY ADMINISTRATION (GUARDED BY FREEZE CHECK)
  // ----------------------------------------------------
  router.patch('/:id/status', authenticate, freezeGuard, requireOrganizer, controller.updateTournamentStatus);
  router.put('/:id/status', authenticate, freezeGuard, requireOrganizer, controller.updateTournamentStatus);
  router.patch('/:id', authenticate, freezeGuard, requireOrganizer, controller.updateTournament);
  router.put('/:id', authenticate, freezeGuard, requireOrganizer, controller.updateTournament);
  router.post('/:id/venues', authenticate, freezeGuard, requireOrganizer, controller.createVenue);
  router.post('/:id/members', authenticate, freezeGuard, requireOrganizer, controller.addMember);
  router.get('/:id/members', authenticate, requireOrganizer, controller.listMembers);
  router.post('/:id/teams', authenticate, freezeGuard, requireOrganizer, controller.registerTeam);
  router.post('/:id/teams/:teamId/roster', authenticate, freezeGuard, requireOrganizer, controller.addPlayerToRoster);
  router.post('/:id/matches', authenticate, freezeGuard, requireOrganizer, controller.scheduleMatch);
  router.post('/:id/points-table/recalculate', authenticate, freezeGuard, requireOrganizer, controller.recalculatePointsTable);
  router.post('/:id/playoffs/generate', authenticate, freezeGuard, requireOrganizer, playoffController.generatePlayoffBracket);
  router.put('/:id/playoffs/config', authenticate, freezeGuard, requireOrganizer, playoffController.updatePlayoffConfig);

  // M10 Tournament Operations
  router.post('/:id/schedule', authenticate, freezeGuard, requireOrganizer, operationsController.scheduleMatch);
  router.post('/:id/teams/:teamId/verify-squad', authenticate, freezeGuard, requireOrganizer, operationsController.verifySquad);
  router.post('/:id/teams/:teamId/override-roster', authenticate, freezeGuard, requireOrganizer, operationsController.overrideLockedRoster);
  router.get('/:id/export', authenticate, requireOrganizer, operationsController.getCompleteTournamentArchive);
  router.get('/:id/export/standings.csv', authenticate, requireOrganizer, operationsController.getStandingsCsv);
  router.get('/:id/export/fixtures.csv', authenticate, requireOrganizer, operationsController.getFixturesCsv);

  // M11 Organizer Tournament Invitations
  router.post('/:id/invitations', authenticate, freezeGuard, requireOrganizer, async (req, res, next) => {
    try {
      const { role, invitedEmail, metadata } = req.body || {};
      const result = await createInvitation(db, req.params.id, req.user.id, { role, invitedEmail, metadata });
      ApiResponse.created(result, 'Invitation generated successfully').send(res);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/invitations', authenticate, requireOrganizer, async (req, res, next) => {
    try {
      const list = await listTournamentInvitations(db, req.params.id, req.user.id);
      ApiResponse.success(list).send(res);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id/invitations/:invId', authenticate, freezeGuard, requireOrganizer, async (req, res, next) => {
    try {
      const result = await revokeInvitation(db, req.params.id, req.params.invId, req.user.id);
      ApiResponse.success(result, result.message).send(res);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
