import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppointments } from "@/hooks/useAppointments";
import { toast } from "sonner";
import { 
  CalendarIcon, 
  FilterIcon, 
  RefreshCcw, 
  AlertTriangle,
  Download,
  TrendingUp,
  Clock,
  Users,
  DollarSign,
  MapPin,
  Search,
  MoreVertical,
  Eye,
  Phone,
  Mail,
  Calendar as CalendarIcon2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from "date-fns";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import AppointmentBookingButton from "@/components/appointment/AppointmentBookingButton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const EnhancedAppointmentsTab = () => {
  const [activeTab, setActiveTab] = useState("upcoming");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [dateRange, setDateRange] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  
  const { 
    appointments, 
    isLoading, 
    error,
    getAppointments, 
    updateAppointmentStatus, 
    cancelAppointment 
  } = useAppointments();

  useEffect(() => {
    fetchAppointments();
  }, []);
  
  const fetchAppointments = async () => {
    try {
      await getAppointments();
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

  // Enhanced filtering logic
  const filteredAppointments = appointments.filter((appointment) => {
    // Status filter
    let matchesStatus = true;
    if (activeTab !== "all") {
      if (activeTab === "upcoming") {
        matchesStatus = ["scheduled", "confirmed", "en_route"].includes(appointment.status);
      } else if (activeTab === "completed") {
        matchesStatus = appointment.status === "completed";
      } else if (activeTab === "cancelled") {
        matchesStatus = ["cancelled", "no-show"].includes(appointment.status);
      }
    }
    
    if (statusFilter !== "all") {
      matchesStatus = appointment.status === statusFilter;
    }

    // Date range filter
    let matchesDateRange = true;
    if (appointment.appointment_date) {
      const appointmentDate = new Date(appointment.appointment_date);
      const today = new Date();
      
      switch (dateRange) {
        case "today":
          matchesDateRange = format(appointmentDate, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");
          break;
        case "week":
          const weekStart = startOfWeek(today);
          const weekEnd = endOfWeek(today);
          matchesDateRange = appointmentDate >= weekStart && appointmentDate <= weekEnd;
          break;
        case "month":
          const monthStart = startOfMonth(today);
          const monthEnd = endOfMonth(today);
          matchesDateRange = appointmentDate >= monthStart && appointmentDate <= monthEnd;
          break;
      }
    }

    // Selected date filter
    if (selectedDate && appointment.appointment_date) {
      const appointmentDate = new Date(appointment.appointment_date);
      matchesDateRange = format(appointmentDate, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd");
    }

    // Service type filter
    const matchesService = serviceFilter === "all" || 
      appointment.service_type?.toLowerCase().includes(serviceFilter.toLowerCase());

    // Search filter
    const matchesSearch = !searchQuery || 
      (appointment.patient_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      appointment.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      appointment.patient_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      appointment.patient_phone?.includes(searchQuery) ||
      appointment.zipcode?.includes(searchQuery));

    return matchesStatus && matchesDateRange && matchesService && matchesSearch;
  });

  // Statistics calculations
  const stats = {
    total: appointments.length,
    upcoming: appointments.filter(a => ["scheduled", "confirmed", "en_route"].includes(a.status)).length,
    completed: appointments.filter(a => a.status === "completed").length,
    cancelled: appointments.filter(a => ["cancelled", "no-show"].includes(a.status)).length,
    revenue: appointments
      .filter(a => a.status === "completed")
      .reduce((sum, a) => sum + (a.total_amount || 0), 0),
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled":
      case "confirmed":
        return "bg-blue-500 hover:bg-blue-600";
      case "en_route":
        return "bg-purple-500 hover:bg-purple-600";
      case "completed":
        return "bg-green-500 hover:bg-green-600";
      case "cancelled":
        return "bg-red-500 hover:bg-red-600";
      case "no-show":
        return "bg-amber-500 hover:bg-amber-600";
      default:
        return "bg-gray-500 hover:bg-gray-600";
    }
  };

  const exportAppointments = () => {
    // Create CSV export
    const csvContent = [
      "Date,Time,Patient,Phone,Email,Address,Status,Service,Amount",
      ...filteredAppointments.map(apt => [
        format(new Date(apt.appointment_date), "yyyy-MM-dd"),
        apt.appointment_time || "",
        apt.patient_name || "",
        apt.patient_phone || "",
        apt.patient_email || "",
        apt.address || "",
        apt.status,
        apt.service_type || "",
        apt.total_amount || 0
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `appointments-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-2xl font-bold">Appointments</CardTitle>
          <Button onClick={fetchAppointments} variant="outline">
            <RefreshCcw className="h-4 w-4 mr-2" />
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
          <Button onClick={fetchAppointments}>Try Again</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Upcoming</p>
                <p className="text-2xl font-bold text-blue-600">{stats.upcoming}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Cancelled</p>
                <p className="text-2xl font-bold text-red-600">{stats.cancelled}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Revenue</p>
                <p className="text-2xl font-bold text-green-600">
                  ${(stats.revenue / 100).toFixed(2)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Appointments Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-2xl font-bold">Appointments</CardTitle>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <FilterIcon className="h-4 w-4 mr-2" />
              Filters
            </Button>
            <Button
              variant="outline" 
              size="sm"
              onClick={exportAppointments}
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button onClick={fetchAppointments} variant="outline" size="sm">
              <RefreshCcw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <AppointmentBookingButton />
          </div>
        </CardHeader>

        {/* Enhanced Filters */}
        {showFilters && (
          <div className="px-6 py-4 border-b bg-muted/30">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Search */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Patient, address, phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Date Range */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Date Range</label>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="all">All Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Status Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="en_route">En Route</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="no-show">No Show</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Service Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Service</label>
                <Select value={serviceFilter} onValueChange={setServiceFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Services</SelectItem>
                    <SelectItem value="basic">Basic Lab Draw</SelectItem>
                    <SelectItem value="executive">Executive Package</SelectItem>
                    <SelectItem value="wellness">Wellness Panel</SelectItem>
                    <SelectItem value="hormone">Hormone Testing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Custom Date Picker */}
            <div className="flex items-center gap-4 mt-4">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {(selectedDate || searchQuery || statusFilter !== "all" || serviceFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedDate(undefined);
                    setSearchQuery("");
                    setStatusFilter("all");
                    setServiceFilter("all");
                    setDateRange("today");
                  }}
                >
                  Clear All Filters
                </Button>
              )}
            </div>
          </div>
        )}

        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="px-6 pt-4">
            <TabsList>
              <TabsTrigger value="upcoming">Upcoming ({stats.upcoming})</TabsTrigger>
              <TabsTrigger value="completed">Completed ({stats.completed})</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled ({stats.cancelled})</TabsTrigger>
              <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
            </TabsList>
            
            <TabsContent value={activeTab} className="mt-4">
              {isLoading ? (
                <LoadingState message="Loading appointments..." />
              ) : filteredAppointments.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-muted-foreground mb-4">No appointments found</p>
                  <AppointmentBookingButton />
                </div>
              ) : (
                <>
                  <div className="mb-4 text-sm text-muted-foreground">
                    Showing {filteredAppointments.length} of {appointments.length} appointments
                  </div>
                  
                  {/* Enhanced Table */}
                  <div className="rounded-md border overflow-x-auto">
                    <Table className="min-w-[700px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Patient Info</TableHead>
                          <TableHead>Date & Time</TableHead>
                          <TableHead>Service</TableHead>
                          <TableHead>Address</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAppointments.map((appointment) => (
                          <TableRow key={appointment.id} className="hover:bg-muted/50">
                            <TableCell>
                              <div className="space-y-1">
                                <p className="font-medium">{appointment.patient_name || "Unknown"}</p>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  {appointment.patient_phone && (
                                    <div className="flex items-center gap-1">
                                      <Phone className="h-3 w-3" />
                                      {appointment.patient_phone}
                                    </div>
                                  )}
                                  {appointment.patient_email && (
                                    <div className="flex items-center gap-1">
                                      <Mail className="h-3 w-3" />
                                      {appointment.patient_email}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            
                            <TableCell>
                              <div className="space-y-1">
                                <p className="font-medium">
                                  {appointment.appointment_date
                                    ? format(new Date(String(appointment.appointment_date).substring(0, 10) + 'T12:00:00'), "MMM d, yyyy")
                                    : "Unknown"
                                  }
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {(appointment as any).appointment_time || appointment.time || "Time TBD"}
                                </p>
                              </div>
                            </TableCell>

                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {((appointment as any).service_type || appointment.service_name || "Blood Draw").replace(/_|-/g, ' ')}
                              </Badge>
                            </TableCell>
                            
                            <TableCell className="max-w-[200px]">
                              <div className="flex items-start gap-1">
                                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                                <span className="truncate" title={appointment.address}>
                                  {appointment.address}
                                </span>
                              </div>
                            </TableCell>
                            
                            <TableCell>
                              <Badge className={getStatusColor(appointment.status)}>
                                {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1).replace('_', ' ')}
                              </Badge>
                            </TableCell>
                            
                            <TableCell>
                              <span className="font-medium">
                                ${((appointment as any).total_amount || 0).toFixed(2)}
                              </span>
                            </TableCell>
                            
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setSelectedAppointment(appointment)}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-2xl">
                                    <DialogHeader>
                                      <DialogTitle>Appointment Details</DialogTitle>
                                    </DialogHeader>
                                    {selectedAppointment && (
                                      <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                          <div>
                                            <h4 className="font-medium mb-2">Patient Information</h4>
                                            <div className="space-y-1 text-sm">
                                              <p><strong>Name:</strong> {selectedAppointment.patient_name}</p>
                                              <p><strong>Phone:</strong> {selectedAppointment.patient_phone}</p>
                                              <p><strong>Email:</strong> {selectedAppointment.patient_email}</p>
                                            </div>
                                          </div>
                                          <div>
                                            <h4 className="font-medium mb-2">Appointment Details</h4>
                                            <div className="space-y-1 text-sm">
                                              <p><strong>Date:</strong> {format(new Date(selectedAppointment.appointment_date), "PPP")}</p>
                                              <p><strong>Time:</strong> {selectedAppointment.appointment_time}</p>
                                              <p><strong>Service:</strong> {selectedAppointment.service_type}</p>
                                              <p><strong>Status:</strong> {selectedAppointment.status}</p>
                                            </div>
                                          </div>
                                        </div>
                                        <div>
                                          <h4 className="font-medium mb-2">Address</h4>
                                          <p className="text-sm">{selectedAppointment.address}</p>
                                        </div>
                                        {selectedAppointment.notes && (
                                          <div>
                                            <h4 className="font-medium mb-2">Notes</h4>
                                            <p className="text-sm">{selectedAppointment.notes}</p>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </DialogContent>
                                </Dialog>

                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {appointment.status === "scheduled" && (
                                      <>
                                        <DropdownMenuItem onClick={() => handleStatusChange(appointment.id, "confirmed")}>
                                          Confirm Appointment
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleStatusChange(appointment.id, "completed")}>
                                          Mark Completed
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleStatusChange(appointment.id, "no-show")}>
                                          Mark No-Show
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                    {appointment.status === "confirmed" && (
                                      <>
                                        <DropdownMenuItem onClick={() => handleStatusChange(appointment.id, "en_route")}>
                                          Mark En Route
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleStatusChange(appointment.id, "completed")}>
                                          Mark Completed
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                    {appointment.status === "en_route" && (
                                      <DropdownMenuItem onClick={() => handleStatusChange(appointment.id, "completed")}>
                                        Mark Completed
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem 
                                      className="text-red-600"
                                      onClick={() => handleDeleteAppointment(appointment.id)}
                                    >
                                      Cancel Appointment
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default EnhancedAppointmentsTab;