// ====================================================================
// PROFILE CONTROLLER: PLAYER & TEAM PROFILE ENDPOINTS
// ====================================================================

import { ApiResponse } from '../utils/ApiResponse.js';

export class ProfileController {
  constructor(profileService) {
    this.profileService = profileService;
  }

  getPlayer = async (req, res, next) => {
    try {
      const data = await this.profileService.getPlayerProfile(req.params.id);
      ApiResponse.success(data).send(res);
    } catch (err) {
      next(err);
    }
  };

  getPlayerStats = async (req, res, next) => {
    try {
      const data = await this.profileService.getPlayerStats(req.params.id, {
        tournamentId: req.query.tournamentId,
      });
      ApiResponse.success(data).send(res);
    } catch (err) {
      next(err);
    }
  };

  getPlayerMatches = async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 20;
      const offset = parseInt(req.query.offset, 10) || 0;
      const data = await this.profileService.getPlayerMatchLog(req.params.id, { limit, offset });
      ApiResponse.success(data).send(res);
    } catch (err) {
      next(err);
    }
  };

  getTeam = async (req, res, next) => {
    try {
      const data = await this.profileService.getTeamProfile(req.params.id);
      ApiResponse.success(data).send(res);
    } catch (err) {
      next(err);
    }
  };

  getTeamStats = async (req, res, next) => {
    try {
      const data = await this.profileService.getTeamStats(req.params.id, {
        tournamentId: req.query.tournamentId,
      });
      ApiResponse.success(data).send(res);
    } catch (err) {
      next(err);
    }
  };

  getTeamRoster = async (req, res, next) => {
    try {
      const tournamentId = req.query.tournamentId;
      const data = await this.profileService.getTeamRoster(req.params.id, tournamentId);
      ApiResponse.success(data).send(res);
    } catch (err) {
      next(err);
    }
  };

  getTeamMatches = async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 20;
      const offset = parseInt(req.query.offset, 10) || 0;
      const tournamentId = req.query.tournamentId || null;
      const data = await this.profileService.getTeamMatches(req.params.id, {
        tournamentId,
        limit,
        offset,
      });
      ApiResponse.success(data).send(res);
    } catch (err) {
      next(err);
    }
  };
}
