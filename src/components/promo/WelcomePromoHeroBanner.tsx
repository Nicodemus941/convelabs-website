/**
 * WelcomePromoHeroBanner
 *
 * Landing-page hero-strip banner for the WELCOME25 first-time-patient
 * offer. Sits directly under the site Header and above the main Hero.
 *
 * Design:
 *   • Mobile (<640px):  stacked rows — headline + code-pill + CTA full-width
 *   • Tablet (640-1024): two-column — message left, code+CTA right
 *   • Desktop (1024+):   single horizontal line, centered max-width
 *
 * Discount code is server-validated by validate_promo_code (first_time_only
 * + email/phone/name match). This component is purely awareness + capture.
 *
 * Dismissible — sessionStorage so we don't spam the same browsing session.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tag, Copy, Check, X, Sparkles } from 'lucide-react';

const DISMISS_KEY = 'welcome25_hero_dismissed';
const PROMO_CODE = 'WELCOME25';

const WelcomePromoHeroBanner: React.FC = () => {
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
    } catch { /* clipboard blocked — code is still visible */ }
  };

  if (dismissed) return null;

  return (
    <div
      className="relative bg-gradient-to-r from-conve-red via-rose-600 to-rose-700 text-white shadow-md overflow-hidden"
      role="region"
      aria-label="New patient promotion"
    >
      {/* Subtle decorative sparkles — desktop only, won't clutter mobile */}
      <Sparkles className="hidden lg:block absolute top-2 left-8 h-4 w-4 text-white/30" />
      <Sparkles className="hidden lg:block absolute bottom-2 right-32 h-3 w-3 text-white/30" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 pr-8 sm:pr-10">
          {/* Headline + body copy */}
          <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 bg-white/15 rounded-full p-1.5 sm:p-2 mt-0.5 sm:mt-0">
              <Tag className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm sm:text-base leading-tight">
                New patient? Save $25 on your first blood draw.
              </p>
              <p className="text-rose-50 text-[11px] sm:text-xs leading-snug mt-0.5">
                One-time welcome offer · No insurance hassle · Phlebotomist comes to you
              </p>
            </div>
          </div>

          {/* Code pill + CTA — stacked on mobile, side-by-side on tablet/desktop */}
          <div className="flex items-stretch gap-2 sm:gap-2.5 flex-shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-md bg-white/15 hover:bg-white/25 active:bg-white/35 border border-white/40 backdrop-blur-sm transition group"
              aria-label={`Copy promo code ${PROMO_CODE}`}
            >
              <span className="font-mono font-bold tracking-wider text-sm sm:text-base">{PROMO_CODE}</span>
              {copied ? (
                <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-200" />
              ) : (
                <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4 opacity-70 group-hover:opacity-100" />
              )}
            </button>
            <Link
              to="/book"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center px-4 sm:px-5 py-2 rounded-md bg-white text-conve-red font-bold text-sm sm:text-base hover:bg-rose-50 active:bg-rose-100 shadow-sm transition whitespace-nowrap"
            >
              Book & Save
            </Link>
          </div>
        </div>
      </div>

      {/* Dismiss — top-right, larger tap target on mobile */}
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 text-white/70 hover:text-white p-1.5 sm:p-1 rounded hover:bg-white/10"
        aria-label="Dismiss promotion banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default WelcomePromoHeroBanner;
