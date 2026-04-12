import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Phone, ArrowRight } from 'lucide-react';
import { useConversionOptimization } from '@/contexts/ConversionOptimizationContext';
import { EnhancedBookNowButton } from './EnhancedBookNowButton';

export const MobileStickyButton: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const { trackBookingIntent } = useConversionOptimization();
  
  useEffect(() => {
    const checkScroll = () => {
      // Show sticky button after scrolling 200px on mobile
      if (window.innerWidth <= 768 && window.scrollY > 200) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };
    
    window.addEventListener('scroll', checkScroll);
    window.addEventListener('resize', checkScroll);
    
    return () => {
      window.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, []);
  
  if (!isVisible) return null;
  
  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:hidden">
      <Card className="p-3 shadow-2xl border-primary bg-gradient-to-r from-primary to-primary/90 text-primary-foreground">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Ready to Book?</p>
            <p className="text-xs opacity-90">Same-day appointments available</p>
          </div>
          
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="bg-white/20 text-white border-white/30 hover:bg-white/30"
              onClick={() => {
                trackBookingIntent('mobile_phone_call');
                window.location.href = 'tel:+19415279169';
              }}
            >
              <Phone className="h-4 w-4" />
            </Button>
            
            <EnhancedBookNowButton
              source="mobile_sticky"
              size="sm"
              className="bg-white text-primary hover:bg-white/90 font-semibold px-4"
              customText="Book"
            />
          </div>
        </div>
      </Card>
    </div>
  );
};

export const MobileCallButton: React.FC = () => {
  const { trackBookingIntent } = useConversionOptimization();
  
  const handleCall = () => {
    trackBookingIntent('mobile_call_direct');
    
    // Track call event
    if (typeof window.gtag !== 'undefined') {
      window.gtag('event', 'phone_call', {
        event_category: 'conversion',
        event_label: 'mobile_direct'
      });
    }
    
    window.location.href = 'tel:+19415279169';
  };
  
  return (
    <Button
      onClick={handleCall}
      variant="outline"
      size="lg"
      className="w-full bg-green-50 border-green-200 text-green-700 hover:bg-green-100 md:hidden"
    >
      <Phone className="h-5 w-5 mr-2" />
      Call Now: (941) 527-9169
    </Button>
  );
};

export const MobileOptimizedForm: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  if (!isMobile) {
    return <>{children}</>;
  }
  
  // Enhanced mobile form wrapper
  return (
    <div className="space-y-4">
      {/* Mobile-optimized header */}
      <div className="text-center p-4 bg-primary/5 rounded-lg">
        <h3 className="font-semibold">Quick Mobile Booking</h3>
        <p className="text-sm text-muted-foreground">Tap to complete in 60 seconds</p>
      </div>
      
      {/* Form with mobile optimizations */}
      <div className="space-y-3">
        {children}
      </div>
      
      {/* Mobile call alternative */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground mb-2">Prefer to speak with someone?</p>
        <MobileCallButton />
      </div>
    </div>
  );
};