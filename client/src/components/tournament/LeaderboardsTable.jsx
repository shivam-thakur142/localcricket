// ====================================================================
// LEADERBOARDS TABLE: TOURNAMENT ORANGE & PURPLE CAP PLAYER RANKINGS
// ====================================================================

import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.js';

export function LeaderboardsTable({ tournamentId }) {
  const [category, setCategory] = useState('batting'); // 'batting' | 'bowling' | 'sixes' | 'fours'
  const [leaderboards, setLeaderboards] = useState({ batting: [], bowling: [], sixes: [], fours: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchLeaderboards = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getTournamentLeaderboards(tournamentId, 'all');
        if (isMounted) {
          setLeaderboards(res.data || { batting: [], bowling: [], sixes: [], fours: [] });
        }
      } catch (err) {
        if (isMounted) setError(err.message || 'Failed to load leaderboards');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchLeaderboards();
    return () => { isMounted = false; };
  }, [tournamentId]);

  if (loading) {
    return <div className="card" style={{ textAlign: 'center', padding: '30px' }}>Loading leaderboards...</div>;
  }

  if (error) {
    return (
      <div className="card" style={{ color: '#ef4444', textAlign: 'center', padding: '20px' }}>
        Failed to load leaderboards: {error}
      </div>
    );
  }

  const currentList = leaderboards[category] || [];

  return (
    <div className="card" style={{ background: 'var(--bg-card)' }}>
      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setCategory('batting')}
          style={{
            padding: '8px 14px',
            borderRadius: '6px',
            border: 'none',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            background: category === 'batting' ? '#f59e0b' : 'var(--bg-accent)',
            color: category === 'batting' ? '#000000' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          🧢 Most Runs (Orange Cap)
        </button>
        <button
          onClick={() => setCategory('bowling')}
          style={{
            padding: '8px 14px',
            borderRadius: '6px',
            border: 'none',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            background: category === 'bowling' ? '#a855f7' : 'var(--bg-accent)',
            color: category === 'bowling' ? '#ffffff' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          🟣 Most Wickets (Purple Cap)
        </button>
        <button
          onClick={() => setCategory('sixes')}
          style={{
            padding: '8px 14px',
            borderRadius: '6px',
            border: 'none',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            background: category === 'sixes' ? '#0284c7' : 'var(--bg-accent)',
            color: category === 'sixes' ? '#ffffff' : 'var(--text-secondary)',
          }}
        >
          💥 Most Sixes
        </button>
        <button
          onClick={() => setCategory('fours')}
          style={{
            padding: '8px 14px',
            borderRadius: '6px',
            border: 'none',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            background: category === 'fours' ? '#0284c7' : 'var(--bg-accent)',
            color: category === 'fours' ? '#ffffff' : 'var(--text-secondary)',
          }}
        >
          ⚡ Most Fours
        </button>
      </div>

      {/* Table */}
      {currentList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
          No player statistics recorded in this tournament yet.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '8px 6px', width: '38px' }}>#</th>
                <th style={{ padding: '8px 6px' }}>Player</th>
                <th style={{ padding: '8px 6px' }}>Team</th>
                {category === 'batting' && (
                  <>
                    <th style={{ padding: '8px 6px', textAlign: 'center' }}>Inns</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 800, color: '#f59e0b' }}>Runs</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>HS</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Avg</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>SR</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>4s</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>6s</th>
                  </>
                )}
                {category === 'bowling' && (
                  <>
                    <th style={{ padding: '8px 6px', textAlign: 'center' }}>Inns</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Overs</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 800, color: '#a855f7' }}>Wkts</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Runs</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Avg</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Econ</th>
                  </>
                )}
                {category === 'sixes' && (
                  <>
                    <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 800, color: '#38bdf8' }}>6s</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Runs</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>SR</th>
                  </>
                )}
                {category === 'fours' && (
                  <>
                    <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 800, color: '#38bdf8' }}>4s</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Runs</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>SR</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {currentList.map((player) => {
                let medal = `${player.rank}`;
                if (player.rank === 1) medal = '🥇 1';
                else if (player.rank === 2) medal = '🥈 2';
                else if (player.rank === 3) medal = '🥉 3';

                return (
                  <tr
                    key={player.player_id}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      background: player.rank === 1 ? 'rgba(245, 158, 11, 0.05)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 6px', fontWeight: 700, color: '#94a3b8' }}>{medal}</td>
                    <td style={{ padding: '10px 6px', fontWeight: 700, color: '#f8fafc' }}>
                      {player.player_name}
                    </td>
                    <td style={{ padding: '10px 6px', color: 'var(--text-secondary)' }}>
                      {player.team_short_name || player.team_name}
                    </td>

                    {category === 'batting' && (
                      <>
                        <td style={{ padding: '10px 6px', textAlign: 'center', color: '#94a3b8' }}>{player.innings_batted}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 800, color: '#f59e0b', fontSize: '0.95rem' }}>
                          {player.total_runs}
                        </td>
                        <td style={{ padding: '10px 6px', textAlign: 'right', color: '#f8fafc' }}>{player.high_score}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'right', color: '#94a3b8' }}>{player.average_display}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'right', color: '#94a3b8' }}>{player.strike_rate}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'right', color: '#94a3b8' }}>{player.total_fours}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'right', color: '#94a3b8' }}>{player.total_sixes}</td>
                      </>
                    )}

                    {category === 'bowling' && (
                      <>
                        <td style={{ padding: '10px 6px', textAlign: 'center', color: '#94a3b8' }}>{player.innings_bowled}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'right', color: '#94a3b8' }}>{player.overs_display}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 800, color: '#a855f7', fontSize: '0.95rem' }}>
                          {player.total_wickets}
                        </td>
                        <td style={{ padding: '10px 6px', textAlign: 'right', color: '#94a3b8' }}>{player.total_runs_conceded}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'right', color: '#94a3b8' }}>{player.average_display}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'right', color: '#94a3b8' }}>{player.economy_rate}</td>
                      </>
                    )}

                    {category === 'sixes' && (
                      <>
                        <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 800, color: '#38bdf8', fontSize: '0.95rem' }}>
                          {player.total_sixes}
                        </td>
                        <td style={{ padding: '10px 6px', textAlign: 'right', color: '#f8fafc' }}>{player.total_runs}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'right', color: '#94a3b8' }}>{player.strike_rate}</td>
                      </>
                    )}

                    {category === 'fours' && (
                      <>
                        <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 800, color: '#38bdf8', fontSize: '0.95rem' }}>
                          {player.total_fours}
                        </td>
                        <td style={{ padding: '10px 6px', textAlign: 'right', color: '#f8fafc' }}>{player.total_runs}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'right', color: '#94a3b8' }}>{player.strike_rate}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
