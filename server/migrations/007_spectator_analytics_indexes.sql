-- ====================================================================
-- MIGRATION 007: Performance Indexes for Spectator Analytics & Leaderboards
-- ====================================================================

-- 1. Index to accelerate filtering of active deliveries (commentary, worm, manhattan)
CREATE INDEX IF NOT EXISTS idx_deliveries_analytics 
  ON deliveries(innings_id, is_reverted, delivery_sequence);

-- 2. Index to accelerate boundary commentary queries
CREATE INDEX IF NOT EXISTS idx_deliveries_boundaries 
  ON deliveries(innings_id, is_reverted, runs_batter);

-- 3. Index to accelerate wicket commentary and fall-of-wickets queries
CREATE INDEX IF NOT EXISTS idx_deliveries_wickets 
  ON deliveries(innings_id, is_reverted, is_wicket);

-- 4. Index to accelerate tournament batting leaderboards (Orange Cap)
CREATE INDEX IF NOT EXISTS idx_batting_leaderboards 
  ON batting_performances(runs_scored DESC, balls_faced ASC);

-- 5. Index to accelerate tournament bowling leaderboards (Purple Cap)
CREATE INDEX IF NOT EXISTS idx_bowling_leaderboards 
  ON bowling_performances(wickets DESC, runs_conceded ASC);
