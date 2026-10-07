import React, { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';

export function NextBowlerModal({
  isOpen,
  onClose,
  onSubmitNextBowler,
  lastBowlerId,
  bowlingSquad = [],
  nextOverNumber = 2,
}) {
  const [selectedBowlerId, setSelectedBowlerId] = useState('');

  const eligibleBowlers = bowlingSquad.filter((b) => b.player_id !== lastBowlerId);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedBowlerId) return;
    onSubmitNextBowler(selectedBowlerId);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={null} title={`Select Bowler for Over #${nextOverNumber}`}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          The previous over has completed. Nominate the bowler for the next over.
        </p>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
            Bowling Team Players
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
            {bowlingSquad.map((b) => {
              const isConsecutive = b.player_id === lastBowlerId;
              const isSelected = selectedBowlerId === b.player_id;

              return (
                <div
                  key={b.player_id}
                  onClick={() => !isConsecutive && setSelectedBowlerId(b.player_id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid #10b981' : '1px solid var(--border-color)',
                    background: isConsecutive ? 'rgba(51, 65, 85, 0.3)' : isSelected ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-accent)',
                    opacity: isConsecutive ? 0.45 : 1,
                    cursor: isConsecutive ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontWeight: 600, color: isConsecutive ? 'var(--text-muted)' : '#f8fafc' }}>
                    {b.full_name || b.player_name} #{b.jersey_number}
                  </span>
                  {isConsecutive && (
                    <span style={{ fontSize: '0.75rem', color: '#fca5a5', fontWeight: 600 }}>
                      Consecutive Over (Restricted)
                    </span>
                  )}
                  {isSelected && (
                    <span style={{ color: '#10b981', fontWeight: 700 }}>✓ Selected</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          disabled={!selectedBowlerId}
          style={{ marginTop: '8px' }}
        >
          Start Over #{nextOverNumber}
        </Button>
      </form>
    </Modal>
  );
}
