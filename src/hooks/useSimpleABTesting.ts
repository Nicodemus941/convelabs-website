import { useState, useEffect } from 'react';
import { simpleABTestingService, SimpleABTest } from '@/services/SimpleABTestingService';
import { useConversionOptimization } from '@/contexts/ConversionOptimizationContext';

export const useSimpleABTesting = () => {
  const [variantAssignments, setVariantAssignments] = useState<Record<string, string>>({});
  const { visitorId, hasBookingIntent, selectedService } = useConversionOptimization();

  const getVariantForExperiment = (experimentName: string): string => {
    if (!visitorId) return 'control';

    // Check if already assigned
    if (variantAssignments[experimentName]) {
      return variantAssignments[experimentName];
    }

    // Assign new variant
    const visitorProfile = {
      leadGrade: hasBookingIntent ? 'warm' : 'cold',
      deviceType: window.innerWidth < 768 ? 'mobile' : 'desktop',
      hasBookingIntent,
      selectedService
    };

    const variant = simpleABTestingService.assignVariant(
      visitorId,
      experimentName,
      visitorProfile
    );

    setVariantAssignments(prev => ({
      ...prev,
      [experimentName]: variant
    }));

    return variant;
  };

  const getVariantContent = (experimentName: string): SimpleABTest['content'] | null => {
    const variant = getVariantForExperiment(experimentName);
    return simpleABTestingService.getVariantContent(experimentName, variant);
  };

  const trackConversion = async (experimentName: string, value?: number) => {
    if (!visitorId) return;
    
    const variant = variantAssignments[experimentName] || 'control';
    await simpleABTestingService.trackConversion(visitorId, experimentName, variant, value);
  };

  const trackClick = async (experimentName: string) => {
    if (!visitorId) return;
    
    const variant = variantAssignments[experimentName] || 'control';
    await simpleABTestingService.trackClick(visitorId, experimentName, variant);
  };

  return {
    getVariantContent,
    trackConversion,
    trackClick,
    getVariantForExperiment,
    variantAssignments
  };
};