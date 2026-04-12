import React, { useEffect } from 'react';
import { useConversionOptimization } from '@/contexts/ConversionOptimizationContext';

interface ConversionAnalyticsProps {
  children: React.ReactNode;
}

export const ConversionAnalytics: React.FC<ConversionAnalyticsProps> = ({ children }) => {
  const { visitorId, sessionId, abTestVariant } = useConversionOptimization();
  
  useEffect(() => {
    // Enhanced Google Analytics setup
    if (typeof window.gtag !== 'undefined') {
      // Set custom dimensions for conversion optimization
      window.gtag('config', 'GA_MEASUREMENT_ID', {
        custom_map: {
          'custom_parameter_1': 'visitor_id',
          'custom_parameter_2': 'session_id',
          'custom_parameter_3': 'ab_variant'
        }
      });
      
      // Set user properties
      window.gtag('set', {
        visitor_id: visitorId,
        session_id: sessionId,
        ab_variant: abTestVariant,
        conversion_optimized: true
      });
    }
    
    // Enhanced Facebook Pixel setup
    if (typeof window.fbq !== 'undefined') {
      // Custom audience parameters
      window.fbq('set', 'userData', {
        external_id: visitorId,
        ab_variant: abTestVariant
      });
      
      // Track high-value visitor behavior
      const trackHighValueBehavior = () => {
        const events = JSON.parse(sessionStorage.getItem('convelabs_events') || '[]');
        const pageViews = JSON.parse(sessionStorage.getItem('convelabs_page_views') || '[]');
        
        // High-value indicators
        const timeOnSite = Date.now() - (pageViews[0]?.timestamp ? new Date(pageViews[0].timestamp).getTime() : Date.now());
        const hasServiceInterest = events.some((e: any) => e.type === 'service_interest');
        const multiplePages = pageViews.length > 2;
        
        if (timeOnSite > 180000 || (hasServiceInterest && multiplePages)) {
          window.fbq('trackCustom', 'HighValueVisitor', {
            time_on_site: Math.floor(timeOnSite / 1000),
            pages_viewed: pageViews.length,
            has_service_interest: hasServiceInterest,
            visitor_type: 'executive_prospect'
          });
        }
      };
      
      // Track after 3 minutes
      setTimeout(trackHighValueBehavior, 180000);
    }
    
    // Track exit intent globally
    const handleBeforeUnload = () => {
      const events = JSON.parse(sessionStorage.getItem('convelabs_events') || '[]');
      const hasBookingIntent = events.some((e: any) => e.type === 'booking_intent');
      
      if (hasBookingIntent) {
        // Track abandonment
        if (typeof window.gtag !== 'undefined') {
          window.gtag('event', 'booking_abandonment', {
            event_category: 'conversion',
            event_label: 'page_exit',
            visitor_id: visitorId
          });
        }
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [visitorId, sessionId, abTestVariant]);
  
  // Track scroll depth for engagement
  useEffect(() => {
    let maxScrollDepth = 0;
    
    const trackScrollDepth = () => {
      const scrollTop = window.pageYOffset;
      const docHeight = document.body.scrollHeight - window.innerHeight;
      const scrollPercent = Math.round((scrollTop / docHeight) * 100);
      
      if (scrollPercent > maxScrollDepth) {
        maxScrollDepth = scrollPercent;
        
        // Track milestone depths
        if ([25, 50, 75, 90].includes(scrollPercent)) {
          if (typeof window.gtag !== 'undefined') {
            window.gtag('event', 'scroll_depth', {
              event_category: 'engagement',
              event_label: `${scrollPercent}%`,
              value: scrollPercent
            });
          }
        }
      }
    };
    
    window.addEventListener('scroll', trackScrollDepth, { passive: true });
    return () => window.removeEventListener('scroll', trackScrollDepth);
  }, []);
  
  return <>{children}</>;
};

// Hook for manual conversion tracking
export const useConversionTracking = () => {
  const { trackBookingIntent, trackServiceInterest } = useConversionOptimization();
  
  const trackConversion = (eventName: string, value?: number, additionalData?: any) => {
    // Google Analytics
    if (typeof window.gtag !== 'undefined') {
      window.gtag('event', 'conversion', {
        send_to: 'AW-CONVERSION_ID/' + eventName,
        value: value || 0,
        currency: 'USD',
        ...additionalData
      });
    }
    
    // Facebook Pixel
    if (typeof window.fbq !== 'undefined') {
      window.fbq('track', 'Purchase', {
        value: value || 0,
        currency: 'USD',
        content_name: eventName,
        ...additionalData
      });
    }
  };
  
  const trackLead = (source: string, leadData?: any) => {
    if (typeof window.gtag !== 'undefined') {
      window.gtag('event', 'generate_lead', {
        event_category: 'conversion',
        event_label: source,
        value: 50
      });
    }
    
    if (typeof window.fbq !== 'undefined') {
      window.fbq('track', 'Lead', {
        content_name: source,
        ...leadData
      });
    }
  };
  
  return {
    trackConversion,
    trackLead,
    trackBookingIntent,
    trackServiceInterest
  };
};