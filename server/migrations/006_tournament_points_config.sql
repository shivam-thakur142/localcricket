-- ====================================================================
-- MIGRATION 006: Dedicated Tournament Points & Transparent NRR Audit
-- ====================================================================

-- 1. Dedicated Tournament Points Configuration
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS points_for_win INT NOT NULL DEFAULT 2 CHECK (points_for_win >= 0),
  ADD COLUMN IF NOT EXISTS points_for_tie INT NOT NULL DEFAULT 1 CHECK (points_for_tie >= 0),
  ADD COLUMN IF NOT EXISTS points_for_no_result INT NOT NULL DEFAULT 1 CHECK (points_for_no_result >= 0),
  ADD COLUMN IF NOT EXISTS nrr_playing_conditions VARCHAR(50) NOT NULL DEFAULT 'STANDARD_ALL_OUT_QUOTA';

-- 2. Audit Tracking in points_table: Separation of Actual Balls vs Effective NRR Denominators
ALTER TABLE points_table
  -- Actual balls physically faced on pitch
  ADD COLUMN IF NOT EXISTS actual_balls_faced INT NOT NULL DEFAULT 0 CHECK (actual_balls_faced >= 0),
  -- Effective balls used for NRR batting denominator (rounded up to full quota if all out)
  ADD COLUMN IF NOT EXISTS effective_balls_faced INT NOT NULL DEFAULT 0 CHECK (effective_balls_faced >= 0),
  -- Formatted display string for overs faced (e.g. "19.1")
  ADD COLUMN IF NOT EXISTS overs_faced_display VARCHAR(20) NOT NULL DEFAULT '0.0',
  -- Actual balls physically bowled on pitch
  ADD COLUMN IF NOT EXISTS actual_balls_bowled INT NOT NULL DEFAULT 0 CHECK (actual_balls_bowled >= 0),
  -- Effective balls used for NRR bowling denominator (rounded up to full quota if opponent all out)
  ADD COLUMN IF NOT EXISTS effective_balls_bowled INT NOT NULL DEFAULT 0 CHECK (effective_balls_bowled >= 0),
  -- Formatted display string for overs bowled (e.g. "20.0")
  ADD COLUMN IF NOT EXISTS overs_bowled_display VARCHAR(20) NOT NULL DEFAULT '0.0';
