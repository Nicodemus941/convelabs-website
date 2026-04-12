
export interface MembershipFeature {
  text: string;
}

export interface MembershipIdealFor {
  text: string;
}

export interface MembershipPricing {
  monthly: string;
  quarterly: string;
  annually: string;
}

export interface MembershipTestimonial {
  quote: string;
  author: string;
  role: string;
  image?: string;
}

export interface MembershipPageProps {
  title: string;
  tagline: string;
  videoId: string;
  description: string;
  features: MembershipFeature[];
  idealFor: MembershipIdealFor[];
  testimonial: MembershipTestimonial;
  pricing: MembershipPricing;
  path: string;
  metaDescription: string;
}

// Add this interface for AddOn that aligns with how we're using it
export interface AddOn {
  id: string;
  name: string;
  description: string;
  price: number;
  is_addon?: boolean;
}
