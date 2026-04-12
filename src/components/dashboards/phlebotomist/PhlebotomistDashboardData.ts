
import { AppointmentType } from "./AppointmentCard";

export type WeeklyScheduleDay = {
  day: string;
  hours: string;
  appointments: number;
};

export type PhlebotomistDashboardData = {
  todayAppointments: number;
  totalCompletedToday: number;
  upcomingAppointments: AppointmentType[];
  completedAppointments: AppointmentType[];
  weeklySchedule: WeeklyScheduleDay[];
};

// Mock data for the dashboard
export const getMockPhlebotomistData = (): PhlebotomistDashboardData => ({
  todayAppointments: 3,
  totalCompletedToday: 1,
  upcomingAppointments: [
    {
      id: "appt-1",
      patientName: "Jennifer Miller",
      patientId: "P-1234",
      time: "10:30 AM",
      address: "726 Pine Street, Orlando, FL 32801",
      orderStatus: "uploaded",
      orderFile: "miller_labs.pdf"
    },
    {
      id: "appt-2",
      patientName: "Robert Thomas",
      patientId: "P-5678",
      time: "1:15 PM",
      address: "842 Lake Avenue, Orlando, FL 32801",
      orderStatus: "uploaded",
      orderFile: "thomas_labs.pdf"
    }
  ],
  completedAppointments: [
    {
      id: "appt-0",
      patientName: "Sarah Johnson",
      patientId: "P-9012",
      time: "8:00 AM",
      address: "123 Main Street, Orlando, FL 32801",
      orderStatus: "uploaded",
      orderFile: "johnson_labs.pdf",
      inventoryUsed: [
        { item: "SST Tubes", quantity: 2 },
        { item: "Butterfly Needles 23g", quantity: 1 },
        { item: "Alcohol Wipes", quantity: 1 },
        { item: "Gloves", quantity: 1 }
      ]
    }
  ],
  weeklySchedule: [
    { day: "Monday", hours: "7:00 AM - 2:00 PM", appointments: 5 },
    { day: "Tuesday", hours: "7:00 AM - 2:00 PM", appointments: 4 },
    { day: "Wednesday", hours: "7:00 AM - 2:00 PM", appointments: 6 },
    { day: "Thursday", hours: "Off", appointments: 0 },
    { day: "Friday", hours: "7:00 AM - 2:00 PM", appointments: 3 },
    { day: "Saturday", hours: "Off", appointments: 0 },
    { day: "Sunday", hours: "Off", appointments: 0 },
  ]
});
