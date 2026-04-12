
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { Appointment, BookingFormValues, BookingResult } from '@/types/appointmentTypes';
import { toast } from 'sonner';
import { findAvailablePhlebotomist, updateAppointmentChain } from '@/services/phlebotomistAssignmentService';
import * as appointmentService from '@/services/appointments/appointmentService';
import { mapAppointmentData } from '@/services/appointments/appointmentMappers';
import { getCoordinatesFromFormData } from '@/services/appointments/locationUtils';

export function useAppointments() {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  // Get all appointments for the current user or tenant
  const getAppointments = async (): Promise<Appointment[]> => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Admin/super_admin see all appointments; patients see only theirs
      const isAdmin = user?.role === 'super_admin' || user?.role === 'office_manager' || user?.role === 'admin';
      const { data, error } = await appointmentService.fetchAppointmentsSimplified(
        currentTenant?.id,
        isAdmin ? undefined : user?.id
      );

      if (error) {
        console.error("Error fetching appointments:", error);
        
        // Set the specific error to display to the user
        setError(error);
        setIsLoading(false);
        setAppointments([]); 
        return [];
      }
      
      if (!data || data.length === 0) {
        console.log("No appointments data returned");
        setAppointments([]);
        setIsLoading(false);
        return [];
      }
      
      console.log("Appointment data received:", data.length, "appointments");
      console.log("Raw appointment data:", data);
      
      // Transform the data into Appointment objects
      const appointmentsData: Appointment[] = data.map(appointment => 
        mapAppointmentData(appointment)
      );
      
      console.log("Transformed appointments:", appointmentsData);
      
      setAppointments(appointmentsData);
      setIsLoading(false);
      return appointmentsData;
    } catch (error) {
      console.error("Exception in getAppointments:", error);
      setError(error as Error);
      setIsLoading(false);
      setAppointments([]); 
      toast.error(`Failed to fetch appointments: ${(error as Error).message}`);
      return [];
    }
  };

  // Get a single appointment by ID
  const getAppointmentById = async (id: string): Promise<Appointment | null> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const { data, error } = await appointmentService.fetchAppointmentById(id);

      if (error) throw error;
      
      // Fetch patient info separately
      const { data: patientData, error: patientError } = await appointmentService.fetchPatientInfo(data!.patient_id);
      
      if (patientError) {
        console.error("Error fetching patient data:", patientError);
      }
      
      const appointment = mapAppointmentData(data, patientData);
      
      setIsLoading(false);
      return appointment;
    } catch (error) {
      console.error("Error in getAppointmentById:", error);
      setError(error as Error);
      setIsLoading(false);
      toast.error(`Failed to fetch appointment: ${(error as Error).message}`);
      return null;
    }
  };

  // Create a new appointment
  const createAppointment = async (formData: BookingFormValues): Promise<BookingResult> => {
    try {
      setIsLoading(true);
      
      console.log("Creating appointment with form data:", formData);
      
      if (!user && !formData.patientDetails.email) {
        throw new Error("User information or patient email is required");
      }
      
      // Format the appointment date and time
      const appointmentDate = new Date(formData.date);
      const [hours, minutes] = formData.time.replace(/\s(AM|PM)/, "").split(":");
      let hoursNum = parseInt(hours);
      
      // Convert 12-hour format to 24-hour format
      if (formData.time.includes("PM") && hoursNum < 12) {
        hoursNum += 12;
      } else if (formData.time.includes("AM") && hoursNum === 12) {
        hoursNum = 0;
      }
      
      // Set the hours and minutes on the appointment date
      appointmentDate.setHours(hoursNum);
      appointmentDate.setMinutes(parseInt(minutes || "0"));
      
      console.log("Formatted appointment time:", appointmentDate.toISOString());
      
      // Find or create patient
      let patientId = user?.id;
      console.log("Current user ID:", patientId);
      
      if (!patientId) {
        patientId = await appointmentService.findOrCreatePatient(
          formData.patientDetails.email,
          formData.patientDetails,
          currentTenant?.id,
          user?.id
        );
      }
      
      if (!patientId) {
        throw new Error("Could not determine patient ID");
      }
      
      // Get coordinates for the address
      const coordinates = await getCoordinatesFromFormData(formData);
      
      // Find an available phlebotomist if coordinates are available
      let phlebotomistId = null;
      if (coordinates.latitude !== null && coordinates.longitude !== null) {
        console.log("Searching for available phlebotomist");
        phlebotomistId = await findAvailablePhlebotomist(
          appointmentDate,
          { latitude: coordinates.latitude, longitude: coordinates.longitude },
          formData.locationDetails.zipCode
        );
        
        console.log("Phlebotomist assignment result:", phlebotomistId || "No phlebotomist available");
      } else {
        console.log("Skipping phlebotomist assignment due to missing coordinates");
      }
      
      // Create the appointment
      const appointment = await appointmentService.createAppointment(
        formData,
        patientId,
        coordinates,
        phlebotomistId,
        appointmentDate,
        currentTenant?.id
      );
      
      console.log("Appointment created successfully:", appointment.id);
      
      // Update appointment chain if a phlebotomist was assigned
      if (phlebotomistId && appointment.id) {
        console.log("Updating appointment chain");
        await updateAppointmentChain(appointment.id);
      }
      
      // Send notifications
      appointmentService.sendAppointmentNotifications(appointment.id);
      
      // Notify admin
      appointmentService.sendAdminNotification(appointment, patientId, phlebotomistId);
      
      setIsLoading(false);
      return { 
        success: true, 
        appointmentId: appointment.id,
        message: `Appointment booked successfully! ${phlebotomistId ? 'A phlebotomist has been assigned.' : 'No phlebotomist was available for immediate assignment.'}` 
      };
    } catch (error) {
      setIsLoading(false);
      console.error("Error booking appointment:", error);
      return { 
        success: false, 
        error: (error as Error).message,
        message: "Failed to book appointment. Please try again." 
      };
    }
  };

  // Update an appointment status
  const updateAppointmentStatus = async (id: string, status: Appointment['status']): Promise<boolean> => {
    try {
      setIsLoading(true);
      
      const { error } = await appointmentService.updateAppointmentStatus(id, status);

      if (error) throw error;
      
      // Update local state
      setAppointments(appointments.map(appointment => 
        appointment.id === id 
          ? { ...appointment, status } 
          : appointment
      ));
      
      setIsLoading(false);
      toast.success(`Appointment ${status} successfully`);
      return true;
    } catch (error) {
      setIsLoading(false);
      toast.error(`Failed to update appointment: ${(error as Error).message}`);
      return false;
    }
  };

  // Cancel an appointment
  const cancelAppointment = async (id: string): Promise<boolean> => {
    return updateAppointmentStatus(id, 'cancelled');
  };

  // Confirm an appointment
  const confirmAppointment = async (id: string): Promise<boolean> => {
    return updateAppointmentStatus(id, 'confirmed');
  };

  return {
    appointments,
    isLoading,
    error,
    getAppointments,
    getAppointmentById: appointmentService.getAppointmentById,
    createAppointment,
    updateAppointmentStatus,
    cancelAppointment,
    confirmAppointment
  };
}
