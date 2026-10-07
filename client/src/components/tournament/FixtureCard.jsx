import React from 'react';
import { Badge } from '../common/Badge.jsx';

export function FixtureCard({ match, onSelectScorer, onSelectSpectator }) {
  const isLive = match.status === 'IN_PROGRESS';
  const isCompleted = match.status === 'COMPLETED';
  const isScheduled = match.status === 'SCHEDULED';

  const dateStr = match.scheduled_start_time
    ? new Date(match.scheduled_start_time).toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <div
      style={{
        padding: '14px',
        borderRadius: '10px',
        border: '1px solid var(--border-color)',
        background: isLive ? 'rgba(56, 189, 248, 0.08)' : 'var(--bg-accent)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
          Match #{match.match_number} • {match.stage} ({match.overs_quota} ov)
        </span>
        <div>
          {isLive && <Badge variant="live">● LIVE</Badge>}
          {isCompleted && <Badge variant="completed">COMPLETED</Badge>}
          {isScheduled && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>SCHEDULED</span>}
        </div>
      </div>

      {/* Teams Line */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
            {match.team_a_name} <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>vs</span> {match.team_b_name}
          </div>
          {match.venue_name && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              📍 {match.venue_name} {match.ground_name ? `(${match.ground_name})` : ''}
            </span>
          )}
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{dateStr}</span>
      </div>

      {/* Completed Outcome or In-Progress */}
      {isCompleted && (
        <div style={{ padding: '6px 10px', background: 'rgba(16, 185, 129, 0.15)', borderRadius: '6px', color: '#6ee7b7', fontSize: '0.85rem', fontWeight: 600 }}>
          🏆 {match.result_type === 'TIED' ? 'Match Tied' : match.winner_name ? `${match.winner_name} won by ${match.result_margin_runs ? `${match.result_margin_runs} runs` : `${match.result_margin_wickets} wkts`}` : 'Match Concluded'}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <button
          onClick={() => onSelectScorer(match.id)}
          style={{
            flex: 1,
            padding: '8px',
            borderRadius: '6px',
            border: 'none',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            background: isLive ? '#0284c7' : '#334155',
            color: '#ffffff',
          }}
        >
          {isLive ? '⚡ Score Live' : isScheduled ? '🏏 Setup & Score' : '↺ Review / Undo'}
        </button>
        <button
          onClick={() => onSelectSpectator(match.id)}
          style={{
            flex: 1,
            padding: '8px',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            background: 'transparent',
            color: 'var(--text-primary)',
          }}
        >
          👁️ Match Center
        </button>
      </div>
    </div>
  );
}
