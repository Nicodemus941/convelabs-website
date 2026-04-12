import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { X, Clock, Gift } from 'lucide-react';
import { useConversionOptimization } from '@/contexts/ConversionOptimizationContext';
import { EnhancedBookNowButton } from './EnhancedBookNowButton';

export const ReturnVisitorBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [hasBeenDismissed, setHasBeenDismissed] = useState(false);
  const { 
    hasBookingIntent, 
    isReturnVisitor, 
    selectedService,
    abTestVariant 
  } = useConversionOptimization();
  
  useEffect(() => {
    // Check if banner has been dismissed in this session
    const dismissed = sessionStorage.getItem('return_visitor_banner_dismissed');
    if (dismissed) {
      setHasBeenDismissed(true);
      return;
    }
    
    // Show banner if user has booking intent or is a return visitor
    if ((hasBookingIntent || isReturnVisitor) && !hasBeenDismissed) {
      // Delay showing banner slightly for better UX
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [hasBookingIntent, isReturnVisitor, hasBeenDismissed]);
  
  const handleDismiss = () => {
    setIsVisible(false);
    setHasBeenDismissed(true);
    sessionStorage.setItem('return_visitor_banner_dismissed', 'true');
  };
  
  // A/B test different messages
  const getMessage = () => {
    if (abTestVariant === 'control') {
      return {
        title: 'Welcome Back!',
        description: 'Your appointment slot is still available. Complete your booking now.',
        cta: 'Complete Booking',
        discount: null
      };
    } else {
      return {
        title: 'Special Offer for You!',
        description: 'Save 10% on your first visit when you book today.',
        cta: 'Book with 10% Off',
        discount: '10% OFF'
      };
    }
  };
  
  if (!isVisible || hasBeenDismissed) {
    return null;
  }
  
  const message = getMessage();
  
  return (
    <div className="fixed top-0 left-0 right-0 z-50 animate-in slide-in-from-top duration-500">
      <Alert className="rounded-none border-l-4 border-l-primary bg-primary/5 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {message.discount ? (
              <Gift className="h-5 w-5 text-primary" />
            ) : (
              <Clock className="h-5 w-5 text-primary" />
            )}
            
            <AlertDescription className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div>
                  <span className="font-semibold">{message.title}</span>{' '}
                  {message.description}
                  {selectedService && (
                    <span className="text-sm text-muted-foreground ml-2">
                      ({selectedService} service selected)
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-2 sm:ml-auto">
                  {message.discount && (
                    <span className="bg-primary text-primary-foreground px-2 py-1 rounded text-xs font-bold">
                      {message.discount}
                    </span>
                  )}
                  
                  <EnhancedBookNowButton
                    source="return_visitor_banner"
                    size="sm"
                    customText={message.cta}
                    className="whitespace-nowrap"
                  />
                </div>
              </div>
            </AlertDescription>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-auto p-1 hover:bg-primary/10"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </Alert>
    </div>
  );
};