import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMembership } from "@/hooks/useMembership";
import { useAppointments } from "@/hooks/useAppointments";
import { Appointment } from "@/types/appointmentTypes";
import MembershipSummary from "@/components/membership/MembershipSummary";
import CreditUsage from "@/components/membership/CreditUsage";
import AppointmentHistory from "@/components/appointments/AppointmentHistory";
import FoundingMemberNotice from "@/components/dashboards/FoundingMemberNotice";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { refreshSessionBeforeRedirect, createAuthPayload } from "@/utils/auth-tokens";

// Import our new components
import DashboardWelcome from "./patient/DashboardWelcome";
import QuickStats from "./patient/QuickStats";
import NotificationsCard from "./patient/NotificationsCard";
import HealthResourcesCard from "./patient/HealthResourcesCard";
import AppointmentsSection from "./patient/AppointmentsSection";

const PatientDashboard = () => {
  const { user, session, refreshSession } = useAuth();
  const { userMembership, isLoading, error, totalCreditsAvailable } = useMembership();
  const { getAppointments, appointments } = useAppointments();
  const [nextAppointment, setNextAppointment] = useState<Appointment | null>(null);
  
  const isFoundingMember = userMembership?.founding_member || false;
  const nextBillingOverride = userMembership?.next_billing_override;
  
  const handleBookAppointment = () => {
    window.location.href = '/book-now';
  };
  
  // Get appointments when component mounts
  useEffect(() => {
    getAppointments();
  }, [getAppointments]);
  
  // Find the next upcoming appointment
  useEffect(() => {
    if (appointments?.length) {
      const upcoming = appointments
        .filter(appt => ['scheduled', 'confirmed'].includes(appt.status))
        .sort((a, b) => {
          const dateA = new Date(a.date || a.appointment_date || 0);
          const dateB = new Date(b.date || b.appointment_date || 0);
          return dateA.getTime() - dateB.getTime();
        });
      
      if (upcoming.length > 0) {
        setNextAppointment(upcoming[0]);
      }
    }
  }, [appointments]);
  
  // Log debug information
  useEffect(() => {
    console.log("User in PatientDashboard:", user);
    console.log("Session in PatientDashboard:", session);
    console.log("Membership loading state:", isLoading);
    console.log("Membership error:", error);
    console.log("User membership data:", userMembership);
    console.log("Next appointment:", nextAppointment);
    console.log("All appointments:", appointments);
  }, [user, session, isLoading, error, userMembership, nextAppointment, appointments]);
  
  return (
    <div className="px-4 py-8 max-w-7xl mx-auto space-y-8">
      {/* Welcome Header Section */}
      <DashboardWelcome user={user} handleBookAppointment={handleBookAppointment} />
      
      {/* Show founding member notice if applicable */}
      {isFoundingMember && (
        <FoundingMemberNotice nextBillingDate={nextBillingOverride} />
      )}
      
      {/* Quick Stats Section */}
      <QuickStats 
        totalCreditsAvailable={totalCreditsAvailable} 
        nextAppointment={nextAppointment}
        userMembership={userMembership}
      />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="space-y-6">
            {/* Membership Summary & Credit Usage */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <MembershipSummary />
              <CreditUsage />
            </div>
            
            {/* Appointments Section */}
            <AppointmentsSection handleBookAppointment={handleBookAppointment} />
            
            {/* Notifications Section */}
            <NotificationsCard />
          </div>
        </div>
        
        <div className="lg:col-span-1">
          {/* Health Resources Section */}
          <div className="space-y-6">
            <HealthResourcesCard />
            
            <Card>
              <CardHeader>
                <CardTitle>Appointment History</CardTitle>
                <CardDescription>Your past appointments</CardDescription>
              </CardHeader>
              <CardContent>
                <AppointmentHistory />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientDashboard;