-- ====================================================================
-- MIGRATION 014: SUPER ADMIN & PLATFORM-WIDE MANAGEMENT CONSOLE
-- ====================================================================

-- 1. Create Platform Audit Logs Table (Append-Only)
CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action VARCHAR(64) NOT NULL,
  target_entity_type VARCHAR(64) NOT NULL,
  target_entity_id UUID NOT NULL,
  reason TEXT NOT NULL,
  previous_state JSONB,
  new_state JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_target 
  ON platform_audit_logs(target_entity_type, target_entity_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_action 
  ON platform_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_platform_audit_created 
  ON platform_audit_logs(created_at DESC);

-- 2. Database-Level Trigger for Platform Audit Log Immutability
CREATE OR REPLACE FUNCTION fn_prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'platform_audit_logs is append-only and strictly immutable. UPDATE and DELETE operations are forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_platform_audit ON platform_audit_logs;
CREATE TRIGGER trg_immutable_platform_audit
BEFORE UPDATE OR DELETE ON platform_audit_logs
FOR EACH ROW
EXECUTE FUNCTION fn_prevent_audit_log_mutation();

-- 3. Venue Blackout Periods (for shared pitch maintenance & external reservations)
CREATE TABLE IF NOT EXISTS venue_blackouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_blackout_time CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_venue_blackouts_window 
  ON venue_blackouts(venue_id, start_time, end_time);

-- 4. Player Merge Audit Log
CREATE TABLE IF NOT EXISTS player_merge_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_player_id UUID NOT NULL,
  target_player_id UUID NOT NULL,
  source_player_name TEXT NOT NULL,
  target_player_name TEXT NOT NULL,
  deliveries_remapped INTEGER NOT NULL DEFAULT 0,
  rosters_remapped INTEGER NOT NULL DEFAULT 0,
  awards_remapped INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_merge_audit_players 
  ON player_merge_audit(source_player_id, target_player_id);

-- 5. User Moderation Flags on users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

-- 6. Tournament Platform Governance Flags on tournaments table
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS frozen_reason TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ;

-- 7. Global Team Verification Flags on teams table
ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- 8. Seed Super Admin Account in Development / Test Environments
-- (Production environments do not seed known default passwords)
DO $$
BEGIN
  IF current_setting('localcricket.environment', true) IS DISTINCT FROM 'production' THEN
  -- Insert into auth.users stub
  INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-0000-0000-000000000001', 'admin@localcricket.test')
  ON CONFLICT (id) DO NOTHING;

  -- Insert into public.users
  INSERT INTO users (id, auth_user_id, full_name, email, phone, global_role) VALUES
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Super Administrator', 'admin@localcricket.test', '+919999900000', 'SUPER_ADMIN')
  ON CONFLICT (id) DO UPDATE SET global_role = 'SUPER_ADMIN';

  -- Pre-hashed bcrypt cost 12 password for 'LocalCricket@2026!'
  INSERT INTO user_credentials (user_id, password_hash) VALUES
    ('00000000-0000-0000-0000-000000000001', '$2b$12$/qCsressW.39cBScHHb7OOdSjEAQx0DSEFbtqczJC8OcKcrW6MjpC')
  ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;
