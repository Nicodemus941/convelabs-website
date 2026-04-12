
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTenantSubscription } from '@/hooks/tenant/useTenantSubscription';
import { useSubscriptionTiers } from '@/hooks/useSubscriptionTiers';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { CreditCard, Loader2 } from 'lucide-react';

interface SubscriptionInfoCardProps {
  tenantId: string;
}

const SubscriptionInfoCard: React.FC<SubscriptionInfoCardProps> = ({ tenantId }) => {
  const { getTenantSubscriptionTier, upgradeSubscription, manageBilling, isLoading } = useTenantSubscription();
  const { tiers, isLoading: tiersLoading } = useSubscriptionTiers();
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSubscription = async () => {
      if (tenantId) {
        const data = await getTenantSubscriptionTier(tenantId);
        setSubscription(data);
        setLoading(false);
      }
    };

    loadSubscription();
  }, [tenantId]);

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    return format(new Date(dateString), 'MMM d, yyyy');
  };

  const formatPrice = (priceInCents: number): string => {
    return `$${(priceInCents / 100).toFixed(2)}`;
  };

  const handleManageBilling = () => {
    manageBilling();
  };

  const currentTierDetails = subscription?.tierDetails;
  const availableUpgrades = tiers.filter(
    tier => tier.id !== subscription?.tierId && tier.monthlyPrice > (currentTierDetails?.monthly_price || 0)
  );

  if (loading || tiersLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>Loading subscription details...</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        </CardContent>
      </Card>
    );
  }

  const isTrialing = subscription?.trialEndsAt && new Date(subscription.trialEndsAt) > new Date();

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Subscription</CardTitle>
            <CardDescription>Manage your organization's subscription</CardDescription>
          </div>
          {isTrialing && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              Trial Active
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {currentTierDetails ? (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b pb-4">
              <div>
                <p className="font-medium text-lg">{currentTierDetails.name} Plan</p>
                <p className="text-gray-500 text-sm">{currentTierDetails.description}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-xl">{formatPrice(currentTierDetails.monthly_price)}/month</p>
              </div>
            </div>
            
            {isTrialing && (
              <div className="bg-blue-50 p-3 rounded-md">
                <p className="text-sm text-blue-700">
                  Your trial ends on {formatDate(subscription.trialEndsAt)}.
                </p>
              </div>
            )}
            
            <div>
              <h4 className="font-medium mb-2">Plan Features</h4>
              <ul className="space-y-1">
                {currentTierDetails.features.map((feature: string, index: number) => (
                  <li key={index} className="flex items-center text-sm">
                    <span className="mr-2 text-green-600">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
            
            {availableUpgrades.length > 0 && (
              <div className="mt-6">
                <h4 className="font-medium mb-2">Available Upgrades</h4>
                <div className="space-y-2">
                  {availableUpgrades.map(tier => (
                    <div key={tier.id} className="flex justify-between items-center p-3 border rounded-md bg-gray-50">
                      <div>
                        <p className="font-medium">{tier.name}</p>
                        <p className="text-sm text-gray-500">{formatPrice(tier.monthlyPrice)}/month</p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => upgradeSubscription(tier.id)}
                        disabled={isLoading}
                      >
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                        Upgrade
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-gray-500">No subscription information available.</p>
          </div>
        )}
      </CardContent>
      
      <CardFooter>
        <Button 
          variant="outline" 
          className="w-full" 
          onClick={handleManageBilling}
          disabled={isLoading || !subscription?.tierId}
        >
          <CreditCard className="h-4 w-4 mr-2" />
          {isLoading ? 'Loading...' : 'Manage Billing'}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default SubscriptionInfoCard;
