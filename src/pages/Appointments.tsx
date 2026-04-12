
import React, { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

// Import types and schemas
import { bookingFormSchema } from "@/types/appointmentTypes";

// Import components
import DateTimeStep from "@/components/appointments/DateTimeStep";
import PatientInfoStep from "@/components/appointments/PatientInfoStep";
import ServiceSelectionStep from "@/components/appointments/ServiceSelectionStep";
import LocationStep from "@/components/appointments/LocationStep";
import ReviewStep from "@/components/appointments/ReviewStep";
import AppointmentConfirmation from "@/components/appointments/AppointmentConfirmation";
import LoginPrompt from "@/components/appointments/LoginPrompt";
import BookingProgress from "@/components/appointments/BookingProgress";

// Services
const services = [
  { id: "basic", name: "Basic Blood Panel", credits: 1, description: "CBC, Basic Metabolic Panel" },
  { id: "comprehensive", name: "Comprehensive Panel", credits: 2, description: "CBC, Comprehensive Metabolic Panel, Lipid Panel" },
  { id: "hormone", name: "Hormone Panel", credits: 3, description: "Testosterone, Estrogen, Thyroid" },
  { id: "vitamin", name: "Vitamin Panel", credits: 2, description: "Vitamin D, B12, Folate" },
  { id: "custom", name: "Custom Panel", credits: "Varies", description: "Customized to your needs" },
];

const AppointmentsPage: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [bookingComplete, setBookingComplete] = useState(false);
  
  // Get current user
  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    }
  });

  // Form initialization
  const form = useForm<z.infer<typeof bookingFormSchema>>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      termsAccepted: false,
      serviceDetails: {
        fasting: false,
      },
    },
  });
  
  // Form submission handler
  const onSubmit = async (data: z.infer<typeof bookingFormSchema>) => {
    try {
      // Combine date and time
      const appointmentDate = new Date(data.date);
      const [hours, minutes, period] = data.time.match(/(\d+):(\d+) ([AP]M)/)?.slice(1) || [];
      
      if (hours && minutes && period) {
        let hour = parseInt(hours);
        if (period === 'PM' && hour < 12) hour += 12;
        if (period === 'AM' && hour === 12) hour = 0;
        
        appointmentDate.setHours(hour, parseInt(minutes), 0, 0);
        
        // Prepare the data for saving
        const appointmentData = {
          patient_id: userData?.id,
          appointment_date: appointmentDate.toISOString(),
          address: data.locationDetails.address,
          zipcode: data.locationDetails.zipCode,
          notes: `Service: ${data.serviceDetails.selectedService}
          ${data.serviceDetails.fasting ? 'Fasting required' : 'No fasting required'}
          ${data.serviceDetails.additionalNotes ? `Notes: ${data.serviceDetails.additionalNotes}` : ''}
          Location type: ${data.locationDetails.locationType}
          Instructions: ${data.locationDetails.instructions || 'None provided'}`,
          status: 'scheduled'
        };

        // Save the appointment to Supabase
        const { error } = await supabase
          .from('appointments')
          .insert(appointmentData);
          
        if (error) throw error;
        
        toast.success("Your appointment has been scheduled!");
        setBookingComplete(true);
        console.log("Appointment booked:", data);
      }
    } catch (error) {
      console.error("Error booking appointment:", error);
      toast.error("Failed to book appointment. Please try again.");
    }
  };
  
  // Step navigation
  const nextStep = () => {
    const fields = getFieldsForStep(currentStep);
    form.trigger(fields as any).then((isValid) => {
      if (isValid) {
        setCurrentStep(currentStep + 1);
        window.scrollTo(0, 0);
      }
    });
  };
  
  const prevStep = () => {
    setCurrentStep(currentStep - 1);
    window.scrollTo(0, 0);
  };
  
  // Get fields to validate for the current step
  const getFieldsForStep = (step: number) => {
    switch (step) {
      case 1:
        return ["date", "time"];
      case 2:
        return ["patientDetails"];
      case 3:
        return ["serviceDetails"];
      case 4:
        return ["locationDetails"];
      default:
        return [];
    }
  };
  
  // Pre-fill user data if available
  useEffect(() => {
    if (userData) {
      // Get user profile data
      const fetchUserProfile = async () => {
        const { data: profileData, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userData.id)
          .single();

        if (!error && profileData) {
          const fullName = profileData.full_name || '';
          const nameParts = fullName.split(' ');
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || '';
          
          form.setValue('patientDetails.firstName', firstName);
          form.setValue('patientDetails.lastName', lastName);
          
          if (profileData.date_of_birth) {
            form.setValue('patientDetails.dateOfBirth', new Date(profileData.date_of_birth));
          }
          
          // Pre-fill location details if available
          if (profileData.address_street) {
            form.setValue('locationDetails.address', profileData.address_street);
            form.setValue('locationDetails.city', profileData.address_city || '');
            form.setValue('locationDetails.state', profileData.address_state || 'FL');
            form.setValue('locationDetails.zipCode', profileData.address_zipcode || '');
          }
        }

        // Set email from auth if available
        if (userData.email) {
          form.setValue('patientDetails.email', userData.email);
        }
      };

      fetchUserProfile();
    }
  }, [userData, form]);
  
  // Main render logic
  if (bookingComplete) {
    return (
      <div className="min-h-screen bg-white">
        <Helmet>
          <title>Appointment Confirmation | ConveLabs</title>
          <meta 
            name="description" 
            content="Your lab testing appointment with ConveLabs has been confirmed. We look forward to serving you." 
          />
          <meta name="robots" content="noindex" />
        </Helmet>
        
        <Header />
        
        <main className="container mx-auto px-4 py-20">
          <div className="max-w-2xl mx-auto">
            <AppointmentConfirmation 
              formData={form.getValues()} 
              services={services} 
            />
          </div>
        </main>
        
        <Footer />
      </div>
    );
  }

  // Show login prompt if user is not logged in
  if (!userLoading && !userData) {
    return (
      <div className="min-h-screen bg-white">
        <Helmet>
          <title>Schedule an Appointment | ConveLabs</title>
          <meta 
            name="description" 
            content="Schedule your lab testing appointment with ConveLabs." 
          />
        </Helmet>
        
        <Header />
        
        <main className="container mx-auto px-4 py-20">
          <LoginPrompt />
        </main>
        
        <Footer />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Schedule an Appointment | ConveLabs | Central Florida's Mobile Phlebotomy Service</title>
        <meta 
          name="description" 
          content="Schedule your lab testing appointment with ConveLabs. Our professional phlebotomists come to your home or office in Orlando, Tampa, and throughout Central Florida." 
        />
        <meta name="keywords" content="schedule lab test, mobile phlebotomy appointment, Orlando blood draw, Tampa lab testing, Central Florida phlebotomy scheduling" />
        <link rel="canonical" href="https://convelabs.com/appointments" />
      </Helmet>
      
      <Header />
      
      <main className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-2 text-center">Schedule Your Appointment</h1>
          <p className="text-lg text-gray-600 text-center mb-12">
            Book your mobile phlebotomy visit in a few simple steps
          </p>
          
          {/* Progress steps */}
          <BookingProgress currentStep={currentStep} />
          
          {/* Booking form */}
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {currentStep === 1 && (
              <DateTimeStep form={form} onNext={nextStep} />
            )}
            
            {currentStep === 2 && (
              <PatientInfoStep form={form} onNext={nextStep} onBack={prevStep} />
            )}
            
            {currentStep === 3 && (
              <ServiceSelectionStep form={form} onNext={nextStep} onBack={prevStep} />
            )}
            
            {currentStep === 4 && (
              <LocationStep form={form} onNext={nextStep} onBack={prevStep} />
            )}
            
            {currentStep === 5 && (
              <ReviewStep 
                form={form}
                onSubmit={form.handleSubmit(onSubmit)} 
                onBack={prevStep}
                services={services} 
              />
            )}
          </form>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default AppointmentsPage;
