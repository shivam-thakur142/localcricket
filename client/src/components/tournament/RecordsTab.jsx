import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

export function RecordsTab({ tournamentId }) {
  const [records, setRecords] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchRecords() {
      if (!tournamentId) return;
      try {
        setLoading(true);
        setError(null);
        const res = await api.getTournamentRecords(tournamentId);
        if (isMounted) {
          setRecords(res?.data || null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load tournament records');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    fetchRecords();
    return () => {
      isMounted = false;
    };
  }, [tournamentId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mb-3"></div>
        <p className="text-sm font-medium">Crunching tournament records archive...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-900/20 border border-red-700/50 rounded-xl text-red-300 text-sm">
        <p className="font-semibold mb-1">Failed to load records</p>
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  const teamRecs = records?.team_records || {};
  const batRecs = records?.batting_records || {};
  const bowlRecs = records?.bowling_records || {};
  const partnerships = records?.partnership_records || [];

  const hasAnyRecord =
    teamRecs.highest_innings_total ||
    batRecs.highest_individual_score ||
    bowlRecs.best_bowling_figures;

  if (!hasAnyRecord) {
    return (
      <div className="p-8 text-center bg-gray-900/40 border border-gray-800 rounded-xl">
        <div className="text-4xl mb-3">📜</div>
        <h3 className="text-base font-semibold text-gray-200 mb-1">No Tournament Records Yet</h3>
        <p className="text-xs text-gray-400 max-w-md mx-auto">
          Tournament records are computed in real time from completed innings and match outcomes.
          Play official matches to establish historic milestones.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Team Milestones */}
      <div>
        <h3 className="text-sm font-semibold tracking-wider text-emerald-400 uppercase mb-3 flex items-center gap-2">
          <span>🏆</span> Team Milestones
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Highest Total */}
          <div className="bg-gray-800/80 border border-gray-700/70 rounded-xl p-4 shadow-sm hover:border-gray-600 transition-colors">
            <span className="text-xs text-gray-400 font-medium block mb-1">Highest Innings Total</span>
            {teamRecs.highest_innings_total ? (
              <div>
                <div className="text-2xl font-black text-emerald-400">
                  {teamRecs.highest_innings_total.runs}/{teamRecs.highest_innings_total.wickets}
                </div>
                <div className="text-sm font-semibold text-gray-200 mt-1">
                  {teamRecs.highest_innings_total.team_name}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  vs {teamRecs.highest_innings_total.opponent_name} • Match #{teamRecs.highest_innings_total.match_number}
                </div>
              </div>
            ) : (
              <span className="text-xs text-gray-500 italic">No record established</span>
            )}
          </div>

          {/* Lowest Total */}
          <div className="bg-gray-800/80 border border-gray-700/70 rounded-xl p-4 shadow-sm hover:border-gray-600 transition-colors">
            <span className="text-xs text-gray-400 font-medium block mb-1">Lowest Completed Total</span>
            {teamRecs.lowest_innings_total ? (
              <div>
                <div className="text-2xl font-black text-rose-400">
                  {teamRecs.lowest_innings_total.runs}/{teamRecs.lowest_innings_total.wickets}
                </div>
                <div className="text-sm font-semibold text-gray-200 mt-1">
                  {teamRecs.lowest_innings_total.team_name}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  vs {teamRecs.lowest_innings_total.opponent_name} • Match #{teamRecs.lowest_innings_total.match_number}
                </div>
              </div>
            ) : (
              <span className="text-xs text-gray-500 italic">No record established</span>
            )}
          </div>

          {/* Highest Aggregate */}
          <div className="bg-gray-800/80 border border-gray-700/70 rounded-xl p-4 shadow-sm hover:border-gray-600 transition-colors">
            <span className="text-xs text-gray-400 font-medium block mb-1">Highest Match Aggregate</span>
            {teamRecs.highest_match_aggregate ? (
              <div>
                <div className="text-2xl font-black text-indigo-400">
                  {teamRecs.highest_match_aggregate.total_runs} runs
                </div>
                <div className="text-sm font-semibold text-gray-200 mt-1">
                  {teamRecs.highest_match_aggregate.team_a_name} vs {teamRecs.highest_match_aggregate.team_b_name}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  Match #{teamRecs.highest_match_aggregate.match_number}
                </div>
              </div>
            ) : (
              <span className="text-xs text-gray-500 italic">No record established</span>
            )}
          </div>

          {/* Largest Win by Runs */}
          <div className="bg-gray-800/80 border border-gray-700/70 rounded-xl p-4 shadow-sm hover:border-gray-600 transition-colors">
            <span className="text-xs text-gray-400 font-medium block mb-1">Largest Victory (Runs)</span>
            {teamRecs.largest_victory_margin_runs ? (
              <div>
                <div className="text-2xl font-black text-amber-400">
                  {teamRecs.largest_victory_margin_runs.margin_runs} runs
                </div>
                <div className="text-sm font-semibold text-gray-200 mt-1">
                  {teamRecs.largest_victory_margin_runs.winner_team_name}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  vs {teamRecs.largest_victory_margin_runs.opponent_name} • Match #{teamRecs.largest_victory_margin_runs.match_number}
                </div>
              </div>
            ) : (
              <span className="text-xs text-gray-500 italic">No record established</span>
            )}
          </div>

          {/* Largest Win by Wickets */}
          <div className="bg-gray-800/80 border border-gray-700/70 rounded-xl p-4 shadow-sm hover:border-gray-600 transition-colors">
            <span className="text-xs text-gray-400 font-medium block mb-1">Largest Victory (Wickets)</span>
            {teamRecs.largest_victory_margin_wickets ? (
              <div>
                <div className="text-2xl font-black text-cyan-400">
                  {teamRecs.largest_victory_margin_wickets.margin_wickets} wickets
                </div>
                <div className="text-sm font-semibold text-gray-200 mt-1">
                  {teamRecs.largest_victory_margin_wickets.winner_team_name}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  vs {teamRecs.largest_victory_margin_wickets.opponent_name} • Match #{teamRecs.largest_victory_margin_wickets.match_number}
                </div>
              </div>
            ) : (
              <span className="text-xs text-gray-500 italic">No record established</span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Individual Feats (Batting & Bowling) */}
      <div>
        <h3 className="text-sm font-semibold tracking-wider text-emerald-400 uppercase mb-3 flex items-center gap-2">
          <span>⭐</span> Individual Feats
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Highest Score */}
          <div className="bg-gray-800/80 border border-gray-700/70 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-gray-400 font-medium block mb-1">Highest Individual Score</span>
            {batRecs.highest_individual_score ? (
              <div>
                <div className="text-2xl font-black text-amber-400">
                  {batRecs.highest_individual_score.runs_scored}
                  {batRecs.highest_individual_score.is_not_out ? '*' : ''}
                  <span className="text-xs text-gray-400 font-normal ml-1">
                    ({batRecs.highest_individual_score.balls_faced}b)
                  </span>
                </div>
                <div className="text-sm font-semibold text-gray-200 mt-1">
                  {batRecs.highest_individual_score.player_name}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {batRecs.highest_individual_score.team_name} • {batRecs.highest_individual_score.fours} 4s, {batRecs.highest_individual_score.sixes} 6s
                </div>
              </div>
            ) : (
              <span className="text-xs text-gray-500 italic">No record established</span>
            )}
          </div>

          {/* Most Sixes in Innings */}
          <div className="bg-gray-800/80 border border-gray-700/70 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-gray-400 font-medium block mb-1">Most Sixes in Innings</span>
            {batRecs.most_sixes_in_innings ? (
              <div>
                <div className="text-2xl font-black text-orange-400">
                  {batRecs.most_sixes_in_innings.sixes}{' '}
                  <span className="text-sm text-gray-300 font-medium">sixes</span>
                </div>
                <div className="text-sm font-semibold text-gray-200 mt-1">
                  {batRecs.most_sixes_in_innings.player_name}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {batRecs.most_sixes_in_innings.team_name} • {batRecs.most_sixes_in_innings.runs_scored} runs
                </div>
              </div>
            ) : (
              <span className="text-xs text-gray-500 italic">No record established</span>
            )}
          </div>

          {/* Best Bowling Spell */}
          <div className="bg-gray-800/80 border border-gray-700/70 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-gray-400 font-medium block mb-1">Best Bowling Figures</span>
            {bowlRecs.best_bowling_figures ? (
              <div>
                <div className="text-2xl font-black text-emerald-400">
                  {bowlRecs.best_bowling_figures.wickets}/{bowlRecs.best_bowling_figures.runs_conceded}
                  <span className="text-xs text-gray-400 font-normal ml-1">
                    ({bowlRecs.best_bowling_figures.overs} ov)
                  </span>
                </div>
                <div className="text-sm font-semibold text-gray-200 mt-1">
                  {bowlRecs.best_bowling_figures.player_name}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {bowlRecs.best_bowling_figures.team_name} • Econ: {bowlRecs.best_bowling_figures.economy_rate}
                </div>
              </div>
            ) : (
              <span className="text-xs text-gray-500 italic">No record established</span>
            )}
          </div>

          {/* Most Maidens */}
          <div className="bg-gray-800/80 border border-gray-700/70 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-gray-400 font-medium block mb-1">Most Maidens in Match</span>
            {bowlRecs.most_maidens_in_innings ? (
              <div>
                <div className="text-2xl font-black text-teal-400">
                  {bowlRecs.most_maidens_in_innings.maidens}{' '}
                  <span className="text-sm text-gray-300 font-medium">maidens</span>
                </div>
                <div className="text-sm font-semibold text-gray-200 mt-1">
                  {bowlRecs.most_maidens_in_innings.player_name}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {bowlRecs.most_maidens_in_innings.team_name} • {bowlRecs.most_maidens_in_innings.wickets}/{bowlRecs.most_maidens_in_innings.runs_conceded}
                </div>
              </div>
            ) : (
              <span className="text-xs text-gray-500 italic">No record established</span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Highest Partnerships by Wicket Matrix */}
      <div>
        <h3 className="text-sm font-semibold tracking-wider text-emerald-400 uppercase mb-3 flex items-center gap-2">
          <span>🤝</span> Highest Partnership for Each Wicket
        </h3>
        <div className="bg-gray-800/80 border border-gray-700/70 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-900/60 text-xs font-semibold text-gray-400 border-b border-gray-700/80">
                  <th className="py-3 px-4 w-20">Wicket</th>
                  <th className="py-3 px-4 w-28">Partnership</th>
                  <th className="py-3 px-4">Batters</th>
                  <th className="py-3 px-4">Team</th>
                  <th className="py-3 px-4">Opponent</th>
                  <th className="py-3 px-4 text-right">Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((wNum) => {
                  const pRec = partnerships.find((p) => p.wicket === wNum);
                  const ordinal =
                    wNum === 1
                      ? '1st'
                      : wNum === 2
                      ? '2nd'
                      : wNum === 3
                      ? '3rd'
                      : `${wNum}th`;

                  if (!pRec) {
                    return (
                      <tr key={wNum} className="hover:bg-gray-700/20 text-gray-500 text-xs">
                        <td className="py-2.5 px-4 font-bold text-gray-400">{ordinal}</td>
                        <td className="py-2.5 px-4 italic">-</td>
                        <td className="py-2.5 px-4 italic text-gray-600">No partnership recorded</td>
                        <td className="py-2.5 px-4 italic">-</td>
                        <td className="py-2.5 px-4 italic">-</td>
                        <td className="py-2.5 px-4 text-right italic">-</td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={wNum} className="hover:bg-gray-700/30 transition-colors">
                      <td className="py-2.5 px-4 font-bold text-emerald-400">{ordinal}</td>
                      <td className="py-2.5 px-4 font-black text-gray-100">
                        {pRec.runs}
                        {pRec.is_unbroken ? '*' : ''}
                        <span className="text-xs text-gray-400 font-normal ml-1">
                          ({pRec.balls}b)
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-gray-200 font-medium">
                        {pRec.batter_1_name} &amp; {pRec.batter_2_name}
                      </td>
                      <td className="py-2.5 px-4 text-gray-300 text-xs">{pRec.team_name}</td>
                      <td className="py-2.5 px-4 text-gray-400 text-xs">{pRec.opponent_name}</td>
                      <td className="py-2.5 px-4 text-right text-gray-400 text-xs font-mono">
                        #{pRec.match_number}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
