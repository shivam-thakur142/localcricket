import React from 'react';

export function PointsTable({ standings = [], onRefresh, isRefreshing = false }) {
  const formatNRR = (nrr) => {
    const val = Number(nrr) || 0;
    if (val > 0) return `+${val.toFixed(3)}`;
    if (val < 0) return val.toFixed(3);
    return '0.000';
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#38bdf8' }}>
            Tournament Standings
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Playing Conditions: Symmetric All-Out Quota NRR
          </span>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
            }}
          >
            {isRefreshing ? 'Recalculating...' : '🔄 Recalculate'}
          </button>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'center' }}>
              <th style={{ padding: '8px 4px', textAlign: 'left' }}>#</th>
              <th style={{ padding: '8px 4px', textAlign: 'left' }}>Team</th>
              <th style={{ padding: '8px 4px' }}>P</th>
              <th style={{ padding: '8px 4px' }}>W</th>
              <th style={{ padding: '8px 4px' }}>L</th>
              <th style={{ padding: '8px 4px' }}>T</th>
              <th style={{ padding: '8px 4px' }}>NR</th>
              <th style={{ padding: '8px 4px', fontWeight: 800, color: '#f8fafc' }}>PTS</th>
              <th style={{ padding: '8px 4px' }}>NRR</th>
              <th style={{ padding: '8px 4px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>For / Against</th>
            </tr>
          </thead>
          <tbody>
            {standings.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No matches completed yet in this tournament.
                </td>
              </tr>
            ) : (
              standings.map((row, idx) => {
                const nrr = Number(row.net_run_rate) || 0;
                const nrrColor = nrr > 0 ? '#34d399' : nrr < 0 ? '#f87171' : '#94a3b8';
                const isTopTwo = idx < 2;

                return (
                  <tr
                    key={row.tournament_team_id}
                    style={{
                      borderBottom: '1px solid rgba(51, 65, 85, 0.4)',
                      background: isTopTwo ? 'rgba(56, 189, 248, 0.05)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 4px', fontWeight: 700, color: isTopTwo ? '#38bdf8' : 'var(--text-secondary)' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '10px 4px', textAlign: 'left', fontWeight: 600, color: '#f8fafc' }}>
                      {row.team_name} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>({row.short_name})</span>
                    </td>
                    <td style={{ padding: '10px 4px', textAlign: 'center' }}>{row.matches_played}</td>
                    <td style={{ padding: '10px 4px', textAlign: 'center', color: '#10b981', fontWeight: 600 }}>{row.matches_won}</td>
                    <td style={{ padding: '10px 4px', textAlign: 'center', color: '#ef4444' }}>{row.matches_lost}</td>
                    <td style={{ padding: '10px 4px', textAlign: 'center', color: '#f59e0b' }}>{row.matches_tied}</td>
                    <td style={{ padding: '10px 4px', textAlign: 'center', color: 'var(--text-secondary)' }}>{row.matches_no_result}</td>
                    <td style={{ padding: '10px 4px', textAlign: 'center', fontWeight: 800, color: '#38bdf8', fontSize: '1rem' }}>
                      {row.points}
                    </td>
                    <td style={{ padding: '10px 4px', textAlign: 'center', fontWeight: 700, color: nrrColor }}>
                      {formatNRR(row.net_run_rate)}
                    </td>
                    <td style={{ padding: '10px 4px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {row.runs_scored_for}/{row.overs_faced_display || '0.0'} vs {row.runs_conceded_against}/{row.overs_bowled_display || '0.0'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
