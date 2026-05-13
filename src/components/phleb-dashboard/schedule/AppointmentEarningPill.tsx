/**
 * AppointmentEarningPill — green "+$63" chip next to the patient name
 * on every PhlebAppointmentCard. Calls compute_phleb_take_cents to
 * match the Stripe Connect split exactly. When a tip is captured at
 * online checkout, shows it broken out: "+$73 ($63 + $10 tip)".
 *
 * Hormozi: every visit is also a paycheck. Make the dollar visible
 * per row so the phleb sees the value of each appointment, not just
 * the daily aggregate up top.
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { extractSurchargeCents } from '@/lib/phlebSurchargeMap';

interface Props {
  serviceType: string | null;
  tipAmount: number | null;            // dollars (appointments.tip_amount)
  hasCompanion?: boolean;
  appointmentId: string;
}

const AppointmentEarningPill: React.FC<Props> = ({
  serviceType, tipAmount, hasCompanion, appointmentId,
}) => {
  const { user } = useAuth();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [takeCents, setTakeCents] = useState<number | null>(null);
  // Pricing breakdown lookup — needed so we can map surcharges (same-day,
  // weekend, after-hours, extended-area) into the p_surcharges JSON the
  // RPC accepts. Before 2026-05-13 every earning pill called the RPC
  // WITHOUT p_surcharges, so every surcharge was silently absorbed by the
  // org instead of paid to the phleb.
  const [surcharges, setSurcharges] = useState<Record<string, number>>({});

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

  // Pull pricing_breakdown for this appointment so we can read its
  // surcharge entries and pass them to the RPC.
  useEffect(() => {
    if (!appointmentId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('appointments')
        .select('pricing_breakdown, surcharge_amount')
        .eq('id', appointmentId)
        .maybeSingle();
      if (cancelled) return;
      setSurcharges(extractSurchargeCents((data as any)?.pricing_breakdown, (data as any)?.surcharge_amount));
    })();
    return () => { cancelled = true; };
  }, [appointmentId]);

  useEffect(() => {
    if (!staffId) return;
    (async () => {
      const tipCents = Math.round(((tipAmount || 0) as number) * 100);
      try {
        const { data } = await supabase.rpc('compute_phleb_take_cents' as any, {
          p_staff_id: staffId,
          p_service_type: serviceType || 'mobile',
          p_tip_cents: tipCents,
          p_has_companion: !!hasCompanion,
          p_surcharges: surcharges as any,
        });
        setTakeCents(parseInt(String(data || 0), 10));
      } catch { setTakeCents(0); }
    })();
  }, [staffId, serviceType, tipAmount, hasCompanion, appointmentId, surcharges]);

  if (!staffId || takeCents == null || takeCents === 0) return null;

  const tipDollars = Math.round((tipAmount || 0));
  const baseLabel = `+$${(takeCents / 100).toFixed(0)}`;
  // Build a tasteful tooltip line that shows surcharge contributions.
  const surchargeNotes: string[] = [];
  if (surcharges.same_day_cents) surchargeNotes.push(`same-day $${(surcharges.same_day_cents / 100).toFixed(0)}`);
  if (surcharges.weekend_cents) surchargeNotes.push(`weekend $${(surcharges.weekend_cents / 100).toFixed(0)}`);
  if (surcharges.after_hours_cents) surchargeNotes.push(`after-hours $${(surcharges.after_hours_cents / 100).toFixed(0)}`);
  if (surcharges.extended_area_cents) surchargeNotes.push(`distance $${(surcharges.extended_area_cents / 100).toFixed(0)}`);
  if (surcharges.admin_override_cents) surchargeNotes.push(`admin $${(surcharges.admin_override_cents / 100).toFixed(0)}`);
  const breakdown = tipDollars > 0
    ? ` (incl. $${tipDollars} tip)`
    : surchargeNotes.length > 0 ? ` (incl. ${surchargeNotes.join(' + ')})`
    : hasCompanion ? ' (couple)' : '';

  return (
    <span
      className="inline-flex items-center gap-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 select-none"
      title={`Your take: ${baseLabel}${tipDollars > 0 ? ` · includes 100% of $${tipDollars} tip` : ''}`}
    >
      {baseLabel}
      {breakdown && <span className="text-emerald-600 font-normal text-[10px] ml-0.5">{breakdown}</span>}
    </span>
  );
};

export default AppointmentEarningPill;
