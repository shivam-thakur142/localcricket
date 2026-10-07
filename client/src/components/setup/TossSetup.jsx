import React, { useState } from 'react';
import { Button } from '../common/Button.jsx';

export function TossSetup({
  match,
  onSubmitToss,
  isSubmitting = false,
}) {
  const [tossWinnerTeamId, setTossWinnerTeamId] = useState(match?.team_a_id || '');
  const [tossDecision, setTossDecision] = useState('BAT');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!tossWinnerTeamId) return;
    onSubmitToss({
      tossWinnerTeamId,
      tossDecision,
    });
  };

  return (
    <div className="card">
      <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#38bdf8', marginBottom: '12px' }}>
        Toss & Decision
      </h3>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
            Toss Won By
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <label
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                border: tossWinnerTeamId === match?.team_a_id ? '2px solid #38bdf8' : '1px solid var(--border-color)',
                background: tossWinnerTeamId === match?.team_a_id ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-accent)',
                cursor: 'pointer',
                textAlign: 'center',
                fontWeight: 600,
              }}
            >
              <input
                type="radio"
                name="toss_winner"
                checked={tossWinnerTeamId === match?.team_a_id}
                onChange={() => setTossWinnerTeamId(match?.team_a_id)}
                style={{ display: 'none' }}
              />
              {match?.team_a_name}
            </label>

            <label
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                border: tossWinnerTeamId === match?.team_b_id ? '2px solid #38bdf8' : '1px solid var(--border-color)',
                background: tossWinnerTeamId === match?.team_b_id ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-accent)',
                cursor: 'pointer',
                textAlign: 'center',
                fontWeight: 600,
              }}
            >
              <input
                type="radio"
                name="toss_winner"
                checked={tossWinnerTeamId === match?.team_b_id}
                onChange={() => setTossWinnerTeamId(match?.team_b_id)}
                style={{ display: 'none' }}
              />
              {match?.team_b_name}
            </label>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
            Elected To
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <label
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                border: tossDecision === 'BAT' ? '2px solid #10b981' : '1px solid var(--border-color)',
                background: tossDecision === 'BAT' ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-accent)',
                cursor: 'pointer',
                textAlign: 'center',
                fontWeight: 600,
              }}
            >
              <input
                type="radio"
                name="toss_decision"
                checked={tossDecision === 'BAT'}
                onChange={() => setTossDecision('BAT')}
                style={{ display: 'none' }}
              />
              🏏 Bat First
            </label>

            <label
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                border: tossDecision === 'BOWL' ? '2px solid #10b981' : '1px solid var(--border-color)',
                background: tossDecision === 'BOWL' ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-accent)',
                cursor: 'pointer',
                textAlign: 'center',
                fontWeight: 600,
              }}
            >
              <input
                type="radio"
                name="toss_decision"
                checked={tossDecision === 'BOWL'}
                onChange={() => setTossDecision('BOWL')}
                style={{ display: 'none' }}
              />
              ⚾ Bowl First
            </label>
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          disabled={!tossWinnerTeamId || isSubmitting}
          style={{ width: '100%', marginTop: '6px' }}
        >
          Confirm Toss & Decision
        </Button>
      </form>
    </div>
  );
}
