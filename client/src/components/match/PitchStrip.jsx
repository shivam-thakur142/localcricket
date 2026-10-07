import React from 'react';

export function PitchStrip({ liveState }) {
  if (!liveState) return null;

  const striker = liveState.striker;
  const nonStriker = liveState.non_striker;
  const bowler = liveState.bowler;

  const calculateSR = (runs, balls) => (balls > 0 ? ((runs / balls) * 100).toFixed(1) : '0.0');
  const calculateEconomy = (runs, balls) => (balls > 0 ? ((runs / (balls / 6))).toFixed(2) : '0.00');

  return (
    <div className="card">
      {/* Batters on pitch */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '6px' }}>
          Batting
        </div>

        {/* Striker */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#38bdf8', fontWeight: 700 }}>*</span>
            <span style={{ fontWeight: 600, color: '#f8fafc' }}>
              {striker?.name || 'Striker'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            <span style={{ fontWeight: 700, color: '#f8fafc' }}>
              {striker?.runs || 0} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({striker?.balls || 0})</span>
            </span>
            <span>4s: {striker?.fours || 0}</span>
            <span>6s: {striker?.sixes || 0}</span>
            <span>SR: {calculateSR(striker?.runs || 0, striker?.balls || 0)}</span>
          </div>
        </div>

        {/* Non-Striker */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'transparent', fontWeight: 700 }}>*</span>
            <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
              {nonStriker?.name || 'Non-Striker'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            <span style={{ fontWeight: 600, color: '#e2e8f0' }}>
              {nonStriker?.runs || 0} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({nonStriker?.balls || 0})</span>
            </span>
            <span>4s: {nonStriker?.fours || 0}</span>
            <span>6s: {nonStriker?.sixes || 0}</span>
            <span>SR: {calculateSR(nonStriker?.runs || 0, nonStriker?.balls || 0)}</span>
          </div>
        </div>
      </div>

      {/* Bowler in action */}
      <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '6px' }}>
          Bowling
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: '#f8fafc' }}>
            {bowler?.name || 'Bowler'}
          </span>
          <div style={{ display: 'flex', gap: '12px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            <span>
              {Math.floor((bowler?.legal_balls || 0) / 6)}.{(bowler?.legal_balls || 0) % 6} ov
            </span>
            <span>M: {bowler?.maidens || 0}</span>
            <span style={{ fontWeight: 600, color: '#f8fafc' }}>R: {bowler?.runs_conceded || 0}</span>
            <span style={{ fontWeight: 700, color: '#ef4444' }}>W: {bowler?.wickets || 0}</span>
            <span>Econ: {calculateEconomy(bowler?.runs_conceded || 0, bowler?.legal_balls || 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
