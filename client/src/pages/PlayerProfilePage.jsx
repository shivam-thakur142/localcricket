import React, { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { Badge } from '../components/common/Badge.jsx';

export function PlayerProfilePage({ playerId, tournamentId, onBack }) {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [matches, setMatches] = useState([]);
  const [scopeToTournament, setScopeToTournament] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);

    const activeTournId = scopeToTournament ? tournamentId : null;

    Promise.all([
      api.getPlayerProfile(playerId),
      api.getPlayerStats(playerId, activeTournId),
      api.getPlayerMatches(playerId, activeTournId),
    ])
      .then(([profRes, statsRes, matchRes]) => {
        if (!isCancelled) {
          setProfile(profRes.data);
          setStats(statsRes.data);
          setMatches(matchRes.data || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setError(err.message || 'Failed to load player details');
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [playerId, tournamentId, scopeToTournament]);

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', paddingTop: '40px' }}>
        <p>Loading player profile & career stats...</p>
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
          <h3>Player Not Found</h3>
          <p>{error || 'The requested player could not be located.'}</p>
        </div>
      </div>
    );
  }

  const batting = stats?.batting || {};
  const bowling = stats?.bowling || {};
  const fielding = stats?.fielding || {};

  const initials = profile.full_name
    ? profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'P';

  const formatStyle = (style) => (style ? style.replace(/_/g, ' ') : '—');

  return (
    <div className="container">
      {/* Back button */}
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
              Career All-Time
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

      {/* Bio Header Card */}
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
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '1.6rem',
              fontWeight: 800,
            }}
          >
            {initials}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                {profile.full_name}
              </h1>
              {profile.nickname && (
                <span style={{ fontSize: '1.1rem', color: '#94a3b8', fontStyle: 'italic' }}>
                  "{profile.nickname}"
                </span>
              )}
              {profile.primary_role && <Badge variant="accent">{profile.primary_role}</Badge>}
            </div>

            <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '0.85rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
              <div>
                Batting:{' '}
                <strong style={{ color: '#f8fafc' }}>{formatStyle(profile.batting_style)}</strong>
              </div>
              <div>
                Bowling:{' '}
                <strong style={{ color: '#f8fafc' }}>{formatStyle(profile.bowling_style)}</strong>
              </div>
              <div>
                Matches Played:{' '}
                <strong style={{ color: '#38bdf8' }}>{stats?.matches_played ?? 0}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
        {/* Batting Card */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#38bdf8', marginBottom: '14px' }}>
            🏏 Batting Statistics
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '12px' }}>
            <div className="stat-box">
              <span className="stat-label">Innings</span>
              <strong className="stat-value">{batting.innings ?? 0}</strong>
            </div>
            <div className="stat-box">
              <span className="stat-label">Runs</span>
              <strong className="stat-value" style={{ color: '#f8fafc' }}>{batting.runs ?? 0}</strong>
            </div>
            <div className="stat-box">
              <span className="stat-label">Average</span>
              <strong className="stat-value">{batting.average != null ? batting.average : '—'}</strong>
            </div>
            <div className="stat-box">
              <span className="stat-label">Strike Rate</span>
              <strong className="stat-value">{batting.strike_rate != null ? batting.strike_rate : '—'}</strong>
            </div>
            <div className="stat-box">
              <span className="stat-label">High Score</span>
              <strong className="stat-value">{batting.highest_score_display || '—'}</strong>
            </div>
            <div className="stat-box">
              <span className="stat-label">50s / 100s</span>
              <strong className="stat-value">{batting.fifties ?? 0} / {batting.hundreds ?? 0}</strong>
            </div>
            <div className="stat-box">
              <span className="stat-label">4s / 6s</span>
              <strong className="stat-value">{batting.fours ?? 0} / {batting.sixes ?? 0}</strong>
            </div>
            <div className="stat-box">
              <span className="stat-label">Not Outs</span>
              <strong className="stat-value">{batting.not_outs ?? 0}</strong>
            </div>
          </div>
        </div>

        {/* Bowling Card */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#c084fc', marginBottom: '14px' }}>
            🎯 Bowling Statistics
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '12px' }}>
            <div className="stat-box">
              <span className="stat-label">Innings</span>
              <strong className="stat-value">{bowling.innings ?? 0}</strong>
            </div>
            <div className="stat-box">
              <span className="stat-label">Overs</span>
              <strong className="stat-value">{bowling.overs_display || '0.0'}</strong>
            </div>
            <div className="stat-box">
              <span className="stat-label">Wickets</span>
              <strong className="stat-value" style={{ color: '#ef4444' }}>{bowling.wickets ?? 0}</strong>
            </div>
            <div className="stat-box">
              <span className="stat-label">Average</span>
              <strong className="stat-value">{bowling.average != null ? bowling.average : '—'}</strong>
            </div>
            <div className="stat-box">
              <span className="stat-label">Economy</span>
              <strong className="stat-value">{bowling.economy != null ? bowling.economy : '—'}</strong>
            </div>
            <div className="stat-box">
              <span className="stat-label">Best Bowling</span>
              <strong className="stat-value">{bowling.best_figures || '—'}</strong>
            </div>
            <div className="stat-box">
              <span className="stat-label">Maidens</span>
              <strong className="stat-value">{bowling.maidens ?? 0}</strong>
            </div>
            <div className="stat-box">
              <span className="stat-label">3w / 5w</span>
              <strong className="stat-value">{bowling.three_wicket_hauls ?? 0} / {bowling.five_wicket_hauls ?? 0}</strong>
            </div>
          </div>
        </div>

        {/* Fielding Card */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#34d399', marginBottom: '14px' }}>
            🧤 Fielding Statistics
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
            <div className="stat-box">
              <span className="stat-label">Catches</span>
              <strong className="stat-value">{fielding.catches ?? 0}</strong>
            </div>
            <div className="stat-box">
              <span className="stat-label">Run Outs</span>
              <strong className="stat-value">{fielding.run_outs ?? 0}</strong>
            </div>
            <div className="stat-box">
              <span className="stat-label">Stumpings</span>
              <strong className="stat-value">{fielding.stumpings ?? 0}</strong>
            </div>
            <div className="stat-box">
              <span className="stat-label">Total Dismissals</span>
              <strong className="stat-value" style={{ color: '#34d399' }}>{fielding.total_dismissals ?? 0}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Match Log Section */}
      <div className="card" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', marginBottom: '14px' }}>
          📋 Recent Match Log ({matches.length})
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
                  <th style={{ padding: '8px 6px' }}>Opponent</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Batting</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Bowling</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => {
                  const mDate = m.scheduled_start_time ? new Date(m.scheduled_start_time).toLocaleDateString() : '—';
                  const batStr = m.batting
                    ? `${m.batting.runs_scored}${m.batting.is_out ? '' : '*'} (${m.batting.balls_faced})`
                    : 'DNB';
                  const bowlStr = m.bowling
                    ? `${m.bowling.overs}-${m.bowling.maidens}-${m.bowling.runs_conceded}-${m.bowling.wickets}`
                    : '—';

                  return (
                    <tr key={m.match_id} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
                      <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>{mDate}</td>
                      <td style={{ padding: '8px 6px', color: '#f8fafc', fontWeight: 600 }}>{m.tournament_name || 'Tournament'}</td>
                      <td style={{ padding: '8px 6px', color: '#38bdf8' }}>{m.opponent_team_name || 'Opponent'}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>{batStr}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#c084fc' }}>{bowlStr}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                        <span style={{ fontSize: '0.8rem', color: m.is_win ? '#10b981' : 'var(--text-secondary)' }}>
                          {m.is_win ? 'Won' : 'Lost / Other'}
                        </span>
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
