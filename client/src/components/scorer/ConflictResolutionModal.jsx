// ====================================================================
// CONFLICT RESOLUTION MODAL (DETERMINISTIC 409 RECONCILIATION)
// ====================================================================

import React from 'react';
import { offlineQueueService } from '../../services/offlineQueueService.js';

export default function ConflictResolutionModal({
  isOpen,
  conflictData,
  serverMatch,
  pendingMutations = [],
  matchId,
  userId,
  onClose,
  onResolved,
}) {
  if (!isOpen || !conflictData) return null;

  const handleDiscard = async () => {
    try {
      await offlineQueueService.discardQueuedMutations(matchId, userId);
      if (onResolved) onResolved();
      onClose();
    } catch (e) {
      console.error('Failed to discard queue:', e);
    }
  };

  const handleRetry = async () => {
    try {
      await offlineQueueService.retryQueuedMutations(matchId, userId);
      if (onResolved) onResolved();
      onClose();
    } catch (e) {
      console.error('Failed to retry queue:', e);
    }
  };

  const errorMessage =
    conflictData.error?.message ||
    conflictData.error?.response?.error?.message ||
    'A sequence or undo conflict occurred during offline replay.';

  const errorCode =
    conflictData.error?.code ||
    conflictData.error?.response?.error?.code ||
    'CONFLICT';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        zIndex: 3000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '650px',
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: 'var(--bg-primary, #0f172a)',
          border: '2px solid #ef4444',
          borderRadius: '12px',
          padding: '20px',
          color: 'var(--text-primary, #ffffff)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '1.5rem' }}>⚠️</span>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ef4444', margin: 0 }}>
            Offline Synchronization Conflict
          </h2>
        </div>

        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderLeft: '4px solid #ef4444',
            borderRadius: '4px',
            fontSize: '0.9rem',
            marginBottom: '16px',
          }}
        >
          <strong>Error Code:</strong> {errorCode}
          <div style={{ marginTop: '4px' }}>{errorMessage}</div>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #94a3b8)', marginBottom: '16px' }}>
          The server ledger has diverged from your offline queue. Automatic re-sequencing is disabled to prevent
          applying wickets or boundaries to the wrong player or over. Please review the server ledger against your pending commands:
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          {/* Column 1: Server Ledger */}
          <div
            style={{
              padding: '12px',
              backgroundColor: 'var(--bg-accent, #1e293b)',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #334155)',
            }}
          >
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '8px', color: '#10b981' }}>
              🏛️ Official Server Ledger
            </h3>
            <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
              <div>
                <strong>Status:</strong> {serverMatch?.status || 'IN_PROGRESS'}
              </div>
              <div>
                <strong>Score:</strong> {serverMatch?.live_score?.total_runs ?? '—'} /{' '}
                {serverMatch?.live_score?.total_wickets ?? '—'}
              </div>
              <div>
                <strong>Overs:</strong> {serverMatch?.live_score?.overs_completed_str ?? '—'}
              </div>
              <div>
                <strong>Current Striker:</strong> {serverMatch?.live_score?.striker_name || 'Nominated'}
              </div>
              <div>
                <strong>Current Bowler:</strong> {serverMatch?.live_score?.bowler_name || 'Nominated'}
              </div>
            </div>
          </div>

          {/* Column 2: Pending Local Commands */}
          <div
            style={{
              padding: '12px',
              backgroundColor: 'var(--bg-accent, #1e293b)',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #334155)',
            }}
          >
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '8px', color: '#f59e0b' }}>
              📱 Pending Offline Commands ({pendingMutations.length})
            </h3>
            <div style={{ maxHeight: '160px', overflowY: 'auto', fontSize: '0.8rem' }}>
              {pendingMutations.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>No queued commands</div>
              ) : (
                pendingMutations.map((m) => (
                  <div
                    key={m.queue_id}
                    style={{
                      padding: '6px',
                      borderBottom: '1px solid rgba(255,255,255,0.1)',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>
                      <strong>#{m.expected_delivery_sequence || m.queue_id}</strong>: {m.type}
                      {m.payload?.runs_batter !== undefined ? ` (+${m.payload.runs_batter} runs)` : ''}
                      {m.payload?.is_wicket ? ' [WICKET]' : ''}
                    </span>
                    <span style={{ color: m.state === 'CONFLICT' ? '#ef4444' : '#94a3b8' }}>
                      {m.state}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleDiscard}
            className="btn btn-secondary"
            style={{
              backgroundColor: '#374151',
              color: '#ffffff',
              padding: '8px 14px',
              fontSize: '0.85rem',
            }}
          >
            Discard Local Commands
          </button>
          <button
            onClick={handleRetry}
            className="btn btn-primary"
            style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              padding: '8px 14px',
              fontSize: '0.85rem',
              fontWeight: 700,
            }}
          >
            Retry Synchronization
          </button>
          <button
            onClick={onClose}
            className="btn"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--text-secondary, #94a3b8)',
              padding: '8px 14px',
              fontSize: '0.85rem',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
