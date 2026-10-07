// ====================================================================
// MATCH ANALYTICS CHARTS: WORM (CUMULATIVE) & MANHATTAN (PER-OVER)
// ====================================================================

import React, { useState } from 'react';

export function MatchAnalyticsCharts({ analytics }) {
  const [chartType, setChartType] = useState('WORM'); // 'WORM' | 'MANHATTAN'
  const [selectedInningsIdx, setSelectedInningsIdx] = useState(0);

  if (!analytics || !analytics.innings || analytics.innings.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
        <p>No overs bowled yet to generate charts.</p>
      </div>
    );
  }

  const inningsList = analytics.innings;
  const currentInnings = inningsList[selectedInningsIdx] || inningsList[0];
  const oversQuota = analytics.overs_quota || 20;

  return (
    <div className="card" style={{ marginBottom: '16px', background: 'var(--bg-card)' }}>
      {/* Chart Selector Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => setChartType('WORM')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: chartType === 'WORM' ? '#0284c7' : 'var(--bg-accent)',
              color: chartType === 'WORM' ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            📈 Worm Chart
          </button>
          <button
            onClick={() => setChartType('MANHATTAN')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: chartType === 'MANHATTAN' ? '#0284c7' : 'var(--bg-accent)',
              color: chartType === 'MANHATTAN' ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            📊 Manhattan Bars
          </button>
        </div>

        {/* Innings Selector if Manhattan or Multiple Innings */}
        {inningsList.length > 1 && (
          <div style={{ display: 'flex', gap: '4px' }}>
            {inningsList.map((inn, idx) => (
              <button
                key={inn.innings_id}
                onClick={() => setSelectedInningsIdx(idx)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: selectedInningsIdx === idx ? '#334155' : 'transparent',
                  color: selectedInningsIdx === idx ? '#38bdf8' : 'var(--text-muted)',
                }}
              >
                Inn {inn.innings_number} ({inn.batting_team_short_name || 'Bat'})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Render Chart */}
      {chartType === 'WORM' ? (
        <WormChart inningsList={inningsList} oversQuota={oversQuota} />
      ) : (
        <ManhattanChart innings={currentInnings} oversQuota={oversQuota} />
      )}
    </div>
  );
}

/**
 * Worm Chart: Cumulative runs over completed overs comparing Innings 1 vs Innings 2.
 * Includes live active over point and wicket markers.
 */
function WormChart({ inningsList, oversQuota = 20 }) {
  const width = 500;
  const height = 240;
  const padding = { top: 20, right: 30, bottom: 35, left: 45 };

  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  // Compute maximum runs across both innings for Y-axis scale
  let maxRuns = 60;
  let maxOvers = oversQuota;

  inningsList.forEach((inn) => {
    inn.worm.forEach((pt) => {
      if (pt.runs > maxRuns) maxRuns = pt.runs;
      if (pt.over > maxOvers) maxOvers = pt.over;
    });
  });
  maxRuns = Math.ceil((maxRuns + 15) / 20) * 20;

  const scaleX = (over) => padding.left + (over / maxOvers) * plotW;
  const scaleY = (runs) => padding.top + plotH - (runs / maxRuns) * plotH;

  const colors = ['#38bdf8', '#f59e0b'];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        {/* Grid Lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac, idx) => {
          const runVal = Math.round(maxRuns * frac);
          const y = scaleY(runVal);
          return (
            <g key={idx}>
              <line x1={padding.left} y1={y} x2={padding.left + plotW} y2={y} stroke="#1e293b" strokeDasharray="3 3" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">
                {runVal}
              </text>
            </g>
          );
        })}

        {/* X-axis Over Labels */}
        {Array.from({ length: 5 }, (_, i) => Math.round((maxOvers / 4) * i)).map((ov) => {
          const x = scaleX(ov);
          return (
            <g key={ov}>
              <line x1={x} y1={padding.top} x2={x} y2={padding.top + plotH} stroke="#1e293b" strokeDasharray="3 3" />
              <text x={x} y={padding.top + plotH + 18} textAnchor="middle" fontSize="10" fill="#64748b">
                {ov} ov
              </text>
            </g>
          );
        })}

        {/* Draw Innings Curves */}
        {inningsList.map((inn, innIdx) => {
          if (!inn.worm || inn.worm.length === 0) return null;
          const strokeColor = colors[innIdx % colors.length];

          const points = inn.worm.map((pt) => `${scaleX(pt.over)},${scaleY(pt.runs)}`).join(' ');

          return (
            <g key={inn.innings_id}>
              {/* Curve line */}
              <polyline fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} />

              {/* Data points */}
              {inn.worm.map((pt, pIdx) => (
                <circle
                  key={pIdx}
                  cx={scaleX(pt.over)}
                  cy={scaleY(pt.runs)}
                  r={pt.is_completed ? 3 : 4}
                  fill={strokeColor}
                  stroke={pt.is_completed ? '#0f172a' : '#ffffff'}
                  strokeWidth="1.5"
                />
              ))}

              {/* Wicket Markers */}
              {inn.wickets &&
                inn.wickets.map((w, wIdx) => {
                  const wx = scaleX(w.over_number);
                  const wy = scaleY(w.score_at_fall);
                  return (
                    <g key={wIdx}>
                      <circle cx={wx} cy={wy} r="5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                      <text x={wx} y={wy - 8} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#ef4444">
                        W
                      </text>
                    </g>
                  );
                })}
            </g>
          );
        })}
      </svg>

      {/* Worm Legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '10px', fontSize: '0.8rem' }}>
        {inningsList.map((inn, idx) => (
          <div key={inn.innings_id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '3px', background: colors[idx % colors.length], display: 'inline-block' }} />
            <span style={{ color: '#f8fafc', fontWeight: 600 }}>
              {inn.batting_team_short_name || `Innings ${inn.innings_number}`}: {inn.total_runs}/{inn.total_wickets}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
          <span>Wicket</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Manhattan Chart: Runs per over bar graph with wicket counts.
 * Incomplete active over has dashed/active styling.
 */
function ManhattanChart({ innings, oversQuota = 20 }) {
  const bars = innings?.manhattan || [];

  if (bars.length === 0) {
    return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>No overs bowled in this innings yet.</p>;
  }

  const width = 500;
  const height = 220;
  const padding = { top: 25, right: 20, bottom: 35, left: 35 };

  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  let maxOverRuns = 12;
  bars.forEach((b) => {
    if (b.runs > maxOverRuns) maxOverRuns = b.runs;
  });
  maxOverRuns = Math.ceil((maxOverRuns + 4) / 6) * 6;

  const totalOvers = Math.max(oversQuota, bars.length);
  const barSlotW = plotW / totalOvers;
  const barW = Math.max(8, barSlotW * 0.7);

  const scaleY = (runs) => padding.top + plotH - (runs / maxOverRuns) * plotH;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
        {/* Grid lines */}
        {[0, 0.33, 0.66, 1].map((frac, idx) => {
          const runVal = Math.round(maxOverRuns * frac);
          const y = scaleY(runVal);
          return (
            <g key={idx}>
              <line x1={padding.left} y1={y} x2={padding.left + plotW} y2={y} stroke="#1e293b" strokeDasharray="3 3" />
              <text x={padding.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">
                {runVal}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {bars.map((b) => {
          const x = padding.left + (b.over_number - 1) * barSlotW + (barSlotW - barW) / 2;
          const y = scaleY(b.runs);
          const h = padding.top + plotH - y;

          return (
            <g key={b.over_number}>
              {/* Bar */}
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(2, h)}
                rx="3"
                fill={b.is_completed ? '#38bdf8' : '#f59e0b'}
                stroke={b.is_completed ? 'none' : '#ffffff'}
                strokeDasharray={b.is_completed ? 'none' : '2 2'}
                opacity={b.is_completed ? 0.9 : 0.75}
              />

              {/* Runs label on top if runs > 0 */}
              {b.runs > 0 && (
                <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="9" fill="#94a3b8" fontWeight="600">
                  {b.runs}
                </text>
              )}

              {/* Wicket marker */}
              {b.wickets > 0 && (
                <g>
                  <circle cx={x + barW / 2} cy={y - 14} r="6" fill="#ef4444" />
                  <text x={x + barW / 2} y={y - 11} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#ffffff">
                    {b.wickets}
                  </text>
                </g>
              )}

              {/* Over number label on X axis */}
              <text x={x + barW / 2} y={padding.top + plotH + 16} textAnchor="middle" fontSize="9" fill="#64748b">
                {b.over_number}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Manhattan Legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '10px', height: '10px', background: '#38bdf8', borderRadius: '2px', display: 'inline-block' }} />
          <span>Completed Over</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '10px', height: '10px', background: '#f59e0b', borderRadius: '2px', display: 'inline-block' }} />
          <span>Live Incomplete Over</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
          <span>Wicket in Over</span>
        </div>
      </div>
    </div>
  );
}
