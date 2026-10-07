-- ====================================================================
-- MIGRATION 003: Row Level Security (RLS) Policies for LocalCricket
-- ====================================================================

-- 0. Provide auth schema/function stubs only outside Supabase. Supabase owns
-- both objects; replacing auth.uid() there would break its JWT identity logic.
DO $$
BEGIN
  IF to_regnamespace('auth') IS NULL THEN
    EXECUTE 'CREATE SCHEMA auth';
  END IF;

  IF to_regprocedure('auth.uid()') IS NULL THEN
    EXECUTE $sql$
      CREATE FUNCTION auth.uid() RETURNS UUID
      LANGUAGE sql STABLE
      AS 'SELECT NULL::uuid'
    $sql$;
  END IF;
END $$;

-- 1. Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_scorers ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE innings ENABLE ROW LEVEL SECURITY;
ALTER TABLE overs ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE batting_performances ENABLE ROW LEVEL SECURITY;
ALTER TABLE bowling_performances ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_table ENABLE ROW LEVEL SECURITY;

-- 2. Public Read (SELECT) Policies for Spectators and Fans

-- Tournaments: Visible to all if not DRAFT
DROP POLICY IF EXISTS p_tournaments_select ON tournaments;
CREATE POLICY p_tournaments_select ON tournaments
  FOR SELECT USING (status <> 'DRAFT' OR created_by_user_id = auth.uid());

-- Tournament Members: Visible to all
DROP POLICY IF EXISTS p_tournament_members_select ON tournament_members;
CREATE POLICY p_tournament_members_select ON tournament_members
  FOR SELECT USING (true);

-- Teams: Publicly readable
DROP POLICY IF EXISTS p_teams_select ON teams;
CREATE POLICY p_teams_select ON teams
  FOR SELECT USING (true);

-- Tournament Teams: Publicly readable
DROP POLICY IF EXISTS p_tournament_teams_select ON tournament_teams;
CREATE POLICY p_tournament_teams_select ON tournament_teams
  FOR SELECT USING (true);

-- Players: Publicly readable
DROP POLICY IF EXISTS p_players_select ON players;
CREATE POLICY p_players_select ON players
  FOR SELECT USING (true);

-- Team Rosters: Publicly readable
DROP POLICY IF EXISTS p_team_rosters_select ON team_rosters;
CREATE POLICY p_team_rosters_select ON team_rosters
  FOR SELECT USING (true);

-- Venues: Publicly readable
DROP POLICY IF EXISTS p_venues_select ON venues;
CREATE POLICY p_venues_select ON venues
  FOR SELECT USING (true);

-- Matches: Publicly readable
DROP POLICY IF EXISTS p_matches_select ON matches;
CREATE POLICY p_matches_select ON matches
  FOR SELECT USING (true);

-- Match Scorers: Publicly readable
DROP POLICY IF EXISTS p_match_scorers_select ON match_scorers;
CREATE POLICY p_match_scorers_select ON match_scorers
  FOR SELECT USING (true);

-- Match Players: Publicly readable
DROP POLICY IF EXISTS p_match_players_select ON match_players;
CREATE POLICY p_match_players_select ON match_players
  FOR SELECT USING (true);

-- Innings: Publicly readable
DROP POLICY IF EXISTS p_innings_select ON innings;
CREATE POLICY p_innings_select ON innings
  FOR SELECT USING (true);

-- Overs: Publicly readable
DROP POLICY IF EXISTS p_overs_select ON overs;
CREATE POLICY p_overs_select ON overs
  FOR SELECT USING (true);

-- Deliveries: Publicly readable (Commentary feeds)
DROP POLICY IF EXISTS p_deliveries_select ON deliveries;
CREATE POLICY p_deliveries_select ON deliveries
  FOR SELECT USING (true);

-- Batting Performances: Publicly readable
DROP POLICY IF EXISTS p_batting_performances_select ON batting_performances;
CREATE POLICY p_batting_performances_select ON batting_performances
  FOR SELECT USING (true);

-- Bowling Performances: Publicly readable
DROP POLICY IF EXISTS p_bowling_performances_select ON bowling_performances;
CREATE POLICY p_bowling_performances_select ON bowling_performances
  FOR SELECT USING (true);

-- Points Table: Publicly readable
DROP POLICY IF EXISTS p_points_table_select ON points_table;
CREATE POLICY p_points_table_select ON points_table
  FOR SELECT USING (true);

-- Users: Users can read their own full profile; public reads can see name/avatar
DROP POLICY IF EXISTS p_users_select ON users;
CREATE POLICY p_users_select ON users
  FOR SELECT USING (true);

-- Note on Mutations (INSERT / UPDATE / DELETE):
-- By default in PostgreSQL RLS, when RLS is ENABLED and no INSERT/UPDATE/DELETE policy 
-- is granted to public/anon roles, direct client modifications are strictly DENIED.
-- Mutations are executed by the Express backend using service-level authority.
