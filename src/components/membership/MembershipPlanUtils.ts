
import { MembershipFeature } from './MembershipTypes';
import { PlanProps } from './MembershipPlanCard';

// Generate features array based on plan details
export const generatePlanFeatures = (plan: any): (string | MembershipFeature)[] => {
  const features: (string | MembershipFeature)[] = [];
  
  // Essential Care plan features
  if (plan.name === 'Essential Care') {
    features.push(`${plan.credits_per_year} lab visits per year`);
    features.push('Full lab results dashboard');
    features.push('No travel fees within service area');
    features.push('Annual billing only');
    return features;
  }
  
  // Individual plan features - updated as requested
  if (plan.name === 'Individual') {
    features.push('5 lab services/year');
    features.push('At-home or in-office visits');
    features.push('Result tracking');
    return features;
  }
  
  // Individual +1 plan features
  if (plan.name === 'Individual +1') {
    features.push(`${plan.credits_per_year} lab visits per year (4 per person)`);
    features.push('Full lab results dashboard for both');
    features.push('No travel fees within service area');
    return features;
  }
  
  // Family plan features
  if (plan.is_family_plan) {
    features.push(`${plan.credits_per_year} lab visits per year to share`);
    features.push('Family lab results dashboard');
    features.push('No travel fees within service area');
    return features;
  }
  
  // Concierge plan features (fallback)
  if (plan.is_concierge_plan) {
    features.push('Customizable patient count');
    features.push('Preferred scheduling for patients');
    features.push('White-labeled patient experience');
    features.push('Detailed patient result reports');
    return features;
  }
  
  // Default features if none of the above
  features.push(`${plan.credits_per_year} lab visits per year`);
  features.push('Lab results dashboard');
  features.push('No travel fees within service area');
  
  return features;
};

// Sort plans in a specific order
export const sortPlansByOrder = (plans: PlanProps[]): PlanProps[] => {
  // Define the order (Essential Care first, then Individual, Individual +1, Family)
  const planOrder: Record<string, number> = {
    'Essential Care': 1,
    'Individual': 2,
    'Individual +1': 3,
    'Family': 4,
    // Add any other plans with their respective order
  };
  
  return [...plans].sort((a, b) => {
    const orderA = planOrder[a.name] || 99; // Default to high number for unknown plans
    const orderB = planOrder[b.name] || 99;
    return orderA - orderB;
  });
};
