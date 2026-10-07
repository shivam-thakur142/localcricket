import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

export function MatchPreviewCard({ matchId }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchPreview() {
      if (!matchId) return;
      try {
        setLoading(true);
        setError(null);
        const res = await api.getMatchPreview(matchId);
        if (isMounted) {
          setPreview(res?.data || null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load match preview');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    fetchPreview();
    return () => {
      isMounted = false;
    };
  }, [matchId]);

  if (loading) {
    return (
      <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-6 text-center text-gray-400">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500 mx-auto mb-2"></div>
        <p className="text-xs">Loading pre-match intelligence &amp; head-to-head records...</p>
      </div>
    );
  }

  if (error || !preview) {
    return null; // Silently omit or render nothing if match metadata unavailable
  }

  const { team_a, team_b, head_to_head, venue_stats } = preview;

  const totalH2H = head_to_head?.matches_played || 0;
  const aWins = head_to_head?.team_a_wins || 0;
  const bWins = head_to_head?.team_b_wins || 0;
  const ties = head_to_head?.tied || 0;
  const nrs = head_to_head?.no_result || 0;

  const aPct = totalH2H > 0 ? Math.round((aWins / totalH2H) * 100) : 50;
  const bPct = totalH2H > 0 ? 100 - aPct : 50;

  const renderFormPill = (result, idx) => {
    let bg = 'bg-gray-700 text-gray-300';
    if (result === 'W') bg = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40';
    else if (result === 'L') bg = 'bg-rose-500/20 text-rose-400 border border-rose-500/40';
    else if (result === 'T') bg = 'bg-amber-500/20 text-amber-400 border border-amber-500/40';
    else if (result === 'NR') bg = 'bg-gray-600/30 text-gray-400 border border-gray-600/40';

    return (
      <span
        key={idx}
        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${bg}`}
        title={`Match ${idx + 1}: ${result}`}
      >
        {result}
      </span>
    );
  };

  return (
    <div className="bg-gray-800/70 border border-gray-700/70 rounded-2xl p-5 shadow-lg space-y-6">
      <div className="flex items-center justify-between border-b border-gray-700/60 pb-3">
        <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
          <span>⚔️</span> Match Intelligence &amp; Head-to-Head
        </h3>
        <span className="text-xs text-gray-400 font-medium">Pre-Match Preview</span>
      </div>

      {/* 1. Head-to-Head Record */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-100">{team_a.name}</span>
            <span className="bg-emerald-950/60 text-emerald-400 px-2 py-0.5 rounded text-[11px] font-bold border border-emerald-800/40">
              {aWins} {aWins === 1 ? 'win' : 'wins'}
            </span>
          </div>
          <span className="text-gray-500">
            {totalH2H === 0 ? 'First Ever Encounter' : `${totalH2H} Matches Played`}
          </span>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-950/60 text-indigo-400 px-2 py-0.5 rounded text-[11px] font-bold border border-indigo-800/40">
              {bWins} {bWins === 1 ? 'win' : 'wins'}
            </span>
            <span className="text-sm font-bold text-gray-100">{team_b.name}</span>
          </div>
        </div>

        {totalH2H > 0 && (
          <div className="h-2.5 w-full bg-gray-900 rounded-full overflow-hidden flex">
            <div
              className="bg-emerald-500 transition-all duration-500"
              style={{ width: `${aPct}%` }}
              title={`${team_a.name}: ${aPct}%`}
            />
            <div
              className="bg-indigo-500 transition-all duration-500"
              style={{ width: `${bPct}%` }}
              title={`${team_b.name}: ${bPct}%`}
            />
          </div>
        )}

        {(ties > 0 || nrs > 0) && (
          <p className="text-center text-[11px] text-gray-500">
            Includes {ties > 0 ? `${ties} tied` : ''} {ties > 0 && nrs > 0 ? 'and ' : ''}
            {nrs > 0 ? `${nrs} no result` : ''}
          </p>
        )}
      </div>

      {/* 2. Recent Tournament Form (Last 5) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-900/40 p-4 rounded-xl border border-gray-700/40">
        <div>
          <span className="text-xs font-semibold text-gray-400 block mb-2">
            {team_a.name} (Recent Form)
          </span>
          <div className="flex items-center gap-1.5">
            {team_a.recent_form && team_a.recent_form.length > 0 ? (
              team_a.recent_form.map((res, i) => renderFormPill(res, i))
            ) : (
              <span className="text-xs text-gray-500 italic">No prior matches in tournament</span>
            )}
          </div>
        </div>

        <div>
          <span className="text-xs font-semibold text-gray-400 block mb-2">
            {team_b.name} (Recent Form)
          </span>
          <div className="flex items-center gap-1.5">
            {team_b.recent_form && team_b.recent_form.length > 0 ? (
              team_b.recent_form.map((res, i) => renderFormPill(res, i))
            ) : (
              <span className="text-xs text-gray-500 italic">No prior matches in tournament</span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Venue Intelligence */}
      {venue_stats && (
        <div className="bg-gray-900/40 p-4 rounded-xl border border-gray-700/40 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-gray-400">📍 Venue Intelligence</div>
            <div className="text-sm font-bold text-gray-200 mt-0.5">
              {venue_stats.venue_name}
              {venue_stats.city ? `, ${venue_stats.city}` : ''}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {venue_stats.matches_played_at_venue}{' '}
              {venue_stats.matches_played_at_venue === 1 ? 'prior match' : 'prior matches'} at venue
            </div>
          </div>

          <div className="flex items-center gap-6 text-center">
            <div>
              <span className="text-[11px] text-gray-400 font-medium block">Avg 1st Innings</span>
              <span className="text-base font-black text-emerald-400">
                {venue_stats.average_first_innings_score !== null
                  ? Math.round(venue_stats.average_first_innings_score)
                  : '-'}
              </span>
            </div>
            <div className="h-8 w-px bg-gray-700/60" />
            <div>
              <span className="text-[11px] text-gray-400 font-medium block">Avg 2nd Innings</span>
              <span className="text-base font-black text-indigo-400">
                {venue_stats.average_second_innings_score !== null
                  ? Math.round(venue_stats.average_second_innings_score)
                  : '-'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
