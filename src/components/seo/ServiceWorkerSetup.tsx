import React from 'react';
import { Helmet } from 'react-helmet-async';

export const ServiceWorkerSetup: React.FC = () => {
  React.useEffect(() => {
    if ('serviceWorker' in navigator) {
      // Force update: unregister old workers, register fresh
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const reg of registrations) {
          reg.update(); // Force check for new SW
          if (reg.waiting) {
            reg.waiting.postMessage('SKIP_WAITING');
          }
        }
      });
      navigator.serviceWorker.register('/sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') {
                // New SW activated — reload to get fresh assets
                console.log('New service worker activated, reloading...');
              }
            });
          }
        });
      }).catch(console.error);
    }
  }, []);

  return (
    <Helmet>
      {/* Progressive Web App Meta */}
      <meta name="application-name" content="ConveLabs Mobile Lab" />
      <meta name="apple-mobile-web-app-title" content="ConveLabs" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-touch-fullscreen" content="yes" />
    </Helmet>
  );
};
