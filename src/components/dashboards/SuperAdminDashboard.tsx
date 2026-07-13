import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Calendar, DollarSign, TrendingUp, TrendingDown, Clock, Settings,
  Briefcase, Mail, Package, ArrowRight, AlertTriangle,
  MessageSquare, ChevronRight, UserPlus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from '@/integrations/supabase/client';
import {
  format, startOfWeek, endOfWeek, startOfMonth, subWeeks, subMonths, getDate,
} from 'date-fns';
import RevenueChart from './charts/RevenueChart';
import ServiceBreakdown from './charts/ServiceBreakdown';
import TodayExecutionView from './admin/TodayExecutionView';

const SERVICE_COLORS: Record<string, string> = {
  mobile: '#B91C1C', 'in-office': '#3B82F6', senior: '#7C3AED',
  therapeutic: '#0D9488', 'specialty-kit': '#D97706', other: '#6B7280',
};

// 2026-07-14 (Fable 5 redesign): the whole "money" side of this dashboard now
// reads a SINGLE source of truth — stripe_qb_sync_log (actual Stripe deposits).
// Before, the headline MTD read Stripe ($3,205) while the weekly chart summed
// appointments.total_amount ($4,999) and the "avg revenue" card divided by a
// third denominator — three numbers, three sources, none agreeing on one screen.
// Operational counts (visits, patients, cancellations) still come from
// `appointments`, which is correct: those are unit counts, not dollars.
type Stats = {
  // money — from stripe_qb_sync_log (collected) + appointments (booked)
  collectedMTD: number;
  collectedToday: number;
  bookedMTD: number;
  avgCharge: number;
  lastMonthPaceDelta: number; // % vs same day-of-month last month
  // operational — from appointments
  totalAppointments: number;
  thisWeekAppointments: number;
  todayAppointments: number;
  totalPatients: number;
  newPatientsMonth: number;
  overdueInvoices: number;
  cancelledMonth: number;
  completedMonth: number;
  repeatRate: number;
  onlineBookings: number;
  manualBookings: number;
};

const EMPTY_STATS: Stats = {
  collectedMTD: 0, collectedToday: 0, bookedMTD: 0, avgCharge: 0, lastMonthPaceDelta: 0,
  totalAppointments: 0, thisWeekAppointments: 0, todayAppointments: 0,
  totalPatients: 0, newPatientsMonth: 0, overdueInvoices: 0,
  cancelledMonth: 0, completedMonth: 0, repeatRate: 0, onlineBookings: 0, manualBookings: 0,
};

const SuperAdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [phlebPayoutsDisabled, setPhlebPayoutsDisabled] = useState(false);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [recentAppointments, setRecentAppointments] = useState<any[]>([]);
  const [weeklyRevenue, setWeeklyRevenue] = useState<{ label: string; revenue: number; tips: number }[]>([]);
  const [serviceData, setServiceData] = useState<{ name: string; value: number; color: string }[]>([]);

  useEffect(() => {
    fetchAll();
    // Realtime: any charge, booking, membership, or patient change re-pulls the
    // whole dashboard within ~1s. Unique channel name per mount avoids the
    // StrictMode double-subscribe collision.
    const channelName = `super-admin-dashboard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase.channel(channelName);
    const tables = ['stripe_qb_sync_log', 'appointments', 'user_memberships', 'tenant_patients'];
    for (const t of tables) {
      channel.on('postgres_changes' as any, { event: '*', schema: 'public', table: t }, () => fetchAll());
    }
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAll = async () => {
    try {
      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');
      const weekStartStr = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const monthStartStr = format(startOfMonth(now), 'yyyy-MM-dd');
      // The 6-week chart window starts at the Monday 5 weeks before this week's
      // Monday. We also need all of last month for the pace comparison, so pull
      // Stripe rows from whichever is earlier.
      const sixWeeksAgoStr = format(startOfWeek(subWeeks(now, 5), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const lastMonthStartStr = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');
      const stripeSinceStr = sixWeeksAgoStr < lastMonthStartStr ? sixWeeksAgoStr : lastMonthStartStr;

      const [
        { data: stripeRows },
        { count: totalAppts },
        { count: weekAppts },
        { count: todayAppts },
        { count: totalPatients },
        { count: newPatients },
        { count: overdueInvoices },
        { count: cancelledMonth },
        { count: completedMonth },
        { data: bookedRows },
        { data: recent },
        { data: allMonthAppts },
        { data: allCompletedForRepeat },
      ] = await Promise.all([
        // SINGLE money source — actual Stripe deposits since the window start.
        supabase.from('stripe_qb_sync_log' as any)
          .select('amount_gross_cents, charge_date')
          .gte('charge_date', stripeSinceStr),
        supabase.from('appointments').select('*', { count: 'exact', head: true }),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).gte('appointment_date', weekStartStr),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).gte('appointment_date', `${todayStr}T00:00:00`).lte('appointment_date', `${todayStr}T23:59:59`).not('status', 'eq', 'cancelled'),
        supabase.from('tenant_patients').select('*', { count: 'exact', head: true }),
        supabase.from('tenant_patients').select('*', { count: 'exact', head: true }).gte('created_at', monthStartStr),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).in('invoice_status', ['sent', 'reminded']).eq('is_vip', false),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'cancelled').gte('appointment_date', monthStartStr),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'completed').gte('appointment_date', monthStartStr),
        // "Booked MTD" + booking-source split — appointment dollars this month.
        supabase.from('appointments').select('total_amount, booking_source').eq('payment_status', 'completed').gte('appointment_date', monthStartStr),
        supabase.from('appointments').select('*').order('created_at', { ascending: false }).limit(8),
        supabase.from('appointments').select('service_type').gte('appointment_date', monthStartStr).not('status', 'eq', 'cancelled'),
        supabase.from('appointments').select('patient_email').eq('status', 'completed'),
      ]);

      const charges = (stripeRows as any[] | null) || [];
      const centsToDollars = (c: number) => (c || 0) / 100;

      // Collected MTD / today — real deposits.
      const collectedMTD = charges
        .filter((r) => (r.charge_date || '') >= monthStartStr)
        .reduce((s, r) => s + centsToDollars(r.amount_gross_cents), 0);
      const collectedToday = charges
        .filter((r) => (r.charge_date || '').startsWith(todayStr))
        .reduce((s, r) => s + centsToDollars(r.amount_gross_cents), 0);
      const chargeCountMTD = charges.filter((r) => (r.charge_date || '') >= monthStartStr).length;
      const avgCharge = chargeCountMTD > 0 ? Math.round(collectedMTD / chargeCountMTD) : 0;

      // Pace vs last month: same-day-of-month window so we compare like-for-like.
      const dayOfMonth = getDate(now);
      const prevMonth = subMonths(now, 1);
      const lastMonthCutoff = format(
        new Date(prevMonth.getFullYear(), prevMonth.getMonth(), dayOfMonth, 23, 59, 59),
        "yyyy-MM-dd'T'HH:mm:ss"
      );
      const lastMonthPaceTotal = charges
        .filter((r) => (r.charge_date || '') >= lastMonthStartStr && (r.charge_date || '') < monthStartStr && (r.charge_date || '') <= lastMonthCutoff)
        .reduce((s, r) => s + centsToDollars(r.amount_gross_cents), 0);
      const lastMonthPaceDelta = lastMonthPaceTotal > 0
        ? Math.round(((collectedMTD - lastMonthPaceTotal) / lastMonthPaceTotal) * 100)
        : 0;

      const bookedMTD = (bookedRows || []).reduce((s: number, a: any) => s + (a.total_amount || 0), 0);
      const onlineBookings = (bookedRows || []).filter((a: any) => a.booking_source === 'online').length;
      const manualBookings = (bookedRows || []).filter((a: any) => a.booking_source === 'manual').length;

      // Repeat rate — patients with 2+ completed visits / all patients with a completed visit.
      const visitCounts = new Map<string, number>();
      (allCompletedForRepeat || []).forEach((a: any) => {
        if (a.patient_email) visitCounts.set(a.patient_email, (visitCounts.get(a.patient_email) || 0) + 1);
      });
      let repeatN = 0;
      visitCounts.forEach((c) => { if (c >= 2) repeatN++; });
      const repeatRate = visitCounts.size > 0 ? Math.round((repeatN / visitCounts.size) * 100) : 0;

      setStats({
        collectedMTD, collectedToday, bookedMTD, avgCharge, lastMonthPaceDelta,
        totalAppointments: totalAppts || 0,
        thisWeekAppointments: weekAppts || 0,
        todayAppointments: todayAppts || 0,
        totalPatients: totalPatients || 0,
        newPatientsMonth: newPatients || 0,
        overdueInvoices: overdueInvoices || 0,
        cancelledMonth: cancelledMonth || 0,
        completedMonth: completedMonth || 0,
        repeatRate, onlineBookings, manualBookings,
      });

      // Kill-switch flag → Profit First splits.
      try {
        const { data: ks } = await supabase
          .from('system_settings' as any)
          .select('value')
          .eq('key', 'phleb_connect_payouts_disabled')
          .maybeSingle();
        const raw = (ks as any)?.value;
        setPhlebPayoutsDisabled(raw === true || raw === 'true' || String(raw).toLowerCase() === 'true');
      } catch { /* default false */ }

      setRecentAppointments(recent || []);

      // Weekly collected revenue (last 6 weeks) — real deposits bucketed by week.
      // This is the fix for the old bug where every week before the 1st of the
      // month rendered as $0 (the source query was filtered to >= month start).
      const weeklyData: { label: string; revenue: number; tips: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const wStart = subWeeks(startOfWeek(now, { weekStartsOn: 1 }), i);
        const wEnd = endOfWeek(wStart, { weekStartsOn: 1 });
        const wStartStr = format(wStart, 'yyyy-MM-dd');
        const wEndStr = format(wEnd, 'yyyy-MM-dd');
        const revenue = charges
          .filter((r) => {
            const d = (r.charge_date || '').substring(0, 10);
            return d >= wStartStr && d <= wEndStr;
          })
          .reduce((s, r) => s + centsToDollars(r.amount_gross_cents), 0);
        weeklyData.push({ label: format(wStart, 'MMM d'), revenue: Math.round(revenue), tips: 0 });
      }
      setWeeklyRevenue(weeklyData);

      // Service breakdown (this month, non-cancelled).
      const serviceCounts: Record<string, number> = {};
      (allMonthAppts || []).forEach((a: any) => {
        const type = a.service_type || 'other';
        serviceCounts[type] = (serviceCounts[type] || 0) + 1;
      });
      setServiceData(
        Object.entries(serviceCounts).map(([name, value]) => ({
          name, value, color: SERVICE_COLORS[name] || SERVICE_COLORS.other,
        })).sort((a, b) => b.value - a.value)
      );
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getPatientName = (appt: any) => {
    if (appt.patient_name) return appt.patient_name;
    if (appt.notes?.match(/Patient:\s*([^|]+)/)) return appt.notes.match(/Patient:\s*([^|]+)/)[1].trim();
    return appt.service_name || 'Appointment';
  };

  const uncollected = Math.max(0, stats.bookedMTD - stats.collectedMTD);
  const cancellationRate = (stats.completedMonth + stats.cancelledMonth) > 0
    ? Math.round((stats.cancelledMonth / (stats.completedMonth + stats.cancelledMonth)) * 100)
    : 0;

  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Owner Dashboard</h1>
          <p className="text-muted-foreground text-sm flex items-center gap-1.5">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard/super_admin/calendar"><Calendar className="h-4 w-4 mr-1" /> Calendar</Link>
          </Button>
          <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white" asChild>
            <Link to="/dashboard/super_admin/calendar"><Calendar className="h-4 w-4 mr-1" /> Schedule</Link>
          </Button>
        </div>
      </div>

      {/* MONEY BAND — one source of truth (Stripe deposits) */}
      <div className="rounded-2xl bg-gradient-to-br from-[#7F1D1D] to-[#B91C1C] text-white p-5 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-red-200">Collected · Month to Date</p>
            <p className="text-3xl md:text-4xl font-bold leading-tight">{loading ? '—' : money(stats.collectedMTD)}</p>
            <p className="text-xs text-red-200 flex items-center gap-1.5 mt-1">
              Stripe deposits
              {!loading && stats.lastMonthPaceDelta !== 0 && (
                <span className={`inline-flex items-center gap-0.5 font-medium ${stats.lastMonthPaceDelta > 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {stats.lastMonthPaceDelta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {Math.abs(stats.lastMonthPaceDelta)}% vs last month pace
                </span>
              )}
            </p>
          </div>
          <div className="md:border-l md:border-white/20 md:pl-5">
            <p className="text-[11px] uppercase tracking-wide text-red-200">Booked MTD</p>
            <p className="text-2xl md:text-3xl font-bold leading-tight">{loading ? '—' : money(stats.bookedMTD)}</p>
            <p className="text-xs mt-1">
              {uncollected > 0
                ? <span className="text-amber-200">{money(uncollected)} not yet collected</span>
                : <span className="text-emerald-200">Fully collected</span>}
            </p>
          </div>
          <div className="md:border-l md:border-white/20 md:pl-5">
            <p className="text-[11px] uppercase tracking-wide text-red-200">Collected Today</p>
            <p className="text-2xl md:text-3xl font-bold leading-tight">{loading ? '—' : money(stats.collectedToday)}</p>
            <p className="text-xs text-red-200 mt-1">Avg {loading ? '—' : money(stats.avgCharge)} / charge</p>
          </div>
        </div>
      </div>

      {/* Today's Execution */}
      <TodayExecutionView basePath="/dashboard/super_admin" />

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

      {/* KPI strip — operational counts */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Today', value: stats.todayAppointments, icon: Clock, color: 'text-blue-600 bg-blue-50', hint: 'visits', highlight: '' },
          { label: 'This Week', value: stats.thisWeekAppointments, icon: Calendar, color: 'text-indigo-600 bg-indigo-50', hint: 'appointments', highlight: '' },
          { label: 'New Patients', value: stats.newPatientsMonth, icon: UserPlus, color: 'text-teal-600 bg-teal-50', hint: 'this month', highlight: '' },
          { label: 'Patients', value: stats.totalPatients, icon: Users, color: 'text-purple-600 bg-purple-50', hint: 'total', highlight: '' },
          { label: 'Repeat Rate', value: `${stats.repeatRate}%`, icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50', hint: stats.repeatRate >= 30 ? 'healthy' : 'grow this', highlight: stats.repeatRate >= 30 ? 'text-emerald-600' : 'text-amber-600' },
          { label: 'Cancel Rate', value: `${cancellationRate}%`, icon: AlertTriangle, color: 'text-amber-600 bg-amber-50', hint: `${stats.cancelledMonth} this month`, highlight: cancellationRate > 15 ? 'text-red-600' : '' },
        ].map(({ label, value, icon: Icon, color, hint, highlight }) => (
          <Card key={label} className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <div className={`h-8 w-8 rounded-lg ${color} flex items-center justify-center`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className={`text-xl font-bold ${highlight || ''}`}>{loading ? '—' : value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Collected Revenue — Last 6 Weeks</CardTitle>
            <p className="text-xs text-muted-foreground">Actual Stripe deposits, bucketed by week</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[260px] bg-muted/50 animate-pulse rounded" />
            ) : (
              <RevenueChart data={weeklyRevenue} />
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Services This Month</CardTitle>
            <p className="text-xs text-muted-foreground">{stats.onlineBookings} online · {stats.manualBookings} admin-booked</p>
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

      {/* Profit First Allocations — on real collected revenue */}
      {!loading && stats.collectedMTD > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-[#B91C1C]" />
              Profit First Allocations (This Month)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`grid grid-cols-2 ${phlebPayoutsDisabled ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-4`}>
              {(phlebPayoutsDisabled
                ? [
                    { label: "Owner's Pay", pct: 40, color: 'bg-[#B91C1C]' },
                    { label: 'Profit', pct: 25, color: 'bg-emerald-500' },
                    { label: 'Operating Expenses', pct: 35, color: 'bg-blue-500' },
                  ]
                : [
                    { label: "Owner's Pay", pct: 25, color: 'bg-[#B91C1C]' },
                    { label: 'Profit', pct: 15, color: 'bg-emerald-500' },
                    { label: 'Operating Expenses', pct: 30, color: 'bg-blue-500' },
                    { label: 'Phlebotomist Pay', pct: 30, color: 'bg-purple-500' },
                  ]
              ).map(({ label, pct, color }) => {
                const amount = (stats.collectedMTD * pct) / 100;
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
              <span className="text-xs text-muted-foreground">Based on {money(stats.collectedMTD)} collected MTD</span>
              <span className="text-[10px] text-muted-foreground">Recommended allocations — adjust in Settings</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity + Quick Actions */}
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
              <div className="space-y-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-muted/50 animate-pulse rounded" />)}</div>
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
