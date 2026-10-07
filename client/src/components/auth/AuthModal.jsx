import React, { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';

export function AuthModal({ isOpen, onClose, initialMode = 'LOGIN' }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState(initialMode); // 'LOGIN' | 'REGISTER'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setFullName('');
    setPhone('');
    setError(null);
    setLoading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (mode === 'REGISTER') {
      if (!fullName.trim()) {
        setError('Full name is required');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'LOGIN') {
        await login({ email, password });
      } else {
        await register({ fullName, email, password, phone: phone || undefined });
      }
      handleClose();
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={mode === 'LOGIN' ? 'Sign In to LocalCricket' : 'Create an Account'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Mode Toggle Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '8px' }}>
          <button
            type="button"
            onClick={() => { setMode('LOGIN'); setError(null); }}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              color: mode === 'LOGIN' ? '#38bdf8' : 'var(--text-secondary)',
              borderBottom: mode === 'LOGIN' ? '2px solid #38bdf8' : '2px solid transparent',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('REGISTER'); setError(null); }}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              color: mode === 'REGISTER' ? '#38bdf8' : 'var(--text-secondary)',
              borderBottom: mode === 'REGISTER' ? '2px solid #38bdf8' : '2px solid transparent',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Register
          </button>
        </div>

        {/* Error Alert */}
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

        {/* Demo Persona Quick-Fill (Login mode only) */}
        {false && mode === 'LOGIN' && (
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '0.8rem',
            }}
          >
            <div style={{ color: '#38bdf8', fontWeight: 600, marginBottom: '6px' }}>
              Quick Demo Accounts (LocalCricket@2026!):
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleQuickFill('organizer@localcricket.test')}
                style={{
                  background: '#1e293b',
                  color: '#93c5fd',
                  border: '1px solid #3b82f6',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                👑 Organizer
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('scorer@localcricket.test')}
                style={{
                  background: '#1e293b',
                  color: '#6ee7b7',
                  border: '1px solid #10b981',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                📝 Scorer
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('user@localcricket.test')}
                style={{
                  background: '#1e293b',
                  color: '#c4b5fd',
                  border: '1px solid #8b5cf6',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                👤 Regular User
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {mode === 'REGISTER' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                Full Name *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Virat Kohli"
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: '#f8fafc',
                  fontSize: '0.9rem',
                }}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
              Email Address *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              style={{
                width: '100%',
                background: '#0f172a',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '8px 12px',
                color: '#f8fafc',
                fontSize: '0.9rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
              Password *
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              style={{
                width: '100%',
                background: '#0f172a',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '8px 12px',
                color: '#f8fafc',
                fontSize: '0.9rem',
              }}
            />
            {mode === 'REGISTER' && (
              <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
                Must be at least 8 characters with uppercase, lowercase, digit, and special character.
              </span>
            )}
          </div>

          {mode === 'REGISTER' && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                  Confirm Password *
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                  Phone Number (Optional)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: '0.9rem',
                  }}
                />
              </div>
            </>
          )}

          <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={loading}>
              {mode === 'LOGIN' ? 'Sign In' : 'Create Account'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
