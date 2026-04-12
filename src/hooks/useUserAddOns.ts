
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/sonner';

interface AddOn {
  id: string;
  name: string;
  description: string;
  price: number;
  is_supernova_benefit?: boolean;
}

interface UserAddOn {
  id: string;
  user_id: string;
  add_on_id: string;
  is_active: boolean;
  is_supernova_benefit: boolean;
  created_at: string;
  updated_at: string;
  add_on_details?: AddOn;
}

export const useUserAddOns = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Fetch user add-ons
  const {
    data: userAddOns,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['userAddOns', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      // Get user add-ons
      const { data: addOns, error } = await supabase
        .from('user_add_ons')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true);
      
      if (error) {
        console.error('Error fetching user add-ons:', error);
        throw error;
      }
      
      // Get add-on details
      if (addOns.length > 0) {
        const addOnIds = addOns.map(addon => addon.add_on_id);
        
        const { data: addOnDetails, error: detailsError } = await supabase
          .from('add_on_prices')
          .select('*')
          .in('id', addOnIds);
        
        if (detailsError) {
          console.error('Error fetching add-on details:', detailsError);
          throw detailsError;
        }
        
        // Combine add-on details with user add-ons
        return addOns.map(userAddOn => {
          const details = addOnDetails.find(detail => detail.id === userAddOn.add_on_id);
          return {
            ...userAddOn,
            add_on_details: details
          };
        }) as UserAddOn[];
      }
      
      return addOns as UserAddOn[];
    },
    enabled: !!user?.id,
  });
  
  // Add add-on
  const addAddOn = useMutation({
    mutationFn: async (addOnId: string) => {
      if (!user?.id) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('user_add_ons')
        .insert([{
          user_id: user.id,
          add_on_id: addOnId,
          is_active: true,
          is_supernova_benefit: false
        }])
        .select();
      
      if (error) {
        console.error('Error adding add-on:', error);
        throw error;
      }
      
      return data?.[0];
    },
    onSuccess: () => {
      toast.success('Add-on added successfully');
      queryClient.invalidateQueries({ queryKey: ['userAddOns', user?.id] });
    },
    onError: (error) => {
      toast.error(`Failed to add add-on: ${error.message}`);
    }
  });
  
  // Remove add-on
  const removeAddOn = useMutation({
    mutationFn: async (addOnId: string) => {
      if (!user?.id) throw new Error('User not authenticated');
      
      // Only update is_active to false instead of deleting
      const { data, error } = await supabase
        .from('user_add_ons')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('add_on_id', addOnId)
        .select();
      
      if (error) {
        console.error('Error removing add-on:', error);
        throw error;
      }
      
      return data?.[0];
    },
    onSuccess: () => {
      toast.success('Add-on removed successfully');
      queryClient.invalidateQueries({ queryKey: ['userAddOns', user?.id] });
    },
    onError: (error) => {
      toast.error(`Failed to remove add-on: ${error.message}`);
    }
  });
  
  // Check if user has a specific add-on
  const hasAddOn = (addOnId: string): boolean => {
    if (!userAddOns) return false;
    return userAddOns.some(addon => addon.add_on_id === addOnId && addon.is_active);
  };
  
  // Get all add-ons that are supernova benefits
  const supernovaBenefits = userAddOns?.filter(addon => addon.is_supernova_benefit) || [];
  
  return {
    userAddOns,
    supernovaBenefits,
    isLoading,
    error,
    addAddOn,
    removeAddOn,
    hasAddOn,
    refetch
  };
};
