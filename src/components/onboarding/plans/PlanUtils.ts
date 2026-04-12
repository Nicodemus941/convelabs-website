
import { Plan, ServiceOffering } from './PlanTypes';

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0
  }).format(amount);
};

export const getBillingPrice = (
  plan: Plan, 
  billingFrequency: 'monthly' | 'quarterly' | 'annual'
): number => {
  switch (billingFrequency) {
    case 'monthly':
      return plan.monthlyPrice;
    case 'quarterly':
      return plan.quarterlyPrice;
    case 'annual':
      return plan.annualPrice;
    default:
      return plan.monthlyPrice;
  }
};

export const getBillingPeriod = (
  billingFrequency: 'monthly' | 'quarterly' | 'annual'
): string => {
  switch (billingFrequency) {
    case 'monthly':
      return '/month';
    case 'quarterly':
      return '/quarter';
    case 'annual':
      return '/year';
    default:
      return '/month';
  }
};

export const getIconComponent = (iconName: string) => {
  // This function returns the icon component name to be used with dynamic Icons import
  return iconName;
};
