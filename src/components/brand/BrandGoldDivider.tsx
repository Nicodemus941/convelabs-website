/**
 * The Gold Bar — section divider with a diamond inflection at center.
 * One of the named brand patterns. Use between hero copy and supporting
 * sections, or to punctuate a list-of-three.
 */
import React from 'react';

interface BrandGoldDividerProps {
  className?: string;
  /** "wide" stretches across the parent; default is the narrow card-style bar */
  variant?: 'narrow' | 'wide';
}

const BrandGoldDivider: React.FC<BrandGoldDividerProps> = ({ className = '', variant = 'narrow' }) => {
  const widthClass = variant === 'wide' ? 'max-w-full' : 'max-w-[280px]';
  return <div className={`brand-gold-divider ${widthClass} ${className}`} aria-hidden="true" />;
};

export default BrandGoldDivider;
