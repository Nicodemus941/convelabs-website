/**
 * WelcomePromoBanner
 *
 * Site-wide top banner promoting WELCOME25 — $25 off the first
 * blood draw for new patients. Strategy:
 *
 *   • Hormozi: announce the offer where the buyer already is.
 *     Banner stays visible across home, pricing, about, book, etc.
 *   • Click-to-copy code so patients don't typo it.
 *   • Dismissible with sessionStorage memory so we don't nag the
 *     same browsing session, but it returns next visit.
 *   • Hidden on internal surfaces (dashboard, admin, staff onboarding)
 *     where it would look out of place.
 *
 * The discount itself is enforced server-side by validate_promo_code
 * (first_time_only flag). This banner is purely awareness + capture.
 */

import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Tag, X, Copy, Check } from 'lucide-react';

const DISMISS_KEY = 'welcome25_banner_dismissed';
const PROMO_CODE = 'WELCOME25';

const HIDDEN_PATH_PREFIXES = [
  '/dashboard',
  '/onboarding',
  '/accept-invite',
  '/auth',
  '/visit/',
  '/reschedule',
  '/corporate-invite',
];

const WelcomePromoBanner: React.FC = () => {
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
    } catch { /* sessionStorage unavailable — show banner */ }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(PROMO_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — user can still hand-type */ }
  };

  if (dismissed) return null;
  if (HIDDEN_PATH_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p))) {
    return null;
  }

  return (
    <div className="relative bg-gradient-to-r from-conve-red via-rose-600 to-conve-red text-white">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
        <Tag className="h-4 w-4 flex-shrink-0 hidden sm:block" />
        <p className="flex-1 leading-snug">
          <span className="font-bold">New patient?</span>{' '}
          <span className="hidden sm:inline">Save </span>
          <span className="font-bold">$25 off</span>
          <span className="hidden sm:inline"> your first blood draw.</span>{' '}
          Code{' '}
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-bold tracking-wider bg-white/20 hover:bg-white/30 active:bg-white/40 transition border border-white/30"
            aria-label={`Copy promo code ${PROMO_CODE}`}
          >
            {PROMO_CODE}
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3 opacity-70" />}
          </button>{' '}
          <Link
            to="/book"
            className="underline font-semibold hover:no-underline whitespace-nowrap"
          >
            Book →
          </Link>
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          className="flex-shrink-0 text-white/80 hover:text-white p-1 -mr-1"
          aria-label="Dismiss banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default WelcomePromoBanner;
