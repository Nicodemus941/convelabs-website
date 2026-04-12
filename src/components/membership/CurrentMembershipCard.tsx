
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowUpCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import UpgradePlanDialog from './UpgradePlanDialog';

interface UserMembership {
  next_renewal: string;
  plan?: {
    name: string;
    id?: string;
  };
  billing_frequency: string;
  credits_remaining: number;
  status: string;
}

interface CurrentMembershipCardProps {
  userMembership: UserMembership;
}

export const CurrentMembershipCard = ({ userMembership }: CurrentMembershipCardProps) => {
  const navigate = useNavigate();
  const renewalDate = new Date(userMembership.next_renewal).toLocaleDateString();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  
  return (
    <>
      <Card className="w-full max-w-md mx-auto shadow-lg">
        <CardHeader>
          <CardTitle>Your Current Membership</CardTitle>
          <CardDescription>
            {userMembership.plan?.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span>Plan:</span>
              <span className="font-medium">{userMembership.plan?.name}</span>
            </div>
            <div className="flex justify-between">
              <span>Billing:</span>
              <span className="font-medium capitalize">{userMembership.billing_frequency}</span>
            </div>
            <div className="flex justify-between">
              <span>Credits Remaining:</span>
              <span className="font-medium">{userMembership.credits_remaining}</span>
            </div>
            <div className="flex justify-between">
              <span>Next Renewal:</span>
              <span className="font-medium">{renewalDate}</span>
            </div>
            <div className="flex justify-between">
              <span>Status:</span>
              <Badge variant={userMembership.status === 'active' ? 'default' : 'destructive'}>
                {userMembership.status}
              </Badge>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => navigate('/dashboard')}
          >
            Go to Dashboard
          </Button>
          
          <Button 
            className="w-full flex items-center gap-2" 
            onClick={() => setShowUpgradeDialog(true)}
          >
            <ArrowUpCircle className="h-4 w-4" />
            Upgrade Plan
          </Button>
        </CardFooter>
      </Card>

      <UpgradePlanDialog 
        open={showUpgradeDialog}
        onOpenChange={setShowUpgradeDialog}
        currentPlan={userMembership.plan}
        currentBillingFrequency={userMembership.billing_frequency}
      />
    </>
  );
};
