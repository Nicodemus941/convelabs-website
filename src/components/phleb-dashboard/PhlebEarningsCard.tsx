/**
 * PhlebEarningsCard — top-of-dashboard "scoreboard."
 *
 * Hormozi: replace "schedule viewer" feel with "what am I making."
 * Three columns:
 *   • Today    — banked (completed visits with staff_payouts) + projected
 *                (still-to-do scheduled visits this date) + tips already
 *                captured on the appointment row.
 *   • Tomorrow — pure projection.
 *   • This week / month — rolling totals.
 *
 * Real-time: subscribes to appointments + staff_payouts inserts/updates so
 * a slot added or completed flips the numbers without a refresh.
 */

import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { DollarSign, TrendingUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { extractSurchargeCents } from '@/lib/phlebSurchargeMap';

interface DayBucket {
  base_cents: number;
  tip_cents: number;
  banked_cents: number;     // already paid out (Stripe Connect transfer fired)
  projected_cents: number;  // still-to-do scheduled
  visit_count: number;
  completed_count: number;
}

const ZERO: DayBucket = { base_cents: 0, tip_cents: 0, banked_cents: 0, projected_cents: 0, visit_count: 0, completed_count: 0 };

function fmt(c: number): string {
  return `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmt2(c: number): string {
  return `$${(c / 100).toFixed(2)}`;
}
function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

const PhlebEarningsCard: React.FC = () => {
  const { user } = useAuth();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [today, setToday] = useState<DayBucket>(ZERO);
  const [tomorrow, setTomorrow] = useState<DayBucket>(ZERO);
  const [week, setWeek] = useState<DayBucket>(ZERO);
  const [mtd, setMtd] = useState<DayBucket>(ZERO);
  const [ytd, setYtd] = useState<DayBucket>(ZERO);
  // Last-month banked total — sourced directly from staff_payouts so it
  // automatically reflects the post-2026-05-13 reconciliation row(s) plus
  // any historical Stripe Connect transfers. Hormozi: "Last month banked"
  // is the operator's "did I get paid for what I did?" mirror.
  const [lastMonthCents, setLastMonthCents] = useState<number>(0);
  const [last7, setLast7] = useState<{ date: string; cents: number }[]>([]);
  const [loading, setLoading] = useState(true);
  // Track recent cancellations so we can ghost the lost $X (Hormozi
  // "make the cost of cancellations visible"). Keyed by appt id.
  const seenCancellations = useRef<Set<string>>(new Set());

  // Resolve staff_id from auth user
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('staff_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      setStaffId((data as any)?.id || null);
    })();
  }, [user?.id]);

  const compute = async () => {
    if (!staffId) return;
    setLoading(true);
    try {
      const now = new Date();
      const todayISO = localISO(now);
      const tomorrowISO = localISO(new Date(now.getTime() + 24 * 60 * 60 * 1000));
      // Week = Sun→Sat in local time
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekStartISO = localISO(weekStart);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthStartISO = localISO(monthStart);

      // 1. Banked: actual staff_payouts rows joined to appointment_date.
      // CRITICAL: We bucket by appointment_date (when the visit happened),
      // NOT by payouts.created_at (when the DB row was inserted). Otherwise
      // backfills / reconciliation rows inserted today bleed into "Today's
      // earnings" and overstate the number by orders of magnitude (e.g.
      // 35 v2 reconciliation rows for April visits → $2,911 phantom today).
      const { data: payouts } = await supabase
        .from('staff_payouts' as any)
        .select(`amount_cents, base_per_visit_cents, tip_cents, created_at, appointment_id,
                 appointment:appointments!inner(appointment_date, payment_arrangement)`)
        .eq('staff_id', staffId)
        .gte('created_at', `${monthStartISO}T00:00:00`);
      const payoutsByDate = new Map<string, { amt: number; base: number; tip: number }>();
      const payoutAppointmentIds = new Set<string>();
      for (const p of (payouts || []) as any[]) {
        const appt = p.appointment;
        // Exclude prepaid arrangements — these already settled outside the
        // per-visit flow (Lawrence Carpenter standing order, etc.)
        if (appt?.payment_arrangement && ['standing_order_prepaid','bundle_prepaid','imported_legacy','paid_offline','comp'].includes(appt.payment_arrangement)) {
          continue;
        }
        // Bucket by APPOINTMENT_DATE — falls back to created_at only if the
        // row has no linked appointment (rare).
        const d = appt?.appointment_date
          ? String(appt.appointment_date).substring(0, 10)
          : String(p.created_at).substring(0, 10);
        const cur = payoutsByDate.get(d) || { amt: 0, base: 0, tip: 0 };
        cur.amt += p.amount_cents || 0;
        cur.base += p.base_per_visit_cents || 0;
        cur.tip += p.tip_cents || 0;
        payoutsByDate.set(d, cur);
        if (p.appointment_id) payoutAppointmentIds.add(p.appointment_id);
      }

      // 2. Projected: scheduled/confirmed visits without a payout yet.
      // Compute via the existing RPC for parity with the Stripe Connect
      // split. Tip_cents pulled from appointments.tip_amount (online
      // checkout tips already captured).
      const { data: appts } = await supabase
        .from('appointments')
        .select('id, appointment_date, service_type, status, tip_amount, family_group_id, total_amount, phlebotomist_id, pricing_breakdown, surcharge_amount')
        .gte('appointment_date', `${monthStartISO}T00:00:00`)
        .in('status', ['scheduled', 'confirmed', 'en_route', 'arrived', 'in_progress', 'specimen_delivered', 'completed'])
        .order('appointment_date', { ascending: true });

      // Pre-fetch family-group sibling counts to detect has_companion
      // (any appointment that shares a family_group_id with another).
      const groupCounts = new Map<string, number>();
      for (const a of (appts || []) as any[]) {
        if (a.family_group_id) groupCounts.set(a.family_group_id, (groupCounts.get(a.family_group_id) || 0) + 1);
      }

      const buckets: Record<'today' | 'tomorrow' | 'week' | 'mtd', DayBucket> =
        { today: { ...ZERO }, tomorrow: { ...ZERO }, week: { ...ZERO }, mtd: { ...ZERO } };

      for (const a of (appts || []) as any[]) {
        const apptDateISO = String(a.appointment_date).substring(0, 10);
        const isToday = apptDateISO === todayISO;
        const isTomorrow = apptDateISO === tomorrowISO;
        const isThisWeek = apptDateISO >= weekStartISO;
        const isMonth = apptDateISO >= monthStartISO;

        const tipCents = Math.round(((a.tip_amount || 0) as number) * 100);
        const hasCompanion = !!(a.family_group_id && (groupCounts.get(a.family_group_id) || 0) > 1);

        let takeCents = 0;
        const alreadyBanked = a.id && payoutAppointmentIds.has(a.id);
        if (!alreadyBanked) {
          // Use the canonical RPC so projection matches Stripe Connect split
          // exactly. Pass per-type surcharge cents from pricing_breakdown so
          // distance / after-hours / same-day / weekend dollars flow to the
          // phleb account (per phleb_pay_surcharge_rules).
          const surcharges = extractSurchargeCents(a.pricing_breakdown, a.surcharge_amount);
          try {
            const { data: takeRes } = await supabase.rpc('compute_phleb_take_cents' as any, {
              p_staff_id: staffId,
              p_service_type: a.service_type || 'mobile',
              p_tip_cents: tipCents,
              p_has_companion: hasCompanion,
              p_surcharges: surcharges as any,
            });
            takeCents = Math.max(0, parseInt(String(takeRes || 0), 10));
          } catch { /* ignore — bucket gets 0 */ }
        }

        const incBucket = (b: DayBucket) => {
          b.visit_count += 1;
          if (alreadyBanked) {
            // Banked counted via payouts query below; just count visit
            b.completed_count += 1;
          } else {
            b.projected_cents += takeCents;
            // Split tip vs base for the secondary line
            b.tip_cents += tipCents > 0 ? Math.round(takeCents * (tipCents / Math.max(1, takeCents))) : 0;
            b.base_cents += takeCents - (tipCents > 0 ? Math.round(takeCents * (tipCents / Math.max(1, takeCents))) : 0);
          }
        };
        if (isToday) incBucket(buckets.today);
        if (isTomorrow) incBucket(buckets.tomorrow);
        if (isThisWeek) incBucket(buckets.week);
        if (isMonth) incBucket(buckets.mtd);
      }

      // Fold banked totals (from payouts) into matching buckets
      payoutsByDate.forEach((v, dISO) => {
        if (dISO === todayISO) buckets.today.banked_cents += v.amt;
        if (dISO === tomorrowISO) buckets.tomorrow.banked_cents += v.amt;
        if (dISO >= weekStartISO) buckets.week.banked_cents += v.amt;
        if (dISO >= monthStartISO) buckets.mtd.banked_cents += v.amt;
      });

      setToday(buckets.today);
      setTomorrow(buckets.tomorrow);
      setWeek(buckets.week);
      setMtd(buckets.mtd);

      // ── LAST MONTH BANKED ─────────────────────────────────────────
      // Quick sum from staff_payouts for the calendar month BEFORE the
      // current one. Includes manual_owed rows (reconciliation entries)
      // so the post-2026-05-13 owner-takes-everything restructure shows
      // up retroactively. Excludes reversed/failed.
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const { data: lmPayouts } = await supabase
        .from('staff_payouts' as any)
        .select('amount_cents, transferred_at, status')
        .eq('staff_id', staffId)
        .gte('transferred_at', lastMonthStart.toISOString())
        .lt('transferred_at', thisMonthStart.toISOString());
      const lmTotal = ((lmPayouts || []) as any[])
        .filter(p => !['reversed', 'failed'].includes(String(p.status || '')))
        .reduce((sum, p) => sum + (p.amount_cents || 0), 0);
      setLastMonthCents(lmTotal);

      // ── YTD BANKED + OWED ─────────────────────────────────────────
      // Sum every payout row whose APPOINTMENT_DATE is in this calendar
      // year (not its created_at). Excludes prepaid arrangements + the
      // failed/reversed statuses.
      const yearStartISO = `${now.getFullYear()}-01-01`;
      const { data: ytdPayouts } = await supabase
        .from('staff_payouts' as any)
        .select(`amount_cents, status, appointment:appointments!inner(appointment_date, payment_arrangement)`)
        .eq('staff_id', staffId)
        .gte('appointments.appointment_date', yearStartISO);
      const ytdTotal = ((ytdPayouts || []) as any[])
        .filter(p => !['reversed', 'failed'].includes(String(p.status || '')))
        .filter(p => !((p.appointment?.payment_arrangement || '') in {
          'standing_order_prepaid': 1, 'bundle_prepaid': 1, 'imported_legacy': 1, 'paid_offline': 1, 'comp': 1
        }))
        .reduce((sum, p) => sum + (p.amount_cents || 0), 0);
      setYtd({ ...ZERO, banked_cents: ytdTotal });

      // Last-7-days mini sparkline. Sums per-day across both banked + projected
      // for visits scheduled in those days. Banked dominates for past days,
      // projected for today + future.
      const sparkMap = new Map<string, number>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        sparkMap.set(localISO(d), 0);
      }
      // Banked from payouts
      payoutsByDate.forEach((v, dISO) => {
        if (sparkMap.has(dISO)) sparkMap.set(dISO, (sparkMap.get(dISO) || 0) + v.amt);
      });
      // Projected from appts (only for today + future days within the 7-day window)
      for (const a of (appts || []) as any[]) {
        const apptDateISO = String(a.appointment_date).substring(0, 10);
        if (!sparkMap.has(apptDateISO)) continue;
        if (payoutAppointmentIds.has(a.id)) continue; // already counted via banked
        // Cheap projection — match the per-day buckets we computed above
        const tipCents = Math.round(((a.tip_amount || 0) as number) * 100);
        const hasCompanion = !!(a.family_group_id && (groupCounts.get(a.family_group_id) || 0) > 1);
        // Sparkline must use the same surcharge math as the buckets
        const surcharges = extractSurchargeCents(a.pricing_breakdown, a.surcharge_amount);
        try {
          const { data: takeRes } = await supabase.rpc('compute_phleb_take_cents' as any, {
            p_staff_id: staffId,
            p_service_type: a.service_type || 'mobile',
            p_tip_cents: tipCents,
            p_has_companion: hasCompanion,
            p_surcharges: surcharges as any,
          });
          const take = parseInt(String(takeRes || 0), 10);
          sparkMap.set(apptDateISO, (sparkMap.get(apptDateISO) || 0) + take);
        } catch { /* skip */ }
      }
      setLast7(Array.from(sparkMap.entries()).map(([date, cents]) => ({ date, cents })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!staffId) return;
    compute();
    // Realtime: any appointment or staff_payouts insert/update flips the numbers.
    // Bonus: when an appointment flips to cancelled, fire a "cost of cancel"
    // toast so the phleb sees the lost $X. Hormozi rule: invisible costs are
    // tolerated; visible costs get fixed.
    const ch = supabase
      .channel(`phleb-earnings-card-${staffId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, async (payload: any) => {
        try {
          const newRow = payload.new || {};
          const oldRow = payload.old || {};
          const becameCancelled = newRow.status === 'cancelled' && oldRow.status !== 'cancelled';
          if (becameCancelled && newRow.id && !seenCancellations.current.has(newRow.id)) {
            seenCancellations.current.add(newRow.id);
            const tipCents = Math.round(((newRow.tip_amount || 0) as number) * 100);
            // Include surcharges in the "lost revenue" toast so cancel impact
            // reflects what the phleb actually would have made (not just base).
            const surcharges = extractSurchargeCents(newRow.pricing_breakdown, newRow.surcharge_amount);
            const { data: takeRes } = await supabase.rpc('compute_phleb_take_cents' as any, {
              p_staff_id: staffId,
              p_service_type: newRow.service_type || 'mobile',
              p_tip_cents: tipCents,
              p_has_companion: !!newRow.family_group_id,
              p_surcharges: surcharges as any,
            });
            const lost = parseInt(String(takeRes || 0), 10);
            if (lost > 0) {
              toast.error(`Cancelled · lost $${(lost / 100).toFixed(0)}`, {
                description: newRow.patient_name ? `${newRow.patient_name}'s visit was cancelled.` : undefined,
                duration: 6000,
              });
            }
          }
        } catch { /* ignore */ }
        compute();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_payouts' }, () => compute())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId]);

  // Drilldown modal: when user taps "Today's earnings" hero, show the
  // exact visits + take per visit. Removes any "I don't trust this number"
  // friction by showing the math.
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownRows, setDrilldownRows] = useState<Array<{
    id: string; time: string; patient_name: string; service_type: string;
    total: number; take: number; status: string; rule: string;
  }>>([]);
  const openDrilldown = async () => {
    if (!staffId) return;
    setDrilldownOpen(true);
    try {
      const todayDate = localISO(new Date());
      const { data: phlebRow } = await supabase
        .from('staff_profiles').select('user_id').eq('id', staffId).maybeSingle();
      const phlebUserId = (phlebRow as any)?.user_id;
      if (!phlebUserId) { setDrilldownRows([]); return; }
      const { data: appts } = await supabase
        .from('appointments')
        .select('id, appointment_time, patient_name, service_type, total_amount, status, payment_arrangement')
        .eq('phlebotomist_id', phlebUserId)
        .eq('appointment_date', todayDate)
        .neq('status', 'cancelled')
        .order('appointment_time', { ascending: true });
      const list = (appts || []) as any[];
      // Pull v2 take for each visit in parallel
      const takes = await Promise.all(list.map(async (a) => {
        const { data } = await supabase.rpc('compute_phleb_take_v2' as any, { p_appointment_id: a.id });
        const r = Array.isArray(data) ? data[0] : data;
        return { id: a.id, take: (r?.take_cents || 0) / 100, rule: r?.rule_used || '' };
      }));
      const takeMap = new Map(takes.map(t => [t.id, t]));
      setDrilldownRows(list.map(a => ({
        id: a.id,
        time: a.appointment_time || '',
        patient_name: a.patient_name || 'Patient',
        service_type: a.service_type || 'mobile',
        total: Number(a.total_amount || 0),
        take: takeMap.get(a.id)?.take || 0,
        status: a.status,
        rule: takeMap.get(a.id)?.rule || '',
      })));
    } catch (e) {
      console.error('[earnings drilldown]', e);
      setDrilldownRows([]);
    }
  };

  if (!staffId) return null;

  // The headline = today's combined (banked + projected). If the day is
  // half-completed it shows "earned + projected separately."
  const todayTotal = today.banked_cents + today.projected_cents;

  // ────────── Hormozi pace anchors ──────────
  // Monthly goal anchor: $5,040 (Hormozi-pace target the user agreed to)
  const MONTHLY_GOAL_CENTS = 504000;
  const ANNUAL_GOAL_CENTS = MONTHLY_GOAL_CENTS * 12;     // $60,480
  const goalDailyCents = Math.round(MONTHLY_GOAL_CENTS / 30);  // ~$168/day
  const WEEKLY_GOAL_CENTS = goalDailyCents * 7;          // ~$1,176

  const _now = new Date();
  const _daysIntoMonth = _now.getDate();
  const _daysInMonth = new Date(_now.getFullYear(), _now.getMonth() + 1, 0).getDate();
  const _daysLeftInMonth = _daysInMonth - _daysIntoMonth;
  const _dayOfYear = Math.floor((_now.getTime() - new Date(_now.getFullYear(), 0, 1).getTime()) / 86400000) + 1;
  const _daysInYear = (new Date(_now.getFullYear(), 11, 31).getTime() - new Date(_now.getFullYear(), 0, 1).getTime()) / 86400000 + 1;
  const _ytdGoalProRated = Math.round(ANNUAL_GOAL_CENTS * (_dayOfYear / _daysInYear));

  const todayPaceVsGoal = goalDailyCents > 0 ? Math.round((todayTotal / goalDailyCents) * 100) : 0;
  const mtdTotal = mtd.banked_cents + mtd.projected_cents;
  const mtdGoalProRated = Math.round(MONTHLY_GOAL_CENTS * (_daysIntoMonth / _daysInMonth));
  const mtdPacePct = mtdGoalProRated > 0 ? Math.round((mtdTotal / mtdGoalProRated) * 100) : 0;
  // Color tier: <70% red, 70-99% amber, >=100% green
  const mtdPaceColor = mtdPacePct >= 100 ? 'emerald' : mtdPacePct >= 70 ? 'amber' : 'red';
  const dailyNeededCents = _daysLeftInMonth > 0
    ? Math.max(0, Math.round((MONTHLY_GOAL_CENTS - mtdTotal) / _daysLeftInMonth))
    : 0;

  const wtdTotal = week.banked_cents + week.projected_cents;
  const wtdPacePct = WEEKLY_GOAL_CENTS > 0 ? Math.round((wtdTotal / WEEKLY_GOAL_CENTS) * 100) : 0;
  const ytdPacePct = _ytdGoalProRated > 0 ? Math.round((ytd.banked_cents / _ytdGoalProRated) * 100) : 0;

  return (
    <div className="max-w-lg md:max-w-6xl mx-auto px-4 md:px-6 -mt-4 mb-4">
      <Card className="overflow-hidden border-0 shadow-md">
        <button
          type="button"
          onClick={openDrilldown}
          className="w-full text-left bg-gradient-to-br from-emerald-600 to-emerald-700 text-white px-5 py-4 hover:brightness-110 transition-all active:scale-[0.99]"
          title="Tap to see today's visits + per-visit phleb take"
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs uppercase tracking-wider opacity-90 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> Today's earnings
              <span className="text-[10px] opacity-70 ml-1">· tap to drill down</span>
            </p>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" />}
          </div>
          <p className="text-3xl font-bold">{fmt(todayTotal)}</p>
          <div className="flex items-center gap-3 mt-1 text-[11px] opacity-90">
            {today.banked_cents > 0 && <span>✓ {fmt(today.banked_cents)} banked</span>}
            {today.projected_cents > 0 && <span>⏳ {fmt(today.projected_cents)} projected</span>}
            {today.visit_count > 0 && <span>· {today.visit_count} visit{today.visit_count === 1 ? '' : 's'}</span>}
            {today.tip_cents > 0 && <span>· incl. tips</span>}
          </div>
          {todayPaceVsGoal > 0 && (
            <div className="mt-2.5">
              <div className="h-1 w-full bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white" style={{ width: `${Math.min(todayPaceVsGoal, 100)}%` }} />
              </div>
              <p className="text-[10px] mt-1 opacity-80">
                {todayPaceVsGoal}% of daily $5K-pace target ({fmt(goalDailyCents)})
              </p>
            </div>
          )}
        </button>

        {/* Hormozi pace strip — single line of math the operator can act on */}
        <div className={`px-4 py-2 text-[11px] flex items-center justify-between gap-2 ${
          mtdPaceColor === 'emerald' ? 'bg-emerald-50 text-emerald-900' :
          mtdPaceColor === 'amber' ? 'bg-amber-50 text-amber-900' :
          'bg-red-50 text-red-900'
        }`}>
          <span className="font-semibold">
            {mtdPacePct}% of May goal · {_daysLeftInMonth} day{_daysLeftInMonth === 1 ? '' : 's'} left
          </span>
          <span className="font-bold">
            {dailyNeededCents > 0
              ? `Need ${fmt(dailyNeededCents)}/day to close`
              : '🎯 goal hit'}
          </span>
        </div>

        {/* Phleb-earnings subgrid — all values are YOUR v2 take.
            Each cell shows: amount · % of pro-rated pace anchor.
            Color tier on MTD (red <70% / amber 70-99 / emerald 100+). */}
        <div className="grid grid-cols-4 divide-x divide-gray-100 text-center bg-white">
          <div className="px-2 py-3" title={`This week (Sun→today). Goal: ${fmt(WEEKLY_GOAL_CENTS)}. You're at ${wtdPacePct}% of weekly target.`}>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">WTD</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">{fmt(wtdTotal)}</p>
            <p className={`text-[10px] mt-0.5 ${wtdPacePct >= 100 ? 'text-emerald-700' : wtdPacePct >= 70 ? 'text-gray-500' : 'text-red-600'}`}>
              {wtdPacePct}% of {fmt(WEEKLY_GOAL_CENTS)}
            </p>
          </div>
          <div className={`px-2 py-3 ${mtdPaceColor === 'emerald' ? 'bg-emerald-50/40' : mtdPaceColor === 'amber' ? 'bg-amber-50/40' : 'bg-red-50/40'}`}
               title={`This month. Pro-rated pace target through today: ${fmt(mtdGoalProRated)}. Full month: ${fmt(MONTHLY_GOAL_CENTS)}.`}>
            <p className={`text-[10px] uppercase tracking-wider font-semibold flex items-center justify-center gap-1 ${
              mtdPaceColor === 'emerald' ? 'text-emerald-700' : mtdPaceColor === 'amber' ? 'text-amber-800' : 'text-red-700'
            }`}>
              <TrendingUp className="h-2.5 w-2.5" /> MTD
            </p>
            <p className={`text-lg font-bold mt-0.5 ${
              mtdPaceColor === 'emerald' ? 'text-emerald-900' : mtdPaceColor === 'amber' ? 'text-amber-900' : 'text-red-900'
            }`}>{fmt(mtdTotal)}</p>
            <p className={`text-[10px] mt-0.5 ${
              mtdPaceColor === 'emerald' ? 'text-emerald-700' : mtdPaceColor === 'amber' ? 'text-amber-800' : 'text-red-700'
            }`}>{mtdPacePct}% / $5,040</p>
          </div>
          <div className="px-2 py-3 bg-blue-50/30" title={`Year-to-date phleb earnings. Pro-rated pace target through day ${_dayOfYear}: ${fmt(_ytdGoalProRated)}. Full year: ${fmt(ANNUAL_GOAL_CENTS)}.`}>
            <p className="text-[10px] uppercase tracking-wider text-blue-700 font-semibold">YTD</p>
            <p className="text-lg font-bold text-blue-900 mt-0.5">{fmt(ytd.banked_cents)}</p>
            <p className={`text-[10px] mt-0.5 ${ytdPacePct >= 100 ? 'text-emerald-700' : ytdPacePct >= 70 ? 'text-blue-700' : 'text-red-600'}`}>
              {ytdPacePct}% of {fmt(_ytdGoalProRated)} pace
            </p>
          </div>
          <div className="px-2 py-3 bg-amber-50/40" title="Banked + reconciliation rows for the prior calendar month.">
            <p className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">Last mo</p>
            <p className="text-lg font-bold text-amber-900 mt-0.5">{fmt(lastMonthCents)}</p>
            <p className="text-[10px] text-amber-700 mt-0.5">banked + owed</p>
          </div>
        </div>

        {/* Next-Best-Action tile — turns the scoreboard into a coaching dashboard.
            One specific lift recommendation based on the weakest signal we see. */}
        {(() => {
          // Decision tree (Hormozi: one number, one action)
          let action: { icon: string; title: string; detail: string; tone: 'urgent' | 'ok' } | null = null;
          if (mtdPacePct < 70 && _daysLeftInMonth > 0) {
            action = {
              icon: '⚡',
              title: `You're ${100 - mtdPacePct}% behind May pace`,
              detail: `Hit ${fmt(dailyNeededCents)}/day every remaining day (${_daysLeftInMonth} left) to close. Pick up 1 extra mobile visit/day = +$63 toward goal.`,
              tone: 'urgent',
            };
          } else if (wtdPacePct < 70) {
            action = {
              icon: '📅',
              title: `Slow week — ${wtdPacePct}% of weekly pace`,
              detail: `Open early-AM slots (6-8 AM) for the next 3 days. Member-only window converts at 2x normal rate.`,
              tone: 'urgent',
            };
          } else if (today.visit_count === 0 && tomorrow.visit_count === 0) {
            action = {
              icon: '🪟',
              title: 'Nothing on the books for today or tomorrow',
              detail: `Text 3 partner orgs offering same-day capacity. Aristotle and Elite Medical typically respond within 1 hr.`,
              tone: 'urgent',
            };
          } else if (mtdPacePct >= 100) {
            action = {
              icon: '🎯',
              title: `Crushing it — ${mtdPacePct}% of May pace`,
              detail: `Use surplus capacity to lock in next month: schedule 5 standing-order patients for June.`,
              tone: 'ok',
            };
          }
          if (!action) return null;
          return (
            <div className={`px-4 py-2.5 border-t border-gray-100 flex items-start gap-2.5 ${
              action.tone === 'urgent' ? 'bg-white' : 'bg-emerald-50/30'
            }`}>
              <div className="text-lg flex-shrink-0">{action.icon}</div>
              <div className="min-w-0 flex-1">
                <p className={`text-[11px] font-bold ${action.tone === 'urgent' ? 'text-red-800' : 'text-emerald-800'}`}>
                  {action.title}
                </p>
                <p className="text-[10px] text-gray-700 mt-0.5 leading-relaxed">{action.detail}</p>
              </div>
            </div>
          );
        })()}

        {/* Last 7 days sparkline. Each bar = one day, height proportional
            to that day's earnings (banked + projected). Today is the
            rightmost bar with an emerald fill; past days are gray. */}
        {last7.length > 0 && (() => {
          const maxCents = Math.max(...last7.map(d => d.cents), 1);
          const todayISO = localISO(new Date());
          return (
            <div className="px-3 py-2 border-t border-gray-100 bg-white">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Last 7 days</p>
                <p className="text-[10px] text-gray-500">
                  {fmt(last7.reduce((s, d) => s + d.cents, 0))} total
                </p>
              </div>
              <div className="flex items-end gap-1 h-12">
                {last7.map(d => {
                  const isToday = d.date === todayISO;
                  const heightPct = (d.cents / maxCents) * 100;
                  const dayLabel = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'narrow' });
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.date}: ${fmt2(d.cents)}`}>
                      <div
                        className={`w-full rounded-t ${isToday ? 'bg-emerald-500' : 'bg-gray-300'}`}
                        style={{ height: `${Math.max(heightPct, 4)}%` }}
                      />
                      <span className={`text-[9px] mt-0.5 ${isToday ? 'text-emerald-700 font-bold' : 'text-gray-400'}`}>{dayLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </Card>

      {/* Drilldown modal — Today's actual visits + per-visit phleb take.
          Hormozi: every visible number deserves a "show me the math" gesture. */}
      {drilldownOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center p-4"
          onClick={() => setDrilldownOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Today's earnings · drilldown</h2>
                <p className="text-xs text-gray-500">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
              </div>
              <button onClick={() => setDrilldownOpen(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
            </div>
            {drilldownRows.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No visits today.</p>
            ) : (
              <>
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Total today</p>
                  <p className="text-2xl font-bold text-emerald-900">
                    ${drilldownRows.reduce((s, r) => s + r.take, 0).toFixed(0)}
                  </p>
                  <p className="text-[11px] text-emerald-700">{drilldownRows.length} visit{drilldownRows.length === 1 ? '' : 's'} (v2 take)</p>
                </div>
                <div className="divide-y border rounded-lg max-h-64 overflow-y-auto">
                  {drilldownRows.map(r => (
                    <div key={r.id} className="p-2.5 flex items-start justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-900 truncate">{r.patient_name}</div>
                        <div className="text-[10px] text-gray-500">
                          {r.time} · {r.service_type} · patient $${r.total.toFixed(0)} · {r.status}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{r.rule}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-base font-bold text-emerald-700">+${r.take.toFixed(0)}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 text-center">
                  All numbers use compute_phleb_take_v2 · bucketed by appointment_date
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PhlebEarningsCard;
