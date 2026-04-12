import React from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConversionOptimization } from '@/contexts/ConversionOptimizationContext';
import { useBookingModalSafe } from '@/contexts/BookingModalContext';
import { GHS_BOOKING_PAGE } from '@/lib/constants/urls';

interface EnhancedBookNowButtonProps extends Omit<ButtonProps, 'variant'> {
  source: string; // Track where the button was clicked from
  variant?: ButtonProps['variant'] | 'sticky';
  urgencyMessage?: string;
  customText?: string;
  showAvailability?: boolean;
}

export const EnhancedBookNowButton: React.FC<EnhancedBookNowButtonProps> = ({
  source,
  variant = 'default',
  urgencyMessage,
  customText,
  showAvailability = false,
  className,
  children,
  ...props
}) => {
  
  // Safe context usage with fallback
  const conversionContext = (() => {
    try {
      return useConversionOptimization();
    } catch (error) {
      return {
        trackBookingIntent: () => {},
        abTestVariant: 'control',
        selectedService: null,
        preferredLocation: null
      };
    }
  })();
  
  const { 
    trackBookingIntent, 
    abTestVariant, 
    selectedService, 
    preferredLocation 
  } = conversionContext;
  
  
  const isSticky = variant === 'sticky';
  const buttonVariant = isSticky ? 'default' : variant as ButtonProps['variant'];
  
  // A/B test button text
  const getButtonText = () => {
    if (customText) return customText;
    
    if (abTestVariant === 'control') {
      return 'Book Now';
    } else {
      // Test different CTAs
      const variations = [
        'Check Availability',
        'Reserve Your Spot',
        'Schedule Today',
        'Book VIP Appointment'
      ];
      return variations[Math.floor(Math.random() * variations.length)];
    }
  };
  
  const bookingModal = useBookingModalSafe();

  const handleClick = () => {
    console.log('Book Now clicked, source:', source);
    
    // Track the click
    trackBookingIntent(source);
    
    // Track final conversion attempt
    if (typeof window.gtag !== 'undefined') {
      window.gtag('event', 'click', {
        event_category: 'booking',
        event_label: source,
        value: 50
      });
    }
    
    const url = source
      ? `${GHS_BOOKING_PAGE}?source=${encodeURIComponent(source)}`
      : GHS_BOOKING_PAGE;
    window.location.href = url;
  };
  
  return (
    <div className="relative">
      <Button
        type="button"
        className={cn(
          'font-semibold relative overflow-hidden',
          isSticky && 'fixed bottom-4 right-4 z-50 shadow-lg md:hidden animate-pulse',
          className
        )}
        variant={buttonVariant}
        onClick={handleClick}
        {...props}
      >
        <span className="flex items-center gap-2">
          {getButtonText()}
          <ArrowRight className="h-4 w-4" />
        </span>
      </Button>
      
      {urgencyMessage && (
        <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full animate-bounce">
          {urgencyMessage}
        </div>
      )}
      
      {showAvailability && (
        <div className="absolute -bottom-6 left-0 right-0 text-center text-xs text-muted-foreground">
          ⏰ Next slot: 2:00 PM today
        </div>
      )}
    </div>
  );
};
