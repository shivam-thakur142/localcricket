import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';

export function ExtrasModal({
  isOpen,
  onClose,
  initialType = 'WIDE',
  onSubmitExtras,
}) {
  const [extraType, setExtraType] = useState(initialType);
  const [additionalRuns, setAdditionalRuns] = useState(0);
  const [isBoundary, setIsBoundary] = useState(false);

  useEffect(() => {
    if (initialType) {
      setExtraType(initialType);
      setAdditionalRuns(0);
      setIsBoundary(false);
    }
  }, [initialType, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();

    let runsBatter = 0;
    let runsExtras = 0;

    if (extraType === 'WIDE') {
      // Wide delivery: penalty 1 run + additional runs taken/boundary
      runsExtras = 1 + additionalRuns;
      runsBatter = 0;
    } else if (extraType === 'NO_BALL') {
      // No ball delivery: penalty 1 run (extra) + runs off bat (or byes)
      runsExtras = 1;
      runsBatter = additionalRuns;
    } else if (extraType === 'BYE' || extraType === 'LEG_BYE') {
      // Byes or leg byes: 1 to 4 extras, 0 to batter
      runsExtras = Math.max(1, additionalRuns);
      runsBatter = 0;
    }

    onSubmitExtras({
      runs_batter: runsBatter,
      runs_extras: runsExtras,
      extra_type: extraType,
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Record Extra: ${extraType}`}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Type Selector Tabs */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {['WIDE', 'NO_BALL', 'BYE', 'LEG_BYE'].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setExtraType(type);
                setAdditionalRuns(0);
              }}
              style={{
                flex: 1,
                padding: '8px 4px',
                fontSize: '0.8rem',
                fontWeight: 700,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: extraType === type ? '#f59e0b' : 'var(--bg-accent)',
                color: extraType === type ? '#1e293b' : 'var(--text-primary)',
              }}
            >
              {type === 'NO_BALL' ? 'NO BALL' : type === 'LEG_BYE' ? 'LEG BYE' : type}
            </button>
          ))}
        </div>

        {/* Dynamic options based on extra type */}
        {extraType === 'WIDE' && (
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
              Additional Runs (Overthrows / Wicketkeeper Miss)
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[0, 1, 2, 3, 4].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setAdditionalRuns(r)}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    fontSize: '1rem',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: additionalRuns === r ? '2px solid #f59e0b' : '1px solid var(--border-color)',
                    background: additionalRuns === r ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-accent)',
                    color: additionalRuns === r ? '#fbbf24' : 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  +{r} {r === 4 ? '(4 Wides)' : ''}
                </button>
              ))}
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Total team runs conceded: <strong>{1 + additionalRuns}</strong> (All recorded to extras & bowler)
            </div>
          </div>
        )}

        {extraType === 'NO_BALL' && (
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
              Runs Scored Off Bat (Batter Attribution)
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[0, 1, 2, 3, 4, 6].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setAdditionalRuns(r)}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    fontSize: '1rem',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: additionalRuns === r ? '2px solid #f59e0b' : '1px solid var(--border-color)',
                    background: additionalRuns === r ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-accent)',
                    color: additionalRuns === r ? '#fbbf24' : 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Total team runs: <strong>{1 + additionalRuns}</strong> (1 Extra + {additionalRuns} to Batter). Establishes FREE HIT!
            </div>
          </div>
        )}

        {(extraType === 'BYE' || extraType === 'LEG_BYE') && (
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
              Runs Completed
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[1, 2, 3, 4].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setAdditionalRuns(r)}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    fontSize: '1rem',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: (additionalRuns === r || (additionalRuns === 0 && r === 1)) ? '2px solid #f59e0b' : '1px solid var(--border-color)',
                    background: (additionalRuns === r || (additionalRuns === 0 && r === 1)) ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-accent)',
                    color: (additionalRuns === r || (additionalRuns === 0 && r === 1)) ? '#fbbf24' : 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Legal ball count advances. 0 runs charged to bowler.
            </div>
          </div>
        )}

        {/* Submit */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
          <Button variant="outline" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button type="submit" variant="warning" style={{ flex: 1 }}>
            Confirm Extra
          </Button>
        </div>
      </form>
    </Modal>
  );
}
