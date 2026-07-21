import { useEffect, useRef } from 'react';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const SCRIPT_ID = 'cf-turnstile-script';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, o: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

function loadScript(): Promise<void> {
  return new Promise((resolve) => {
    if (window.turnstile) return resolve();
    if (document.getElementById(SCRIPT_ID)) {
      const t = setInterval(() => { if (window.turnstile) { clearInterval(t); resolve(); } }, 100);
      setTimeout(() => { clearInterval(t); resolve(); }, 8000);
      return;
    }
    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

export function Turnstile({ siteKey, onToken, onError, className }: {
  siteKey: string;
  onToken: (t: string | null) => void;
  onError?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !ref.current) return;
      if (!window.turnstile) { onError?.(); return; }
      try {
        id.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          'refresh-expired': 'auto',
          callback: (t: string) => onToken(t),
          'expired-callback': () => onToken(null),
          'error-callback': () => { onToken(null); onError?.(); },
        });
      } catch { onError?.(); }
    });
    return () => {
      cancelled = true;
      try { if (id.current && window.turnstile) window.turnstile.remove(id.current); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);
  return <div ref={ref} className={className} />;
}
