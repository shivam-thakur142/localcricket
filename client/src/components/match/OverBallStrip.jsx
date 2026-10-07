import React from 'react';

export function OverBallStrip({ balls = [], currentOverNumber = 1 }) {
  const getBallStyle = (ball) => {
    if (ball.is_wicket) {
      return { background: '#ef4444', color: '#ffffff', border: '1px solid #dc2626' };
    }
    if (ball.extra_type === 'WIDE' || ball.extra_type === 'NO_BALL') {
      return { background: '#f59e0b', color: '#1e293b', border: '1px solid #d97706' };
    }
    if (ball.runs_batter === 4) {
      return { background: '#10b981', color: '#ffffff', border: '1px solid #059669' };
    }
    if (ball.runs_batter === 6) {
      return { background: '#8b5cf6', color: '#ffffff', border: '1px solid #7c3aed' };
    }
    if (ball.runs_batter === 0 && !ball.extra_type) {
      return { background: '#334155', color: '#94a3b8', border: '1px solid #475569' };
    }
    return { background: '#1e293b', color: '#f8fafc', border: '1px solid #475569' };
  };

  const getBallLabel = (ball) => {
    if (ball.is_wicket) return 'W';
    if (ball.extra_type === 'WIDE') return ball.runs_extras > 1 ? `${ball.runs_extras}Wd` : 'Wd';
    if (ball.extra_type === 'NO_BALL') return ball.runs_batter > 0 ? `${ball.runs_batter + 1}Nb` : 'Nb';
    if (ball.extra_type === 'BYE') return `${ball.runs_extras}B`;
    if (ball.extra_type === 'LEG_BYE') return `${ball.runs_extras}Lb`;
    if (ball.runs_batter === 0) return '•';
    return `${ball.runs_batter}`;
  };

  return (
    <div className="card" style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
          Over #{currentOverNumber} Balls
        </span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {balls.length} deliveries
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        {balls.length === 0 ? (
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Awaiting first delivery of the over...
          </span>
        ) : (
          balls.map((b, idx) => {
            const style = getBallStyle(b);
            return (
              <div
                key={b.id || idx}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  flexShrink: 0,
                  ...style,
                }}
              >
                {getBallLabel(b)}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
