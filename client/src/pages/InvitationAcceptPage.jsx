import React, { useState, useEffect } from 'react';
import { Button } from '../components/common/Button.jsx';
import { api } from '../services/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { AuthModal } from '../components/auth/AuthModal.jsx';

export function InvitationAcceptPage({ token, onNavigateToTournament }) {
  const { user, isAuthenticated } = useAuth();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('No invitation token provided in URL');
      setLoading(false);
      return;
    }

    async function loadPreview() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getInvitationPreview(token);
        setPreview(res.data);
      } catch (err) {
        setError(err.message || 'Invitation not found, expired, or invalid');
      } finally {
        setLoading(false);
      }
    }

    loadPreview();
  }, [token]);

  const handleAccept = async () => {
    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }

    setAccepting(true);
    setError(null);
    try {
      await api.acceptInvitation(token, user?.id);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '480px', margin: '40px auto', padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⏳</div>
        <div>Verifying invitation...</div>
      </div>
    );
  }

  if (error && !preview) {
    return (
      <div
        style={{
          maxWidth: '480px',
          margin: '40px auto',
          padding: '24px',
          background: '#1e293b',
          borderRadius: '12px',
          border: '1px solid #ef4444',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🚫</div>
        <h3 style={{ color: '#ef4444', marginBottom: '8px' }}>Invalid Invitation</h3>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '16px' }}>{error}</p>
        <Button variant="secondary" onClick={() => window.location.href = '/'}>
          Return to Home
        </Button>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: '520px',
        margin: '40px auto',
        padding: '28px',
        background: '#1e293b',
        borderRadius: '14px',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      {success ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🎉</div>
          <h2 style={{ color: '#34d399', fontSize: '1.4rem', fontWeight: 800, marginBottom: '8px' }}>
            Invitation Accepted!
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '24px' }}>
            You have successfully joined <strong>{preview.tournamentName}</strong> as an official{' '}
            <strong>{preview.role}</strong>.
          </p>
          <Button
            variant="primary"
            onClick={() => onNavigateToTournament?.(preview.tournamentId)}
            style={{ width: '100%' }}
          >
            Go to Tournament Hub →
          </Button>
        </div>
      ) : (
        <div>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <span style={{ fontSize: '2rem' }}>🏏</span>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f8fafc', marginTop: '6px' }}>
              Tournament Invitation
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
              You've been invited to join the tournament staff
            </p>
          </div>

          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                color: '#fca5a5',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                marginBottom: '16px',
              }}
            >
              ⚠️ {error}
            </div>
          )}

          <div
            style={{
              background: '#0f172a',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              padding: '16px',
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>Tournament</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#38bdf8' }}>
                {preview.tournamentName}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                📍 {preview.tournamentCity} • {preview.format} • {preview.ballType} ball
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>Invited Role</div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#f8fafc' }}>
                ⭐ {preview.role}
              </div>
            </div>

            {preview.invitedEmail && (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>Restricted Email</div>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                  🔒 {preview.invitedEmail}
                </div>
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>Expiration</div>
              <div style={{ fontSize: '0.8rem', color: '#f59e0b' }}>
                ⏳ Expires on {new Date(preview.expiresAt).toLocaleDateString()}
              </div>
            </div>
          </div>

          {isAuthenticated ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center' }}>
                Logged in as <strong>{user?.fullName || user?.email}</strong>
              </div>
              <Button
                variant="primary"
                onClick={handleAccept}
                loading={accepting}
                style={{ width: '100%', minHeight: '44px' }}
              >
                Accept Invitation & Join
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center' }}>
                Please sign in with your LocalCricket account to accept this invitation.
              </p>
              <Button
                variant="primary"
                onClick={() => setAuthModalOpen(true)}
                style={{ width: '100%', minHeight: '44px' }}
              >
                Sign In to Accept Invitation
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Auth Modal if unauthenticated */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </div>
  );
}
