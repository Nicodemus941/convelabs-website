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

      // 1. Banked: actual staff_payouts rows (Stripe transfer already fired)
      const { data: payouts } = await supabase
        .from('staff_payouts' as any)
        .select('amount_cents, base_per_visit_cents, tip_cents, created_at, appointment_id')
        .eq('staff_id', staffId)
        .gte('created_at', `${monthStartISO}T00:00:00`);
      const payoutsByDate = new Map<string, { amt: number; base: number; tip: number }>();
      const payoutAppointmentIds = new Set<string>();
      for (const p of (payouts || []) as any[]) {
        const d = String(p.created_at).substring(0, 10);
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
        .select('id, appointment_date, service_type, status, tip_amount, family_group_id, total_amount, phlebotomist_id')
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
          // Use the canonical RPC so projection matches Stripe Connect split exactly
          try {
            const { data: takeRes } = await supabase.rpc('compute_phleb_take_cents' as any, {
              p_staff_id: staffId,
              p_service_type: a.service_type || 'mobile',
              p_tip_cents: tipCents,
              p_has_companion: hasCompanion,
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
        try {
          const { data: takeRes } = await supabase.rpc('compute_phleb_take_cents' as any, {
            p_staff_id: staffId,
            p_service_type: a.service_type || 'mobile',
            p_tip_cents: tipCents,
            p_has_companion: hasCompanion,
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
      .channel(`phleb-earnings-${staffId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, async (payload: any) => {
        try {
          const newRow = payload.new || {};
          const oldRow = payload.old || {};
          const becameCancelled = newRow.status === 'cancelled' && oldRow.status !== 'cancelled';
          if (becameCancelled && newRow.id && !seenCancellations.current.has(newRow.id)) {
            seenCancellations.current.add(newRow.id);
            const tipCents = Math.round(((newRow.tip_amount || 0) as number) * 100);
            const { data: takeRes } = await supabase.rpc('compute_phleb_take_cents' as any, {
              p_staff_id: staffId,
              p_service_type: newRow.service_type || 'mobile',
              p_tip_cents: tipCents,
              p_has_companion: !!newRow.family_group_id,
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

  if (!staffId) return null;

  // The headline = today's combined (banked + projected). If the day is
  // half-completed it shows "earned + projected separately."
  const todayTotal = today.banked_cents + today.projected_cents;
  const goalDailyCents = Math.round((504000 / 30));   // $5,040/mo ÷ 30 days = ~$168/day target
  const todayPaceVsGoal = goalDailyCents > 0 ? Math.round((todayTotal / goalDailyCents) * 100) : 0;

  return (
    <div className="max-w-lg md:max-w-6xl mx-auto px-4 md:px-6 -mt-4 mb-4">
      <Card className="overflow-hidden border-0 shadow-md">
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white px-5 py-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs uppercase tracking-wider opacity-90 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> Today's earnings
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
        </div>

        {/* Three-column subgrid: tomorrow, this week, MTD */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 text-center bg-white">
          <div className="px-2 py-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Tomorrow</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">{fmt(tomorrow.projected_cents)}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{tomorrow.visit_count} visit{tomorrow.visit_count === 1 ? '' : 's'}</p>
          </div>
          <div className="px-2 py-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">This week</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">{fmt(week.banked_cents + week.projected_cents)}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{week.visit_count} visit{week.visit_count === 1 ? '' : 's'}</p>
          </div>
          <div className="px-2 py-3 bg-emerald-50/30">
            <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold flex items-center justify-center gap-1">
              <TrendingUp className="h-2.5 w-2.5" /> MTD
            </p>
            <p className="text-lg font-bold text-emerald-900 mt-0.5">{fmt(mtd.banked_cents + mtd.projected_cents)}</p>
            <p className="text-[10px] text-emerald-700 mt-0.5">/ $5,040 goal</p>
          </div>
        </div>

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
    </div>
  );
};

export default PhlebEarningsCard;
