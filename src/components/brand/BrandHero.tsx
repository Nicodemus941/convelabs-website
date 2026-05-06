/**
 * BrandHero — the canonical hero used on customer-facing landing surfaces.
 *
 * The card-system aesthetic: cream canvas, serif headline with a gold
 * italic accent, three benefit bullets, gold divider, primary CTA.
 *
 * Hormozi addition (per the offer-reinforcement revision):
 *   - Optional `scarcityNode` prop renders the Founding 50 counter or any
 *     real-time scarcity signal directly under the CTA. Aesthetics + offer
 *     amplification in the same component.
 *   - Optional `trustCloser` prop renders a sub-CTA line ("Pays for itself
 *     in 1 visit") to seal the conversion intent.
 *
 * Usage:
 *   <BrandHero
 *     headlineLeading="Lab work,"
 *     headlineAccent="where you are."
 *     subhead="Skip the waiting room. We come to you."
 *     ctaLabel="Book Now → Same-Week Slots"
 *     ctaHref="/book-now"
 *     bullets={[
 *       { icon: '🩸', label: 'Mobile blood draws — your home, office, or hotel' },
 *       { icon: '📋', label: 'Specialty kits & therapeutic phlebotomy' },
 *       { icon: '⚡', label: 'Same-week scheduling, results to your portal' },
 *     ]}
 *     trustCloser="Pays for itself in 1 visit"
 *     scarcityNode={<FoundingSeatsCounter />}
 *   />
 */
import React from 'react';
import { Link } from 'react-router-dom';
import BrandGoldDivider from './BrandGoldDivider';
import BrandItalicAccent from './BrandItalicAccent';

interface BrandHeroProps {
  headlineLeading: string;        // serif, charcoal — "Lab work,"
  headlineAccent: string;         // serif italic gold — "where you are."
  subhead?: string;               // sans, charcoal — short benefit line
  ctaLabel: string;               // primary CTA text
  ctaHref: string;                // primary CTA href (router link)
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
  bullets?: Array<{ icon: React.ReactNode; label: string }>;
  trustCloser?: string;           // sub-CTA reassurance ("Pays for itself in 1 visit")
  scarcityNode?: React.ReactNode; // Founding 50 counter or other live scarcity
  imageRight?: React.ReactNode;   // optional asymmetric right-side visual
  className?: string;
}

const BrandHero: React.FC<BrandHeroProps> = ({
  headlineLeading,
  headlineAccent,
  subhead,
  ctaLabel,
  ctaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
  bullets = [],
  trustCloser,
  scarcityNode,
  imageRight,
  className = '',
}) => {
  return (
    <section
      className={`brand-canvas relative overflow-hidden py-16 md:py-24 ${className}`}
      style={{ backgroundColor: 'var(--brand-cream)' }}
    >
      <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className={imageRight ? 'lg:col-span-7' : 'lg:col-span-12 text-center max-w-3xl mx-auto'}>
          <h1
            className="brand-display font-bold leading-[1.05] text-4xl sm:text-5xl md:text-6xl"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {headlineLeading}{' '}
            <BrandItalicAccent>{headlineAccent}</BrandItalicAccent>
          </h1>

          {subhead && (
            <p className="mt-5 text-lg md:text-xl text-[#3F2A20] font-light max-w-2xl">
              {subhead}
            </p>
          )}

          <BrandGoldDivider className={imageRight ? 'mx-0' : ''} />

          {bullets.length > 0 && (
            <ul className="mt-2 mb-8 space-y-3">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3 text-base text-[#1F1410]">
                  <span className="text-brand-burgundy text-xl shrink-0 mt-0.5">{b.icon}</span>
                  <span>{b.label}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <Link to={ctaHref} className="brand-cta">
              {ctaLabel}
            </Link>
            {secondaryCtaLabel && secondaryCtaHref && (
              <Link
                to={secondaryCtaHref}
                className="text-brand-burgundy underline underline-offset-4 hover:text-brand-burgundy-soft text-sm font-semibold"
              >
                {secondaryCtaLabel}
              </Link>
            )}
          </div>

          {(trustCloser || scarcityNode) && (
            <div className="mt-5 space-y-3">
              {trustCloser && (
                <p className="text-sm text-brand-burgundy font-semibold tracking-wide">
                  ✓ {trustCloser}
                </p>
              )}
              {scarcityNode && <div>{scarcityNode}</div>}
            </div>
          )}
        </div>

        {imageRight && (
          <div className="lg:col-span-5">
            {imageRight}
          </div>
        )}
      </div>
    </section>
  );
};

export default BrandHero;
