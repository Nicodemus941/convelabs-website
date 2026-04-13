import React from 'react';
import { Helmet } from 'react-helmet-async';

export const ServiceWorkerSetup: React.FC = () => {
  React.useEffect(() => {
    // Kill all service workers — ConveLabs doesn't need offline support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.unregister());
      });
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
