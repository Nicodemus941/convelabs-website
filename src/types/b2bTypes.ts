export type IndustryType = 'healthcare' | 'talent' | 'sports' | 'corporate';

export interface ROICalculatorInputs {
  volume: number;
  avgValue: number;
  currentSpend?: number;
}

export interface ROICalculatorResults {
  additionalRevenue: number;
  costSavings: number;
  totalValue: number;
  monthlyValue: number;
}

export interface IndustryContent {
  id: IndustryType;
  name: string;
  headline: string;
  subtitle: string;
  description: string;
  benefits: string[];
  cta: string;
  roiMetrics: {
    revenueMultiplier: number;
    savingsMultiplier: number;
    baseValue: number;
  };
  calculatorFields: {
    volumeLabel: string;
    volumePlaceholder: string;
    valueLabel: string;
    valuePlaceholder: string;
    spendLabel?: string;
    spendPlaceholder?: string;
  };
}

export interface PartnershipFormData {
  companyName: string;
  industry: IndustryType;
  contactName: string;
  email: string;
  phone: string;
  partnershipType: string;
  estimatedVolume: number;
  message?: string;
}

export interface TestimonialData {
  id: string;
  name: string;
  title: string;
  company: string;
  industry: IndustryType;
  quote: string;
  avatar?: string;
  logo?: string;
}

export interface TrustMetric {
  label: string;
  value: string;
  description: string;
}