import React from 'react';
import { PlayoffBracket } from '../tournament/PlayoffBracket.jsx';

export function PlayoffAdminTab({
  playoffData,
  standings,
  venues,
  onOpenGenerateModal,
  onSelectMatch,
  onOpenResolveMatch,
  onOpenAssignScorer,
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}
      >
        <div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc' }}>
            🎯 Playoff Bracket Management
          </h3>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '2px' }}>
            Configure knockout stages, seed qualified teams from league standings, and manage finals progression.
          </p>
        </div>

        {(!playoffData?.matches || playoffData.matches.length === 0) && (
          <button
            onClick={onOpenGenerateModal}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: 'none',
              background: '#0284c7',
              color: '#ffffff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ⚡ Generate Playoff Bracket
          </button>
        )}
      </div>

      {/* Visual Bracket Component */}
      <PlayoffBracket
        playoffData={playoffData}
        onSelectMatch={onSelectMatch}
        onOpenGenerateModal={onOpenGenerateModal}
        canManage={true}
      />

      {/* Playoff Match Management Table */}
      {playoffData?.matches?.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', marginBottom: '12px' }}>
            Knockout Fixture Controls
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {playoffData.matches.map((match) => (
              <div
                key={match.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 18px',
                  background: '#1e293b',
                  borderRadius: '10px',
                  border: '1px solid #334155',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase' }}>
                    {match.stage}
                  </span>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc', marginTop: '4px' }}>
                    {match.team_a_name || match.team_a_placeholder || 'TBD'} vs{' '}
                    {match.team_b_name || match.team_b_placeholder || 'TBD'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                    Status: <strong style={{ color: '#cbd5e1' }}>{match.status}</strong>
                    {match.winner_name && ` • Winner: ${match.winner_name}`}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {onOpenAssignScorer && (
                    <button
                      onClick={() => onOpenAssignScorer(match)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid #475569',
                        background: 'transparent',
                        color: '#cbd5e1',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Assign Scorer
                    </button>
                  )}
                  {onOpenResolveMatch && match.status !== 'COMPLETED' && match.status !== 'ABANDONED' && (
                    <button
                      onClick={() => onOpenResolveMatch(match)}
                      disabled={!match.team_a_id || !match.team_b_id}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: 'none',
                        background: !match.team_a_id || !match.team_b_id ? '#475569' : '#10b981',
                        color: '#ffffff',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: !match.team_a_id || !match.team_b_id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Resolve Match
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
