
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { toast } from '@/components/ui/sonner';
import { AppointmentData } from '@/types/tenant';

interface AppointmentQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  searchTerm?: string;
}

export function useTenantAppointments() {
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const { currentTenant } = useTenant();

  /**
   * Build the base query for appointments
   */
  const buildAppointmentQuery = (params: AppointmentQuery) => {
    const { status, startDate, endDate } = params;
    
    let query = supabase
      .from("appointments")
      .select(`
        id,
        patient_id,
        appointment_date,
        status,
        address,
        notes
      `, { count: 'exact' })
      .eq("tenant_id", currentTenant?.id)
      .order("appointment_date", { ascending: false });
    
    // Apply date filters
    if (startDate) {
      query = query.gte("appointment_date", startDate.toISOString());
    }
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.lte("appointment_date", endOfDay.toISOString());
    }
    
    // Apply status filter
    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    
    return query;
  };
  
  /**
   * Fetch patient profiles for a list of appointments
   */
  const fetchPatientProfiles = async (appointmentsData: any[]) => {
    if (!appointmentsData || appointmentsData.length === 0) return [];
    
    const patientIds = appointmentsData.map(appointment => appointment.patient_id);
    const { data: profilesData, error: profilesError } = await supabase
      .from("user_profiles")
      .select("id, full_name, phone")
      .in("id", patientIds);
      
    if (profilesError) {
      console.error("Error fetching patient profiles:", profilesError);
      return appointmentsData.map(appointment => ({
        ...appointment,
        patient_name: "Unknown",
        patient_phone: "No phone"
      }));
    }
    
    // Create a map of patient profiles for quick lookup
    const profilesMap = new Map();
    profilesData?.forEach(profile => {
      profilesMap.set(profile.id, profile);
    });
    
    return appointmentsData.map(appointment => {
      const patientProfile = profilesMap.get(appointment.patient_id);
      return {
        ...appointment,
        patient_name: patientProfile?.full_name || "Unknown",
        patient_phone: patientProfile?.phone || "No phone"
      };
    });
  };
  
  /**
   * Apply search filter to appointments data
   */
  const applySearchFilter = (data: any[], searchTerm?: string) => {
    if (!searchTerm) return data;
    
    return data.filter(appointment => {
      const patientName = appointment.patient_name?.toLowerCase() || "";
      const address = appointment.address?.toLowerCase() || "";
      const term = searchTerm.toLowerCase();
      
      return patientName.includes(term) || address.includes(term);
    });
  };
  
  /**
   * Fetch appointments with optional filters
   */
  const fetchAppointments = async ({
    page = 1,
    pageSize = 10,
    status,
    startDate,
    endDate,
    searchTerm
  }: AppointmentQuery = {}) => {
    if (!currentTenant?.id) return;
    
    setIsLoading(true);
    try {
      // Build query
      const query = buildAppointmentQuery({ status, startDate, endDate });
      
      // Apply pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const paginatedQuery = query.range(from, to);
      
      // Execute the query
      const { data, error, count } = await paginatedQuery;
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        // Enhance appointments with patient profiles
        const enhancedAppointments = await fetchPatientProfiles(data);
        
        // Apply search filter if provided
        const filteredData = applySearchFilter(enhancedAppointments, searchTerm);
        
        setAppointments(filteredData);
      } else {
        setAppointments([]);
      }
      
      if (count !== null) {
        setPagination({
          page,
          pageSize,
          total: count
        });
      }
    } catch (error) {
      console.error("Error fetching appointments:", error);
      toast.error("Failed to load appointments");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Update the status of an appointment
   */
  const updateAppointmentStatus = async (appointmentId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("appointments")
        .update({ status: newStatus })
        .eq("id", appointmentId);
      
      if (error) throw error;
      
      // Update local state
      setAppointments(appointments.map(app => 
        app.id === appointmentId ? { ...app, status: newStatus } : app
      ));
      
      // Send notifications based on the status change
      await sendStatusChangeNotification(appointmentId, newStatus);
      
      return true;
    } catch (error) {
      console.error("Error updating appointment status:", error);
      toast.error("Failed to update appointment status");
      return false;
    }
  };
  
  /**
   * Delete an appointment
   */
  const deleteAppointment = async (appointmentId: string) => {
    try {
      const { error } = await supabase
        .from("appointments")
        .delete()
        .eq("id", appointmentId);
      
      if (error) throw error;
      
      // Update local state
      setAppointments(appointments.filter(app => app.id !== appointmentId));
      
      return true;
    } catch (error) {
      console.error("Error deleting appointment:", error);
      toast.error("Failed to delete appointment");
      return false;
    }
  };
  
  /**
   * Send notifications when appointment status changes
   */
  const sendStatusChangeNotification = async (appointmentId: string, notificationType: string) => {
    // Only send notifications for certain status changes
    if (!['cancelled', 'completed'].includes(notificationType)) return;
    
    try {
      const customMessage = notificationType === 'completed' 
        ? 'Thank you for completing your appointment. We hope everything went well!'
        : undefined;
        
      await supabase.functions.invoke(
        'send-tenant-appointment-notification',
        {
          body: {
            appointmentId,
            notificationType: notificationType === 'cancelled' ? 'cancellation' : 'confirmation',
            customMessage
          }
        }
      );
    } catch (notificationErr) {
      console.error(`Error sending ${notificationType} notification:`, notificationErr);
      // Continue anyway - don't block the status update
    }
  };

  return {
    appointments,
    pagination,
    isLoading,
    fetchAppointments,
    updateAppointmentStatus,
    deleteAppointment
  };
}
