-- ====================================================================
-- MILESTONE 8: PLAYER & TEAM PROFILE AND AWARDS INDEXES
-- ====================================================================

-- 1. Optimize player performance lookups across historical innings
CREATE INDEX IF NOT EXISTS idx_batting_player_innings 
  ON batting_performances(player_id, innings_id);

CREATE INDEX IF NOT EXISTS idx_bowling_player_innings 
  ON bowling_performances(player_id, innings_id);

-- 2. Optimize fielding dismissal assists (catches, stumpings, run-outs)
CREATE INDEX IF NOT EXISTS idx_deliveries_assist_player 
  ON deliveries(assist_player_id) 
  WHERE assist_player_id IS NOT NULL AND is_reverted = FALSE;

CREATE INDEX IF NOT EXISTS idx_deliveries_dismissed_player 
  ON deliveries(dismissed_player_id) 
  WHERE dismissed_player_id IS NOT NULL AND is_reverted = FALSE;

-- 3. Optimize tournament-scoped match lookups and status filtering
CREATE INDEX IF NOT EXISTS idx_matches_tournament_status_stage 
  ON matches(tournament_id, status, stage);
