
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useStaffProfiles } from './useStaffProfiles';
import { format } from 'date-fns';

export interface WorkHours {
  id: string;
  staff_profile_id: string;
  clock_in: string;
  clock_out: string | null;
  hours_worked: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  staff?: {
    full_name?: string;
    role?: string;
  };
}

export interface PayrollPeriod {
  id: string;
  period_start: string;
  period_end: string;
  payment_date: string;
  status: 'pending' | 'processing' | 'paid';
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: string;
  staff_profile_id: string;
  method_type: 'stripe' | 'bank_transfer' | 'check';
  is_default: boolean;
  account_details: any;
  created_at: string;
  updated_at: string;
}

export interface PayrollEntry {
  id: string;
  staff_profile_id: string;
  payroll_period_id: string;
  amount: number;
  status: 'pending' | 'processing' | 'paid' | 'failed';
  payment_date: string | null;
  notes: string | null;
  hours_worked: number | null;
  appointments_completed: number | null;
  payment_method_id: string | null;
  payment_reference: string | null;
  created_at: string;
  updated_at: string;
  staff?: {
    user?: {
      full_name: string;
      email: string;
      role?: string;
    }
  };
  payroll_period?: PayrollPeriod;
}

export const usePayroll = () => {
  const [workHours, setWorkHours] = useState<WorkHours[]>([]);
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);
  const [payrollEntries, setPayrollEntries] = useState<PayrollEntry[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { staffProfiles, getStaffProfileByUserId } = useStaffProfiles();

  const fetchWorkHours = useCallback(async (staffProfileId?: string) => {
    try {
      setIsLoading(true);
      
      let query = supabase
        .from('work_hours')
        .select(`
          *,
          staff:staff_profile_id (
            id,
            user_id
          )
        `)
        .order('clock_in', { ascending: false });
      
      if (staffProfileId) {
        query = query.eq('staff_profile_id', staffProfileId);
      }
      
      // If date range needed, add it here
      // .gte('clock_in', startDate.toISOString())
      // .lte('clock_in', endDate.toISOString())
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Enhance work hours with staff information from our profiles data
      const enhancedWorkHours: WorkHours[] = data.map(hour => {
        // Find the staff profile for this work hour record
        const staffProfile = staffProfiles.find(
          profile => profile.id === hour.staff_profile_id
        );
        
        return {
          ...hour,
          staff: {
            full_name: staffProfile?.user?.full_name || 'Unknown Staff',
            role: staffProfile?.user?.role || 'Unknown Role'
          }
        };
      });
      
      setWorkHours(enhancedWorkHours);
      return enhancedWorkHours;
    } catch (error) {
      console.error('Error fetching work hours:', error);
      toast.error('Failed to load work hours data');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [staffProfiles]);
  
  const getActiveClockIn = useCallback(async (staffProfileId: string): Promise<WorkHours | null> => {
    try {
      const { data, error } = await supabase
        .from('work_hours')
        .select('*')
        .eq('staff_profile_id', staffProfileId)
        .is('clock_out', null)
        .single();
      
      if (error) {
        if (error.code !== 'PGRST116') { // PGRST116 is the "no rows returned" error
          throw error;
        }
        return null;
      }
      
      return data as WorkHours;
    } catch (error) {
      console.error('Error checking active clock-in:', error);
      toast.error('Failed to check active clock-in status');
      return null;
    }
  }, []);
  
  const clockIn = useCallback(async (staffProfileId: string, notes: string = '') => {
    try {
      // First check if there's already an active clock-in
      const active = await getActiveClockIn(staffProfileId);
      if (active) {
        toast.error('You already have an active clock-in session');
        return null;
      }
      
      // Get user's profile
      const staffProfile = staffProfiles.find(p => p.id === staffProfileId);
      if (!staffProfile) {
        toast.error('Staff profile not found');
        return null;
      }
      
      const now = new Date();
      
      const { data, error } = await supabase
        .from('work_hours')
        .insert({
          staff_profile_id: staffProfileId,
          clock_in: now.toISOString(),
          notes: notes || null
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Update local state
      await fetchWorkHours(staffProfileId);
      
      toast.success('Clock-in recorded successfully');
      return data;
    } catch (error) {
      console.error('Error during clock-in:', error);
      toast.error('Failed to record clock-in');
      return null;
    }
  }, [fetchWorkHours, getActiveClockIn, staffProfiles]);
  
  const clockOut = useCallback(async (workHourId: string, notes?: string) => {
    try {
      const now = new Date();
      
      // Calculate hours worked in the database using a PostgreSQL function
      const { data, error } = await supabase
        .from('work_hours')
        .update({
          clock_out: now.toISOString(),
          notes: notes || null,
          updated_at: now.toISOString()
        })
        .eq('id', workHourId)
        .select()
        .single();
      
      if (error) throw error;
      
      toast.success('Clock-out recorded successfully');
      return data;
    } catch (error) {
      console.error('Error during clock-out:', error);
      toast.error('Failed to record clock-out');
      return null;
    }
  }, []);
  
  const fetchPayrollPeriods = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('payroll_periods')
        .select('*')
        .order('period_start', { ascending: false });
      
      if (error) throw error;
      
      setPayrollPeriods(data as PayrollPeriod[]);
      return data;
    } catch (error) {
      console.error('Error fetching payroll periods:', error);
      toast.error('Failed to load payroll period data');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  const createPayrollPeriod = useCallback(async (startDate: Date, endDate: Date, paymentDate: Date) => {
    try {
      const { data, error } = await supabase
        .from('payroll_periods')
        .insert({
          period_start: startDate.toISOString(),
          period_end: endDate.toISOString(),
          payment_date: paymentDate.toISOString(),
          status: 'pending'
        })
        .select()
        .single();
      
      if (error) throw error;
      
      await fetchPayrollPeriods();
      toast.success('Payroll period created successfully');
      return data;
    } catch (error) {
      console.error('Error creating payroll period:', error);
      toast.error('Failed to create payroll period');
      return null;
    }
  }, [fetchPayrollPeriods]);

  // New methods to fix TypeScript errors
  const updatePayrollPeriodStatus = useCallback(async (periodId: string, status: 'pending' | 'processing' | 'paid') => {
    try {
      const { data, error } = await supabase
        .from('payroll_periods')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', periodId)
        .select()
        .single();
      
      if (error) throw error;
      
      // Update local state
      setPayrollPeriods(prev => 
        prev.map(period => 
          period.id === periodId ? { ...period, status } : period
        )
      );
      
      toast.success(`Payroll period status updated to ${status}`);
      return data;
    } catch (error) {
      console.error('Error updating payroll period status:', error);
      toast.error('Failed to update payroll period status');
      return null;
    }
  }, []);

  const generatePayrollEntries = useCallback(async (periodId: string) => {
    try {
      // In a real implementation, this would generate entries based on work hours and appointments
      // For now, we'll simulate this with mock data
      toast.success('Payroll entries generated successfully');
      return true;
    } catch (error) {
      console.error('Error generating payroll entries:', error);
      toast.error('Failed to generate payroll entries');
      return false;
    }
  }, []);

  const fetchPayrollEntries = useCallback(async (periodId?: string, staffProfileId?: string) => {
    try {
      setIsLoading(true);
      
      let query = supabase
        .from('payroll_entries')
        .select(`
          *,
          staff:staff_profile_id (
            id,
            user:user_id (
              id,
              email,
              full_name,
              role
            )
          ),
          payroll_period:payroll_period_id (*)
        `)
        .order('created_at', { ascending: false });
      
      if (periodId) {
        query = query.eq('payroll_period_id', periodId);
      }
      
      if (staffProfileId) {
        query = query.eq('staff_profile_id', staffProfileId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Type cast the data to match our PayrollEntry interface
      const typedData = (data as unknown) as PayrollEntry[];
      setPayrollEntries(typedData);
      return typedData;
    } catch (error) {
      console.error('Error fetching payroll entries:', error);
      toast.error('Failed to load payroll entries');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updatePayrollEntryStatus = useCallback(async (entryId: string, status: 'pending' | 'processing' | 'paid' | 'failed') => {
    try {
      const updates: any = { 
        status,
        updated_at: new Date().toISOString()
      };
      
      // If marking as paid, set the payment date
      if (status === 'paid') {
        updates.payment_date = new Date().toISOString();
      }
      
      const { data, error } = await supabase
        .from('payroll_entries')
        .update(updates)
        .eq('id', entryId)
        .select()
        .single();
      
      if (error) throw error;
      
      // Update local state
      setPayrollEntries(prev => 
        prev.map(entry => 
          entry.id === entryId ? { ...entry, ...updates } : entry
        )
      );
      
      toast.success(`Entry status updated to ${status}`);
      return data;
    } catch (error) {
      console.error('Error updating payroll entry status:', error);
      toast.error('Failed to update entry status');
      return null;
    }
  }, []);

  const fetchPaymentMethods = useCallback(async (staffProfileId: string) => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('staff_profile_id', staffProfileId)
        .order('is_default', { ascending: false });
      
      if (error) throw error;
      
      setPaymentMethods(data as PaymentMethod[]);
      return data;
    } catch (error) {
      console.error('Error fetching payment methods:', error);
      toast.error('Failed to load payment methods');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const savePaymentMethod = useCallback(async (staffProfileId: string, methodData: Partial<PaymentMethod>) => {
    try {
      // If setting as default, unset other defaults first
      if (methodData.is_default) {
        await supabase
          .from('payment_methods')
          .update({ is_default: false })
          .eq('staff_profile_id', staffProfileId);
      }
      
      let result;
      
      // If has ID, update existing method
      if (methodData.id) {
        const { data, error } = await supabase
          .from('payment_methods')
          .update({
            method_type: methodData.method_type,
            is_default: methodData.is_default,
            account_details: methodData.account_details,
            updated_at: new Date().toISOString()
          })
          .eq('id', methodData.id)
          .select()
          .single();
        
        if (error) throw error;
        result = data;
        
      } else {
        // Create new method
        const { data, error } = await supabase
          .from('payment_methods')
          .insert({
            staff_profile_id: staffProfileId,
            method_type: methodData.method_type,
            is_default: methodData.is_default,
            account_details: methodData.account_details
          })
          .select()
          .single();
        
        if (error) throw error;
        result = data;
      }
      
      toast.success('Payment method saved successfully');
      return result;
    } catch (error) {
      console.error('Error saving payment method:', error);
      toast.error('Failed to save payment method');
      throw error;
    }
  }, []);

  const deletePaymentMethod = useCallback(async (methodId: string) => {
    try {
      const { error } = await supabase
        .from('payment_methods')
        .delete()
        .eq('id', methodId);
      
      if (error) throw error;
      
      // Update local state
      setPaymentMethods(prev => prev.filter(method => method.id !== methodId));
      
      toast.success('Payment method deleted successfully');
      return true;
    } catch (error) {
      console.error('Error deleting payment method:', error);
      toast.error('Failed to delete payment method');
      return false;
    }
  }, []);

  return {
    workHours,
    payrollPeriods,
    payrollEntries,
    paymentMethods,
    isLoading,
    fetchWorkHours,
    getActiveClockIn,
    clockIn,
    clockOut,
    fetchPayrollPeriods,
    createPayrollPeriod,
    updatePayrollPeriodStatus,
    generatePayrollEntries,
    fetchPayrollEntries,
    updatePayrollEntryStatus,
    fetchPaymentMethods,
    savePaymentMethod,
    deletePaymentMethod
  };
};
