// ConveLabs: Service Worker disabled — self-destructing
// This SW unregisters itself and clears all caches on install

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Delete all caches
      caches.keys().then(names => Promise.all(names.map(name => caches.delete(name)))),
      // Unregister self
      self.registration.unregister(),
    ]).then(() => {
      // Force all clients to reload
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.navigate(client.url));
      });
    })
  );
});

// Intentionally NO 'fetch' handler — Chrome warns that a no-op fetch
// handler still adds navigation overhead. Since we self-unregister on
// activate, requests pass directly to the network without us in the loop.
