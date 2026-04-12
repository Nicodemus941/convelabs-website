
import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Container } from "@/components/ui/container";
import { bookingFormSchema } from "@/types/appointmentTypes";
import { createCheckoutSession } from "@/services/stripe";

// Import components
import ALaCarteDateTimeStep from "@/components/a-la-carte/ALaCarteDateTimeStep";
import PatientInfoStep from "@/components/appointments/PatientInfoStep";
import ALaCarteServiceSelection from "@/components/a-la-carte/ALaCarteServiceSelection";
import LocationStep from "@/components/appointments/LocationStep";
import ALaCarteReviewStep from "@/components/a-la-carte/ALaCarteReviewStep";
import AppointmentConfirmation from "@/components/appointments/AppointmentConfirmation";
import BookingProgress from "@/components/appointments/BookingProgress";
import MembershipComparisonBanner from "@/components/a-la-carte/MembershipComparisonBanner";

const AlaCarteBooking: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [bookingComplete, setBookingComplete] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const navigate = useNavigate();
  
  // Form initialization
  const form = useForm<z.infer<typeof bookingFormSchema>>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      termsAccepted: false,
      serviceDetails: {
        fasting: false,
        sameDay: false,
        weekend: false,
        additionalNotes: ""
      },
      locationDetails: {
        locationType: "home",
      }
    },
  });
  
  // Form submission handler
  const onSubmit = async (data: z.infer<typeof bookingFormSchema>) => {
    try {
      setIsProcessing(true);
      
      // Calculate price based on selected service and add-ons
      let basePrice = 175; // Standard blood draw
      
      // Check for service price adjustments
      if (data.serviceDetails.selectedService === "fasting") {
        basePrice = 195;
      } else if (data.serviceDetails.selectedService === "specialty") {
        basePrice = 225;
      } else if (data.serviceDetails.selectedService === "therapeutic") {
        basePrice = 275;
      }
      
      // Add-on pricing
      if (data.serviceDetails.sameDay) {
        basePrice += 50;
      }
      if (data.serviceDetails.weekend) {
        basePrice += 75;
      }
      
      // Convert to cents for Stripe
      const priceInCents = basePrice * 100;
      
      // Combine date and time
      const appointmentDate = new Date(data.date);
      const [hours, minutes, period] = data.time.match(/(\d+):(\d+) ([AP]M)/)?.slice(1) || [];
      
      if (hours && minutes && period) {
        let hour = parseInt(hours);
        if (period === 'PM' && hour < 12) hour += 12;
        if (period === 'AM' && hour === 12) hour = 0;
        
        appointmentDate.setHours(hour, parseInt(minutes), 0, 0);
        
        // Create a Stripe checkout session
        // Note: We're passing "a-la-carte" as planId and using null for billingFrequency
        // since this is a one-time payment, not a subscription
        const result = await createCheckoutSession(
          "a-la-carte",
          "annual", // Using annual as a workaround for one-time payments
          undefined, // No coupon code
          false,     // Not a gift purchase
          {          // Metadata
            serviceName: `A La Carte: ${data.serviceDetails.selectedService}`,
            appointmentDate: appointmentDate.toISOString(),
            patientName: `${data.patientDetails.firstName} ${data.patientDetails.lastName}`,
            email: data.patientDetails.email,
            phone: data.patientDetails.phone,
            address: data.locationDetails.address,
            city: data.locationDetails.city,
            state: data.locationDetails.state,
            zipCode: data.locationDetails.zipCode
          },
          false,     // Not a supernova member
          null,      // No supernova add-on
          priceInCents // Custom amount
        );
        
        if (result.error) {
          throw new Error(result.error);
        }
        
        // Store booking data in session storage for retrieval after payment
        sessionStorage.setItem('a-la-carte-booking', JSON.stringify({
          ...data,
          price: basePrice,
          appointmentDateISO: appointmentDate.toISOString()
        }));
        
        // Redirect to Stripe checkout
        window.location.href = result.url as string;
      }
    } catch (error) {
      console.error("Error booking appointment:", error);
      toast.error("Failed to process payment. Please try again.");
      setIsProcessing(false);
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
  
  // Check for successful payment return
  React.useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('success') === 'true') {
      setBookingComplete(true);
      
      // Retrieve booking data
      const storedBooking = sessionStorage.getItem('a-la-carte-booking');
      if (storedBooking) {
        const bookingData = JSON.parse(storedBooking);
        form.reset(bookingData);
      }
      
      // Clear session storage
      sessionStorage.removeItem('a-la-carte-booking');
    }
  }, []);
  
  // Main render logic
  if (bookingComplete) {
    return (
      <div className="min-h-screen bg-white">
        <Helmet>
          <title>Booking Confirmation | ConveLabs</title>
          <meta 
            name="description" 
            content="Your appointment with ConveLabs has been confirmed." 
          />
        </Helmet>
        
        <Header />
        
        <Container className="py-20">
          <div className="max-w-2xl mx-auto">
            <AppointmentConfirmation 
              formData={form.getValues()} 
              services={[]} 
              showUpsell={true}
            />
          </div>
        </Container>
        
        <Footer />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>À La Carte Booking | ConveLabs</title>
        <meta 
          name="description" 
          content="Book a one-time lab service with ConveLabs without a membership." 
        />
      </Helmet>
      
      <Header />
      
      <Container className="py-20">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-2 text-center">Pay-Per-Visit Booking (Non-Member)</h1>
          <p className="text-lg text-gray-600 text-center mb-6">
            Book a single lab service without committing to a membership
          </p>
          
          {/* Membership comparison banner */}
          <MembershipComparisonBanner className="mb-12" />
          
          {/* Progress steps */}
          <BookingProgress currentStep={currentStep} />
          
          {/* Booking form */}
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {currentStep === 1 && (
              <ALaCarteDateTimeStep form={form} onNext={nextStep} />
            )}
            
            {currentStep === 2 && (
              <PatientInfoStep form={form} onNext={nextStep} onBack={prevStep} />
            )}
            
            {currentStep === 3 && (
              <ALaCarteServiceSelection form={form} onNext={nextStep} onBack={prevStep} />
            )}
            
            {currentStep === 4 && (
              <LocationStep form={form} onNext={nextStep} onBack={prevStep} />
            )}
            
            {currentStep === 5 && (
              <ALaCarteReviewStep 
                form={form}
                onSubmit={form.handleSubmit(onSubmit)} 
                onBack={prevStep}
                isProcessing={isProcessing}
              />
            )}
          </form>
        </div>
      </Container>
      
      <Footer />
    </div>
  );
};

export default AlaCarteBooking;
