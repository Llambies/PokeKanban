// Service worker: shows the reminders the server sends as push notifications and opens the
// right event when one is tapped. The app itself always loads fresh (no navigation caching);
// the only thing cached here is Pokémon sprites, which never change once published.

const SPRITE_CACHE = 'pokekanban-sprites-v1';
const SPRITE_HOST = 'raw.githubusercontent.com';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop sprite caches from older versions of the service worker.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('pokekanban-sprites-') && k !== SPRITE_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Sprites come from raw.githubusercontent.com and are immutable (each URL is a specific sprite),
// so a cache-first strategy avoids refetching the same ~30 KB of images on every visit.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.hostname !== SPRITE_HOST) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(SPRITE_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      // mode: 'cors' with no-cors fallback isn't needed: the <img> request itself decides the
      // mode, and an opaque response can still be cached and replayed for the same request.
      const response = await fetch(request);
      if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
      return response;
    })(),
  );
});

self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(message.title || 'PokeKanban', {
      body: message.body || '',
      tag: message.tag,
      // The event's Pokémon, if it has one as its icon.
      icon: message.icon || 'icon-192.png',
      badge: 'badge-96.png',
      data: { url: message.url || '#/calendar' },
      timestamp: Date.now(),
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '#/calendar', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (open) {
        await open.focus();
        open.postMessage({ type: 'navigate', url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// The browser renewed the subscription: tell the server about the new one.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const options = event.oldSubscription?.options;
      if (!options) return;
      const subscription = event.newSubscription ?? (await self.registration.pushManager.subscribe(options));
      await fetch(new URL('api/push/subscribe', self.registration.scope), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON(), device: 'Dispositivo (renovado)' }),
      });
    })(),
  );
});
