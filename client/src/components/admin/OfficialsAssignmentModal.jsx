import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../common/Modal.jsx';
import { api } from '../../services/api.js';

const OFFICIAL_ROLES = [
  { value: 'UMPIRE_1', label: 'Umpire 1 (On-Field)' },
  { value: 'UMPIRE_2', label: 'Umpire 2 (On-Field)' },
  { value: 'THIRD_UMPIRE', label: 'Third Umpire (TV)' },
  { value: 'MATCH_REFEREE', label: 'Match Referee' },
];

export function OfficialsAssignmentModal({
  isOpen,
  onClose,
  match,
  tournamentId,
  userId,
}) {
  const [officials, setOfficials] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('UMPIRE_1');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Removal state
  const [removingOfficial, setRemovingOfficial] = useState(null);
  const [removalReason, setRemovalReason] = useState('');
  const [isRemoving, setIsRemoving] = useState(false);
  const [removalError, setRemovalError] = useState(null);

  const loadData = useCallback(async () => {
    if (!match?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [offRes, memRes] = await Promise.all([
        api.getMatchOfficials(match.id),
        api.getTournamentMembers ? api.getTournamentMembers(tournamentId).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ]);
      setOfficials(offRes.data || []);
      setMembers(memRes.data || []);
      if (memRes.data?.length > 0 && !selectedUserId) {
        setSelectedUserId(memRes.data[0].user_id || memRes.data[0].id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load match officials');
    } finally {
      setIsLoading(false);
    }
  }, [match?.id, tournamentId, selectedUserId]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!selectedUserId) {
      setError('Please select or specify a user ID for the official');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.assignOfficial(
        match.id,
        {
          userId: selectedUserId,
          role: selectedRole,
        },
        userId
      );
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to assign official');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenRemoval = (official) => {
    setRemovingOfficial(official);
    setRemovalReason('');
    setRemovalError(null);
  };

  const handleConfirmRemoval = async (e) => {
    e.preventDefault();
    if (!removalReason || !removalReason.trim()) {
      setRemovalError('A non-empty reason is mandatory to remove an official');
      return;
    }

    setIsRemoving(true);
    setRemovalError(null);

    try {
      await api.removeOfficial(
        match.id,
        removingOfficial.id || removingOfficial.role,
        removalReason.trim(),
        userId
      );
      setRemovingOfficial(null);
      await loadData();
    } catch (err) {
      setRemovalError(err.message || 'Failed to unassign official');
    } finally {
      setIsRemoving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Match Officials — Fixture #${match?.match_number}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ padding: '8px 12px', background: 'var(--bg-accent)', borderRadius: '6px', fontSize: '0.9rem' }}>
          <strong>{match?.team_a_name || 'Team A'}</strong> vs <strong>{match?.team_b_name || 'Team B'}</strong>
          <span style={{ marginLeft: '12px', color: 'var(--text-secondary)' }}>
            Start: {match?.scheduled_start_time ? new Date(match.scheduled_start_time).toLocaleString() : 'TBD'}
          </span>
        </div>

        {error && (
          <div
            style={{
              padding: '10px',
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

        {/* Currently Assigned Officials */}
        <div>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem' }}>Assigned Officials ({officials.length})</h4>
          {isLoading ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading officials...</p>
          ) : officials.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No officials assigned yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {officials.map((o) => (
                <div
                  key={o.id || o.role}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-main)',
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: '#0284c7',
                        color: '#ffffff',
                        marginRight: '8px',
                      }}
                    >
                      {o.role}
                    </span>
                    <strong>{o.full_name || o.email || o.user_id}</strong>
                    {o.email && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '6px' }}>({o.email})</span>}
                  </div>
                  <button
                    onClick={() => handleOpenRemoval(o)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid #ef4444',
                      background: 'transparent',
                      color: '#ef4444',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Unassign
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assignment Form */}
        <form
          onSubmit={handleAssign}
          style={{
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-accent)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <h4 style={{ margin: 0, fontSize: '0.9rem' }}>Appoint New Official</h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px', fontWeight: 600 }}>
                Position Role:
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-main)',
                  color: 'inherit',
                }}
              >
                {OFFICIAL_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px', fontWeight: 600 }}>
                Official Member / User ID:
              </label>
              {members.length > 0 ? (
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-main)',
                    color: 'inherit',
                  }}
                >
                  <option value="">Select tournament member</option>
                  {members.map((m) => (
                    <option key={m.user_id || m.id} value={m.user_id || m.id}>
                      {m.full_name || m.email || m.user_id} ({m.role})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Enter user UUID"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
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
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              alignSelf: 'flex-end',
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: '#0284c7',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            {isSubmitting ? 'Checking Clash & Appointing...' : '+ Appoint Official'}
          </button>
        </form>

        {/* Unassign Confirmation Sub-Modal */}
        {removingOfficial && (
          <Modal
            isOpen={!!removingOfficial}
            onClose={() => setRemovingOfficial(null)}
            title={`Unassign ${removingOfficial.role}`}
          >
            <form onSubmit={handleConfirmRemoval} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {removalError && (
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
                  ⚠️ {removalError}
                </div>
              )}

              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                Are you sure you want to unassign <strong>{removingOfficial.full_name || removingOfficial.role}</strong> from Match #{match.match_number}?
              </p>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                  Mandatory Operational Reason: *
                </label>
                <textarea
                  value={removalReason}
                  onChange={(e) => setRemovalReason(e.target.value)}
                  placeholder="e.g. Umpire medical emergency, conflict of interest recusal, etc."
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
                  onClick={() => setRemovingOfficial(null)}
                  disabled={isRemoving}
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
                  disabled={isRemoving}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#ef4444',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isRemoving ? 'Removing...' : 'Confirm Unassignment'}
                </button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </Modal>
  );
}
