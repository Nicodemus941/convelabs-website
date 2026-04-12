
import React from 'react';
import { Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SubscriptionTier } from '@/types/subscriptionTiers';

interface SubscriptionTierCardProps {
  tier: SubscriptionTier;
  isSelected?: boolean;
  onSelect: (tierId: string) => void;
  isPrimary?: boolean;
}

const SubscriptionTierCard: React.FC<SubscriptionTierCardProps> = ({
  tier,
  isSelected = false,
  onSelect,
  isPrimary = false
}) => {
  const formatPrice = (priceInCents: number): string => {
    return `$${(priceInCents / 100).toFixed(2)}`;
  };

  return (
    <Card 
      className={`flex flex-col h-full transition-all ${
        isSelected 
          ? 'border-blue-500 shadow-lg shadow-blue-100' 
          : 'border-gray-200'
      } ${isPrimary ? 'bg-blue-50' : ''}`}
    >
      {isPrimary && (
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-medium">
          Popular
        </div>
      )}
      <CardHeader>
        <CardTitle className="text-xl font-bold">{tier.name}</CardTitle>
        <CardDescription>{tier.description}</CardDescription>
        <div className="mt-4">
          <span className="text-3xl font-bold">{formatPrice(tier.monthlyPrice)}</span>
          <span className="text-gray-500 ml-1">/month</span>
        </div>
      </CardHeader>
      <CardContent className="flex-grow">
        <ul className="space-y-2">
          {tier.features.map((feature, index) => (
            <li key={index} className="flex items-center">
              <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button
          onClick={() => onSelect(tier.id)}
          variant={isSelected ? "default" : "outline"}
          className="w-full"
        >
          {isSelected ? 'Selected' : 'Select Plan'}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default SubscriptionTierCard;
