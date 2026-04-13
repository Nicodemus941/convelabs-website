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

// Don't intercept any requests — pass everything through to network
self.addEventListener('fetch', () => {});
