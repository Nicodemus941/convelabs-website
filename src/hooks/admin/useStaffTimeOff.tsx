import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { StaffTimeOffRequest, StaffDateBlock } from '@/types/adminTypes';
import { toast } from 'sonner';

export function useStaffTimeOff() {
  const [timeOffRequests, setTimeOffRequests] = useState<StaffTimeOffRequest[]>([]);
  const [dateBlocks, setDateBlocks] = useState<StaffDateBlock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeOffRequests = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('staff_time_off_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTimeOffRequests(data as StaffTimeOffRequest[] || []);
    } catch (err: any) {
      console.error('Error fetching time off requests:', err);
      setError(err.message);
      toast.error('Failed to fetch time off requests');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDateBlocks = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('staff_date_blocks')
        .select('*')
        .order('blocked_date', { ascending: true });

      if (error) throw error;
      setDateBlocks(data || []);
    } catch (err: any) {
      console.error('Error fetching date blocks:', err);
      setError(err.message);
      toast.error('Failed to fetch date blocks');
    } finally {
      setIsLoading(false);
    }
  };

  const createTimeOffRequest = async (requestData: any) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('staff_time_off_requests')
        .insert(requestData)
        .select()
        .single();

      if (error) throw error;
      
      toast.success('Time off request submitted successfully');
      fetchTimeOffRequests();
      return data;
    } catch (err: any) {
      console.error('Error creating time off request:', err);
      toast.error('Failed to submit time off request');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updateTimeOffRequest = async (id: string, updates: Partial<StaffTimeOffRequest>) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('staff_time_off_requests')
        .update({
          ...updates,
          reviewed_at: updates.status ? new Date().toISOString() : undefined
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      
      toast.success('Time off request updated successfully');
      fetchTimeOffRequests();
      return data;
    } catch (err: any) {
      console.error('Error updating time off request:', err);
      toast.error('Failed to update time off request');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const createDateBlock = async (blockData: any) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('staff_date_blocks')
        .insert(blockData)
        .select()
        .single();

      if (error) throw error;
      
      toast.success('Date block created successfully');
      fetchDateBlocks();
      return data;
    } catch (err: any) {
      console.error('Error creating date block:', err);
      toast.error('Failed to create date block');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const removeDateBlock = async (id: string) => {
    try {
      setIsLoading(true);
      const { error } = await supabase
        .from('staff_date_blocks')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Date block removed successfully');
      fetchDateBlocks();
    } catch (err: any) {
      console.error('Error removing date block:', err);
      toast.error('Failed to remove date block');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTimeOffRequests();
    fetchDateBlocks();
  }, []);

  return {
    timeOffRequests,
    dateBlocks,
    isLoading,
    error,
    fetchTimeOffRequests,
    fetchDateBlocks,
    createTimeOffRequest,
    updateTimeOffRequest,
    createDateBlock,
    removeDateBlock
  };
}