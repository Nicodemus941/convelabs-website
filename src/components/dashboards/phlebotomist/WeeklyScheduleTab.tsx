
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type WeeklyScheduleDay = {
  day: string;
  hours: string;
  appointments: number;
};

type WeeklyScheduleTabProps = {
  weeklySchedule: WeeklyScheduleDay[];
};

const WeeklyScheduleTab: React.FC<WeeklyScheduleTabProps> = ({ weeklySchedule }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Schedule</CardTitle>
        <CardDescription>Your appointments for this week</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium">Day</th>
                <th className="text-left px-4 py-3 text-sm font-medium">Hours</th>
                <th className="text-left px-4 py-3 text-sm font-medium">Appointments</th>
                <th className="text-right px-4 py-3 text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {weeklySchedule.map((day, index) => (
                <tr key={index} className="border-t">
                  <td className="px-4 py-3 text-sm font-medium">{day.day}</td>
                  <td className="px-4 py-3 text-sm">{day.hours}</td>
                  <td className="px-4 py-3 text-sm">{day.appointments}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    {day.appointments > 0 ? (
                      <Button variant="link" className="text-conve-red h-auto p-0">View Schedule</Button>
                    ) : (
                      <span className="text-muted-foreground">No appointments</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8">
          <h3 className="font-medium text-lg mb-4">Request Time Off</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <input 
                type="date" 
                className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date</label>
              <input 
                type="date" 
                className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Reason (Optional)</label>
              <textarea 
                className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red"
                rows={3}
              ></textarea>
            </div>
            <div className="md:col-span-2">
              <Button className="luxury-button">Submit Request</Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WeeklyScheduleTab;
