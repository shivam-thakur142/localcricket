// ====================================================================
// H2H CONTROLLER: HEAD-TO-HEAD, MATCH PREVIEW & EXPORT
// ====================================================================

import { ApiResponse } from '../utils/ApiResponse.js';

export class H2HController {
  constructor(h2hService) {
    this.h2hService = h2hService;
  }

  getHeadToHead = async (req, res, next) => {
    try {
      const teamAId = req.params.id;
      const opponentTeamId = req.query.opponentTeamId;
      const tournamentId = req.query.tournamentId || null;

      const h2h = await this.h2hService.getHeadToHead(teamAId, opponentTeamId, { tournamentId });
      ApiResponse.success(h2h, 'Head-to-head records retrieved').send(res);
    } catch (err) {
      next(err);
    }
  };

  getMatchPreview = async (req, res, next) => {
    try {
      const matchId = req.params.matchId || req.params.id;
      const preview = await this.h2hService.getMatchPreview(matchId);
      ApiResponse.success(preview, 'Match preview retrieved').send(res);
    } catch (err) {
      next(err);
    }
  };

  getMatchExport = async (req, res, next) => {
    try {
      const matchId = req.params.matchId || req.params.id;
      const exportData = await this.h2hService.getPrintableScoresheet(matchId);
      ApiResponse.success(exportData, 'Printable scoresheet export retrieved').send(res);
    } catch (err) {
      next(err);
    }
  };
}
