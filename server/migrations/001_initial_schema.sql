-- ====================================================================
-- MIGRATION 001: Initial Schema Definition for LocalCricket
-- ====================================================================

-- 1. Create an auth.users stub for local testing only. Supabase owns its
-- protected auth schema, so avoid CREATE statements when its table exists.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    IF to_regnamespace('auth') IS NULL THEN
      EXECUTE 'CREATE SCHEMA auth';
    END IF;

    EXECUTE 'CREATE TABLE auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )';
  END IF;
END $$;

-- 2. Enumerations & Custom Domain Types
DO $$ BEGIN
  CREATE TYPE global_user_role AS ENUM ('SUPER_ADMIN', 'USER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tournament_role AS ENUM ('ORGANIZER', 'SCORER', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cricket_format AS ENUM ('T10', 'T15', 'T20', 'ODI', 'CUSTOM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cricket_ball_type AS ENUM ('TENNIS', 'LEATHER', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tournament_status AS ENUM ('DRAFT', 'UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE batting_style AS ENUM ('RIGHT_HAND_BAT', 'LEFT_HAND_BAT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bowling_style AS ENUM (
    'RIGHT_ARM_FAST', 'RIGHT_ARM_MEDIUM', 'RIGHT_ARM_SPIN_OFF', 'RIGHT_ARM_SPIN_LEG',
    'LEFT_ARM_FAST', 'LEFT_ARM_MEDIUM', 'LEFT_ARM_SPIN_ORTHODOX', 'LEFT_ARM_SPIN_CHINAMAN',
    'NONE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE player_primary_role AS ENUM ('BATTER', 'BOWLER', 'ALL_ROUNDER', 'WICKET_KEEPER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE match_status AS ENUM (
    'SCHEDULED', 'TOSS_DONE', 'IN_PROGRESS', 'INNINGS_BREAK', 'COMPLETED', 'ABANDONED', 'NO_RESULT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE toss_decision AS ENUM ('BAT', 'BOWL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE match_result_type AS ENUM ('NORMAL', 'SUPER_OVER', 'TIED', 'NO_RESULT', 'ABANDONED', 'AWARDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE innings_status AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE extra_type AS ENUM ('NONE', 'WIDE', 'NO_BALL', 'BYE', 'LEG_BYE', 'PENALTY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE wicket_type AS ENUM (
    'NONE', 'BOWLED', 'CAUGHT', 'LBW', 'RUN_OUT', 'STUMPED', 
    'HIT_WICKET', 'RETIRED_HURT', 'OBSTRUCTING_FIELD', 'TIMED_OUT', 'HIT_BALL_TWICE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Core Tables

-- 3.1 Users Profile
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) UNIQUE,
  email VARCHAR(255) UNIQUE NOT NULL,
  avatar_url TEXT,
  global_role global_user_role NOT NULL DEFAULT 'USER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 3.2 Tournaments
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name VARCHAR(150) NOT NULL,
  short_name VARCHAR(30) NOT NULL,
  slug VARCHAR(160) UNIQUE NOT NULL,
  ball_type cricket_ball_type NOT NULL DEFAULT 'TENNIS',
  format cricket_format NOT NULL DEFAULT 'T20',
  overs_per_innings INT NOT NULL DEFAULT 20 CHECK (overs_per_innings > 0),
  balls_per_over INT NOT NULL DEFAULT 6 CHECK (balls_per_over BETWEEN 4 AND 10),
  max_overs_per_bowler INT NOT NULL DEFAULT 4 CHECK (max_overs_per_bowler > 0),
  wide_runs INT NOT NULL DEFAULT 1 CHECK (wide_runs >= 0),
  no_ball_runs INT NOT NULL DEFAULT 1 CHECK (no_ball_runs >= 0),
  free_hit_on_no_ball BOOLEAN NOT NULL DEFAULT TRUE,
  rules_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status tournament_status NOT NULL DEFAULT 'DRAFT',
  city VARCHAR(100) NOT NULL,
  banner_url TEXT,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tournaments_slug ON tournaments(slug);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);

-- 3.3 Scoped Tournament Members
CREATE TABLE IF NOT EXISTS tournament_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role tournament_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tournament_members_user ON tournament_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_members_tournament ON tournament_members(tournament_id);

-- 3.4 Global Teams
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  short_name VARCHAR(10) NOT NULL,
  city VARCHAR(100),
  logo_url TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);

-- 3.5 Tournament-Specific Team Registrations
CREATE TABLE IF NOT EXISTS tournament_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  group_name VARCHAR(50) NOT NULL DEFAULT 'General',
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, team_id),
  UNIQUE (id, tournament_id) -- Required for composite FK from matches
);
CREATE INDEX IF NOT EXISTS idx_tournament_teams_tournament ON tournament_teams(tournament_id);

-- 3.6 Independent Players
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  full_name VARCHAR(100) NOT NULL,
  nickname VARCHAR(50),
  phone VARCHAR(20),
  batting_style batting_style NOT NULL DEFAULT 'RIGHT_HAND_BAT',
  bowling_style bowling_style NOT NULL DEFAULT 'NONE',
  primary_role player_primary_role NOT NULL DEFAULT 'ALL_ROUNDER',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_players_full_name ON players(full_name);
CREATE INDEX IF NOT EXISTS idx_players_phone ON players(phone);

-- 3.7 Team Rosters (Squad registration in a tournament team)
CREATE TABLE IF NOT EXISTS team_rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_team_id UUID NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  jersey_number INT CHECK (jersey_number BETWEEN 0 AND 999),
  is_captain BOOLEAN NOT NULL DEFAULT FALSE,
  is_vice_captain BOOLEAN NOT NULL DEFAULT FALSE,
  is_wicket_keeper BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at TIMESTAMPTZ,
  withdrawal_reason TEXT,
  UNIQUE (tournament_team_id, player_id) -- Target for match_players composite FK
);
CREATE INDEX IF NOT EXISTS idx_team_rosters_player ON team_rosters(player_id);
CREATE INDEX IF NOT EXISTS idx_team_rosters_team ON team_rosters(tournament_team_id);

-- 3.8 Venues
CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  ground_name VARCHAR(150),
  city VARCHAR(100) NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.9 Matches
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  team_a_id UUID NOT NULL,
  team_b_id UUID NOT NULL,
  match_number INT NOT NULL,
  stage VARCHAR(50) NOT NULL DEFAULT 'LEAGUE',
  scheduled_start_time TIMESTAMPTZ NOT NULL,
  overs_quota INT NOT NULL CHECK (overs_quota > 0),
  toss_winner_team_id UUID REFERENCES tournament_teams(id) ON DELETE SET NULL,
  toss_decision toss_decision,
  status match_status NOT NULL DEFAULT 'SCHEDULED',
  result_type match_result_type,
  winner_team_id UUID REFERENCES tournament_teams(id) ON DELETE SET NULL,
  result_margin_runs INT,
  result_margin_wickets INT,
  player_of_the_match_id UUID REFERENCES players(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_different_teams CHECK (team_a_id <> team_b_id),
  CONSTRAINT fk_match_team_a FOREIGN KEY (team_a_id, tournament_id) 
    REFERENCES tournament_teams(id, tournament_id) ON DELETE RESTRICT,
  CONSTRAINT fk_match_team_b FOREIGN KEY (team_b_id, tournament_id) 
    REFERENCES tournament_teams(id, tournament_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);

-- 3.10 Match Scorers
CREATE TABLE IF NOT EXISTS match_scorers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_match_scorers_match ON match_scorers(match_id);

-- 3.11 Match Players (Playing XI / Substitutes)
CREATE TABLE IF NOT EXISTS match_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  tournament_team_id UUID NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  is_playing_xi BOOLEAN NOT NULL DEFAULT TRUE,
  is_captain BOOLEAN NOT NULL DEFAULT FALSE,
  is_wicket_keeper BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, player_id),
  CONSTRAINT fk_match_player_roster FOREIGN KEY (tournament_team_id, player_id)
    REFERENCES team_rosters(tournament_team_id, player_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_match_players_match ON match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_match_players_team ON match_players(tournament_team_id);

-- 3.12 Innings
CREATE TABLE IF NOT EXISTS innings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  innings_number INT NOT NULL CHECK (innings_number IN (1, 2, 3, 4)),
  batting_team_id UUID NOT NULL REFERENCES tournament_teams(id) ON DELETE RESTRICT,
  bowling_team_id UUID NOT NULL REFERENCES tournament_teams(id) ON DELETE RESTRICT,
  total_runs INT NOT NULL DEFAULT 0 CHECK (total_runs >= 0),
  total_wickets INT NOT NULL DEFAULT 0 CHECK (total_wickets >= 0 AND total_wickets <= 10),
  total_legal_balls INT NOT NULL DEFAULT 0 CHECK (total_legal_balls >= 0),
  total_extras INT NOT NULL DEFAULT 0 CHECK (total_extras >= 0),
  status innings_status NOT NULL DEFAULT 'NOT_STARTED',
  target_runs INT CHECK (target_runs IS NULL OR target_runs > 0),
  current_striker_id UUID REFERENCES players(id) ON DELETE SET NULL,
  current_non_striker_id UUID REFERENCES players(id) ON DELETE SET NULL,
  current_bowler_id UUID REFERENCES players(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (match_id, innings_number),
  CONSTRAINT chk_innings_distinct_teams CHECK (batting_team_id <> bowling_team_id),
  CONSTRAINT chk_innings_distinct_batters CHECK (
    current_striker_id IS NULL OR current_non_striker_id IS NULL OR current_striker_id <> current_non_striker_id
  )
);
CREATE INDEX IF NOT EXISTS idx_innings_match ON innings(match_id);

-- 3.13 Overs (1-Indexed)
CREATE TABLE IF NOT EXISTS overs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  innings_id UUID NOT NULL REFERENCES innings(id) ON DELETE CASCADE,
  over_number INT NOT NULL CHECK (over_number >= 1),
  bowler_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  legal_balls INT NOT NULL DEFAULT 0 CHECK (legal_balls BETWEEN 0 AND 10),
  total_runs_conceded INT NOT NULL DEFAULT 0 CHECK (total_runs_conceded >= 0),
  wickets_taken INT NOT NULL DEFAULT 0 CHECK (wickets_taken >= 0),
  is_maiden BOOLEAN NOT NULL DEFAULT FALSE,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (innings_id, over_number)
);
CREATE INDEX IF NOT EXISTS idx_overs_innings ON overs(innings_id);

-- 3.14 Deliveries (No duplicate over_number, explicit sequence and ball counters)
CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  innings_id UUID NOT NULL REFERENCES innings(id) ON DELETE CASCADE,
  over_id UUID NOT NULL REFERENCES overs(id) ON DELETE CASCADE,
  delivery_sequence INT NOT NULL CHECK (delivery_sequence >= 1),
  ball_number INT NOT NULL CHECK (ball_number >= 1),
  legal_ball_number INT NOT NULL CHECK (legal_ball_number >= 0),
  bowler_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  striker_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  non_striker_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  runs_batter INT NOT NULL DEFAULT 0 CHECK (runs_batter BETWEEN 0 AND 7),
  runs_extras INT NOT NULL DEFAULT 0 CHECK (runs_extras >= 0),
  extra_type extra_type NOT NULL DEFAULT 'NONE',
  is_legal BOOLEAN NOT NULL DEFAULT TRUE,
  is_wicket BOOLEAN NOT NULL DEFAULT FALSE,
  wicket_type wicket_type NOT NULL DEFAULT 'NONE',
  dismissed_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  assist_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  commentary_text TEXT,
  is_reverted BOOLEAN NOT NULL DEFAULT FALSE,
  reverted_at TIMESTAMPTZ,
  reverted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reversion_reason TEXT,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (innings_id, delivery_sequence),
  CONSTRAINT chk_delivery_distinct_batters CHECK (striker_id <> non_striker_id),
  CONSTRAINT chk_delivery_legality CHECK (
    (extra_type IN ('WIDE', 'NO_BALL') AND is_legal = FALSE) OR
    (extra_type NOT IN ('WIDE', 'NO_BALL') AND is_legal = TRUE)
  ),
  CONSTRAINT chk_delivery_wide_rules CHECK (
    extra_type <> 'WIDE' OR (runs_batter = 0 AND runs_extras >= 1)
  ),
  CONSTRAINT chk_delivery_byes_rules CHECK (
    extra_type NOT IN ('BYE', 'LEG_BYE') OR (runs_batter = 0 AND runs_extras >= 1)
  ),
  CONSTRAINT chk_delivery_wicket_rules CHECK (
    (is_wicket = FALSE AND wicket_type = 'NONE' AND dismissed_player_id IS NULL) OR
    (is_wicket = TRUE AND wicket_type <> 'NONE' AND dismissed_player_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_deliveries_innings_seq ON deliveries(innings_id, delivery_sequence);
CREATE INDEX IF NOT EXISTS idx_deliveries_over ON deliveries(over_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_is_reverted ON deliveries(is_reverted);

-- 3.15 Batting Performances (Materialized View)
CREATE TABLE IF NOT EXISTS batting_performances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  innings_id UUID NOT NULL REFERENCES innings(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  batting_order INT NOT NULL CHECK (batting_order BETWEEN 1 AND 15),
  runs_scored INT NOT NULL DEFAULT 0 CHECK (runs_scored >= 0),
  balls_faced INT NOT NULL DEFAULT 0 CHECK (balls_faced >= 0),
  fours INT NOT NULL DEFAULT 0 CHECK (fours >= 0),
  sixes INT NOT NULL DEFAULT 0 CHECK (sixes >= 0),
  strike_rate NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
  is_out BOOLEAN NOT NULL DEFAULT FALSE,
  wicket_type wicket_type NOT NULL DEFAULT 'NONE',
  bowler_id UUID REFERENCES players(id) ON DELETE SET NULL,
  assist_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  dismissal_text VARCHAR(150),
  UNIQUE (innings_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_batting_innings ON batting_performances(innings_id);

-- 3.16 Bowling Performances (Materialized View)
CREATE TABLE IF NOT EXISTS bowling_performances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  innings_id UUID NOT NULL REFERENCES innings(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  bowling_order INT NOT NULL CHECK (bowling_order BETWEEN 1 AND 15),
  legal_balls_bowled INT NOT NULL DEFAULT 0 CHECK (legal_balls_bowled >= 0),
  overs_summary VARCHAR(10) NOT NULL DEFAULT '0.0',
  maidens INT NOT NULL DEFAULT 0 CHECK (maidens >= 0),
  runs_conceded INT NOT NULL DEFAULT 0 CHECK (runs_conceded >= 0),
  wickets INT NOT NULL DEFAULT 0 CHECK (wickets >= 0),
  wides INT NOT NULL DEFAULT 0 CHECK (wides >= 0),
  no_balls INT NOT NULL DEFAULT 0 CHECK (no_balls >= 0),
  economy_rate NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
  UNIQUE (innings_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_bowling_innings ON bowling_performances(innings_id);

-- 3.17 Points Table (Tournament Standings)
CREATE TABLE IF NOT EXISTS points_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  tournament_team_id UUID NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
  group_name VARCHAR(50) NOT NULL DEFAULT 'General',
  matches_played INT NOT NULL DEFAULT 0 CHECK (matches_played >= 0),
  matches_won INT NOT NULL DEFAULT 0 CHECK (matches_won >= 0),
  matches_lost INT NOT NULL DEFAULT 0 CHECK (matches_lost >= 0),
  matches_tied INT NOT NULL DEFAULT 0 CHECK (matches_tied >= 0),
  matches_no_result INT NOT NULL DEFAULT 0 CHECK (matches_no_result >= 0),
  points INT NOT NULL DEFAULT 0 CHECK (points >= 0),
  runs_scored_for INT NOT NULL DEFAULT 0 CHECK (runs_scored_for >= 0),
  legal_balls_faced INT NOT NULL DEFAULT 0 CHECK (legal_balls_faced >= 0),
  runs_conceded_against INT NOT NULL DEFAULT 0 CHECK (runs_conceded_against >= 0),
  legal_balls_bowled INT NOT NULL DEFAULT 0 CHECK (legal_balls_bowled >= 0),
  net_run_rate NUMERIC(7, 3) NOT NULL DEFAULT 0.000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, tournament_team_id)
);
CREATE INDEX IF NOT EXISTS idx_points_table_tournament ON points_table(tournament_id);
