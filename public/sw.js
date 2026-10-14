// Service Worker for AMT Task Tracker Background Push Notifications
// Enables system notifications even when the browser tab/window is completely closed (WhatsApp-style).

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'AMT Task Tracker',
    message: 'New taskboard activity.',
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.message = event.data.text();
    }
  }

  const title = data.title || 'Taskboard Alert';
  const tag = data.taskId ? `task-${data.taskId}` : (data.id || 'whiteboard-task-notification');
  const options = {
    body: data.message || data.body || 'You have an update on your board.',
    icon: '/favicon-192x192.png',
    badge: '/favicon-192x192.png',
    tag: tag,
    renotify: false,
    requireInteraction: true, // Keep notification visible until dismissed, exactly like WhatsApp!
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      taskId: data.taskId,
      employeeName: data.employeeName,
    },
    actions: [
      { action: 'open', title: 'Open Board' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open, focus it
      for (const client of windowClients) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
