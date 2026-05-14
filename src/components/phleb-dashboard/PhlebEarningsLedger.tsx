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

const RULE_LABEL: Record<string, { label: string; color: string }> = {
  business_floor_87: { label: '$87 floor', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  base_rate_floor_protected: { label: 'base rate', color: 'bg-gray-50 text-gray-700 border-gray-200' },
  exception_base_rate: { label: 'partner rate', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  no_phleb_assigned: { label: 'unassigned', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  no_staff_profile: { label: 'no profile', color: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const PhlebEarningsLedger: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [rows, setRows] = useState<Array<ApptRow & { take: Take; paid_cents: number; owed_cents: number }>>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  // Multi-gate sweep summary — separates "cleared" (patient paid via Stripe
  // or org invoice paid) from "pending" (patient hasn't paid yet, so
  // sweeping would overdraft the business).
  const [sweepSummary, setSweepSummary] = useState<{
    cleared_count: number; cleared_cents: number;
    pending_count: number; pending_cents: number;
  } | null>(null);

  /**
   * Sweep cleared payouts. Optional `scope` filters by appointment date:
   *   'week'  → only this calendar week (Mon 00:00 onward)
   *   'all'   → every cleared payout regardless of date
   */
  const handleSweep = async (scope: 'week' | 'all' = 'all') => {
    if (sweeping) return;
    let sinceDate: string | null = null;
    let scopeLabel = 'all cleared';
    if (scope === 'week') {
      // Monday of this week (server-side will also clamp)
      const today = new Date();
      const day = today.getDay(); // 0=Sun, 1=Mon, ...
      const diffToMon = (day === 0 ? -6 : 1 - day);
      const mon = new Date(today);
      mon.setDate(today.getDate() + diffToMon);
      mon.setHours(0, 0, 0, 0);
      sinceDate = mon.toISOString().substring(0, 10);
      scopeLabel = `this week (since ${sinceDate})`;
    }

    // Pre-flight dry-run so the confirm dialog shows the actual scoped numbers
    setSweeping(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const dryResp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/sweep-phleb-owed-payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ dry_run: true, since_date: sinceDate }),
      });
      const dryJ = await dryResp.json();
      if (!dryResp.ok) {
        toast.error(dryJ.message || dryJ.error || 'Pre-flight check failed');
        return;
      }
      const wouldCount = Number(dryJ.would_sweep_count || 0);
      const wouldCents = Number(dryJ.would_sweep_cents || 0);
      if (wouldCount === 0) {
        toast.info(dryJ.message || 'Nothing cleared to sweep in this window.');
        return;
      }
      const ok = confirm(
        `Transfer $${(wouldCents / 100).toFixed(2)} (${scopeLabel}) to your Stripe Connect account?\n\n` +
        `• Visits being swept: ${wouldCount}\n` +
        `• Pending (held for patient payment): ${Number(dryJ.pending_count || 0)} = $${(Number(dryJ.pending_cents || 0) / 100).toFixed(2)}\n` +
        `• Platform balance after: $${((Number(dryJ.platform_available_cents) - wouldCents) / 100).toFixed(0)} (safety buffer $100 enforced)`
      );
      if (!ok) return;

      // Live sweep
      const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/sweep-phleb-owed-payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ since_date: sinceDate }),
      });
      const j = await resp.json();
      if (!resp.ok) {
        toast.error(j.message || j.error || 'Sweep failed');
        return;
      }
      if (j.swept_count === 0) {
        toast.info(j.message || 'Nothing cleared yet.');
      } else {
        const after = j.platform_balance_after_cents != null
          ? ` · Platform balance after: $${(j.platform_balance_after_cents / 100).toFixed(0)}`
          : '';
        toast.success(`Swept $${(j.total_cents / 100).toFixed(0)} (${scopeLabel}) — ${j.swept_count} visit${j.swept_count === 1 ? '' : 's'}.${after}`);
      }
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e?.message || 'Sweep failed');
    } finally {
      setSweeping(false);
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
          .select('id, appointment_date, appointment_time, patient_name, service_type, total_amount, status')
          .eq('phlebotomist_id', user.id)
          .gte('appointment_date', since)
          .in('status', ['completed', 'confirmed', 'scheduled'])
          .order('appointment_date', { ascending: false })
          .limit(200);

        const apptList = ((appts as ApptRow[]) || []).filter(
          (a) => !(a.patient_name || '').toLowerCase().includes('block time')
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

        // Payouts for these appointments
        const { data: payouts } = await supabase
          .from('staff_payouts')
          .select('appointment_id, amount_cents, status, notes')
          .in('appointment_id', apptList.map((a) => a.id));
        const paidMap = new Map<string, { paid: number; owed: number }>();
        for (const p of (payouts as Payout[]) || []) {
          const cur = paidMap.get(p.appointment_id) || { paid: 0, owed: 0 };
          if (p.status === 'succeeded') cur.paid += p.amount_cents;
          else if (p.status === 'manual_owed') cur.owed += p.amount_cents;
          paidMap.set(p.appointment_id, cur);
        }

        const decorated = apptList.map((a) => ({
          ...a,
          take: takeMap.get(a.id) || ({ take_cents: 0, rule_used: 'unknown', total_charged_cents: 0, business_keep_cents: 0, companion_addon_cents: 0, tip_cents: 0 } as Take),
          paid_cents: paidMap.get(a.id)?.paid || 0,
          owed_cents: paidMap.get(a.id)?.owed || 0,
        }));

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
            <div className="flex gap-2">
              <Button
                onClick={() => handleSweep('week')}
                disabled={sweeping}
                size="sm"
                className="flex-1 bg-white text-emerald-700 hover:bg-emerald-50 font-semibold gap-1.5"
              >
                {sweeping ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                Sweep this week
              </Button>
              <Button
                onClick={() => handleSweep('all')}
                disabled={sweeping}
                size="sm"
                variant="outline"
                className="flex-1 bg-emerald-700/30 border-emerald-200 text-white hover:bg-emerald-700/50 font-semibold gap-1.5"
              >
                {sweeping ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                Sweep all cleared
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending advisory — visits owed but patient hasn't paid yet (HELD) */}
      {sweepSummary && sweepSummary.pending_cents > 0 && (
        <Card className="bg-amber-50 border-amber-300">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <strong>${(sweepSummary.pending_cents / 100).toFixed(0)} on hold</strong> — {sweepSummary.pending_count} visit{sweepSummary.pending_count === 1 ? '' : 's'} where the
              patient or partner org hasn't paid yet. These automatically become sweepable as
              soon as their payment clears in Stripe (or their org invoice is marked paid). No action needed from you.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rule explainer */}
      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="p-3 flex items-start gap-2 text-xs text-gray-700">
          <Info className="h-3.5 w-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
          <div>
            <strong>Your comp rule (v2):</strong> Business keeps $87 on standard mobile / therapeutic / specialty visits — you take the rest.
            Partner-org visits (Elite Medical, NaturaMed, ND Wellness, etc.) and the $100 senior service stay at their per-service rates.
            Tips & companion add-ons always 100% to you.
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
            <div className="divide-y">
              {rows.map((r) => {
                const ruleInfo = RULE_LABEL[r.take.rule_used] || { label: r.take.rule_used, color: 'bg-gray-50 text-gray-700 border-gray-200' };
                const fullyPaid = r.paid_cents >= r.take.take_cents && r.owed_cents === 0;
                const hasOwed = r.owed_cents > 0;
                return (
                  <div key={r.id} className="p-3 flex items-start justify-between gap-3 hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{r.patient_name || 'Patient'}</div>
                      <div className="text-[11px] text-gray-500">
                        {format(parseISO(r.appointment_date), 'EEE MMM d')}
                        {r.appointment_time && ` · ${r.appointment_time}`}
                        {' · '}{r.service_type || 'mobile'}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className={`text-[9px] ${ruleInfo.color}`}>{ruleInfo.label}</Badge>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PhlebEarningsLedger;
