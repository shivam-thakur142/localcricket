-- ====================================================================
-- MIGRATION 013: Production Authentication, JWT Sessions & Invitations
-- ====================================================================

-- 1. User Credentials Table (Isolated from public profile 'users')
CREATE TABLE IF NOT EXISTS user_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash VARCHAR(255) NOT NULL,
  password_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  failed_login_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_credentials_user ON user_credentials(user_id);

-- 2. User Sessions & Refresh Tokens Table (Hashed tokens + rotation tracking)
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash CHAR(64) UNIQUE NOT NULL,
  session_family_id UUID NOT NULL DEFAULT gen_random_uuid(),
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ DEFAULT NULL,
  revocation_reason VARCHAR(100) DEFAULT NULL,
  user_agent TEXT,
  ip_address VARCHAR(45),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_lookup ON user_sessions(refresh_token_hash, is_revoked);
CREATE INDEX IF NOT EXISTS idx_user_sessions_family ON user_sessions(session_family_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);

-- 3. Invitation Status Enum
DO $$ BEGIN
  CREATE TYPE invitation_status AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Tournament Invitations Table
CREATE TABLE IF NOT EXISTS tournament_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  invitation_token_hash CHAR(64) UNIQUE NOT NULL,
  invited_email VARCHAR(255) DEFAULT NULL,
  role tournament_role NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status invitation_status NOT NULL DEFAULT 'PENDING',
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  accepted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON tournament_invitations(invitation_token_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_tournament ON tournament_invitations(tournament_id);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON tournament_invitations(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_unique_active 
  ON tournament_invitations(tournament_id, lower(invited_email)) 
  WHERE status = 'PENDING';

-- 5. Seed Test Users Verified Credentials (DEVELOPMENT / TEST ENVIRONMENT ONLY)
-- Exact, cryptographically verified bcrypt cost-12 hash for 'LocalCricket@2026!':
-- Hash: $2b$12$/qCsressW.39cBScHHb7OOdSjEAQx0DSEFbtqczJC8OcKcrW6MjpC
-- Verified via bcrypt.compareSync('LocalCricket@2026!', hash) === true

DO $$
BEGIN
  IF current_setting('localcricket.environment', true) IS DISTINCT FROM 'production' THEN
    INSERT INTO auth.users (id, email) VALUES
      ('99999999-9999-9999-9999-999999999999', 'viewer@localcricket.test')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO users (id, auth_user_id, full_name, email, phone, global_role) VALUES
      ('99999999-9999-9999-9999-999999999999', '99999999-9999-9999-9999-999999999999', 'Ravi Shastri (User)', 'viewer@localcricket.test', '+919876543212', 'USER')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO user_credentials (user_id, password_hash)
    VALUES
      ('11111111-1111-1111-1111-111111111111', '$2b$12$/qCsressW.39cBScHHb7OOdSjEAQx0DSEFbtqczJC8OcKcrW6MjpC'),
      ('22222222-2222-2222-2222-222222222222', '$2b$12$/qCsressW.39cBScHHb7OOdSjEAQx0DSEFbtqczJC8OcKcrW6MjpC'),
      ('99999999-9999-9999-9999-999999999999', '$2b$12$/qCsressW.39cBScHHb7OOdSjEAQx0DSEFbtqczJC8OcKcrW6MjpC')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;
