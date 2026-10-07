-- ====================================================================
-- MIGRATION 008: TOURNAMENT ADMIN, VENUES & MATCH LIFECYCLE AUDIT
-- ====================================================================

-- 1. Add abandonment_reason to matches table
ALTER TABLE matches ADD COLUMN IF NOT EXISTS abandonment_reason TEXT;

-- 2. Create match_lifecycle_audit table for operational tracking
CREATE TABLE IF NOT EXISTS match_lifecycle_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  previous_status VARCHAR(50) NOT NULL,
  new_status VARCHAR(50) NOT NULL,
  result_type VARCHAR(50),
  winner_team_id UUID REFERENCES tournament_teams(id) ON DELETE SET NULL,
  player_of_the_match_id UUID REFERENCES players(id) ON DELETE SET NULL,
  reason TEXT,
  changed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes for fast query performance
CREATE INDEX IF NOT EXISTS idx_lifecycle_audit_match ON match_lifecycle_audit(match_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_audit_tournament ON match_lifecycle_audit(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_live_status ON matches(status) WHERE status IN ('IN_PROGRESS', 'INNINGS_BREAK');
CREATE INDEX IF NOT EXISTS idx_venues_tournament ON venues(tournament_id);
