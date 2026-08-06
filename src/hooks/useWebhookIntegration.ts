import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useGeoLocation } from './useGeoLocation';

interface LeadQualificationResponse {
  success: boolean;
  leadId: string;
  qualification: {
    score: number;
    priority: 'hot' | 'warm' | 'cold';
    reasoning: string;
  };
  recommendedRoute: 'direct_booking' | 'consultation' | 'nurture';
  nextSteps: string[];
}

interface CouponGenerationResponse {
  success: boolean;
  couponCode: string;
  discountAmount: number;
  expiresAt: string;
  bookingLink: string;
  emailSent: boolean;
}

interface VisitorInteraction {
  type: string;
  element_id?: string;
  element_text?: string;
  data?: Record<string, unknown>;
  value_score?: number;
}

interface VisitorData {
  email?: string;
  phone?: string;
  name?: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  source: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  metadata?: {
    page_visited: string;
    time_on_site: number;
    interactions_count: number;
    [key: string]: unknown;
  };
}

export const useWebhookIntegration = () => {
  const { geoData } = useGeoLocation();

  const getSessionId = useCallback(() => {
    return sessionStorage.getItem('visitor_session_id') || 
           `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  const getVisitorId = useCallback(() => {
    let visitorId = localStorage.getItem('convelabs_visitor_id');
    if (!visitorId) {
      visitorId = `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('convelabs_visitor_id', visitorId);
    }
    return visitorId;
  }, []);

  const getDeviceInfo = useCallback(() => {
    const ua = navigator.userAgent;
    const deviceType = /Mobile|Android|iPhone|iPad/.test(ua) ? 'mobile' : 'desktop';
    
    return {
      device_type: deviceType,
      browser: ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : 'Other',
      os: ua.includes('Windows') ? 'Windows' : ua.includes('Mac') ? 'macOS' : 'Other',
    };
  }, []);

  const getTimeOnSite = useCallback(() => {
    const startTime = sessionStorage.getItem('site_start_time');
    if (startTime) {
      return Math.floor((Date.now() - parseInt(startTime)) / 1000);
    }
    return 0;
  }, []);

  const qualifyLead = useCallback(async (leadData: VisitorData): Promise<LeadQualificationResponse | null> => {
    try {
      const interactions = leadData.metadata?.interactions_count ?? 0;
      const timeOnSite = leadData.metadata?.time_on_site ?? getTimeOnSite();
      const score = Math.max(
        35,
        Math.min(
          95,
          40 +
            (leadData.phone ? 15 : 0) +
            Math.min(interactions * 5, 20) +
            Math.min(Math.floor(timeOnSite / 30), 20)
        )
      );

      const priority: LeadQualificationResponse['qualification']['priority'] =
        score >= 80 ? 'hot' : score >= 60 ? 'warm' : 'cold';
      const recommendedRoute: LeadQualificationResponse['recommendedRoute'] =
        score >= 80 ? 'direct_booking' : score >= 60 ? 'consultation' : 'nurture';

      const leadCapture = await supabase.functions.invoke('process-lead-capture', {
        body: {
          email: leadData.email?.trim().toLowerCase(),
          source: leadData.source || 'visitor_qualification',
          referrer: typeof window !== 'undefined' ? window.location.href : undefined,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        },
      });

      await supabase.functions.invoke('analyze-visitor-behavior', {
        body: {
          action: 'track_interaction',
          data: {
            sessionId: getSessionId(),
            type: 'form_complete',
            element: 'lead_qualification',
            value: priority,
            path: window.location.pathname,
          },
        },
      });

      return {
        success: !leadCapture.error,
        leadId: getVisitorId(),
        qualification: {
          score,
          priority,
          reasoning: `Qualified from captured contact info, ${interactions} tracked interactions, and ${timeOnSite}s on site.`,
        },
        recommendedRoute,
        nextSteps:
          recommendedRoute === 'direct_booking'
            ? ['Show booking-first CTAs', 'Prioritize rapid follow-up']
            : recommendedRoute === 'consultation'
              ? ['Offer consult scheduling', 'Send service overview']
              : ['Enroll in nurture follow-up', 'Keep educational CTAs visible'],
      };
    } catch (error) {
      console.error('Lead qualification failed:', error);
      return null;
    }
  }, [getVisitorId, getSessionId, getTimeOnSite]);

  const trackVisitorAnalytics = useCallback(async (interactions: VisitorInteraction[] = []) => {
    try {
      const deviceInfo = getDeviceInfo();

      const events = interactions.length > 0 ? interactions : [{
        type: 'page_view',
        element_id: 'page',
        element_text: document.title,
      }];

      const results = await Promise.all(
        events.map((interaction) =>
          supabase.functions.invoke('analyze-visitor-behavior', {
            body: {
              action: 'track_interaction',
              data: {
                sessionId: getSessionId(),
                type: interaction.type,
                element: interaction.element_id || interaction.element_text || 'page',
                value: JSON.stringify({
                  page_url: window.location.href,
                  referrer: document.referrer,
                  ...deviceInfo,
                  country: geoData.country,
                  city: geoData.city,
                  details: interaction.data || null,
                  value_score: interaction.value_score ?? null,
                }),
                path: window.location.pathname,
              },
            },
          })
        )
      );

      return { success: results.every(({ error }) => !error) };
    } catch (error) {
      console.error('Visitor analytics tracking failed:', error);
      return null;
    }
  }, [getDeviceInfo, getSessionId, geoData.country, geoData.city]);

  const analyzeBehavior = useCallback(async (trigger: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('analyze-visitor-behavior', {
        body: {
          action: 'analyze_visitor',
          data: {
            sessionId: getSessionId(),
            pageViews: [{
              path: window.location.pathname,
              timeOnPage: getTimeOnSite(),
              interactions: [trigger],
              timestamp: new Date().toISOString(),
            }],
            interactions: [{
              type: 'cta_click',
              element: trigger,
              timestamp: new Date().toISOString(),
            }],
            demographics: {
              location: [geoData.city, geoData.country].filter(Boolean).join(', ') || undefined,
              deviceType: getDeviceInfo().device_type,
              isReturning: Boolean(localStorage.getItem('convelabs_visitor_id')),
            },
          },
        },
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Behavior analysis failed:', error);
      return null;
    }
  }, [geoData.city, geoData.country, getDeviceInfo, getSessionId, getTimeOnSite]);

  const generateDiscountCoupon = useCallback(async (offerData: {
    email: string;
    name?: string;
    phone?: string;
    visitorProfile: string;
    offerType: string;
    discountPercent: number;
  }): Promise<CouponGenerationResponse | null> => {
    try {
      console.log('Generating discount coupon for:', offerData);
      await supabase.functions.invoke('process-lead-capture', {
        body: {
          email: offerData.email.trim().toLowerCase(),
          source: 'exit_intent_popup',
          referrer: typeof window !== 'undefined' ? window.location.href : undefined,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        },
      });

      const followUpSummary = [
        `Exit intent offer request`,
        `Email: ${offerData.email}`,
        offerData.phone ? `Phone: ${offerData.phone}` : null,
        `Profile: ${offerData.visitorProfile}`,
        `Offer: ${offerData.offerType}`,
        `Requested discount: ${offerData.discountPercent}%`,
        `Page: ${window.location.href}`,
      ].filter(Boolean).join('\n');

      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          to: 'info@convelabs.com',
          subject: `[ConveLabs Offer Request] ${offerData.visitorProfile}`,
          text: followUpSummary,
          html: `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;">${followUpSummary}</pre>`,
        },
      });

      if (error) {
        console.error('Offer follow-up request failed:', error);
        return null;
      }

      return {
        success: true,
        couponCode: 'FOLLOW_UP',
        discountAmount: offerData.discountPercent,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        bookingLink: '/contact',
        emailSent: true,
      };
    } catch (error) {
      console.error('Coupon generation failed:', error);
      return null;
    }
  }, []);

  return {
    qualifyLead,
    trackVisitorAnalytics,
    analyzeBehavior,
    generateDiscountCoupon,
    getSessionId,
    getVisitorId,
  };
};
