/* Service Worker — 3D Oscilloscope RF Generator
 * Strategy:
 *   • index.html  → network-first (always deliver latest markup)
 *   • all other static assets → cache-first (fast loads, versioned cache)
 * Bump CACHE_VERSION whenever static assets change to force an update.
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME    = `osc-rf-gen-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './',
  'index.html',
  'manifest.json',
  'src/css/style.css',
  'src/js/signal.js',
  'src/js/renderer.js',
  'src/js/app.js',
  'src/vendor/three.min.js'
];

// ── Install: pre-cache all static assets ──────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())   // activate immediately, don't wait for old tabs to close
  );
});

// ── Activate: remove stale caches from previous versions ──────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())  // take control of all open pages immediately
  );
});

// ── Fetch: network-first for HTML, cache-first for everything else ─────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle same-origin GET requests
  if (request.method !== 'GET') return;
  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
  } catch (_) {
    return;
  }

  const isNavigation = request.mode === 'navigate' ||
    request.destination === 'document';

  if (isNavigation) {
    // Network-first: always try to fetch fresh HTML so updates are visible
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // Cache the fresh response for offline fallback
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return networkResponse;
        })
        .catch(() => caches.match(request))   // offline fallback
    );
  } else {
    // Cache-first: serve from cache, update in background (stale-while-revalidate)
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request).then((networkResponse) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse.clone()));
          return networkResponse;
        }).catch(() => undefined);
        return cached || networkFetch;
      })
    );
  }
});

// ── Message: allow pages to trigger skipWaiting (used by update toast) ────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
