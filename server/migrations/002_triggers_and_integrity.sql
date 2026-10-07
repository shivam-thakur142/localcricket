-- ====================================================================
-- MIGRATION 002: Triggers and Integrity Constraints for LocalCricket
-- ====================================================================

-- 1. Trigger: Enforce that match_player belongs to either team_a or team_b of that match
CREATE OR REPLACE FUNCTION fn_check_match_player_team()
RETURNS TRIGGER AS $$
DECLARE
  v_team_a UUID;
  v_team_b UUID;
BEGIN
  SELECT team_a_id, team_b_id INTO v_team_a, v_team_b
  FROM matches
  WHERE id = NEW.match_id;

  IF v_team_a IS NULL THEN
    RAISE EXCEPTION 'Match with id % does not exist', NEW.match_id;
  END IF;

  IF NEW.tournament_team_id <> v_team_a AND NEW.tournament_team_id <> v_team_b THEN
    RAISE EXCEPTION 'Integrity Error: Team % does not participate in match % (Teams are % vs %)',
      NEW.tournament_team_id, NEW.match_id, v_team_a, v_team_b;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_match_player_team ON match_players;
CREATE TRIGGER trg_enforce_match_player_team
BEFORE INSERT OR UPDATE ON match_players
FOR EACH ROW
EXECUTE FUNCTION fn_check_match_player_team();


-- 2. Trigger: Enforce that innings batting and bowling teams match the match's participating teams
CREATE OR REPLACE FUNCTION fn_check_innings_teams()
RETURNS TRIGGER AS $$
DECLARE
  v_team_a UUID;
  v_team_b UUID;
BEGIN
  SELECT team_a_id, team_b_id INTO v_team_a, v_team_b
  FROM matches
  WHERE id = NEW.match_id;

  IF v_team_a IS NULL THEN
    RAISE EXCEPTION 'Match with id % does not exist', NEW.match_id;
  END IF;

  IF NOT (
    (NEW.batting_team_id = v_team_a AND NEW.bowling_team_id = v_team_b) OR
    (NEW.batting_team_id = v_team_b AND NEW.bowling_team_id = v_team_a)
  ) THEN
    RAISE EXCEPTION 'Integrity Error: Innings teams (% & %) do not match match teams (% vs %)',
      NEW.batting_team_id, NEW.bowling_team_id, v_team_a, v_team_b;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_innings_teams ON innings;
CREATE TRIGGER trg_enforce_innings_teams
BEFORE INSERT OR UPDATE ON innings
FOR EACH ROW
EXECUTE FUNCTION fn_check_innings_teams();


-- 3. Trigger: Enforce that active innings players belong to the Playing XI of their respective teams
CREATE OR REPLACE FUNCTION fn_check_innings_players()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate Striker
  IF NEW.current_striker_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM match_players
      WHERE match_id = NEW.match_id
        AND tournament_team_id = NEW.batting_team_id
        AND player_id = NEW.current_striker_id
        AND is_playing_xi = TRUE
    ) THEN
      RAISE EXCEPTION 'Integrity Error: Striker % is not in batting team Playing XI for match %',
        NEW.current_striker_id, NEW.match_id;
    END IF;
  END IF;

  -- Validate Non-Striker
  IF NEW.current_non_striker_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM match_players
      WHERE match_id = NEW.match_id
        AND tournament_team_id = NEW.batting_team_id
        AND player_id = NEW.current_non_striker_id
        AND is_playing_xi = TRUE
    ) THEN
      RAISE EXCEPTION 'Integrity Error: Non-striker % is not in batting team Playing XI for match %',
        NEW.current_non_striker_id, NEW.match_id;
    END IF;
  END IF;

  -- Validate Bowler
  IF NEW.current_bowler_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM match_players
      WHERE match_id = NEW.match_id
        AND tournament_team_id = NEW.bowling_team_id
        AND player_id = NEW.current_bowler_id
        AND is_playing_xi = TRUE
    ) THEN
      RAISE EXCEPTION 'Integrity Error: Bowler % is not in bowling team Playing XI for match %',
        NEW.current_bowler_id, NEW.match_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_innings_players ON innings;
CREATE TRIGGER trg_enforce_innings_players
BEFORE INSERT OR UPDATE ON innings
FOR EACH ROW
EXECUTE FUNCTION fn_check_innings_players();


-- 4. Trigger: Enforce delivery players consistency with active over and innings
CREATE OR REPLACE FUNCTION fn_check_delivery_players()
RETURNS TRIGGER AS $$
DECLARE
  v_over_bowler_id UUID;
  v_batting_team_id UUID;
  v_match_id UUID;
BEGIN
  -- Validate bowler matches the over's bowler
  SELECT bowler_id INTO v_over_bowler_id
  FROM overs
  WHERE id = NEW.over_id;

  IF v_over_bowler_id IS NULL THEN
    RAISE EXCEPTION 'Over with id % does not exist', NEW.over_id;
  END IF;

  IF NEW.bowler_id <> v_over_bowler_id THEN
    RAISE EXCEPTION 'Integrity Error: Delivery bowler % does not match over bowler %',
      NEW.bowler_id, v_over_bowler_id;
  END IF;

  -- Validate dismissed player is on the pitch if wicket fell
  IF NEW.is_wicket = TRUE THEN
    IF NEW.dismissed_player_id <> NEW.striker_id AND NEW.dismissed_player_id <> NEW.non_striker_id THEN
      RAISE EXCEPTION 'Integrity Error: Dismissed player % must be either striker % or non-striker %',
        NEW.dismissed_player_id, NEW.striker_id, NEW.non_striker_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_delivery_players ON deliveries;
CREATE TRIGGER trg_enforce_delivery_players
BEFORE INSERT OR UPDATE ON deliveries
FOR EACH ROW
EXECUTE FUNCTION fn_check_delivery_players();
