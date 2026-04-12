
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useMembership } from '@/hooks/useMembership';

const CreditUsage = () => {
  const { userMembership, creditPool, hasMembership, isLoading } = useMembership();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-24">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!hasMembership) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Credit Usage</CardTitle>
          <CardDescription>You don't have an active membership</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Subscribe to a membership plan to access lab services.
          </p>
        </CardContent>
      </Card>
    );
  }

  // For individual plans
  if (!creditPool && userMembership) {
    const creditsUsed = userMembership.plan?.credits_per_year - userMembership.credits_remaining;
    const creditsTotal = userMembership.plan?.credits_per_year || 0;
    const usagePercentage = (creditsUsed / creditsTotal) * 100;
    
    return (
      <Card>
        <CardHeader>
          <CardTitle>Credit Usage</CardTitle>
          <CardDescription>Your available lab service credits</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium">
              {userMembership.credits_remaining} of {creditsTotal} credits remaining
            </span>
            <span className="text-sm text-muted-foreground">
              {Math.round(usagePercentage)}% used
            </span>
          </div>
          <Progress value={usagePercentage} className="h-2" />
          
          <p className="text-sm text-muted-foreground mt-2">
            Your credits will renew on {new Date(userMembership.next_renewal).toLocaleDateString()}.
          </p>
        </CardContent>
      </Card>
    );
  }

  // For shared plans (Individual +1 and Family)
  if (creditPool) {
    const usagePercentage = (creditPool.credits_used / creditPool.credits_total) * 100;
    const remainingCredits = creditPool.credits_total - creditPool.credits_used;
    
    return (
      <Card>
        <CardHeader>
          <CardTitle>Shared Credit Usage</CardTitle>
          <CardDescription>Lab service credits for your shared plan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium">
              {remainingCredits} of {creditPool.credits_total} credits remaining
            </span>
            <span className="text-sm text-muted-foreground">
              {Math.round(usagePercentage)}% used
            </span>
          </div>
          <Progress value={usagePercentage} className="h-2" />
          
          <p className="text-sm text-muted-foreground mt-2">
            Your shared credits will renew on {new Date(creditPool.next_renewal).toLocaleDateString()}.
          </p>
        </CardContent>
      </Card>
    );
  }

  return null;
};

export default CreditUsage;
