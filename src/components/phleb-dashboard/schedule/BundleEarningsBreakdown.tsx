/**
 * BundleEarningsBreakdown — shown only for family-bundle appointments.
 * Surfaces the v4 per-body floor math so the phleb sees exactly where the
 * money goes: charge total, business retention, phleb take. Replaces the
 * v3-era "Base + Companion fee" decomposition that no longer applies under
 * the per-body floor rule.
 *
 * Why this exists: the AppointmentEarningPill shows "+$53" with a tiny
 * "(couple)" tag and hides the math in a tooltip. Bundles deserve more
 * transparency — the phleb is doing TWO draws, and they should see why
 * the take is what it is.
 *
 * Reads compute_phleb_take_v2(appointment_id) which under v4 returns:
 *   take_cents, rule_used, total_charged_cents, business_keep_cents
 *   companion_addon_cents (always 0 in floor mode), tip_cents
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Users } from 'lucide-react';

interface Props {
  appointmentId: string;
  patientName: string;
  companionNames: string[];
}

interface V4Row {
  take_cents: number;
  rule_used: string;
  total_charged_cents: number;
  business_keep_cents: number;
  companion_addon_cents: number;
  tip_cents: number;
}

const BundleEarningsBreakdown: React.FC<Props> = ({ appointmentId, patientName, companionNames }) => {
  const [row, setRow] = useState<V4Row | null>(null);

  useEffect(() => {
    if (!appointmentId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('compute_phleb_take_v2' as any, { p_appointment_id: appointmentId });
      if (cancelled) return;
      const r: any = Array.isArray(data) ? data[0] : data;
      if (r) setRow(r as V4Row);
    })();
    return () => { cancelled = true; };
  }, [appointmentId]);

  if (!row) return null;
  const bodies = 1 + (companionNames?.length || 0);
  const charge = (row.total_charged_cents || 0) / 100;
  const business = (row.business_keep_cents || 0) / 100;
  const take = (row.take_cents || 0) / 100;
  const ruleLabel = row.rule_used === 'business_floor_87_per_body_v4'
    ? `$87 × ${bodies} bodies floor`
    : row.rule_used === 'business_floor_87_v3'
    ? '$87 business floor'
    : row.rule_used === 'base_rate_under_150'
    ? 'base rate (under $150 threshold)'
    : row.rule_used === 'fee_waived_no_phleb_pay'
    ? 'fee-waived visit'
    : row.rule_used;

  const allMembers = [patientName, ...(companionNames || [])].filter(Boolean);

  return (
    <div className="px-4 py-3 border-b bg-emerald-50/40">
      <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-emerald-700" />
        Bundle of {bodies} · {allMembers.join(' + ')}
      </p>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-muted-foreground">Charged</div>
          <div className="text-sm font-semibold text-gray-900">${charge.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Business keeps</div>
          <div className="text-sm font-semibold text-gray-900">${business.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Your take</div>
          <div className="text-sm font-semibold text-emerald-700">${take.toFixed(2)}</div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">Rule: {ruleLabel}</p>
    </div>
  );
};

export default BundleEarningsBreakdown;
