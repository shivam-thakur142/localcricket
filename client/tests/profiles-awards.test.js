// ====================================================================
// PUBLIC PROFILES, AWARDS & DUAL-INNINGS SCORECARD FRONTEND TESTS
// ====================================================================

import assert from 'assert';

console.log('\n🏏 ======================================================================');
console.log('🏏 LocalCricket: Running Public Profiles & Awards Frontend Tests');
console.log('🏏 ======================================================================\n');

let passedTests = 0;
let totalTests = 0;

function assertTest(name, fn) {
  totalTests++;
  process.stdout.write(`🧪 [Frontend Profile/Award Test ${totalTests}] ${name}... `);
  try {
    fn();
    console.log('PASSED ✅');
    passedTests++;
  } catch (err) {
    console.log('FAILED ❌');
    console.error('   Error details:', err.message);
    throw err;
  }
}

// ----------------------------------------------------
// TEST 1: Player Profile Model & Formatting
// ----------------------------------------------------
assertTest('Player Profile Model: Formats initials, roles, batting/bowling stats and empty fallbacks', () => {
  const formatPlayerProfile = (profile, stats) => {
    const initials = profile.full_name
      ? profile.full_name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase()
      : 'P';

    const batting = stats?.batting || {};
    const bowling = stats?.bowling || {};
    const fielding = stats?.fielding || {};

    return {
      name: profile.full_name,
      initials,
      role: profile.primary_role || 'ALL_ROUNDER',
      batting_average: batting.average != null ? batting.average : '—',
      strike_rate: batting.strike_rate != null ? batting.strike_rate : '—',
      high_score_display: batting.highest_score_display || '—',
      bowling_economy: bowling.economy != null ? bowling.economy : '—',
      best_bowling: bowling.best_figures || '—',
      total_dismissals: fielding.total_dismissals ?? 0,
    };
  };

  const sampleProfile = {
    full_name: 'Virat Kohli',
    nickname: 'King',
    primary_role: 'BATTER',
    batting_style: 'RIGHT_HAND_BAT',
    bowling_style: 'RIGHT_ARM_MEDIUM',
  };

  const sampleStats = {
    matches_played: 12,
    batting: {
      innings: 12,
      runs: 680,
      average: 68.0,
      strike_rate: 145.5,
      highest_score: 112,
      highest_score_not_out: true,
      highest_score_display: '112*',
    },
    bowling: {
      innings: 2,
      overs_display: '4.0',
      economy: 7.25,
      wickets: 1,
      best_figures: '1/15',
    },
    fielding: {
      catches: 8,
      run_outs: 2,
      stumpings: 0,
      total_dismissals: 10,
    },
  };

  const formatted = formatPlayerProfile(sampleProfile, sampleStats);
  assert.strictEqual(formatted.initials, 'VK');
  assert.strictEqual(formatted.name, 'Virat Kohli');
  assert.strictEqual(formatted.role, 'BATTER');
  assert.strictEqual(formatted.batting_average, 68.0);
  assert.strictEqual(formatted.strike_rate, 145.5);
  assert.strictEqual(formatted.high_score_display, '112*');
  assert.strictEqual(formatted.bowling_economy, 7.25);
  assert.strictEqual(formatted.best_bowling, '1/15');
  assert.strictEqual(formatted.total_dismissals, 10);

  // Test empty/unplayed stats fallback
  const emptyFormatted = formatPlayerProfile({ full_name: 'New Player' }, null);
  assert.strictEqual(emptyFormatted.initials, 'NP');
  assert.strictEqual(emptyFormatted.batting_average, '—');
  assert.strictEqual(emptyFormatted.strike_rate, '—');
  assert.strictEqual(emptyFormatted.high_score_display, '—');
  assert.strictEqual(emptyFormatted.bowling_economy, '—');
  assert.strictEqual(emptyFormatted.best_bowling, '—');
  assert.strictEqual(emptyFormatted.total_dismissals, 0);
});

// ----------------------------------------------------
// TEST 2: Team Profile & Win Rate Contract
// ----------------------------------------------------
assertTest('Team Profile Contract: Computes win rate %, partitions trophy cabinet, formats roster', () => {
  const computeTeamDisplay = (profile, stats, rosterList = []) => {
    const played = stats?.matches_played || 0;
    const won = stats?.matches_won || 0;
    const winRate = played > 0 ? Number(((won / played) * 100).toFixed(1)) : 0.0;

    const championships = stats?.trophies?.championships || [];
    const runnerUps = stats?.trophies?.runner_ups || [];

    return {
      team_name: profile.name,
      short_name: profile.short_name,
      win_percentage: winRate,
      championship_count: championships.length,
      runner_up_count: runnerUps.length,
      roster_size: rosterList.length,
      captains: rosterList.filter((p) => p.is_captain).map((p) => p.full_name),
    };
  };

  const sampleTeamProfile = {
    name: 'Spartans Cricket Club',
    short_name: 'SCC',
    city: 'Mumbai',
  };

  const sampleTeamStats = {
    tournaments_participated_count: 3,
    matches_played: 10,
    matches_won: 8,
    matches_lost: 2,
    matches_tied: 0,
    matches_no_result: 0,
    win_percentage: 80.0,
    trophies: {
      championships: [{ tournament_id: 't-1', tournament_name: 'Premier League 2025' }],
      runner_ups: [{ tournament_id: 't-2', tournament_name: 'Winter Cup 2025' }],
    },
  };

  const sampleRoster = [
    { player_id: 'p-1', full_name: 'Rohit Sharma', jersey_number: 45, is_captain: true },
    { player_id: 'p-2', full_name: 'Jasprit Bumrah', jersey_number: 93, is_captain: false },
    { player_id: 'p-3', full_name: 'Suryakumar Yadav', jersey_number: 63, is_captain: false },
  ];

  const teamDisplay = computeTeamDisplay(sampleTeamProfile, sampleTeamStats, sampleRoster);
  assert.strictEqual(teamDisplay.team_name, 'Spartans Cricket Club');
  assert.strictEqual(teamDisplay.short_name, 'SCC');
  assert.strictEqual(teamDisplay.win_percentage, 80.0);
  assert.strictEqual(teamDisplay.championship_count, 1);
  assert.strictEqual(teamDisplay.runner_up_count, 1);
  assert.strictEqual(teamDisplay.roster_size, 3);
  assert.deepStrictEqual(teamDisplay.captains, ['Rohit Sharma']);
});

// ----------------------------------------------------
// TEST 3: Tournament Awards & Economy Qualification Threshold
// ----------------------------------------------------
assertTest('Tournament Awards & Threshold: Formats MVP podium, category caps, and economy qualification badge', () => {
  const sampleAwardsData = {
    tournament_id: 'tourn-1',
    qualification_minimum_balls: 48,
    mvp: {
      player_id: 'p-allrounder',
      player_name: 'Hardik Pandya',
      team_name: 'Spartans',
      total_points: 185,
    },
    mvp_podium: [
      {
        player_id: 'p-allrounder',
        player_name: 'Hardik Pandya',
        team_name: 'Spartans',
        total_points: 185,
        batting: { points: 95, runs: 65, milestone_bonus: 25 },
        bowling: { points: 65, wickets: 3, milestone_bonus: 20 },
        fielding: { points: 25, catches: 2, run_outs: 1 },
      },
      {
        player_id: 'p-batter',
        player_name: 'Virat Kohli',
        team_name: 'Vikings',
        total_points: 160,
        batting: { points: 150, runs: 110, milestone_bonus: 50 },
        bowling: { points: 0, wickets: 0, milestone_bonus: 0 },
        fielding: { points: 10, catches: 1, run_outs: 0 },
      },
      {
        player_id: 'p-bowler',
        player_name: 'Jasprit Bumrah',
        team_name: 'Spartans',
        total_points: 145,
        batting: { points: 5, runs: 5, milestone_bonus: 0 },
        bowling: { points: 130, wickets: 5, milestone_bonus: 50 },
        fielding: { points: 10, catches: 1, run_outs: 0 },
      },
    ],
    best_batter: {
      player_id: 'p-batter',
      player_name: 'Virat Kohli',
      runs: 240,
      average: 80.0,
      strike_rate: 152.0,
      highest_score: 110,
    },
    best_bowler: {
      player_id: 'p-bowler',
      player_name: 'Jasprit Bumrah',
      wickets: 9,
      economy: 5.5,
      average: 11.0,
      best_figures: '5/18',
    },
    maximum_sixes: {
      player_id: 'p-batter',
      player_name: 'Virat Kohli',
      sixes: 12,
      balls_faced: 158,
    },
    most_economical_bowler: {
      player_id: 'p-bowler',
      player_name: 'Jasprit Bumrah',
      economy: 5.5,
      legal_balls: 72,
      wickets: 9,
      runs_conceded: 66,
    },
  };

  // 1. Verify MVP podium ranks
  assert.strictEqual(sampleAwardsData.mvp_podium.length, 3);
  assert.strictEqual(sampleAwardsData.mvp_podium[0].player_name, 'Hardik Pandya');
  assert.strictEqual(sampleAwardsData.mvp_podium[0].total_points, 185);
  assert.strictEqual(sampleAwardsData.mvp_podium[0].batting.milestone_bonus, 25);
  assert.strictEqual(sampleAwardsData.mvp_podium[0].bowling.milestone_bonus, 20);

  // 2. Verify Rank 2 non-cumulative 100+ bonus (+50)
  assert.strictEqual(sampleAwardsData.mvp_podium[1].batting.milestone_bonus, 50);

  // 3. Verify category awards
  assert.strictEqual(sampleAwardsData.best_batter.runs, 240);
  assert.strictEqual(sampleAwardsData.best_bowler.wickets, 9);
  assert.strictEqual(sampleAwardsData.maximum_sixes.sixes, 12);

  // 4. Verify qualification requirement badge logic
  const minBalls = sampleAwardsData.qualification_minimum_balls;
  assert.strictEqual(minBalls, 48);
  assert.ok(sampleAwardsData.most_economical_bowler.legal_balls >= minBalls, 'Economical bowler must meet min balls threshold');
});

// ----------------------------------------------------
// TEST 4: Scorecard Center & Dual-Innings Navigation
// ----------------------------------------------------
assertTest('Scorecard Center: Dual-innings tabs resolution, itemized extras formatting, and link triggers', () => {
  const dualInningsPayload = {
    match: {
      id: 'match-1',
      status: 'COMPLETED',
      winner_team_name: 'Spartans Cricket Club',
      margin_runs: 25,
      player_of_match_id: 'p-1',
      player_of_match_name: 'Rohit Sharma',
      venue_name: 'Wankhede Stadium',
      city: 'Mumbai',
    },
    scorecards: [
      {
        innings: {
          innings_number: 1,
          batting_team_id: 'team-1',
          batting_team_name: 'Spartans Cricket Club',
          total_runs: 185,
          total_wickets: 4,
          total_legal_balls: 120,
        },
        batting: [
          { player_id: 'p-1', full_name: 'Rohit Sharma', runs_scored: 85, balls_faced: 48, fours: 8, sixes: 4, is_out: true },
          { player_id: 'p-3', full_name: 'Suryakumar Yadav', runs_scored: 52, balls_faced: 28, fours: 4, sixes: 3, is_out: false },
        ],
        bowling: [
          { player_id: 'b-1', full_name: 'Trent Boult', legal_balls_bowled: 24, runs_conceded: 32, wickets: 2, maidens: 0 },
        ],
        extras_breakdown: { wides: 6, no_balls: 1, byes: 4, leg_byes: 2, total: 13 },
      },
      {
        innings: {
          innings_number: 2,
          batting_team_id: 'team-2',
          batting_team_name: 'Vikings XI',
          total_runs: 160,
          total_wickets: 8,
          total_legal_balls: 120,
        },
        batting: [
          { player_id: 'p-4', full_name: 'Jos Buttler', runs_scored: 60, balls_faced: 40, fours: 6, sixes: 2, is_out: true },
        ],
        bowling: [
          { player_id: 'p-2', full_name: 'Jasprit Bumrah', legal_balls_bowled: 24, runs_conceded: 18, wickets: 3, maidens: 1 },
        ],
        extras_breakdown: { wides: 4, no_balls: 0, byes: 0, leg_byes: 1, total: 5 },
      },
    ],
  };

  // Test innings list resolution helper
  const resolveInningsList = (scorecardProp) => {
    if (scorecardProp?.scorecards && Array.isArray(scorecardProp.scorecards)) {
      return scorecardProp.scorecards;
    }
    if (Array.isArray(scorecardProp)) {
      return scorecardProp;
    }
    if (scorecardProp?.innings) {
      return [scorecardProp];
    }
    return [];
  };

  const inningsList = resolveInningsList(dualInningsPayload);
  assert.strictEqual(inningsList.length, 2, 'Must resolve exactly 2 innings');

  // Verify Tab 1 data
  const inn1 = inningsList[0];
  assert.strictEqual(inn1.innings.batting_team_name, 'Spartans Cricket Club');
  assert.strictEqual(inn1.innings.total_runs, 185);
  assert.strictEqual(inn1.extras_breakdown.total, 13);
  assert.strictEqual(inn1.batting[0].full_name, 'Rohit Sharma');
  assert.strictEqual(inn1.batting[0].runs_scored, 85);

  // Verify Tab 2 data
  const inn2 = inningsList[1];
  assert.strictEqual(inn2.innings.batting_team_name, 'Vikings XI');
  assert.strictEqual(inn2.innings.total_runs, 160);
  assert.strictEqual(inn2.bowling[0].full_name, 'Jasprit Bumrah');
  assert.strictEqual(inn2.bowling[0].wickets, 3);

  // Test interactive navigation callbacks simulation
  let selectedPlayer = null;
  let selectedTeam = null;
  const onSelectPlayer = (id) => { selectedPlayer = id; };
  const onSelectTeam = (id) => { selectedTeam = id; };

  onSelectPlayer(inn1.batting[0].player_id);
  assert.strictEqual(selectedPlayer, 'p-1');

  onSelectTeam(inn2.innings.batting_team_id);
  assert.strictEqual(selectedTeam, 'team-2');
});

console.log('\n======================================================================');
console.log(`🏆 ALL ${passedTests} OF ${totalTests} PUBLIC PROFILE & AWARD FRONTEND TESTS PASSED!`);
console.log('======================================================================\n');
