// ====================================================================
// NETWORK STATUS & SYNC BADGE WITH THEME SWITCHER
// ====================================================================

import React, { useState, useEffect } from 'react';
import { offlineQueueService, SYNC_STATUS } from '../../services/offlineQueueService.js';
import { offlineStorage } from '../../services/offlineStorage.js';
import { useTheme, THEMES } from '../../contexts/ThemeContext.jsx';

export default function NetworkStatusBadge({ matchId, userId }) {
  const [status, setStatus] = useState(offlineQueueService.getStatus());
  const [pendingCount, setPendingCount] = useState(0);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const unsubStatus = offlineQueueService.subscribeStatus((newStatus) => {
      setStatus(newStatus);
    });

    const updatePending = async () => {
      try {
        const mutations = await offlineStorage.getPendingMutations(matchId, userId);
        setPendingCount(mutations.length);
      } catch {
        setPendingCount(0);
      }
    };

    updatePending();
    const unsubQueue = offlineQueueService.subscribeQueue(() => {
      updatePending();
    });

    const interval = setInterval(updatePending, 2000);

    return () => {
      unsubStatus();
      unsubQueue();
      clearInterval(interval);
    };
  }, [matchId, userId]);

  const handleSyncNow = () => {
    offlineQueueService.drainQueue().catch(() => {});
  };

  const getStatusBadge = () => {
    switch (status) {
      case SYNC_STATUS.SYNCING:
        return (
          <span className="badge" style={{ backgroundColor: '#f59e0b', color: '#000000', fontWeight: 700 }}>
            ⚡ Syncing ({pendingCount})
          </span>
        );
      case SYNC_STATUS.OFFLINE:
        return (
          <span className="badge" style={{ backgroundColor: '#ef4444', color: '#ffffff', fontWeight: 700 }}>
            📡 Offline ({pendingCount} pending)
          </span>
        );
      case SYNC_STATUS.CONFLICT:
        return (
          <span className="badge" style={{ backgroundColor: '#dc2626', color: '#ffffff', fontWeight: 800 }}>
            ⚠️ Conflict Paused
          </span>
        );
      case SYNC_STATUS.BLOCKED_FROZEN:
        return (
          <span className="badge" style={{ backgroundColor: '#64748b', color: '#ffffff', fontWeight: 700 }}>
            🔒 Tournament Frozen
          </span>
        );
      case SYNC_STATUS.BLOCKED_AUTH:
        return (
          <span className="badge" style={{ backgroundColor: '#ea580c', color: '#ffffff', fontWeight: 700 }}>
            🔑 Login Required
          </span>
        );
      case SYNC_STATUS.IDLE:
      default:
        if (pendingCount > 0) {
          return (
            <span className="badge" style={{ backgroundColor: '#f59e0b', color: '#000000', fontWeight: 700 }}>
              🟡 Queued ({pendingCount})
            </span>
          );
        }
        return (
          <span className="badge" style={{ backgroundColor: '#10b981', color: '#ffffff', fontWeight: 700 }}>
            🟢 Online
          </span>
        );
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        backgroundColor: 'var(--bg-accent, #1e293b)',
        borderRadius: '8px',
        fontSize: '0.85rem',
        marginBottom: '10px',
        flexWrap: 'wrap',
        gap: '8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {getStatusBadge()}
        {pendingCount > 0 && status !== SYNC_STATUS.SYNCING && (
          <button
            onClick={handleSyncNow}
            style={{
              padding: '2px 8px',
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: 'var(--accent-blue, #3b82f6)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Sync Now
          </button>
        )}
      </div>

      {/* Theme Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          onClick={() => setTheme(THEMES.DEFAULT)}
          title="Default Theme"
          style={{
            padding: '2px 6px',
            fontSize: '0.75rem',
            backgroundColor: theme === THEMES.DEFAULT ? '#3b82f6' : 'transparent',
            color: '#ffffff',
            border: '1px solid #475569',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          🌙 Night
        </button>
        <button
          onClick={() => setTheme(THEMES.SUNLIGHT)}
          title="Outdoor Sunlight High-Contrast Mode"
          style={{
            padding: '2px 6px',
            fontSize: '0.75rem',
            backgroundColor: theme === THEMES.SUNLIGHT ? '#f59e0b' : 'transparent',
            color: theme === THEMES.SUNLIGHT ? '#000000' : '#ffffff',
            fontWeight: theme === THEMES.SUNLIGHT ? 800 : 500,
            border: '1px solid #f59e0b',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          ☀️ Sunlight
        </button>
        <button
          onClick={() => setTheme(THEMES.BATTERY_SAVER)}
          title="OLED Battery Saver Mode"
          style={{
            padding: '2px 6px',
            fontSize: '0.75rem',
            backgroundColor: theme === THEMES.BATTERY_SAVER ? '#10b981' : 'transparent',
            color: '#ffffff',
            border: '1px solid #10b981',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          🔋 OLED
        </button>
      </div>
    </div>
  );
}
