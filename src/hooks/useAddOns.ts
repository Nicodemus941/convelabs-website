
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

// Define the interface matching the add_on_prices table
export interface AddOn {
  id: string;
  name: string;
  description: string;
  price: number;
  category?: string;
  is_active: boolean;
}

export const useAddOns = () => {
  const {
    data: addOns,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['addOns'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('add_on_prices')
          .select('*')
          .eq('active', true);

        if (error) {
          console.error('Error fetching add-ons:', error);
          return [] as AddOn[];
        }

        return data.map(item => ({
          id: item.id,
          name: item.name,
          description: item.description || '',
          price: item.price,
          category: 'addon',
          is_active: item.active
        })) as AddOn[];
      } catch (error) {
        console.error('Error in addOns query:', error);
        return [] as AddOn[];
      }
    },
    retry: 1,
  });

  return {
    addOns,
    isLoading,
    error,
    refetch
  };
};
