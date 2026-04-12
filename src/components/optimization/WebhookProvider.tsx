import React, { createContext, useContext, useEffect } from 'react';
import { useWebhookIntegration } from '@/hooks/useWebhookIntegration';
import { useVisitorOptimization } from '@/hooks/useVisitorOptimization';

interface WebhookContextType {
  qualifyLead: (leadData: any) => Promise<any>;
  trackVisitorAnalytics: (interactions?: any[]) => Promise<any>;
  analyzeBehavior: (trigger: string) => Promise<any>;
}

const WebhookContext = createContext<WebhookContextType | undefined>(undefined);

export const useWebhookContext = () => {
  const context = useContext(WebhookContext);
  if (!context) {
    throw new Error('useWebhookContext must be used within a WebhookProvider');
  }
  return context;
};

interface WebhookProviderProps {
  children: React.ReactNode;
}

export const WebhookProvider: React.FC<WebhookProviderProps> = ({ children }) => {
  const { qualifyLead, trackVisitorAnalytics, analyzeBehavior } = useWebhookIntegration();
  const { trackCTAClick, trackScrollDepth } = useVisitorOptimization();

  // Set up enhanced visitor analytics tracking
  useEffect(() => {
    const trackPageAnalytics = async () => {
      try {
        // Collect current page interactions
        const interactions = [
          {
            type: 'page_view',
            element_id: 'page',
            element_text: document.title,
            data: { 
              url: window.location.href,
              referrer: document.referrer,
              timestamp: Date.now()
            },
            value_score: 5
          }
        ];

        await trackVisitorAnalytics(interactions);
      } catch (error) {
        console.error('Error tracking page analytics:', error);
      }
    };

    // Track after a brief delay to ensure page is loaded
    const timer = setTimeout(trackPageAnalytics, 2000);
    return () => clearTimeout(timer);
  }, [trackVisitorAnalytics]);

  // Enhanced CTA tracking with webhook integration
  const enhancedTrackCTA = async (ctaText: string, location: string) => {
    // Track locally
    trackCTAClick(ctaText, location);
    
    // Track in webhook system
    try {
      await trackVisitorAnalytics([{
        type: 'button_click',
        element_id: `cta-${location}`,
        element_text: ctaText,
        data: { section: location },
        value_score: 25
      }]);
    } catch (error) {
      console.error('Error tracking CTA via webhook:', error);
    }
  };

  // Set up behavioral triggers
  useEffect(() => {
    let interactionCount = 0;
    let highEngagementTriggered = false;

    const trackInteraction = async () => {
      interactionCount++;
      
      // High engagement trigger after 5 interactions
      if (interactionCount >= 5 && !highEngagementTriggered) {
        highEngagementTriggered = true;
        try {
          await analyzeBehavior('high_engagement');
        } catch (error) {
          console.error('Error analyzing high engagement:', error);
        }
      }
    };

    // Track clicks, form interactions, and scrolls
    const handleClick = () => trackInteraction();
    const handleFormFocus = () => trackInteraction();
    const handleScroll = () => {
      trackInteraction();
      trackScrollDepth(Math.round((window.pageYOffset / document.documentElement.scrollHeight) * 100));
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('focusin', handleFormFocus);
    window.addEventListener('scroll', handleScroll);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('focusin', handleFormFocus);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [analyzeBehavior, trackScrollDepth]);

  const contextValue: WebhookContextType = {
    qualifyLead,
    trackVisitorAnalytics,
    analyzeBehavior,
  };

  return (
    <WebhookContext.Provider value={contextValue}>
      {children}
    </WebhookContext.Provider>
  );
};