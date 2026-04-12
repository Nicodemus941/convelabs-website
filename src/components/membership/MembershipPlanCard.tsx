import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Star } from 'lucide-react';
import { formatPrice } from '@/services/stripe';
import { MembershipFeature } from './MembershipTypes';

export interface PlanProps {
  id: string;
  name: string;
  description: string;
  monthly_price: number;
  quarterly_price: number;
  annual_price: number;
  credits_per_year: number;
  max_users: number;
  is_family_plan: boolean;
  is_concierge_plan: boolean;
  features: (string | MembershipFeature)[];
  is_popular?: boolean;
  is_annual_only?: boolean;
}

interface MembershipPlanCardProps {
  plan: PlanProps;
  billingFrequency: 'monthly' | 'quarterly' | 'annual';
  onSubscribe: (planId: string) => void;
  isCheckingOut: boolean;
  isSupernovaMember?: boolean;
}

export const MembershipPlanCard = ({ 
  plan, 
  billingFrequency, 
  onSubscribe,
  isCheckingOut,
  isSupernovaMember = false
}: MembershipPlanCardProps) => {
  // Calculate the price with Supernova discount if applicable
  const getPrice = () => {
    // For Essential Care plan, always use annual price
    if (plan.is_annual_only) {
      return plan.annual_price;
    }
    
    let price = billingFrequency === 'monthly' 
      ? plan.monthly_price 
      : billingFrequency === 'quarterly'
        ? plan.quarterly_price
        : plan.annual_price;
    
    // Apply 10% additional discount for Supernova members (changed from 5%)
    if (isSupernovaMember && billingFrequency === 'annual') {
      price = Math.round(price * 0.9);
    }
    
    return price;
  };

  const price = getPrice();
  
  // Calculate the original price for comparison (only for Supernova annual plans)
  const originalPrice = isSupernovaMember && billingFrequency === 'annual' ? plan.annual_price : null;

  // Special badge for Essential Care plan
  const isEssentialPlan = plan.name === 'Essential Care';

  const handleSubscribe = () => {
    window.location.href = "/book-now";
  };

  return (
    <Card className="flex flex-col h-full shadow-lg hover:shadow-xl transition-shadow relative">
      {/* Improved visibility for the popular badge */}
      {plan.is_popular && (
        <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10 px-4 py-1 bg-conve-gold text-white font-bold shadow-md">
          Most Popular
        </Badge>
      )}
      
      {/* Essential Care badge */}
      {isEssentialPlan && (
        <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10 px-4 py-1 bg-green-600 text-white font-bold shadow-md">
          Most Economical
        </Badge>
      )}
      
      {/* Supernova badge */}
      {isSupernovaMember && billingFrequency === 'annual' && (
        <div className="absolute -top-3 right-4 z-10">
          <Badge className="px-3 py-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold shadow-md flex items-center gap-1">
            <Star className="h-3 w-3 fill-white" />
            <span>Supernova Deal</span>
          </Badge>
        </div>
      )}
      
      <CardHeader className={`pt-6 ${plan.is_popular || isEssentialPlan ? 'mt-2' : ''}`}>
        <CardTitle>{plan.name}</CardTitle>
        <CardDescription>{plan.description}</CardDescription>
        
        <div className="mt-4">
          <div className="text-3xl font-bold">
            {billingFrequency === 'annual' && plan.name === 'Individual' ? '$962.10' : formatPrice(price)}
            <span className="text-sm font-normal text-muted-foreground ml-1">
              {billingFrequency === 'monthly' 
                ? '/month' 
                : billingFrequency === 'quarterly'
                  ? '/quarter'
                  : '/year'}
            </span>
          </div>
          
          {/* Show strikethrough original price for Supernova discount */}
          {originalPrice && (
            <div className="text-sm text-muted-foreground line-through mt-1">
              Regular: {formatPrice(originalPrice)}/year
            </div>
          )}
          
          {isSupernovaMember && billingFrequency === 'annual' && (
            <div className="text-sm text-emerald-600 font-medium mt-1">
              Save 10% with Supernova Deal
            </div>
          )}
          
          {/* Show compared to à la carte pricing for Essential Care */}
          {isEssentialPlan && (
            <div className="text-sm text-emerald-600 font-medium mt-1">
              Save vs. à la carte: ${formatPrice(30000 - plan.annual_price)}
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="flex-grow">
        <ul className="space-y-2">
          {plan.features.map((feature, index) => (
            <li key={index} className="flex items-start">
              <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
              <span>{typeof feature === 'string' ? feature : feature.text}</span>
            </li>
          ))}
        </ul>
        
        {isEssentialPlan && (
          <div className="mt-4 p-3 bg-green-50 border border-green-100 rounded-md">
            <p className="text-sm text-green-800">
              Annual billing only. Includes 3 lab visits per year, perfect for those who need occasional lab services without a monthly commitment.
            </p>
          </div>
        )}
      </CardContent>
      
      <CardFooter>
        <Button 
          className={`w-full ${plan.is_annual_only ? 'bg-green-600 hover:bg-green-700' : ''}`} 
          onClick={handleSubscribe}
          disabled={isCheckingOut}
        >
          {isCheckingOut ? 'Processing...' : 'Subscribe Now'}
        </Button>
      </CardFooter>
    </Card>
  );
};
