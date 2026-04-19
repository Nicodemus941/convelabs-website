import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * useKpiTrend — reads the last N days of daily_kpi_snapshots.
 *
 * Built on top of the 6 AM ET daily snapshot cron. Gives the dashboard
 * historical trend data (sparklines) without running heavy live aggregates
 * on every page load. The live hook (useHormoziData) stays the source of
 * truth for "right now"; this hook is the "how is this moving over time."
 *
 * Hormozi lens: a number without a trend is an anecdote. With a trend,
 * it's a decision input.
 */

export interface KpiSnapshotRow {
  snapshot_date: string;
  revenue_today_cents: number;
  revenue_mtd_cents: number;
  revenue_last_30d_cents: number;
  visits_today: number;
  visits_mtd: number;
  new_patients_today: number;
  total_active_patients: number;
  active_memberships: number;
  new_memberships_mtd: number;
  repeat_rate_90d_pct: number | null;
  unpaid_invoices_count: number;
  unpaid_invoices_cents: number;
  google_rating: number | null;
  google_review_count: number | null;
  level0_gates_met: number;
}

export const useKpiTrend = (days: number = 30) => {
  return useQuery<KpiSnapshotRow[]>({
    queryKey: ['kpi-trend', days],
    queryFn: async () => {
      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        .toISOString().substring(0, 10);
      const { data, error } = await supabase
        .from('daily_kpi_snapshots')
        .select('*')
        .gte('snapshot_date', sinceDate)
        .order('snapshot_date', { ascending: true });
      if (error) throw error;
      return (data || []) as KpiSnapshotRow[];
    },
    staleTime: 10 * 60 * 1000, // 10 min — snapshots change at most daily
  });
};
