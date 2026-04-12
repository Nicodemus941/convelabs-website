
import React from 'react';
import { MembershipHero } from './layout/MembershipHero';
import { MembershipFeatures } from './layout/MembershipFeatures';
import { MembershipIdealFor } from './layout/MembershipIdealFor';
import { MembershipTestimonial } from './layout/MembershipTestimonial';
import { MembershipCallToAction } from './layout/MembershipCallToAction';
import { MembershipPricingPreview } from './layout/MembershipPricingPreview';
import { VideoSection } from '@/components/ui/video-section';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface MembershipLayoutProps {
  type: 'individual' | 'family' | 'plus-one' | 'concierge-doctor';
  title: string;
  description: string;
  benefits: Array<{
    title: string;
    description: string;
    icon?: React.ReactNode;
  }>;
  idealFor: Array<{
    text: string;
  }>;
  features: Array<{
    text: string;
  }>;
  pricing: {
    monthly: number | string;
    quarterly: number | string;
    annual: number | string;
    savings?: number;
  };
  testimonial?: {
    quote: string;
    author: string;
    role: string;
    image?: string;
  };
  video?: {
    id: string;
    title: string;
    description: string;
  };
  children?: React.ReactNode;
}

export const MembershipLayout: React.FC<MembershipLayoutProps> = ({
  type,
  title,
  description,
  benefits,
  idealFor,
  features,
  pricing,
  testimonial,
  video,
  children
}) => {
  return (
    <div className="pb-20">
      <MembershipHero 
        title={title}
        tagline={description}
        type={type}
      />
      
      <MembershipPricingPreview 
        pricing={{
          monthly: typeof pricing.monthly === 'number' ? `$${pricing.monthly}` : pricing.monthly,
          quarterly: typeof pricing.quarterly === 'number' ? `$${pricing.quarterly}` : pricing.quarterly,
          annually: typeof pricing.annual === 'number' ? `$${pricing.annual}` : pricing.annual
        }}
        title={title}
      />
      
      <MembershipIdealFor 
        idealFor={idealFor}
      />
      
      <Separator className="my-16" />
      
      <MembershipFeatures 
        features={features}
        type={type}
      />
      
      {video && (
        <div className="mt-16">
          <VideoSection
            videoId={video.id}
            title={video.title}
            description={video.description}
          />
          <div className="text-center mt-8">
            <Button asChild>
              <Link to="/pricing">
                View Membership Options <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      )}
      
      {testimonial && (
        <div className="my-16">
          <MembershipTestimonial 
            testimonial={testimonial}
          />
        </div>
      )}
      
      {children}
      
      <MembershipCallToAction 
        title={title}
      />
    </div>
  );
};
