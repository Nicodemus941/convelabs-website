
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const useCheckUserRole = () => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['user_role', user?.id],
    queryFn: async () => {
      if (!user?.id) return { isAdmin: false };
      
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .single();
        
        if (error) throw error;
        
        const isAdmin = data?.role === 'admin' || data?.role === 'super_admin';
        return { isAdmin, role: data?.role };
      } catch (error) {
        console.error("Error checking user role:", error);
        return { isAdmin: false };
      }
    },
    enabled: !!user?.id
  });
};
