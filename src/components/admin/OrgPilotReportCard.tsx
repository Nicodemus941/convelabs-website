import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { filterCalendarAppointments } from '@/lib/appointmentCalendarFilters';
import { Activity, Clock3, Loader2, Monitor, Users } from 'lucide-react';
import { subDays } from 'date-fns';

interface OrgPilotReportCardProps {
  org: {
    id: string;
    referral_count?: number | null;
    last_referral_at?: string | null;
  };
}

interface AppointmentRow {
  id: string;
  appointment_date: string | null;
  status: string | null;
  booking_source: string | null;
  total_amount: number | null;
  family_group_id?: string | null;
  companion_role?: string | null;
  address?: string | null;
  patient_id?: string | null;
}

const ACTIVE_STATUSES = new Set(['scheduled', 'confirmed', 'completed', 'specimen_delivered']);
const COMPLETED_STATUSES = new Set(['completed', 'specimen_delivered']);

const OrgPilotReportCard: React.FC<OrgPilotReportCardProps> = ({ org }) => {
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = subDays(new Date(), 30).toISOString().slice(0, 10);

      const [{ data: direct }, { data: junction }] = await Promise.all([
        supabase
          .from('appointments')
          .select('id, appointment_date, status, booking_source, total_amount, family_group_id, companion_role, address, patient_id')
          .eq('organization_id', org.id)
          .gte('appointment_date', since),
        supabase
          .from('appointment_organizations' as never)
          .select('appointment_id')
          .eq('organization_id', org.id),
      ]);

      const base = (direct || []) as AppointmentRow[];
      const linkedIds = Array.from(new Set(((junction as { appointment_id: string }[] | null) || []).map(row => row.appointment_id).filter(Boolean)));
      const missingIds = linkedIds.filter(id => !base.some(appt => appt.id === id));

      if (missingIds.length === 0) {
        setAppointments(base);
        return;
      }

      const { data: linked } = await supabase
        .from('appointments')
        .select('id, appointment_date, status, booking_source, total_amount, family_group_id, companion_role, address, patient_id')
        .in('id', missingIds)
        .gte('appointment_date', since);

      setAppointments([...base, ...((linked || []) as AppointmentRow[])]);
    } finally {
      setLoading(false);
    }
  }, [org.id]);

  useEffect(() => {
    load();
  }, [load]);

  const metrics = useMemo(() => {
    const visible = filterCalendarAppointments(appointments);
    const active = visible.filter(appt => ACTIVE_STATUSES.has(String(appt.status || '')));
    const completed = visible.filter(appt => COMPLETED_STATUSES.has(String(appt.status || '')));
    const upcoming = visible.filter(appt => ['scheduled', 'confirmed'].includes(String(appt.status || '')));
    const cancelled = appointments.filter(appt => appt.status === 'cancelled').length;
    const online = visible.filter(appt => appt.booking_source === 'online').length;
    const manual = visible.filter(appt => appt.booking_source && appt.booking_source !== 'online').length;
    const uniquePatients = new Set(active.map(appt => appt.patient_id).filter(Boolean)).size;

    const onlinePct = active.length > 0 ? Math.round((online / active.length) * 100) : 0;
    const latestActivity = visible
      .map(appt => appt.appointment_date)
      .filter(Boolean)
      .sort()
      .at(-1) || null;

    return {
      activeCount: active.length,
      completedCount: completed.length,
      upcomingCount: upcoming.length,
      cancelledCount: cancelled,
      onlineCount: online,
      manualCount: manual,
      onlinePct,
      uniquePatients,
      latestActivity,
    };
  }, [appointments]);

  return (
    <Card className="shadow-sm border-sky-200 bg-gradient-to-br from-sky-50/70 to-white">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Activity className="h-4 w-4 text-sky-700" />
          <p className="font-semibold text-sm">Pilot report</p>
          <Badge variant="outline" className="bg-white text-[10px]">Last 30 days</Badge>
          {org.referral_count != null && org.referral_count > 0 && (
            <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
              {org.referral_count} referral{org.referral_count === 1 ? '' : 's'}
            </Badge>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading 30-day org snapshot…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-white p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Operational visits</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{metrics.activeCount}</p>
                <p className="text-[11px] text-gray-500 mt-1">Deduped household-safe count</p>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Completed</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">{metrics.completedCount}</p>
                <p className="text-[11px] text-gray-500 mt-1">Completed or specimen delivered</p>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Upcoming</p>
                <p className="text-2xl font-bold text-amber-700 mt-1">{metrics.upcomingCount}</p>
                <p className="text-[11px] text-gray-500 mt-1">Scheduled or confirmed</p>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Patients served</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{metrics.uniquePatients}</p>
                <p className="text-[11px] text-gray-500 mt-1">Unique linked patient records</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border bg-white p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                  <Monitor className="h-3.5 w-3.5" /> Booking mix
                </div>
                <p className="text-lg font-bold text-slate-900 mt-1">{metrics.onlinePct}% online</p>
                <p className="text-[11px] text-gray-500 mt-1">{metrics.onlineCount} online · {metrics.manualCount} manual/assisted</p>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                  <Users className="h-3.5 w-3.5" /> Activity signal
                </div>
                <p className="text-lg font-bold text-slate-900 mt-1">{metrics.cancelledCount} cancelled</p>
                <p className="text-[11px] text-gray-500 mt-1">
                  {org.last_referral_at ? `Last referral ${new Date(org.last_referral_at).toLocaleDateString()}` : 'No referral timestamp yet'}
                </p>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                  <Clock3 className="h-3.5 w-3.5" /> Latest visit activity
                </div>
                <p className="text-lg font-bold text-slate-900 mt-1">
                  {metrics.latestActivity ? new Date(metrics.latestActivity).toLocaleDateString() : '—'}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">Use this for partner follow-up timing</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default OrgPilotReportCard;
