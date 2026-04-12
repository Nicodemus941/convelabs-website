
import { useState } from 'react';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { TenantMembershipPlan } from '@/types/tenant';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useTenantMembershipPlans() {
  const { currentTenant } = useTenant();
  const [isLoading, setIsLoading] = useState(false);
  const [membershipPlans, setMembershipPlans] = useState<TenantMembershipPlan[]>([]);

  // Get all membership plans for the tenant
  const getTenantMembershipPlans = async (): Promise<TenantMembershipPlan[]> => {
    try {
      setIsLoading(true);
      if (!currentTenant) throw new Error("No organization selected");

      const { data, error } = await supabase
        .from('tenant_membership_plans')
        .select('*')
        .eq('tenant_id', currentTenant.id);

      if (error) throw error;
      
      setMembershipPlans(data as TenantMembershipPlan[]);
      setIsLoading(false);
      return data as TenantMembershipPlan[];
    } catch (error) {
      setIsLoading(false);
      toast.error(`Failed to fetch membership plans: ${(error as Error).message}`);
      return [];
    }
  };

  // Add a new membership plan
  const addTenantMembershipPlan = async (planData: Partial<TenantMembershipPlan>): Promise<TenantMembershipPlan | null> => {
    try {
      setIsLoading(true);
      if (!currentTenant) throw new Error("No organization selected");

      const newPlan = {
        ...planData,
        tenant_id: currentTenant.id,
        monthly_price: planData.monthly_price || 0,
        name: planData.name || 'Unnamed Plan',
      };

      const { data, error } = await supabase
        .from('tenant_membership_plans')
        .insert(newPlan)
        .select()
        .single();

      if (error) throw error;

      setMembershipPlans([...membershipPlans, data as TenantMembershipPlan]);
      setIsLoading(false);
      toast.success("Membership plan added successfully");
      return data as TenantMembershipPlan;
    } catch (error) {
      setIsLoading(false);
      toast.error(`Failed to add membership plan: ${(error as Error).message}`);
      return null;
    }
  };

  // Update a membership plan
  const updateTenantMembershipPlan = async (id: string, planData: Partial<TenantMembershipPlan>): Promise<TenantMembershipPlan | null> => {
    try {
      setIsLoading(true);
      if (!currentTenant) throw new Error("No organization selected");

      const { data, error } = await supabase
        .from('tenant_membership_plans')
        .update(planData)
        .eq('id', id)
        .eq('tenant_id', currentTenant.id)
        .select()
        .single();

      if (error) throw error;

      setMembershipPlans(membershipPlans.map(plan => plan.id === id ? (data as TenantMembershipPlan) : plan));
      setIsLoading(false);
      toast.success("Membership plan updated successfully");
      return data as TenantMembershipPlan;
    } catch (error) {
      setIsLoading(false);
      toast.error(`Failed to update membership plan: ${(error as Error).message}`);
      return null;
    }
  };

  // Delete a membership plan
  const deleteTenantMembershipPlan = async (id: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      if (!currentTenant) throw new Error("No organization selected");

      const { error } = await supabase
        .from('tenant_membership_plans')
        .delete()
        .eq('id', id)
        .eq('tenant_id', currentTenant.id);

      if (error) throw error;

      setMembershipPlans(membershipPlans.filter(plan => plan.id !== id));
      setIsLoading(false);
      toast.success("Membership plan deleted successfully");
      return true;
    } catch (error) {
      setIsLoading(false);
      toast.error(`Failed to delete membership plan: ${(error as Error).message}`);
      return false;
    }
  };

  return {
    membershipPlans,
    isLoading,
    getTenantMembershipPlans,
    addTenantMembershipPlan,
    updateTenantMembershipPlan,
    deleteTenantMembershipPlan
  };
}
