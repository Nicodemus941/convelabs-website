
import { useEffect } from 'react';

declare global {
  interface Window {
    fbq: any;
  }
}

const MetaPixel = () => {
  useEffect(() => {
    // Check if fbq is already loaded to avoid duplicate initialization
    if (window.fbq) {
      window.fbq('track', 'PageView');
      return;
    }

    // Load Meta Pixel if not already loaded
    const script = document.createElement('script');
    script.innerHTML = `
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', '23978246401837515');
      fbq('track', 'PageView');
    `;
    document.head.appendChild(script);

    // Add noscript fallback
    const noscript = document.createElement('noscript');
    const img = document.createElement('img');
    img.height = 1;
    img.width = 1;
    img.style.display = 'none';
    img.src = 'https://www.facebook.com/tr?id=23978246401837515&ev=PageView&noscript=1';
    noscript.appendChild(img);
    document.head.appendChild(noscript);

  }, []);

  return null;
};

export default MetaPixel;
