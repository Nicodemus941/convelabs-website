import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface VisitorInteraction {
  type: 'cta_click' | 'form_start' | 'form_complete' | 'video_play' | 'scroll_depth' | 'exit_intent';
  element: string;
  value?: string;
  path: string;
}

interface VisitorAnalysis {
  visitor_analysis: {
    profile: 'busy_professional' | 'health_conscious' | 'corporate' | 'membership_prospect';
    intent_score: number;
    conversion_likelihood: 'high' | 'medium' | 'low';
    pain_points: string[];
    motivators: string[];
  };
  recommendations: {
    immediate_actions: string[];
    personalization: {
      headline: string;
      cta: string;
      offer: string;
    };
    conversion_path: 'direct_booking' | 'consultation' | 'nurture';
    messaging_focus: string[];
  };
}

export const useVisitorOptimization = () => {
  const [sessionId] = useState(() => 
    sessionStorage.getItem('visitor_session_id') || 
    (() => {
      const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('visitor_session_id', id);
      return id;
    })()
  );
  
  const [analysis, setAnalysis] = useState<VisitorAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Track visitor interactions
  const trackInteraction = useCallback(async (interaction: VisitorInteraction) => {
    try {
      await supabase.functions.invoke('analyze-visitor-behavior', {
        body: {
          action: 'track_interaction',
          data: {
            sessionId,
            type: interaction.type,
            element: interaction.element,
            value: interaction.value,
            path: interaction.path
          }
        }
      });
    } catch (error) {
      console.error('Error tracking interaction:', error);
    }
  }, [sessionId]);

  // Get visitor analysis and recommendations
  const analyzeVisitor = useCallback(async (pageViews: any[], interactions: any[]) => {
    if (isLoading) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-visitor-behavior', {
        body: {
          action: 'analyze_visitor',
          data: {
            sessionId,
            pageViews,
            interactions,
            demographics: {
              deviceType: /Mobile|Android|iPhone|iPad/.test(navigator.userAgent) ? 'mobile' : 'desktop',
              isReturning: localStorage.getItem('convelabs_returning_visitor') === 'true'
            }
          }
        }
      });

      if (error) throw error;

      if (data?.analysis) {
        setAnalysis(data.analysis);
        localStorage.setItem('convelabs_returning_visitor', 'true');
      }
    } catch (error) {
      console.error('Error analyzing visitor:', error);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, isLoading]);

  // Track CTA clicks
  const trackCTAClick = useCallback((ctaText: string, location: string) => {
    trackInteraction({
      type: 'cta_click',
      element: ctaText,
      value: location,
      path: window.location.pathname
    });
  }, [trackInteraction]);

  // Track form interactions
  const trackFormStart = useCallback((formName: string) => {
    trackInteraction({
      type: 'form_start',
      element: formName,
      path: window.location.pathname
    });
  }, [trackInteraction]);

  const trackFormComplete = useCallback((formName: string) => {
    trackInteraction({
      type: 'form_complete',
      element: formName,
      path: window.location.pathname
    });
  }, [trackInteraction]);

  // Track video engagement
  const trackVideoPlay = useCallback((videoId: string) => {
    trackInteraction({
      type: 'video_play',
      element: `video_${videoId}`,
      path: window.location.pathname
    });
  }, [trackInteraction]);

  // Track scroll depth
  const trackScrollDepth = useCallback((percentage: number) => {
    trackInteraction({
      type: 'scroll_depth',
      element: 'page_scroll',
      value: percentage.toString(),
      path: window.location.pathname
    });
  }, [trackInteraction]);

  // Track exit intent
  const trackExitIntent = useCallback(() => {
    trackInteraction({
      type: 'exit_intent',
      element: 'mouse_leave',
      path: window.location.pathname
    });
  }, [trackInteraction]);

  // Set up scroll tracking
  useEffect(() => {
    let maxScroll = 0;
    const trackingThresholds = [25, 50, 75, 90];
    const trackedThresholds = new Set<number>();

    const handleScroll = () => {
      const scrollTop = window.pageYOffset;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = Math.round((scrollTop / docHeight) * 100);
      
      if (scrollPercent > maxScroll) {
        maxScroll = scrollPercent;
        
        for (const threshold of trackingThresholds) {
          if (scrollPercent >= threshold && !trackedThresholds.has(threshold)) {
            trackedThresholds.add(threshold);
            trackScrollDepth(threshold);
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [trackScrollDepth]);

  // Set up site tracking
  useEffect(() => {
    if (!sessionStorage.getItem('site_start_time')) {
      sessionStorage.setItem('site_start_time', Date.now().toString());
    }
  }, []);

  // Set up exit intent tracking
  useEffect(() => {
    let hasTrackedExit = false;

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !hasTrackedExit) {
        hasTrackedExit = true;
        trackExitIntent();
      }
    };

    document.addEventListener('mouseleave', handleMouseLeave);
    return () => document.removeEventListener('mouseleave', handleMouseLeave);
  }, [trackExitIntent]);

  return {
    sessionId,
    analysis,
    isLoading,
    analyzeVisitor,
    trackCTAClick,
    trackFormStart,
    trackFormComplete,
    trackVideoPlay,
    trackScrollDepth,
    trackExitIntent
  };
};