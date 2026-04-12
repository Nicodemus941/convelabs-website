
import React, { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Users, Clock, Plus, Search, ArrowRight, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const OfficeManagerDashboard = () => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState({ today: 0, thisWeek: 0, completed: 0, scheduled: 0 });

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .order('appointment_date', { ascending: true })
        .limit(50);

      if (error) throw error;
      setAppointments(data || []);

      // Calculate stats
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());

      const today = (data || []).filter(a => a.appointment_date?.startsWith(todayStr)).length;
      const thisWeek = (data || []).filter(a => new Date(a.appointment_date) >= weekStart).length;
      const completed = (data || []).filter(a => a.status === 'completed').length;
      const scheduled = (data || []).filter(a => a.status === 'scheduled').length;

      setStats({ today, thisWeek, completed, scheduled });
    } catch (err) {
      console.error('Failed to fetch appointments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAppointments(); }, []);

  const getPatientName = (appt: any): string => {
    if (appt.notes?.startsWith('Patient: ')) {
      return appt.notes.split(' | ')[0].replace('Patient: ', '');
    }
    return appt.patient_email || 'Unknown';
  };

  const filteredAppointments = appointments.filter(a => {
    if (!searchQuery) return true;
    const name = getPatientName(a).toLowerCase();
    return name.includes(searchQuery.toLowerCase()) || a.address?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('appointments').update({ status: newStatus }).eq('id', id);
    if (error) { toast.error('Failed to update status'); return; }
    toast.success(`Status updated to ${newStatus}`);
    fetchAppointments();
  };

  const handleCancel = async (id: string) => {
    if (!window.confirm('Cancel this appointment?')) return;
    await handleStatusUpdate(id, 'cancelled');
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'en_route': return 'bg-orange-100 text-orange-800';
      case 'completed': return 'bg-gray-100 text-gray-700';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Welcome, {user?.firstName || "Admin"}. Manage appointments and patients.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchAppointments}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button size="sm" className="bg-conve-red hover:bg-conve-red-dark text-white" asChild>
            <Link to="/book-now"><Plus className="h-4 w-4 mr-1" /> Create Appointment</Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Today</p>
                <p className="text-2xl font-bold">{stats.today}</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">This Week</p>
                <p className="text-2xl font-bold">{stats.thisWeek}</p>
              </div>
              <Clock className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Scheduled</p>
                <p className="text-2xl font-bold">{stats.scheduled}</p>
              </div>
              <Users className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{stats.completed}</p>
              </div>
              <Users className="h-8 w-8 text-gray-400 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Appointments Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Appointments</CardTitle>
              <CardDescription>{filteredAppointments.length} appointments</CardDescription>
            </div>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search patient or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-conve-red w-64"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}
            </div>
          ) : filteredAppointments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No appointments found</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAppointments.map((appt) => (
                    <TableRow key={appt.id}>
                      <TableCell className="font-medium">{getPatientName(appt)}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {appt.appointment_date ? new Date(appt.appointment_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—'}
                        </div>
                        <div className="text-xs text-muted-foreground">{appt.appointment_time || ''}</div>
                      </TableCell>
                      <TableCell className="text-sm">{appt.service_type || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${statusColor(appt.status)}`}>
                          {appt.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {appt.status === 'scheduled' && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => handleStatusUpdate(appt.id, 'confirmed')}>Confirm</Button>
                            <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleCancel(appt.id)}>Cancel</Button>
                          </>
                        )}
                        {appt.status === 'confirmed' && (
                          <Button variant="ghost" size="sm" onClick={() => handleStatusUpdate(appt.id, 'completed')}>Complete</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OfficeManagerDashboard;
