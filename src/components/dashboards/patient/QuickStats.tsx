
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart, Calendar, FileText, Clock } from "lucide-react";
import { Appointment } from "@/types/appointmentTypes";

interface QuickStatsProps {
  totalCreditsAvailable: number | undefined;
  nextAppointment: Appointment | null;
  userMembership: any;
}

const QuickStats = ({ totalCreditsAvailable, nextAppointment, userMembership }: QuickStatsProps) => {
  // Format the next appointment date
  const getFormattedNextAppointmentDate = () => {
    if (!nextAppointment) return 'None scheduled';
    
    const date = nextAppointment.date || nextAppointment.appointment_date;
    if (!date) return 'Date not available';
    
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4 flex items-center space-x-4">
          <div className="bg-conve-red/10 p-3 rounded-full">
            <BarChart className="h-6 w-6 text-conve-red" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Available Credits</p>
            <h3 className="text-2xl font-bold">{totalCreditsAvailable || 0}</h3>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4 flex items-center space-x-4">
          <div className="bg-blue-50 p-3 rounded-full">
            <Calendar className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Next Appointment</p>
            <h3 className="text-md font-medium">
              {getFormattedNextAppointmentDate()}
            </h3>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4 flex items-center space-x-4">
          <div className="bg-green-50 p-3 rounded-full">
            <FileText className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Lab Results</p>
            <h3 className="text-md font-medium">View Results</h3>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4 flex items-center space-x-4">
          <div className="bg-amber-50 p-3 rounded-full">
            <Clock className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Membership Renewal</p>
            <h3 className="text-md font-medium">
              {userMembership?.next_renewal ? new Date(userMembership.next_renewal).toLocaleDateString() : 'N/A'}
            </h3>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default QuickStats;
