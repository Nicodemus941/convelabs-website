
import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { z } from 'zod';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

// Import appointment components
import DateTimeStep from '@/components/appointments/DateTimeStep';
import AppointmentConfirmation from '@/components/appointments/AppointmentConfirmation';
import { bookingFormSchema } from '@/types/appointmentTypes';

// Services list - simplified for onboarding
const services = [
  { id: "basic", name: "Basic Blood Panel", credits: 1, description: "CBC, Basic Metabolic Panel" },
  { id: "comprehensive", name: "Comprehensive Panel", credits: 2, description: "CBC, Comprehensive Metabolic Panel, Lipid Panel" },
];

const BookingStep: React.FC = () => {
  const [bookingComplete, setBookingComplete] = useState(false);
  
  // Get user data
  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    }
  });

  // Get user profile data
  const { data: userProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['userProfile', userData?.id],
    queryFn: async () => {
      if (!userData?.id) return null;
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userData.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!userData?.id
  });
  
  // Form setup
  const methods = useForm<z.infer<typeof bookingFormSchema>>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      termsAccepted: true, // Auto-accept terms for onboarding flow
      serviceDetails: {
        selectedService: "basic", // Default to basic panel
        fasting: false,
      },
      locationDetails: {
        locationType: "home", // Default to home visits
      },
    },
  });
  
  // Pre-fill user data when available
  React.useEffect(() => {
    if (userData && userProfile) {
      // Pre-fill patient details if available
      const fullName = userProfile.full_name || '';
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      methods.setValue('patientDetails.firstName', firstName);
      methods.setValue('patientDetails.lastName', lastName);
      
      // Set email from auth
      if (userData.email) {
        methods.setValue('patientDetails.email', userData.email);
      }
      
      // Pre-fill location if available
      if (userProfile.address_street) {
        methods.setValue('locationDetails.address', userProfile.address_street);
        methods.setValue('locationDetails.city', userProfile.address_city || '');
        methods.setValue('locationDetails.state', userProfile.address_state || 'FL');
        methods.setValue('locationDetails.zipCode', userProfile.address_zipcode || '');
      }
    }
  }, [userData, userProfile, methods]);

  const handleBookAppointment = async (data: z.infer<typeof bookingFormSchema>) => {
    try {
      if (!userData) {
        toast.error('You must be logged in to book an appointment');
        return;
      }

      // Combine date and time
      const appointmentDate = new Date(data.date);
      const [hours, minutes, period] = data.time.match(/(\d+):(\d+) ([AP]M)/)?.slice(1) || [];
      
      if (hours && minutes && period) {
        let hour = parseInt(hours);
        if (period === 'PM' && hour < 12) hour += 12;
        if (period === 'AM' && hour === 12) hour = 0;
        
        appointmentDate.setHours(hour, parseInt(minutes), 0, 0);
        
        // Prepare appointment data
        const appointmentData = {
          patient_id: userData.id,
          appointment_date: appointmentDate.toISOString(),
          address: data.locationDetails?.address || userProfile?.address_street || 'No address provided',
          zipcode: data.locationDetails?.zipCode || userProfile?.address_zipcode || '00000',
          notes: `Service: ${data.serviceDetails.selectedService}
          ${data.serviceDetails.fasting ? 'Fasting required' : 'No fasting required'}
          ${data.serviceDetails.additionalNotes ? `Notes: ${data.serviceDetails.additionalNotes}` : ''}
          Location type: ${data.locationDetails?.locationType || 'home'}
          Instructions: ${data.locationDetails?.instructions || 'None provided'}`,
          status: 'scheduled'
        };
          
        const { error } = await supabase
          .from('appointments')
          .insert(appointmentData);
          
        if (error) throw error;
        
        setBookingComplete(true);
        toast.success('Your appointment has been scheduled!');
      }
    } catch (error) {
      console.error('Error booking appointment:', error);
      toast.error('Failed to book appointment. Please try again.');
    }
  };
  
  // Handle case where user is not logged in
  if (!userLoading && !userData) {
    return (
      <Card className="p-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-4">Login Required</h2>
          <p className="mb-4">You need to be logged in to book an appointment</p>
        </div>
      </Card>
    );
  }
  
  if (bookingComplete) {
    return (
      <AppointmentConfirmation
        formData={methods.getValues()}
        services={services}
      />
    );
  }
  
  return (
    <Card>
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(handleBookAppointment)} className="space-y-8">
          <DateTimeStep form={methods} onNext={methods.handleSubmit(handleBookAppointment)} />
        </form>
      </FormProvider>
    </Card>
  );
};

export default BookingStep;
