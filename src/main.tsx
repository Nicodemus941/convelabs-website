
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

// The public site is ONLINE-ONLY and must NEVER register a service worker.
//
// INCIDENT 2026-07-01 — infinite refresh loop on mobile: this file used to
// `navigator.serviceWorker.register('/sw.js')` on every load, but /sw.js is a
// self-destructing worker that, on activate, unregisters itself AND force-
// reloads every client. Because it unregisters itself, the NEXT load's
// register() always installed a fresh copy → activate → reload → register →
// … an endless loop ("the page keeps refreshing"). The old sw.js has no fetch
// handler, so it never even served cached content — its only effect was the
// reload loop.
//
// Fix: register nothing. Just UNREGISTER any lingering worker from older
// builds and drop its caches — no reload, no re-registration.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister().catch(() => {})))
    .catch(() => {});
  if ('caches' in window) {
    caches.keys().then((names) => names.forEach((n) => caches.delete(n))).catch(() => {});
  }
}
