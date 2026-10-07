// ====================================================================
// OFFLINE STORAGE ENGINE (INDEXEDDB COMMAND QUEUE & CACHE)
// ====================================================================

const DB_NAME = 'LocalCricket_Offline_v1';
const DB_VERSION = 1;

export const STORES = {
  MUTATION_QUEUE: 'mutation_queue',
  MATCH_CACHE: 'match_cache',
  APP_SETTINGS: 'app_settings',
};

export const MUTATION_STATES = {
  PENDING: 'PENDING',
  IN_FLIGHT: 'IN_FLIGHT',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  CONFLICT: 'CONFLICT',
  BLOCKED_AUTH: 'BLOCKED_AUTH',
  BLOCKED_FROZEN: 'BLOCKED_FROZEN',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  FAILED_PERMANENT: 'FAILED_PERMANENT',
};

/**
 * Strict Security Invariant: Zero Credentials in IndexedDB.
 * Asserts that no sensitive authentication tokens or passwords enter offline storage.
 */
export function assertNoCredentials(obj, path = '') {
  if (!obj || typeof obj !== 'object') return;

  const forbiddenKeys = [
    'token',
    'access_token',
    'accessToken',
    'refresh_token',
    'refreshToken',
    'password',
    'password_hash',
    'jwt',
    'secret',
  ];

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (forbiddenKeys.some((f) => key.toLowerCase().includes(f.toLowerCase()))) {
      throw new Error(`SECURITY_VIOLATION: Forbidden credential key "${currentPath}" detected in IndexedDB payload.`);
    }

    if (typeof value === 'string' && value.startsWith('eyJhbGciOi')) {
      throw new Error(`SECURITY_VIOLATION: Raw JWT pattern detected at "${currentPath}". Tokens must never be stored in IndexedDB.`);
    }

    if (typeof value === 'object' && value !== null) {
      assertNoCredentials(value, currentPath);
    }
  }
}

// In-Memory storage fallback for non-browser or test environments without IndexedDB
class MemoryStoreFallback {
  constructor() {
    this.mutation_queue = new Map();
    this.match_cache = new Map();
    this.app_settings = new Map();
    this.nextQueueId = 1;
  }

  async enqueueMutation(mutation) {
    assertNoCredentials(mutation);
    const queue_id = this.nextQueueId++;
    const record = {
      ...mutation,
      queue_id,
      retry_count: mutation.retry_count || 0,
      state: mutation.state || MUTATION_STATES.PENDING,
      created_at: mutation.created_at || new Date().toISOString(),
    };
    this.mutation_queue.set(queue_id, record);
    return record;
  }

  async getPendingMutations(matchId, userId) {
    const results = [];
    for (const record of this.mutation_queue.values()) {
      if (
        (!matchId || record.match_id === matchId) &&
        (!userId || record.user_id === userId) &&
        record.state !== MUTATION_STATES.ACKNOWLEDGED
      ) {
        results.push({ ...record });
      }
    }
    return results.sort((a, b) => a.queue_id - b.queue_id);
  }

  async getAllMutations() {
    return Array.from(this.mutation_queue.values()).sort((a, b) => a.queue_id - b.queue_id);
  }

  async updateMutationState(queueId, state, errorData = {}) {
    const record = this.mutation_queue.get(queueId);
    if (!record) return null;
    record.state = state;
    if (errorData.error_code) record.error_code = errorData.error_code;
    if (errorData.error_message) record.error_message = errorData.error_message;
    if (errorData.retry_count !== undefined) record.retry_count = errorData.retry_count;
    this.mutation_queue.set(queueId, record);
    return { ...record };
  }

  async removeMutation(queueId) {
    return this.mutation_queue.delete(queueId);
  }

  async clearQueue(matchId, userId) {
    for (const [id, record] of this.mutation_queue.entries()) {
      if (
        (!matchId || record.match_id === matchId) &&
        (!userId || record.user_id === userId)
      ) {
        this.mutation_queue.delete(id);
      }
    }
  }

  async resetInFlightMutations() {
    let count = 0;
    for (const record of this.mutation_queue.values()) {
      if (record.state === MUTATION_STATES.IN_FLIGHT) {
        record.state = MUTATION_STATES.PENDING;
        count++;
      }
    }
    return count;
  }

  async setMatchCache(userId, matchId, data) {
    assertNoCredentials(data);
    const key = `${userId}_${matchId}`;
    this.match_cache.set(key, { key, userId, matchId, data, updatedAt: new Date().toISOString() });
  }

  async getMatchCache(userId, matchId) {
    const key = `${userId}_${matchId}`;
    return this.match_cache.get(key)?.data || null;
  }

  async clearUserCaches(userId) {
    for (const [key, record] of this.match_cache.entries()) {
      if (record.userId === userId) {
        this.match_cache.delete(key);
      }
    }
  }

  async getSetting(key, defaultValue = null) {
    return this.app_settings.has(key) ? this.app_settings.get(key).value : defaultValue;
  }

  async setSetting(key, value) {
    this.app_settings.set(key, { key, value });
  }
}

class IndexedDBStorageEngine {
  constructor() {
    this.db = null;
    this.memoryFallback = new MemoryStoreFallback();
  }

  hasIndexedDB() {
    return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
  }

  async getDB() {
    if (!this.hasIndexedDB()) {
      return null;
    }
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Mutation Queue Store
        if (!db.objectStoreNames.contains(STORES.MUTATION_QUEUE)) {
          const queueStore = db.createObjectStore(STORES.MUTATION_QUEUE, {
            keyPath: 'queue_id',
            autoIncrement: true,
          });
          queueStore.createIndex('match_id', 'match_id', { unique: false });
          queueStore.createIndex('user_id', 'user_id', { unique: false });
          queueStore.createIndex('state', 'state', { unique: false });
          queueStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // 2. User-Scoped Match Cache Store
        if (!db.objectStoreNames.contains(STORES.MATCH_CACHE)) {
          db.createObjectStore(STORES.MATCH_CACHE, { keyPath: 'key' });
        }

        // 3. App Settings Store
        if (!db.objectStoreNames.contains(STORES.APP_SETTINGS)) {
          db.createObjectStore(STORES.APP_SETTINGS, { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.warn('IndexedDB failed to open, using memory fallback:', event.target.error);
        resolve(null);
      };
    });
  }

  async enqueueMutation(mutation) {
    assertNoCredentials(mutation);
    const db = await this.getDB();
    if (!db) return this.memoryFallback.enqueueMutation(mutation);

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.MUTATION_QUEUE], 'readwrite');
      const store = tx.objectStore(STORES.MUTATION_QUEUE);

      const payloadToSave = {
        match_id: mutation.match_id,
        tournament_id: mutation.tournament_id,
        user_id: mutation.user_id,
        type: mutation.type,
        idempotency_key: mutation.idempotency_key,
        expected_delivery_sequence: mutation.expected_delivery_sequence,
        payload: mutation.payload || {},
        created_at: mutation.created_at || new Date().toISOString(),
        retry_count: mutation.retry_count || 0,
        state: mutation.state || MUTATION_STATES.PENDING,
      };

      const req = store.add(payloadToSave);
      req.onsuccess = (e) => {
        payloadToSave.queue_id = e.target.result;
        resolve(payloadToSave);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getPendingMutations(matchId, userId) {
    const db = await this.getDB();
    if (!db) return this.memoryFallback.getPendingMutations(matchId, userId);

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.MUTATION_QUEUE], 'readonly');
      const store = tx.objectStore(STORES.MUTATION_QUEUE);
      const req = store.openCursor();
      const results = [];

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const item = cursor.value;
          if (
            (!matchId || item.match_id === matchId) &&
            (!userId || item.user_id === userId) &&
            item.state !== MUTATION_STATES.ACKNOWLEDGED
          ) {
            results.push(item);
          }
          cursor.continue();
        } else {
          results.sort((a, b) => a.queue_id - b.queue_id);
          resolve(results);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getAllMutations() {
    const db = await this.getDB();
    if (!db) return this.memoryFallback.getAllMutations();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.MUTATION_QUEUE], 'readonly');
      const store = tx.objectStore(STORES.MUTATION_QUEUE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => a.queue_id - b.queue_id));
      req.onerror = () => reject(req.error);
    });
  }

  async updateMutationState(queueId, state, errorData = {}) {
    const db = await this.getDB();
    if (!db) return this.memoryFallback.updateMutationState(queueId, state, errorData);

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.MUTATION_QUEUE], 'readwrite');
      const store = tx.objectStore(STORES.MUTATION_QUEUE);
      const getReq = store.get(queueId);

      getReq.onsuccess = () => {
        const item = getReq.result;
        if (!item) return resolve(null);

        item.state = state;
        if (errorData.error_code) item.error_code = errorData.error_code;
        if (errorData.error_message) item.error_message = errorData.error_message;
        if (errorData.retry_count !== undefined) item.retry_count = errorData.retry_count;

        const putReq = store.put(item);
        putReq.onsuccess = () => resolve(item);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async removeMutation(queueId) {
    const db = await this.getDB();
    if (!db) return this.memoryFallback.removeMutation(queueId);

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.MUTATION_QUEUE], 'readwrite');
      const store = tx.objectStore(STORES.MUTATION_QUEUE);
      const req = store.delete(queueId);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async clearQueue(matchId, userId) {
    const db = await this.getDB();
    if (!db) return this.memoryFallback.clearQueue(matchId, userId);

    const pending = await this.getPendingMutations(matchId, userId);
    const tx = db.transaction([STORES.MUTATION_QUEUE], 'readwrite');
    const store = tx.objectStore(STORES.MUTATION_QUEUE);
    for (const item of pending) {
      store.delete(item.queue_id);
    }
  }

  async resetInFlightMutations() {
    const db = await this.getDB();
    if (!db) return this.memoryFallback.resetInFlightMutations();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.MUTATION_QUEUE], 'readwrite');
      const store = tx.objectStore(STORES.MUTATION_QUEUE);
      const req = store.openCursor();
      let resetCount = 0;

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const item = cursor.value;
          if (item.state === MUTATION_STATES.IN_FLIGHT) {
            item.state = MUTATION_STATES.PENDING;
            cursor.update(item);
            resetCount++;
          }
          cursor.continue();
        } else {
          resolve(resetCount);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async setMatchCache(userId, matchId, data) {
    assertNoCredentials(data);
    const db = await this.getDB();
    if (!db) return this.memoryFallback.setMatchCache(userId, matchId, data);

    const key = `${userId}_${matchId}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.MATCH_CACHE], 'readwrite');
      const store = tx.objectStore(STORES.MATCH_CACHE);
      const req = store.put({ key, userId, matchId, data, updatedAt: new Date().toISOString() });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async getMatchCache(userId, matchId) {
    const db = await this.getDB();
    if (!db) return this.memoryFallback.getMatchCache(userId, matchId);

    const key = `${userId}_${matchId}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.MATCH_CACHE], 'readonly');
      const store = tx.objectStore(STORES.MATCH_CACHE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => reject(req.error);
    });
  }

  async clearUserCaches(userId) {
    const db = await this.getDB();
    if (!db) return this.memoryFallback.clearUserCaches(userId);

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.MATCH_CACHE], 'readwrite');
      const store = tx.objectStore(STORES.MATCH_CACHE);
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (cursor.value.userId === userId) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve(true);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getSetting(key, defaultValue = null) {
    const db = await this.getDB();
    if (!db) return this.memoryFallback.getSetting(key, defaultValue);

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.APP_SETTINGS], 'readonly');
      const store = tx.objectStore(STORES.APP_SETTINGS);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : defaultValue);
      req.onerror = () => reject(req.error);
    });
  }

  async setSetting(key, value) {
    const db = await this.getDB();
    if (!db) return this.memoryFallback.setSetting(key, value);

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.APP_SETTINGS], 'readwrite');
      const store = tx.objectStore(STORES.APP_SETTINGS);
      const req = store.put({ key, value });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }
}

export const offlineStorage = new IndexedDBStorageEngine();
