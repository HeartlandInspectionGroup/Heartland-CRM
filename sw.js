/* Service Worker — Heartland Inspector PWA */
var CACHE_VERSION = 'hig-inspector-v1';
var STATIC_ASSETS = [
  '/inspector-wizard-v2.html',
  '/manifest.json',
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/images/HIG_Logo.avif',
  '/images/HIG_Logo.png',
  '/assets/js/inspector/inspector-db.js',
  '/assets/js/inspector/inspector-sync.js',
  '/assets/js/inspector/inspector-photos.js',
  '/assets/js/inspector/inspector-voice.js',
  '/assets/js/inspector/inspector-sections.js',
  '/assets/js/inspector/inspector-app.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
];

/* Install — cache static assets */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

/* Activate — clean old caches */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_VERSION; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* Fetch — cache-first for static, network-first for API */
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  /* Skip non-GET requests */
  if (event.request.method !== 'GET') return;

  /* Network-first for Supabase REST and API routes */
  if (url.pathname.startsWith('/api/') ||
      url.hostname.endsWith('supabase.co') && url.pathname.startsWith('/rest/')) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        return response;
      }).catch(function() {
        return new Response(JSON.stringify({ offline: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  /* Cache-first for static assets */
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        /* Cache successful responses for inspector assets */
        if (response.ok && (
          url.pathname.startsWith('/assets/js/inspector/') ||
          url.pathname.startsWith('/images/') ||
          url.pathname === '/inspector-wizard-v2.html'
        )) {
          var clone = response.clone();
          caches.open(CACHE_VERSION).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});

/* Background Sync — process queued inspection data when back online */
self.addEventListener('sync', function(event) {
  if (event.tag === 'inspection-sync') {
    event.waitUntil(
      self.clients.matchAll().then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'trigger-sync' });
        });
      })
    );
  }
});
