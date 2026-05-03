/**
 * DaySummaryBanner — single-line "Mon May 4 · 3 visits · ~$200" banner
 * shown above the appointment list. Sums compute_phleb_take_cents
 * across the day's visits so the phleb sees what the day's worth.
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, isToday, isTomorrow } from 'date-fns';
import { Calendar, DollarSign } from 'lucide-react';

interface Props {
  selectedDate: Date;
  appointments: Array<{
    id: string;
    appointment_date: string;
    service_type: string | null;
    status: string;
    tip_amount: number | null;
    family_group_id?: string | null;
  }>;
}

const DaySummaryBanner: React.FC<Props> = ({ selectedDate, appointments }) => {
  const { user } = useAuth();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [totalCents, setTotalCents] = useState<number>(0);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase.from('staff_profiles').select('id').eq('user_id', user.id).maybeSingle();
      setStaffId((data as any)?.id || null);
    })();
  }, [user?.id]);

  // Compute day's projected earnings via the canonical RPC
  useEffect(() => {
    if (!staffId) return;
    let cancelled = false;
    (async () => {
      const dayStr = format(selectedDate, 'yyyy-MM-dd');
      const dayAppts = appointments.filter(
        (a) => a.appointment_date === dayStr && a.status !== 'cancelled',
      );
      // Group counts so we know if a row is part of a couple bundle
      const groupCounts = new Map<string, number>();
      for (const a of dayAppts) if (a.family_group_id) groupCounts.set(a.family_group_id, (groupCounts.get(a.family_group_id) || 0) + 1);

      let sum = 0;
      for (const a of dayAppts) {
        const tipCents = Math.round(((a.tip_amount || 0) as number) * 100);
        const hasCompanion = !!(a.family_group_id && (groupCounts.get(a.family_group_id) || 0) > 1);
        try {
          const { data } = await supabase.rpc('compute_phleb_take_cents' as any, {
            p_staff_id: staffId,
            p_service_type: a.service_type || 'mobile',
            p_tip_cents: tipCents,
            p_has_companion: hasCompanion,
          });
          sum += parseInt(String(data || 0), 10);
        } catch { /* skip */ }
      }
      if (!cancelled) setTotalCents(sum);
    })();
    return () => { cancelled = true; };
  }, [staffId, selectedDate, appointments]);

  const dayStr = format(selectedDate, 'yyyy-MM-dd');
  const dayActive = appointments.filter(
    (a) => a.appointment_date === dayStr && a.status !== 'cancelled',
  );
  if (dayActive.length === 0) return null;

  const dayLabel = isToday(selectedDate) ? 'Today'
    : isTomorrow(selectedDate) ? 'Tomorrow'
    : format(selectedDate, 'EEE MMM d');
  const visitCount = dayActive.length;

  return (
    <div className="flex items-center justify-between rounded-lg bg-gradient-to-r from-emerald-50 to-emerald-100 border border-emerald-200 px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <Calendar className="h-3.5 w-3.5 text-emerald-700" />
        <span className="font-semibold text-emerald-900">{dayLabel}</span>
        <span className="text-emerald-700">· {visitCount} visit{visitCount === 1 ? '' : 's'}</span>
      </div>
      {totalCents > 0 && (
        <div className="flex items-center gap-1 text-sm font-bold text-emerald-800">
          <DollarSign className="h-3.5 w-3.5" />
          ~${(totalCents / 100).toFixed(0)}
        </div>
      )}
    </div>
  );
};

export default DaySummaryBanner;
