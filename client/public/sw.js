// ====================================================================
// LOCALCRICKET SERVICE WORKER (PWA & OFFLINE INFRASTRUCTURE)
// ====================================================================

const CACHE_NAME = 'localcricket-shell-v1';
const API_CACHE_NAME = 'localcricket-api-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

/**
 * Route classifier determining caching strategy for any request.
 * Exported / modular logic used for both SW execution and automated testing.
 */
export function classifyRequestStrategy(request) {
  const url = new URL(request.url, typeof self !== 'undefined' ? self.location?.origin : 'http://localhost');
  const method = request.method || 'GET';
  const acceptHeader = request.headers?.get ? request.headers.get('accept') : (request.headers?.accept || '');

  // 1. Strict Bypass (Network-Only)
  // Real-Time SSE Streams must NEVER be buffered or intercepted
  if (url.pathname.includes('/stream') || (acceptHeader && acceptHeader.includes('text/event-stream'))) {
    return 'NETWORK_ONLY_SSE';
  }

  // Authentication endpoints must never touch browser cache
  if (url.pathname.startsWith('/api/v1/auth')) {
    return 'NETWORK_ONLY_AUTH';
  }

  // Super Admin governance endpoints must never touch browser cache
  if (url.pathname.startsWith('/api/v1/admin')) {
    return 'NETWORK_ONLY_ADMIN';
  }

  // Mutations (POST, PUT, PATCH, DELETE) must never be cached by SW
  if (method !== 'GET' || url.pathname.startsWith('/api/v1/scorer')) {
    return 'NETWORK_ONLY_MUTATION';
  }

  // 2. Public Read APIs: Network-First with Cache Fallback
  if (
    url.pathname.startsWith('/api/v1/tournaments') ||
    url.pathname.startsWith('/api/v1/teams') ||
    url.pathname.startsWith('/api/v1/players')
  ) {
    return 'NETWORK_FIRST_READ';
  }

  // 3. App Shell & Static Assets: Cache-First
  return 'CACHE_FIRST_SHELL';
}

// Service worker lifecycle (active only in ServiceWorkerGlobalScope)
if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.addAll(STATIC_ASSETS))
        .then(() => self.skipWaiting())
    );
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k !== CACHE_NAME && k !== API_CACHE_NAME)
              .map((k) => caches.delete(k))
          )
        )
        .then(() => self.clients.claim())
    );
  });

  self.addEventListener('fetch', (event) => {
    const strategy = classifyRequestStrategy(event.request);

    // Bypass Network-Only endpoints directly
    if (
      strategy === 'NETWORK_ONLY_SSE' ||
      strategy === 'NETWORK_ONLY_AUTH' ||
      strategy === 'NETWORK_ONLY_ADMIN' ||
      strategy === 'NETWORK_ONLY_MUTATION'
    ) {
      return; // Browser default network handling
    }

    if (strategy === 'NETWORK_FIRST_READ') {
      event.respondWith(
        fetch(event.request)
          .then((networkRes) => {
            if (networkRes.ok) {
              const clone = networkRes.clone();
              caches.open(API_CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return networkRes;
          })
          .catch(() => caches.match(event.request))
      );
      return;
    }

    // Default CACHE_FIRST_SHELL
    event.respondWith(
      caches.match(event.request).then((cachedRes) => {
        if (cachedRes) return cachedRes;
        return fetch(event.request).then((networkRes) => {
          if (networkRes.ok && event.request.method === 'GET') {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkRes;
        });
      })
    );
  });
}
