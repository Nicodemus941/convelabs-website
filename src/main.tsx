
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppRoutes from './AppRoutes.tsx';
import { initPostHog } from './lib/posthog';
import './index.css';

// Initialize PostHog as early as possible so page-view events fire on first
// render. No-op if VITE_POSTHOG_KEY isn't set (dev builds without the key).
initPostHog();

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <AppRoutes />
  </QueryClientProvider>
);

// Register service worker for PWA — with self-heal fallback when the SW
// gets stuck in an "invalid state" (seen in admin-portal screenshots
// 2026-04-25). When that happens, a stale bundle keeps serving users
// the old code and click handlers break silently. We unregister + reload
// once to recover, gated by sessionStorage so we don't loop.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      // Force an update check on every load
      try {
        await registration.update();
      } catch (updateErr: any) {
        const msg = String(updateErr?.message || '');
        if (/invalid state|InvalidStateError/i.test(msg) && !sessionStorage.getItem('sw_self_healed')) {
          console.warn('[sw] invalid-state detected, self-healing once…');
          sessionStorage.setItem('sw_self_healed', '1');
          await registration.unregister();
          window.location.reload();
          return;
        }
        console.log('SW update failed:', msg);
      }
      // New SW installed behind the current one → activate it asap
      registration.addEventListener('updatefound', () => {
        const next = registration.installing;
        if (next) {
          next.addEventListener('statechange', () => {
            if (next.state === 'installed' && navigator.serviceWorker.controller) {
              // A new version is ready; tell it to take over on next load.
              next.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        }
      });
    } catch (err) {
      console.log('SW registration failed:', err);
    }
  });
}
