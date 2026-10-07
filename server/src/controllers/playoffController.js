// ====================================================================
// PLAYOFF CONTROLLER: BRACKET QUERIES & ORGANIZER GENERATION
// ====================================================================

export class PlayoffController {
  constructor(playoffService) {
    this.playoffService = playoffService;
  }

  getPlayoffs = async (req, res, next) => {
    try {
      const tournamentId = req.params.tournamentId || req.params.id;
      const data = await this.playoffService.getPlayoffs(tournamentId);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  generatePlayoffBracket = async (req, res, next) => {
    try {
      const tournamentId = req.params.tournamentId || req.params.id;
      const data = await this.playoffService.generatePlayoffBracket(tournamentId, req.body);
      res.status(201).json({
        success: true,
        message: 'Playoff bracket generated successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  updatePlayoffConfig = async (req, res, next) => {
    try {
      const tournamentId = req.params.tournamentId || req.params.id;
      const data = await this.playoffService.updatePlayoffConfig(tournamentId, req.body);
      res.status(200).json({
        success: true,
        message: 'Playoff configuration updated',
        data,
      });
    } catch (err) {
      next(err);
    }
  };
}
