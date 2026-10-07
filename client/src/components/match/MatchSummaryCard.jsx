import React, { useState } from 'react';
import { Badge } from '../common/Badge.jsx';

export function MatchSummaryCard({ match, onSelectPlayer, onSelectTeam }) {
  const [copied, setCopied] = useState(false);
  if (!match) return null;

  const getResultText = () => {
    if (match.status === 'ABANDONED' || match.result_type === 'NO_RESULT') {
      return match.abandonment_reason ? `Match Abandoned: ${match.abandonment_reason}` : 'Match Abandoned (No Result)';
    }
    if (match.result_type === 'TIED') {
      return match.winner_team_name ? `Match Tied (${match.winner_team_name} won via Super Over)` : 'Match Tied';
    }
    if (match.winner_team_name) {
      if (match.margin_runs) return `${match.winner_team_name} won by ${match.margin_runs} runs`;
      if (match.margin_wickets) return `${match.winner_team_name} won by ${match.margin_wickets} wickets`;
      return `${match.winner_team_name} won`;
    }
    if (match.status === 'IN_PROGRESS') return 'Match In Progress';
    if (match.status === 'SCHEDULED') return 'Match Scheduled';
    return match.status;
  };

  const tossText = match.toss_winner_team_name
    ? `${match.toss_winner_team_name} won the toss and elected to ${match.toss_decision?.toLowerCase() || 'bat'}`
    : null;

  const generateWhatsAppSummary = () => {
    const lines = [];
    lines.push(`🏆 *${match.tournament_name || 'Cricket Match'}* - Match #${match.match_number || 1}`);
    if (match.venue_name || match.city) {
      lines.push(`📍 ${[match.venue_name, match.city].filter(Boolean).join(', ')}`);
    }
    if (match.team_a_name) {
      const aScore = match.team_a_score ? ` ${match.team_a_score}` : '';
      lines.push(`🏏 ${match.team_a_name}:${aScore}`);
    }
    if (match.team_b_name) {
      const bScore = match.team_b_score ? ` ${match.team_b_score}` : '';
      lines.push(`🏏 ${match.team_b_name}:${bScore}`);
    }
    lines.push(`🎯 Result: ${getResultText()}`);
    if (match.player_of_match_name) {
      lines.push(`⭐ Player of the Match: ${match.player_of_match_name}`);
    }
    const currentUrl = typeof window !== 'undefined' ? window.location?.href : 'LocalCricket';
    lines.push(`📊 Full Scorecard: ${currentUrl}`);
    return lines.join('\n');
  };

  const handleCopySummary = async () => {
    const text = generateWhatsAppSummary();
    try {
      if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // Fallback
    }
  };

  return (
    <div
      className="card"
      style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        border: '1px solid var(--border-color)',
        padding: '16px',
        marginBottom: '16px',
        borderRadius: '12px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Badge variant="neutral">
            {match.stage || 'LEAGUE'} • Match #{match.match_number || 1}
          </Badge>
          {match.tournament_name && (
            <span style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 600 }}>
              {match.tournament_name}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {match.status === 'COMPLETED' && <Badge variant="completed">COMPLETED</Badge>}
          {match.status === 'IN_PROGRESS' && <Badge variant="live">● LIVE</Badge>}
          {match.status === 'ABANDONED' && <Badge variant="danger">ABANDONED</Badge>}
          {match.status === 'SCHEDULED' && <Badge variant="neutral">SCHEDULED</Badge>}

          <button
            type="button"
            onClick={handleCopySummary}
            title="Copy formatted summary to share on WhatsApp"
            style={{
              background: copied ? '#059669' : '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '3px 8px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s',
            }}
          >
            {copied ? '✅ Copied!' : '📋 Share Summary'}
          </button>
        </div>
      </div>

      {/* Match Outcome Headline */}
      <div style={{ marginTop: '6px', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
          {getResultText()}
        </h3>
        {tossText && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            🪙 {tossText}
          </p>
        )}
      </div>

      {/* POTM & Venue Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          paddingTop: '10px',
          borderTop: '1px solid rgba(51, 65, 85, 0.4)',
          fontSize: '0.85rem',
        }}
      >
        {match.player_of_match_name && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#f59e0b', fontWeight: 700 }}>⭐ Player of the Match:</span>
            {onSelectPlayer && match.player_of_match_id ? (
              <button
                type="button"
                onClick={() => onSelectPlayer(match.player_of_match_id)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: '#38bdf8',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                {match.player_of_match_name}
              </button>
            ) : (
              <strong style={{ color: '#f8fafc' }}>{match.player_of_match_name}</strong>
            )}
          </div>
        )}

        {(match.venue_name || match.city) && (
          <div style={{ color: 'var(--text-secondary)' }}>
            📍 <span>{match.venue_name ? `${match.venue_name}, ` : ''}{match.city || ''}</span>
          </div>
        )}
      </div>
    </div>
  );
}
