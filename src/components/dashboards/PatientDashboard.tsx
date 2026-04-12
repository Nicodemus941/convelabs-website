
import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppointments } from "@/hooks/useAppointments";
import { Appointment } from "@/types/appointmentTypes";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, User, ArrowRight, Plus, Star, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import UpcomingAppointments from "@/components/appointments/UpcomingAppointments";
import AppointmentHistory from "@/components/appointments/AppointmentHistory";

const PatientDashboard = () => {
  const { user } = useAuth();
  const { getAppointments, appointments } = useAppointments();
  const [nextAppointment, setNextAppointment] = useState<Appointment | null>(null);

  useEffect(() => { getAppointments(); }, [getAppointments]);

  useEffect(() => {
    if (appointments?.length) {
      const upcoming = appointments
        .filter(appt => ['scheduled', 'confirmed'].includes(appt.status))
        .sort((a, b) => new Date(a.date || a.appointment_date || 0).getTime() - new Date(b.date || b.appointment_date || 0).getTime());
      setNextAppointment(upcoming[0] || null);
    }
  }, [appointments]);

  const upcomingCount = appointments?.filter(a => ['scheduled', 'confirmed'].includes(a.status)).length || 0;
  const completedCount = appointments?.filter(a => a.status === 'completed').length || 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Welcome */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {user?.firstName || 'Patient'}</h1>
          <p className="text-muted-foreground">Manage your appointments and health records</p>
        </div>
        <Button className="bg-conve-red hover:bg-conve-red-dark text-white" asChild>
          <Link to="/book-now"><Plus className="h-4 w-4 mr-1" /> Book Appointment</Link>
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Upcoming</p>
                <p className="text-2xl font-bold">{upcomingCount}</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{completedCount}</p>
              </div>
              <FileText className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Next Visit</p>
                <p className="text-sm font-bold">
                  {nextAppointment?.appointment_date
                    ? new Date(nextAppointment.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : 'None'}
                </p>
              </div>
              <Clock className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Membership</p>
                <p className="text-sm font-bold">Non-member</p>
              </div>
              <Star className="h-8 w-8 text-amber-500 opacity-50" />
            </div>
            <Button variant="link" size="sm" className="px-0 mt-1 text-xs text-conve-red" asChild>
              <Link to="/pricing">Upgrade & Save →</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Upcoming Appointments */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Upcoming Appointments</CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/book-now">Book New <ArrowRight className="ml-1 h-4 w-4" /></Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <UpcomingAppointments />
            </CardContent>
          </Card>

          {/* Appointment History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Past Appointments</CardTitle>
            </CardHeader>
            <CardContent>
              <AppointmentHistory />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Profile Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">My Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{user?.firstName} {user?.lastName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">{user?.email}</span>
              </div>
              {user?.phoneNumber && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">{user.phoneNumber}</span>
                </div>
              )}
              <Button variant="outline" size="sm" className="w-full mt-3" asChild>
                <Link to="/profile">Edit Profile</Link>
              </Button>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                <Link to="/book-now"><Calendar className="h-4 w-4 mr-2" /> Book Appointment</Link>
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                <Link to="/pricing"><Star className="h-4 w-4 mr-2" /> View Membership Plans</Link>
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                <Link to="/profile"><User className="h-4 w-4 mr-2" /> Update Profile</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PatientDashboard;
