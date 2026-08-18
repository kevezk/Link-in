const CACHE_NAME = 'link-in-integrated-v16';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './online.css',
  './app.js',
  './online.js',
  './pixelClassroom.js',
  './store.js',
  './avatar.js',
  './ai.js',
  './runtime-config.js',
  './characters.js',
  './char_red.webp',
  './char_orange.webp',
  './char_yellow.webp',
  './char_green.webp',
  './char_blue.webp',
  './char_purple.webp',
  './manifest.json',
  './cover_gatsaeng.webp',
  './sprout_stage1_cutout.webp',
  './sprout_stage2_cutout.webp',
  './sprout_stage3_cutout.webp',
  './sprout_stage4_cutout.webp',
  './icon-192.png',
  './icon-512.png'
];

// Service Worker Install Event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell and assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Service Worker Activate Event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(keyList.map(key => {
        if (key !== CACHE_NAME) {
          console.log('[Service Worker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim())
  );
});

// Service Worker Fetch Event (Cache-First / Network-Fallback Strategy)
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Always prefer the newest app shell and runtime connection settings.
  if (event.request.mode === 'navigate' || new URL(event.request.url).pathname.endsWith('/runtime-config.js')) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then(response => response || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request)
          .then(networkResponse => {
            // Check if we received a valid response
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Clone response to put in cache
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          })
          .catch(() => {
            // Fallback for offline mode if asset is not cached
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
      })
  );
});

// Service Worker Notification Click Event (Focus or Open LOCK-IN app)
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./index.html');
      }
    })
  );
});

self.addEventListener('push', event => {
  let payload = { title: 'LOCK-IN 알림', body: '예약한 루틴을 시작할 시간이에요.', url: '/' };
  try { payload = { ...payload, ...event.data.json() }; } catch (_error) {}
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body, icon: './icon-192.png', badge: './icon-192.png',
    tag: 'lock-in-routine', data: { url: payload.url || '/' }
  }));
});

// Service Worker Message Listener (For triggering local PWA notifications from app.js)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data.payload;
    self.registration.showNotification(title, {
      icon: './icon-192.png',
      badge: './icon-192.png',
      vibrate: [200, 100, 200],
      ...options
    });
  }
});
