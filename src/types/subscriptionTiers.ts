
export interface SubscriptionTier {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  features: string[];
}

export interface TenantSubscription {
  tierId: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  startDate: string;
  currentPeriodEnd?: string;
  trialEndsAt?: string | null;
}
