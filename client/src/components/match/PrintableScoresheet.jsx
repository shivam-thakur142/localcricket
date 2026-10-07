import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

export function PrintableScoresheet({ matchId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchExport() {
      if (!matchId) return;
      try {
        setLoading(true);
        setError(null);
        const res = await api.getMatchExport(matchId);
        if (isMounted) {
          setData(res?.data || null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load scoresheet data');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    fetchExport();
    return () => {
      isMounted = false;
    };
  }, [matchId]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-300">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto mb-3"></div>
          <p className="text-sm font-semibold">Generating Official Printable Scoresheet...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-md w-full">
          <h3 className="text-red-400 font-bold mb-2">Error Loading Scoresheet</h3>
          <p className="text-gray-400 text-sm mb-4">{error || 'Data unavailable'}</p>
          <button
            onClick={onClose}
            className="w-full bg-gray-800 hover:bg-gray-700 text-white font-medium py-2 rounded-lg text-sm"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const { match, officials, scorecards } = data;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 overflow-y-auto p-4 sm:p-6 print:p-0 print:static print:bg-white print:overflow-visible">
      {/* Controls Bar (Hidden during print) */}
      <div className="max-w-4xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <div className="text-sm text-gray-300 font-medium">
          Official Scoresheet Export • Match #{match.match_number}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors shadow"
          >
            <span>🖨️</span> Print / Save PDF
          </button>
          <button
            onClick={onClose}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Printable Sheet Container */}
      <div className="max-w-4xl mx-auto bg-white text-gray-900 rounded-xl shadow-2xl p-8 print:p-0 print:shadow-none print:rounded-none print:w-full">
        {/* Header */}
        <div className="border-b-2 border-gray-900 pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-black uppercase tracking-wide text-gray-950">
                {match.tournament_name}
              </h1>
              <div className="text-sm font-bold text-gray-700 mt-1">
                Match #{match.match_number} • {match.stage} • {match.format} ({match.overs_quota} Overs)
              </div>
            </div>
            <div className="text-right text-xs text-gray-600">
              <div>Date: {new Date(match.scheduled_start_time).toLocaleDateString()}</div>
              <div>Venue: {match.venue_name || 'Ground'} {match.city ? `(${match.city})` : ''}</div>
              <div className="font-semibold text-gray-800 mt-0.5">Status: {match.status}</div>
            </div>
          </div>

          {/* Outcome banner */}
          <div className="mt-3 p-2 bg-gray-100 rounded border border-gray-300 text-sm font-bold flex justify-between items-center">
            <span>
              Result:{' '}
              {match.winner_team_name
                ? `${match.winner_team_name} won${
                    match.margin_runs
                      ? ` by ${match.margin_runs} runs`
                      : match.margin_wickets
                      ? ` by ${match.margin_wickets} wickets`
                      : match.result_type === 'SUPER_OVER'
                      ? ' via Super Over'
                      : ''
                  }`
                : match.result_type === 'NO_RESULT'
                ? 'No Result / Abandoned'
                : match.result_type === 'TIED'
                ? 'Match Tied'
                : 'In Progress'}
            </span>
            {match.player_of_match_name && (
              <span className="text-xs font-semibold text-emerald-800">
                POTM: {match.player_of_match_name}
              </span>
            )}
          </div>
        </div>

        {/* Both Innings Box Score */}
        <div className="space-y-6">
          {scorecards.map((sc) => (
            <div key={sc.innings_id} className="border border-gray-300 rounded p-4 break-inside-avoid">
              <div className="flex justify-between items-center border-b border-gray-300 pb-2 mb-3">
                <h2 className="text-base font-bold text-gray-900 uppercase">
                  Innings {sc.innings_number}: {sc.batting_team_name}
                </h2>
                <div className="text-sm font-black text-gray-950">
                  {sc.total_runs}/{sc.total_wickets} ({sc.overs} ov)
                </div>
              </div>

              {/* Batting Card */}
              <div className="mb-4">
                <div className="text-xs font-bold uppercase text-gray-500 mb-1">Batting</div>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-300 text-left text-gray-600">
                      <th className="py-1">Batter</th>
                      <th className="py-1">Dismissal</th>
                      <th className="py-1 text-right">R</th>
                      <th className="py-1 text-right">B</th>
                      <th className="py-1 text-right">4s</th>
                      <th className="py-1 text-right">6s</th>
                      <th className="py-1 text-right">SR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sc.batting.map((b) => (
                      <tr key={b.player_id} className="border-b border-gray-100">
                        <td className="py-1 font-semibold text-gray-900">
                          {b.player_name}
                          {b.is_not_out ? '*' : ''}
                        </td>
                        <td className="py-1 text-gray-600">{b.dismissal_type}</td>
                        <td className="py-1 text-right font-bold text-gray-950">{b.runs}</td>
                        <td className="py-1 text-right text-gray-700">{b.balls}</td>
                        <td className="py-1 text-right text-gray-700">{b.fours}</td>
                        <td className="py-1 text-right text-gray-700">{b.sixes}</td>
                        <td className="py-1 text-right text-gray-700">{b.strike_rate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Extras & Total Summary */}
              <div className="text-xs text-gray-700 flex justify-between border-t border-b border-gray-200 py-1.5 mb-4 bg-gray-50 px-2">
                <span>
                  <strong>Extras:</strong> {sc.extras.total} (w {sc.extras.wides}, nb {sc.extras.no_balls}, b {sc.extras.byes}, lb {sc.extras.leg_byes})
                </span>
                <span>
                  <strong>Total:</strong> {sc.total_runs}/{sc.total_wickets} in {sc.overs} ov (Run Rate: {sc.run_rate})
                </span>
              </div>

              {/* Fall of Wickets */}
              {sc.fall_of_wickets && sc.fall_of_wickets.length > 0 && (
                <div className="mb-4 text-xs text-gray-600">
                  <span className="font-bold text-gray-700">Fall of Wickets: </span>
                  {sc.fall_of_wickets.map((f, idx) => (
                    <span key={idx}>
                      {idx > 0 ? ', ' : ''}
                      {f.runs}-{f.wicket} ({f.player_name}, {f.overs} ov)
                    </span>
                  ))}
                </div>
              )}

              {/* Bowling Card */}
              <div>
                <div className="text-xs font-bold uppercase text-gray-500 mb-1">Bowling</div>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-300 text-left text-gray-600">
                      <th className="py-1">Bowler</th>
                      <th className="py-1 text-right">O</th>
                      <th className="py-1 text-right">M</th>
                      <th className="py-1 text-right">R</th>
                      <th className="py-1 text-right">W</th>
                      <th className="py-1 text-right">Econ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sc.bowling.map((bw) => (
                      <tr key={bw.player_id} className="border-b border-gray-100">
                        <td className="py-1 font-semibold text-gray-900">{bw.player_name}</td>
                        <td className="py-1 text-right text-gray-700">{bw.overs}</td>
                        <td className="py-1 text-right text-gray-700">{bw.maidens}</td>
                        <td className="py-1 text-right text-gray-700">{bw.runs}</td>
                        <td className="py-1 text-right font-bold text-gray-950">{bw.wickets}</td>
                        <td className="py-1 text-right text-gray-700">{bw.economy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        {/* Authoritative Match Officials & Signature Section */}
        <div className="mt-8 pt-6 border-t-2 border-gray-900 break-inside-avoid">
          <div className="text-xs font-bold uppercase text-gray-500 mb-4 tracking-wider">
            Authoritative Match Officials &amp; Signatures
          </div>
          <div className="grid grid-cols-3 gap-6 text-xs">
            {/* Scorer */}
            <div>
              <div className="font-bold text-gray-700 mb-1">Official Scorer</div>
              <div className="text-gray-900 font-medium h-5">
                {officials.official_scorer_name || ''}
              </div>
              <div className="border-b border-gray-400 mt-3 pt-2"></div>
              <div className="text-[10px] text-gray-500 mt-1">Signature</div>
            </div>

            {/* Umpire 1 */}
            <div>
              <div className="font-bold text-gray-700 mb-1">Umpire 1</div>
              <div className="text-gray-900 font-medium h-5">
                {officials.umpire_1_name || ''}
              </div>
              <div className="border-b border-gray-400 mt-3 pt-2"></div>
              <div className="text-[10px] text-gray-500 mt-1">Signature</div>
            </div>

            {/* Umpire 2 */}
            <div>
              <div className="font-bold text-gray-700 mb-1">Umpire 2</div>
              <div className="text-gray-900 font-medium h-5">
                {officials.umpire_2_name || ''}
              </div>
              <div className="border-b border-gray-400 mt-3 pt-2"></div>
              <div className="text-[10px] text-gray-500 mt-1">Signature</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
