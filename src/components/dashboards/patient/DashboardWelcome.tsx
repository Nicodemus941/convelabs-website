
import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { User } from "@/types/auth";
import { GHS_BOOKING_PAGE } from "@/lib/constants/urls";


interface DashboardWelcomeProps {
  user: User | null;
  handleBookAppointment: () => void;
}

const DashboardWelcome = ({ user, handleBookAppointment }: DashboardWelcomeProps) => {
  const handleBookClick = () => {
    window.open(GHS_BOOKING_PAGE, '_blank', 'noopener,noreferrer');
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
    </>
  );
};

export default DashboardWelcome;
