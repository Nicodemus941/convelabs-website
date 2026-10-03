import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import {
  Clock, MapPin, Phone, MessageSquare, CheckCircle2, Truck, Activity,
  XCircle, Calendar, ChevronRight, ArrowRight,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { isInvoicePlaceholder } from '@/lib/invoiceAttach';
import { format, startOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { useAdminBadgeCounts } from './useAdminBadges';

/**
 * TODAY — the admin landing screen.
 *
 * Answers "what do I do now", which the old default dashboard did not. Three
 * things changed in the 2026-09-28 redesign:
 *   1. The attention numbers are links. "Needs Attention: 5" used to be a dead
 *      figure with no way to see which five.
 *   2. Do next replaces having to check four separate queues to find out
 *      whether anything is waiting.
 *   3. This month is plain operational throughput. Revenue detail stays in the
 *      owner-gated Business section rather than sitting on every admin's home.
 */

type Appt = {
  id: string;
  appointment_date: string;
  appointment_time: string | null;
  status: string;
  payment_status: string | null;
  patient_name: string | null;
  patient_email: string | null;
  patient_phone: string | null;
  address: string | null;
  service_type: string | null;
  service_name: string | null;
  total_amount: number | null;
  lab_order_file_path: string | null;
  phlebotomist_id: string | null;
  notes: string | null;
};

const STATUS_ORDER = ['in_progress', 'en_route', 'confirmed', 'scheduled', 'completed', 'cancelled'];

const statusStyle = (s: string) => {
  const map: Record<string, { bg: string; text: string; icon: any; label: string; bar: string }> = {
    scheduled: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', icon: Clock, label: 'Scheduled', bar: 'bg-blue-400' },
    confirmed: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: CheckCircle2, label: 'Confirmed', bar: 'bg-emerald-500' },
    en_route: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: Truck, label: 'En route', bar: 'bg-amber-500' },
    in_progress: { bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700', icon: Activity, label: 'In progress', bar: 'bg-purple-500' },
    completed: { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-600', icon: CheckCircle2, label: 'Completed', bar: 'bg-gray-300' },
    cancelled: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: XCircle, label: 'Cancelled', bar: 'bg-red-400' },
  };
  return map[s] || map.scheduled;
};

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/** One of the three clickable cards in the attention strip. */
const AttentionCard: React.FC<{
  label: string;
  value: React.ReactNode;
  caption: string;
  cta: string;
  to: string;
  urgent?: boolean;
}> = ({ label, value, caption, cta, to, urgent }) => (
  <Card className={`shadow-sm ${urgent ? 'border-red-200 bg-red-50/60' : ''}`}>
    <CardContent className="p-4">
      <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-2 mt-1.5">
        <span className={`text-3xl font-bold leading-none ${urgent ? 'text-[#B91C1C]' : ''}`}>{value}</span>
        <span className="text-xs text-muted-foreground">{caption}</span>
      </div>
      <Link
        to={to}
        className="inline-flex items-center gap-1 mt-2.5 text-xs font-semibold text-[#B91C1C] hover:underline"
      >
        {cta} <ArrowRight className="h-3 w-3" />
      </Link>
    </CardContent>
  </Card>
);

interface TodayExecutionViewProps {
  basePath: string; // e.g. `/dashboard/super_admin` or `/dashboard/office_manager`
}

const TodayExecutionView: React.FC<TodayExecutionViewProps> = ({ basePath }) => {
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const [specimensInTransit, setSpecimensInTransit] = useState<number | null>(null);
  const [month, setMonth] = useState<{ visits: number; collected: number } | null>(null);
  const counts = useAdminBadgeCounts();

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const fetchToday = useCallback(async () => {
    // appointment_date is timestamptz — use a day-range filter
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');
    const { data } = await supabase
      .from('appointments')
      .select('*')
      .gte('appointment_date', todayStr)
      .lt('appointment_date', tomorrowStr)
      .order('appointment_time', { ascending: true });
    // Invoice-only rows aren't visits — keep them out of today's counts,
    // Needs attention and the list.
    setAppts(((data || []) as any[]).filter(a => !isInvoicePlaceholder(a)) as Appt[]);
    setLoading(false);
  }, [todayStr]);

  useEffect(() => {
    fetchToday();
    // Auto-refresh every 60s for live status tracking
    const iv = setInterval(fetchToday, 60_000);
    return () => clearInterval(iv);
  }, [fetchToday]);

  // Specimens still out — anything not yet marked delivered/received.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { count } = await supabase
          .from('specimen_deliveries' as any)
          .select('id', { count: 'exact', head: true })
          .not('status', 'in', '(delivered,received,completed)');
        if (mounted) setSpecimensInTransit(count || 0);
      } catch { if (mounted) setSpecimensInTransit(null); }
    })();
    return () => { mounted = false; };
  }, []);

  // Month-to-date throughput. Operational, not owner-gated: every admin sees
  // the same two numbers, and the revenue breakdown lives under Business.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase
          .from('appointments')
          .select('total_amount, status, payment_status')
          .gte('appointment_date', format(startOfMonth(new Date()), 'yyyy-MM-dd'));
        const rows = (data || []) as Array<{ total_amount: number | null; status: string; payment_status: string | null }>;
        const done = rows.filter(r => r.status === 'completed');
        if (mounted) {
          setMonth({
            visits: done.length,
            collected: done
              .filter(r => r.payment_status === 'completed')
              .reduce((s, r) => s + (r.total_amount || 0), 0),
          });
        }
      } catch { if (mounted) setMonth(null); }
    })();
  }, []);

  const metrics = useMemo(() => {
    const active = appts.filter(a => a.status !== 'cancelled');
    const completed = active.filter(a => a.status === 'completed');
    const remaining = active.filter(a => ['scheduled', 'confirmed', 'en_route', 'in_progress'].includes(a.status));
    const unpaid = active.filter(a => a.payment_status !== 'completed');
    const missingLabOrder = remaining.filter(a => !a.lab_order_file_path && (a.service_type === 'mobile' || a.service_type === 'senior'));
    const unassigned = remaining.filter(a => !a.phlebotomist_id);
    const inProgress = active.filter(a => ['en_route', 'in_progress'].includes(a.status)).length;
    const next = remaining
      .filter(a => !['en_route', 'in_progress'].includes(a.status))
      .sort((x, y) => (x.appointment_time || '').localeCompare(y.appointment_time || ''))[0];
    return {
      total: active.length,
      completed: completed.length,
      remaining: remaining.length,
      inProgress,
      nextTime: next?.appointment_time || null,
      collected: completed.reduce((s, a) => s + (a.total_amount || 0), 0),
      booked: active.reduce((s, a) => s + (a.total_amount || 0), 0),
      unpaidCount: unpaid.length,
      unpaidTotal: unpaid.reduce((s, a) => s + (a.total_amount || 0), 0),
      blocked: missingLabOrder.length + unassigned.length,
    };
  }, [appts]);

  const sorted = useMemo(() => {
    return [...appts]
      .filter(a => a.status !== 'cancelled')
      .sort((a, b) => {
        const sa = STATUS_ORDER.indexOf(a.status);
        const sb = STATUS_ORDER.indexOf(b.status);
        if (sa !== sb) return sa - sb;
        return (a.appointment_time || '').localeCompare(b.appointment_time || '');
      });
  }, [appts]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
    if (error) { toast.error('Failed to update'); return; }
    toast.success(`Marked ${status}`);
    fetchToday();
  };

  const dialPhone = (phone: string | null) => {
    if (!phone) return;
    window.location.href = `tel:${phone.replace(/\D/g, '')}`;
  };

  const textPhone = (phone: string | null, name: string | null) => {
    if (!phone) return;
    const clean = phone.replace(/\D/g, '');
    window.location.href = `sms:+1${clean}?&body=Hi ${name?.split(' ')[0] || ''}, this is ConveLabs — `;
  };

  // "Do next" — the four queues that used to be four nav items, with the link
  // that opens each one. Counts come from the shared badge subscriptions, so
  // this costs no extra queries.
  const doNext = [
    { n: counts.actionItems, label: 'items need attention', to: `${basePath}/inbox/action-items`, dot: 'bg-[#B91C1C]' },
    { n: counts.sms, label: 'unread patient replies', to: `${basePath}/inbox/sms`, dot: 'bg-amber-500' },
    { n: counts.chat, label: 'website chats waiting', to: `${basePath}/inbox/chat`, dot: 'bg-amber-500' },
    { n: counts.tasks, label: 'open tasks assigned to you', to: `${basePath}/inbox/tasks`, dot: 'bg-gray-400' },
  ].filter(x => x.n > 0);

  const summary = [
    `${metrics.total} visit${metrics.total === 1 ? '' : 's'} today`,
    metrics.inProgress > 0 ? `${metrics.inProgress} in progress` : null,
    metrics.nextTime ? `next at ${metrics.nextTime}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{format(new Date(), 'EEEE, d MMMM')}</h1>
          <p className="text-sm text-muted-foreground">{summary || 'No visits scheduled'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`${basePath}/system/settings`}>Block time</Link>
          </Button>
          <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white" asChild>
            <Link to={`${basePath}/schedule/calendar`}>Book a visit</Link>
          </Button>
        </div>
      </div>

      {/* Attention strip — every number opens the list behind it */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <AttentionCard
          label="Needs attention"
          value={metrics.blocked}
          caption="visits missing an order or a phlebotomist"
          cta="Open the list"
          to={`${basePath}/schedule/appointments`}
          urgent={metrics.blocked > 0}
        />
        <AttentionCard
          label="Specimens in transit"
          value={specimensInTransit === null ? '—' : specimensInTransit}
          caption="awaiting results"
          cta="Track"
          to={`${basePath}/lab/specimens`}
        />
        <AttentionCard
          label="Unpaid today"
          value={metrics.unpaidCount}
          caption={`${money(metrics.unpaidTotal)} outstanding`}
          cta="Chase"
          to={`${basePath}/billing/invoices`}
          urgent={metrics.unpaidCount > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Run of day */}
        <div className="lg:col-span-2 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">Run of day</h2>
            <Link to={`${basePath}/schedule/calendar`} className="text-xs font-semibold text-[#B91C1C] hover:underline">
              Full schedule →
            </Link>
          </div>

          {loading ? (
            <Card className="shadow-sm"><CardContent className="p-8 text-center text-sm text-muted-foreground">Loading today's visits...</CardContent></Card>
          ) : sorted.length === 0 ? (
            <Card className="shadow-sm border-dashed">
              <CardContent className="p-8 text-center">
                <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="font-semibold">No visits today</p>
                <p className="text-xs text-muted-foreground mb-3">Good day to run a campaign or fill tomorrow's calendar.</p>
                <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white" asChild>
                  <Link to={`${basePath}/schedule/calendar`}>Open the calendar →</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {sorted.map((a) => {
                const sty = statusStyle(a.status);
                const missingLab = !a.lab_order_file_path && (a.service_type === 'mobile' || a.service_type === 'senior') && a.status !== 'completed';
                const unpaid = a.payment_status !== 'completed';
                return (
                  <Card key={a.id} className="shadow-sm">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
                        <div className="w-16 flex-shrink-0 pt-0.5">
                          <p className="text-xs font-bold">{a.appointment_time || '—'}</p>
                        </div>
                        <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${sty.bar}`} />
                        <div className="flex-1 min-w-[9rem]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm truncate">{a.patient_name || 'Unknown patient'}</p>
                            {a.total_amount ? <span className="text-xs font-semibold text-emerald-700">{money(a.total_amount)}</span> : null}
                          </div>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                            <MapPin className="h-3 w-3 flex-shrink-0" /> {a.address || 'No address'}
                          </p>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {missingLab && <Badge variant="outline" className="bg-amber-50 border-amber-300 text-amber-700 text-[10px]">No lab order</Badge>}
                            {unpaid && <Badge variant="outline" className="bg-red-50 border-red-300 text-red-700 text-[10px]">Unpaid</Badge>}
                            {!a.phlebotomist_id && a.status !== 'completed' && (
                              <Badge variant="outline" className="bg-blue-50 border-blue-300 text-blue-700 text-[10px]">Unassigned</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 w-full sm:w-auto justify-end">
                          <Badge variant="outline" className={`text-[10px] ${sty.text} ${sty.bg} border-current`}>
                            {sty.label}
                          </Badge>
                          {a.patient_phone && (
                            <>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => dialPhone(a.patient_phone)} aria-label="Call patient">
                                <Phone className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => textPhone(a.patient_phone, a.patient_name)} aria-label="Text patient">
                                <MessageSquare className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          {a.status === 'scheduled' && (
                            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => updateStatus(a.id, 'confirmed')}>
                              Confirm
                            </Button>
                          )}
                          {a.status === 'confirmed' && (
                            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => updateStatus(a.id, 'en_route')}>
                              En route
                            </Button>
                          )}
                          {['en_route', 'in_progress'].includes(a.status) && (
                            <Button size="sm" className="h-7 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => updateStatus(a.id, 'completed')}>
                              Complete
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <h2 className="text-sm font-bold">Do next</h2>
              <p className="text-xs text-muted-foreground mb-3">The queue. One place, not four.</p>
              {doNext.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Nothing waiting. The queue is clear.</p>
              ) : (
                <ul className="space-y-2">
                  {doNext.map(item => (
                    <li key={item.to}>
                      <Link to={item.to} className="flex items-start gap-2.5 group">
                        <span className={`mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${item.dot}`} />
                        <span className="text-xs leading-snug">
                          <span className="font-bold">{item.n}</span>{' '}
                          <span className="text-muted-foreground group-hover:text-foreground">{item.label}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to={`${basePath}/inbox`}
                className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-[#B91C1C] hover:underline"
              >
                All {counts.inbox} items <ChevronRight className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-4">
              <h2 className="text-sm font-bold mb-3">This month</h2>
              <div className="space-y-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Visits completed</span>
                  <span className="text-lg font-bold">{month ? month.visits : '—'}</span>
                </div>
                <div className="h-px bg-gray-100" />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Collected</span>
                  <span className="text-lg font-bold">{month ? money(month.collected) : '—'}</span>
                </div>
                <div className="h-px bg-gray-100" />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Booked today</span>
                  <span className="text-lg font-bold">{money(metrics.booked)}</span>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
                Whole-business revenue detail lives under Owner. This card is the same for every admin.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TodayExecutionView;
