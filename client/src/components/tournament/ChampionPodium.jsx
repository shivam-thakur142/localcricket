import React from 'react';

export function ChampionPodium({ champion, runnerUp, tournamentName }) {
  if (!champion) return null;

  return (
    <div
      className="card"
      style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #0f172a 100%)',
        border: '2px solid #fbbf24',
        borderRadius: '16px',
        padding: '28px',
        textAlign: 'center',
        boxShadow: '0 8px 32px rgba(251, 191, 36, 0.2)',
        marginBottom: '24px',
      }}
    >
      <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🏆</div>
      <span
        style={{
          fontSize: '0.8rem',
          fontWeight: 800,
          color: '#fbbf24',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        TOURNAMENT CHAMPION
      </span>
      <h2
        style={{
          fontSize: '2rem',
          fontWeight: 900,
          color: '#ffffff',
          marginTop: '6px',
          marginBottom: '4px',
        }}
      >
        {champion.team_name}
      </h2>
      <span
        style={{
          fontSize: '1rem',
          fontWeight: 700,
          color: '#93c5fd',
          display: 'inline-block',
          marginBottom: '20px',
        }}
      >
        ({champion.short_name})
      </span>

      {runnerUp && (
        <div
          style={{
            marginTop: '12px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>🥈</span>
          <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>
            Runner-Up: <strong style={{ color: '#f8fafc' }}>{runnerUp.team_name}</strong> ({runnerUp.short_name})
          </span>
        </div>
      )}
    </div>
  );
}
