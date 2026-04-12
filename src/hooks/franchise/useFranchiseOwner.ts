
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface FranchiseOwner {
  id: string;
  user_id: string;
  company_name: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  territory_ids?: string[];
  created_at: string;
  updated_at?: string;
}

export const useFranchiseOwners = () => {
  const { toast } = useToast();
  
  return useQuery({
    queryKey: ['franchise_owners'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('franchise_owners')
          .select(`
            id, 
            user_id,
            company_name,
            contact_email,
            contact_phone,
            address
          `);
        
        if (error) throw error;
        return data as FranchiseOwner[] || [];
      } catch (error) {
        console.error("Error fetching franchise owners:", error);
        toast({
          title: "Error",
          description: "Failed to fetch franchise owners",
          variant: "destructive"
        });
        return [];
      }
    }
  });
};

export const useFranchiseOwnerById = (id: string | undefined) => {
  return useQuery({
    queryKey: ['franchise_owners', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('franchise_owners')
        .select(`
          *,
          territories (
            id,
            name,
            state,
            city,
            status
          )
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
};

export const useFetchCurrentFranchiseOwner = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  return useQuery({
    queryKey: ['current_franchise_owner', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      try {
        const { data, error } = await supabase
          .from('franchise_owners')
          .select(`
            id, 
            company_name,
            contact_email,
            contact_phone,
            address
          `)
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (error) throw error;
        
        return data;
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to fetch franchise owner details",
          variant: "destructive"
        });
        return null;
      }
    },
    enabled: !!user?.id
  });
};
