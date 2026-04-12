
export interface ServiceOffering {
  name: string;
  icon: string; // Will use Lucide icon names: 'droplet', 'virus', 'syringe', etc.
  included: boolean;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  quarterlyPrice: number;
  annualPrice: number;
  features: string[];
  serviceOfferings: ServiceOffering[];
  isBestValue?: boolean;
  isConciergeDoctor?: boolean;
  annualOnly?: boolean;
  isUnlimited?: boolean;
  isB2B?: boolean;
}
