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
        });
        setTakeCents(parseInt(String(data || 0), 10));
      } catch { setTakeCents(0); }
    })();
  }, [staffId, serviceType, tipAmount, hasCompanion, appointmentId]);

  if (!staffId || takeCents == null || takeCents === 0) return null;

  const tipDollars = Math.round((tipAmount || 0));
  const baseLabel = `+$${(takeCents / 100).toFixed(0)}`;
  const breakdown = tipDollars > 0
    ? ` (incl. $${tipDollars} tip)`
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
