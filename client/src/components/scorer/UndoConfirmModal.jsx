import React, { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';

export function UndoConfirmModal({
  isOpen,
  onClose,
  onConfirmUndo,
  currentSequence,
  isSubmitting = false,
}) {
  const [reason, setReason] = useState('Scorer correction');

  const handleConfirm = () => {
    onConfirmUndo({
      expectedDeliverySequence: currentSequence,
      reversionReason: reason,
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Undo Last Delivery">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <p style={{ fontSize: '0.95rem', color: '#f8fafc' }}>
          Are you sure you want to revert delivery <strong>#{currentSequence}</strong>?
        </p>

        <div style={{ padding: '10px 12px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #dc2626', borderRadius: '8px', fontSize: '0.85rem', color: '#fca5a5' }}>
          ⚠️ This will non-destructively flag the ball as reverted and recalculate all match totals, striker positions, and player figures.
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
            Correction Reason
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Scorer pressed 4 instead of 1"
            style={{ width: '100%', padding: '10px', background: 'var(--bg-accent)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
          <Button variant="outline" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={isSubmitting}
            onClick={handleConfirm}
            style={{ flex: 1 }}
          >
            Confirm Reversion
          </Button>
        </div>
      </div>
    </Modal>
  );
}
