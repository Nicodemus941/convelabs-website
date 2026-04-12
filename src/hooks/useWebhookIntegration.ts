import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useGeoLocation } from './useGeoLocation';

interface WebhookPayload {
  action: 'qualify_lead' | 'track_visitor_analytics' | 'analyze_visitor_behavior' | 'generate_discount_coupon';
  site: string;
  data: any;
}

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
    [key: string]: any;
  };
}

export const useWebhookIntegration = () => {
  const WEBHOOK_URL = 'https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/convelabs-webhook';
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

  const getUTMParams = useCallback(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return {
      source: urlParams.get('utm_source') || undefined,
      medium: urlParams.get('utm_medium') || undefined,
      campaign: urlParams.get('utm_campaign') || undefined,
      term: urlParams.get('utm_term') || undefined,
      content: urlParams.get('utm_content') || undefined,
    };
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

  const sendWebhookRequest = useCallback(async (payload: WebhookPayload) => {
    try {
      console.log('Sending webhook request:', payload);
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`Webhook request failed with status: ${response.status}`);
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Webhook request failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('Webhook response:', result);
      return result;
    } catch (error) {
      console.error('Webhook integration error:', error);
      throw error;
    }
  }, []);

  const qualifyLead = useCallback(async (leadData: VisitorData): Promise<LeadQualificationResponse | null> => {
    try {
      const utmParams = getUTMParams();
      const deviceInfo = getDeviceInfo();
      
      const payload: WebhookPayload = {
        action: 'qualify_lead',
        site: 'convelabs.com',
        data: {
          ...leadData,
          ...utmParams,
          ...deviceInfo,
          visitor_id: getVisitorId(),
          session_id: getSessionId(),
          metadata: {
            page_visited: window.location.pathname,
            time_on_site: getTimeOnSite(),
            ...leadData.metadata,
          },
        },
      };

      const response = await sendWebhookRequest(payload);
      
      // Also store in local system for backup
      await supabase.functions.invoke('analyze-visitor-behavior', {
        body: {
          action: 'track_lead_qualification',
          data: {
            webhook_response: response,
            payload: payload.data,
          }
        }
      });

      return response;
    } catch (error) {
      console.error('Lead qualification failed:', error);
      return null;
    }
  }, [getUTMParams, getDeviceInfo, getVisitorId, getSessionId, getTimeOnSite, sendWebhookRequest]);

  const trackVisitorAnalytics = useCallback(async (interactions: any[] = []) => {
    try {
      const utmParams = getUTMParams();
      const deviceInfo = getDeviceInfo();
      
      const payload: WebhookPayload = {
        action: 'track_visitor_analytics',
        site: 'convelabs.com',
        data: {
          session_id: getSessionId(),
          visitor_id: getVisitorId(),
          site: 'convelabs.com',
          page_url: window.location.href,
          referrer: document.referrer,
          ...utmParams,
          ...deviceInfo,
          country: geoData.country,
          city: geoData.city,
          interactions,
          journey_data: {
            stage: 'consideration',
            touchpoint: 'website_visit',
            interaction_type: 'page_view',
            time_spent: getTimeOnSite(),
            position: 'middle_funnel',
          },
        },
      };

      return await sendWebhookRequest(payload);
    } catch (error) {
      console.error('Visitor analytics tracking failed:', error);
      return null;
    }
  }, [getUTMParams, getDeviceInfo, getSessionId, getVisitorId, getTimeOnSite, sendWebhookRequest]);

  const analyzeBehavior = useCallback(async (trigger: string) => {
    try {
      const payload: WebhookPayload = {
        action: 'analyze_visitor_behavior',
        site: 'convelabs.com',
        data: {
          visitor_id: getVisitorId(),
          session_id: getSessionId(),
          trigger,
        },
      };

      return await sendWebhookRequest(payload);
    } catch (error) {
      console.error('Behavior analysis failed:', error);
      return null;
    }
  }, [getVisitorId, getSessionId, sendWebhookRequest]);

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
      const utmParams = getUTMParams();
      const deviceInfo = getDeviceInfo();
      
      const payload: WebhookPayload = {
        action: 'generate_discount_coupon',
        site: 'convelabs.com',
        data: {
          ...offerData,
          ...utmParams,
          ...deviceInfo,
          visitor_id: getVisitorId(),
          session_id: getSessionId(),
          timestamp: new Date().toISOString(),
          source: 'exit_intent_popup',
          metadata: {
            page_visited: window.location.pathname,
            time_on_site: getTimeOnSite(),
          },
        },
      };

      const response = await sendWebhookRequest(payload);
      
      // Also store in local system for backup
      await supabase.functions.invoke('analyze-visitor-behavior', {
        body: {
          action: 'track_coupon_generation',
          data: {
            webhook_response: response,
            payload: payload.data,
          }
        }
      });

      return response;
    } catch (error) {
      console.error('Coupon generation failed:', error);
      return null;
    }
  }, [getUTMParams, getDeviceInfo, getVisitorId, getSessionId, getTimeOnSite, sendWebhookRequest]);

  return {
    qualifyLead,
    trackVisitorAnalytics,
    analyzeBehavior,
    generateDiscountCoupon,
    getSessionId,
    getVisitorId,
  };
};