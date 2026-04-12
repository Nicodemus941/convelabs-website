
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

export const formatCreditCount = (count: number): string => {
  return `${count} ${count === 1 ? 'credit' : 'credits'}`;
};

export const formatRolloverExpiration = (expirationDate: string | null): string => {
  if (!expirationDate) return '';
  
  const expiry = new Date(expirationDate);
  const now = new Date();
  const diffTime = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return 'expired';
  if (diffDays === 0) return 'expires today';
  if (diffDays === 1) return 'expires tomorrow';
  if (diffDays < 30) return `expires in ${diffDays} days`;
  
  const diffMonths = Math.floor(diffDays / 30);
  return `expires in ${diffMonths} ${diffMonths === 1 ? 'month' : 'months'}`;
};

export const purchaseCreditPack = async (userId: string, credits: number, price: number) => {
  try {
    const { data, error } = await supabase.functions.invoke('create-credit-pack-checkout', {
      body: { userId, credits, price }
    });

    if (error) throw error;
    
    if (data?.url) {
      window.location.href = data.url;
    } else {
      throw new Error('No checkout URL returned');
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error purchasing credit pack:', error);
    toast.error('Failed to process credit pack purchase');
    return { success: false, error };
  }
};

export const checkIfCreditsAvailable = async (userId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .rpc('check_available_credits', { user_id: userId });

    if (error) throw error;
    
    return !!data;
  } catch (error) {
    console.error('Error checking credits availability:', error);
    return false;
  }
};
