import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.js';

export function AssignScorerModal({ match, tournamentId, userId, onClose }) {
  const [scorers, setScorers] = useState([]);
  const [eligibleMembers, setEligibleMembers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    loadData();
  }, [match.id]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [scorersRes, membersRes] = await Promise.all([
        api.getMatchScorers(match.id, userId),
        api.getTournamentMembers(tournamentId, userId),
      ]);
      setScorers(scorersRes.data || []);

      const members = membersRes.data || [];
      const eligible = members.filter((m) => m.role === 'SCORER' || m.role === 'ORGANIZER');
      setEligibleMembers(eligible);
      if (eligible.length > 0 && !selectedUserId) {
        setSelectedUserId(eligible[0].user_id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load scorers and members');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedUserId) return;
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await api.assignMatchScorer(match.id, selectedUserId, userId);
      setSuccess('Scorer assigned successfully');
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to assign scorer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (targetUserId) => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await api.removeMatchScorer(match.id, targetUserId, userId);
      setSuccess('Scorer removed successfully');
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to remove scorer');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '520px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.2rem' }}>
            📝 Assign Match Scorer
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.2rem',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ fontSize: '0.85rem', color: '#94a3b8', borderBottom: '1px solid #1e293b', paddingBottom: '12px' }}>
          Match #{match.match_number}: {match.team_a_name || 'Team A'} vs {match.team_b_name || 'Team B'}
        </div>

        {error && (
          <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '10px', borderRadius: '6px', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ background: '#064e3b', color: '#6ee7b7', padding: '10px', borderRadius: '6px', fontSize: '0.85rem' }}>
            {success}
          </div>
        )}

        {/* Currently Assigned Scorers */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '8px' }}>
            Currently Assigned Scorers:
          </label>
          {isLoading ? (
            <div style={{ color: '#64748b', fontSize: '0.85rem' }}>Loading...</div>
          ) : scorers.length === 0 ? (
            <div style={{ color: '#eab308', fontSize: '0.85rem', background: '#422006', padding: '8px 12px', borderRadius: '6px' }}>
              ⚠️ No dedicated scorer assigned yet. Tournament organizers can still score.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {scorers.map((s) => (
                <div
                  key={s.user_id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#1e293b',
                    padding: '8px 12px',
                    borderRadius: '6px',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.85rem' }}>{s.full_name}</span>
                    <span style={{ color: '#64748b', fontSize: '0.75rem', marginLeft: '6px' }}>({s.email})</span>
                  </div>
                  <button
                    onClick={() => handleRemove(s.user_id)}
                    disabled={isSubmitting}
                    style={{
                      background: '#ef4444',
                      border: 'none',
                      color: '#ffffff',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add New Scorer */}
        <div style={{ borderTop: '1px solid #1e293b', paddingTop: '16px' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '8px' }}>
            Enrolled Tournament Scorers & Organizers:
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#f8fafc',
                fontSize: '0.85rem',
              }}
            >
              {eligibleMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name} ({m.role})
                </option>
              ))}
            </select>
            <button
              onClick={handleAssign}
              disabled={isSubmitting || !selectedUserId}
              style={{
                padding: '8px 16px',
                background: '#0284c7',
                border: 'none',
                borderRadius: '6px',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Assign
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: '#334155',
              border: 'none',
              borderRadius: '6px',
              color: '#f8fafc',
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
