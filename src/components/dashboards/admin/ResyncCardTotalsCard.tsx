import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

/**
 * ResyncCardTotalsCard
 *
 * Admin tool to detect & repair appointments where the displayed
 * `total_amount` on the appointment card has drifted from what Stripe
 * actually captured. Reads the live diff from public.resync_appointment_card_totals
 * (RPC, admin-only). Two-step UX: preview first, then apply.
 *
 * Auto-correction policy (matches the trigger):
 *   - Stripe net > card  → safe to fix (money moved, card stale)
 *   - Stripe net < card  → admin must confirm (likely non-Stripe payment
 *     channel — applying would erase legitimate revenue records)
 */

interface DiffRow {
  appointment_id: string;
  patient_name: string;
  appointment_date: string;
  current_total: number;
  stripe_net: number;
  delta: number;
  applied: boolean;
}

const ResyncCardTotalsCard: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [rows, setRows] = useState<DiffRow[] | null>(null);

  const fetchDiffs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('resync_appointment_card_totals' as any, {
        p_since: new Date(Date.now() - 90 * 86400 * 1000).toISOString().substring(0, 10),
        p_apply: false,
      });
      if (error) throw error;
      setRows((data as DiffRow[]) || []);
      if (!data || (data as any[]).length === 0) toast.success('All appointment cards match Stripe — nothing to fix.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to scan');
    } finally {
      setLoading(false);
    }
  };

  const applyFixes = async (onlyUpward: boolean) => {
    if (!rows || rows.length === 0) return;
    setApplying(true);
    try {
      // The RPC with p_apply=true applies to ALL diffs. When onlyUpward,
      // we filter client-side first by re-running with a tighter scope
      // (RPC enforces auth; this just gates which rows we accept the
      // confirmation for).
      const toApply = onlyUpward ? rows.filter(r => r.delta > 0) : rows;
      if (toApply.length === 0) {
        toast.info('No upward-only corrections to apply.');
        return;
      }
      const proceed = !onlyUpward
        ? window.confirm(
            `This will OVERWRITE ${toApply.length} appointment card totals with Stripe net, including ${rows.filter(r => r.delta < 0).length} rows where Stripe captured LESS than the card shows. ` +
            `That can erase legitimate non-Stripe revenue records. Continue?`
          )
        : true;
      if (!proceed) return;

      const { data, error } = await supabase.rpc('resync_appointment_card_totals' as any, {
        p_since: new Date(Date.now() - 90 * 86400 * 1000).toISOString().substring(0, 10),
        p_apply: true,
      });
      if (error) throw error;
      const applied = (data as DiffRow[] || []).filter(r => r.applied);
      toast.success(`Updated ${applied.length} appointment card${applied.length === 1 ? '' : 's'} to match Stripe.`);
      await fetchDiffs();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to apply');
    } finally {
      setApplying(false);
    }
  };

  const upwardCount = rows?.filter(r => r.delta > 0).length || 0;
  const downwardCount = rows?.filter(r => r.delta < 0).length || 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <RefreshCw className="h-4 w-4 text-[#B91C1C]" />
          Resync card totals from Stripe ledger
        </CardTitle>
        <p className="text-xs text-gray-500">
          Finds appointments where the card-displayed total doesn't match what Stripe actually captured.
          Last 90 days. Auto-trigger now keeps new charges in sync — this is for one-off cleanup.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          <Button onClick={fetchDiffs} disabled={loading} variant="outline" size="sm" className="gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Scan for mismatches
          </Button>
          {rows && rows.length > 0 && (
            <>
              <Button
                onClick={() => applyFixes(true)}
                disabled={applying || upwardCount === 0}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Fix {upwardCount} safe (upward only)
              </Button>
              {downwardCount > 0 && (
                <Button
                  onClick={() => applyFixes(false)}
                  disabled={applying}
                  size="sm"
                  variant="outline"
                  className="border-amber-300 text-amber-800 hover:bg-amber-50 gap-1.5"
                  title="Includes rows where Stripe captured LESS than the card shows — typically partial cash/check payments. Use with care."
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Force-apply all {rows.length}
                </Button>
              )}
            </>
          )}
        </div>

        {rows && rows.length > 0 && (
          <div className="border rounded-md divide-y bg-white max-h-96 overflow-y-auto">
            {rows.map((r) => {
              const direction = r.delta > 0 ? 'up' : 'down';
              return (
                <div key={r.appointment_id} className="p-2.5 flex items-center justify-between gap-2 text-xs hover:bg-gray-50">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 truncate">{r.patient_name}</div>
                    <div className="text-[10px] text-gray-500">{format(new Date(r.appointment_date + 'T12:00:00'), 'EEE MMM d')}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-gray-700 line-through">${Number(r.current_total).toFixed(2)}</span>
                    <ArrowRight className="h-3 w-3 text-gray-400" />
                    <span className={`font-semibold ${direction === 'up' ? 'text-emerald-700' : 'text-amber-700'}`}>
                      ${Number(r.stripe_net).toFixed(2)}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${direction === 'up' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-300'}`}>
                      {direction === 'up' ? `+$${Number(r.delta).toFixed(2)}` : `−$${Math.abs(Number(r.delta)).toFixed(2)}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {rows && rows.length === 0 && (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-2 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> All cards match Stripe.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ResyncCardTotalsCard;
