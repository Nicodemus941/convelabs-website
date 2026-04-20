import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Circle, Clock, ExternalLink, Copy, Mail, MessageSquare, Eye, CalendarCheck, FlaskConical, Truck } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Real-time lab-request timeline for providers.
 *
 * Polls the patient_lab_requests row every 5 seconds and renders a
 * 6-step Hormozi progress stepper so the provider watches the funnel
 * advance without refreshing:
 *
 *   1. Notified       patient_notified_at         SMS + email fired
 *   2. Opened         patient_viewed_at           patient loaded booking page
 *   3. Booked         patient_scheduled_at        appointment scheduled
 *   4. Collected      appointments.actual_draw_time / completed_at
 *   5. Delivered      specimen_delivered_at + specimen_delivered_to
 *   6. Completed      completed_at                results cycle finished
 *
 * Each step shows a timestamp when it fires, plus a one-click copy for
 * the public booking URL and specimen tracking ID.
 */

interface Props {
  requestId: string;
  compact?: boolean;
}

interface RequestRow {
  id: string;
  patient_name: string;
  patient_email: string | null;
  patient_phone: string | null;
  access_token: string;
  draw_by_date: string;
  patient_notified_at: string | null;
  patient_viewed_at: string | null;
  patient_scheduled_at: string | null;
  specimen_delivered_at: string | null;
  specimen_delivered_to: string | null;
  specimen_tracking_id: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  appointment_id: string | null;
  status: string;
}

const fmtRelative = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const LabRequestTimeline: React.FC<Props> = ({ requestId, compact = false }) => {
  const [row, setRow] = useState<RequestRow | null>(null);
  const [apptCollectedAt, setApptCollectedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('patient_lab_requests')
        .select('id, patient_name, patient_email, patient_phone, access_token, draw_by_date, patient_notified_at, patient_viewed_at, patient_scheduled_at, specimen_delivered_at, specimen_delivered_to, specimen_tracking_id, completed_at, cancelled_at, appointment_id, status')
        .eq('id', requestId)
        .maybeSingle();
      if (cancelled) return;
      setRow(data as any);
      // If there's a linked appointment, check its status for collection timestamp
      if ((data as any)?.appointment_id) {
        const { data: appt } = await supabase
          .from('appointments')
          .select('actual_draw_time, status, completed_at')
          .eq('id', (data as any).appointment_id)
          .maybeSingle();
        if (!cancelled && appt) {
          setApptCollectedAt((appt as any).actual_draw_time || ((appt as any).status === 'completed' ? (appt as any).completed_at : null));
        }
      }
      setLoading(false);
    };
    load();
    // Poll every 5s while the funnel is still in progress
    const t = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [requestId]);

  if (loading) {
    return <div className="p-4 text-sm text-gray-500 animate-pulse">Loading real-time status…</div>;
  }
  if (!row) return null;

  const bookingUrl = `https://www.convelabs.com/lab-request/${row.access_token}`;
  const cancelled = !!row.cancelled_at;

  const steps = [
    {
      key: 'notified',
      label: 'Notified patient',
      sublabel: [row.patient_email ? '📧 email' : null, row.patient_phone ? '📱 SMS' : null].filter(Boolean).join(' · '),
      at: row.patient_notified_at,
      icon: MessageSquare,
    },
    {
      key: 'opened',
      label: 'Patient opened booking page',
      sublabel: row.patient_viewed_at ? '' : 'waiting…',
      at: row.patient_viewed_at,
      icon: Eye,
    },
    {
      key: 'booked',
      label: 'Appointment scheduled',
      sublabel: row.patient_scheduled_at ? '' : '',
      at: row.patient_scheduled_at,
      icon: CalendarCheck,
    },
    {
      key: 'collected',
      label: 'Specimen collected',
      sublabel: apptCollectedAt ? '' : '',
      at: apptCollectedAt,
      icon: FlaskConical,
    },
    {
      key: 'delivered',
      label: 'Delivered to lab',
      sublabel: row.specimen_delivered_to || '',
      at: row.specimen_delivered_at,
      icon: Truck,
    },
    {
      key: 'completed',
      label: 'Cycle complete',
      sublabel: '',
      at: row.completed_at,
      icon: CheckCircle2,
    },
  ];

  const completedCount = steps.filter(s => s.at).length;
  const percentage = Math.round((completedCount / steps.length) * 100);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  return (
    <div className={`rounded-xl border border-gray-200 bg-white ${compact ? 'p-3' : 'p-4'}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-bold text-gray-900">{row.patient_name}'s lab request</p>
          <p className="text-[11px] text-gray-500">
            Draw by {new Date(row.draw_by_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            {cancelled && <span className="ml-2 text-red-600 font-semibold">· CANCELLED</span>}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-emerald-700">{completedCount} / {steps.length} steps</div>
          <div className="text-[10px] text-gray-500">{percentage}% complete</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-4">
        <div
          className={`h-full transition-all duration-500 ${cancelled ? 'bg-red-400' : 'bg-gradient-to-r from-emerald-500 to-emerald-600'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Steps */}
      <ol className="space-y-2.5">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const done = !!s.at;
          const pending = !done && steps.slice(0, i).every(prev => prev.at);
          return (
            <li key={s.key} className="flex items-start gap-2.5">
              <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                done ? 'bg-emerald-500 text-white' :
                pending ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-300 animate-pulse' :
                'bg-gray-100 text-gray-400'
              }`}>
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                 pending ? <Clock className="h-3 w-3" /> :
                 <Circle className="h-2.5 w-2.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Icon className={`h-3.5 w-3.5 ${done ? 'text-emerald-600' : pending ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className={`text-sm ${done ? 'font-semibold text-gray-900' : pending ? 'font-semibold text-blue-900' : 'text-gray-500'}`}>
                    {s.label}
                  </span>
                  {s.at && <span className="text-[11px] text-emerald-700">· {fmtRelative(s.at)}</span>}
                  {pending && <span className="text-[11px] text-blue-700 italic">· live</span>}
                </div>
                {s.sublabel && (
                  <div className="text-[11px] text-gray-500 mt-0.5">{s.sublabel}</div>
                )}
                {/* Inline detail for delivered step */}
                {s.key === 'delivered' && row.specimen_tracking_id && (
                  <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                    <span className="text-gray-500">Tracking ID:</span>
                    <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-900 font-mono">{row.specimen_tracking_id}</code>
                    <button onClick={() => copy(row.specimen_tracking_id!, 'Tracking ID')} className="text-gray-400 hover:text-gray-700">
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Utility row — booking URL */}
      {!row.patient_scheduled_at && !cancelled && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Patient booking link</div>
              <div className="text-xs text-gray-900 truncate font-mono">{bookingUrl}</div>
            </div>
            <button onClick={() => copy(bookingUrl, 'Booking URL')} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg" title="Copy">
              <Copy className="h-3.5 w-3.5" />
            </button>
            <a href={bookingUrl} target="_blank" rel="noopener" className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg" title="Open">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      )}

      {/* Next action hint */}
      {!cancelled && (
        <div className="mt-3 text-[11px] text-gray-500">
          {!row.patient_notified_at && '⏳ Queuing patient notification…'}
          {row.patient_notified_at && !row.patient_viewed_at && '👀 Waiting on patient to open the link'}
          {row.patient_viewed_at && !row.patient_scheduled_at && '🗓 Patient is viewing — watching for booking'}
          {row.patient_scheduled_at && !apptCollectedAt && '📅 Booked! Phleb will collect on the scheduled date'}
          {apptCollectedAt && !row.specimen_delivered_at && '🧪 Specimen in transit to lab'}
          {row.specimen_delivered_at && !row.completed_at && '✓ Delivered — results in 48–72h'}
          {row.completed_at && '✓ Cycle complete'}
        </div>
      )}
    </div>
  );
};

export default LabRequestTimeline;
