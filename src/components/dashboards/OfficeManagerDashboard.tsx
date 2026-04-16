import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Calendar, Users, Clock, Plus, Search, RefreshCw, Download,
  DollarSign, ChevronDown, Phone, Mail, CalendarDays, Filter,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { format, startOfWeek, startOfMonth } from 'date-fns';
import AdminCalendar from "@/components/calendar/AdminCalendar";
import TodayExecutionView from "@/components/dashboards/admin/TodayExecutionView";

type ViewMode = 'table' | 'calendar';
type DateFilter = 'today' | 'week' | 'month' | 'all';

const OfficeManagerDashboard = () => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [dateFilter, setDateFilter] = useState<DateFilter>('week');
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null);
  const [stats, setStats] = useState({ today: 0, thisWeek: 0, completed: 0, scheduled: 0, revenue: 0, patients: 0 });

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .order('appointment_date', { ascending: false })
        .order('appointment_time', { ascending: true })
        .limit(200);

      if (error) throw error;
      setAppointments(data || []);

      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');
      const weekStartStr = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const monthStartStr = format(startOfMonth(now), 'yyyy-MM-dd');

      const todayAppts = (data || []).filter(a => a.appointment_date?.substring(0, 10) === todayStr && a.status !== 'cancelled');
      const weekAppts = (data || []).filter(a => a.appointment_date?.substring(0, 10) >= weekStartStr && a.status !== 'cancelled');
      const revenue = (data || []).filter(a => a.payment_status === 'completed' && a.appointment_date?.substring(0, 10) >= monthStartStr)
        .reduce((s, a) => s + (a.total_amount || 0), 0);

      const { count: patientCount } = await supabase.from('tenant_patients').select('*', { count: 'exact', head: true });

      setStats({
        today: todayAppts.length,
        thisWeek: weekAppts.length,
        completed: (data || []).filter(a => a.status === 'completed').length,
        scheduled: (data || []).filter(a => a.status === 'scheduled' || a.status === 'confirmed').length,
        revenue,
        patients: patientCount || 0,
      });
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAppointments(); }, []);

  const getPatientName = (appt: any): string => {
    if (appt.patient_name) return appt.patient_name;
    if (appt.notes?.match(/Patient:\s*([^|]+)/)) return appt.notes.match(/Patient:\s*([^|]+)/)[1].trim();
    return appt.service_name || 'Appointment';
  };

  const getPatientContact = (appt: any) => {
    return {
      email: appt.patient_email || appt.notes?.match(/Email:\s*([^|\s]+)/)?.[1]?.trim(),
      phone: appt.patient_phone || appt.notes?.match(/Phone:\s*([^|\s]+)/)?.[1]?.trim(),
    };
  };

  // Attention needed items
  const overdueInvoices = appointments.filter(a => a.invoice_status === 'sent' && a.invoice_due_at && new Date(a.invoice_due_at) < new Date() && a.status !== 'cancelled');
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayUpcoming = appointments.filter(a => a.appointment_date?.substring(0, 10) === todayStr && ['scheduled', 'confirmed'].includes(a.status));
  const missingLabOrders = todayUpcoming.filter(a => !a.lab_order_file_path && ['mobile', 'senior'].includes(a.service_type));

  const filteredAppointments = useMemo(() => {
    let filtered = appointments;
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const weekStartStr = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const monthStartStr = format(startOfMonth(now), 'yyyy-MM-dd');

    if (dateFilter === 'today') filtered = filtered.filter(a => a.appointment_date?.substring(0, 10) === todayStr);
    else if (dateFilter === 'week') filtered = filtered.filter(a => a.appointment_date?.substring(0, 10) >= weekStartStr);
    else if (dateFilter === 'month') filtered = filtered.filter(a => a.appointment_date?.substring(0, 10) >= monthStartStr);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(a => getPatientName(a).toLowerCase().includes(q) || a.address?.toLowerCase().includes(q) || a.service_type?.toLowerCase().includes(q));
    }
    return filtered;
  }, [appointments, dateFilter, searchQuery]);

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('appointments').update({ status: newStatus }).eq('id', id);
    if (error) { toast.error('Failed to update'); return; }
    toast.success(`Status: ${newStatus}`);
    fetchAppointments();
  };

  const exportCSV = () => {
    const headers = ['Patient', 'Date', 'Time', 'Service', 'Status', 'Amount', 'Payment', 'Address'];
    const rows = filteredAppointments.map(a => [
      getPatientName(a), a.appointment_date?.substring(0, 10) || '', a.appointment_time || '',
      a.service_type || '', a.status, a.total_amount || 0, a.payment_status || '', a.address || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `convelabs-appointments-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    toast.success('CSV exported');
  };

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
      confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      en_route: 'bg-amber-50 text-amber-700 border-amber-200',
      in_progress: 'bg-purple-50 text-purple-700 border-purple-200',
      completed: 'bg-gray-50 text-gray-600 border-gray-200',
      cancelled: 'bg-red-50 text-red-700 border-red-200',
    };
    return map[status] || 'bg-gray-50 text-gray-600';
  };

  if (viewMode === 'calendar') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Calendar View</h1>
          <Button variant="outline" size="sm" onClick={() => setViewMode('table')}>
            <CalendarDays className="h-4 w-4 mr-1" /> Table View
          </Button>
        </div>
        <AdminCalendar />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground text-sm">Welcome, {user?.firstName || "Admin"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setViewMode('calendar')}>
            <Calendar className="h-4 w-4 mr-1" /> Calendar
          </Button>
          <Button variant="outline" size="sm" onClick={fetchAppointments}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white" asChild>
            <Link to={`/dashboard/${user?.role || 'office_manager'}/calendar`}><Plus className="h-4 w-4 mr-1" /> Schedule</Link>
          </Button>
        </div>
      </div>

      {/* Today's Execution — Hormozi "money dashboard" */}
      <TodayExecutionView basePath={`/dashboard/${user?.role || 'office_manager'}`} />

      {/* Attention Needed */}
      {(overdueInvoices.length > 0 || missingLabOrders.length > 0) && (
        <div className="space-y-2">
          {overdueInvoices.length > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
              <DollarSign className="h-4 w-4 text-red-600 flex-shrink-0" />
              <span className="text-sm text-red-800 font-medium">{overdueInvoices.length} overdue invoice{overdueInvoices.length !== 1 ? 's' : ''} need attention</span>
              <Button variant="ghost" size="sm" className="ml-auto text-xs text-red-700" asChild>
                <Link to={`/dashboard/${user?.role || 'office_manager'}/invoices`}>View →</Link>
              </Button>
            </div>
          )}
          {missingLabOrders.length > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
              <Calendar className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <span className="text-sm text-amber-800 font-medium">{missingLabOrders.length} appointment{missingLabOrders.length !== 1 ? 's' : ''} today without lab orders</span>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Today', value: stats.today, icon: Clock, color: 'text-blue-600 bg-blue-50' },
          { label: 'This Week', value: stats.thisWeek, icon: Calendar, color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Scheduled', value: stats.scheduled, icon: CalendarDays, color: 'text-teal-600 bg-teal-50' },
          { label: 'Completed', value: stats.completed, icon: Users, color: 'text-gray-600 bg-gray-50' },
          { label: 'Revenue MTD', value: `$${stats.revenue.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Patients', value: stats.patients, icon: Users, color: 'text-purple-600 bg-purple-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-muted-foreground uppercase">{label}</span>
                <div className={`h-7 w-7 rounded-lg ${color} flex items-center justify-center`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>
              <p className="text-xl font-bold">{loading ? '—' : value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters & Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Appointments</CardTitle>
              <p className="text-xs text-muted-foreground">{filteredAppointments.length} results</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Date filter buttons */}
              {(['today', 'week', 'month', 'all'] as DateFilter[]).map(f => (
                <Button
                  key={f}
                  variant={dateFilter === f ? 'default' : 'outline'}
                  size="sm"
                  className={`text-xs h-8 ${dateFilter === f ? 'bg-[#B91C1C] hover:bg-[#991B1B]' : ''}`}
                  onClick={() => setDateFilter(f)}
                >
                  {f === 'today' ? 'Today' : f === 'week' ? 'This Week' : f === 'month' ? 'This Month' : 'All'}
                </Button>
              ))}
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-2 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 w-48 text-xs"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-muted/50 animate-pulse rounded" />)}</div>
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
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAppointments.slice(0, 50).map((appt) => {
                    const contact = getPatientContact(appt);
                    return (
                      <TableRow key={appt.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setSelectedAppt(selectedAppt?.id === appt.id ? null : appt)}>
                        <TableCell>
                          <p className="font-medium text-sm">{getPatientName(appt)}</p>
                          {contact.phone && <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{contact.phone}</p>}
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{appt.appointment_date ? format(new Date(appt.appointment_date), 'MMM d, yyyy') : '—'}</p>
                          <p className="text-xs text-muted-foreground">{appt.appointment_time || ''}</p>
                        </TableCell>
                        <TableCell className="text-sm capitalize">{(appt.service_type || '—').replace(/_|-/g, ' ')}</TableCell>
                        <TableCell className="text-sm font-medium">{appt.total_amount ? `$${appt.total_amount}` : '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${statusColor(appt.status)}`}>{appt.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {appt.payment_status === 'completed' ? (
                            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Paid</Badge>
                          ) : appt.invoice_status === 'sent' ? (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Invoice Sent</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-1" onClick={e => e.stopPropagation()}>
                          {appt.status === 'scheduled' && (
                            <>
                              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleStatusUpdate(appt.id, 'confirmed')}>Confirm</Button>
                              <Button variant="ghost" size="sm" className="text-xs h-7 text-red-600" onClick={() => { if (confirm('Cancel?')) handleStatusUpdate(appt.id, 'cancelled'); }}>Cancel</Button>
                            </>
                          )}
                          {appt.status === 'confirmed' && (
                            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleStatusUpdate(appt.id, 'completed')}>Complete</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Expanded detail for selected appointment */}
          {selectedAppt && (
            <div className="mt-4 p-4 bg-muted/30 rounded-lg border space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <h4 className="font-semibold">Appointment Details</h4>
                <Button variant="ghost" size="sm" onClick={() => setSelectedAppt(null)}>Close</Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div><span className="text-muted-foreground">Patient:</span> <p className="font-medium">{getPatientName(selectedAppt)}</p></div>
                <div><span className="text-muted-foreground">Address:</span> <p>{selectedAppt.address || '—'}</p></div>
                <div><span className="text-muted-foreground">Zipcode:</span> <p>{selectedAppt.zipcode || '—'}</p></div>
                <div><span className="text-muted-foreground">Service:</span> <p className="capitalize">{(selectedAppt.service_type || '—').replace(/_|-/g, ' ')}</p></div>
                <div><span className="text-muted-foreground">Amount:</span> <p className="font-medium">${selectedAppt.total_amount || 0}</p></div>
                <div><span className="text-muted-foreground">Tip:</span> <p>${selectedAppt.tip_amount || 0}</p></div>
                <div><span className="text-muted-foreground">Payment:</span> <p>{selectedAppt.payment_status || 'pending'}</p></div>
                <div><span className="text-muted-foreground">Booking:</span> <p>{selectedAppt.booking_source || 'online'}</p></div>
              </div>
              {selectedAppt.notes && <div><span className="text-xs text-muted-foreground">Notes:</span> <p className="text-xs">{selectedAppt.notes}</p></div>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OfficeManagerDashboard;
