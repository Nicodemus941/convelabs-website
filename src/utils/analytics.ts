import React from 'react';
import { trackEvent as posthogTrack } from '@/lib/posthog';

interface AnalyticsEvent {
  sessionId: string;
  visitorId: string;
  userId?: string;
  eventType: string;
  eventData: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  referrer?: string;
}

class AnalyticsTracker {
  private sessionId: string;
  private visitorId: string;
  private userId?: string;
  private sessionStart: number;
  private lastActivity: number;

  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.visitorId = this.getOrCreateVisitorId();
    this.sessionStart = Date.now();
    this.lastActivity = Date.now();
    
    this.setupEventListeners();
    this.trackPageView();
  }

  private getSupabaseUrl(): string {
    return import.meta.env.VITE_SUPABASE_URL || 'https://yluyonhrxxtyuiyrdixl.supabase.co';
  }

  private getSupabaseAnonKey(): string {
    return (
      import.meta.env.VITE_SUPABASE_ANON_KEY ||
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdXlvbmhyeHh0eXVpeXJkaXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc1MDExODgsImV4cCI6MjA2MzA3NzE4OH0.ZKP-k5fizUtKZsekV9RFL1wYcVfIHEeQWArs-4l5Q-Y'
    );
  }

  private getOrCreateSessionId(): string {
    let sessionId = sessionStorage.getItem('analytics_session_id');
    if (!sessionId) {
      sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('analytics_session_id', sessionId);
    }
    return sessionId;
  }

  private getOrCreateVisitorId(): string {
    let visitorId = localStorage.getItem('analytics_visitor_id');
    if (!visitorId) {
      visitorId = 'visitor_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('analytics_visitor_id', visitorId);
    }
    return visitorId;
  }

  private setupEventListeners() {
    // Track scroll depth
    let maxScroll = 0;
    window.addEventListener('scroll', () => {
      const scrollPercent = Math.round(
        (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
      );
      maxScroll = Math.max(maxScroll, scrollPercent);
    });

    // Track page unload with final scroll depth
    window.addEventListener('beforeunload', () => {
      this.trackEvent('page_view', {
        page_path: window.location.pathname,
        page_title: document.title,
        time_on_page_seconds: Math.floor((Date.now() - this.lastActivity) / 1000),
        scroll_depth: maxScroll,
        exit_page: true
      });
    });

    // Track visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.trackEvent('page_hidden', {
          time_on_page: Date.now() - this.lastActivity
        });
      } else {
        this.lastActivity = Date.now();
      }
    });
  }

  setUserId(userId: string) {
    this.userId = userId;
  }

  trackPageView() {
    this.lastActivity = Date.now();
    this.trackEvent('page_view', {
      page_path: window.location.pathname,
      page_title: document.title,
      referrer: document.referrer
    });
  }

  trackFunnelStage(stage: string, stageOrder: number, data?: Record<string, unknown>) {
    this.trackEvent('funnel_stage', {
      stage,
      stage_order: stageOrder,
      event_data: data || {}
    });
  }

  trackBookingIntent(source: string, serviceType?: string) {
    this.trackEvent('booking_intent', {
      source,
      service_type: serviceType,
      intent_strength: 'high'
    });
  }

  trackBookingCompleted(bookingId: string, serviceType: string, amount: number) {
    this.trackEvent('booking_completed', {
      booking_id: bookingId,
      service_type: serviceType,
      amount: amount
    });
  }

  trackABTestExposure(experimentId: string, variant: string) {
    this.trackEvent('ab_test_exposure', {
      experiment_id: experimentId,
      variant: variant
    });
  }

  trackABTestConversion(experimentId: string, variant: string, conversionValue?: number) {
    this.trackEvent('ab_test_conversion', {
      experiment_id: experimentId,
      variant: variant,
      conversion_value: conversionValue
    });
  }

  private trackEvent(eventType: string, eventData: Record<string, unknown>) {
    try {
      // Fire to PostHog — covers ~everything:
      //  - page views / page leaves (autocapture + manual)
      //  - funnel stages (zip_entered, slot_selected, booking_submitted, etc.)
      //  - booking_intent / booking_completed for conversion cohorts
      //  - ab_test_exposure / conversion for feature-flag analysis
      // Session recordings run independently (configured in initPostHog).
      posthogTrack(eventType, {
        ...eventData,
        session_id: this.sessionId,
        visitor_id: this.visitorId,
        user_id: this.userId,
      });

      const endpoint = `${this.getSupabaseUrl()}/functions/v1/track-analytics`;
      const payload: AnalyticsEvent = {
        sessionId: this.sessionId,
        visitorId: this.visitorId,
        userId: this.userId,
        eventType,
        eventData,
        referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      };

      // Mirror the load-bearing funnel + traffic events into Supabase so
      // nightly ops reporting does not depend on PostHog alone.
      void fetch(endpoint, {
        method: 'POST',
        keepalive: eventType === 'page_view' || eventType === 'funnel_stage',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.getSupabaseAnonKey(),
          'Authorization': `Bearer ${this.getSupabaseAnonKey()}`,
          'X-Client-Info': 'convelabs-web-analytics',
        },
        body: JSON.stringify(payload),
      }).catch((error) => {
        console.warn('Supabase analytics mirror error:', error);
      });
    } catch (error) {
      console.warn('Analytics tracking error:', error);
    }
  }

  // Conversion funnel tracking helpers
  trackHomepageView() {
    this.trackFunnelStage('homepage', 1);
  }

  trackServicesView() {
    this.trackFunnelStage('services', 2);
  }

  trackPricingView() {
    this.trackFunnelStage('pricing', 3);
  }

  trackPreQualificationStart() {
    this.trackFunnelStage('pre_qualification', 4);
  }

  trackServiceSelection(serviceType: string) {
    this.trackFunnelStage('service_selection', 5, { service_type: serviceType });
  }

  // Booking flow funnel events
  trackZipEntered(zip: string) {
    this.trackEvent('zip_entered', { zip });
  }

  trackCoverageResult(zip: string, served: boolean) {
    this.trackEvent('coverage_result', { zip, served });
  }

  trackAvailabilityViewed(slotCount: number) {
    this.trackEvent('availability_viewed', { slot_count: slotCount });
  }

  trackSlotSelected(slotId: string, date: string, time: string) {
    this.trackEvent('slot_selected', { slot_id: slotId, date, time });
  }

  trackPatientFormStarted() {
    this.trackEvent('patient_form_started', {});
  }

  trackBookingSubmitted() {
    this.trackEvent('booking_submitted', {});
  }

  trackBookingConfirmed(bookingId: string) {
    this.trackEvent('booking_confirmed', { booking_id: bookingId });
  }

  trackBookingAbandoned(step: string) {
    this.trackEvent('booking_abandoned', { step });
  }
}

// Global analytics instance
export const analytics = new AnalyticsTracker();

// React hook for analytics
export const useAnalytics = () => {
  return {
    trackPageView: () => analytics.trackPageView(),
    trackFunnelStage: (stage: string, order: number, data?: Record<string, unknown>) =>
      analytics.trackFunnelStage(stage, order, data),
    trackBookingIntent: (source: string, serviceType?: string) => 
      analytics.trackBookingIntent(source, serviceType),
    trackBookingCompleted: (bookingId: string, serviceType: string, amount: number) => 
      analytics.trackBookingCompleted(bookingId, serviceType, amount),
    trackABTestExposure: (experimentId: string, variant: string) => 
      analytics.trackABTestExposure(experimentId, variant),
    trackABTestConversion: (experimentId: string, variant: string, value?: number) => 
      analytics.trackABTestConversion(experimentId, variant, value),
    setUserId: (userId: string) => analytics.setUserId(userId)
  };
};
