-- ====================================================================
-- MIGRATION 004: Seed Test Data for LocalCricket (Standard SQL)
-- ====================================================================

-- 1. Insert Test Users in auth.users & users
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'organizer@localcricket.test'),
  ('22222222-2222-2222-2222-222222222222', 'scorer@localcricket.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, auth_user_id, full_name, email, phone, global_role) VALUES
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Amit Sharma (Organizer)', 'organizer@localcricket.test', '+919876543210', 'USER'),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Suresh Raina (Scorer)', 'scorer@localcricket.test', '+919876543211', 'USER')
ON CONFLICT (id) DO NOTHING;

-- 2. Insert Tournament
INSERT INTO tournaments (
  id, created_by_user_id, name, short_name, slug, ball_type, format,
  overs_per_innings, balls_per_over, max_overs_per_bowler, wide_runs, no_ball_runs,
  status, city
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'Shivaji Park Premier League 2026',
  'SPPL 2026',
  'sppl-2026',
  'TENNIS',
  'T20',
  20, 6, 4, 1, 1,
  'ONGOING',
  'Mumbai'
) ON CONFLICT (id) DO NOTHING;

-- 3. Scoped Tournament Roles
INSERT INTO tournament_members (tournament_id, user_id, role) VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'ORGANIZER'),
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'SCORER')
ON CONFLICT (tournament_id, user_id) DO NOTHING;

-- 4. Global Teams
INSERT INTO teams (id, name, short_name, city, created_by_user_id) VALUES
  ('44444444-4444-4444-4444-444444444444', 'Dadar Warriors', 'DW', 'Mumbai', '11111111-1111-1111-1111-111111111111'),
  ('55555555-5555-5555-5555-555555555555', 'Bandra Strikers', 'BS', 'Mumbai', '11111111-1111-1111-1111-111111111111'),
  ('66666666-6666-6666-6666-666666666666', 'Andheri Lions', 'AL', 'Mumbai', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO NOTHING;

-- 5. Tournament-Specific Team Registrations
INSERT INTO tournament_teams (id, tournament_id, team_id, group_name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 'Group A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', 'Group A')
ON CONFLICT (id) DO NOTHING;

-- 6. Independent Players (11 for Dadar Warriors, 11 for Bandra Strikers)
-- Dadar Warriors Players (prefix 1000... to 1011...)
INSERT INTO players (id, full_name, batting_style, bowling_style, primary_role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Rohit Varma', 'RIGHT_HAND_BAT', 'RIGHT_ARM_MEDIUM', 'BATTER'),
  ('10000000-0000-0000-0000-000000000002', 'Rahul Dravid Jr', 'RIGHT_HAND_BAT', 'NONE', 'BATTER'),
  ('10000000-0000-0000-0000-000000000003', 'Virat Kulkarni', 'RIGHT_HAND_BAT', 'RIGHT_ARM_MEDIUM', 'BATTER'),
  ('10000000-0000-0000-0000-000000000004', 'Shreyas Iyer', 'RIGHT_HAND_BAT', 'RIGHT_ARM_SPIN_OFF', 'BATTER'),
  ('10000000-0000-0000-0000-000000000005', 'Rishabh Kamat', 'LEFT_HAND_BAT', 'NONE', 'WICKET_KEEPER'),
  ('10000000-0000-0000-0000-000000000006', 'Hardik Patil', 'RIGHT_HAND_BAT', 'RIGHT_ARM_FAST', 'ALL_ROUNDER'),
  ('10000000-0000-0000-0000-000000000007', 'Ravindra Deshmukh', 'LEFT_HAND_BAT', 'LEFT_ARM_SPIN_ORTHODOX', 'ALL_ROUNDER'),
  ('10000000-0000-0000-0000-000000000008', 'Jasprit Bumrah', 'RIGHT_HAND_BAT', 'RIGHT_ARM_FAST', 'BOWLER'),
  ('10000000-0000-0000-0000-000000000009', 'Mohammed Shami', 'RIGHT_HAND_BAT', 'RIGHT_ARM_FAST', 'BOWLER'),
  ('10000000-0000-0000-0000-000000000010', 'Kuldeep Yadav', 'LEFT_HAND_BAT', 'LEFT_ARM_SPIN_CHINAMAN', 'BOWLER'),
  ('10000000-0000-0000-0000-000000000011', 'Yuzvendra Chahal', 'RIGHT_HAND_BAT', 'RIGHT_ARM_SPIN_LEG', 'BOWLER')
ON CONFLICT (id) DO NOTHING;

-- Bandra Strikers Players (prefix 2000... to 2011...)
INSERT INTO players (id, full_name, batting_style, bowling_style, primary_role) VALUES
  ('20000000-0000-0000-0000-000000000001', 'David Warner', 'LEFT_HAND_BAT', 'NONE', 'BATTER'),
  ('20000000-0000-0000-0000-000000000002', 'Travis Head', 'LEFT_HAND_BAT', 'RIGHT_ARM_SPIN_OFF', 'BATTER'),
  ('20000000-0000-0000-0000-000000000003', 'Steve Smith', 'RIGHT_HAND_BAT', 'RIGHT_ARM_SPIN_LEG', 'BATTER'),
  ('20000000-0000-0000-0000-000000000004', 'Glenn Maxwell', 'RIGHT_HAND_BAT', 'RIGHT_ARM_SPIN_OFF', 'ALL_ROUNDER'),
  ('20000000-0000-0000-0000-000000000005', 'Marcus Stoinis', 'RIGHT_HAND_BAT', 'RIGHT_ARM_MEDIUM', 'ALL_ROUNDER'),
  ('20000000-0000-0000-0000-000000000006', 'Alex Carey', 'LEFT_HAND_BAT', 'NONE', 'WICKET_KEEPER'),
  ('20000000-0000-0000-0000-000000000007', 'Pat Cummins', 'RIGHT_HAND_BAT', 'RIGHT_ARM_FAST', 'ALL_ROUNDER'),
  ('20000000-0000-0000-0000-000000000008', 'Mitchell Starc', 'LEFT_HAND_BAT', 'LEFT_ARM_FAST', 'BOWLER'),
  ('20000000-0000-0000-0000-000000000009', 'Josh Hazlewood', 'RIGHT_HAND_BAT', 'RIGHT_ARM_FAST', 'BOWLER'),
  ('20000000-0000-0000-0000-000000000010', 'Adam Zampa', 'RIGHT_HAND_BAT', 'RIGHT_ARM_SPIN_LEG', 'BOWLER'),
  ('20000000-0000-0000-0000-000000000011', 'Nathan Lyon', 'RIGHT_HAND_BAT', 'RIGHT_ARM_SPIN_OFF', 'BOWLER')
ON CONFLICT (id) DO NOTHING;

-- 7. Team Rosters
-- Register Dadar Warriors
INSERT INTO team_rosters (tournament_team_id, player_id, jersey_number, is_captain, is_wicket_keeper) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000001', 45, TRUE, FALSE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000002', 1, FALSE, FALSE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000003', 18, FALSE, FALSE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000004', 96, FALSE, FALSE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000005', 17, FALSE, TRUE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000006', 33, FALSE, FALSE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000007', 8, FALSE, FALSE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000008', 93, FALSE, FALSE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000009', 11, FALSE, FALSE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000010', 23, FALSE, FALSE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000011', 3, FALSE, FALSE)
ON CONFLICT (tournament_team_id, player_id) DO NOTHING;

-- Register Bandra Strikers
INSERT INTO team_rosters (tournament_team_id, player_id, jersey_number, is_captain, is_wicket_keeper) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000001', 31, FALSE, FALSE),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000002', 62, FALSE, FALSE),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000003', 49, FALSE, FALSE),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000004', 32, FALSE, FALSE),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000005', 17, FALSE, FALSE),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000006', 4, FALSE, TRUE),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000007', 30, TRUE, FALSE),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000008', 56, FALSE, FALSE),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000009', 38, FALSE, FALSE),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000010', 88, FALSE, FALSE),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000011', 67, FALSE, FALSE)
ON CONFLICT (tournament_team_id, player_id) DO NOTHING;

-- 8. Venue
INSERT INTO venues (id, tournament_id, name, ground_name, city, address) VALUES (
  '77777777-7777-7777-7777-777777777777',
  '33333333-3333-3333-3333-333333333333',
  'Shivaji Park Cricket Ground',
  'Pitch #2 (Center)',
  'Mumbai',
  'Dadar West, Mumbai, Maharashtra 400028'
) ON CONFLICT (id) DO NOTHING;

-- 9. Match
INSERT INTO matches (
  id, tournament_id, venue_id, team_a_id, team_b_id,
  match_number, stage, scheduled_start_time, overs_quota,
  toss_winner_team_id, toss_decision, status
) VALUES (
  '88888888-8888-8888-8888-888888888888',
  '33333333-3333-3333-3333-333333333333',
  '77777777-7777-7777-7777-777777777777',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  1,
  'LEAGUE',
  NOW(),
  20,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'BAT',
  'IN_PROGRESS'
) ON CONFLICT (id) DO NOTHING;

-- 10. Match Scorer Assignment
INSERT INTO match_scorers (match_id, user_id) VALUES (
  '88888888-8888-8888-8888-888888888888',
  '22222222-2222-2222-2222-222222222222'
) ON CONFLICT (match_id, user_id) DO NOTHING;

-- 11. Playing XI for Dadar Warriors
INSERT INTO match_players (match_id, tournament_team_id, player_id, is_playing_xi, is_captain, is_wicket_keeper) VALUES
  ('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000001', TRUE, TRUE, FALSE),
  ('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000002', TRUE, FALSE, FALSE),
  ('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000003', TRUE, FALSE, FALSE),
  ('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000004', TRUE, FALSE, FALSE),
  ('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000005', TRUE, FALSE, TRUE),
  ('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000006', TRUE, FALSE, FALSE),
  ('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000007', TRUE, FALSE, FALSE),
  ('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000008', TRUE, FALSE, FALSE),
  ('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000009', TRUE, FALSE, FALSE),
  ('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000010', TRUE, FALSE, FALSE),
  ('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000011', TRUE, FALSE, FALSE)
ON CONFLICT (match_id, player_id) DO NOTHING;

-- Playing XI for Bandra Strikers
INSERT INTO match_players (match_id, tournament_team_id, player_id, is_playing_xi, is_captain, is_wicket_keeper) VALUES
  ('88888888-8888-8888-8888-888888888888', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000001', TRUE, FALSE, FALSE),
  ('88888888-8888-8888-8888-888888888888', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000002', TRUE, FALSE, FALSE),
  ('88888888-8888-8888-8888-888888888888', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000003', TRUE, FALSE, FALSE),
  ('88888888-8888-8888-8888-888888888888', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000004', TRUE, FALSE, FALSE),
  ('88888888-8888-8888-8888-888888888888', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000005', TRUE, FALSE, FALSE),
  ('88888888-8888-8888-8888-888888888888', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000006', TRUE, FALSE, TRUE),
  ('88888888-8888-8888-8888-888888888888', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000007', TRUE, TRUE, FALSE),
  ('88888888-8888-8888-8888-888888888888', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000008', TRUE, FALSE, FALSE),
  ('88888888-8888-8888-8888-888888888888', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000009', TRUE, FALSE, FALSE),
  ('88888888-8888-8888-8888-888888888888', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000010', TRUE, FALSE, FALSE),
  ('88888888-8888-8888-8888-888888888888', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000011', TRUE, FALSE, FALSE)
ON CONFLICT (match_id, player_id) DO NOTHING;

-- 12. Innings 1 (Dadar Warriors Batting, Bandra Strikers Bowling)
INSERT INTO innings (
  id, match_id, innings_number, batting_team_id, bowling_team_id,
  total_runs, total_wickets, total_legal_balls, total_extras, status,
  current_striker_id, current_non_striker_id, current_bowler_id, started_at
) VALUES (
  '99999999-9999-9999-9999-999999999999',
  '88888888-8888-8888-8888-888888888888',
  1,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  0, 0, 0, 0, 'IN_PROGRESS',
  '10000000-0000-0000-0000-000000000001', -- Rohit Varma
  '10000000-0000-0000-0000-000000000002', -- Rahul Dravid Jr
  '20000000-0000-0000-0000-000000000008', -- Mitchell Starc
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- 13. Over 1
INSERT INTO overs (
  id, innings_id, over_number, bowler_id,
  legal_balls, total_runs_conceded, wickets_taken, is_maiden, is_completed
) VALUES (
  'aaaaaaaa-1111-aaaa-1111-aaaaaaaaaaaa',
  '99999999-9999-9999-9999-999999999999',
  1,
  '20000000-0000-0000-0000-000000000008', -- Mitchell Starc
  0, 0, 0, FALSE, FALSE
) ON CONFLICT (id) DO NOTHING;

-- 14. Initial Batting & Bowling Performances for Innings 1
INSERT INTO batting_performances (innings_id, player_id, batting_order) VALUES
  ('99999999-9999-9999-9999-999999999999', '10000000-0000-0000-0000-000000000001', 1),
  ('99999999-9999-9999-9999-999999999999', '10000000-0000-0000-0000-000000000002', 2)
ON CONFLICT (innings_id, player_id) DO NOTHING;

INSERT INTO bowling_performances (innings_id, player_id, bowling_order) VALUES
  ('99999999-9999-9999-9999-999999999999', '20000000-0000-0000-0000-000000000008', 1)
ON CONFLICT (innings_id, player_id) DO NOTHING;

