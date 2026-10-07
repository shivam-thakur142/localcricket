// ====================================================================
// TOURNAMENT CONTROLLER: TOURNAMENT, ROSTER, FIXTURES & STANDINGS
// ====================================================================

import { ApiResponse } from '../utils/ApiResponse.js';

export class TournamentController {
  constructor(tournamentService, rosterService, pointsTableService, leaderboardService, venueService = null) {
    this.tournamentService = tournamentService;
    this.rosterService = rosterService;
    this.pointsTableService = pointsTableService;
    this.leaderboardService = leaderboardService;
    this.venueService = venueService;
  }

  createTournament = async (req, res, next) => {
    try {
      const tournament = await this.tournamentService.createTournament(req.user.id, req.body);
      return res.status(201).json(ApiResponse.created(tournament, 'Tournament created successfully'));
    } catch (err) {
      next(err);
    }
  };

  getTournament = async (req, res, next) => {
    try {
      const tournament = await this.tournamentService.getTournament(req.params.id);
      return res.status(200).json(ApiResponse.success(tournament));
    } catch (err) {
      next(err);
    }
  };

  listTournaments = async (req, res, next) => {
    try {
      const tournaments = await this.tournamentService.listTournaments(req.query);
      return res.status(200).json(ApiResponse.success(tournaments));
    } catch (err) {
      next(err);
    }
  };

  updateTournamentStatus = async (req, res, next) => {
    try {
      const { status } = req.body;
      const tournament = await this.tournamentService.updateTournamentStatus(req.params.id, status);
      return res.status(200).json(ApiResponse.success(tournament, 'Tournament status updated'));
    } catch (err) {
      next(err);
    }
  };

  updateTournament = async (req, res, next) => {
    try {
      const tournament = await this.tournamentService.updateTournament(req.params.id, req.body);
      return res.status(200).json(ApiResponse.success(tournament, 'Tournament updated successfully'));
    } catch (err) {
      next(err);
    }
  };

  createVenue = async (req, res, next) => {
    try {
      if (!this.venueService) {
        throw new Error('Venue service not configured');
      }
      const venue = await this.venueService.createVenue(req.params.id, req.body);
      return res.status(201).json(ApiResponse.created(venue, 'Venue created successfully'));
    } catch (err) {
      next(err);
    }
  };

  listVenues = async (req, res, next) => {
    try {
      if (!this.venueService) {
        throw new Error('Venue service not configured');
      }
      const venues = await this.venueService.listVenues(req.params.id);
      return res.status(200).json(ApiResponse.success(venues));
    } catch (err) {
      next(err);
    }
  };

  addMember = async (req, res, next) => {
    try {
      const member = await this.tournamentService.addTournamentMember(req.params.id, req.body);
      return res.status(201).json(ApiResponse.created(member, 'Member assigned successfully'));
    } catch (err) {
      next(err);
    }
  };

  listMembers = async (req, res, next) => {
    try {
      const members = await this.tournamentService.listTournamentMembers(req.params.id);
      return res.status(200).json(ApiResponse.success(members));
    } catch (err) {
      next(err);
    }
  };

  registerTeam = async (req, res, next) => {
    try {
      const team = await this.rosterService.registerTeam(req.params.id, req.body);
      return res.status(201).json(ApiResponse.created(team, 'Team registered into tournament'));
    } catch (err) {
      next(err);
    }
  };

  listTeams = async (req, res, next) => {
    try {
      const teams = await this.rosterService.listTournamentTeams(req.params.id);
      return res.status(200).json(ApiResponse.success(teams));
    } catch (err) {
      next(err);
    }
  };

  addPlayerToRoster = async (req, res, next) => {
    try {
      const rosterEntry = await this.rosterService.addPlayerToRoster(req.params.teamId, req.body);
      return res.status(201).json(ApiResponse.created(rosterEntry, 'Player added to team roster'));
    } catch (err) {
      next(err);
    }
  };

  getRoster = async (req, res, next) => {
    try {
      const roster = await this.rosterService.getTeamRoster(req.params.teamId);
      return res.status(200).json(ApiResponse.success(roster));
    } catch (err) {
      next(err);
    }
  };

  scheduleMatch = async (req, res, next) => {
    try {
      const match = await this.tournamentService.scheduleMatch(req.params.id, req.body);
      return res.status(201).json(ApiResponse.created(match, 'Fixture scheduled successfully'));
    } catch (err) {
      next(err);
    }
  };

  listMatches = async (req, res, next) => {
    try {
      const matches = await this.tournamentService.listTournamentMatches(req.params.id, req.query);
      return res.status(200).json(ApiResponse.success(matches));
    } catch (err) {
      next(err);
    }
  };

  getPointsTable = async (req, res, next) => {
    try {
      const standings = await this.pointsTableService.getPointsTable(req.params.id);
      return res.status(200).json(ApiResponse.success(standings));
    } catch (err) {
      next(err);
    }
  };

  recalculatePointsTable = async (req, res, next) => {
    try {
      const standings = await this.pointsTableService.recalculateTournamentPoints(req.params.id);
      return res.status(200).json(ApiResponse.success(standings, 'Points table recalculated successfully'));
    } catch (err) {
      next(err);
    }
  };

  getLeaderboards = async (req, res, next) => {
    try {
      if (!this.leaderboardService) {
        throw new Error('Leaderboard service not configured');
      }
      const { category, limit } = req.query;
      const leaderboards = await this.leaderboardService.getTournamentLeaderboards(req.params.id, {
        category,
        limit: limit ? parseInt(limit) : 10,
      });
      return res.status(200).json(ApiResponse.success(leaderboards));
    } catch (err) {
      next(err);
    }
  };

  // Global Teams and Players
  createGlobalTeam = async (req, res, next) => {
    try {
      const team = await this.rosterService.createGlobalTeam({
        ...req.body,
        created_by_user_id: req.user?.id,
      });
      return res.status(201).json(ApiResponse.created(team, 'Global team created successfully'));
    } catch (err) {
      next(err);
    }
  };

  listGlobalTeams = async (req, res, next) => {
    try {
      const teams = await this.rosterService.listGlobalTeams(req.query);
      return res.status(200).json(ApiResponse.success(teams));
    } catch (err) {
      next(err);
    }
  };

  createGlobalPlayer = async (req, res, next) => {
    try {
      const player = await this.rosterService.createGlobalPlayer(req.body);
      return res.status(201).json(ApiResponse.created(player, 'Global player created successfully'));
    } catch (err) {
      next(err);
    }
  };

  listGlobalPlayers = async (req, res, next) => {
    try {
      const players = await this.rosterService.listGlobalPlayers(req.query);
      return res.status(200).json(ApiResponse.success(players));
    } catch (err) {
      next(err);
    }
  };
}
