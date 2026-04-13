import React from 'react';
import { Helmet } from 'react-helmet-async';

export const ServiceWorkerSetup: React.FC = () => {
  React.useEffect(() => {
    if ('serviceWorker' in navigator) {
      // AGGRESSIVE: Unregister ALL old service workers first, then register fresh
      navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        for (const reg of registrations) {
          // Force skip waiting on any waiting worker
          if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
          // Unregister old workers completely
          await reg.unregister();
          console.log('Unregistered old service worker');
        }
        // Now register the fresh one
        const newReg = await navigator.serviceWorker.register('/sw.js');
        console.log('Registered fresh service worker v8');
        newReg.addEventListener('updatefound', () => {
          const newWorker = newReg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') {
                console.log('New service worker activated');
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
