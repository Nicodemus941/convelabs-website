
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

// Register service worker for PWA — force update check on every load
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      // Force the SW to check for updates immediately
      registration.update();
    }).catch((err) => {
      console.log('SW registration failed:', err);
    });
  });
}
