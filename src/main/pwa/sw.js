// Halo Chat Service Worker — push notifications + offline caching
const CACHE_NAME = 'halo-chat-v1';
const OFFLINE_URLS = ['/', '/manifest.json', '/icon.png'];

// Install: cache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Fetch: network-first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET and API calls
  if (event.request.method !== 'GET' || event.request.url.includes('/chat') || event.request.url.includes('/voice/')) return;
  event.respondWith(
    fetch(event.request).then(response => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      return response;
    }).catch(() => caches.match(event.request))
  );
});

// Push notification handler
self.addEventListener('push', (event) => {
  const data = event.data?.json() || { title: 'Halo Chat', body: 'New message', agent: 'hal' };
  const options = {
    body: data.body,
    icon: '/icon.png',
    badge: '/icon.png',
    tag: data.agent || 'halo',
    data: { agent: data.agent },
    actions: [{ action: 'reply', title: 'Reply' }],
    vibrate: [100, 50, 100],
  };
  event.waitUntil(self.registration.showNotification(data.title || 'Halo Chat', options));
});

// Notification click — focus app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      if (clients.length > 0) {
        clients[0].focus();
        clients[0].postMessage({ type: 'notification-click', agent: event.notification.data?.agent });
      } else {
        self.clients.openWindow('/');
      }
    })
  );
});
