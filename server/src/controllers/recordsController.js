// ====================================================================
// RECORDS CONTROLLER: TOURNAMENT HISTORICAL RECORDS
// ====================================================================

import { ApiResponse } from '../utils/ApiResponse.js';

export class RecordsController {
  constructor(recordsService) {
    this.recordsService = recordsService;
  }

  getTournamentRecords = async (req, res, next) => {
    try {
      const records = await this.recordsService.getTournamentRecords(req.params.id);
      ApiResponse.success(records, 'Tournament records retrieved').send(res);
    } catch (err) {
      next(err);
    }
  };
}
