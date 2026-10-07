import React, { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { Badge } from '../common/Badge.jsx';

export function AwardsTab({ tournamentId, onSelectPlayer, onSelectTeam }) {
  const [awardsData, setAwardsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);

    api
      .getTournamentAwards(tournamentId)
      .then((res) => {
        if (!isCancelled) {
          setAwardsData(res.data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setError(err.message || 'Failed to load tournament awards');
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [tournamentId]);

  if (loading) {
    return (
      <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <p>Loading tournament awards & MVP standings...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: '24px', textAlign: 'center', color: '#ef4444' }}>
        <p>Error loading awards: {error}</p>
      </div>
    );
  }

  if (!awardsData) {
    return null;
  }

  const {
    mvp,
    mvp_podium = [],
    best_batter,
    best_bowler,
    maximum_sixes,
    most_economical_bowler,
    qualification_minimum_balls = 0,
  } = awardsData;

  const hasAnyMatches = Boolean(
    mvp || best_batter || best_bowler || maximum_sixes || most_economical_bowler
  );

  if (!hasAnyMatches) {
    return (
      <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
        <span style={{ fontSize: '2.5rem' }}>🏅</span>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc', marginTop: '8px' }}>
          Awards in Deliberation
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '400px', margin: '8px auto 0 auto' }}>
          Awards and MVP points will automatically be tabulated as soon as the first match in this tournament is completed.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* MVP SECTION */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)', border: '1px solid #4338ca' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: '#a5b4fc', fontWeight: 700, textTransform: 'uppercase' }}>
              Most Valuable Player
            </span>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', margin: '2px 0 0 0' }}>
              🏆 Tournament MVP & Podium
            </h2>
          </div>
          <Badge variant="accent">Authoritative Points Engine</Badge>
        </div>

        {/* Podium Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
          {mvp_podium.map((p, idx) => {
            const isWinner = idx === 0;
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
            const medalColor = idx === 0 ? '#fbbf24' : idx === 1 ? '#cbd5e1' : '#d97706';

            return (
              <div
                key={p.player_id}
                style={{
                  background: isWinner ? 'rgba(30, 41, 59, 0.9)' : 'rgba(15, 23, 42, 0.7)',
                  border: isWinner ? '2px solid #fbbf24' : '1px solid rgba(51, 65, 85, 0.6)',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '1.5rem' }}>{medal}</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: medalColor }}>
                      RANK #{idx + 1}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                    {onSelectPlayer ? (
                      <button
                        type="button"
                        onClick={() => onSelectPlayer(p.player_id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: '#f8fafc',
                          fontSize: '1.15rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          textAlign: 'left',
                          textDecoration: 'underline',
                        }}
                      >
                        {p.player_name}
                      </button>
                    ) : (
                      p.player_name
                    )}
                  </h3>

                  {p.team_name && (
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '2px' }}>
                      {onSelectTeam && p.team_id ? (
                        <button
                          type="button"
                          onClick={() => onSelectTeam(p.team_id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: '#94a3b8',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          {p.team_name}
                        </button>
                      ) : (
                        p.team_name
                      )}
                    </div>
                  )}

                  <div style={{ marginTop: '14px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: medalColor }}>
                      {p.total_points}
                      <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginLeft: '6px' }}>
                        MVP pts
                      </span>
                    </div>
                  </div>
                </div>

                {/* Point Breakdown Pill Strip */}
                <div style={{ borderTop: '1px solid rgba(51, 65, 85, 0.4)', paddingTop: '10px', fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Batting ({p.batting?.runs || 0}r, {p.batting?.milestone_bonus > 0 ? `+${p.batting.milestone_bonus} bonus` : '0b'}):</span>
                    <strong style={{ color: '#38bdf8' }}>{p.batting?.points || 0} pts</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Bowling ({p.bowling?.wickets || 0}w, {p.bowling?.milestone_bonus > 0 ? `+${p.bowling.milestone_bonus} bonus` : '0b'}):</span>
                    <strong style={{ color: '#ef4444' }}>{p.bowling?.points || 0} pts</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Fielding ({p.fielding?.catches || 0}c, {p.fielding?.run_outs || 0}ro, {p.fielding?.stumpings || 0}st):</span>
                    <strong style={{ color: '#10b981' }}>{p.fielding?.points || 0} pts</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SPECIAL AWARDS GRID */}
      <div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc', marginBottom: '14px' }}>
          🎖️ Individual Accolades
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
          {/* ORANGE CAP / BEST BATTER */}
          <div className="card" style={{ background: 'linear-gradient(135deg, #431407 0%, #0f172a 100%)', border: '1px solid #ea580c' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.8rem', color: '#fdba74', fontWeight: 700 }}>ORANGE CAP</span>
              <span style={{ fontSize: '1.4rem' }}>🏏</span>
            </div>
            <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
              {best_batter ? (
                onSelectPlayer ? (
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(best_batter.player_id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#f8fafc',
                      fontSize: '1.15rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      textAlign: 'left',
                      textDecoration: 'underline',
                    }}
                  >
                    {best_batter.player_name}
                  </button>
                ) : (
                  best_batter.player_name
                )
              ) : (
                'No Qualifiers Yet'
              )}
            </h4>
            {best_batter?.team_name && (
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '2px' }}>
                {best_batter.team_name}
              </div>
            )}
            {best_batter && (
              <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fb923c' }}>
                    {best_batter.runs} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>runs</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <div>Avg: <strong style={{ color: '#f8fafc' }}>{best_batter.average}</strong></div>
                  <div>SR: <strong style={{ color: '#f8fafc' }}>{best_batter.strike_rate}</strong></div>
                  <div>HS: <strong style={{ color: '#f8fafc' }}>{best_batter.highest_score}</strong></div>
                </div>
              </div>
            )}
          </div>

          {/* PURPLE CAP / BEST BOWLER */}
          <div className="card" style={{ background: 'linear-gradient(135deg, #3b0764 0%, #0f172a 100%)', border: '1px solid #9333ea' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.8rem', color: '#d8b4fe', fontWeight: 700 }}>PURPLE CAP</span>
              <span style={{ fontSize: '1.4rem' }}>🎯</span>
            </div>
            <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
              {best_bowler ? (
                onSelectPlayer ? (
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(best_bowler.player_id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#f8fafc',
                      fontSize: '1.15rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      textAlign: 'left',
                      textDecoration: 'underline',
                    }}
                  >
                    {best_bowler.player_name}
                  </button>
                ) : (
                  best_bowler.player_name
                )
              ) : (
                'No Qualifiers Yet'
              )}
            </h4>
            {best_bowler?.team_name && (
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '2px' }}>
                {best_bowler.team_name}
              </div>
            )}
            {best_bowler && (
              <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#c084fc' }}>
                    {best_bowler.wickets} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>wkts</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <div>Econ: <strong style={{ color: '#f8fafc' }}>{best_bowler.economy}</strong></div>
                  <div>Avg: <strong style={{ color: '#f8fafc' }}>{best_bowler.average}</strong></div>
                  <div>Best: <strong style={{ color: '#f8fafc' }}>{best_bowler.best_figures}</strong></div>
                </div>
              </div>
            )}
          </div>

          {/* MAXIMUM SIXES */}
          <div className="card" style={{ background: 'linear-gradient(135deg, #1c1917 0%, #0f172a 100%)', border: '1px solid #78716c' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.8rem', color: '#facc15', fontWeight: 700 }}>MAXIMUM SIXES</span>
              <span style={{ fontSize: '1.4rem' }}>💥</span>
            </div>
            <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
              {maximum_sixes ? (
                onSelectPlayer ? (
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(maximum_sixes.player_id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#f8fafc',
                      fontSize: '1.15rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      textAlign: 'left',
                      textDecoration: 'underline',
                    }}
                  >
                    {maximum_sixes.player_name}
                  </button>
                ) : (
                  maximum_sixes.player_name
                )
              ) : (
                'No Qualifiers Yet'
              )}
            </h4>
            {maximum_sixes?.team_name && (
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '2px' }}>
                {maximum_sixes.team_name}
              </div>
            )}
            {maximum_sixes && (
              <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#facc15' }}>
                    {maximum_sixes.sixes} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>sixes</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <div>Balls: <strong style={{ color: '#f8fafc' }}>{maximum_sixes.balls_faced}</strong></div>
                  <div>Runs: <strong style={{ color: '#f8fafc' }}>{maximum_sixes.runs}</strong></div>
                </div>
              </div>
            )}
          </div>

          {/* MOST ECONOMICAL BOWLER */}
          <div className="card" style={{ background: 'linear-gradient(135deg, #064e3b 0%, #0f172a 100%)', border: '1px solid #059669' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.8rem', color: '#6ee7b7', fontWeight: 700 }}>ECONOMY CHAMPION</span>
              <span style={{ fontSize: '1.4rem' }}>🛡️</span>
            </div>
            <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
              {most_economical_bowler ? (
                onSelectPlayer ? (
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(most_economical_bowler.player_id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#f8fafc',
                      fontSize: '1.15rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      textAlign: 'left',
                      textDecoration: 'underline',
                    }}
                  >
                    {most_economical_bowler.player_name}
                  </button>
                ) : (
                  most_economical_bowler.player_name
                )
              ) : (
                'No Qualifiers Yet'
              )}
            </h4>
            {most_economical_bowler?.team_name && (
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '2px' }}>
                {most_economical_bowler.team_name}
              </div>
            )}
            {most_economical_bowler && (
              <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#34d399' }}>
                    {most_economical_bowler.economy} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>econ</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <div>Balls: <strong style={{ color: '#f8fafc' }}>{most_economical_bowler.legal_balls}</strong></div>
                  <div>Wkts: <strong style={{ color: '#f8fafc' }}>{most_economical_bowler.wickets}</strong></div>
                  <div>Runs: <strong style={{ color: '#f8fafc' }}>{most_economical_bowler.runs_conceded}</strong></div>
                </div>
              </div>
            )}
            <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(51, 65, 85, 0.4)', fontSize: '0.75rem', color: '#a7f3d0' }}>
              ✓ Qualification: Min {qualification_minimum_balls} legal balls bowled
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
