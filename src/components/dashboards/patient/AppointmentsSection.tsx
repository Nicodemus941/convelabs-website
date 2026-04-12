
import React from "react";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import UpcomingAppointments from "@/components/appointments/UpcomingAppointments";

interface AppointmentsSectionProps {
  handleBookAppointment: () => void;
}

const AppointmentsSection = ({ handleBookAppointment }: AppointmentsSectionProps) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Upcoming Appointments</CardTitle>
        <Button variant="outline" size="sm" onClick={handleBookAppointment}>
          Book New
        </Button>
      </CardHeader>
      <CardContent>
        <UpcomingAppointments />
        
        {/* Book Appointment notice */}
        <div className="mt-4 text-xs text-muted-foreground">
          Need a blood draw or other service? Book your appointment through our online system.
        </div>
      </CardContent>
    </Card>
  );
};

export default AppointmentsSection;
