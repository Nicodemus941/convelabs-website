import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * NATIVE BOOT SPLASH — a branded launch animation: the "ConveLabs" wordmark
 * flies up into place, holds, then scales out to hand off to the app.
 *
 * Robustness rules (learned the hard way — a prior version left the app blank
 * on some devices):
 *  - Dismissal is driven by JS timers + React unmount, NOT by a CSS animation,
 *    so the splash ALWAYS goes away on time even if keyframes don't run.
 *  - The fade-out is a plain CSS *transition* (opacity), which WebViews run far
 *    more reliably than @keyframes.
 *  - The wordmark's keyframe animation is purely decorative and reduced-motion-
 *    gated; if it doesn't run the wordmark simply shows statically (visible).
 *  - Native-only (Capacitor). Renders nothing on web, so the public site and
 *    patient app are untouched.
 */
export function NativeBootSplash() {
  const [phase, setPhase] = useState<'in' | 'out' | 'done'>(() => {
    try {
      return Capacitor.isNativePlatform() ? 'in' : 'done';
    } catch {
      return 'done';
    }
  });

  useEffect(() => {
    if (phase === 'done') return;
    const tOut = setTimeout(() => setPhase('out'), 1400); // begin fade
    const tDone = setTimeout(() => setPhase('done'), 1750); // unmount after fade
    return () => {
      clearTimeout(tOut);
      clearTimeout(tDone);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'done') return null;

  return (
    <div
      className={
        'fixed inset-0 z-[9999] flex items-center justify-center bg-conve-red pointer-events-none ' +
        'transition-opacity duration-300 ease-out ' +
        (phase === 'out' ? 'opacity-0' : 'opacity-100')
      }
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
