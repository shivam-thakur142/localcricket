// ====================================================================
// COMMENTARY FEED: FILTERABLE BALL-BY-BALL COMMENTARY TIMELINE
// ====================================================================

import React from 'react';

export function CommentaryFeed({ commentary = [], activeFilter = 'all', onFilterChange }) {
  const filterOptions = [
    { id: 'all', label: 'All Deliveries' },
    { id: 'boundaries', label: 'Boundaries (4s & 6s) 🟢' },
    { id: 'wickets', label: 'Wickets 🔴' },
  ];

  return (
    <div className="card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      {/* Header and Filter Pills */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
          🎙️ Ball-by-Ball Commentary
        </h3>

        <div style={{ display: 'flex', gap: '6px' }}>
          {filterOptions.map((f) => (
            <button
              key={f.id}
              onClick={() => onFilterChange(f.id)}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: activeFilter === f.id ? '#0284c7' : 'var(--bg-accent)',
                color: activeFilter === f.id ? '#ffffff' : 'var(--text-secondary)',
                transition: 'background 0.2s ease',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Deliveries Timeline */}
      {commentary.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
          <p>No deliveries match the selected filter.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {commentary.map((del, idx) => {
            const isFour = del.runs_batter === 4;
            const isSix = del.runs_batter === 6;
            const isWicket = del.is_wicket;
            const isExtra = del.extra_type && del.extra_type !== 'NONE';

            let badgeBg = '#334155';
            let badgeText = `${del.runs_batter + del.runs_extras}`;
            if (isFour) {
              badgeBg = '#10b981';
              badgeText = '4';
            } else if (isSix) {
              badgeBg = '#8b5cf6';
              badgeText = '6';
            } else if (isWicket) {
              badgeBg = '#ef4444';
              badgeText = 'W';
            } else if (del.extra_type === 'WIDE') {
              badgeBg = '#f59e0b';
              badgeText = 'WD';
            } else if (del.extra_type === 'NO_BALL') {
              badgeBg = '#f59e0b';
              badgeText = 'NB';
            } else if (del.runs_batter === 0 && del.runs_extras === 0) {
              badgeText = '•';
            }

            // Check if this delivery is the end of an over to render over summary
            const isLastBallOfOver = del.legal_ball_number === 6 || (del.is_legal && del.ball_number >= 6);

            return (
              <React.Fragment key={del.id || idx}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: isWicket ? 'rgba(239, 68, 68, 0.08)' : (isFour || isSix ? 'rgba(56, 189, 248, 0.05)' : 'transparent'),
                    borderBottom: '1px solid rgba(51, 65, 85, 0.4)',
                  }}
                >
                  {/* Over.Ball */}
                  <div style={{ minWidth: '42px', paddingTop: '2px' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#94a3b8' }}>
                      {del.over_number}.{del.legal_ball_number || del.ball_number}
                    </span>
                  </div>

                  {/* Outcome Badge */}
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: badgeBg,
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {badgeText}
                  </div>

                  {/* Description */}
                  <div style={{ flex: 1, fontSize: '0.85rem' }}>
                    <div style={{ color: '#f8fafc', fontWeight: 600 }}>
                      <span style={{ color: '#38bdf8' }}>{del.bowler_name || 'Bowler'}</span> to{' '}
                      <span style={{ color: '#f8fafc' }}>{del.striker_name || 'Striker'}</span>
                    </div>
                    <div style={{ color: isWicket ? '#ef4444' : 'var(--text-secondary)', marginTop: '2px' }}>
                      {del.commentary_text || (isWicket ? `OUT! (${del.wicket_type})` : `${del.runs_batter} run(s)`)}
                    </div>
                  </div>
                </div>

                {/* Over boundary banner */}
                {isLastBallOfOver && activeFilter === 'all' && (
                  <div
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      background: '#1e293b',
                      fontSize: '0.75rem',
                      color: '#94a3b8',
                      fontWeight: 700,
                      textAlign: 'center',
                      margin: '4px 0',
                    }}
                  >
                    End of Over {del.over_number}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
