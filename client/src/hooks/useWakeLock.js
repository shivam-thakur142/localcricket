// ====================================================================
// FIELD ERGONOMICS: SCREEN WAKE LOCK API HOOK
// ====================================================================

import { useState, useEffect, useRef, useCallback } from 'react';

export const WAKE_LOCK_STATUS = {
  UNAVAILABLE: 'UNAVAILABLE',
  REQUESTED: 'REQUESTED',
  ACTIVE: 'ACTIVE',
  RELEASED: 'RELEASED',
  ERROR: 'ERROR',
};

export function useWakeLock(enabled = true) {
  const [status, setStatus] = useState(WAKE_LOCK_STATUS.UNAVAILABLE);
  const wakeLockSentinelRef = useRef(null);

  const requestWakeLock = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.wakeLock) {
      setStatus(WAKE_LOCK_STATUS.UNAVAILABLE);
      return false;
    }

    try {
      setStatus(WAKE_LOCK_STATUS.REQUESTED);
      const sentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinelRef.current = sentinel;
      setStatus(WAKE_LOCK_STATUS.ACTIVE);

      sentinel.addEventListener('release', () => {
        wakeLockSentinelRef.current = null;
        setStatus(WAKE_LOCK_STATUS.RELEASED);
      });
      return true;
    } catch (err) {
      console.warn('[useWakeLock] Failed to acquire screen wake lock:', err);
      setStatus(WAKE_LOCK_STATUS.ERROR);
      return false;
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockSentinelRef.current) {
      try {
        await wakeLockSentinelRef.current.release();
      } catch (err) {
        console.warn('[useWakeLock] Failed to release screen wake lock:', err);
      }
      wakeLockSentinelRef.current = null;
    }
    setStatus(WAKE_LOCK_STATUS.RELEASED);
  }, []);

  useEffect(() => {
    if (!enabled) {
      releaseWakeLock();
      return;
    }

    requestWakeLock();

    // Re-request lock on visibility change (e.g. user switched back from another app)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled) {
        requestWakeLock();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      releaseWakeLock();
    };
  }, [enabled, requestWakeLock, releaseWakeLock]);

  return {
    status,
    isActive: status === WAKE_LOCK_STATUS.ACTIVE,
    requestWakeLock,
    releaseWakeLock,
  };
}
