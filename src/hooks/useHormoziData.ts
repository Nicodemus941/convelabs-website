import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * useHormoziData — single source for the accountability dashboard.
 *
 * Hormozi principle: one screen, the numbers that change decisions.
 * Revenue, margin, LTV, CAC, retention, attention-items. Everything else
 * is accounting theater.
 *
 * Data sources:
 * - stripe_qb_sync_log (classified charges, source of truth for revenue)
 * - appointments (visit counts, channels, repeat rate)
 * - post_visit_sequences / sms_notifications / error_logs (attention items)
 *
 * Phleb labor cost is currently a standard-rate estimate ($55/visit,
 * 37% of revenue). Once Part C7 payroll automation ships, swap in the
 * actual phleb_payouts aggregate for real gross margin.
 */

const ASSUMED_PHLEB_COST_PER_VISIT = 55; // dollars
const ASSUMED_SUPPLIES_PER_VISIT = 10;   // dollars
const TARGET_GROSS_MARGIN_PCT = 53;       // strategic target

export interface HormoziKPIs {
  // Revenue (from stripe_qb_sync_log)
  revenue_today: number;
  revenue_mtd: number;
  revenue_last_month: number;
  revenue_projected_month_end: number;
  revenue_by_type: Array<{ type: string; amount: number; count: number }>;

  // Unit economics
  visits_mtd: number;
  avg_visit_revenue: number;
  estimated_cogs: number;
  estimated_gross_profit: number;
  estimated_gross_margin_pct: number;
  stripe_fees_mtd: number;

  // Retention (from appointments)
  total_patients: number;
  repeat_patients: number;
  repeat_rate_pct: number;
  new_patients_30d: number;

  // LTV cohort (cumulative revenue per patient by acquisition month)
  cohorts: Array<{
    cohort_month: string;
    patients: number;
    total_revenue: number;
    avg_ltv: number;
  }>;

  // CAC (channels — pulled from appointments.referral_source + booking_source)
  channels: Array<{
    channel: string;
    patients: number;
    revenue: number;
    avg_revenue_per_patient: number;
  }>;

  // Attention items (what needs your eyes this week)
  unpaid_invoices: Array<{
    id: string;
    patient_name: string | null;
    amount: number;
    age_days: number;
  }>;
  unclassified_charges: number;
  refunded_mtd: number;
  stuck_sequences: number;
  unresolved_errors: number;
}

const daysBetween = (from: Date, to: Date): number =>
  Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

export const useHormoziData = () => {
  return useQuery<HormoziKPIs>({
    queryKey: ['hormozi-dashboard'],
    staleTime: 2 * 60 * 1000, // 2 min — the dashboard should feel live but not thrash
    queryFn: async () => {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const endOfLastMonth = startOfMonth;
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // ── REVENUE ───────────────────────────────────────────────────
      const { data: mtdCharges } = await supabase
        .from('stripe_qb_sync_log' as any)
        .select('amount_gross_cents, amount_fee_cents, amount_refunded_cents, qb_income_type, charge_date, sync_status')
        .gte('charge_date', startOfMonth);

      const { data: todayCharges } = await supabase
        .from('stripe_qb_sync_log' as any)
        .select('amount_gross_cents')
        .gte('charge_date', startOfToday);

      const { data: lastMonthCharges } = await supabase
        .from('stripe_qb_sync_log' as any)
        .select('amount_gross_cents')
        .gte('charge_date', startOfLastMonth)
        .lt('charge_date', endOfLastMonth);

      const revenue_today = (todayCharges || []).reduce((s: number, c: any) => s + (c.amount_gross_cents || 0), 0) / 100;
      const revenue_mtd = (mtdCharges || []).reduce((s: number, c: any) => s + (c.amount_gross_cents || 0), 0) / 100;
      const revenue_last_month = (lastMonthCharges || []).reduce((s: number, c: any) => s + (c.amount_gross_cents || 0), 0) / 100;
      const stripe_fees_mtd = (mtdCharges || []).reduce((s: number, c: any) => s + (c.amount_fee_cents || 0), 0) / 100;
      const refunded_mtd = (mtdCharges || []).reduce((s: number, c: any) => s + (c.amount_refunded_cents || 0), 0) / 100;

      // Project month-end: revenue_mtd / (days_elapsed / days_in_month)
      const dayOfMonth = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const revenue_projected_month_end = dayOfMonth > 0
        ? (revenue_mtd / dayOfMonth) * daysInMonth
        : 0;

      // Revenue by income type
      const byTypeMap = new Map<string, { amount: number; count: number }>();
      for (const c of (mtdCharges as any[] | null) || []) {
        const key = c.qb_income_type || 'other';
        const cur = byTypeMap.get(key) || { amount: 0, count: 0 };
        cur.amount += (c.amount_gross_cents || 0) / 100;
        cur.count += 1;
        byTypeMap.set(key, cur);
      }
      const revenue_by_type = Array.from(byTypeMap.entries())
        .map(([type, v]) => ({ type, ...v }))
        .sort((a, b) => b.amount - a.amount);

      // Unclassified
      const unclassified_charges = byTypeMap.get('other')?.count || 0;

      // ── VISITS + MARGIN ───────────────────────────────────────────
      const { data: mtdApptsRaw } = await supabase
        .from('appointments')
        .select('id, total_amount, status')
        .gte('appointment_date', startOfMonth)
        .eq('status', 'completed');
      const mtdAppts = (mtdApptsRaw as any[] | null) || [];

      const visits_mtd = mtdAppts.length;
      const avg_visit_revenue = visits_mtd > 0
        ? mtdAppts.reduce((s: number, a: any) => s + (Number(a.total_amount) || 0), 0) / visits_mtd
        : 0;

      const estimated_cogs =
        visits_mtd * (ASSUMED_PHLEB_COST_PER_VISIT + ASSUMED_SUPPLIES_PER_VISIT)
        + stripe_fees_mtd;
      const estimated_gross_profit = revenue_mtd - estimated_cogs;
      const estimated_gross_margin_pct = revenue_mtd > 0
        ? (estimated_gross_profit / revenue_mtd) * 100
        : 0;

      // ── RETENTION ─────────────────────────────────────────────────
      const { data: allCompletedRaw } = await supabase
        .from('appointments')
        .select('patient_email, appointment_date, total_amount, created_at, referral_source, booking_source')
        .eq('status', 'completed')
        .not('patient_email', 'is', null);
      const allCompleted = (allCompletedRaw as any[] | null) || [];

      const patientMap = new Map<string, {
        visits: number;
        revenue: number;
        first_seen: string;
        channels: Set<string>;
      }>();

      for (const a of allCompleted) {
        const email = (a.patient_email || '').toLowerCase().trim();
        if (!email) continue;
        const cur = patientMap.get(email) || {
          visits: 0,
          revenue: 0,
          first_seen: a.appointment_date || a.created_at,
          channels: new Set<string>(),
        };
        cur.visits += 1;
        cur.revenue += Number(a.total_amount) || 0;
        if (a.appointment_date && a.appointment_date < cur.first_seen) {
          cur.first_seen = a.appointment_date;
        }
        const ch = a.referral_source || a.booking_source || 'direct';
        if (ch) cur.channels.add(String(ch));
        patientMap.set(email, cur);
      }

      const total_patients = patientMap.size;
      let repeat_patients = 0;
      for (const v of patientMap.values()) {
        if (v.visits > 1) repeat_patients += 1;
      }
      const repeat_rate_pct = total_patients > 0 ? (repeat_patients / total_patients) * 100 : 0;

      // New patients in last 30 days (first_seen within window)
      let new_patients_30d = 0;
      for (const v of patientMap.values()) {
        if (v.first_seen >= thirtyDaysAgo) new_patients_30d += 1;
      }

      // ── COHORTS (by acquisition month, last 6 months) ─────────────
      const cohortMap = new Map<string, { patients: number; total_revenue: number }>();
      for (const v of patientMap.values()) {
        const d = new Date(v.first_seen);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const cur = cohortMap.get(key) || { patients: 0, total_revenue: 0 };
        cur.patients += 1;
        cur.total_revenue += v.revenue;
        cohortMap.set(key, cur);
      }
      const cohorts = Array.from(cohortMap.entries())
        .map(([cohort_month, v]) => ({
          cohort_month,
          patients: v.patients,
          total_revenue: v.total_revenue,
          avg_ltv: v.patients > 0 ? v.total_revenue / v.patients : 0,
        }))
        .sort((a, b) => b.cohort_month.localeCompare(a.cohort_month))
        .slice(0, 6);

      // ── CHANNELS ──────────────────────────────────────────────────
      const channelMap = new Map<string, { patients: Set<string>; revenue: number }>();
      for (const [email, v] of patientMap.entries()) {
        for (const ch of v.channels) {
          const cur = channelMap.get(ch) || { patients: new Set<string>(), revenue: 0 };
          cur.patients.add(email);
          cur.revenue += v.revenue / v.channels.size; // split revenue across channels if multi-touch
          channelMap.set(ch, cur);
        }
      }
      const channels = Array.from(channelMap.entries())
        .map(([channel, v]) => ({
          channel,
          patients: v.patients.size,
          revenue: v.revenue,
          avg_revenue_per_patient: v.patients.size > 0 ? v.revenue / v.patients.size : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);

      // ── ATTENTION ITEMS ───────────────────────────────────────────
      const { data: unpaid } = await supabase
        .from('appointments')
        .select('id, patient_name, total_amount, total_price, created_at')
        .in('invoice_status', ['sent', 'reminded', 'final_warning'])
        .not('status', 'in', '("cancelled","rescheduled")')
        .order('created_at', { ascending: true })
        .limit(5);

      const unpaid_invoices = ((unpaid as any[] | null) || []).map((u: any) => ({
        id: u.id,
        patient_name: u.patient_name,
        amount: Number(u.total_amount || u.total_price || 0),
        age_days: daysBetween(new Date(u.created_at), now),
      }));

      const { count: stuck_sequences } = await (supabase as any)
        .from('post_visit_sequences')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .lt('scheduled_at', new Date(now.getTime() - 60 * 60 * 1000).toISOString());

      const { count: unresolved_errors } = await (supabase as any)
        .from('error_logs')
        .select('*', { count: 'exact', head: true })
        .eq('resolved', false)
        .gte('created_at', thirtyDaysAgo);

      return {
        revenue_today,
        revenue_mtd,
        revenue_last_month,
        revenue_projected_month_end,
        revenue_by_type,
        visits_mtd,
        avg_visit_revenue,
        estimated_cogs,
        estimated_gross_profit,
        estimated_gross_margin_pct,
        stripe_fees_mtd,
        total_patients,
        repeat_patients,
        repeat_rate_pct,
        new_patients_30d,
        cohorts,
        channels,
        unpaid_invoices,
        unclassified_charges,
        refunded_mtd,
        stuck_sequences: stuck_sequences || 0,
        unresolved_errors: unresolved_errors || 0,
      };
    },
  });
};

export const MARGIN_TARGET_PCT = TARGET_GROSS_MARGIN_PCT;
