
import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import SMSAppointmentDashboard from "@/components/admin/SMSAppointmentDashboard";
import { 
  Card, CardContent, CardDescription, CardHeader, CardTitle 
} from "@/components/ui/card";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { 
  Calendar, MessageSquare, Phone, Search, Users, Clock, AlertCircle 
} from "lucide-react";

const OfficeManagerDashboard = () => {
  const { user } = useAuth();

  // Mock data that would normally come from an API
  const upcomingAppointments = [
    { id: 1, patientName: "John Smith", date: "2025-05-18T10:00:00", address: "123 Main St, Orlando, FL", status: "confirmed", phlebotomist: "David Wilson" },
    { id: 2, patientName: "Jane Doe", date: "2025-05-18T13:30:00", address: "456 Oak Ave, Orlando, FL", status: "pending", phlebotomist: "Unassigned" },
    { id: 3, patientName: "Robert Johnson", date: "2025-05-18T15:00:00", address: "789 Pine Dr, Orlando, FL", status: "confirmed", phlebotomist: "Sarah Parker" },
    { id: 4, patientName: "Emily Davis", date: "2025-05-19T09:00:00", address: "321 Elm St, Orlando, FL", status: "confirmed", phlebotomist: "David Wilson" },
  ];

  const recentInquiries = [
    { id: 1, name: "Michael Brown", type: "Membership Question", timestamp: "Today, 9:15 AM", status: "New" },
    { id: 2, name: "Lisa Wilson", type: "Appointment Rescheduling", timestamp: "Today, 8:30 AM", status: "Responded" },
    { id: 3, name: "Thomas Lee", type: "Billing Inquiry", timestamp: "Yesterday, 4:45 PM", status: "New" },
  ];

  const phlebotomistSchedule = [
    { name: "David Wilson", status: "Active", appointments: 3, nextAppointment: "Today, 10:00 AM" },
    { name: "Sarah Parker", status: "Active", appointments: 2, nextAppointment: "Today, 11:30 AM" },
    { name: "James Moore", status: "Off Duty", appointments: 0, nextAppointment: "Tomorrow, 9:00 AM" },
  ];

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            Welcome, {user?.firstName || "Office Manager"}
          </h1>
          <p className="text-muted-foreground">
            Manage appointments, patient inquiries, and staff schedules
          </p>
        </div>
        <div className="flex gap-2 mt-4 md:mt-0">
          <Button variant="outline" className="flex items-center gap-2">
            <Phone className="h-4 w-4" /> View Call Log
          </Button>
          <Button className="flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Schedule Appointment
          </Button>
        </div>
      </div>

      {/* Dashboard Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Appointments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">8</div>
            <p className="text-xs text-muted-foreground mt-1">3 completed, 5 remaining</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">New Patient Inquiries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">12</div>
            <p className="text-xs text-muted-foreground mt-1">5 unresponded</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Phlebotomists On Duty</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">4</div>
            <p className="text-xs text-muted-foreground mt-1">2 currently with patients</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Alert Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <div className="text-green-500 font-bold flex items-center">
                <div className="h-3 w-3 rounded-full bg-green-500 mr-2"></div>
                All Systems Normal
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Last incident: 5 days ago</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="appointments">
        <TabsList className="mb-6">
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="staff">Staff Management</TabsTrigger>
          <TabsTrigger value="inquiries">Customer Inquiries</TabsTrigger>
          <TabsTrigger value="sms">SMS Communications</TabsTrigger>
        </TabsList>

        <TabsContent value="appointments">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Upcoming Appointments</CardTitle>
                <CardDescription>Manage and view all scheduled appointments</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <input 
                    type="text" 
                    placeholder="Search appointments..." 
                    className="pl-8 pr-4 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-conve-red"
                  />
                </div>
                <Button variant="outline" className="text-sm">Filter</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Phlebotomist</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcomingAppointments.map((appointment) => (
                      <TableRow key={appointment.id}>
                        <TableCell className="font-medium">{appointment.patientName}</TableCell>
                        <TableCell>
                          {new Date(appointment.date).toLocaleString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </TableCell>
                        <TableCell>{appointment.address}</TableCell>
                        <TableCell>{appointment.phlebotomist}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            appointment.status === 'confirmed' ? 'bg-green-100 text-green-800' : 
                            appointment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {appointment.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">View</Button>
                          <Button variant="ghost" size="sm">Edit</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex justify-between">
                <div className="text-sm text-muted-foreground">Showing 4 of 24 appointments</div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled>Previous</Button>
                  <Button variant="outline" size="sm">Next</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff">
          <Card>
            <CardHeader>
              <CardTitle>Staff Management</CardTitle>
              <CardDescription>Manage phlebotomist schedules and assignments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium text-lg mb-4">Phlebotomist Schedule</h3>
                  
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Today's Appointments</TableHead>
                          <TableHead>Next Appointment</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {phlebotomistSchedule.map((staff, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{staff.name}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                staff.status === 'Active' ? 'bg-green-100 text-green-800' : 
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {staff.status}
                              </span>
                            </TableCell>
                            <TableCell>{staff.appointments}</TableCell>
                            <TableCell>{staff.nextAppointment}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm">Message</Button>
                              <Button variant="ghost" size="sm">View Schedule</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <h3 className="font-medium text-lg mb-4">Phlebotomist Assignment</h3>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Appointment</label>
                      <select className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red">
                        <option>Select appointment</option>
                        <option>Jane Doe - Today, 1:30 PM</option>
                        <option>Robert Johnson - Today, 3:00 PM</option>
                        <option>Emily Davis - Tomorrow, 9:00 AM</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Phlebotomist</label>
                      <select className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red">
                        <option>Select phlebotomist</option>
                        <option>David Wilson</option>
                        <option>Sarah Parker</option>
                        <option>James Moore</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <Button>Assign Phlebotomist</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inquiries">
          <Card>
            <CardHeader>
              <CardTitle>Customer Inquiries</CardTitle>
              <CardDescription>Manage and respond to patient questions and requests</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Inquiry Type</TableHead>
                        <TableHead>Time Received</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentInquiries.map((inquiry) => (
                        <TableRow key={inquiry.id}>
                          <TableCell className="font-medium">{inquiry.name}</TableCell>
                          <TableCell>{inquiry.type}</TableCell>
                          <TableCell>{inquiry.timestamp}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              inquiry.status === 'New' ? 'bg-red-100 text-red-800' : 
                              'bg-green-100 text-green-800'
                            }`}>
                              {inquiry.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm">View</Button>
                            <Button variant="ghost" size="sm">Respond</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="border rounded-lg p-4">
                  <h3 className="font-medium text-lg mb-4">Quick Response Templates</h3>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <Button variant="outline" className="justify-start">
                      <MessageSquare className="mr-2 h-4 w-4" /> Appointment Confirmation
                    </Button>
                    <Button variant="outline" className="justify-start">
                      <MessageSquare className="mr-2 h-4 w-4" /> Rescheduling Guidelines
                    </Button>
                    <Button variant="outline" className="justify-start">
                      <MessageSquare className="mr-2 h-4 w-4" /> Membership Benefits
                    </Button>
                    <Button variant="outline" className="justify-start">
                      <MessageSquare className="mr-2 h-4 w-4" /> Insurance Information
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sms">
          <SMSAppointmentDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OfficeManagerDashboard;
