// ====================================================================
// AWARDS CONTROLLER: TOURNAMENT AWARDS ENDPOINTS
// ====================================================================

import { ApiResponse } from '../utils/ApiResponse.js';

export class AwardsController {
  constructor(awardsService) {
    this.awardsService = awardsService;
  }

  getTournamentAwards = async (req, res, next) => {
    try {
      const data = await this.awardsService.getTournamentAwards(req.params.id);
      ApiResponse.success(data).send(res);
    } catch (err) {
      next(err);
    }
  };
}
