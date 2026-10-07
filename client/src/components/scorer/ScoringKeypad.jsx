import React from 'react';
import { Button } from '../common/Button.jsx';

export function ScoringKeypad({
  onRecordRuns,
  onOpenWicketModal,
  onOpenExtrasModal,
  onOpenUndoModal,
  isSubmitting = false,
  isFreeHit = false,
  isOverCompleted = false,
  isInningsCompleted = false,
}) {
  const isKeypadDisabled = isSubmitting || isOverCompleted || isInningsCompleted;

  return (
    <div className="card" style={{ padding: '16px' }}>
      {/* State warnings */}
      {isOverCompleted && !isInningsCompleted && (
        <div style={{ padding: '10px', background: '#78350f', border: '1px solid #d97706', borderRadius: '8px', color: '#fef3c7', fontWeight: 600, textAlign: 'center', marginBottom: '12px' }}>
          🔔 Over Complete! Please nominate the bowler for the next over.
        </div>
      )}

      {isInningsCompleted && (
        <div style={{ padding: '10px', background: '#064e3b', border: '1px solid #10b981', borderRadius: '8px', color: '#d1fae5', fontWeight: 600, textAlign: 'center', marginBottom: '12px' }}>
          🏁 Innings Complete!
        </div>
      )}

      {isFreeHit && !isOverCompleted && !isInningsCompleted && (
        <div style={{ padding: '8px', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid #f59e0b', borderRadius: '8px', color: '#fbbf24', fontWeight: 700, textAlign: 'center', marginBottom: '12px' }}>
          ⚡ FREE HIT DELIVERY — No bowler dismissals allowed (only Run Out / Obstructing)!
        </div>
      )}

      {/* Row 1: Runs 0, 1, 2, 3 */}
      <div className="keypad-grid" style={{ marginTop: 0 }}>
        <Button
          disabled={isKeypadDisabled}
          onClick={() => onRecordRuns(0)}
          className="keypad-btn keypad-btn-dot"
        >
          0
        </Button>
        <Button
          disabled={isKeypadDisabled}
          onClick={() => onRecordRuns(1)}
          className="keypad-btn keypad-btn-runs"
        >
          1
        </Button>
        <Button
          disabled={isKeypadDisabled}
          onClick={() => onRecordRuns(2)}
          className="keypad-btn keypad-btn-runs"
        >
          2
        </Button>
        <Button
          disabled={isKeypadDisabled}
          onClick={() => onRecordRuns(3)}
          className="keypad-btn keypad-btn-runs"
        >
          3
        </Button>
      </div>

      {/* Row 2: 4, 6, Wide, No-Ball */}
      <div className="keypad-grid">
        <Button
          disabled={isKeypadDisabled}
          onClick={() => onRecordRuns(4)}
          className="keypad-btn keypad-btn-four"
        >
          4
        </Button>
        <Button
          disabled={isKeypadDisabled}
          onClick={() => onRecordRuns(6)}
          className="keypad-btn keypad-btn-six"
        >
          6
        </Button>
        <Button
          disabled={isKeypadDisabled}
          onClick={() => onOpenExtrasModal('WIDE')}
          className="keypad-btn keypad-btn-extra"
        >
          Wd
        </Button>
        <Button
          disabled={isKeypadDisabled}
          onClick={() => onOpenExtrasModal('NO_BALL')}
          className="keypad-btn keypad-btn-extra"
        >
          Nb
        </Button>
      </div>

      {/* Row 3: Byes, Leg Byes, Wicket */}
      <div className="keypad-grid">
        <Button
          disabled={isKeypadDisabled}
          onClick={() => onOpenExtrasModal('BYE')}
          className="keypad-btn keypad-btn-extra"
        >
          Bye
        </Button>
        <Button
          disabled={isKeypadDisabled}
          onClick={() => onOpenExtrasModal('LEG_BYE')}
          className="keypad-btn keypad-btn-extra"
        >
          Lb
        </Button>
        <Button
          disabled={isKeypadDisabled}
          onClick={onOpenWicketModal}
          className="keypad-btn keypad-btn-wicket"
        >
          OUT (Wicket)
        </Button>
      </div>

      {/* Bottom Controls: Non-destructive Undo */}
      <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="outline"
          disabled={isSubmitting}
          onClick={onOpenUndoModal}
          style={{ fontSize: '0.9rem', padding: '8px 14px', minHeight: '40px', color: '#fca5a5', borderColor: '#ef4444' }}
        >
          ↺ Undo Last Ball
        </Button>
      </div>
    </div>
  );
}
