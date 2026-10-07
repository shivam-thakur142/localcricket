import React, { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import { api } from '../../services/api.js';

export function ScheduleMatrixView({
  matches = [],
  venues = [],
  tournamentId,
  userId,
  onRefresh,
  onOpenOfficialsModal,
}) {
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [newStartTime, setNewStartTime] = useState('');
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const openRescheduleModal = (match) => {
    setSelectedMatch(match);
    setSelectedVenueId(match.venue_id || '');
    if (match.scheduled_start_time) {
      const d = new Date(match.scheduled_start_time);
      // Format as local YYYY-MM-DDTHH:mm for datetime-local
      const tzOffset = d.getTimezoneOffset() * 60000;
      const localISOTime = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
      setNewStartTime(localISOTime);
    } else {
      setNewStartTime('');
    }
    setRescheduleReason('');
    setError(null);
  };

  const closeRescheduleModal = () => {
    setSelectedMatch(null);
    setError(null);
  };

  const handleRescheduleSubmit = async (e) => {
    e.preventDefault();
    if (!newStartTime) {
      setError('Please select a new scheduled start time');
      return;
    }
    if (!rescheduleReason || !rescheduleReason.trim()) {
      setError('A non-empty operational reason is mandatory for rescheduling');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const utcIsoTime = new Date(newStartTime).toISOString();
      const payload = {
        scheduledStartTime: utcIsoTime,
        reason: rescheduleReason.trim(),
      };
      if (selectedVenueId) {
        payload.venueId = selectedVenueId;
      }

      await api.rescheduleMatch(selectedMatch.id, payload, userId);

      closeRescheduleModal();
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message || 'Failed to reschedule fixture');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
            🗓️ Concurrency-Safe Fixture Operations & Schedule Matrix
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Authoritative match windows, collision guards, and audit-trailed rescheduling.
          </p>
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-accent)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '12px' }}>Match #</th>
              <th style={{ padding: '12px' }}>Stage</th>
              <th style={{ padding: '12px' }}>Fixture</th>
              <th style={{ padding: '12px' }}>Venue</th>
              <th style={{ padding: '12px' }}>Start Time</th>
              <th style={{ padding: '12px' }}>Est. Window</th>
              <th style={{ padding: '12px' }}>Status</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {matches.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No fixtures scheduled yet.
                </td>
              </tr>
            ) : (
              matches.map((m) => {
                const duration = m.estimated_duration_minutes || 188;
                const canReschedule = m.status === 'SCHEDULED';
                const startTimeStr = m.scheduled_start_time
                  ? new Date(m.scheduled_start_time).toLocaleString(undefined, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })
                  : 'TBD';

                return (
                  <tr
                    key={m.id}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      background: canReschedule ? 'transparent' : 'rgba(255, 255, 255, 0.02)',
                    }}
                  >
                    <td style={{ padding: '12px', fontWeight: 700 }}>#{m.match_number}</td>
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: m.stage === 'FINAL' ? '#f59e0b' : '#334155',
                          color: '#ffffff',
                          fontWeight: 600,
                        }}
                      >
                        {m.stage}
                      </span>
                    </td>
                    <td style={{ padding: '12px', fontWeight: 600 }}>
                      {m.team_a_name || m.team_a?.name || 'Team A'} vs{' '}
                      {m.team_b_name || m.team_b?.name || 'Team B'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                      {m.venue_name || m.venue?.name || 'Ground TBD'}
                    </td>
                    <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>{startTimeStr}</td>
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          background: '#1e293b',
                          border: '1px solid #334155',
                          color: '#38bdf8',
                          fontWeight: 600,
                        }}
                      >
                        ⏱️ {duration}m
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 600,
                          background:
                            m.status === 'COMPLETED'
                              ? '#10b981'
                              : m.status === 'IN_PROGRESS'
                              ? '#ef4444'
                              : '#64748b',
                          color: '#ffffff',
                        }}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => onOpenOfficialsModal && onOpenOfficialsModal(m)}
                        style={{
                          marginRight: '6px',
                          padding: '4px 8px',
                          fontSize: '0.8rem',
                          borderRadius: '4px',
                          border: '1px solid #38bdf8',
                          background: 'transparent',
                          color: '#38bdf8',
                          cursor: 'pointer',
                        }}
                      >
                        👮 Officials
                      </button>
                      {canReschedule ? (
                        <button
                          onClick={() => openRescheduleModal(m)}
                          style={{
                            padding: '4px 8px',
                            fontSize: '0.8rem',
                            borderRadius: '4px',
                            border: '1px solid #f59e0b',
                            background: 'transparent',
                            color: '#f59e0b',
                            cursor: 'pointer',
                          }}
                        >
                          🔄 Reschedule
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Locked</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Reschedule Modal */}
      {selectedMatch && (
        <Modal
          isOpen={!!selectedMatch}
          onClose={closeRescheduleModal}
          title={`Reschedule Match #${selectedMatch.match_number}`}
        >
          <form onSubmit={handleRescheduleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                Fixture:
              </label>
              <div style={{ padding: '8px 12px', background: 'var(--bg-accent)', borderRadius: '6px', fontSize: '0.9rem' }}>
                {selectedMatch.team_a_name || 'Team A'} vs {selectedMatch.team_b_name || 'Team B'}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                New Start Time (Local): *
              </label>
              <input
                type="datetime-local"
                value={newStartTime}
                onChange={(e) => setNewStartTime(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-main)',
                  color: 'inherit',
                }}
              />
            </div>

            {venues.length > 0 && (
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                  Venue:
                </label>
                <select
                  value={selectedVenueId}
                  onChange={(e) => setSelectedVenueId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-main)',
                    color: 'inherit',
                  }}
                >
                  <option value="">Keep current / unassigned</option>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.city})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                Operational Reason: * (Mandatory for Audit Trail)
              </label>
              <textarea
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                placeholder="e.g. Inclement weather postponement, stadium maintenance conflict, etc."
                rows={3}
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-main)',
                  color: 'inherit',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={closeRescheduleModal}
                disabled={isSubmitting}
                style={{
                  padding: '8px 16px',
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
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#0284c7',
                  color: '#ffffff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isSubmitting ? 'Rescheduling...' : 'Confirm Reschedule'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
