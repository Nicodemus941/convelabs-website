import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { analytics } from '@/utils/analytics';

// Global declarations for tracking
declare global {
  interface Window {
    gtag: any;
    fbq: any;
  }
}

interface ConversionOptimizationContextType {
  // Visitor state
  visitorId: string;
  sessionId: string;
  hasBookingIntent: boolean;
  isReturnVisitor: boolean;
  selectedService: string | null;
  preferredLocation: string | null;
  
  // Conversion tracking
  trackServiceInterest: (service: string) => void;
  trackBookingIntent: (source: string) => void;
  trackBookingAbandonment: () => void;
  setServiceSelection: (service: string) => void;
  setLocationPreference: (location: string) => void;
  
  // A/B testing
  abTestVariant: string;
  
  // Social proof
  showSocialProof: boolean;
  socialProofData: SocialProofItem[];
}

interface SocialProofItem {
  type: 'booking' | 'availability' | 'testimonial' | 'urgency';
  message: string;
  timestamp?: string;
  urgent?: boolean;
}

const ConversionOptimizationContext = createContext<ConversionOptimizationContextType | undefined>(undefined);

export const useConversionOptimization = () => {
  const context = useContext(ConversionOptimizationContext);
  if (!context) {
    throw new Error('useConversionOptimization must be used within ConversionOptimizationProvider');
  }
  return context;
};

interface ConversionOptimizationProviderProps {
  children: ReactNode;
}

export const ConversionOptimizationProvider: React.FC<ConversionOptimizationProviderProps> = ({ children }) => {
  const location = useLocation();
  
  // Core state
  const [visitorId] = useState(() => {
    let id = localStorage.getItem('convelabs_visitor_id');
    if (!id) {
      id = 'visitor_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('convelabs_visitor_id', id);
    }
    return id;
  });
  
  const [sessionId] = useState(() => {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  });
  
  const [userId, setUserId] = useState<string | null>(null);
  const [hasBookingIntent, setHasBookingIntent] = useState(false);
  const [isReturnVisitor, setIsReturnVisitor] = useState(false);
  const [selectedService, setSelectedServiceState] = useState<string | null>(null);
  const [preferredLocation, setPreferredLocationState] = useState<string | null>(null);
  
  // A/B testing variant
  const [abTestVariant] = useState(() => {
    const savedVariant = localStorage.getItem('convelabs_ab_variant');
    if (savedVariant) return savedVariant;
    
    const variant = Math.random() < 0.5 ? 'control' : 'variant';
    localStorage.setItem('convelabs_ab_variant', variant);
    return variant;
  });
  
  // Social proof data
  const [socialProofData] = useState<SocialProofItem[]>([
    {
      type: 'booking',
      message: 'Sarah from Windermere just booked Executive Panel',
      timestamp: '2 minutes ago'
    },
    {
      type: 'availability',
      message: 'Next available slot: Today at 2:00 PM',
      urgent: true
    },
    {
      type: 'booking',
      message: '12 appointments booked in Winter Park this week'
    },
    {
      type: 'testimonial',
      message: '"Best healthcare experience!" - Michael, CEO'
    },
    {
      type: 'urgency',
      message: '🔥 Only 3 VIP slots remaining today',
      urgent: true
    }
  ]);
  
  // Check for return visitor on mount
  useEffect(() => {
    const lastVisit = localStorage.getItem('convelabs_last_visit');
    const bookingIntentTime = sessionStorage.getItem('booking_intent_time');
    
    if (lastVisit) {
      setIsReturnVisitor(true);
    }
    
    if (bookingIntentTime) {
      const timeSinceIntent = Date.now() - parseInt(bookingIntentTime);
      if (timeSinceIntent < 24 * 60 * 60 * 1000) { // 24 hours
        setHasBookingIntent(true);
      }
    }
    
    localStorage.setItem('convelabs_last_visit', Date.now().toString());
  }, []);
  
  // Track page views with analytics
  useEffect(() => {
    analytics.trackPageView();
    
    // Track funnel stages based on routes
    switch (location.pathname) {
      case '/':
        analytics.trackHomepageView();
        break;
      case '/services':
        analytics.trackServicesView();
        break;
      case '/pricing':
        analytics.trackPricingView();
        break;
    }
  }, [location.pathname]);
  
  // Set user ID when available
  useEffect(() => {
    if (userId) {
      analytics.setUserId(userId);
    }
  }, [userId]);
  
  const trackServiceInterest = (service: string) => {
    analytics.trackServiceSelection(service);
    
    // Track with Google Analytics if available
    if (typeof window.gtag !== 'undefined') {
      window.gtag('event', 'view_item', {
        currency: 'USD',
        value: getServiceValue(service),
        items: [{
          item_name: service,
          item_category: 'Lab Services',
          price: getServiceValue(service)
        }]
      });
    }
    
    if (typeof window.fbq !== 'undefined') {
      window.fbq('track', 'ViewContent', {
        content_type: 'service',
        content_name: service,
        value: getServiceValue(service),
        currency: 'USD'
      });
    }
  };
  
  const trackBookingIntent = (source: string) => {
    analytics.trackBookingIntent(source, selectedService || undefined);
    
    // Track conversion events
    if (typeof window.gtag !== 'undefined') {
      window.gtag('event', 'begin_checkout', {
        currency: 'USD',
        value: 500,
        items: [{
          item_name: selectedService || 'Mobile Lab Service',
          item_category: 'Healthcare',
          quantity: 1
        }]
      });
    }
    
    if (typeof window.fbq !== 'undefined') {
      window.fbq('track', 'InitiateCheckout', {
        value: 500,
        currency: 'USD',
        content_category: 'Healthcare Services'
      });
    }
  };
  
  const trackBookingAbandonment = () => {
    // This is now handled automatically by the analytics system
    console.log('Booking abandonment tracked');
  };
  
  const setServiceSelection = (service: string) => {
    setSelectedServiceState(service);
    sessionStorage.setItem('selected_service', service);
    analytics.trackPreQualificationStart();
    trackServiceInterest(service);
  };
  
  const setLocationPreference = (location: string) => {
    setPreferredLocationState(location);
    sessionStorage.setItem('preferred_location', location);
  };
  
  const contextValue: ConversionOptimizationContextType = {
    visitorId,
    sessionId,
    hasBookingIntent,
    isReturnVisitor,
    selectedService,
    preferredLocation,
    trackServiceInterest,
    trackBookingIntent,
    trackBookingAbandonment,
    setServiceSelection,
    setLocationPreference,
    abTestVariant,
    showSocialProof: true,
    socialProofData
  };
  
  return (
    <ConversionOptimizationContext.Provider value={contextValue}>
      {children}
    </ConversionOptimizationContext.Provider>
  );
};

// Helper function to get service values
function getServiceValue(service: string | null): number {
  const serviceValues: { [key: string]: number } = {
    'basic': 149,
    'executive': 500,
    'platinum': 750
  };
  return serviceValues[service || 'executive'] || 500;
}