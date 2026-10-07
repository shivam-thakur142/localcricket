import React, { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';

export function WicketModal({
  isOpen,
  onClose,
  onSubmitWicket,
  liveState,
  squads,
  isFreeHit = false,
}) {
  const striker = liveState?.striker;
  const nonStriker = liveState?.non_striker;
  const bowlingSquad = squads?.bowling_team?.playing_xi || squads?.bowling_team?.full_roster || [];
  const battingSquad = squads?.batting_team?.playing_xi || squads?.batting_team?.full_roster || [];

  // Available incoming batters (those not currently striker or non-striker, and not already out)
  const alreadyBattedIds = new Set(liveState?.innings?.batted_player_ids || []);
  const availableIncomingBatters = battingSquad.filter(
    (p) => p.player_id !== striker?.id && p.player_id !== nonStriker?.id && !alreadyBattedIds.has(p.player_id)
  );

  const [wicketType, setWicketType] = useState('BOWLED');
  const [dismissedPlayerId, setDismissedPlayerId] = useState(striker?.id || '');
  const [assistPlayerId, setAssistPlayerId] = useState('');
  const [incomingBatterId, setIncomingBatterId] = useState(availableIncomingBatters[0]?.player_id || '');
  const [runsBatter, setRunsBatter] = useState(0);
  const [crossedOnRunOut, setCrossedOnRunOut] = useState(false);
  const [extraType, setExtraType] = useState('NONE');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmitWicket({
      is_wicket: true,
      wicket_type: wicketType,
      dismissed_player_id: dismissedPlayerId || striker?.id,
      assist_player_id: assistPlayerId || null,
      incoming_batter_id: incomingBatterId || null,
      runs_batter: runsBatter,
      runs_extras: extraType !== 'NONE' ? 1 : 0,
      extra_type: extraType !== 'NONE' ? extraType : null,
      crossed_on_run_out: crossedOnRunOut,
      physical_runs_taken: runsBatter,
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Wicket">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {isFreeHit && (
          <div style={{ padding: '8px 12px', background: '#78350f', border: '1px solid #d97706', borderRadius: '6px', color: '#fef3c7', fontSize: '0.85rem' }}>
            ⚠️ <strong>Free Hit Active!</strong> Batters cannot be dismissed Bowled, Caught, LBW, or Stumped. Only Run Out or Obstructing the Field are valid.
          </div>
        )}

        {/* Wicket Type */}
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
            Dismissal Method
          </label>
          <select
            value={wicketType}
            onChange={(e) => setWicketType(e.target.value)}
            style={{ width: '100%', padding: '10px', background: 'var(--bg-accent)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '1rem' }}
          >
            <option value="BOWLED" disabled={isFreeHit}>Bowled {isFreeHit ? '(Illegal on Free Hit)' : ''}</option>
            <option value="CAUGHT" disabled={isFreeHit}>Caught {isFreeHit ? '(Illegal on Free Hit)' : ''}</option>
            <option value="LBW" disabled={isFreeHit}>LBW {isFreeHit ? '(Illegal on Free Hit)' : ''}</option>
            <option value="RUN_OUT">Run Out</option>
            <option value="STUMPED" disabled={isFreeHit}>Stumped {isFreeHit ? '(Illegal on Free Hit)' : ''}</option>
            <option value="HIT_WICKET" disabled={isFreeHit}>Hit Wicket {isFreeHit ? '(Illegal on Free Hit)' : ''}</option>
            <option value="OBSTRUCTING_FIELD">Obstructing the Field</option>
            <option value="RETIRED_HURT">Retired Hurt</option>
          </select>
        </div>

        {/* Dismissed Batter */}
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
            Dismissed Batter
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <label style={{ flex: 1, padding: '10px', background: dismissedPlayerId === (striker?.id || 'striker') ? '#0369a1' : 'var(--bg-accent)', borderRadius: '6px', cursor: 'pointer', textAlign: 'center', fontWeight: 600 }}>
              <input
                type="radio"
                name="dismissed"
                checked={dismissedPlayerId === (striker?.id || 'striker')}
                onChange={() => setDismissedPlayerId(striker?.id)}
                style={{ display: 'none' }}
              />
              Striker ({striker?.name || 'Striker'})
            </label>
            <label style={{ flex: 1, padding: '10px', background: dismissedPlayerId === (nonStriker?.id || 'non_striker') ? '#0369a1' : 'var(--bg-accent)', borderRadius: '6px', cursor: 'pointer', textAlign: 'center', fontWeight: 600 }}>
              <input
                type="radio"
                name="dismissed"
                checked={dismissedPlayerId === (nonStriker?.id || 'non_striker')}
                onChange={() => setDismissedPlayerId(nonStriker?.id)}
                style={{ display: 'none' }}
              />
              Non-Striker ({nonStriker?.name || 'Non-Striker'})
            </label>
          </div>
        </div>

        {/* Special fields for Run Out */}
        {wicketType === 'RUN_OUT' && (
          <div style={{ padding: '12px', background: 'rgba(51, 65, 85, 0.4)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 600 }}>Run Out Details</div>
            
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Completed Runs Prior to Run Out</label>
              <select
                value={runsBatter}
                onChange={(e) => setRunsBatter(parseInt(e.target.value, 10))}
                style={{ width: '100%', padding: '8px', background: 'var(--bg-accent)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
              >
                <option value={0}>0 runs completed</option>
                <option value={1}>1 run completed</option>
                <option value={2}>2 runs completed</option>
                <option value={3}>3 runs completed</option>
              </select>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={crossedOnRunOut}
                onChange={(e) => setCrossedOnRunOut(e.target.checked)}
              />
              <span>Batters crossed each other before wicket broken</span>
            </label>

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Delivery Extra (if any)</label>
              <select
                value={extraType}
                onChange={(e) => setExtraType(e.target.value)}
                style={{ width: '100%', padding: '8px', background: 'var(--bg-accent)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
              >
                <option value="NONE">Legal delivery</option>
                <option value="WIDE">Run Out on Wide</option>
                <option value="NO_BALL">Run Out on No-Ball</option>
              </select>
            </div>
          </div>
        )}

        {/* Fielder / Assist */}
        {['CAUGHT', 'RUN_OUT', 'STUMPED'].includes(wicketType) && (
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
              Fielder / Catcher
            </label>
            <select
              value={assistPlayerId}
              onChange={(e) => setAssistPlayerId(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'var(--bg-accent)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
            >
              <option value="">-- Select Fielder --</option>
              {bowlingSquad.map((f) => (
                <option key={f.player_id} value={f.player_id}>
                  {f.full_name || f.player_name} #{f.jersey_number}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Next / Incoming Batter */}
        {availableIncomingBatters.length > 0 && (
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
              Incoming Batter
            </label>
            <select
              value={incomingBatterId}
              onChange={(e) => setIncomingBatterId(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'var(--bg-accent)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
            >
              <option value="">-- Select Incoming Batter --</option>
              {availableIncomingBatters.map((b) => (
                <option key={b.player_id} value={b.player_id}>
                  {b.full_name || b.player_name} #{b.jersey_number}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
          <Button variant="outline" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" style={{ flex: 1 }}>
            Confirm Wicket
          </Button>
        </div>
      </form>
    </Modal>
  );
}
