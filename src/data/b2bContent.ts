import { IndustryContent, TestimonialData, TrustMetric } from '@/types/b2bTypes';

export const industryContent: Record<string, IndustryContent> = {
  healthcare: {
    id: 'healthcare',
    name: 'Healthcare Providers',
    headline: 'Elevate Healthcare with Premium Mobile Lab Services',
    subtitle: 'Expand Your Practice Revenue Without Additional Overhead',
    description: 'Partner with ConveLabs to offer your patients convenient mobile phlebotomy services while generating additional revenue streams for your practice.',
    benefits: [
      'Generate $50K-200K additional annual revenue',
      'Enhance patient satisfaction by 40%+',
      'Zero overhead expansion - no staff or equipment needed',
      'Seamless integration with existing workflows',
      'White-label branding options available',
      'Comprehensive insurance billing support'
    ],
    cta: 'Calculate Your Practice Revenue Potential',
    roiMetrics: {
      revenueMultiplier: 0.20,
      savingsMultiplier: 0.15,
      baseValue: 50000
    },
    calculatorFields: {
      volumeLabel: 'Monthly Patient Volume',
      volumePlaceholder: 'e.g., 150',
      valueLabel: 'Average Service Value',
      valuePlaceholder: 'e.g., $125',
    }
  },
  talent: {
    id: 'talent',
    name: 'Talent Agencies',
    headline: 'Protect Your Talent with Executive-Level Medical Care',
    subtitle: 'Safeguard Careers and Maximize Booking Potential',
    description: 'Provide your talent with premium health monitoring that prevents career-threatening issues and ensures they\'re always booking-ready.',
    benefits: [
      'Prevent career-threatening health issues early',
      'Save $25K-100K per talent in booking protection',
      'Competitive advantage in talent retention',
      'Discreet, professional healthcare concierge',
      'Flexible scheduling for demanding careers',
      'Comprehensive health optimization programs'
    ],
    cta: 'Protect Your Talent Investment',
    roiMetrics: {
      revenueMultiplier: 0.30,
      savingsMultiplier: 0.25,
      baseValue: 75000
    },
    calculatorFields: {
      volumeLabel: 'Number of Talent Represented',
      volumePlaceholder: 'e.g., 25',
      valueLabel: 'Average Annual Booking Value',
      valuePlaceholder: 'e.g., $500,000',
    }
  },
  sports: {
    id: 'sports',
    name: 'Sports Organizations',
    headline: 'Peak Performance Through Precision Health Monitoring',
    subtitle: 'Optimize Athletic Performance and Prevent Costly Injuries',
    description: 'Advanced biomarker tracking and mobile health services that keep your athletes performing at their peak while reducing injury-related costs.',
    benefits: [
      'Optimize performance through advanced biomarker tracking',
      'Reduce injury costs by $500K-2M annually',
      'Mobile flexibility for travel teams and training camps',
      'Real-time health data for coaching decisions',
      'Competitive edge through health optimization',
      'Comprehensive wellness programs for entire organization'
    ],
    cta: 'Maximize Your Team\'s Potential',
    roiMetrics: {
      revenueMultiplier: 0.25,
      savingsMultiplier: 0.40,
      baseValue: 500000
    },
    calculatorFields: {
      volumeLabel: 'Team Size (Athletes + Staff)',
      volumePlaceholder: 'e.g., 50',
      valueLabel: 'Annual Performance Budget',
      valuePlaceholder: 'e.g., $2,000,000',
    }
  },
  corporate: {
    id: 'corporate',
    name: 'Corporations',
    headline: 'Transform Employee Wellness into Competitive Advantage',
    subtitle: 'Reduce Healthcare Costs While Boosting Productivity',
    description: 'Executive health programs and employee wellness initiatives that deliver measurable ROI through reduced healthcare costs and increased productivity.',
    benefits: [
      'Reduce healthcare costs by 20-30%',
      'Increase productivity through preventive care',
      'Retain top talent with premium benefits',
      'Executive health programs for leadership',
      'On-site wellness initiatives',
      'Comprehensive health analytics and reporting'
    ],
    cta: 'Calculate Your Wellness ROI',
    roiMetrics: {
      revenueMultiplier: 0.15,
      savingsMultiplier: 0.25,
      baseValue: 100000
    },
    calculatorFields: {
      volumeLabel: 'Number of Employees',
      volumePlaceholder: 'e.g., 250',
      valueLabel: 'Current Annual Wellness Spend',
      valuePlaceholder: 'e.g., $500,000',
      spendLabel: 'Annual Healthcare Costs',
      spendPlaceholder: 'e.g., $2,500,000'
    }
  }
};

export const testimonials: TestimonialData[] = [
  {
    id: '1',
    name: 'Victor Boyer',
    title: 'Customer',
    company: 'Google Review',
    industry: 'healthcare',
    quote: 'I am now a three-time repeat customer of ConveLabs. Nic and his team are fantastic - caring, kind, efficient, and professional. Lab slip that\'s two pages long and needs 17 vials? No problem. Specialty test kits that need to be overnighted? Handled with ease. I will continue to call on them whenever I need labs drawn!',
  },
  {
    id: '2',
    name: 'Marcus Rodriguez',
    title: 'Talent Manager',
    company: 'Elite Talent Agency',
    industry: 'talent',
    quote: 'We\'ve prevented three potential career-ending health issues this year alone. The ROI is immeasurable when you\'re protecting million-dollar careers.',
  },
  {
    id: '3',
    name: 'Coach Jennifer Walsh',
    title: 'Head of Performance',
    company: 'Metro Athletics',
    industry: 'sports',
    quote: 'The biomarker insights have given us a competitive edge. We\'ve reduced injury downtime by 60% and our athletes are performing at unprecedented levels.',
  },
  {
    id: '4',
    name: 'David Chen',
    title: 'VP of Human Resources',
    company: 'TechCorp Solutions',
    industry: 'corporate',
    quote: 'Our executive health program has become our top talent retention tool. We\'ve seen a 35% reduction in healthcare costs and dramatically improved executive satisfaction.',
  }
];

export const trustMetrics: TrustMetric[] = [
  {
    label: 'Active Partners',
    value: '25+',
    description: 'Organizations trust ConveLabs'
  },
  {
    label: 'Value Delivered',
    value: 'Up to $200K',
    description: 'In partnership value created'
  },
  {
    label: 'Client Satisfaction',
    value: '100%',
    description: 'Would recommend ConveLabs'
  },
  {
    label: 'Turnaround Time',
    value: '24-48hrs',
    description: 'Results delivered rapidly'
  },
  {
    label: 'Service Areas',
    value: 'Orlando & Tampa',
    description: 'Central Florida coverage'
  },
  {
    label: 'Certified Staff',
    value: '100%',
    description: 'Licensed phlebotomists'
  }
];