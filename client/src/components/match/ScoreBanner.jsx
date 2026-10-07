import React from 'react';
import { Badge } from '../common/Badge.jsx';

export function ScoreBanner({ match, liveState }) {
  if (!match) return null;

  const inningsState = liveState?.innings;
  const isSecondInnings = inningsState?.innings_number === 2;
  const target = inningsState?.target_runs;

  // Calculate run rates
  const totalRuns = inningsState?.total_runs || 0;
  const legalBalls = inningsState?.total_legal_balls || 0;
  const oversCompleted = legalBalls > 0 ? (legalBalls / 6) : 0;
  const crr = oversCompleted > 0 ? (totalRuns / oversCompleted).toFixed(2) : '0.00';

  let rrr = null;
  let runsNeeded = null;
  let ballsRemaining = null;
  if (isSecondInnings && target) {
    runsNeeded = target - totalRuns;
    const totalMatchBalls = (match.overs_quota || 20) * (match.balls_per_over || 6);
    ballsRemaining = Math.max(0, totalMatchBalls - legalBalls);
    if (ballsRemaining > 0 && runsNeeded > 0) {
      rrr = ((runsNeeded / ballsRemaining) * 6).toFixed(2);
    }
  }

  const isLive = match.status === 'IN_PROGRESS';
  const isCompleted = match.status === 'COMPLETED';

  // Format overs string: e.g. "4.2"
  const oversStr = `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;

  return (
    <div className="card" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}>
      {/* Top Bar: Match title & Status Badges */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
          {match.tournament_name || 'Tournament'} • Match #{match.match_number} ({match.stage})
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {liveState?.is_free_hit && <Badge variant="free-hit">⚡ FREE HIT</Badge>}
          {isLive && <Badge variant="live">● LIVE</Badge>}
          {isCompleted && <Badge variant="completed">COMPLETED</Badge>}
        </div>
      </div>

      {/* Main Score Line */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '6px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
            {match.batting_team_name || match.team_a_name || 'Batting Team'}
          </h2>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#38bdf8', lineHeight: 1.1 }}>
            {totalRuns} / {inningsState?.total_wickets ?? 0}
            <span style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', fontWeight: 500, marginLeft: '8px' }}>
              ({oversStr} / {match.overs_quota} ov)
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>CRR</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#34d399' }}>{crr}</div>
        </div>
      </div>

      {/* Target & Chase Info */}
      {isSecondInnings && target && !isCompleted && (
        <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(51, 65, 85, 0.5)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.9rem', color: '#fbbf24', fontWeight: 600 }}>
            Target: {target} (Need {runsNeeded > 0 ? runsNeeded : 0} runs in {ballsRemaining} balls)
          </span>
          {rrr && (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              RRR: <strong style={{ color: '#f8fafc' }}>{rrr}</strong>
            </span>
          )}
        </div>
      )}

      {/* Completed Match Outcome Text */}
      {isCompleted && match.winner_team_name && (
        <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #059669', borderRadius: '8px', color: '#6ee7b7', fontWeight: 600, textAlign: 'center' }}>
          🏆 {match.winner_team_name} won by {match.result_margin_runs ? `${match.result_margin_runs} runs` : `${match.result_margin_wickets} wickets`}
        </div>
      )}
    </div>
  );
}
