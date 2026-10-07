import React, { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import { api } from '../../services/api.js';

export function SquadVerificationBadge({
  status = 'DRAFT',
  roster = [],
  tournamentTeamId,
  tournamentId,
  userId,
  isOrganizer = false,
  onStatusChange,
}) {
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideAction, setOverrideAction] = useState('ADD_PLAYER');
  const [overridePlayerId, setOverridePlayerId] = useState('');
  const [overrideJersey, setOverrideJersey] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState(null);

  const activePlayers = (roster || []).filter((p) => p.is_active !== false);
  const playerCount = activePlayers.length;
  const captainCount = activePlayers.filter((p) => p.is_captain).length;

  const isCountValid = playerCount >= 11 && playerCount <= 25;
  const isCaptainValid = captainCount === 1;
  const isCompliant = isCountValid && isCaptainValid;

  const getStatusBadgeStyle = () => {
    switch (status) {
      case 'LOCKED':
        return { background: '#dc2626', color: '#ffffff', label: '🔒 LOCKED' };
      case 'VERIFIED':
        return { background: '#10b981', color: '#ffffff', label: '✅ VERIFIED' };
      case 'DRAFT':
      default:
        return { background: '#64748b', color: '#ffffff', label: 'Draft' };
    }
  };

  const badgeStyle = getStatusBadgeStyle();

  const handleVerifySquad = async () => {
    if (!isCompliant) {
      alert(`Cannot verify squad: Squad requires 11-25 players (current: ${playerCount}) and exactly 1 captain (current: ${captainCount}).`);
      return;
    }

    setIsVerifying(true);
    try {
      await api.verifySquad(tournamentId, tournamentTeamId, userId);
      if (onStatusChange) onStatusChange('VERIFIED');
    } catch (err) {
      alert(err.message || 'Failed to verify squad');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleOverrideSubmit = async (e) => {
    e.preventDefault();
    if (!overrideReason || !overrideReason.trim()) {
      setError('A non-empty operational reason is mandatory for locked roster overrides');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        action: overrideAction,
        playerId: overridePlayerId || undefined,
        jerseyNumber: overrideJersey ? parseInt(overrideJersey, 10) : undefined,
        reason: overrideReason.trim(),
      };

      await api.overrideRoster(tournamentId, tournamentTeamId, payload, userId);
      setShowOverrideModal(false);
      setOverrideReason('');
      if (onStatusChange) onStatusChange('LOCKED');
    } catch (err) {
      setError(err.message || 'Failed to apply roster override');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      {/* Badge */}
      <span
        style={{
          fontSize: '0.75rem',
          padding: '3px 8px',
          borderRadius: '12px',
          fontWeight: 700,
          background: badgeStyle.background,
          color: badgeStyle.color,
          letterSpacing: '0.02em',
        }}
        title={`Players: ${playerCount}/25 | Captains: ${captainCount}`}
      >
        {badgeStyle.label}
      </span>

      {/* Rules Indicator (only if not locked) */}
      {status !== 'LOCKED' && (
        <span
          style={{
            fontSize: '0.75rem',
            color: isCompliant ? '#10b981' : '#f59e0b',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {isCompliant ? '✓ 11-25 squad & captain set' : `⚠️ ${playerCount} players, ${captainCount} cap`}
        </span>
      )}

      {/* Organizer Actions */}
      {isOrganizer && status !== 'LOCKED' && status !== 'VERIFIED' && isCompliant && (
        <button
          onClick={handleVerifySquad}
          disabled={isVerifying}
          style={{
            padding: '2px 8px',
            fontSize: '0.75rem',
            borderRadius: '4px',
            border: 'none',
            background: '#10b981',
            color: '#ffffff',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {isVerifying ? 'Verifying...' : 'Verify Squad'}
        </button>
      )}

      {isOrganizer && status === 'LOCKED' && (
        <button
          onClick={() => {
            setShowOverrideModal(true);
            setError(null);
          }}
          style={{
            padding: '2px 8px',
            fontSize: '0.75rem',
            borderRadius: '4px',
            border: '1px solid #ef4444',
            background: 'transparent',
            color: '#ef4444',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ⚠️ Emergency Override
        </button>
      )}

      {/* Override Modal */}
      {showOverrideModal && (
        <Modal
          isOpen={showOverrideModal}
          onClose={() => setShowOverrideModal(false)}
          title="Emergency Locked Roster Override"
        >
          <form onSubmit={handleOverrideSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {error && (
              <div
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid #ef4444',
                  color: '#ef4444',
                  fontSize: '0.85rem',
                }}
              >
                ⚠️ {error}
              </div>
            )}

            <div
              style={{
                fontSize: '0.8rem',
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #ef4444',
                color: '#f87171',
              }}
            >
              Notice: Tournament is ongoing and squads are locked. All roster mutations are recorded in the immutable operations audit log.
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px', fontWeight: 600 }}>
                Override Action:
              </label>
              <select
                value={overrideAction}
                onChange={(e) => setOverrideAction(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-main)',
                  color: 'inherit',
                }}
              >
                <option value="ADD_PLAYER">Add Player (Injury Replacement / Reserve)</option>
                <option value="REMOVE_PLAYER">Deactivate Player</option>
                <option value="CAPTAIN_CHANGE">Designate New Captain</option>
                <option value="JERSEY_CHANGE">Update Jersey Number</option>
              </select>
            </div>

            {overrideAction === 'ADD_PLAYER' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px', fontWeight: 600 }}>
                  Player ID to Add:
                </label>
                <input
                  type="text"
                  placeholder="UUID of registered player"
                  value={overridePlayerId}
                  onChange={(e) => setOverridePlayerId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-main)',
                    color: 'inherit',
                  }}
                />
              </div>
            )}

            {(overrideAction === 'REMOVE_PLAYER' || overrideAction === 'CAPTAIN_CHANGE' || overrideAction === 'JERSEY_CHANGE') && (
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px', fontWeight: 600 }}>
                  Target Player on Current Squad:
                </label>
                <select
                  value={overridePlayerId}
                  onChange={(e) => setOverridePlayerId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-main)',
                    color: 'inherit',
                  }}
                >
                  <option value="">Select squad player</option>
                  {activePlayers.map((p) => (
                    <option key={p.player_id || p.id} value={p.player_id || p.id}>
                      {p.full_name || p.name} {p.is_captain ? '(Captain)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {overrideAction === 'JERSEY_CHANGE' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px', fontWeight: 600 }}>
                  New Jersey Number:
                </label>
                <input
                  type="number"
                  min="0"
                  max="99"
                  value={overrideJersey}
                  onChange={(e) => setOverrideJersey(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-main)',
                    color: 'inherit',
                  }}
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px', fontWeight: 600 }}>
                Mandatory Operational Reason: *
              </label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. Verified medical injury cert #8192 - authorized by Technical Committee"
                rows={2}
                required
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-main)',
                  color: 'inherit',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowOverrideModal(false)}
                disabled={isSubmitting}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#ef4444',
                  color: '#ffffff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isSubmitting ? 'Applying...' : 'Apply & Log Audit'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
