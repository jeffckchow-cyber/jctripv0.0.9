
const CACHE_NAME = 'wandersync-v7-sync-robust';
const ASSETS = [
  './',
  './index.html',
  './metadata.json',
  'https://cdn.tailwindcss.com'
];

// Google Script URL keyword
const API_URL_KEYWORD = 'macros/s/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Rule: DO NOT intercept or cache the Google Script URL (keep sync dynamic and bypass SW)
  // This is critical for data synchronization to reach the real network.
  if (url.includes(API_URL_KEYWORD)) {
    console.debug('WanderSync SW: Bypassing cache for sync request:', url);
    return; // Browser handles this request normally via network
  }

  // Cache-First strategy for local assets (iPhone instant-open)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      
      return fetch(event.request).then((networkResponse) => {
        // Only cache valid basic responses and CDN assets
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        
        return networkResponse;
      }).catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('./');
        }
      });
    })
  );
});
