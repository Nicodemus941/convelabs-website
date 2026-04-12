
import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface UserPayment {
  id: string;
  user_id: string;
  session_id: string;
  amount: number;
  status: string;
  verification_date: string;
  created_at: string;
}

export function usePayment() {
  const [isLoading, setIsLoading] = useState(false);
  const [payments, setPayments] = useState<UserPayment[]>([]);

  const getUserPayments = async (userId: string) => {
    try {
      setIsLoading(true);
      
      // Since the user_payments table doesn't exist yet, return mock data
      // In a real implementation, this would query the actual table
      console.log(`[Mock] Fetching payment history for user: ${userId}`);
      
      // Generate some mock data
      const mockPayments: UserPayment[] = [
        {
          id: 'mock-payment-1',
          user_id: userId,
          session_id: 'mock-session-123',
          amount: 15000,
          status: 'completed',
          verification_date: new Date().toISOString(),
          created_at: new Date().toISOString()
        },
        {
          id: 'mock-payment-2',
          user_id: userId,
          session_id: 'mock-session-456',
          amount: 10000,
          status: 'completed',
          verification_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        }
      ];
      
      setPayments(mockPayments);
      return mockPayments;
      
    } catch (error) {
      console.error('Error in getUserPayments:', error);
      toast.error('Failed to load payment history');
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  return {
    payments,
    isLoading,
    getUserPayments
  };
}
