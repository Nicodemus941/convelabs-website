/**
 * PhlebEarningsLedger — per-appointment "what I earned" ledger for the PWA.
 *
 * Hormozi rule: every visit is a paycheck. The phleb should be able to point
 * at any appointment in the last 60 days and see the math — what the patient
 * paid, the v2 split ($87 to business + remainder to phleb, or per-service
 * base for partner/senior/in-office), whether Stripe has paid them out, or
 * if it's still owed.
 *
 * Shows three columns per row:
 *   • What the visit was worth (v2 take)
 *   • What's been paid out to Stripe Connect (status: succeeded)
 *   • What's still owed (status: manual_owed)
 *
 * Totals at top show: This week / This month / YTD + "Outstanding owed to me".
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, DollarSign, TrendingUp, AlertCircle, CheckCircle2, RefreshCw, Info } from 'lucide-react';
import { format, startOfWeek, startOfMonth, startOfYear, parseISO } from 'date-fns';
import { toast } from 'sonner';

interface ApptRow {
  id: string;
  appointment_date: string;
  appointment_time: string | null;
  patient_name: string | null;
  service_type: string | null;
  total_amount: number | null;
  status: string;
  payment_arrangement: string | null;
}

interface Take {
  take_cents: number;
  rule_used: string;
  total_charged_cents: number;
  business_keep_cents: number;
  companion_addon_cents: number;
  tip_cents: number;
}

interface Payout {
  appointment_id: string;
  amount_cents: number;
  status: string;
  notes: string | null;
}

const RULE_LABEL: Record<string, { label: string; color: string; explainer: string }> = {
  business_floor_87: {
    label: '$87 → biz · rest → you',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    explainer: 'Standard rule: business keeps $87, you take the rest (plus 100% of tip + companion + surcharges baked into total).',
  },
  base_rate_floor_protected: {
    label: 'base rate',
    color: 'bg-gray-50 text-gray-700 border-gray-200',
    explainer: 'Patient charge is too low for the $87-floor math to favor you. Per-service base rate applies instead, so you never make less.',
  },
  exception_base_rate: {
    label: 'base + 100% surcharge',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    explainer: 'Partner-org or senior visit: per-service base rate + 100% of any extended-area / after-hours / same-day surcharge passes through to you.',
  },
  no_phleb_assigned: { label: 'unassigned', color: 'bg-amber-50 text-amber-700 border-amber-200', explainer: 'No phleb on this appointment yet.' },
  no_staff_profile: { label: 'no profile', color: 'bg-amber-50 text-amber-700 border-amber-200', explainer: 'Phleb has no staff_profiles row.' },
};

const PhlebEarningsLedger: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  // Track which button is spinning ('week' | 'all' | null) so they don't both spin.
  const [sweeping, setSweeping] = useState<'week' | 'all' | null>(null);
  const [rows, setRows] = useState<Array<ApptRow & { take: Take; paid_cents: number; owed_cents: number }>>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  // Inline error/result banner so the user always sees what happened —
  // toasts disappear before the user can read them, especially on mobile.
  const [sweepResult, setSweepResult] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [reconciling, setReconciling] = useState(false);

  const handleReconcile = async () => {
    if (reconciling) return;
    setReconciling(true);
    setSweepResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setSweepResult({ kind: 'error', text: 'Not signed in. Refresh and try again.' });
        return;
      }
      const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/reconcile-phleb-payouts-from-stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({}),
      });
      const j = await resp.json();
      if (j?.error || j?.ok === false) {
        setSweepResult({ kind: 'error', text: j.message || j.error || 'Reconcile failed' });
        return;
      }
      const count = Number(j.reconciled_count || 0);
      const cents = Number(j.reconciled_cents || 0);
      if (count === 0) {
        setSweepResult({ kind: 'info', text: j.message || `Scanned ${j.transfers_scanned || 0} Stripe transfers — no missed matches. Everything in "Pending" is genuinely outstanding.` });
      } else {
        const by = j.by_pass || {};
        setSweepResult({
          kind: 'success',
          text: `✓ Reconciled ${count} payouts (${'$' + (cents / 100).toFixed(2)}) — matched against Stripe transfers. ` +
            `Pass 1 (metadata): ${by.pass1_metadata || 0} · Pass 2 (source): ${by.pass2_source || 0} · Pass 3 (charge.transfer): ${by.pass3_charge || 0}. ` +
            `No money moved — these were already paid.`,
        });
      }
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      setSweepResult({ kind: 'error', text: e?.message || 'Reconcile failed (network)' });
    } finally {
      setReconciling(false);
    }
  };
  const [sweepSummary, setSweepSummary] = useState<{
    cleared_count: number; cleared_cents: number;
    pending_count: number; pending_cents: number;
  } | null>(null);
  // In-page confirm modal — native confirm() is unreliable on mobile PWA.
  // Holds the preview from the dry-run so the user sees exactly what will move.
  const [pendingSweep, setPendingSweep] = useState<{
    scope: 'week' | 'all';
    sinceDate: string | null;
    scopeLabel: string;
    wouldCount: number;
    wouldCents: number;
    platformAvail: number;
    pendingHeldCount: number;
    pendingHeldCents: number;
  } | null>(null);

  /**
   * Sweep cleared payouts. Optional `scope` filters by appointment date:
   *   'week'  → only this calendar week (Mon 00:00 onward)
   *   'all'   → every cleared payout regardless of date
   */
  // STAGE 1: Preview — fires the dry-run, then opens the in-page confirm modal
  // (or surfaces the inline banner if balance is insufficient / nothing cleared).
  const handleSweep = async (scope: 'week' | 'all' = 'all') => {
    if (sweeping) return;
    let sinceDate: string | null = null;
    let scopeLabel = 'all cleared';
    if (scope === 'week') {
      const today = new Date();
      const day = today.getDay();
      const diffToMon = (day === 0 ? -6 : 1 - day);
      const mon = new Date(today);
      mon.setDate(today.getDate() + diffToMon);
      mon.setHours(0, 0, 0, 0);
      sinceDate = mon.toISOString().substring(0, 10);
      scopeLabel = `this week (since ${sinceDate})`;
    }

    setSweeping(scope);
    setSweepResult(null);
    setPendingSweep(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setSweepResult({ kind: 'error', text: 'Not signed in. Refresh the page and try again.' });
        return;
      }
      const dryResp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/sweep-phleb-owed-payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ dry_run: true, since_date: sinceDate }),
      });
      const dryJ = await dryResp.json();
      if (dryJ?.error) {
        setSweepResult({ kind: 'error', text: dryJ.message || dryJ.error });
        return;
      }
      const wouldCount = Number(dryJ.would_sweep_count || 0);
      const wouldCents = Number(dryJ.would_sweep_cents || 0);
      const platformAvail = Number(dryJ.platform_available_cents || 0);

      if (wouldCount === 0) {
        setSweepResult({ kind: 'info', text: dryJ.message || `Nothing cleared to sweep in ${scopeLabel}.` });
        return;
      }
      if (dryJ.sufficient_balance === false) {
        setSweepResult({
          kind: 'error',
          text: dryJ.message || `Stripe platform balance $${(platformAvail / 100).toFixed(2)} is below the $${((wouldCents + 10000) / 100).toFixed(2)} needed (sweep + $100 safety buffer). ${scope === 'all' ? 'Try "Sweep this week" instead, or wait for Stripe\'s rolling 2-day settlement to refill.' : 'Wait for Stripe\'s rolling 2-day settlement to refill.'}`,
        });
        return;
      }
      // Open the in-page modal — DON'T fire the transfer yet
      setPendingSweep({
        scope, sinceDate, scopeLabel,
        wouldCount, wouldCents, platformAvail,
        pendingHeldCount: Number(dryJ.pending_count || 0),
        pendingHeldCents: Number(dryJ.pending_cents || 0),
      });
    } catch (e: any) {
      setSweepResult({ kind: 'error', text: e?.message || 'Pre-flight failed (network error). Check connection and retry.' });
    } finally {
      setSweeping(null);
    }
  };

  // STAGE 2: User confirmed the modal — fire the live transfer.
  const executeSweep = async () => {
    if (!pendingSweep || sweeping) return;
    const { scope, sinceDate, scopeLabel, wouldCents } = pendingSweep;
    setSweeping(scope);
    setPendingSweep(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setSweepResult({ kind: 'error', text: 'Session expired. Refresh and try again.' });
        return;
      }
      const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/sweep-phleb-owed-payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ since_date: sinceDate }),
      });
      const j = await resp.json();
      if (j?.error || j?.ok === false) {
        setSweepResult({ kind: 'error', text: j.message || j.error || 'Sweep failed' });
        return;
      }
      if (j.swept_count === 0) {
        setSweepResult({ kind: 'info', text: j.message || 'Nothing cleared yet.' });
      } else {
        const after = j.platform_balance_after_cents != null
          ? ` Platform balance after: $${(j.platform_balance_after_cents / 100).toFixed(2)}.`
          : '';
        setSweepResult({
          kind: 'success',
          text: `✓ Sent $${(j.total_cents / 100).toFixed(2)} (${scopeLabel}) to your Stripe Connect — ${j.swept_count} visit${j.swept_count === 1 ? '' : 's'}. Transfer ID: ${j.stripe_transfer_id}.${after}`,
        });
        toast.success(`Swept $${(j.total_cents / 100).toFixed(0)} to your Stripe`);
      }
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      setSweepResult({ kind: 'error', text: e?.message || 'Sweep failed (network error). Check connection and retry.' });
    } finally {
      setSweeping(null);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      try {
        const since = new Date(Date.now() - 90 * 86400 * 1000).toISOString().substring(0, 10);

        const { data: appts } = await supabase
          .from('appointments')
          .select('id, appointment_date, appointment_time, patient_name, service_type, total_amount, status, payment_arrangement')
          .eq('phlebotomist_id', user.id)
          .gte('appointment_date', since)
          // Include EVERY status a phleb earns from. 'in_progress', 'en_route',
          // 'arrived', 'specimen_delivered' were silently excluded before, hiding
          // visits like Natasha Morgan 5/14 (status=in_progress, $163 earned).
          .in('status', ['completed', 'confirmed', 'scheduled', 'in_progress', 'en_route', 'arrived', 'specimen_delivered'])
          .order('appointment_date', { ascending: false })
          .limit(200);

        const apptList = ((appts as ApptRow[]) || []).filter(
          (a) =>
            !(a.patient_name || '').toLowerCase().includes('block time')
            // Hide prepaid standing-orders / visit-bundles / comps from the
            // ledger — they're already settled outside the per-visit flow.
            && a.payment_arrangement !== 'standing_order_prepaid'
            && a.payment_arrangement !== 'bundle_prepaid'
            && a.payment_arrangement !== 'comp'
        );
        if (apptList.length === 0) {
          setRows([]);
          setLoading(false);
          return;
        }

        // Per-appointment v2 takes (parallel)
        const takes = await Promise.all(
          apptList.map(async (a) => {
            try {
              const { data } = await supabase.rpc('compute_phleb_take_v2' as any, { p_appointment_id: a.id });
              const row = Array.isArray(data) ? data[0] : data;
              return [a.id, row as Take] as const;
            } catch {
              return [a.id, null as any] as const;
            }
          })
        );
        const takeMap = new Map(takes.map(([id, t]) => [id, t]));

        // Payouts for these appointments — pull transferred_at + stripe_paid_at
        // so the ledger can sort + group by ACTUAL payment date, not just
        // appointment_date. 2026-05-20 audit: "Each earning should reflect
        // the most recent payment."
        const { data: payouts } = await supabase
          .from('staff_payouts')
          .select('appointment_id, amount_cents, status, notes, transferred_at, stripe_paid_at, created_at')
          .in('appointment_id', apptList.map((a) => a.id))
          .order('created_at', { ascending: false });
        const paidMap = new Map<string, { paid: number; owed: number; lastPaymentAt: string | null; lastStatus: string | null }>();
        for (const p of (payouts as any[]) || []) {
          const cur = paidMap.get(p.appointment_id) || { paid: 0, owed: 0, lastPaymentAt: null, lastStatus: null };
          if (p.status === 'succeeded') cur.paid += p.amount_cents;
          else if (p.status === 'manual_owed') cur.owed += p.amount_cents;
          // Most-recent meaningful payment date wins. Prefer stripe_paid_at
          // (bank-confirmed) over transferred_at (Connect-confirmed) over
          // created_at (DB row insert).
          const candidate = p.stripe_paid_at || p.transferred_at || p.created_at;
          if (candidate && (!cur.lastPaymentAt || candidate > cur.lastPaymentAt)) {
            cur.lastPaymentAt = candidate;
            cur.lastStatus = p.status;
          }
          paidMap.set(p.appointment_id, cur);
        }

        const decorated = apptList.map((a) => {
          const pm = paidMap.get(a.id);
          return {
            ...a,
            take: takeMap.get(a.id) || ({ take_cents: 0, rule_used: 'unknown', total_charged_cents: 0, business_keep_cents: 0, companion_addon_cents: 0, tip_cents: 0 } as Take),
            paid_cents: pm?.paid || 0,
            owed_cents: pm?.owed || 0,
            last_payment_at: pm?.lastPaymentAt || null,
            last_payout_status: pm?.lastStatus || null,
          };
        });

        setRows(decorated);

        // Pull the sweep eligibility summary (cleared vs pending)
        const { data: spData } = await supabase
          .from('staff_profiles').select('id').eq('user_id', user.id).maybeSingle();
        const myStaffId = (spData as any)?.id;
        if (myStaffId) {
          const { data: sweepSum } = await supabase.rpc('get_sweep_summary_for_staff' as any, {
            p_staff_id: myStaffId,
          });
          const s = Array.isArray(sweepSum) ? sweepSum[0] : sweepSum;
          if (s) {
            setSweepSummary({
              cleared_count: Number(s.cleared_count || 0),
              cleared_cents: Number(s.cleared_cents || 0),
              pending_count: Number(s.pending_count || 0),
              pending_cents: Number(s.pending_cents || 0),
            });
          }
        }
      } catch (e: any) {
        toast.error(e?.message || 'Failed to load earnings');
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id, refreshKey]);

  // Realtime subscription: whenever staff_payouts for this phleb changes
  // (Stripe webhook flips a row to succeeded, or the sweep cron settles a
  // manual_owed → reversed clawback, etc.), reload the ledger. No manual
  // refresh required.
  useEffect(() => {
    if (!user?.id) return;
    let staffIdLocal: string | null = null;
    let channel: any = null;
    (async () => {
      const { data: sp } = await supabase
        .from('staff_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      staffIdLocal = (sp as any)?.id || null;
      if (!staffIdLocal) return;
      channel = supabase
        .channel(`phleb-earnings-${staffIdLocal}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_payouts', filter: `staff_id=eq.${staffIdLocal}` },
          () => setRefreshKey(k => k + 1))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appointments', filter: `phlebotomist_id=eq.${staffIdLocal}` },
          () => setRefreshKey(k => k + 1))
        .subscribe();
    })();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const totals = useMemo(() => {
    const now = new Date();
    const wk = startOfWeek(now, { weekStartsOn: 1 });
    const mo = startOfMonth(now);
    const yr = startOfYear(now);
    let week = 0, month = 0, ytd = 0, owed = 0, paid = 0;
    for (const r of rows) {
      const d = parseISO(r.appointment_date);
      const take = r.take.take_cents;
      if (d >= wk) week += take;
      if (d >= mo) month += take;
      if (d >= yr) ytd += take;
      owed += r.owed_cents;
      paid += r.paid_cents;
    }
    return { week, month, ytd, owed, paid };
  }, [rows]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading earnings…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Top KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-200">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">This week</div>
            <div className="text-xl font-bold text-emerald-900">${(totals.week / 100).toFixed(0)}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-200">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-blue-700 font-semibold">This month</div>
            <div className="text-xl font-bold text-blue-900">${(totals.month / 100).toFixed(0)}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-200">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-purple-700 font-semibold">YTD</div>
            <div className="text-xl font-bold text-purple-900">${(totals.ytd / 100).toFixed(0)}</div>
          </CardContent>
        </Card>
        <Card className={`border-2 ${(sweepSummary?.cleared_cents || 0) > 0 ? 'bg-gradient-to-br from-emerald-50 to-white border-emerald-300' : 'bg-gray-50 border-gray-200'}`}>
          <CardContent className="p-3">
            <div className={`text-[10px] uppercase tracking-wider font-semibold ${(sweepSummary?.cleared_cents || 0) > 0 ? 'text-emerald-800' : 'text-gray-600'}`}>
              Cleared / Pending
            </div>
            <div className={`text-xl font-bold ${(sweepSummary?.cleared_cents || 0) > 0 ? 'text-emerald-900' : 'text-gray-700'}`}>
              ${((sweepSummary?.cleared_cents || 0) / 100).toFixed(0)}
              <span className="text-sm text-gray-500 font-normal"> / ${((sweepSummary?.pending_cents || 0) / 100).toFixed(0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cleared (safe-to-sweep) CTA — only shows when patient revenue has cleared */}
      {sweepSummary && sweepSummary.cleared_cents > 0 && (
        <Card className="bg-gradient-to-r from-emerald-500 to-emerald-600 border-emerald-700 text-white">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold">
                  ${(sweepSummary.cleared_cents / 100).toFixed(0)} cleared — safe to sweep
                </div>
                <div className="text-[11px] text-emerald-100 mt-0.5">
                  {sweepSummary.cleared_count} visit{sweepSummary.cleared_count === 1 ? '' : 's'} where the patient has already paid.
                  Platform balance is checked before transfer — no overdraft risk.
                </div>
              </div>
            </div>
            {/* Primary CTA — single big button for the common case */}
            <Button
              onClick={() => handleSweep('week')}
              disabled={!!sweeping || !!pendingSweep}
              className={`w-full font-bold gap-1.5 h-12 text-sm transition-all ${
                sweeping === 'week'
                  ? 'bg-emerald-100 text-emerald-700 ring-2 ring-white animate-pulse'
                  : 'bg-white text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              {sweeping === 'week' ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Checking Stripe…</>
              ) : (
                <><DollarSign className="h-5 w-5" /> Sweep this week</>
              )}
            </Button>
            {/* Secondary text-link — small, separate, no spinner unless its own scope is firing */}
            <button
              type="button"
              onClick={() => handleSweep('all')}
              disabled={!!sweeping || !!pendingSweep}
              className={`w-full text-center text-[11px] mt-2 transition-opacity ${
                sweeping === 'all'
                  ? 'text-white font-semibold'
                  : 'text-emerald-100 hover:text-white underline-offset-2 hover:underline'
              } disabled:opacity-50`}
            >
              {sweeping === 'all' ? '… checking all cleared' : 'or: sweep all cleared payouts'}
            </button>

            {/* Inline result banner — persistent until next action */}
            {sweepResult && (
              <div
                className={`mt-2 rounded-lg p-3 text-xs flex items-start gap-2 ${
                  sweepResult.kind === 'success' ? 'bg-emerald-900/40 border border-emerald-300 text-white' :
                  sweepResult.kind === 'error' ? 'bg-amber-50 border border-amber-300 text-amber-900' :
                  'bg-blue-50 border border-blue-200 text-blue-900'
                }`}
              >
                {sweepResult.kind === 'success' ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" /> :
                 sweepResult.kind === 'error' ? <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" /> :
                 <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />}
                <div className="flex-1 leading-relaxed">{sweepResult.text}</div>
                <button
                  type="button"
                  onClick={() => setSweepResult(null)}
                  className="opacity-60 hover:opacity-100 flex-shrink-0"
                  aria-label="Dismiss"
                >×</button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pending advisory — visits owed but patient hasn't paid yet (HELD) */}
      {sweepSummary && sweepSummary.pending_cents > 0 && (
        <Card className="bg-amber-50 border-amber-300">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 flex-1">
                <strong>${(sweepSummary.pending_cents / 100).toFixed(0)} on hold</strong> — {sweepSummary.pending_count} visit{sweepSummary.pending_count === 1 ? '' : 's'} where the
                patient or partner org hasn't paid yet. These automatically become sweepable as
                soon as their payment clears in Stripe (or their org invoice is marked paid).
              </div>
            </div>
            <Button
              onClick={handleReconcile}
              disabled={reconciling}
              size="sm"
              variant="outline"
              className="w-full bg-white border-amber-400 text-amber-900 hover:bg-amber-100 gap-1.5 h-8 text-[11px]"
              title="Cross-check with Stripe: some of these may already have been paid via prior transfers that didn't get stamped back to the DB. This scans your Connect transfers and matches them up — no money moves."
            >
              {reconciling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {reconciling ? 'Scanning Stripe…' : 'Cross-check with Stripe (mark already-paid as paid)'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Rule explainer */}
      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="p-3 flex items-start gap-2 text-xs text-gray-700">
          <Info className="h-3.5 w-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
          <div>
            <strong>Your comp rule:</strong> Business keeps $87 on standard mobile / therapeutic / specialty visits — you take the rest.
            Partner-org visits (Elite Medical, NaturaMed, ND Wellness, etc.) and the $100 senior service use the per-service base rate (e.g. $42 for senior, $35 for partner-elite).
            <strong> Tips, companion add-ons, extended-area, after-hours, and same-day surcharges always pass 100% to you</strong> — on EVERY rule.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#B91C1C]" /> Per-appointment earnings
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={() => setRefreshKey((k) => k + 1)} className="h-7 px-2 text-xs gap-1">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">No appointments in the last 90 days.</div>
          ) : (
            // Group Day → Month → Year by most-recent payment date (fall back
            // to appointment_date when no payment has hit yet — typically
            // pending-payout rows). Sort newest first inside every level.
            // Hormozi rule: at any zoom level the phleb sees "how much did I
            // make today / this month / this year" without scrolling.
            (() => {
              type Group<T> = { key: string; label: string; total: number; rows: any[]; sub?: Group<T>[] };
              const yearMap = new Map<string, { months: Map<string, { days: Map<string, any[]> }> }>();
              for (const r of rows) {
                const ref = r.last_payment_at || r.appointment_date;
                const d = parseISO(ref);
                const y = format(d, 'yyyy');
                const m = format(d, 'yyyy-MM');
                const day = format(d, 'yyyy-MM-dd');
                if (!yearMap.has(y)) yearMap.set(y, { months: new Map() });
                const yr = yearMap.get(y)!;
                if (!yr.months.has(m)) yr.months.set(m, { days: new Map() });
                const mo = yr.months.get(m)!;
                if (!mo.days.has(day)) mo.days.set(day, []);
                mo.days.get(day)!.push(r);
              }
              const years = Array.from(yearMap.keys()).sort().reverse();
              return (
                <div className="divide-y">
                  {years.map((y) => {
                    const yr = yearMap.get(y)!;
                    const yrRows = Array.from(yr.months.values()).flatMap(m => Array.from(m.days.values()).flat());
                    const yrTotal = yrRows.reduce((s, r) => s + (r.take?.take_cents || 0), 0);
                    const months = Array.from(yr.months.keys()).sort().reverse();
                    return (
                      <details key={y} open className="group">
                        <summary className="px-3 py-2 bg-gray-50 cursor-pointer flex items-center justify-between text-sm font-bold hover:bg-gray-100">
                          <span className="flex items-center gap-2">
                            <TrendingUp className="h-3.5 w-3.5 text-[#B91C1C]" /> {y} — {yrRows.length} {yrRows.length === 1 ? 'visit' : 'visits'}
                          </span>
                          <span className="font-mono text-emerald-700">${(yrTotal / 100).toFixed(0)}</span>
                        </summary>
                        <div className="divide-y">
                          {months.map((m) => {
                            const mo = yr.months.get(m)!;
                            const moRows = Array.from(mo.days.values()).flat();
                            const moTotal = moRows.reduce((s, r) => s + (r.take?.take_cents || 0), 0);
                            const moLabel = format(parseISO(m + '-01'), 'MMMM yyyy');
                            const days = Array.from(mo.days.keys()).sort().reverse();
                            return (
                              <details key={m} open className="group">
                                <summary className="px-4 py-1.5 bg-white cursor-pointer flex items-center justify-between text-xs font-semibold text-gray-700 hover:bg-gray-50">
                                  <span>{moLabel} — {moRows.length} {moRows.length === 1 ? 'visit' : 'visits'}</span>
                                  <span className="font-mono text-emerald-700">${(moTotal / 100).toFixed(0)}</span>
                                </summary>
                                <div className="divide-y">
                                  {days.map((day) => {
                                    const dayRows = mo.days.get(day)!.slice().sort((a, b) => {
                                      const ad = a.last_payment_at || a.appointment_date;
                                      const bd = b.last_payment_at || b.appointment_date;
                                      return bd.localeCompare(ad);
                                    });
                                    const dayTotal = dayRows.reduce((s, r) => s + (r.take?.take_cents || 0), 0);
                                    const dayLabel = format(parseISO(day + 'T12:00:00'), 'EEE, MMM d');
                                    return (
                                      <div key={day}>
                                        <div className="px-5 py-1 bg-gray-50/60 flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-500">
                                          <span>{dayLabel}</span>
                                          <span className="font-mono">${(dayTotal / 100).toFixed(0)}</span>
                                        </div>
                                        <div className="divide-y">
                                          {dayRows.map((r) => {
                                            const ruleInfo = RULE_LABEL[r.take.rule_used] || { label: r.take.rule_used, color: 'bg-gray-50 text-gray-700 border-gray-200', explainer: '' };
                                            const fullyPaid = r.paid_cents >= r.take.take_cents && r.owed_cents === 0;
                                            const hasOwed = r.owed_cents > 0;
                                            const paidLabel = r.last_payment_at ? format(parseISO(r.last_payment_at), 'MMM d') : null;
                                            return (
                                              <div key={r.id} className="p-3 flex items-start justify-between gap-3 hover:bg-gray-50">
                                                <div className="min-w-0 flex-1">
                                                  <div className="text-sm font-medium truncate">{r.patient_name || 'Patient'}</div>
                                                  <div className="text-[11px] text-gray-500">
                                                    Visit {format(parseISO(r.appointment_date), 'MMM d')}
                                                    {r.appointment_time && ` · ${r.appointment_time}`}
                                                    {' · '}{r.service_type || 'mobile'}
                                                    {paidLabel && fullyPaid && ` · paid ${paidLabel}`}
                                                  </div>
                                                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                                    <Badge variant="outline" className={`text-[9px] ${ruleInfo.color}`} title={ruleInfo.explainer}>{ruleInfo.label}</Badge>
                                                    <span className="text-[10px] text-gray-500">
                                                      Patient ${(r.take.total_charged_cents / 100).toFixed(0)} · Business ${(r.take.business_keep_cents / 100).toFixed(0)} · You ${(r.take.take_cents / 100).toFixed(0)}
                                                    </span>
                                                  </div>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                  <div className="text-lg font-bold text-emerald-700">
                                                    +${(r.take.take_cents / 100).toFixed(0)}
                                                  </div>
                                                  {fullyPaid && (
                                                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[9px] gap-0.5">
                                                      <CheckCircle2 className="h-2.5 w-2.5" /> paid
                                                    </Badge>
                                                  )}
                                                  {hasOwed && (
                                                    <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[9px] gap-0.5">
                                                      <AlertCircle className="h-2.5 w-2.5" /> ${(r.owed_cents / 100).toFixed(0)} owed
                                                    </Badge>
                                                  )}
                                                  {!fullyPaid && !hasOwed && r.take.take_cents > 0 && (
                                                    <Badge className="bg-gray-100 text-gray-700 border-gray-300 text-[9px]">pending payout</Badge>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      </details>
                    );
                  })}
                </div>
              );
            })()
          )}
        </CardContent>
      </Card>

      {/* In-page sweep confirm modal — replaces native confirm() which can be
          missed on mobile / PWA. Stays visible until user explicitly chooses. */}
      {pendingSweep && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center p-4"
          onClick={() => setPendingSweep(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="sweep-confirm-title"
          >
            <div className="text-center space-y-1">
              <div className="text-3xl">💸</div>
              <h2 id="sweep-confirm-title" className="text-lg font-bold text-gray-900">
                Confirm transfer
              </h2>
              <p className="text-xs text-gray-500">{pendingSweep.scopeLabel}</p>
            </div>

            <div className="rounded-xl bg-emerald-50 border-2 border-emerald-300 p-4 text-center">
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Amount to your Stripe</div>
              <div className="text-3xl font-bold text-emerald-900">
                ${(pendingSweep.wouldCents / 100).toFixed(2)}
              </div>
              <div className="text-[11px] text-emerald-700">
                {pendingSweep.wouldCount} visit{pendingSweep.wouldCount === 1 ? '' : 's'}
              </div>
            </div>

            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-700 space-y-1.5">
              <div className="flex justify-between">
                <span>Platform balance now</span>
                <span className="font-medium">${(pendingSweep.platformAvail / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>After this sweep</span>
                <span className="font-medium text-gray-900">${((pendingSweep.platformAvail - pendingSweep.wouldCents) / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-500 italic">
                <span>$100 safety buffer enforced</span>
              </div>
              {pendingSweep.pendingHeldCount > 0 && (
                <div className="border-t border-gray-200 pt-1.5 mt-1.5 flex justify-between">
                  <span>Held (patient not paid yet)</span>
                  <span>${(pendingSweep.pendingHeldCents / 100).toFixed(2)} · {pendingSweep.pendingHeldCount} visit{pendingSweep.pendingHeldCount === 1 ? '' : 's'}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => { setPendingSweep(null); setSweepResult({ kind: 'info', text: 'Sweep cancelled.' }); }}
                variant="outline"
                className="flex-1"
                disabled={!!sweeping}
              >
                Cancel
              </Button>
              <Button
                onClick={executeSweep}
                disabled={!!sweeping}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
              >
                {sweeping ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                {sweeping ? 'Transferring…' : `Send $${(pendingSweep.wouldCents / 100).toFixed(0)} now`}
              </Button>
            </div>
            <p className="text-[10px] text-center text-gray-400">
              Funds land per your Stripe Connect payout schedule (typically 2 days).
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhlebEarningsLedger;
