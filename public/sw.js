// Service worker: shows the reminders the server sends as push notifications and opens the
// right event when one is tapped. It does not cache anything (the app always loads fresh).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
      icon: 'icon-192.png',
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
