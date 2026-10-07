-- ====================================================================
-- MILESTONE 10: TOURNAMENT OPERATIONS, CONCURRENCY-SAFE SCHEDULING,
-- MATCH OFFICIALS & AUDIT LOGGING
-- ====================================================================

-- 1. Extend tournament_role Enum with UMPIRE and REFEREE
ALTER TYPE tournament_role ADD VALUE IF NOT EXISTS 'UMPIRE';
ALTER TYPE tournament_role ADD VALUE IF NOT EXISTS 'REFEREE';

-- 2. Create Match Official Role Enum
DO $$ BEGIN
  CREATE TYPE match_official_role AS ENUM (
    'UMPIRE_1', 'UMPIRE_2', 'THIRD_UMPIRE', 'MATCH_REFEREE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Create Squad Verification Status Enum
DO $$ BEGIN
  CREATE TYPE squad_verification_status AS ENUM (
    'DRAFT', 'VERIFIED', 'LOCKED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Match Officials Table
CREATE TABLE IF NOT EXISTS match_officials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role match_official_role NOT NULL,
  assigned_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, role),
  UNIQUE (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_officials_user ON match_officials(user_id);
CREATE INDEX IF NOT EXISTS idx_match_officials_match ON match_officials(match_id);
CREATE INDEX IF NOT EXISTS idx_match_officials_tournament ON match_officials(tournament_id);

-- 5. Add Squad Verification Status to tournament_teams
ALTER TABLE tournament_teams 
  ADD COLUMN IF NOT EXISTS squad_status squad_verification_status NOT NULL DEFAULT 'DRAFT';

-- 6. Add estimated_duration_minutes to matches
ALTER TABLE matches 
  ADD COLUMN IF NOT EXISTS estimated_duration_minutes INT DEFAULT NULL;

-- 7. Dedicated Tournament Operations Audit Table
CREATE TABLE IF NOT EXISTS tournament_operations_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  previous_state JSONB,
  new_state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operations_audit_tournament ON tournament_operations_audit(tournament_id);
CREATE INDEX IF NOT EXISTS idx_operations_audit_match ON tournament_operations_audit(match_id);
CREATE INDEX IF NOT EXISTS idx_operations_audit_actor ON tournament_operations_audit(actor_user_id);
