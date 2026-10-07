import React, { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { Badge } from '../components/common/Badge.jsx';

export function TeamProfilePage({ teamId, tournamentId, onBack, onSelectPlayer }) {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [rosterData, setRosterData] = useState(null);
  const [matches, setMatches] = useState([]);
  const [scopeToTournament, setScopeToTournament] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);

    const activeTournId = scopeToTournament ? tournamentId : null;

    const promises = [
      api.getTeamProfile(teamId),
      api.getTeamStats(teamId, activeTournId),
      api.getTeamMatches(teamId, activeTournId),
    ];

    if (tournamentId) {
      promises.push(
        api.getTeamRoster(teamId, tournamentId).catch(() => ({ data: null }))
      );
    }

    Promise.all(promises)
      .then(([profRes, statsRes, matchRes, rosterRes]) => {
        if (!isCancelled) {
          setProfile(profRes.data);
          setStats(statsRes.data);
          setMatches(matchRes.data || []);
          if (rosterRes?.data) {
            setRosterData(rosterRes.data);
          }
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setError(err.message || 'Failed to load team details');
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [teamId, tournamentId, scopeToTournament]);

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', paddingTop: '40px' }}>
        <p>Loading team profile & records...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="container" style={{ paddingTop: '20px' }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              background: 'var(--bg-accent)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              marginBottom: '16px',
            }}
          >
            ← Back
          </button>
        )}
        <div className="card" style={{ padding: '24px', textAlign: 'center', color: '#ef4444' }}>
          <h3>Team Not Found</h3>
          <p>{error || 'The requested team could not be located.'}</p>
        </div>
      </div>
    );
  }

  const trophies = stats?.trophies || { championships: [], runner_ups: [] };
  const initials = profile.short_name || profile.name?.slice(0, 3)?.toUpperCase() || 'TM';

  return (
    <div className="container">
      {/* Back button & Scope switcher */}
      <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: 'none',
              background: 'var(--bg-accent)',
              color: 'var(--text-secondary)',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            ← Back
          </button>
        )}

        {tournamentId && (
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setScopeToTournament(false)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                background: !scopeToTournament ? '#0284c7' : 'var(--bg-accent)',
                color: !scopeToTournament ? '#ffffff' : 'var(--text-secondary)',
              }}
            >
              All-Time Career
            </button>
            <button
              type="button"
              onClick={() => setScopeToTournament(true)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                background: scopeToTournament ? '#0284c7' : 'var(--bg-accent)',
                color: scopeToTournament ? '#ffffff' : 'var(--text-secondary)',
              }}
            >
              This Tournament
            </button>
          </div>
        )}
      </div>

      {/* Team Header Card */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          padding: '24px',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '1.4rem',
              fontWeight: 800,
            }}
          >
            {initials}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                {profile.name}
              </h1>
              {profile.short_name && <Badge variant="accent">{profile.short_name}</Badge>}
            </div>

            <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '0.85rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
              {profile.city && (
                <div>
                  City: <strong style={{ color: '#f8fafc' }}>{profile.city}</strong>
                </div>
              )}
              <div>
                Tournaments:{' '}
                <strong style={{ color: '#38bdf8' }}>{stats?.tournaments_participated_count ?? 1}</strong>
              </div>
              <div>
                Win Rate:{' '}
                <strong style={{ color: '#10b981' }}>{stats?.win_percentage ?? 0}%</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Win/Loss Record Grid */}
      <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', marginBottom: '14px' }}>
          📊 Match Record
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '12px' }}>
          <div className="stat-box">
            <span className="stat-label">Played</span>
            <strong className="stat-value">{stats?.matches_played ?? 0}</strong>
          </div>
          <div className="stat-box">
            <span className="stat-label">Won</span>
            <strong className="stat-value" style={{ color: '#10b981' }}>{stats?.matches_won ?? 0}</strong>
          </div>
          <div className="stat-box">
            <span className="stat-label">Lost</span>
            <strong className="stat-value" style={{ color: '#ef4444' }}>{stats?.matches_lost ?? 0}</strong>
          </div>
          <div className="stat-box">
            <span className="stat-label">Tied</span>
            <strong className="stat-value" style={{ color: '#f59e0b' }}>{stats?.matches_tied ?? 0}</strong>
          </div>
          <div className="stat-box">
            <span className="stat-label">No Result</span>
            <strong className="stat-value">{stats?.matches_no_result ?? 0}</strong>
          </div>
          <div className="stat-box">
            <span className="stat-label">Win %</span>
            <strong className="stat-value" style={{ color: '#38bdf8' }}>{stats?.win_percentage ?? 0}%</strong>
          </div>
        </div>
      </div>

      {/* Trophy Showcase */}
      <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', marginBottom: '14px' }}>
          🏆 Trophy Showcase
        </h3>
        {trophies.championships.length === 0 && trophies.runner_ups.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No podium finishes recorded yet.</p>
        ) : (
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {trophies.championships.map((c) => (
              <div
                key={c.tournament_id}
                style={{
                  background: 'rgba(251, 191, 36, 0.1)',
                  border: '1px solid #fbbf24',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <span style={{ fontSize: '1.6rem' }}>🏆</span>
                <div>
                  <strong style={{ color: '#fbbf24', display: 'block', fontSize: '0.9rem' }}>CHAMPION</strong>
                  <span style={{ color: '#f8fafc', fontSize: '0.85rem' }}>{c.tournament_name}</span>
                </div>
              </div>
            ))}
            {trophies.runner_ups.map((r) => (
              <div
                key={r.tournament_id}
                style={{
                  background: 'rgba(203, 213, 225, 0.1)',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <span style={{ fontSize: '1.6rem' }}>🥈</span>
                <div>
                  <strong style={{ color: '#cbd5e1', display: 'block', fontSize: '0.9rem' }}>RUNNER-UP</strong>
                  <span style={{ color: '#f8fafc', fontSize: '0.85rem' }}>{r.tournament_name}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tournament Squad Roster */}
      {rosterData?.roster && rosterData.roster.length > 0 && (
        <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', marginBottom: '14px' }}>
            👥 Tournament Squad Roster ({rosterData.roster.length})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            {rosterData.roster.map((player) => (
              <div
                key={player.player_id}
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(51, 65, 85, 0.5)',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {onSelectPlayer ? (
                      <button
                        type="button"
                        onClick={() => onSelectPlayer(player.player_id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: '#f8fafc',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          fontSize: '0.9rem',
                        }}
                      >
                        {player.full_name}
                      </button>
                    ) : (
                      <strong style={{ color: '#f8fafc', fontSize: '0.9rem' }}>{player.full_name}</strong>
                    )}
                    {player.is_captain && <Badge variant="accent">C</Badge>}
                    {player.is_wicket_keeper && <Badge variant="neutral">WK</Badge>}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {player.primary_role || 'Player'}
                  </div>
                </div>
                {player.jersey_number != null && (
                  <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#38bdf8' }}>
                    #{player.jersey_number}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Match Log Section */}
      <div className="card" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', marginBottom: '14px' }}>
          📋 Match History ({matches.length})
        </h3>
        {matches.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No matches recorded yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px' }}>Date</th>
                  <th style={{ padding: '8px 6px' }}>Tournament</th>
                  <th style={{ padding: '8px 6px' }}>Stage</th>
                  <th style={{ padding: '8px 6px' }}>Opponent</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => {
                  const mDate = m.scheduled_start_time ? new Date(m.scheduled_start_time).toLocaleDateString() : '—';
                  const oppName = m.opponent_team_name || 'Opponent';
                  const outcomeText = m.is_win ? 'Won' : m.result_type === 'TIED' ? 'Tied' : m.status === 'ABANDONED' ? 'Abandoned' : 'Lost';
                  const outcomeColor = m.is_win ? '#10b981' : m.result_type === 'TIED' ? '#f59e0b' : 'var(--text-secondary)';

                  return (
                    <tr key={m.match_id} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
                      <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>{mDate}</td>
                      <td style={{ padding: '8px 6px', color: '#f8fafc', fontWeight: 600 }}>{m.tournament_name || 'Tournament'}</td>
                      <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>{m.stage || 'LEAGUE'}</td>
                      <td style={{ padding: '8px 6px', color: '#38bdf8' }}>{oppName}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: outcomeColor }}>
                        {outcomeText}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        .stat-box {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(51, 65, 85, 0.5);
          border-radius: 8px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .stat-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          font-weight: 600;
        }
        .stat-value {
          font-size: 1.15rem;
          font-weight: 800;
          color: #f8fafc;
        }
      `}</style>
    </div>
  );
}
