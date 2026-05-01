
import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { User } from "@/types/auth";
import { GHS_BOOKING_PAGE } from "@/lib/constants/urls";
import FoundingMemberBadge from "@/components/membership/FoundingMemberBadge";
import FoundingSeatsCounter from "@/components/membership/FoundingSeatsCounter";
import PendingInsuranceModal from "@/components/patient/PendingInsuranceModal";


interface DashboardWelcomeProps {
  user: User | null;
  handleBookAppointment: () => void;
}

const DashboardWelcome = ({ user, handleBookAppointment }: DashboardWelcomeProps) => {
  const handleBookClick = () => {
    window.location.href = GHS_BOOKING_PAGE;
  };

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Welcome, {user?.full_name || user?.firstName || 'Member'}</h1>
          <p className="text-muted-foreground mt-1">
            Your health dashboard - schedule services and view your membership details.
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex gap-2">
          <Button
            className="bg-conve-red hover:bg-conve-red/90"
            onClick={handleBookClick}
          >
            <span className="flex items-center">
              Book Appointment <ArrowRight className="ml-2 h-4 w-4" />
            </span>
          </Button>
          <Button variant="outline" asChild>
            <a href="/pricing">View Plans</a>
          </Button>
        </div>
      </div>

      {/* Founding Member badge — renders only if this user claimed a seat */}
      <div className="mt-4">
        <FoundingMemberBadge />
      </div>

      {/* Founding 50 scarcity strip — shown to all patients on dashboard.
          Founding members see their badge above; prospects see the counter
          as a call to join. Component renders null when seats are closed. */}
      <div className="mt-3">
        <FoundingSeatsCounter variant="banner" />
      </div>

      {/* OCR-detected insurance mismatch confirm modal. Self-fetches via
          get_my_pending_insurance_change RPC; renders nothing when there's
          no pending change. Shows once per OCR'd lab order; resolution
          (accept_new / keep_existing) closes the queue row. */}
      <PendingInsuranceModal />
    </>
  );
};

export default DashboardWelcome;
