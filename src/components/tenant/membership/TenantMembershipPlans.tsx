
import React, { useEffect, useState } from 'react';
import { Tenant, TenantMembershipPlan } from '@/types/tenant';
import { useTenantMembershipPlans } from '@/hooks/tenant/useTenantMembershipPlans';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Edit, Trash2, Check, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import TenantMembershipPlanDialog from './TenantMembershipPlanDialog';

interface TenantMembershipPlansProps {
  tenant: Tenant;
}

const TenantMembershipPlans: React.FC<TenantMembershipPlansProps> = ({ tenant }) => {
  const { 
    membershipPlans, 
    isLoading, 
    getTenantMembershipPlans, 
    addTenantMembershipPlan, 
    updateTenantMembershipPlan, 
    deleteTenantMembershipPlan 
  } = useTenantMembershipPlans();
  
  const [planToEdit, setPlanToEdit] = useState<TenantMembershipPlan | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  useEffect(() => {
    getTenantMembershipPlans();
  }, [tenant.id]);
  
  const handleAddPlan = () => {
    setPlanToEdit(null);
    setIsDialogOpen(true);
  };
  
  const handleEditPlan = (plan: TenantMembershipPlan) => {
    setPlanToEdit(plan);
    setIsDialogOpen(true);
  };
  
  const handleDeletePlan = async (id: string) => {
    if(window.confirm('Are you sure you want to delete this membership plan?')) {
      await deleteTenantMembershipPlan(id);
    }
  };

  const handleSavePlan = async (planData: Partial<TenantMembershipPlan>) => {
    if (planToEdit) {
      await updateTenantMembershipPlan(planToEdit.id, planData);
    } else {
      await addTenantMembershipPlan(planData);
    }
    setIsDialogOpen(false);
  };
  
  const handleToggleActive = async (plan: TenantMembershipPlan) => {
    await updateTenantMembershipPlan(plan.id, { is_active: !plan.is_active });
  };
  
  if (isLoading && membershipPlans.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Membership Plans</h2>
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Membership Plans</h2>
        <Button onClick={handleAddPlan}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Plan
        </Button>
      </div>
      
      {membershipPlans.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {membershipPlans.map((plan) => (
            <Card key={plan.id} className={`overflow-hidden border-2 ${plan.is_active ? '' : 'opacity-70'}`}>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    {plan.description && (
                      <CardDescription className="mt-1">{plan.description}</CardDescription>
                    )}
                  </div>
                  <Badge variant={plan.is_active ? "default" : "outline"}>
                    {plan.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-2xl font-bold">
                      {formatCurrency(plan.monthly_price)} <span className="text-sm font-normal text-muted-foreground">/ month</span>
                    </p>
                    {plan.annual_price && (
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(plan.annual_price)} billed annually
                      </p>
                    )}
                  </div>
                  
                  <ul className="space-y-2">
                    <li className="flex items-center">
                      <Check className="h-4 w-4 mr-2 text-green-500" />
                      <span>{plan.credits_per_interval} credits per interval</span>
                    </li>
                    <li className="flex items-center">
                      <Users className="h-4 w-4 mr-2" />
                      <span>Up to {plan.max_users} {plan.max_users === 1 ? 'user' : 'users'}</span>
                    </li>
                  </ul>
                </div>
              </CardContent>
              
              <CardFooter className="flex justify-between border-t pt-4">
                <div className="flex items-center space-x-2">
                  <Switch 
                    checked={plan.is_active} 
                    onCheckedChange={() => handleToggleActive(plan)}
                    id={`active-${plan.id}`}
                  />
                  <Label htmlFor={`active-${plan.id}`} className="text-sm">
                    {plan.is_active ? 'Active' : 'Inactive'}
                  </Label>
                </div>
                <div className="flex space-x-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEditPlan(plan)}>
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDeletePlan(plan.id)}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No Membership Plans</CardTitle>
            <CardDescription>
              You haven't created any membership plans yet. Get started by adding your first membership plan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleAddPlan} className="w-full">
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Your First Membership Plan
            </Button>
          </CardContent>
        </Card>
      )}
      
      <TenantMembershipPlanDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSave={handleSavePlan}
        plan={planToEdit}
      />
    </div>
  );
};

// Import at the top but place here for brevity
import { Label } from '@/components/ui/label';

export default TenantMembershipPlans;
