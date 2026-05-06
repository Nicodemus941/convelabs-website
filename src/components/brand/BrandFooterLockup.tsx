/**
 * The Lockup — "Labs At YOUR Convenience®" footer signature.
 *
 * Drop this into the global footer. It's the brand signature that ends
 * every customer-facing page (and every email). Hormozi: every glance
 * a free brand impression.
 */
import React from 'react';
import BrandItalicAccent from './BrandItalicAccent';

interface BrandFooterLockupProps {
  /** Inverted (cream-on-burgundy) for use in dark footer; default is burgundy-on-cream */
  inverted?: boolean;
  className?: string;
}

const BrandFooterLockup: React.FC<BrandFooterLockupProps> = ({ inverted, className = '' }) => {
  const colorClass = inverted ? 'text-brand-cream' : 'text-brand-burgundy';
  return (
    <div className={`text-center ${className}`}>
      <p
        className={`${colorClass} text-xs tracking-[0.18em] uppercase font-display`}
        style={{ fontFamily: "'Playfair Display', serif" }}
      >
        Labs At <BrandItalicAccent underline>YOUR</BrandItalicAccent>{' '}
        Convenience<sup className="text-[0.5em] align-super">®</sup>
      </p>
    </div>
  );
};

export default BrandFooterLockup;
