import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Calendar, DollarSign, TrendingUp, Clock, Settings,
  Briefcase, Mail, Package, ArrowRight, Activity, AlertTriangle,
  MessageSquare, FileText, CalendarPlus, ChevronRight, UserPlus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, endOfWeek, startOfMonth, subWeeks } from 'date-fns';
import RevenueChart from './charts/RevenueChart';
import ServiceBreakdown from './charts/ServiceBreakdown';

const SERVICE_COLORS: Record<string, string> = {
  mobile: '#B91C1C', 'in-office': '#3B82F6', senior: '#7C3AED',
  therapeutic: '#0D9488', 'specialty-kit': '#D97706', other: '#6B7280',
};

const SuperAdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalAppointments: 0, thisWeekAppointments: 0, completedToday: 0,
    revenueMTD: 0, totalPatients: 0, newPatientsMonth: 0,
    overdueInvoices: 0, todayAppointments: 0, cancelledMonth: 0,
    avgRevenue: 0,
  });
  const [recentAppointments, setRecentAppointments] = useState<any[]>([]);
  const [weeklyRevenue, setWeeklyRevenue] = useState<{ label: string; revenue: number; tips: number }[]>([]);
  const [serviceData, setServiceData] = useState<{ name: string; value: number; color: string }[]>([]);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');
      const weekStartStr = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const monthStartStr = format(startOfMonth(now), 'yyyy-MM-dd');

      // Parallel queries
      const [
        { count: totalAppts },
        { count: weekAppts },
        { count: todayAppts },
        { count: todayCompleted },
        { count: totalPatients },
        { count: newPatients },
        { count: overdueInvoices },
        { count: cancelledMonth },
        { data: revenueAppts },
        { data: recent },
        { data: allMonthAppts },
      ] = await Promise.all([
        supabase.from('appointments').select('*', { count: 'exact', head: true }),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).gte('appointment_date', weekStartStr),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).gte('appointment_date', `${todayStr}T00:00:00`).lte('appointment_date', `${todayStr}T23:59:59`).not('status', 'eq', 'cancelled'),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'completed').gte('appointment_date', todayStr),
        supabase.from('tenant_patients').select('*', { count: 'exact', head: true }),
        supabase.from('tenant_patients').select('*', { count: 'exact', head: true }).gte('created_at', monthStartStr),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).in('invoice_status', ['sent', 'reminded']).eq('is_vip', false),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'cancelled').gte('appointment_date', monthStartStr),
        supabase.from('appointments').select('total_amount, tip_amount, service_type, appointment_date').eq('payment_status', 'completed').gte('appointment_date', monthStartStr),
        supabase.from('appointments').select('*').order('appointment_date', { ascending: false }).limit(10),
        supabase.from('appointments').select('service_type').gte('appointment_date', monthStartStr).not('status', 'eq', 'cancelled'),
      ]);

      const revenueMTD = revenueAppts?.reduce((s, a) => s + (a.total_amount || 0), 0) || 0;
      const completedCount = revenueAppts?.length || 1;

      setStats({
        totalAppointments: totalAppts || 0,
        thisWeekAppointments: weekAppts || 0,
        todayAppointments: todayAppts || 0,
        completedToday: todayCompleted || 0,
        revenueMTD,
        totalPatients: totalPatients || 0,
        newPatientsMonth: newPatients || 0,
        overdueInvoices: overdueInvoices || 0,
        cancelledMonth: cancelledMonth || 0,
        avgRevenue: Math.round(revenueMTD / completedCount),
      });

      setRecentAppointments(recent || []);

      // Build weekly revenue chart (last 6 weeks)
      const weeklyData: { label: string; revenue: number; tips: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const wStart = subWeeks(startOfWeek(now, { weekStartsOn: 1 }), i);
        const wEnd = endOfWeek(wStart, { weekStartsOn: 1 });
        const wLabel = format(wStart, 'MMM d');
        const weekRevAppts = revenueAppts?.filter(a => {
          const d = a.appointment_date?.substring(0, 10);
          return d >= format(wStart, 'yyyy-MM-dd') && d <= format(wEnd, 'yyyy-MM-dd');
        }) || [];
        weeklyData.push({
          label: wLabel,
          revenue: weekRevAppts.reduce((s, a) => s + (a.total_amount || 0), 0),
          tips: weekRevAppts.reduce((s, a) => s + (a.tip_amount || 0), 0),
        });
      }
      setWeeklyRevenue(weeklyData);

      // Build service breakdown
      const serviceCounts: Record<string, number> = {};
      (allMonthAppts || []).forEach((a: any) => {
        const type = a.service_type || 'other';
        serviceCounts[type] = (serviceCounts[type] || 0) + 1;
      });
      setServiceData(
        Object.entries(serviceCounts).map(([name, value]) => ({
          name,
          value,
          color: SERVICE_COLORS[name] || SERVICE_COLORS.other,
        })).sort((a, b) => b.value - a.value)
      );
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getPatientName = (appt: any) => {
    if (appt.notes?.startsWith('Patient: ')) return appt.notes.split(' | ')[0].replace('Patient: ', '');
    return appt.patient_email || appt.patient_name || 'Unknown Patient';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Owner Dashboard</h1>
          <p className="text-muted-foreground text-sm">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard/super_admin/calendar"><Calendar className="h-4 w-4 mr-1" /> Calendar</Link>
          </Button>
          <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white" asChild>
            <Link to="/dashboard/super_admin/calendar"><CalendarPlus className="h-4 w-4 mr-1" /> Schedule</Link>
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {(stats.overdueInvoices > 0 || stats.cancelledMonth > 3) && (
        <div className="flex flex-wrap gap-3">
          {stats.overdueInvoices > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-amber-800 font-medium">{stats.overdueInvoices} overdue invoice{stats.overdueInvoices !== 1 ? 's' : ''}</span>
            </div>
          )}
          {stats.cancelledMonth > 3 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-red-700 font-medium">{stats.cancelledMonth} cancellations this month</span>
            </div>
          )}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Today', value: stats.todayAppointments, icon: Clock, color: 'text-blue-600 bg-blue-50' },
          { label: 'This Week', value: stats.thisWeekAppointments, icon: Calendar, color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Revenue MTD', value: `$${stats.revenueMTD.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Patients', value: stats.totalPatients, icon: Users, color: 'text-purple-600 bg-purple-50' },
          { label: 'New This Month', value: stats.newPatientsMonth, icon: UserPlus, color: 'text-teal-600 bg-teal-50' },
          { label: 'Avg Revenue', value: `$${stats.avgRevenue}`, icon: TrendingUp, color: 'text-amber-600 bg-amber-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <div className={`h-8 w-8 rounded-lg ${color} flex items-center justify-center`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="text-xl font-bold">{loading ? '—' : value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Weekly Revenue & Tips</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[260px] bg-muted/50 animate-pulse rounded" />
            ) : (
              <RevenueChart data={weeklyRevenue} />
            )}
          </CardContent>
        </Card>

        {/* Service Breakdown */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Services This Month</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[200px] bg-muted/50 animate-pulse rounded" />
            ) : (
              <ServiceBreakdown data={serviceData} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Profit First Allocations */}
      {!loading && stats.revenueMTD > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-[#B91C1C]" />
              Profit First Allocations (This Month)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Owner's Pay", pct: 25, color: 'bg-[#B91C1C]' },
                { label: 'Profit', pct: 15, color: 'bg-emerald-500' },
                { label: 'Operating Expenses', pct: 30, color: 'bg-blue-500' },
                { label: 'Phlebotomist Pay', pct: 30, color: 'bg-purple-500' },
              ].map(({ label, pct, color }) => {
                const amount = (stats.revenueMTD * pct) / 100;
                return (
                  <div key={label} className="text-center">
                    <div className={`h-2 ${color} rounded-full mb-2`} style={{ width: `${pct}%`, minWidth: '40%', margin: '0 auto' }} />
                    <p className="text-lg font-bold">${amount.toFixed(0)}</p>
                    <p className="text-[10px] text-muted-foreground">{label} ({pct}%)</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Based on ${stats.revenueMTD.toLocaleString()} MTD revenue</span>
              <span className="text-[10px] text-muted-foreground">Recommended allocations — adjust in Settings</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Appointments + Quick Actions */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Activity</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/dashboard/super_admin/appointments">View all <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-12 bg-muted/50 animate-pulse rounded" />)}</div>
            ) : recentAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No appointments yet</p>
            ) : (
              <div className="divide-y">
                {recentAppointments.map((appt) => (
                  <div key={appt.id} className="flex items-center justify-between py-3 gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{getPatientName(appt)}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span className="capitalize">{(appt.service_type || 'blood draw').replace(/_|-/g, ' ')}</span>
                        {appt.total_amount > 0 && <span className="text-emerald-600 font-medium">${appt.total_amount}</span>}
                        {appt.payment_status === 'completed' && <DollarSign className="h-3 w-3 text-emerald-500" />}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {appt.appointment_date ? format(new Date(appt.appointment_date), 'MMM d') : ''}
                      </p>
                      <Badge variant="outline" className={`text-[10px] mt-0.5 ${
                        appt.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' :
                        appt.status === 'scheduled' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        appt.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        appt.status === 'cancelled' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-gray-50 text-gray-600'
                      }`}>
                        {appt.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {[
                { title: 'Calendar', icon: Calendar, link: '/dashboard/super_admin/calendar', desc: 'View & schedule' },
                { title: 'Appointments', icon: Clock, link: '/dashboard/super_admin/appointments', desc: 'Table view' },
                { title: 'SMS Messages', icon: MessageSquare, link: '/dashboard/super_admin/sms', desc: 'Patient messaging' },
                { title: 'Staff', icon: Briefcase, link: '/dashboard/super_admin/staff', desc: 'Manage team' },
                { title: 'Users', icon: Users, link: '/dashboard/super_admin/users', desc: 'Patient accounts' },
                { title: 'Services', icon: Package, link: '/dashboard/super_admin/services', desc: 'Pricing & catalog' },
                { title: 'Marketing', icon: Mail, link: '/dashboard/super_admin/marketing', desc: 'Campaigns' },
                { title: 'Settings', icon: Settings, link: '/dashboard/super_admin/settings', desc: 'Configuration' },
              ].map(({ title, icon: Icon, link, desc }) => (
                <Link
                  key={title}
                  to={link}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-[#B91C1C]/10 group-hover:text-[#B91C1C] transition-colors">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{title}</p>
                    <p className="text-[10px] text-muted-foreground">{desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
