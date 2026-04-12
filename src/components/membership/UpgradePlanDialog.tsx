
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LoaderCircle } from 'lucide-react';
import { BillingFrequencyToggle } from './BillingFrequencyToggle';
import { MembershipPlanCard } from './MembershipPlanCard';
import { useMembership } from '@/hooks/useMembership';
import { createCheckoutSession } from '@/services/stripe';

interface UpgradePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan?: {
    name: string;
    id?: string;
  };
  currentBillingFrequency: string;
}

const UpgradePlanDialog: React.FC<UpgradePlanDialogProps> = ({ 
  open, 
  onOpenChange, 
  currentPlan, 
  currentBillingFrequency 
}) => {
  const navigate = useNavigate();
  const { plans, isLoading } = useMembership();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingFrequency, setBillingFrequency] = useState<'monthly' | 'quarterly' | 'annual'>(
    currentBillingFrequency as 'monthly' | 'quarterly' | 'annual' || 'annual'
  );
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Filter out plans that are not upgrades
  const availableUpgradePlans = plans?.filter(plan => {
    // Don't show current plan
    if (currentPlan?.id === plan.id) return false;
    
    // Don't show test or concierge plans
    if (plan.is_concierge_plan || plan.name === 'Test Plan') return false;
    
    // Logic to determine if this is an upgrade
    // For simplicity, we consider any plan with more credits or users an upgrade
    const isUpgrade = currentPlan?.id 
      ? (plan.credits_per_year > (plans.find(p => p.id === currentPlan.id)?.credits_per_year || 0) || 
         plan.max_users > (plans.find(p => p.id === currentPlan.id)?.max_users || 0))
      : true;
    
    return isUpgrade;
  }) || [];

  const handlePlanSelect = (planId: string) => {
    setSelectedPlan(planId);
  };

  const handleUpgrade = async () => {
    if (!selectedPlan) {
      toast.error("Please select a plan to upgrade to");
      return;
    }

    setIsProcessing(true);
    
    try {
      // Create checkout session for the new plan
      const result = await createCheckoutSession(
        selectedPlan,
        billingFrequency,
        undefined,
        false,
        { isUpgrade: 'true' }
      );
      
      if (result.error) {
        console.error('Upgrade error:', result.error);
        toast.error(result.error);
      } else if (result.url) {
        // Open the checkout URL in the browser
        window.location.href = result.url;
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      toast.error('Upgrade failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Convert plans to card format
  const planCards = availableUpgradePlans.map(plan => {
    const features = [];
    
    // Generate features based on plan attributes
    if (plan.is_family_plan) {
      features.push(`Family plan for up to ${plan.max_users} members`);
    } else {
      features.push(`Individual plan for ${plan.max_users} member${plan.max_users > 1 ? 's' : ''}`);
    }
    
    features.push(`${plan.credits_per_year} lab credits per year`);
    features.push('Mobile lab draws');
    features.push('Concierge service');
    
    return {
      ...plan,
      features,
      is_popular: plan.name === 'Individual +1'
    };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Upgrade Your Membership</DialogTitle>
          <DialogDescription>
            Select a new plan to upgrade your current {currentPlan?.name} membership.
            Your unused credits will be transferred to your new plan.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <BillingFrequencyToggle 
            billingFrequency={billingFrequency} 
            setBillingFrequency={setBillingFrequency} 
          />
          
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : planCards.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              {planCards.map((plan) => (
                <MembershipPlanCard
                  key={plan.id}
                  plan={plan}
                  billingFrequency={billingFrequency}
                  onSubscribe={() => handlePlanSelect(plan.id)}
                  isCheckingOut={isProcessing && selectedPlan === plan.id}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No upgrade plans available for your current membership.</p>
            </div>
          )}
        </div>
        
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            onClick={handleUpgrade} 
            disabled={!selectedPlan || isProcessing}
          >
            {isProcessing ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : 'Upgrade Plan'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradePlanDialog;
