
import { Plan } from './PlanTypes';

export const membershipPlans: Plan[] = [
  {
    id: 'health_starter',
    name: 'Health Starter',
    description: 'Annual plan for routine health monitoring',
    monthlyPrice: 0,
    quarterlyPrice: 0,
    annualPrice: 499,
    features: [
      '4 lab visits included per year',
      '$125 effective per visit (save $25/visit)',
      'At-home or in-office visits',
      'Result tracking included',
      '7-day scheduling: Mon-Sun, 6 AM - 1:30 PM',
      'No travel fees within service area'
    ],
    serviceOfferings: [
      { name: 'Blood Work', icon: 'droplet', included: true },
      { name: 'Flu & COVID Tests', icon: 'virus', included: true },
      { name: 'Urine & Stool Collection', icon: 'flask-round', included: true },
      { name: 'Therapeutic Phlebotomy', icon: 'syringe', included: false },
      { name: 'Genetic & Specialty Collections', icon: 'test-tubes', included: false }
    ],
    annualOnly: true
  },
  {
    id: 'proactive_health',
    name: 'Proactive Health',
    description: 'Best for executives and athletes needing regular monitoring',
    monthlyPrice: 149,
    quarterlyPrice: 447,
    annualPrice: 1499,
    features: [
      '12 lab visits per year (1/month)',
      '$125 effective per visit (save $25/visit)',
      'Same-day scheduling available',
      'Health insights dashboard',
      'Credit rollover (up to 3 months)',
      'Priority booking over non-members',
      '7-day scheduling: Mon-Sun, 6 AM - 1:30 PM'
    ],
    serviceOfferings: [
      { name: 'Blood Work', icon: 'droplet', included: true },
      { name: 'Flu & COVID Tests', icon: 'virus', included: true },
      { name: 'Urine & Stool Collection', icon: 'flask-round', included: true },
      { name: 'Therapeutic Phlebotomy', icon: 'syringe', included: true },
      { name: 'Genetic & Specialty Collections', icon: 'test-tubes', included: false }
    ],
    isBestValue: true
  },
  {
    id: 'concierge_elite',
    name: 'Concierge Elite',
    description: 'White-glove service for celebrities and high-net-worth clients',
    monthlyPrice: 299,
    quarterlyPrice: 897,
    annualPrice: 2999,
    features: [
      'Unlimited lab visits',
      'Dedicated phlebotomist assigned to you',
      'NDA available upon request',
      'Hotel, office, and home visits',
      'White-glove concierge service',
      'Priority scheduling guaranteed',
      '7-day scheduling: Mon-Sun, 6 AM - 1:30 PM'
    ],
    serviceOfferings: [
      { name: 'Blood Work', icon: 'droplet', included: true },
      { name: 'Flu & COVID Tests', icon: 'virus', included: true },
      { name: 'Urine & Stool Collection', icon: 'flask-round', included: true },
      { name: 'Therapeutic Phlebotomy', icon: 'syringe', included: true },
      { name: 'Genetic & Specialty Collections', icon: 'test-tubes', included: true }
    ],
    isUnlimited: true
  },
  {
    id: 'practice_partner',
    name: 'Practice Partner',
    description: 'B2B plan for concierge physicians and medical practices',
    monthlyPrice: 100,
    quarterlyPrice: 300,
    annualPrice: 1200,
    features: [
      '$100/patient/month (12 visits per patient/year)',
      'Minimum 5 patients, maximum 100',
      'White-label service integration',
      'Dedicated account management',
      'Priority scheduling and routing',
      'Bulk patient onboarding',
      '7-day scheduling: Mon-Sun, 6 AM - 1:30 PM'
    ],
    serviceOfferings: [
      { name: 'Blood Work', icon: 'droplet', included: true },
      { name: 'Flu & COVID Tests', icon: 'virus', included: true },
      { name: 'Urine & Stool Collection', icon: 'flask-round', included: true },
      { name: 'Therapeutic Phlebotomy', icon: 'syringe', included: true },
      { name: 'Genetic & Specialty Collections', icon: 'test-tubes', included: true }
    ],
    isConciergeDoctor: true,
    isB2B: true
  }
];
