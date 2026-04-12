
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

export interface FranchiseStaff {
  id: string;
  full_name: string;
  role: string;
  email: string;
  territory_id?: string;
  territories?: { name: string };
  franchise_owner_id: string;
}

export const useFranchiseStaff = (franchiseOwnerId: string | undefined) => {
  const { toast } = useToast();
  
  return useQuery({
    queryKey: ['franchise_staff', franchiseOwnerId],
    queryFn: async () => {
      if (!franchiseOwnerId) return [];
      
      try {
        const { data, error } = await supabase
          .from('franchise_staff')
          .select(`
            id,
            full_name,
            role,
            email,
            territory_id,
            territories (name)
          `)
          .eq('franchise_owner_id', franchiseOwnerId);
        
        if (error) throw error;
        return data as FranchiseStaff[];
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to fetch franchise staff",
          variant: "destructive"
        });
        return [];
      }
    },
    enabled: !!franchiseOwnerId
  });
};
