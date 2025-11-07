console.log('Service worker loaded');

self.addEventListener('push', function(event) {
  console.log('Push received:', event);
  
  if (!event.data) {
    console.log('No data in push event');
    return;
  }

  const data = event.data.json();
  console.log('Push data:', data);
  
  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    },
    requireInteraction: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
      .then(() => console.log('Notification shown'))
      .catch(err => console.error('Notification error:', err))
  );
});

self.addEventListener('notificationclick', function(event) {
  console.log('Notification clicked');
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
