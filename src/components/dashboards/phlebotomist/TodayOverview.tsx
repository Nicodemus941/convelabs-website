
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeeklyScheduleDay } from "./PhlebotomistDashboardData";

type OverviewProps = {
  todayAppointments: number;
  totalCompletedToday: number;
  nextAppointment?: {
    time: string;
    patientName: string;
  } | null;
  weeklySchedule: WeeklyScheduleDay[];
};

const TodayOverview: React.FC<OverviewProps> = ({
  todayAppointments,
  totalCompletedToday,
  nextAppointment,
  weeklySchedule
}) => {
  // Calculate total weekly appointments
  const totalWeeklyAppointments = weeklySchedule.reduce(
    (total, day) => total + day.appointments, 
    0
  );
  
  // Determine working days
  const workingDays = weeklySchedule
    .filter(day => day.hours !== "Off")
    .map(day => day.day)
    .join(", ");

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Today's Appointments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{todayAppointments}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {totalCompletedToday} completed, {todayAppointments - totalCompletedToday} remaining
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Next Appointment
          </CardTitle>
        </CardHeader>
        <CardContent>
          {nextAppointment ? (
            <>
              <div className="text-xl font-bold">{nextAppointment.time}</div>
              <p className="text-xs text-muted-foreground mt-1">
                with {nextAppointment.patientName}
              </p>
            </>
          ) : (
            <div className="text-base">No upcoming appointments</div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Weekly Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xl font-bold">{totalWeeklyAppointments} appointments</div>
          <p className="text-xs text-muted-foreground mt-1">
            This week: {workingDays}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TodayOverview;
