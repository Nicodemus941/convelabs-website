
import React from "react";
import { format } from "date-fns";
import { Appointment } from "@/types/appointmentTypes";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X, MoreHorizontal, Calendar, Trash } from "lucide-react";
import { ensureDate } from "@/services/appointments/appointmentMappers";

interface AppointmentListProps {
  appointments: Appointment[];
  isLoading: boolean;
  activeTab: string;
  handleStatusChange: (id: string, status: string) => void;
  handleDeleteAppointment?: (id: string) => void;
  onCreateAppointment: () => void;
}

const AppointmentList: React.FC<AppointmentListProps> = ({
  appointments,
  isLoading,
  activeTab,
  handleStatusChange,
  handleDeleteAppointment,
  onCreateAppointment,
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled":
        return "bg-blue-500";
      case "completed":
        return "bg-green-500";
      case "cancelled":
        return "bg-red-500";
      case "no-show":
        return "bg-amber-500";
      default:
        return "bg-gray-500";
    }
  };

  const formatAppointmentDate = (appointment: Appointment): string => {
    try {
      if (appointment.appointment_date) {
        const date = ensureDate(appointment.appointment_date);
        return date ? format(date, "MMM d, yyyy") : "Unknown date";
      }
      if (appointment.date) {
        const date = ensureDate(appointment.date);
        return date ? format(date, "MMM d, yyyy") : "Unknown date";
      }
      return "Unknown date";
    } catch (err) {
      console.error("Error formatting appointment date:", err, appointment);
      return "Invalid date";
    }
  };

  const formatAppointmentTime = (appointment: Appointment): string => {
    try {
      // Check if appointment has time property
      if (appointment.time) {
        return appointment.time as string;
      }
      // If no time property, try to extract time from dates
      if (appointment.appointment_date) {
        const date = ensureDate(appointment.appointment_date);
        return date ? format(date, "h:mm a") : "Unknown time";
      }
      if (appointment.date) {
        const date = ensureDate(appointment.date);
        return date ? format(date, "h:mm a") : "Unknown time";
      }
      return "Unknown time";
    } catch (err) {
      console.error("Error formatting appointment time:", err, appointment);
      return "Invalid time"; 
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="text-muted-foreground mb-4">
          No appointments found for your selected filters
        </div>
        <Button onClick={onCreateAppointment}>Create New Appointment</Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Patient</TableHead>
            <TableHead>Date & Time</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {appointments.map((appointment) => (
            <TableRow key={appointment.id}>
              <TableCell className="font-medium">
                {appointment.patient_name || "Unknown"}
                <div className="text-sm text-muted-foreground">
                  {appointment.patient_phone || "No phone"}
                </div>
              </TableCell>
              <TableCell>
                {formatAppointmentDate(appointment)}
                <div className="text-sm text-muted-foreground">
                  {formatAppointmentTime(appointment)}
                </div>
              </TableCell>
              <TableCell className="max-w-[200px] truncate" title={appointment.address || appointment.location}>
                {appointment.address || appointment.location}
              </TableCell>
              <TableCell>
                <Badge className={`${getStatusColor(appointment.status)} hover:${getStatusColor(appointment.status)}`}>
                  {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {appointment.status === "scheduled" && (
                      <>
                        <DropdownMenuItem onClick={() => handleStatusChange(appointment.id, "completed")}>
                          <Check className="mr-2 h-4 w-4" /> Mark Completed
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(appointment.id, "no-show")}>
                          <X className="mr-2 h-4 w-4" /> Mark No-Show
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(appointment.id, "cancelled")}>
                          <X className="mr-2 h-4 w-4" /> Cancel
                        </DropdownMenuItem>
                      </>
                    )}
                    {appointment.status !== "scheduled" && (
                      <DropdownMenuItem onClick={() => handleStatusChange(appointment.id, "scheduled")}>
                        <Calendar className="mr-2 h-4 w-4" /> Reschedule
                      </DropdownMenuItem>
                    )}
                    {handleDeleteAppointment && (
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => handleDeleteAppointment(appointment.id)}
                      >
                        <Trash className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default AppointmentList;
