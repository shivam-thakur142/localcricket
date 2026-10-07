// ====================================================================
// OPERATIONS CONTROLLER: SCHEDULING, OFFICIALS, SQUADS & ARCHIVE EXPORT
// ====================================================================

import { ApiResponse } from '../utils/ApiResponse.js';

export class OperationsController {
  constructor(schedulerService, officialService, squadService, archiveService) {
    this.schedulerService = schedulerService;
    this.officialService = officialService;
    this.squadService = squadService;
    this.archiveService = archiveService;
  }

  // --- SCHEDULING ---

  scheduleMatch = async (req, res, next) => {
    try {
      const tournamentId = req.params.id || req.params.tournamentId;
      const match = await this.schedulerService.scheduleMatch(tournamentId, req.body, req.user?.id);
      return res.status(201).json(ApiResponse.created(match, 'Match scheduled successfully'));
    } catch (err) {
      next(err);
    }
  };

  rescheduleMatch = async (req, res, next) => {
    try {
      const matchId = req.params.id || req.params.matchId;
      const match = await this.schedulerService.rescheduleMatch(matchId, req.body, req.user?.id);
      return res.status(200).json(ApiResponse.success(match, 'Match rescheduled successfully'));
    } catch (err) {
      next(err);
    }
  };

  // --- OFFICIALS ---

  getMatchOfficials = async (req, res, next) => {
    try {
      const matchId = req.params.id || req.params.matchId;
      const officials = await this.officialService.getMatchOfficials(matchId);
      return res.status(200).json(ApiResponse.success(officials));
    } catch (err) {
      next(err);
    }
  };

  assignOfficial = async (req, res, next) => {
    try {
      const matchId = req.params.id || req.params.matchId;
      const assignment = await this.officialService.assignOfficial(matchId, req.body, req.user?.id);
      return res.status(201).json(ApiResponse.created(assignment, 'Official assigned successfully'));
    } catch (err) {
      next(err);
    }
  };

  removeOfficial = async (req, res, next) => {
    try {
      const matchId = req.params.id || req.params.matchId;
      const officialId = req.params.officialId;
      const reason = req.body?.reason || req.query?.reason;
      const result = await this.officialService.removeOfficial(matchId, officialId, reason, req.user?.id);
      return res.status(200).json(ApiResponse.success(result, 'Official removed successfully'));
    } catch (err) {
      next(err);
    }
  };

  // --- SQUAD VERIFICATION & OVERRIDES ---

  getTournamentSquadStatuses = async (req, res, next) => {
    try {
      const tournamentId = req.params.id || req.params.tournamentId;
      const statuses = await this.squadService.getTournamentSquadStatuses(tournamentId);
      return res.status(200).json(ApiResponse.success(statuses));
    } catch (err) {
      next(err);
    }
  };

  verifySquad = async (req, res, next) => {
    try {
      const tournamentId = req.params.id || req.params.tournamentId;
      const teamId = req.params.teamId;
      const result = await this.squadService.verifySquad(tournamentId, teamId, req.user?.id);
      return res.status(200).json(ApiResponse.success(result, 'Squad verified successfully'));
    } catch (err) {
      next(err);
    }
  };

  overrideLockedRoster = async (req, res, next) => {
    try {
      const tournamentId = req.params.id || req.params.tournamentId;
      const teamId = req.params.teamId;
      const result = await this.squadService.overrideLockedRoster(tournamentId, teamId, req.body, req.user?.id);
      return res.status(200).json(ApiResponse.success(result, 'Roster override applied successfully'));
    } catch (err) {
      next(err);
    }
  };

  // --- ARCHIVE & EXPORTS ---

  getCompleteTournamentArchive = async (req, res, next) => {
    try {
      const tournamentId = req.params.id || req.params.tournamentId;
      const archive = await this.archiveService.getCompleteTournamentArchive(tournamentId, req.user?.id);
      return res.status(200).json(ApiResponse.success(archive, 'Tournament archive exported successfully'));
    } catch (err) {
      next(err);
    }
  };

  getStandingsCsv = async (req, res, next) => {
    try {
      const tournamentId = req.params.id || req.params.tournamentId;
      const csv = await this.archiveService.getStandingsCsv(tournamentId, req.user?.id);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="standings_${tournamentId}.csv"`);
      return res.status(200).send(csv);
    } catch (err) {
      next(err);
    }
  };

  getFixturesCsv = async (req, res, next) => {
    try {
      const tournamentId = req.params.id || req.params.tournamentId;
      const csv = await this.archiveService.getFixturesCsv(tournamentId, req.user?.id);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="fixtures_${tournamentId}.csv"`);
      return res.status(200).send(csv);
    } catch (err) {
      next(err);
    }
  };
}
