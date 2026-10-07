-- ====================================================================
-- MIGRATION 009: TOURNAMENT PLAYOFFS, BRACKETS & CHAMPIONSHIP FINALS
-- ====================================================================

-- 1. Extend tournaments table with playoff configuration and championship results
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS playoff_format VARCHAR(50) DEFAULT 'NONE'
    CHECK (playoff_format IN ('NONE', 'PAGE_PLAYOFF', 'SEMI_FINALS')),
  ADD COLUMN IF NOT EXISTS playoff_teams_count INT DEFAULT 4
    CHECK (playoff_teams_count = 4),
  ADD COLUMN IF NOT EXISTS champion_team_id UUID REFERENCES tournament_teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS runner_up_team_id UUID REFERENCES tournament_teams(id) ON DELETE SET NULL;

-- 2. Relax NOT NULL constraints on matches.team_a_id and team_b_id for future playoff slots
ALTER TABLE matches ALTER COLUMN team_a_id DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN team_b_id DROP NOT NULL;

-- 3. Update check constraint to allow NULL teams while preventing identical teams
ALTER TABLE matches DROP CONSTRAINT IF EXISTS chk_different_teams;
ALTER TABLE matches ADD CONSTRAINT chk_different_teams
  CHECK (team_a_id IS NULL OR team_b_id IS NULL OR team_a_id <> team_b_id);

-- 4. Guard against starting or completing matches with unpopulated teams
ALTER TABLE matches ADD CONSTRAINT chk_active_match_teams_present
  CHECK (status NOT IN ('TOSS_DONE', 'IN_PROGRESS', 'INNINGS_BREAK', 'COMPLETED')
         OR (team_a_id IS NOT NULL AND team_b_id IS NOT NULL));

-- 5. Add bracket metadata and dependency tracking columns to matches table
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS team_a_placeholder VARCHAR(100),
  ADD COLUMN IF NOT EXISTS team_b_placeholder VARCHAR(100),
  ADD COLUMN IF NOT EXISTS playoff_order INT,
  ADD COLUMN IF NOT EXISTS team_a_source_match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_a_source_outcome VARCHAR(10) CHECK (team_a_source_outcome IN ('WINNER', 'LOSER')),
  ADD COLUMN IF NOT EXISTS team_b_source_match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_b_source_outcome VARCHAR(10) CHECK (team_b_source_outcome IN ('WINNER', 'LOSER'));

-- 6. Partial unique index to strictly prevent duplicate playoff generation
CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_playoff_stage
  ON matches (tournament_id, stage)
  WHERE stage <> 'LEAGUE';

-- 7. Indexes for progression and bracket traversal
CREATE INDEX IF NOT EXISTS idx_matches_stage ON matches(stage);
CREATE INDEX IF NOT EXISTS idx_matches_playoff_order ON matches(tournament_id, playoff_order);
CREATE INDEX IF NOT EXISTS idx_matches_team_a_source ON matches(team_a_source_match_id);
CREATE INDEX IF NOT EXISTS idx_matches_team_b_source ON matches(team_b_source_match_id);
