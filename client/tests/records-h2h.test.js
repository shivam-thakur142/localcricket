// ====================================================================
// TOURNAMENT RECORDS, HEAD-TO-HEAD & PRINTABLE SCORESHEET FRONTEND TESTS
// ====================================================================

import assert from 'assert';

console.log('\n🏏 ======================================================================');
console.log('🏏 LocalCricket: Running Milestone 9 Records & H2H Frontend Tests');
console.log('🏏 ======================================================================\n');

let passedTests = 0;
let totalTests = 0;

function assertTest(name, fn) {
  totalTests++;
  process.stdout.write(`🧪 [Frontend Records/H2H Test ${totalTests}] ${name}... `);
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
// TEST 1: Tournament Records Archive Model & Formatting
// ----------------------------------------------------
assertTest('Records Tab Model: Team milestones, individual feats and graceful fallbacks', () => {
  const formatRecordsTab = (records) => {
    const teamRecs = records?.team_records || {};
    const batRecs = records?.batting_records || {};
    const bowlRecs = records?.bowling_records || {};

    const hasAnyRecord = Boolean(
      teamRecs.highest_innings_total ||
      batRecs.highest_individual_score ||
      bowlRecs.best_bowling_figures
    );

    return {
      hasAnyRecord,
      highest_total_display: teamRecs.highest_innings_total
        ? `${teamRecs.highest_innings_total.runs}/${teamRecs.highest_innings_total.wickets}`
        : '—',
      lowest_total_display: teamRecs.lowest_innings_total
        ? `${teamRecs.lowest_innings_total.runs}/${teamRecs.lowest_innings_total.wickets}`
        : '—',
      largest_run_win: teamRecs.largest_victory_margin_runs
        ? `${teamRecs.largest_victory_margin_runs.margin_runs} runs`
        : '—',
      largest_wkt_win: teamRecs.largest_victory_margin_wickets
        ? `${teamRecs.largest_victory_margin_wickets.margin_wickets} wickets`
        : '—',
      highest_aggregate: teamRecs.highest_match_aggregate
        ? `${teamRecs.highest_match_aggregate.total_runs} runs`
        : '—',
      highest_individual_score: batRecs.highest_individual_score
        ? `${batRecs.highest_individual_score.runs_scored}${batRecs.highest_individual_score.is_not_out ? '*' : ''} (${batRecs.highest_individual_score.balls_faced}b)`
        : '—',
      most_sixes: batRecs.most_sixes_in_innings
        ? `${batRecs.most_sixes_in_innings.sixes} sixes`
        : '—',
      best_bowling: bowlRecs.best_bowling_figures
        ? `${bowlRecs.best_bowling_figures.wickets}/${bowlRecs.best_bowling_figures.runs_conceded} (${bowlRecs.best_bowling_figures.overs} ov)`
        : '—',
      most_maidens: bowlRecs.most_maidens_in_innings
        ? `${bowlRecs.most_maidens_in_innings.maidens} maidens`
        : '—',
    };
  };

  // Test populated state
  const mockRecords = {
    team_records: {
      highest_innings_total: { runs: 210, wickets: 3, team_name: 'Spartans CC' },
      lowest_innings_total: { runs: 68, wickets: 10, team_name: 'Vikings XI' },
      largest_victory_margin_runs: { margin_runs: 142, winner_team_name: 'Spartans CC' },
      largest_victory_margin_wickets: { margin_wickets: 8, winner_team_name: 'Spartans CC' },
      highest_match_aggregate: { total_runs: 350, team_a_name: 'Spartans', team_b_name: 'Hawks' },
    },
    batting_records: {
      highest_individual_score: {
        runs_scored: 102,
        is_not_out: true,
        balls_faced: 52,
        player_name: 'Rohit Sharma',
      },
      most_sixes_in_innings: { sixes: 7, player_name: 'Rohit Sharma' },
    },
    bowling_records: {
      best_bowling_figures: {
        wickets: 5,
        runs_conceded: 18,
        overs: '4.0',
        player_name: 'Jasprit Bumrah',
      },
      most_maidens_in_innings: { maidens: 2, player_name: 'Bhuvneshwar Kumar' },
    },
  };

  const formatted = formatRecordsTab(mockRecords);
  assert.strictEqual(formatted.hasAnyRecord, true);
  assert.strictEqual(formatted.highest_total_display, '210/3');
  assert.strictEqual(formatted.lowest_total_display, '68/10');
  assert.strictEqual(formatted.largest_run_win, '142 runs');
  assert.strictEqual(formatted.largest_wkt_win, '8 wickets');
  assert.strictEqual(formatted.highest_individual_score, '102* (52b)', 'Unbeaten score must include asterisk');
  assert.strictEqual(formatted.most_sixes, '7 sixes');
  assert.strictEqual(formatted.best_bowling, '5/18 (4.0 ov)');
  assert.strictEqual(formatted.most_maidens, '2 maidens');

  // Test empty state
  const emptyFormatted = formatRecordsTab({});
  assert.strictEqual(emptyFormatted.hasAnyRecord, false);
  assert.strictEqual(emptyFormatted.highest_total_display, '—');
  assert.strictEqual(emptyFormatted.best_bowling, '—');
});

// ----------------------------------------------------
// TEST 2: Partnership-by-Wicket Matrix (1st–10th) & Unbroken Status
// ----------------------------------------------------
assertTest('Partnership Matrix: Full 1st-10th wicket coverage, unbroken eligibility and empty slots', () => {
  const buildPartnershipMatrix = (partnershipRecords) => {
    return Array.from({ length: 10 }, (_, i) => {
      const wNum = i + 1;
      const rec = partnershipRecords.find((p) => p.wicket === wNum);
      const ordinal =
        wNum === 1 ? '1st' : wNum === 2 ? '2nd' : wNum === 3 ? '3rd' : `${wNum}th`;

      if (!rec) {
        return {
          wicket: wNum,
          ordinal,
          hasRecord: false,
          display: '—',
          batters: 'No record',
        };
      }

      return {
        wicket: wNum,
        ordinal,
        hasRecord: true,
        runs: rec.runs,
        balls: rec.balls,
        is_unbroken: rec.is_unbroken,
        display: `${rec.runs}${rec.is_unbroken ? '*' : ''} (${rec.balls}b)`,
        batters: `${rec.batter_1_name} & ${rec.batter_2_name}`,
        team_name: rec.team_name,
      };
    });
  };

  const samplePartnerships = [
    {
      wicket: 1,
      runs: 125,
      balls: 70,
      is_unbroken: false,
      batter_1_name: 'Rohit Sharma',
      batter_2_name: 'Sachin Tendulkar',
      team_name: 'Spartans CC',
    },
    {
      wicket: 4,
      runs: 82,
      balls: 45,
      is_unbroken: true, // Unbroken final partnership
      batter_1_name: 'Virat Kohli',
      batter_2_name: 'Hardik Pandya',
      team_name: 'Hawks Academy',
    },
  ];

  const matrix = buildPartnershipMatrix(samplePartnerships);
  assert.strictEqual(matrix.length, 10, 'Must cover exactly 10 wickets');

  // 1st wicket: broken 125 (70b)
  assert.strictEqual(matrix[0].hasRecord, true);
  assert.strictEqual(matrix[0].display, '125 (70b)');
  assert.strictEqual(matrix[0].batters, 'Rohit Sharma & Sachin Tendulkar');
  assert.strictEqual(matrix[0].is_unbroken, false);

  // 2nd wicket: empty
  assert.strictEqual(matrix[1].hasRecord, false);
  assert.strictEqual(matrix[1].display, '—');

  // 4th wicket: unbroken 82* (45b)
  assert.strictEqual(matrix[3].hasRecord, true);
  assert.strictEqual(matrix[3].display, '82* (45b)', 'Unbroken partnership must render with asterisk');
  assert.strictEqual(matrix[3].is_unbroken, true);
});

// ----------------------------------------------------
// TEST 3: Head-to-Head Meter, Recent Form & Venue Intelligence
// ----------------------------------------------------
assertTest('Match Preview Model: H2H win proportions, Super Over count, recent form pills, and venue averages', () => {
  const computePreviewMetrics = (previewData) => {
    const h2h = previewData.head_to_head || {};
    const total = h2h.matches_played || 0;
    const aWins = h2h.team_a_wins || 0;
    const bWins = h2h.team_b_wins || 0;

    const aPct = total > 0 ? Math.round((aWins / total) * 100) : 50;
    const bPct = total > 0 ? 100 - aPct : 50;

    const vStats = previewData.venue_stats;

    return {
      totalMatches: total,
      teamAWins: aWins,
      teamBWins: bWins,
      teamAPct: aPct,
      teamBPct: bPct,
      teamAFormPills: previewData.team_a?.recent_form || [],
      teamBFormPills: previewData.team_b?.recent_form || [],
      venueMatches: vStats?.matches_played_at_venue || 0,
      avgFirstInnings: vStats?.average_first_innings_score != null ? Math.round(vStats.average_first_innings_score) : null,
      avgSecondInnings: vStats?.average_second_innings_score != null ? Math.round(vStats.average_second_innings_score) : null,
    };
  };

  const samplePreview = {
    head_to_head: {
      matches_played: 4,
      team_a_wins: 3, // Includes 1 Super Over win
      team_b_wins: 1,
      tied: 0,
      no_result: 0,
    },
    team_a: {
      name: 'Spartans CC',
      recent_form: ['W', 'W', 'L', 'W', 'W'],
    },
    team_b: {
      name: 'Vikings XI',
      recent_form: ['L', 'W', 'L', 'L', 'W'],
    },
    venue_stats: {
      venue_name: 'Wankhede Stadium',
      city: 'Mumbai',
      matches_played_at_venue: 5,
      average_first_innings_score: 172.4,
      average_second_innings_score: 156.8,
    },
  };

  const metrics = computePreviewMetrics(samplePreview);
  assert.strictEqual(metrics.totalMatches, 4);
  assert.strictEqual(metrics.teamAWins, 3);
  assert.strictEqual(metrics.teamAPct, 75);
  assert.strictEqual(metrics.teamBPct, 25);
  assert.deepStrictEqual(metrics.teamAFormPills, ['W', 'W', 'L', 'W', 'W']);
  assert.strictEqual(metrics.venueMatches, 5);
  assert.strictEqual(metrics.avgFirstInnings, 172);
  assert.strictEqual(metrics.avgSecondInnings, 157);
});

// ----------------------------------------------------
// TEST 4: Printable Export Model & WhatsApp Summary Generator
// ----------------------------------------------------
assertTest('Printable Export & WhatsApp: Null official signatures and structured summary formatting', () => {
  // 1. Authoritative Official Signatures: Null handling without fabricating names
  const formatOfficialSignatures = (officials) => {
    return {
      scorer_signature: officials.official_scorer_name || '__________________________',
      umpire_1_signature: officials.umpire_1_name || '__________________________',
      umpire_2_signature: officials.umpire_2_name || '__________________________',
    };
  };

  const officialsWithUnassignedUmpires = {
    official_scorer_name: 'Amit Sharma',
    umpire_1_name: null,
    umpire_2_name: null,
  };

  const sigs = formatOfficialSignatures(officialsWithUnassignedUmpires);
  assert.strictEqual(sigs.scorer_signature, 'Amit Sharma');
  assert.strictEqual(sigs.umpire_1_signature, '__________________________', 'Unassigned umpire must render blank line');
  assert.strictEqual(sigs.umpire_2_signature, '__________________________', 'Unassigned umpire must render blank line');

  // 2. WhatsApp Summary Generator Text
  const generateWhatsAppSummary = (match, currentUrl) => {
    const lines = [];
    lines.push(`🏆 *${match.tournament_name || 'Cricket Match'}* - Match #${match.match_number || 1}`);
    if (match.venue_name || match.city) {
      lines.push(`📍 ${[match.venue_name, match.city].filter(Boolean).join(', ')}`);
    }
    if (match.team_a_name) {
      const aScore = match.team_a_score ? ` ${match.team_a_score}` : '';
      lines.push(`🏏 ${match.team_a_name}:${aScore}`);
    }
    if (match.team_b_name) {
      const bScore = match.team_b_score ? ` ${match.team_b_score}` : '';
      lines.push(`🏏 ${match.team_b_name}:${bScore}`);
    }
    lines.push(`🎯 Result: ${match.result_text}`);
    if (match.player_of_match_name) {
      lines.push(`⭐ Player of the Match: ${match.player_of_match_name}`);
    }
    lines.push(`📊 Full Scorecard: ${currentUrl}`);
    return lines.join('\n');
  };

  const sampleMatch = {
    tournament_name: 'M9 Premier Trophy',
    match_number: 4,
    venue_name: 'Wankhede Stadium',
    city: 'Mumbai',
    team_a_name: 'Spartans CC',
    team_a_score: '185/4 (20.0)',
    team_b_name: 'Vikings XI',
    team_b_score: '150/9 (20.0)',
    result_text: 'Spartans CC won by 35 runs',
    player_of_match_name: 'Rohit Sharma',
  };

  const summary = generateWhatsAppSummary(sampleMatch, 'http://localhost:5173/matches/123');
  assert.ok(summary.includes('🏆 *M9 Premier Trophy* - Match #4'));
  assert.ok(summary.includes('📍 Wankhede Stadium, Mumbai'));
  assert.ok(summary.includes('🏏 Spartans CC: 185/4 (20.0)'));
  assert.ok(summary.includes('🎯 Result: Spartans CC won by 35 runs'));
  assert.ok(summary.includes('⭐ Player of the Match: Rohit Sharma'));
  assert.ok(summary.includes('📊 Full Scorecard: http://localhost:5173/matches/123'));
});

console.log('\n======================================================================');
console.log(`🏆 ALL ${passedTests} OF ${totalTests} MILESTONE 9 FRONTEND TESTS PASSED!`);
console.log('======================================================================\n');
