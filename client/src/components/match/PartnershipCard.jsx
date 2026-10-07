// ====================================================================
// PARTNERSHIP CARD: ACTIVE & HISTORICAL CRICKET PARTNERSHIPS
// ====================================================================

import React, { useState } from 'react';

export function PartnershipCard({ activePartnership, historicalPartnerships = [] }) {
  const [showHistorical, setShowHistorical] = useState(false);

  if (!activePartnership && (!historicalPartnerships || historicalPartnerships.length === 0)) {
    return null;
  }

  const p = activePartnership;
  const b1 = p?.batter_1 || { name: 'Batter 1', runs: 0, balls: 0 };
  const b2 = p?.batter_2 || { name: 'Batter 2', runs: 0, balls: 0 };
  const totalBatterRuns = (b1.runs || 0) + (b2.runs || 0);
  const b1Pct = totalBatterRuns > 0 ? Math.round(((b1.runs || 0) / totalBatterRuns) * 100) : 50;

  return (
    <div className="card" style={{ marginBottom: '14px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.1rem' }}>🤝</span>
          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#f8fafc', letterSpacing: '-0.01em' }}>
            Current Partnership
          </span>
        </div>
        {p && (
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#38bdf8' }}>
              {p.runs} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>runs</span>
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
              ({p.balls} balls)
            </span>
          </div>
        )}
      </div>

      {/* Active Partnership Batter Breakdown */}
      {p && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
            <div>
              <span style={{ fontWeight: 700, color: '#f8fafc' }}>{b1.name}</span>
              <span style={{ color: '#38bdf8', marginLeft: '6px', fontWeight: 700 }}>
                {b1.runs} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({b1.balls})</span>
              </span>
            </div>
            <div>
              <span style={{ color: '#38bdf8', marginRight: '6px', fontWeight: 700 }}>
                {b2.runs} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({b2.balls})</span>
              </span>
              <span style={{ fontWeight: 700, color: '#f8fafc' }}>{b2.name}</span>
            </div>
          </div>

          {/* Visual Ratio Progress Bar */}
          <div
            style={{
              height: '6px',
              borderRadius: '3px',
              background: '#334155',
              overflow: 'hidden',
              display: 'flex',
            }}
          >
            <div style={{ width: `${b1Pct}%`, background: '#38bdf8', transition: 'width 0.3s ease' }} />
            <div style={{ width: `${100 - b1Pct}%`, background: '#f59e0b', transition: 'width 0.3s ease' }} />
          </div>

          {p.extras > 0 && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'center' }}>
              Team Extras in partnership: +{p.extras}
            </div>
          )}
        </div>
      )}

      {/* Historical Partnerships Toggle */}
      {historicalPartnerships && historicalPartnerships.length > 0 && (
        <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
          <button
            onClick={() => setShowHistorical(!showHistorical)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#38bdf8',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              padding: '2px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {showHistorical ? '▲ Hide Fall of Wickets Partnerships' : `▼ View All Partnerships (${historicalPartnerships.length} fallen wickets)`}
          </button>

          {showHistorical && (
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {historicalPartnerships.map((hp) => (
                <div
                  key={hp.wicket_number}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    background: 'var(--bg-accent)',
                    fontSize: '0.8rem',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 800, color: '#ef4444', marginRight: '6px' }}>
                      W{hp.wicket_number}
                    </span>
                    <span style={{ color: '#f8fafc', fontWeight: 600 }}>
                      {hp.batter_1?.name} & {hp.batter_2?.name}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                      (out: {hp.dismissed_player_name || 'batter'})
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, color: '#38bdf8' }}>
                    {hp.runs} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({hp.balls}b)</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
