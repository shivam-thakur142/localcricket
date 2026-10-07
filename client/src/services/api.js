// ====================================================================
// AUTHORITATIVE API CLIENT WITH BOUNDED RETRIES & IDEMPOTENCY
// ====================================================================

const API_BASE = '/api/v1';

function generateIdempotencyKey(prefix = 'req') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

let currentAccessToken = null;

export function setAccessToken(token) {
  currentAccessToken = token || null;
}

export function getAccessToken() {
  return currentAccessToken;
}

/**
 * Fetch wrapper with bounded retry strictly for transient network / 5xx errors.
 * NEVER retries 4xx client errors (400, 401, 403, 409, 422), except for silent 401 token refresh.
 */
export async function boundedFetch(url, options = {}, maxRetries = 3) {
  let attempt = 0;
  let delay = 300;

  // Clone headers and inject Authorization Bearer if available
  const headers = { ...(options.headers || {}) };
  if (currentAccessToken && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${currentAccessToken}`;
  }

  const fetchOptions = {
    ...options,
    headers,
    credentials: options.credentials || 'include',
  };

  while (attempt <= maxRetries) {
    try {
      const response = await fetch(url, fetchOptions);

      // Handle 401 Token Expiry silent refresh
      if (response.status === 401) {
        let errorData = null;
        try {
          errorData = await response.json();
        } catch {
          errorData = { message: await response.text() };
        }

        if (
          errorData?.error?.code === 'TOKEN_EXPIRED' &&
          !options._isRetry &&
          !options._skipRefresh &&
          !url.includes('/auth/refresh') &&
          !url.includes('/auth/login')
        ) {
          try {
            const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({}),
            });
            if (refreshRes.ok) {
              const refreshJson = await refreshRes.json();
              const newToken = refreshJson.data?.accessToken;
              if (newToken) {
                setAccessToken(newToken);
                const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
                return await boundedFetch(url, { ...options, _isRetry: true, headers: retryHeaders }, maxRetries);
              }
            } else {
              setAccessToken(null);
            }
          } catch {
            setAccessToken(null);
          }
        }

        const error = new Error(errorData.error?.message || errorData.message || 'Unauthorized');
        error.status = 401;
        error.code = errorData.error?.code || 'UNAUTHORIZED';
        error.details = errorData.error?.details || [];
        error.response = errorData;
        throw error;
      }

      // Halt immediately on other client errors (4xx) - NO RETRY
      if (response.status >= 400 && response.status < 500) {
        let errorData = null;
        try {
          errorData = await response.json();
        } catch {
          errorData = { message: await response.text() };
        }

        const error = new Error(errorData.error?.message || errorData.message || `Request failed with status ${response.status}`);
        error.status = response.status;
        error.code = errorData.error?.code || 'CLIENT_ERROR';
        error.details = errorData.error?.details || [];
        error.response = errorData;
        throw error;
      }

      // If 5xx server error and retry attempts remaining, back off and retry
      if (response.status >= 500) {
        if (attempt < maxRetries) {
          attempt++;
          await new Promise((r) => setTimeout(r, delay));
          delay *= 2;
          continue;
        }

        let errorData = null;
        try {
          errorData = await response.json();
        } catch {
          errorData = { message: await response.text() };
        }
        const error = new Error(errorData.error?.message || `Server error (${response.status})`);
        error.status = response.status;
        error.code = errorData.error?.code || 'SERVER_ERROR';
        throw error;
      }

      // Successful 2xx response
      return await response.json();
    } catch (err) {
      // If error is already a processed 4xx error or 5xx terminal error, rethrow
      if (err.status) {
        throw err;
      }

      // Network disconnection / fetch throw
      if (attempt < maxRetries) {
        attempt++;
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }

      const networkError = new Error('Network error: Unable to reach LocalCricket server');
      networkError.status = 0;
      networkError.code = 'NETWORK_ERROR';
      throw networkError;
    }
  }
}

export const api = {
  // ----------------------------------------------------
  // PUBLIC SPECTATOR ENDPOINTS (Read-Only)
  // ----------------------------------------------------
  getMatch: (matchId) => boundedFetch(`${API_BASE}/matches/${matchId}`),

  getMatchLive: (matchId) => boundedFetch(`${API_BASE}/matches/${matchId}/live`),

  getMatchScorecard: (matchId) => boundedFetch(`${API_BASE}/matches/${matchId}/scorecard`),

  getMatchCommentary: (matchId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return boundedFetch(`${API_BASE}/matches/${matchId}/commentary${query ? `?${query}` : ''}`);
  },

  getMatchAnalytics: (matchId) => boundedFetch(`${API_BASE}/matches/${matchId}/analytics`),

  getMatchStreamUrl: (matchId) => `${API_BASE}/matches/${matchId}/stream`,

  getMatchSquads: (matchId) => boundedFetch(`${API_BASE}/matches/${matchId}/squads`),

  // ----------------------------------------------------
  // SCORER / MATCH SETUP MUTATIONS (Authoritative)
  // ----------------------------------------------------
  setToss: (matchId, { tossWinnerTeamId, tossDecision }, userId) => {
    return boundedFetch(`${API_BASE}/scorer/matches/${matchId}/toss`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({ tossWinnerTeamId, tossDecision }),
    });
  },

  submitPlayingXI: (matchId, { tournamentTeamId, playerIds, captainId, wicketKeeperId }, userId) => {
    return boundedFetch(`${API_BASE}/scorer/matches/${matchId}/squads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({ tournamentTeamId, playerIds, captainId, wicketKeeperId }),
    });
  },

  startInnings: (matchId, { battingTeamId, bowlingTeamId, strikerId, nonStrikerId, bowlerId, inningsNumber }, userId) => {
    return boundedFetch(`${API_BASE}/scorer/matches/${matchId}/innings/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({ battingTeamId, bowlingTeamId, strikerId, nonStrikerId, bowlerId, inningsNumber }),
    });
  },

  startOver: (matchId, { bowlerId }, userId) => {
    return boundedFetch(`${API_BASE}/scorer/matches/${matchId}/overs/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({ bowlerId }),
    });
  },

  // ----------------------------------------------------
  // LIVE SCORING ENGINE MUTATIONS (Idempotent & Sequence Guarded)
  // ----------------------------------------------------
  recordDelivery: (matchId, deliveryPayload, userId, idempotencyKey = null) => {
    const key = idempotencyKey || generateIdempotencyKey('del');
    return boundedFetch(`${API_BASE}/scorer/matches/${matchId}/deliveries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'idempotency-key': key,
      },
      body: JSON.stringify(deliveryPayload),
    });
  },

  undoDelivery: (matchId, { expectedDeliverySequence, targetDeliveryId, reversionReason = 'Scorer initiated undo', isOffline = false }, userId, idempotencyKey = null) => {
    const key = idempotencyKey || generateIdempotencyKey('undo');
    const headers = {
      'Content-Type': 'application/json',
      'x-user-id': userId,
      'idempotency-key': key,
    };
    if (isOffline) {
      headers['x-offline-replay'] = 'true';
    }
    return boundedFetch(`${API_BASE}/scorer/matches/${matchId}/deliveries/undo`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        expected_delivery_sequence: expectedDeliverySequence,
        target_delivery_id: targetDeliveryId,
        reversion_reason: reversionReason,
        is_offline: isOffline,
      }),
    });
  },

  // ----------------------------------------------------
  // TOURNAMENT, FIXTURES & STANDINGS ENDPOINTS
  // ----------------------------------------------------
  listTournaments: (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return boundedFetch(`${API_BASE}/tournaments${params ? `?${params}` : ''}`);
  },

  getTournament: (tournamentId) => boundedFetch(`${API_BASE}/tournaments/${tournamentId}`),

  getTournamentTeams: (tournamentId) => boundedFetch(`${API_BASE}/tournaments/${tournamentId}/teams`),

  getTeamRoster: (tournamentId, teamId) => boundedFetch(`${API_BASE}/tournaments/${tournamentId}/teams/${teamId}/roster`),

  getTournamentMatches: (tournamentId, filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/matches${params ? `?${params}` : ''}`);
  },

  getTournamentPointsTable: (tournamentId) => boundedFetch(`${API_BASE}/tournaments/${tournamentId}/points-table`),

  getTournamentLeaderboards: (tournamentId, category = 'all') =>
    boundedFetch(`${API_BASE}/tournaments/${tournamentId}/leaderboards?category=${category}`),

  createTournament: (data, userId) => {
    return boundedFetch(`${API_BASE}/tournaments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(data),
    });
  },

  createFixture: (tournamentId, fixtureData, userId) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/matches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(fixtureData),
    });
  },

  registerTeamToTournament: (tournamentId, { teamId, groupName }, userId) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({ teamId, groupName }),
    });
  },

  addPlayerToRoster: (tournamentId, teamId, playerData, userId) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/teams/${teamId}/roster`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(playerData),
    });
  },

  recalculatePointsTable: (tournamentId, userId) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/points-table/recalculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
    });
  },

  // ----------------------------------------------------
  // MILESTONE 6: ADMIN STUDIO, VENUES, SCORERS & LIFECYCLE
  // ----------------------------------------------------
  getLiveMatches: () => boundedFetch(`${API_BASE}/matches/live`),

  updateTournamentStatus: (tournamentId, status, userId) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({ status }),
    });
  },

  updateTournament: (tournamentId, data, userId) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(data),
    });
  },

  getTournamentVenues: (tournamentId) => boundedFetch(`${API_BASE}/tournaments/${tournamentId}/venues`),

  createTournamentVenue: (tournamentId, venueData, userId) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/venues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(venueData),
    });
  },

  getTournamentMembers: (tournamentId, userId) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/members`, {
      headers: {
        'x-user-id': userId,
      },
    });
  },

  addTournamentMember: (tournamentId, memberData, userId) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(memberData),
    });
  },

  allocateMatchVenue: (matchId, venueId, userId) => {
    return boundedFetch(`${API_BASE}/matches/${matchId}/venue`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({ venue_id: venueId }),
    });
  },

  getMatchScorers: (matchId, userId) => {
    return boundedFetch(`${API_BASE}/matches/${matchId}/scorers`, {
      headers: {
        'x-user-id': userId,
      },
    });
  },

  assignMatchScorer: (matchId, targetUserId, userId) => {
    return boundedFetch(`${API_BASE}/matches/${matchId}/scorers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({ user_id: targetUserId }),
    });
  },

  removeMatchScorer: (matchId, targetUserId, userId) => {
    return boundedFetch(`${API_BASE}/matches/${matchId}/scorers/${targetUserId}`, {
      method: 'DELETE',
      headers: {
        'x-user-id': userId,
      },
    });
  },

  resolveMatch: (matchId, resolveData, userId) => {
    return boundedFetch(`${API_BASE}/matches/${matchId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(resolveData),
    });
  },

  getMatchAuditTrail: (matchId) => boundedFetch(`${API_BASE}/matches/${matchId}/audit`),

  getGlobalTeams: (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return boundedFetch(`${API_BASE}/teams${params ? `?${params}` : ''}`);
  },

  createGlobalTeam: (teamData, userId) => {
    return boundedFetch(`${API_BASE}/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(teamData),
    });
  },

  getGlobalPlayers: (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return boundedFetch(`${API_BASE}/players${params ? `?${params}` : ''}`);
  },

  createGlobalPlayer: (playerData, userId) => {
    return boundedFetch(`${API_BASE}/players`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(playerData),
    });
  },

  // ----------------------------------------------------
  // MILESTONE 7: PLAYOFFS, BRACKETS & CHAMPIONSHIP FINALS
  // ----------------------------------------------------
  getTournamentPlayoffs: (tournamentId) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/playoffs`);
  },

  generateTournamentPlayoffs: (tournamentId, data, userId) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/playoffs/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(data),
    });
  },

  updateTournamentPlayoffsConfig: (tournamentId, data, userId) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/playoffs/config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(data),
    });
  },

  // ----------------------------------------------------
  // MILESTONE 8: PUBLIC PROFILES & TOURNAMENT AWARDS
  // ----------------------------------------------------
  getPlayerProfile: (playerId) => {
    return boundedFetch(`${API_BASE}/players/${playerId}`);
  },

  getPlayerStats: (playerId, tournamentId = null) => {
    const q = tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : '';
    return boundedFetch(`${API_BASE}/players/${playerId}/stats${q}`);
  },

  getPlayerMatches: (playerId, tournamentId = null) => {
    const q = tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : '';
    return boundedFetch(`${API_BASE}/players/${playerId}/matches${q}`);
  },

  getTeamProfile: (teamId) => {
    return boundedFetch(`${API_BASE}/teams/${teamId}`);
  },

  getTeamStats: (teamId, tournamentId = null) => {
    const q = tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : '';
    return boundedFetch(`${API_BASE}/teams/${teamId}/stats${q}`);
  },

  getTeamRoster: (teamId, tournamentId) => {
    const q = tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : '';
    return boundedFetch(`${API_BASE}/teams/${teamId}/roster${q}`);
  },

  getTeamMatches: (teamId, tournamentId = null) => {
    const q = tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : '';
    return boundedFetch(`${API_BASE}/teams/${teamId}/matches${q}`);
  },

  getTournamentAwards: (tournamentId) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/awards`);
  },

  // ----------------------------------------------------
  // MILESTONE 9: TOURNAMENT RECORDS, H2H & MATCH EXPORT
  // ----------------------------------------------------
  getTournamentRecords: (tournamentId) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/records`);
  },

  getMatchPreview: (matchId) => {
    return boundedFetch(`${API_BASE}/matches/${matchId}/preview`);
  },

  getTeamHeadToHead: (teamId, opponentTeamId, tournamentId = null) => {
    const q = tournamentId ? `&tournamentId=${encodeURIComponent(tournamentId)}` : '';
    return boundedFetch(`${API_BASE}/teams/${teamId}/head-to-head?opponentTeamId=${encodeURIComponent(opponentTeamId)}${q}`);
  },

  getMatchExport: (matchId) => {
    return boundedFetch(`${API_BASE}/matches/${matchId}/export`);
  },

  // ----------------------------------------------------
  // MILESTONE 10: TOURNAMENT OPERATIONS & OFFICIALS
  // ----------------------------------------------------
  scheduleMatchSafe: (tournamentId, data, userId) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(data),
    });
  },

  rescheduleMatch: (matchId, data, userId) => {
    return boundedFetch(`${API_BASE}/matches/${matchId}/reschedule`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(data),
    });
  },

  getMatchOfficials: (matchId) => {
    return boundedFetch(`${API_BASE}/matches/${matchId}/officials`);
  },

  assignOfficial: (matchId, data, userId) => {
    return boundedFetch(`${API_BASE}/matches/${matchId}/officials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(data),
    });
  },

  removeOfficial: (matchId, officialId, reason, userId) => {
    return boundedFetch(`${API_BASE}/matches/${matchId}/officials`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({ officialId, reason }),
    });
  },

  getTournamentSquadStatuses: (tournamentId) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/squad-status`);
  },

  verifySquad: (tournamentId, teamId, userId) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/teams/${teamId}/verify-squad`, {
      method: 'POST',
      headers: {
        'x-user-id': userId,
      },
    });
  },

  overrideRoster: (tournamentId, teamId, data, userId) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/teams/${teamId}/override-roster`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(data),
    });
  },

  exportTournamentArchive: (tournamentId, userId) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/export`, {
      headers: {
        'x-user-id': userId,
      },
    });
  },

  exportStandingsCsvUrl: (tournamentId) => `${API_BASE}/tournaments/${tournamentId}/export/standings.csv`,
  exportFixturesCsvUrl: (tournamentId) => `${API_BASE}/tournaments/${tournamentId}/export/fixtures.csv`,

  // ----------------------------------------------------
  // MILESTONE 11: PRODUCTION AUTHENTICATION & INVITATIONS
  // ----------------------------------------------------
  login: ({ email, password }) => {
    return boundedFetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  },

  register: ({ fullName, email, password, phone }) => {
    return boundedFetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, email, password, phone }),
    });
  },

  refreshToken: (token = null) => {
    return boundedFetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(token ? { refreshToken: token } : {}),
      _skipRefresh: true,
    });
  },

  logout: () => {
    return boundedFetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      _skipRefresh: true,
    });
  },

  logoutAll: (userId = null) => {
    return boundedFetch(`${API_BASE}/auth/logout-all`, {
      method: 'POST',
      headers: {
        ...(userId ? { 'x-user-id': userId } : {}),
      },
      _skipRefresh: true,
    });
  },

  getMe: (userId = null) => {
    return boundedFetch(`${API_BASE}/auth/me`, {
      headers: {
        ...(userId ? { 'x-user-id': userId } : {}),
      },
    });
  },

  getCurrentUser: (userId = null) => api.getMe(userId),

  updateProfile: (data, userId = null) => {
    return boundedFetch(`${API_BASE}/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(userId ? { 'x-user-id': userId } : {}),
      },
      body: JSON.stringify(data),
    });
  },

  changePassword: ({ currentPassword, newPassword }, userId = null) => {
    return boundedFetch(`${API_BASE}/auth/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(userId ? { 'x-user-id': userId } : {}),
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  createTournamentInvitation: (tournamentId, { role, invitedEmail, metadata }, userId = null) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/invitations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(userId ? { 'x-user-id': userId } : {}),
      },
      body: JSON.stringify({ role, invitedEmail, metadata }),
    });
  },

  listTournamentInvitations: (tournamentId, userId = null) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/invitations`, {
      headers: {
        ...(userId ? { 'x-user-id': userId } : {}),
      },
    });
  },

  revokeTournamentInvitation: (tournamentId, invitationId, userId = null) => {
    return boundedFetch(`${API_BASE}/tournaments/${tournamentId}/invitations/${invitationId}`, {
      method: 'DELETE',
      headers: {
        ...(userId ? { 'x-user-id': userId } : {}),
      },
    });
  },

  getInvitationPreview: (token) => {
    return boundedFetch(`${API_BASE}/invitations/${token}`);
  },

  acceptInvitation: (token, userId = null) => {
    return boundedFetch(`${API_BASE}/invitations/${token}/accept`, {
      method: 'POST',
      headers: {
        ...(userId ? { 'x-user-id': userId } : {}),
      },
    });
  },

  // ----------------------------------------------------
  // MILESTONE 12: SUPER ADMIN & PLATFORM MANAGEMENT
  // ----------------------------------------------------
  getPlatformOverview: () => {
    return boundedFetch(`${API_BASE}/admin/overview`);
  },

  getAdminLiveMatches: () => {
    return boundedFetch(`${API_BASE}/admin/live-matches`);
  },

  listAdminTournaments: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return boundedFetch(`${API_BASE}/admin/tournaments${q ? `?${q}` : ''}`);
  },

  freezeTournament: (tournamentId, { isFrozen, reason }) => {
    return boundedFetch(`${API_BASE}/admin/tournaments/${tournamentId}/freeze`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFrozen, reason }),
    });
  },

  transferTournamentOwnership: (tournamentId, { newOwnerUserId, reason }) => {
    return boundedFetch(`${API_BASE}/admin/tournaments/${tournamentId}/transfer-ownership`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newOwnerUserId, reason }),
    });
  },

  listAdminUsers: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return boundedFetch(`${API_BASE}/admin/users${q ? `?${q}` : ''}`);
  },

  unlockUserAccount: (userId, { reason } = {}) => {
    return boundedFetch(`${API_BASE}/admin/users/${userId}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
  },

  updateUserStatus: (userId, { isSuspended, reason }) => {
    return boundedFetch(`${API_BASE}/admin/users/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isSuspended, reason }),
    });
  },

  updateUserRole: (userId, { globalRole, reason }) => {
    return boundedFetch(`${API_BASE}/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ globalRole, reason }),
    });
  },

  mergePlayers: ({ sourcePlayerId, targetPlayerId, reason }) => {
    return boundedFetch(`${API_BASE}/admin/players/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePlayerId, targetPlayerId, reason }),
    });
  },

  listAdminTeams: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return boundedFetch(`${API_BASE}/admin/teams${q ? `?${q}` : ''}`);
  },

  toggleTeamVerification: (teamId, { isVerified, reason }) => {
    return boundedFetch(`${API_BASE}/admin/teams/${teamId}/verify`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isVerified, reason }),
    });
  },

  createVenueBlackout: ({ venueId, startTime, endTime, reason }) => {
    return boundedFetch(`${API_BASE}/admin/venues/blackouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, startTime, endTime, reason }),
    });
  },

  listVenueBlackouts: (venueId = null) => {
    const q = venueId ? `?venueId=${encodeURIComponent(venueId)}` : '';
    return boundedFetch(`${API_BASE}/admin/venues/blackouts${q}`);
  },

  deleteVenueBlackout: (blackoutId, { reason }) => {
    return boundedFetch(`${API_BASE}/admin/venues/blackouts/${blackoutId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
  },

  listAdminAuditLogs: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return boundedFetch(`${API_BASE}/admin/audit-logs${q ? `?${q}` : ''}`);
  },
};


