/* eslint-disable no-undef */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: 'Nidaa', body: event.data.text() } };
  }

  const title = payload?.notification?.title || payload?.data?.title || 'Nidaa';
  const body = payload?.notification?.body || payload?.data?.body || 'New notification';
  const data = payload?.data || {};

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: data.callId || data.refId || 'nidaa-notif',
      renotify: true,
      data,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
      return undefined;
    })
  );
});
