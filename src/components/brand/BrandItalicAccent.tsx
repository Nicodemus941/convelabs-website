/**
 * The YOUR Italic — gold serif italic emphasis inside a serif headline.
 *
 * Usage:
 *   <h1 className="brand-display text-4xl">
 *     Lab work, <BrandItalicAccent>where you are.</BrandItalicAccent>
 *   </h1>
 *
 *   Or for the "Labs At YOUR Convenience" lockup:
 *   Labs At <BrandItalicAccent underline>YOUR</BrandItalicAccent> Convenience<sup>®</sup>
 */
import React from 'react';

interface BrandItalicAccentProps {
  children: React.ReactNode;
  /** Adds the underlined-Y style used in the lockup */
  underline?: boolean;
  className?: string;
}

const BrandItalicAccent: React.FC<BrandItalicAccentProps> = ({ children, underline, className = '' }) => {
  return (
    <span
      className={`brand-italic-accent ${underline ? 'underline decoration-[1.5px] underline-offset-4' : ''} ${className}`}
    >
      {children}
    </span>
  );
};

export default BrandItalicAccent;
