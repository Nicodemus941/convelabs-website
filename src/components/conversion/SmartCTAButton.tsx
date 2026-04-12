import React from 'react';
import { Button } from '@/components/ui/button';
import { useSimpleABTesting } from '@/hooks/useSimpleABTesting';
import { useConversionOptimization } from '@/contexts/ConversionOptimizationContext';
import { useBookingModalSafe } from '@/contexts/BookingModalContext';
import { BOOKING_URL, withSource } from '@/lib/constants/urls';


interface SmartCTAButtonProps {
  experimentName: string;
  fallbackText?: string;
  fallbackColor?: string;
  onClickCallback?: () => void;
  className?: string;
  size?: 'sm' | 'default' | 'lg';
}

export const SmartCTAButton: React.FC<SmartCTAButtonProps> = ({
  experimentName,
  fallbackText = 'Book Now',
  fallbackColor = 'primary',
  onClickCallback,
  className = '',
  size = 'default'
}) => {
  const { getVariantContent, trackClick } = useSimpleABTesting();
  const { trackBookingIntent } = useConversionOptimization();
  const bookingModal = useBookingModalSafe();

  const variantContent = getVariantContent(experimentName);
  
  // Use variant content or fallback
  const ctaText = variantContent?.ctaText || fallbackText;
  const ctaColor = variantContent?.ctaColor || fallbackColor;
  const urgencyMessage = variantContent?.urgencyMessage;

  const handleClick = async () => {
    // Track A/B test click
    await trackClick(experimentName);
    
    // Track booking intent
    trackBookingIntent('cta_button');

    // If a custom callback is provided, let it handle logic
    if (onClickCallback) {
      onClickCallback();
      return;
    }

    // Default behavior: open booking modal or fallback to redirect
    if (bookingModal) {
      bookingModal.openModal('cta_button');
    } else {
      window.location.href = withSource(BOOKING_URL, 'cta_button');
    }
  };

  return (
    <>
      <div className="space-y-2">
        <Button
          onClick={handleClick}
          className={`
            ${className}
            ${ctaColor === 'red' ? 'bg-red-600 hover:bg-red-700' : ''}
            ${ctaColor === 'green' ? 'bg-green-600 hover:bg-green-700' : ''}
            ${ctaColor === 'blue' ? 'bg-blue-600 hover:bg-blue-700' : ''}
            ${ctaColor === 'orange' ? 'bg-orange-600 hover:bg-orange-700' : ''}
          `}
          size={size}
        >
          {ctaText}
        </Button>
        
        {urgencyMessage && (
          <p className="text-sm text-red-600 font-medium text-center">
            {urgencyMessage}
          </p>
        )}
      </div>
    </>
  );
};
