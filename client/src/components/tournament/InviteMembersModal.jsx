import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { api } from '../../services/api.js';

export function InviteMembersModal({ isOpen, onClose, tournamentId, userId }) {
  const [role, setRole] = useState('SCORER');
  const [invitedEmail, setInvitedEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [generatedLink, setGeneratedLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const fetchInvitations = async () => {
    if (!tournamentId) return;
    setLoadingList(true);
    try {
      const res = await api.listTournamentInvitations(tournamentId, userId);
      setInvitations(res?.data || []);
    } catch (err) {
      console.warn('Failed to fetch invitations:', err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setGeneratedLink(null);
      setError(null);
      setCopied(false);
      fetchInvitations();
    }
  }, [isOpen, tournamentId]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      const payload = {
        role,
        invitedEmail: invitedEmail.trim() || undefined,
      };

      const res = await api.createTournamentInvitation(tournamentId, payload, userId);
      const token = res.data?.token;
      if (token) {
        const fullLink = `${window.location.origin}/invitations/${token}`;
        setGeneratedLink(fullLink);
      }
      setInvitedEmail('');
      await fetchInvitations();
    } catch (err) {
      setError(err.message || 'Failed to create invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (invitationId) => {
    try {
      await api.revokeTournamentInvitation(tournamentId, invitationId, userId);
      await fetchInvitations();
    } catch (err) {
      setError(err.message || 'Failed to revoke invitation');
    }
  };

  const handleCopyLink = () => {
    if (generatedLink) {
      navigator.clipboard?.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return <span style={{ color: '#fbbf24', background: '#78350f', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>⏳ Pending</span>;
      case 'ACCEPTED':
        return <span style={{ color: '#34d399', background: '#064e3b', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>✅ Accepted</span>;
      case 'REVOKED':
        return <span style={{ color: '#f87171', background: '#7f1d1d', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>🚫 Revoked</span>;
      case 'EXPIRED':
        return <span style={{ color: '#94a3b8', background: '#334155', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>⏱️ Expired</span>;
      default:
        return status;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Invite Tournament Officials & Staff">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              color: '#fca5a5',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '0.85rem',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* Generate Invitation Form */}
        <form
          onSubmit={handleGenerate}
          style={{
            background: '#0f172a',
            padding: '14px',
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#38bdf8' }}>
            ✉️ Issue Single-Use 7-Day Invitation
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                Role *
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{
                  width: '100%',
                  background: '#1e293b',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              >
                <option value="SCORER">📝 Official Scorer</option>
                <option value="UMPIRE">🏏 Match Umpire</option>
                <option value="REFEREE">⚖️ Match Referee</option>
                <option value="ORGANIZER">👑 Co-Organizer</option>
                <option value="VIEWER">👁️ Tournament Viewer</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                Invited Email (Optional Guard)
              </label>
              <input
                type="email"
                value={invitedEmail}
                onChange={(e) => setInvitedEmail(e.target.value)}
                placeholder="scorer@domain.com"
                style={{
                  width: '100%',
                  background: '#1e293b',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="submit" variant="primary" loading={loading} style={{ padding: '6px 14px', fontSize: '0.85rem', minHeight: '36px' }}>
              Generate Invitation Token
            </Button>
          </div>
        </form>

        {/* Generated Link Alert */}
        {generatedLink && (
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#34d399', fontWeight: 600 }}>
              🎉 Invitation Token Created! Share this link:
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                readOnly
                value={generatedLink}
                style={{
                  flex: 1,
                  background: '#0f172a',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  color: '#e2e8f0',
                  fontSize: '0.8rem',
                }}
              />
              <Button
                variant="secondary"
                onClick={handleCopyLink}
                style={{ padding: '6px 12px', fontSize: '0.8rem', minHeight: '32px' }}
              >
                {copied ? 'Copied! ✅' : 'Copy'}
              </Button>
            </div>
          </div>
        )}

        {/* List of Existing Invitations */}
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>
            Active & Past Invitations ({invitations.length})
          </div>

          {loadingList ? (
            <div style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontSize: '0.85rem' }}>
              Loading invitations...
            </div>
          ) : invitations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontSize: '0.85rem' }}>
              No invitations issued yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  style={{
                    background: '#0f172a',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.8rem',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: '#f8fafc' }}>
                      {inv.role} — <span style={{ color: '#94a3b8' }}>{inv.invited_email || 'Open to anyone'}</span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                      Expires: {new Date(inv.expires_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {getStatusBadge(inv.status)}
                    {inv.status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(inv.id)}
                        style={{
                          background: 'transparent',
                          border: '1px solid #ef4444',
                          color: '#ef4444',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                        }}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
