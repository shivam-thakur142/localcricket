-- ====================================================================
-- MIGRATION 005: Idempotency Keys Storage for Scorer API
-- ====================================================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(100) NOT NULL,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_match ON idempotency_keys(match_id);
