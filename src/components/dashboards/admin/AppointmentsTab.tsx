
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppointments } from "@/hooks/useAppointments";
import { toast } from "sonner";
import AppointmentList from "@/components/tenant/appointments/AppointmentList";
import AppointmentBookingButton from "@/components/appointment/AppointmentBookingButton";
import { CalendarIcon, FilterIcon, RefreshCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Appointment } from "@/types/appointmentTypes";
import LoadingState from "@/components/ui/loading-state";

const AppointmentsTab = () => {
  const [activeTab, setActiveTab] = useState("upcoming");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const { 
    appointments, 
    isLoading, 
    error,
    getAppointments, 
    updateAppointmentStatus, 
    cancelAppointment 
  } = useAppointments();

  // Fetch appointments on component mount
  useEffect(() => {
    console.log("AppointmentsTab: Fetching appointments...");
    fetchAppointments();
  }, []);
  
  const fetchAppointments = async () => {
    try {
      console.log("AppointmentsTab: Starting appointment fetch");
      await getAppointments();
      console.log("AppointmentsTab: Appointment fetch completed");
      console.log("Appointments data:", appointments);
    } catch (err) {
      console.error("Failed to fetch appointments:", err);
      toast.error("Failed to load appointments. Please try again.");
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateAppointmentStatus(id, status as Appointment['status']);
      toast.success(`Appointment status updated to ${status}`);
    } catch (error) {
      console.error("Failed to update appointment status:", error);
      toast.error("Failed to update appointment status");
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    if (window.confirm("Are you sure you want to cancel this appointment?")) {
      try {
        await cancelAppointment(id);
        toast.success("Appointment cancelled successfully");
      } catch (error) {
        console.error("Failed to cancel appointment:", error);
        toast.error("Failed to cancel appointment");
      }
    }
  };

  // Filter appointments based on active tab, selected date, and search query
  const filteredAppointments = appointments.filter((appointment) => {
    console.log("Filtering appointment:", appointment);
    
    // Filter by tab (status)
    const matchesTab = 
      (activeTab === "upcoming" && (appointment.status === "scheduled" || appointment.status === "confirmed")) ||
      (activeTab === "completed" && appointment.status === "completed") ||
      (activeTab === "cancelled" && appointment.status === "cancelled") ||
      activeTab === "all";

    // Filter by date if selected
    let matchesDate = true;
    if (selectedDate && appointment.appointment_date) {
      try {
        const appointmentDate = new Date(appointment.appointment_date);
        matchesDate = format(appointmentDate, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd");
      } catch (err) {
        console.error("Date parsing error:", err, appointment);
        matchesDate = false;
      }
    }

    // Filter by search query
    const matchesSearch = !searchQuery || 
      (appointment.patient_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      appointment.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (appointment.patient_email && appointment.patient_email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (appointment.patient_phone && appointment.patient_phone.includes(searchQuery)));

    return matchesTab && matchesDate && matchesSearch;
  });

  const handleCreateAppointment = () => {
    // This will be implemented when we add the create appointment functionality
    console.log("Create appointment button clicked");
  };

  // Error state UI
  if (error) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-2xl font-bold">Appointments</CardTitle>
          <Button
            onClick={fetchAppointments}
            variant="outline"
            className="flex items-center gap-1"
          >
            <RefreshCcw className="h-4 w-4" />
            Retry
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <div className="rounded-full bg-red-100 p-3 text-red-600 mb-4">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-medium mb-2">Error Loading Appointments</h3>
          <p className="text-muted-foreground max-w-md mb-4">
            {error.message || "There was a problem loading the appointments. Please try again."}
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={fetchAppointments}>
              Try Again
            </Button>
            {error.message?.includes("recursion") ? (
              <p className="text-sm text-red-600 mt-2">
                This is a database permission issue. Please contact the development team to fix the recursive RLS policies.
              </p>
            ) : (
              <p className="text-sm text-red-600 mt-2">
                If this error persists, please contact the development team with the error details.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-2xl font-bold">Appointments</CardTitle>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
            onClick={() => setShowFilters(!showFilters)}
          >
            <FilterIcon className="h-4 w-4" />
            Filter
          </Button>
          <AppointmentBookingButton />
        </div>
      </CardHeader>

      {showFilters && (
        <div className="px-6 py-2 border-b flex flex-wrap gap-2 items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={`flex items-center gap-1 ${
                  selectedDate ? "text-primary border-primary" : ""
                }`}
              >
                <CalendarIcon className="h-4 w-4" />
                {selectedDate ? format(selectedDate, "PPP") : "Filter by date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                initialFocus
              />
              {selectedDate && (
                <div className="p-2 border-t flex justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDate(undefined)}
                  >
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setSelectedDate(undefined)}
                  >
                    Apply
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
          
          <Input
            placeholder="Search patient or address"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-xs h-9"
          />
          
          {(selectedDate || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedDate(undefined);
                setSearchQuery("");
              }}
            >
              Clear Filters
            </Button>
          )}
          
          {selectedDate && (
            <Badge variant="secondary" className="flex gap-1 items-center">
              {format(selectedDate, "PPP")}
              <button
                className="ml-1 hover:bg-secondary-foreground/10 rounded-full"
                onClick={() => setSelectedDate(undefined)}
              >
                ✕
              </button>
            </Badge>
          )}
        </div>
      )}

      <CardContent className="p-0 pt-4">
        <Tabs
          defaultValue="upcoming"
          value={activeTab}
          onValueChange={setActiveTab}
          className="px-6"
        >
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
          <TabsContent value={activeTab} className="mt-4">
            {isLoading ? (
              <LoadingState message="Loading appointments..." variant="default" />
            ) : appointments.length === 0 ? (
              <div className="text-center py-10">
                <div className="text-muted-foreground mb-4">
                  No appointments found
                </div>
                <Button onClick={handleCreateAppointment}>Create New Appointment</Button>
              </div>
            ) : (
              <>
                <div className="mb-4 text-sm text-muted-foreground">
                  Displaying {filteredAppointments.length} of {appointments.length} appointments
                </div>
                <AppointmentList
                  appointments={filteredAppointments}
                  isLoading={false}
                  activeTab={activeTab}
                  handleStatusChange={handleStatusChange}
                  handleDeleteAppointment={handleDeleteAppointment}
                  onCreateAppointment={handleCreateAppointment}
                />
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AppointmentsTab;
