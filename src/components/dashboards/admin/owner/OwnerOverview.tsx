/**
 * OWNER OVERVIEW — whole-business financials (Owner › Overview, owner-gated).
 *
 * Money reads ONE source of truth — stripe_qb_sync_log (actual Stripe
 * deposits). Operational counts (visits, patients, cancellations) come from
 * `appointments`, which is correct: those are unit counts, not dollars.
 *
 * 2026-10-02 redesign (LabOrdersTab language): header + actions, money tiles,
 * a "Needs action" lane (overdue invoices, cancellations, uncollected), the
 * same two charts, Profit First, and Recent activity as a table with a sticky
 * Actions column / mobile cards / detail drawer. Two reconciliation bugs fixed
 * on the way, both "no upper bound" windows:
 *   - "This week" counted every appointment from Monday onward, including
 *     bookings months out (39 vs 23 on 2026-10-02). Now bounded to the week.
 *   - "Booked MTD" summed every paid appointment dated on/after the 1st,
 *     including December ($9,605 vs $9,495). Now bounded to the month.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Calendar, DollarSign, TrendingUp, TrendingDown, Clock, ArrowRight, AlertTriangle,
  UserPlus, LayoutDashboard, RefreshCw, Receipt, ChevronRight, Phone, Mail, ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, getDate, formatDistanceToNowStrict,
} from 'date-fns';
import RevenueChart from '../../charts/RevenueChart';
import ServiceBreakdown from '../../charts/ServiceBreakdown';
import {
  SectionHeader, SectionTitle, KpiTile, Pill, LaneHeader, LoadingRows, LoadingTiles, EmptyState,
  Th, ThActions, TdActions, rowKeyHandler, Field, DetailDrawer, fmtMoney, fmtInt,
} from './sectionUi';

const SERVICE_COLORS: Record<string, string> = {
  mobile: '#B91C1C', 'in-office': '#3B82F6', senior: '#7C3AED',
  therapeutic: '#0D9488', 'specialty-kit': '#D97706', other: '#6B7280',
};

type Stats = {
  collectedMTD: number;
  collectedToday: number;
  bookedMTD: number;
  avgCharge: number;
  chargeCountMTD: number;
  lastMonthPaceDelta: number;
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
  collectedMTD: 0, collectedToday: 0, bookedMTD: 0, avgCharge: 0, chargeCountMTD: 0, lastMonthPaceDelta: 0,
  totalAppointments: 0, thisWeekAppointments: 0, todayAppointments: 0,
  totalPatients: 0, newPatientsMonth: 0, overdueInvoices: 0,
  cancelledMonth: 0, completedMonth: 0, repeatRate: 0, onlineBookings: 0, manualBookings: 0,
};

const STATUS_PILL: Record<string, { cls: string; dot: string }> = {
  completed: { cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  specimen_delivered: { cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  scheduled: { cls: 'bg-blue-100 text-blue-800 border-blue-200', dot: 'bg-blue-500' },
  confirmed: { cls: 'bg-blue-100 text-blue-800 border-blue-200', dot: 'bg-blue-500' },
  cancelled: { cls: 'bg-red-100 text-red-800 border-red-200', dot: 'bg-red-500' },
  no_show: { cls: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
};
const statusPill = (s: string) => STATUS_PILL[s] || { cls: 'bg-gray-100 text-gray-700 border-gray-200', dot: 'bg-gray-400' };

const ago = (iso: string) => formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
const BASE = '/dashboard/super_admin';

const OwnerOverview = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [phlebPayoutsDisabled, setPhlebPayoutsDisabled] = useState(false);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [recentAppointments, setRecentAppointments] = useState<any[]>([]);
  const [weeklyRevenue, setWeeklyRevenue] = useState<{ label: string; revenue: number; tips: number }[]>([]);
  const [serviceData, setServiceData] = useState<{ name: string; value: number; color: string }[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    setLastError(null);
    try {
      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');
      const weekStartStr = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const weekEndStr = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd'T'23:59:59");
      const monthStartStr = format(startOfMonth(now), 'yyyy-MM-dd');
      const monthEndStr = format(endOfMonth(now), "yyyy-MM-dd'T'23:59:59");
      const sixWeeksAgoStr = format(startOfWeek(subWeeks(now, 5), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const lastMonthStartStr = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');
      const stripeSinceStr = sixWeeksAgoStr < lastMonthStartStr ? sixWeeksAgoStr : lastMonthStartStr;

      const [
        { data: stripeRows, error: stripeErr },
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
        supabase.from('stripe_qb_sync_log' as any).select('amount_gross_cents, charge_date').gte('charge_date', stripeSinceStr),
        supabase.from('appointments').select('*', { count: 'exact', head: true }),
        // Bounded to the calendar week (was open-ended → counted months-out bookings).
        supabase.from('appointments').select('*', { count: 'exact', head: true }).gte('appointment_date', weekStartStr).lte('appointment_date', weekEndStr),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).gte('appointment_date', `${todayStr}T00:00:00`).lte('appointment_date', `${todayStr}T23:59:59`).not('status', 'eq', 'cancelled'),
        supabase.from('tenant_patients').select('*', { count: 'exact', head: true }),
        supabase.from('tenant_patients').select('*', { count: 'exact', head: true }).gte('created_at', monthStartStr),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).in('invoice_status', ['sent', 'reminded']).eq('is_vip', false),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'cancelled').gte('appointment_date', monthStartStr).lte('appointment_date', monthEndStr),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'completed').gte('appointment_date', monthStartStr).lte('appointment_date', monthEndStr),
        // Bounded to the calendar month (was open-ended → included December bookings).
        supabase.from('appointments').select('total_amount, booking_source').eq('payment_status', 'completed').gte('appointment_date', monthStartStr).lte('appointment_date', monthEndStr),
        supabase.from('appointments').select('id, patient_name, patient_email, patient_phone, service_type, service_name, status, payment_status, total_amount, appointment_date, appointment_time, booking_source, created_at, notes, address, phlebotomist_id').order('created_at', { ascending: false }).limit(8),
        supabase.from('appointments').select('service_type').gte('appointment_date', monthStartStr).lte('appointment_date', monthEndStr).not('status', 'eq', 'cancelled'),
        supabase.from('appointments').select('patient_email').eq('status', 'completed'),
      ]);

      if (stripeErr) throw stripeErr;
      const charges = (stripeRows as any[] | null) || [];
      const centsToDollars = (c: number) => (c || 0) / 100;

      const mtdCharges = charges.filter((r) => (r.charge_date || '') >= monthStartStr);
      const collectedMTD = mtdCharges.reduce((s, r) => s + centsToDollars(r.amount_gross_cents), 0);
      const collectedToday = charges.filter((r) => (r.charge_date || '').startsWith(todayStr)).reduce((s, r) => s + centsToDollars(r.amount_gross_cents), 0);
      const chargeCountMTD = mtdCharges.length;
      const avgCharge = chargeCountMTD > 0 ? Math.round(collectedMTD / chargeCountMTD) : 0;

      const dayOfMonth = getDate(now);
      const prevMonth = subMonths(now, 1);
      const lastMonthCutoff = format(new Date(prevMonth.getFullYear(), prevMonth.getMonth(), dayOfMonth, 23, 59, 59), "yyyy-MM-dd'T'HH:mm:ss");
      const lastMonthPaceTotal = charges
        .filter((r) => (r.charge_date || '') >= lastMonthStartStr && (r.charge_date || '') < monthStartStr && (r.charge_date || '') <= lastMonthCutoff)
        .reduce((s, r) => s + centsToDollars(r.amount_gross_cents), 0);
      const lastMonthPaceDelta = lastMonthPaceTotal > 0 ? Math.round(((collectedMTD - lastMonthPaceTotal) / lastMonthPaceTotal) * 100) : 0;

      const bookedMTD = (bookedRows || []).reduce((s: number, a: any) => s + (a.total_amount || 0), 0);
      const onlineBookings = (bookedRows || []).filter((a: any) => a.booking_source === 'online').length;
      const manualBookings = (bookedRows || []).filter((a: any) => a.booking_source === 'manual').length;

      const visitCounts = new Map<string, number>();
      (allCompletedForRepeat || []).forEach((a: any) => {
        if (a.patient_email) visitCounts.set(a.patient_email, (visitCounts.get(a.patient_email) || 0) + 1);
      });
      let repeatN = 0;
      visitCounts.forEach((c) => { if (c >= 2) repeatN++; });
      const repeatRate = visitCounts.size > 0 ? Math.round((repeatN / visitCounts.size) * 100) : 0;

      setStats({
        collectedMTD, collectedToday, bookedMTD, avgCharge, chargeCountMTD, lastMonthPaceDelta,
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

      try {
        const { data: ks } = await supabase.from('system_settings' as any).select('value').eq('key', 'phleb_connect_payouts_disabled').maybeSingle();
        const raw = (ks as any)?.value;
        setPhlebPayoutsDisabled(raw === true || raw === 'true' || String(raw).toLowerCase() === 'true');
      } catch { /* default false */ }

      setRecentAppointments(recent || []);

      const weeklyData: { label: string; revenue: number; tips: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const wStart = subWeeks(startOfWeek(now, { weekStartsOn: 1 }), i);
        const wEnd = endOfWeek(wStart, { weekStartsOn: 1 });
        const wStartStr = format(wStart, 'yyyy-MM-dd');
        const wEndStr = format(wEnd, 'yyyy-MM-dd');
        const revenue = charges
          .filter((r) => { const d = (r.charge_date || '').substring(0, 10); return d >= wStartStr && d <= wEndStr; })
          .reduce((s, r) => s + centsToDollars(r.amount_gross_cents), 0);
        weeklyData.push({ label: format(wStart, 'MMM d'), revenue: Math.round(revenue), tips: 0 });
      }
      setWeeklyRevenue(weeklyData);

      const serviceCounts: Record<string, number> = {};
      (allMonthAppts || []).forEach((a: any) => {
        const type = a.service_type || 'other';
        serviceCounts[type] = (serviceCounts[type] || 0) + 1;
      });
      setServiceData(Object.entries(serviceCounts).map(([name, value]) => ({ name, value, color: SERVICE_COLORS[name] || SERVICE_COLORS.other })).sort((a, b) => b.value - a.value));
      setUpdatedAt(new Date());
    } catch (err: any) {
      console.error('Dashboard fetch error:', err);
      setLastError(err?.message || String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    // Realtime: any charge, booking, membership, or patient change re-pulls the
    // whole dashboard within ~1s. Unique channel name per mount avoids the
    // StrictMode double-subscribe collision.
    const channelName = `super-admin-dashboard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase.channel(channelName);
    for (const t of ['stripe_qb_sync_log', 'appointments', 'user_memberships', 'tenant_patients']) {
      channel.on('postgres_changes' as any, { event: '*', schema: 'public', table: t }, () => fetchAll());
    }
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  // Keep the open drawer in sync with realtime refreshes.
  useEffect(() => {
    if (!selected) return;
    const fresh = recentAppointments.find(a => a.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [recentAppointments]); // eslint-disable-line react-hooks/exhaustive-deps

  const getPatientName = (appt: any) => {
    if (appt.patient_name) return appt.patient_name;
    const m = appt.notes?.match(/Patient:\s*([^|]+)/);
    if (m) return m[1].trim();
    return appt.service_name || 'Appointment';
  };

  const uncollected = Math.max(0, stats.bookedMTD - stats.collectedMTD);
  const cancellationRate = (stats.completedMonth + stats.cancelledMonth) > 0
    ? Math.round((stats.cancelledMonth / (stats.completedMonth + stats.cancelledMonth)) * 100) : 0;

  const actionItems = useMemo(() => {
    if (loading) return [];
    const items: Array<{ id: string; tone: 'red' | 'amber'; title: string; detail: string; to?: string; cta: string }> = [];
    if (stats.overdueInvoices > 0) {
      items.push({ id: 'inv', tone: 'red', title: `${stats.overdueInvoices} overdue invoice${stats.overdueInvoices === 1 ? '' : 's'}`, detail: 'Sent or reminded, still unpaid (VIP accounts excluded).', to: `${BASE}/billing/invoices`, cta: 'Open invoices' });
    }
    if (uncollected > 0) {
      items.push({ id: 'unc', tone: 'amber', title: `${fmtMoney(uncollected)} booked this month, not yet in Stripe`, detail: 'Paid-status appointments this month minus Stripe deposits month-to-date. Includes visits still ahead on the calendar.', to: `${BASE}/schedule/appointments`, cta: 'Appointments' });
    }
    if (stats.cancelledMonth > 3) {
      items.push({ id: 'canc', tone: 'amber', title: `${stats.cancelledMonth} cancellations this month`, detail: `${cancellationRate}% of completed + cancelled visits this month.`, to: `${BASE}/schedule/appointments`, cta: 'Appointments' });
    }
    return items;
  }, [loading, stats.overdueInvoices, stats.cancelledMonth, uncollected, cancellationRate]);

  const allocations = phlebPayoutsDisabled
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
      ];

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={LayoutDashboard}
        title="Business metrics"
        subtitle={
          <span className="inline-flex items-center gap-1.5 flex-wrap">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
            <span className="inline-flex items-center gap-1 text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live</span>
            {updatedAt && <span className="text-gray-400">· updated {format(updatedAt, 'h:mm a')}</span>}
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={fetchAll} className="gap-1.5 text-xs h-10 sm:h-9 min-w-10 sm:min-w-9" disabled={refreshing} aria-label="Refresh">
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} aria-hidden="true" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button variant="outline" size="sm" className="text-xs h-10 sm:h-9 gap-1.5" asChild>
              <Link to={`${BASE}/owner/hormozi`}><TrendingUp className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Growth model</span></Link>
            </Button>
            <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs h-10 sm:h-9 gap-1.5" asChild>
              <Link to={`${BASE}/schedule/calendar`}><Calendar className="h-4 w-4" aria-hidden="true" /> Calendar</Link>
            </Button>
          </>
        }
      />

      {lastError && (
        <Card className="border-red-300 bg-red-50" role="alert">
          <CardContent className="p-3 flex items-start gap-2 text-xs">
            <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1"><p className="font-semibold text-red-800">Couldn't load business metrics</p><p className="text-red-700 font-mono break-all mt-0.5">{lastError}</p></div>
            <Button variant="outline" size="sm" className="h-9 text-xs" onClick={fetchAll}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {/* MONEY — one source of truth (Stripe deposits) */}
      <section aria-labelledby="own-money">
        <SectionTitle id="own-money" hint="Stripe deposits · stripe_qb_sync_log">Money this month</SectionTitle>
        {loading ? <LoadingTiles n={4} /> : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <KpiTile label="Collected · MTD" value={fmtMoney(stats.collectedMTD)} tone="brand" icon={DollarSign}
              hint={stats.lastMonthPaceDelta !== 0 ? (
                <span className={cn('inline-flex items-center gap-0.5 font-medium', stats.lastMonthPaceDelta > 0 ? 'text-emerald-700' : 'text-amber-700')}>
                  {stats.lastMonthPaceDelta > 0 ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : <TrendingDown className="h-3 w-3" aria-hidden="true" />}
                  {Math.abs(stats.lastMonthPaceDelta)}% vs last month pace
                </span>
              ) : `${fmtInt(stats.chargeCountMTD)} charge${stats.chargeCountMTD === 1 ? '' : 's'}`} />
            <KpiTile label="Booked this month" value={fmtMoney(stats.bookedMTD)} icon={Calendar}
              hint={uncollected > 0 ? <span className="text-amber-700">{fmtMoney(uncollected)} not yet collected</span> : <span className="text-emerald-700">Fully collected</span>} />
            <KpiTile label="Collected today" value={fmtMoney(stats.collectedToday)} icon={Clock} hint={`avg ${fmtMoney(stats.avgCharge)} / charge`} />
            <KpiTile label="Overdue invoices" value={fmtInt(stats.overdueInvoices)} icon={Receipt} tone={stats.overdueInvoices > 0 ? 'red' : 'default'} hint="sent or reminded, unpaid" />
          </div>
        )}
      </section>

      {/* Needs action */}
      {actionItems.length > 0 && (
        <section aria-labelledby="own-action">
          <LaneHeader id="own-action" title="Needs action" count={actionItems.length} tone="red" />
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm divide-y">
            {actionItems.map(item => (
              <div key={item.id} className={cn('flex items-start gap-3 p-3', item.tone === 'red' ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-amber-400')}>
                <div className={cn('h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0', item.tone === 'red' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{item.detail}</p>
                </div>
                {item.to && (
                  <Button size="sm" variant="outline" className="h-9 text-xs flex-shrink-0" asChild>
                    <Link to={item.to}>{item.cta} <ChevronRight className="h-3.5 w-3.5 ml-0.5" aria-hidden="true" /></Link>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Operational counts */}
      <section aria-labelledby="own-ops">
        <SectionTitle id="own-ops" hint="appointments · tenant_patients">Operations</SectionTitle>
        {loading ? <LoadingTiles n={6} /> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <KpiTile label="Today" value={fmtInt(stats.todayAppointments)} hint="visits (not cancelled)" icon={Clock} />
            <KpiTile label="This week" value={fmtInt(stats.thisWeekAppointments)} hint="Mon–Sun appointments" icon={Calendar} />
            <KpiTile label="New patients" value={fmtInt(stats.newPatientsMonth)} hint="this month" icon={UserPlus} />
            <KpiTile label="Patients" value={fmtInt(stats.totalPatients)} hint={`${fmtInt(stats.totalAppointments)} appointments all-time`} icon={Users} />
            <KpiTile label="Repeat rate" value={`${stats.repeatRate}%`} hint={stats.repeatRate >= 30 ? 'healthy (≥30%)' : 'below 30% target'} tone={stats.repeatRate >= 30 ? 'green' : 'amber'} icon={TrendingUp} />
            <KpiTile label="Cancel rate" value={`${cancellationRate}%`} hint={`${fmtInt(stats.cancelledMonth)} this month`} tone={cancellationRate > 15 ? 'red' : 'default'} icon={AlertTriangle} />
          </div>
        )}
      </section>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Collected revenue — last 6 weeks</CardTitle>
            <p className="text-xs text-gray-500">Actual Stripe deposits, bucketed by week (Mon–Sun)</p>
          </CardHeader>
          <CardContent>
            {loading ? <div className="h-[260px] bg-gray-50 animate-pulse rounded" /> : <RevenueChart data={weeklyRevenue} />}
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Services this month</CardTitle>
            <p className="text-xs text-gray-500">{fmtInt(stats.onlineBookings)} online · {fmtInt(stats.manualBookings)} admin-booked (paid)</p>
          </CardHeader>
          <CardContent>
            {loading ? <div className="h-[200px] bg-gray-50 animate-pulse rounded" /> : <ServiceBreakdown data={serviceData} />}
          </CardContent>
        </Card>
      </div>

      {/* Profit First */}
      {!loading && stats.collectedMTD > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-[#B91C1C]" aria-hidden="true" /> Profit First allocations (this month)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn('grid grid-cols-2 gap-3', phlebPayoutsDisabled ? 'md:grid-cols-3' : 'md:grid-cols-4')}>
              {allocations.map(({ label, pct, color }) => (
                <div key={label} className="rounded-lg border border-gray-200 p-3">
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2"><div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} /></div>
                  <p className="text-lg font-bold tabular-nums">{fmtMoney((stats.collectedMTD * pct) / 100)}</p>
                  <p className="text-[11px] text-gray-500">{label} · {pct}%</p>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs text-gray-500">Based on {fmtMoney(stats.collectedMTD)} collected MTD{phlebPayoutsDisabled ? ' · owner-operator split (phleb payouts off)' : ''}</span>
              <span className="text-[10px] text-gray-400">Recommended allocations — adjust in Settings</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent activity */}
      <section aria-labelledby="own-recent" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle id="own-recent" hint="newest 8 bookings by created date">Recent activity</SectionTitle>
          <Button variant="ghost" size="sm" className="text-xs h-8" asChild>
            <Link to={`${BASE}/schedule/appointments`}>View all <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" /></Link>
          </Button>
        </div>
        {loading ? <LoadingRows rows={4} label="Loading recent activity" /> : recentAppointments.length === 0 ? (
          <EmptyState icon={Calendar} title="No appointments yet." hint="Bookings appear here the moment they are created." />
        ) : (
          <RecentRows rows={recentAppointments} name={getPatientName} onOpen={setSelected} />
        )}
      </section>

      {selected && <ApptDrawer appt={selected} name={getPatientName(selected)} onClose={() => setSelected(null)} />}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────
// Recent activity rows — table on ≥md, cards below.
// ──────────────────────────────────────────────────────────────────
const svc = (a: any) => (a.service_type || a.service_name || 'blood draw').replace(/_|-/g, ' ');
const when = (a: any) => (a.appointment_date ? format(new Date(a.appointment_date), 'MMM d') : '—');

const RecentRows: React.FC<{ rows: any[]; name: (a: any) => string; onOpen: (a: any) => void }> = ({ rows, name, onOpen }) => (
  <>
    <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50/80">
            <Th className="pl-4">Patient</Th>
            <Th>Service</Th>
            <Th>Visit</Th>
            <Th>Status</Th>
            <Th right>Amount</Th>
            <Th className="hidden xl:table-cell">Booked</Th>
            <ThActions />
          </tr>
        </thead>
        <tbody>
          {rows.map(a => {
            const sp = statusPill(a.status);
            const open = () => onOpen(a);
            return (
              <tr key={a.id} role="button" tabIndex={0} onClick={open} onKeyDown={rowKeyHandler(open)} aria-label={`${name(a)}, ${a.status}. Open appointment`}
                className="border-t border-gray-100 cursor-pointer hover:bg-gray-50/70 focus:outline-none focus-visible:bg-red-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B91C1C]/40">
                <td className="py-2.5 pl-4 pr-3 align-top">
                  <span className="text-sm font-semibold text-gray-800">{name(a)}</span>
                  <span className="block text-[11px] text-gray-500 truncate max-w-[220px]">{a.patient_phone || a.patient_email || 'No contact on file'}</span>
                </td>
                <td className="py-2.5 px-3 align-top text-xs text-gray-700 capitalize">{svc(a)}</td>
                <td className="py-2.5 px-3 align-top text-xs text-gray-700 whitespace-nowrap">{when(a)}{a.appointment_time ? <span className="text-gray-400"> · {a.appointment_time}</span> : ''}</td>
                <td className="py-2.5 px-3 align-top"><Pill className={sp.cls} dot={sp.dot}>{String(a.status || '').replace(/_/g, ' ')}</Pill></td>
                <td className="py-2.5 px-3 align-top text-right tabular-nums text-xs">
                  {a.total_amount > 0 ? <span className={cn('font-semibold', a.payment_status === 'completed' ? 'text-emerald-700' : 'text-gray-800')}>{fmtMoney(a.total_amount)}</span> : <span className="text-gray-400">—</span>}
                  {a.payment_status && <span className="block text-[11px] text-gray-400 capitalize">{String(a.payment_status).replace(/_/g, ' ')}</span>}
                </td>
                <td className="hidden xl:table-cell py-2.5 px-3 align-top text-xs text-gray-600 whitespace-nowrap">{a.created_at ? ago(a.created_at) : '—'}<span className="block text-[11px] text-gray-400 capitalize">{(a.booking_source || '').replace(/_/g, ' ')}</span></td>
                <TdActions>
                  <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5" asChild onClick={(e) => e.stopPropagation()}>
                    <a href={`${BASE}/calendar?appointment=${a.id}`} target="_blank" rel="noopener noreferrer"><Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Open</a>
                  </Button>
                </TdActions>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <div className="md:hidden space-y-2">
      {rows.map(a => {
        const sp = statusPill(a.status);
        const open = () => onOpen(a);
        return (
          <Card key={a.id} role="button" tabIndex={0} onClick={open} onKeyDown={rowKeyHandler(open)} aria-label={`${name(a)}, ${a.status}. Open appointment`} className="shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-800 truncate">{name(a)}</p>
                  <p className="text-[11px] text-gray-500 capitalize">{svc(a)} · {when(a)}</p>
                </div>
                <Pill className={sp.cls} dot={sp.dot}>{String(a.status || '').replace(/_/g, ' ')}</Pill>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span>{a.total_amount > 0 ? <span className={cn('font-semibold', a.payment_status === 'completed' ? 'text-emerald-700' : 'text-gray-800')}>{fmtMoney(a.total_amount)}</span> : '—'}</span>
                <span className="text-gray-500">booked {a.created_at ? ago(a.created_at) : '—'}</span>
              </div>
              <div className="flex items-center gap-1.5 pt-0.5">
                <Button size="sm" variant="outline" className="h-11 flex-1 justify-center text-xs gap-1.5" asChild onClick={(e) => e.stopPropagation()}>
                  <a href={`${BASE}/calendar?appointment=${a.id}`} target="_blank" rel="noopener noreferrer"><Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Open in calendar</a>
                </Button>
                <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  </>
);

const ApptDrawer: React.FC<{ appt: any; name: string; onClose: () => void }> = ({ appt, name, onClose }) => {
  const sp = statusPill(appt.status);
  return (
    <DetailDrawer eyebrow="Appointment" title={name} onClose={onClose}
      titleExtra={<Pill className={cn(sp.cls, 'bg-white/95')} dot={sp.dot}>{String(appt.status || '').replace(/_/g, ' ')}</Pill>}
      footer={<>Booked {appt.created_at ? format(new Date(appt.created_at), 'MMM d, yyyy h:mm a') : '—'} · Appointment ID <span className="font-mono">{appt.id}</span></>}>
      <div className="flex sm:flex-wrap gap-2 overflow-x-auto sm:overflow-visible -mx-4 sm:mx-0 px-4 sm:px-0 pb-1 sm:pb-0">
        <Button className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 h-10 text-xs flex-shrink-0" asChild>
          <a href={`${BASE}/calendar?appointment=${appt.id}`} target="_blank" rel="noopener noreferrer"><Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Open in calendar</a>
        </Button>
        {appt.patient_phone && <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild><a href={`tel:${appt.patient_phone}`}><Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call</a></Button>}
        {appt.patient_email && <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild><a href={`mailto:${appt.patient_email}`}><Mail className="h-3.5 w-3.5" aria-hidden="true" /> Email</a></Button>}
        <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild>
          <Link to={`${BASE}/schedule/appointments`}><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> All appointments</Link>
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Visit</p>
          <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
            <Field label="Service"><span className="capitalize">{svc(appt)}</span></Field>
            <Field label="Date">{appt.appointment_date ? format(new Date(appt.appointment_date), 'EEE, MMM d, yyyy') : '—'}{appt.appointment_time ? ` · ${appt.appointment_time}` : ''}</Field>
            <Field label="Address">{appt.address || '—'}</Field>
            <Field label="Source"><span className="capitalize">{(appt.booking_source || '—').replace(/_/g, ' ')}</span></Field>
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Money</p>
          <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
            <Field label="Amount">{appt.total_amount > 0 ? <span className="font-semibold">{fmtMoney(appt.total_amount)}</span> : '—'}</Field>
            <Field label="Payment"><span className="capitalize">{String(appt.payment_status || '—').replace(/_/g, ' ')}</span></Field>
            <Field label="Email">{appt.patient_email || '—'}</Field>
            <Field label="Phone">{appt.patient_phone || '—'}</Field>
          </div>
        </div>
      </div>
      {appt.notes && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Notes</p>
          <p className="text-xs text-gray-700 whitespace-pre-wrap bg-amber-50 border border-amber-200 rounded px-3 py-2">{appt.notes}</p>
        </div>
      )}
    </DetailDrawer>
  );
};

export default OwnerOverview;
