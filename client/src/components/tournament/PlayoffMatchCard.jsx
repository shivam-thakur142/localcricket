import React from 'react';

export function PlayoffMatchCard({ match, stageName, onSelectMatch }) {
  if (!match) {
    return (
      <div
        className="card"
        style={{
          padding: '16px',
          border: '1px dashed #475569',
          background: '#0f172a',
          borderRadius: '10px',
          opacity: 0.7,
        }}
      >
        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>{stageName}</span>
        <div style={{ marginTop: '8px', color: '#64748b', fontSize: '0.85rem' }}>Fixture not yet generated</div>
      </div>
    );
  }

  const isLive = match.status === 'IN_PROGRESS' || match.status === 'INNINGS_BREAK';
  const isCompleted = match.status === 'COMPLETED';
  const isAbandoned = match.status === 'ABANDONED' || match.status === 'NO_RESULT';

  const teamAName = match.team_a_name || match.team_a_placeholder || 'TBD (Team A)';
  const teamBName = match.team_b_name || match.team_b_placeholder || 'TBD (Team B)';

  const isTeamAWinner = isCompleted && match.winner_team_id && match.winner_team_id === match.team_a_id;
  const isTeamBWinner = isCompleted && match.winner_team_id && match.winner_team_id === match.team_b_id;

  const scoreA = match.innings_summary?.find((inn) => inn.batting_team_id === match.team_a_id);
  const scoreB = match.innings_summary?.find((inn) => inn.batting_team_id === match.team_b_id);

  return (
    <div
      className="card"
      style={{
        padding: '16px',
        background: '#1e293b',
        border: isLive ? '1px solid #ef4444' : isCompleted ? '1px solid #10b981' : '1px solid #334155',
        borderRadius: '10px',
        boxShadow: isLive ? '0 0 12px rgba(239, 68, 68, 0.25)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>
          {stageName || match.stage}
        </span>
        {isLive && (
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: '999px',
              background: '#ef4444',
              color: '#ffffff',
              letterSpacing: '0.05em',
            }}
          >
            ● LIVE
          </span>
        )}
        {isCompleted && (
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '999px',
              background: '#10b981',
              color: '#ffffff',
            }}
          >
            ✓ FINAL
          </span>
        )}
        {isAbandoned && (
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '999px',
              background: '#f59e0b',
              color: '#ffffff',
            }}
          >
            ABANDONED
          </span>
        )}
        {!isLive && !isCompleted && !isAbandoned && (
          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
            Match #{match.match_number}
          </span>
        )}
      </div>

      {/* Team A Row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 8px',
          borderRadius: '6px',
          background: isTeamAWinner ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
          borderLeft: isTeamAWinner ? '3px solid #10b981' : '3px solid transparent',
        }}
      >
        <span
          style={{
            fontWeight: isTeamAWinner ? 800 : 600,
            color: match.team_a_id ? '#f8fafc' : '#94a3b8',
            fontSize: '0.9rem',
          }}
        >
          {teamAName}
        </span>
        {scoreA && (
          <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.85rem' }}>
            {scoreA.runs}/{scoreA.wickets} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>({scoreA.overs})</span>
          </span>
        )}
      </div>

      {/* Team B Row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 8px',
          borderRadius: '6px',
          background: isTeamBWinner ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
          borderLeft: isTeamBWinner ? '3px solid #10b981' : '3px solid transparent',
        }}
      >
        <span
          style={{
            fontWeight: isTeamBWinner ? 800 : 600,
            color: match.team_b_id ? '#f8fafc' : '#94a3b8',
            fontSize: '0.9rem',
          }}
        >
          {teamBName}
        </span>
        {scoreB && (
          <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.85rem' }}>
            {scoreB.runs}/{scoreB.wickets} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>({scoreB.overs})</span>
          </span>
        )}
      </div>

      {/* Action / Navigation */}
      {onSelectMatch && match.id && (
        <button
          onClick={() => onSelectMatch(match.id)}
          style={{
            marginTop: '4px',
            padding: '6px 12px',
            fontSize: '0.8rem',
            fontWeight: 700,
            borderRadius: '6px',
            border: 'none',
            background: isLive ? '#ef4444' : '#0284c7',
            color: '#ffffff',
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          {isLive ? '🔴 Watch Live Center' : isCompleted ? 'View Authoritative Scorecard' : 'View Match Info'}
        </button>
      )}
    </div>
  );
}
