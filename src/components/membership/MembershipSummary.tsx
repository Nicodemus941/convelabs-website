
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMembership } from '@/hooks/useMembership';
import { ArrowUpCircle, Clock } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UpgradePlanDialog from './UpgradePlanDialog';

const MembershipSummary = () => {
  const navigate = useNavigate();
  const { userMembership, isLoading, totalCreditsAvailable, daysToRolloverExpiry } = useMembership();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Membership Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 flex items-center justify-center">
            <div className="animate-pulse bg-gray-200 h-5 w-32 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!userMembership) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Membership Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-gray-600 mb-4">You don't have an active membership.</p>
            <Button onClick={() => navigate('/pricing')}>View Membership Options</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Membership Summary</CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex items-center gap-1"
            onClick={() => setShowUpgradeDialog(true)}
          >
            <ArrowUpCircle className="h-4 w-4" />
            Upgrade
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Current Plan</span>
              <span className="font-medium">{userMembership.plan?.name}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Credits Available</span>
              <span className="font-medium">{totalCreditsAvailable}</span>
            </div>
            
            {daysToRolloverExpiry !== null && daysToRolloverExpiry > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm flex items-center gap-1 text-amber-600">
                  <Clock className="h-4 w-4" />
                  Rollover Credits Expiry
                </span>
                <span className="font-medium text-amber-600">{daysToRolloverExpiry} days</span>
              </div>
            )}
            
            <div className="border-t pt-3">
              <Button 
                variant="default" 
                className="w-full"
                onClick={() => navigate('/pricing')}
              >
                Manage Membership
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {userMembership && (
        <UpgradePlanDialog 
          open={showUpgradeDialog}
          onOpenChange={setShowUpgradeDialog}
          currentPlan={userMembership.plan}
          currentBillingFrequency={userMembership.billing_frequency}
        />
      )}
    </>
  );
};

export default MembershipSummary;
