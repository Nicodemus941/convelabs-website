import React from 'react';
import { useSimpleABTesting } from '@/hooks/useSimpleABTesting';

interface SmartHeadlineProps {
  experimentName: string;
  fallbackHeadline?: string;
  fallbackSubheadline?: string;
  className?: string;
  headlineClass?: string;
  subheadlineClass?: string;
}

export const SmartHeadline: React.FC<SmartHeadlineProps> = ({
  experimentName,
  fallbackHeadline = 'Professional Lab Services at Your Location',
  fallbackSubheadline = 'Convenient, accurate, and trusted by thousands of professionals',
  className = '',
  headlineClass = 'text-4xl md:text-6xl font-bold',
  subheadlineClass = 'text-xl text-muted-foreground'
}) => {
  const { getVariantContent, trackClick } = useSimpleABTesting();

  const variantContent = getVariantContent(experimentName);
  
  // Use variant content or fallback
  const headline = variantContent?.headline || fallbackHeadline;
  const subheadline = variantContent?.subheadline || fallbackSubheadline;

  const handleHeadlineClick = () => {
    // Track engagement with headline
    trackClick(experimentName);
  };

  return (
    <div className={`space-y-4 ${className}`} onClick={handleHeadlineClick}>
      <h1 className={headlineClass}>
        {headline}
      </h1>
      <p className={subheadlineClass}>
        {subheadline}
      </p>
    </div>
  );
};