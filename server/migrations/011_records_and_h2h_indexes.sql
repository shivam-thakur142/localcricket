-- ====================================================================
-- MILESTONE 9: TOURNAMENT RECORDS, HEAD-TO-HEAD AND VENUE INDEXES
-- ====================================================================

-- 1. Symmetric Head-to-Head match lookup index
CREATE INDEX IF NOT EXISTS idx_matches_teams_sym 
  ON matches(LEAST(team_a_id, team_b_id), GREATEST(team_a_id, team_b_id), status);

-- 2. Direct team status indexes for recent form and match history
CREATE INDEX IF NOT EXISTS idx_matches_team_a_status 
  ON matches(team_a_id, status, scheduled_start_time DESC);

CREATE INDEX IF NOT EXISTS idx_matches_team_b_status 
  ON matches(team_b_id, status, scheduled_start_time DESC);

-- 3. Venue intelligence index for tournament-scoped venue averages
CREATE INDEX IF NOT EXISTS idx_matches_venue_status 
  ON matches(tournament_id, venue_id, status);

-- 4. Innings high/low score aggregation index
CREATE INDEX IF NOT EXISTS idx_innings_match_total_runs 
  ON innings(match_id, total_runs DESC, total_wickets ASC);

-- 5. Individual high score and best bowling spells indexes
CREATE INDEX IF NOT EXISTS idx_batting_runs_scored 
  ON batting_performances(innings_id, runs_scored DESC);

CREATE INDEX IF NOT EXISTS idx_bowling_wickets_conceded 
  ON bowling_performances(innings_id, wickets DESC, runs_conceded ASC);
