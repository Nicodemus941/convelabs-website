// Simplified A/B Testing service that works with existing tables
import { supabase } from '@/integrations/supabase/client';

export interface SimpleABTest {
  experimentName: string;
  variant: string;
  content: {
    headline?: string;
    subheadline?: string;
    ctaText?: string;
    ctaColor?: string;
    offerText?: string;
    urgencyMessage?: string;
    discountAmount?: number;
  };
}

type VisitorProfile = {
  leadGrade?: 'hot' | 'warm' | 'cold' | string;
  deviceType?: 'mobile' | 'desktop' | string;
  hasBookingIntent?: boolean;
  selectedService?: string | null;
};

type ExperimentPerformanceEntry = {
  impressions: number;
  clicks: number;
  conversions: number;
  totalValue: number;
};

type ExperimentPerformance = Record<string, ExperimentPerformanceEntry>;

type ConversionEventRow = {
  variant: string | null;
  event_type: string | null;
  event_value: number | null;
  created_at: string;
};

class SimpleABTestingService {
  private experiments: Map<string, SimpleABTest[]> = new Map();

  constructor() {
    // Initialize with predefined experiments
    this.initializeExperiments();
  }

  private initializeExperiments() {
    // ConveLabs homepage clarity experiments
    this.experiments.set('home-hero-clarity', [
      {
        experimentName: 'home-hero-clarity',
        variant: 'control',
        content: {
          headline: 'Book your home blood draw without going to the lab.',
          subheadline: 'Pick a time, upload your lab order, and a licensed phlebotomist comes to your home or office.'
        }
      },
      {
        experimentName: 'home-hero-clarity',
        variant: 'local_certainty',
        content: {
          headline: 'Skip the waiting room. We come to you.',
          subheadline: 'Home and office blood draws across Central Florida with clear pricing and fast booking.'
        }
      }
    ]);

    this.experiments.set('home-fee-clarity', [
      {
        experimentName: 'home-fee-clarity',
        variant: 'control',
        content: {
          offerText: 'Home visits from $150. Office visits from $55. Senior visits from $110. Farther locations can add distance-based cost.'
        }
      },
      {
        experimentName: 'home-fee-clarity',
        variant: 'billing_split',
        content: {
          offerText: 'You pay ConveLabs for the draw. Your lab bills the tests through its normal insurance workflow. Different locations can cost more based on distance.'
        }
      }
    ]);

    // Hero CTA Test
    this.experiments.set('hero-cta', [
      {
        experimentName: 'hero-cta',
        variant: 'control',
        content: {
          ctaText: 'Book Now',
          ctaColor: 'primary'
        }
      },
      {
        experimentName: 'hero-cta',
        variant: 'urgent',
        content: {
          ctaText: 'Book Today - Save $150',
          ctaColor: 'red',
          urgencyMessage: 'Limited time offer!'
        }
      }
    ]);

    // Headline Test
    this.experiments.set('hero-headline', [
      {
        experimentName: 'hero-headline',
        variant: 'control',
        content: {
          headline: 'Professional Lab Services at Your Location',
          subheadline: 'Convenient, accurate, and trusted by thousands'
        }
      },
      {
        experimentName: 'hero-headline',
        variant: 'premium',
        content: {
          headline: 'Executive Health Services - At Your Convenience',
          subheadline: 'Premium lab services for busy professionals'
        }
      }
    ]);

    // Offer Banner Test
    this.experiments.set('offer-banner', [
      {
        experimentName: 'offer-banner',
        variant: 'control',
        content: {
          offerText: 'Special Offer',
          discountAmount: 20
        }
      },
      {
        experimentName: 'offer-banner',
        variant: 'urgent',
        content: {
          offerText: 'Limited Time: Premium Health Package',
          discountAmount: 30,
          urgencyMessage: 'Only 24 hours left!'
        }
      }
    ]);
  }

  assignVariant(sessionId: string, experimentName: string, visitorProfile?: VisitorProfile): string {
    const experiments = this.experiments.get(experimentName);
    if (!experiments || experiments.length === 0) {
      return 'control';
    }

    // Smart assignment based on visitor profile
    if (visitorProfile?.leadGrade === 'hot') {
      // High-value visitors get premium variants
      const premiumVariant = experiments.find(exp => 
        exp.variant.includes('premium') || exp.variant.includes('urgent')
      );
      if (premiumVariant) {
        this.trackEvent(sessionId, experimentName, premiumVariant.variant, 'assignment');
        return premiumVariant.variant;
      }
    }

    // Default: hash-based consistent assignment
    const hash = this.hashString(sessionId + experimentName);
    const index = hash % experiments.length;
    const assignedVariant = experiments[index].variant;
    
    this.trackEvent(sessionId, experimentName, assignedVariant, 'assignment');
    return assignedVariant;
  }

  getVariantContent(experimentName: string, variant: string): SimpleABTest['content'] | null {
    const experiments = this.experiments.get(experimentName);
    if (!experiments) return null;

    const experiment = experiments.find(exp => exp.variant === variant);
    return experiment?.content || null;
  }

  async trackEvent(sessionId: string, experimentName: string, variant: string, eventType: string) {
    try {
      // Use existing conversion_events table for tracking
      await supabase
        .from('conversion_events')
        .insert({
          session_id: sessionId,
          event_type: eventType,
          variant: variant,
          metadata: {
            experiment: experimentName,
            timestamp: new Date().toISOString()
          }
        });
    } catch (error) {
      console.error('Error tracking A/B test event:', error);
    }
  }

  async trackConversion(sessionId: string, experimentName: string, variant: string, value?: number) {
    await this.trackEvent(sessionId, experimentName, variant, 'conversion');
    
    // Also track in conversion_events with value
    try {
      await supabase
        .from('conversion_events')
        .insert({
          session_id: sessionId,
          event_type: 'ab_conversion',
          variant: variant,
          event_value: value,
          metadata: {
            experiment: experimentName,
            conversion_value: value
          }
        });
    } catch (error) {
      console.error('Error tracking conversion:', error);
    }
  }

  async trackClick(sessionId: string, experimentName: string, variant: string) {
    await this.trackEvent(sessionId, experimentName, variant, 'click');
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  getExperimentNames(): string[] {
    return Array.from(this.experiments.keys());
  }

  async getPerformanceData(experimentName: string): Promise<ExperimentPerformance> {
    try {
      const { data, error } = await supabase
        .from('conversion_events')
        .select('variant, event_type, event_value, created_at')
        .like('metadata->experiment', `%${experimentName}%`);

      if (error) throw error;

      // Aggregate performance data
      const performance = (data as ConversionEventRow[] | null)?.reduce<ExperimentPerformance>((acc, event) => {
        const variant = event.variant || 'control';
        if (!acc[variant]) {
          acc[variant] = {
            impressions: 0,
            clicks: 0,
            conversions: 0,
            totalValue: 0
          };
        }

        switch (event.event_type) {
          case 'assignment':
            acc[variant].impressions++;
            break;
          case 'click':
            acc[variant].clicks++;
            break;
          case 'conversion':
          case 'ab_conversion':
            acc[variant].conversions++;
            acc[variant].totalValue += event.event_value || 0;
            break;
        }

        return acc;
      }, {});

      return performance || {};
    } catch (error) {
      console.error('Error getting performance data:', error);
      return {};
    }
  }
}

export const simpleABTestingService = new SimpleABTestingService();
