// ====================================================================
// VENUE SERVICE: CREATION, RETRIEVAL & TOURNAMENT ALLOCATION
// ====================================================================

import { ApiError } from '../utils/ApiError.js';

export class VenueService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Create a new venue scoped to a tournament
   */
  async createVenue(tournamentId, data) {
    const { name, ground_name = null, city, address = null } = data;

    if (!name || !city) {
      throw ApiError.badRequest('Venue name and city are required');
    }

    // Verify tournament exists
    const tRes = await this.db.query('SELECT id FROM tournaments WHERE id = $1', [tournamentId]);
    if (tRes.rows.length === 0) {
      throw ApiError.notFound(`Tournament ${tournamentId} not found`);
    }

    const res = await this.db.query(
      `INSERT INTO venues (tournament_id, name, ground_name, city, address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *;`,
      [tournamentId, name, ground_name, city, address]
    );

    return res.rows[0];
  }

  /**
   * List all venues registered for a tournament
   */
  async listVenues(tournamentId) {
    const res = await this.db.query(
      `SELECT * FROM venues
       WHERE tournament_id = $1
       ORDER BY name ASC;`,
      [tournamentId]
    );
    return res.rows;
  }

  /**
   * Get single venue by ID
   */
  async getVenue(venueId) {
    const res = await this.db.query('SELECT * FROM venues WHERE id = $1', [venueId]);
    if (res.rows.length === 0) {
      throw ApiError.notFound(`Venue with ID ${venueId} not found`);
    }
    return res.rows[0];
  }
}
