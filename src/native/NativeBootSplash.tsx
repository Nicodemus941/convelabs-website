import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * NATIVE BOOT SPLASH — a branded loading animation shown once when the app
 * launches: the "ConveLabs" wordmark flies up into place, holds for a beat,
 * then scales out and fades (an "explode" hand-off) to reveal the app.
 *
 * Native-only (Capacitor). Renders nothing on the website build, so the public
 * site at convelabs.com is untouched. It sits above everything during the ~2s
 * animation and is pointer-events-none so it never blocks the first tap.
 */
export function NativeBootSplash() {
  const [show, setShow] = useState<boolean>(() => {
    try {
      return Capacitor.isNativePlatform();
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(false), 2000);
    return () => clearTimeout(t);
  }, [show]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-conve-red animate-conve-splash-fade pointer-events-none"
      aria-hidden="true"
    >
      <div className="animate-conve-flyin select-none">
        <span className="text-white text-4xl font-black tracking-tight">ConveLabs</span>
        <span className="text-4xl font-black" style={{ color: 'var(--conve-gold)' }}>.</span>
      </div>
    </div>
  );
}

export default NativeBootSplash;
