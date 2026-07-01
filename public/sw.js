// ConveLabs: Service Worker disabled — self-destructing
// This SW unregisters itself and clears all caches on install

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean up silently: drop caches + unregister. Do NOT navigate/reload the
  // clients — the old "force all clients to reload" line combined with
  // main.tsx re-registering this worker every load caused an infinite refresh
  // loop on mobile (register → activate → reload → register → …). main.tsx no
  // longer registers any worker; this handler just tidies up legacy installs.
  event.waitUntil(
    Promise.all([
      caches.keys().then(names => Promise.all(names.map(name => caches.delete(name)))),
      self.registration.unregister(),
    ])
  );
});

// Intentionally NO 'fetch' handler — Chrome warns that a no-op fetch
// handler still adds navigation overhead. Since we self-unregister on
// activate, requests pass directly to the network without us in the loop.
