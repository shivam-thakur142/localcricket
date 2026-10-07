// ====================================================================
// OFFLINE QUEUE SERVICE & SYNCHRONIZATION MANAGER
// ====================================================================

import { offlineStorage, MUTATION_STATES } from './offlineStorage.js';
import { api, getAccessToken, setAccessToken } from './api.js';

export const SYNC_STATUS = {
  IDLE: 'IDLE',
  SYNCING: 'SYNCING',
  OFFLINE: 'OFFLINE',
  CONFLICT: 'CONFLICT',
  BLOCKED_AUTH: 'BLOCKED_AUTH',
  BLOCKED_FROZEN: 'BLOCKED_FROZEN',
  ERROR: 'ERROR',
};

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function calculateBackoff(retryCount) {
  const base = Math.min(30000, 1000 * Math.pow(2, retryCount));
  const jitter = base * (0.8 + Math.random() * 0.4); // ±20% jitter
  return Math.round(jitter);
}

class OfflineQueueService {
  constructor() {
    this.status = SYNC_STATUS.IDLE;
    this.statusListeners = new Set();
    this.queueListeners = new Set();
    this.conflictListeners = new Set();
    this.isSyncing = false;
    this.currentUserId = null;
    this.consecutiveNetworkFailures = 0;
    this.backoffTimeout = null;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkOnline());
      window.addEventListener('offline', () => this.handleNetworkOffline());
    }

    // Run crash recovery on service start
    this.initializeCrashRecovery();
  }

  async initializeCrashRecovery() {
    try {
      const resetCount = await offlineStorage.resetInFlightMutations();
      if (resetCount > 0) {
        console.log(`[OfflineQueueService] Crash recovery: reset ${resetCount} IN_FLIGHT mutation(s) to PENDING.`);
        this.notifyQueueListeners();
      }
    } catch (e) {
      console.warn('[OfflineQueueService] Crash recovery check failed:', e);
    }
  }

  setCurrentUser(userId) {
    this.currentUserId = userId || null;
  }

  getCurrentUser() {
    return this.currentUserId;
  }

  getStatus() {
    return this.status;
  }

  setStatus(newStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.notifyStatusListeners(newStatus);
    }
  }

  subscribeStatus(fn) {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  subscribeQueue(fn) {
    this.queueListeners.add(fn);
    return () => this.queueListeners.delete(fn);
  }

  subscribeConflict(fn) {
    this.conflictListeners.add(fn);
    return () => this.conflictListeners.delete(fn);
  }

  notifyStatusListeners(status) {
    for (const fn of this.statusListeners) {
      try {
        fn(status);
      } catch (e) {
        console.error(e);
      }
    }
  }

  notifyQueueListeners() {
    for (const fn of this.queueListeners) {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    }
  }

  notifyConflictListeners(conflictData) {
    for (const fn of this.conflictListeners) {
      try {
        fn(conflictData);
      } catch (e) {
        console.error(e);
      }
    }
  }

  handleNetworkOnline() {
    console.log('[OfflineQueueService] Network online event received. Triggering sync.');
    this.consecutiveNetworkFailures = 0;
    this.drainQueue();
  }

  handleNetworkOffline() {
    console.log('[OfflineQueueService] Network offline event received.');
    this.setStatus(SYNC_STATUS.OFFLINE);
  }

  // ----------------------------------------------------
  // ENQUEUE OPERATIONS (RECORD INTENT WITH PRESERVED IDEMPOTENCY)
  // ----------------------------------------------------
  async enqueueDelivery(matchId, tournamentId, userId, payload, expectedDeliverySequence) {
    const idempotency_key = generateUUID();
    const mutation = {
      match_id: matchId,
      tournament_id: tournamentId,
      user_id: userId,
      type: 'RECORD_DELIVERY',
      idempotency_key,
      expected_delivery_sequence: expectedDeliverySequence,
      payload,
      created_at: new Date().toISOString(),
      retry_count: 0,
      state: MUTATION_STATES.PENDING,
    };

    const saved = await offlineStorage.enqueueMutation(mutation);
    this.notifyQueueListeners();

    // Trigger sync attempt
    this.drainQueue().catch(() => {});
    return saved;
  }

  async enqueueUndo(matchId, tournamentId, userId, { expectedDeliverySequence, targetDeliveryId, reversionReason }) {
    const idempotency_key = generateUUID();
    const mutation = {
      match_id: matchId,
      tournament_id: tournamentId,
      user_id: userId,
      type: 'UNDO_DELIVERY',
      idempotency_key,
      expected_delivery_sequence: expectedDeliverySequence,
      payload: {
        target_delivery_id: targetDeliveryId || null,
        reversion_reason: reversionReason || 'Scorer requested undo',
        is_offline: true,
      },
      created_at: new Date().toISOString(),
      retry_count: 0,
      state: MUTATION_STATES.PENDING,
    };

    const saved = await offlineStorage.enqueueMutation(mutation);
    this.notifyQueueListeners();

    // Trigger sync attempt
    this.drainQueue().catch(() => {});
    return saved;
  }

  async enqueueMutation(mutation) {
    if (!mutation.idempotency_key) {
      mutation.idempotency_key = generateUUID();
    }
    const saved = await offlineStorage.enqueueMutation(mutation);
    this.notifyQueueListeners();
    this.drainQueue().catch(() => {});
    return saved;
  }

  // ----------------------------------------------------
  // PRE-FLIGHT CHECKS: HEALTH & AUTH
  // ----------------------------------------------------
  async checkApiHealth() {
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 3000) : null;
      const res = await fetch('/health', {
        method: 'GET',
        signal: controller?.signal,
      });
      if (timeoutId) clearTimeout(timeoutId);
      return res.ok;
    } catch {
      return false;
    }
  }

  async checkAuth() {
    try {
      const res = await api.getMe();
      return { ok: true, user: res.data };
    } catch (err) {
      if (err.status === 401 || err.code === 'UNAUTHORIZED' || err.code === 'TOKEN_EXPIRED') {
        // Attempt silent M11 token refresh
        try {
          const refreshRes = await fetch('/api/v1/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({}),
          });
          if (refreshRes.ok) {
            const data = await refreshRes.json();
            const newToken = data.data?.accessToken;
            if (newToken) {
              setAccessToken(newToken);
              return { ok: true };
            }
          }
        } catch {
          // Refresh failed
        }
        return { ok: false, reason: 'AUTH_EXPIRED' };
      }
      return { ok: false, reason: 'NETWORK_ERROR' };
    }
  }

  // ----------------------------------------------------
  // FIFO QUEUE DRAINAGE PIPELINE
  // ----------------------------------------------------
  async drainQueue() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const pendingMutations = await offlineStorage.getPendingMutations(null, this.currentUserId);
      if (pendingMutations.length === 0) {
        this.setStatus(SYNC_STATUS.IDLE);
        return;
      }

      this.setStatus(SYNC_STATUS.SYNCING);

      // Step 1: API Health Check (timeout 3s)
      const isHealthy = await this.checkApiHealth();
      if (!isHealthy) {
        this.consecutiveNetworkFailures++;
        this.setStatus(SYNC_STATUS.OFFLINE);
        this.scheduleRetry();
        return;
      }

      // Step 2: Auth Verification & M11 Silent Refresh
      const authResult = await this.checkAuth();
      if (!authResult.ok) {
        if (authResult.reason === 'AUTH_EXPIRED') {
          this.setStatus(SYNC_STATUS.BLOCKED_AUTH);
          return; // Preserve queue, prompt login
        }
        this.setStatus(SYNC_STATUS.OFFLINE);
        this.scheduleRetry();
        return;
      }

      // Step 3: FIFO Queue Drainage
      for (const mutation of pendingMutations) {
        // Set IN_FLIGHT
        await offlineStorage.updateMutationState(mutation.queue_id, MUTATION_STATES.IN_FLIGHT);

        try {
          let response;
          if (mutation.type === 'RECORD_DELIVERY') {
            response = await api.recordDelivery(
              mutation.match_id,
              mutation.payload,
              mutation.user_id,
              mutation.idempotency_key
            );
          } else if (mutation.type === 'UNDO_DELIVERY') {
            response = await api.undoDelivery(
              mutation.match_id,
              {
                expectedDeliverySequence: mutation.expected_delivery_sequence,
                targetDeliveryId: mutation.payload.target_delivery_id,
                reversionReason: mutation.payload.reversion_reason,
                isOffline: true,
              },
              mutation.user_id,
              mutation.idempotency_key
            );
          } else if (mutation.type === 'START_INNINGS') {
            response = await api.startInnings(mutation.match_id, mutation.payload, mutation.user_id);
          } else if (mutation.type === 'START_OVER') {
            response = await api.startOver(mutation.match_id, mutation.payload, mutation.user_id);
          } else if (mutation.type === 'RECORD_TOSS') {
            response = await api.recordToss(mutation.match_id, mutation.payload, mutation.user_id);
          }

          // Acknowledged by backend (200 / 201)
          await offlineStorage.removeMutation(mutation.queue_id);
          this.consecutiveNetworkFailures = 0;
          this.notifyQueueListeners();

          // Refresh user-scoped match snapshot if active
          if (response?.data?.innings_state) {
            await offlineStorage.setMatchCache(mutation.user_id, mutation.match_id, response.data);
          }
        } catch (err) {
          console.error(`[OfflineQueueService] Replay failed for queue_id ${mutation.queue_id}:`, err);

          // Handle 409 Conflict (Sequence mismatch or offline undo conflict)
          if (err.status === 409 || err.code === 'OFFLINE_UNDO_CONFLICT' || err.code === 'STALE_SEQUENCE_CONFLICT') {
            await offlineStorage.updateMutationState(mutation.queue_id, MUTATION_STATES.CONFLICT, {
              error_code: err.code || 'CONFLICT',
              error_message: err.message || 'Sequence or undo conflict on server',
            });
            this.setStatus(SYNC_STATUS.CONFLICT);
            this.notifyConflictListeners({
              mutation,
              error: err,
            });
            // HALT queue immediately; do NOT automatically re-sequence
            return;
          }

          // Handle 423 Tournament Frozen
          if (err.status === 423 || err.code === 'TOURNAMENT_FROZEN') {
            await offlineStorage.updateMutationState(mutation.queue_id, MUTATION_STATES.BLOCKED_FROZEN, {
              error_code: 'TOURNAMENT_FROZEN',
              error_message: err.message || 'Tournament is frozen by administrator',
            });
            this.setStatus(SYNC_STATUS.BLOCKED_FROZEN);
            // HALT queue; retain all commands
            return;
          }

          // Handle 401 Auth Expired
          if (err.status === 401 || err.code === 'UNAUTHORIZED' || err.code === 'TOKEN_EXPIRED') {
            await offlineStorage.updateMutationState(mutation.queue_id, MUTATION_STATES.BLOCKED_AUTH, {
              error_code: 'UNAUTHORIZED',
              error_message: err.message || 'Session expired',
            });
            this.setStatus(SYNC_STATUS.BLOCKED_AUTH);
            return;
          }

          // Handle Permanent 4xx Validation Errors (400, 422)
          if (err.status >= 400 && err.status < 500) {
            await offlineStorage.updateMutationState(mutation.queue_id, MUTATION_STATES.FAILED_PERMANENT, {
              error_code: err.code || 'VALIDATION_ERROR',
              error_message: err.message || 'Server rejected mutation validation',
            });
            this.setStatus(SYNC_STATUS.ERROR);
            return;
          }

          // Handle 5xx Server Error or Network Drop (Retryable)
          const newRetryCount = (mutation.retry_count || 0) + 1;
          await offlineStorage.updateMutationState(mutation.queue_id, MUTATION_STATES.PENDING, {
            retry_count: newRetryCount,
            error_code: err.code || 'NETWORK_ERROR',
            error_message: err.message || 'Network failure during sync',
          });

          this.consecutiveNetworkFailures++;
          if (this.consecutiveNetworkFailures >= 5) {
            console.warn('[OfflineQueueService] Max consecutive network failures reached (5). Pausing sync.');
            this.setStatus(SYNC_STATUS.OFFLINE);
            return;
          }

          this.setStatus(SYNC_STATUS.OFFLINE);
          this.scheduleRetry(newRetryCount);
          return;
        }
      }

      this.setStatus(SYNC_STATUS.IDLE);
    } finally {
      this.isSyncing = false;
    }
  }

  scheduleRetry(retryCount = this.consecutiveNetworkFailures) {
    if (this.backoffTimeout) clearTimeout(this.backoffTimeout);
    const delay = calculateBackoff(retryCount);
    console.log(`[OfflineQueueService] Scheduling backoff retry in ${delay}ms...`);
    this.backoffTimeout = setTimeout(() => {
      this.drainQueue().catch(() => {});
    }, delay);
  }

  clearRetry() {
    if (this.backoffTimeout) {
      clearTimeout(this.backoffTimeout);
      this.backoffTimeout = null;
    }
  }

  // ----------------------------------------------------
  // CONFLICT RESOLUTION ACTIONS
  // ----------------------------------------------------
  async discardQueuedMutations(matchId, userId) {
    await offlineStorage.clearQueue(matchId, userId);
    this.setStatus(SYNC_STATUS.IDLE);
    this.notifyQueueListeners();
  }

  async retryQueuedMutations(matchId, userId) {
    // Reset all conflicts back to PENDING
    const pending = await offlineStorage.getPendingMutations(matchId, userId);
    for (const m of pending) {
      if (m.state === MUTATION_STATES.CONFLICT) {
        await offlineStorage.updateMutationState(m.queue_id, MUTATION_STATES.PENDING);
      }
    }
    this.setStatus(SYNC_STATUS.IDLE);
    return this.drainQueue();
  }

  async clearUserSession(userId) {
    await offlineStorage.clearUserCaches(userId);
    this.currentUserId = null;
    this.setStatus(SYNC_STATUS.IDLE);
  }
}

export const offlineQueueService = new OfflineQueueService();
