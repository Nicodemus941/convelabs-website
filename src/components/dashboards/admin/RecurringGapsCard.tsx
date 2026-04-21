import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarClock, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

/**
 * Recurring-series gap detector.
 * Calls `detect_recurring_gaps(patient_id)` RPC — returns dates where the
 * patient's dominant day-of-week pattern should have a visit but doesn't.
 *
 * Hormozi: the "surprised patient" problem — admin schedules a weekly series
 * in two batches and misses the middle weeks (see Lawrence Carpenter case
 * 2026-04-21). This card surfaces those gaps on the patient chart with a
 * one-click fill action that clones the nearest visit's template.
 */
interface Props {
  patientId: string;
  onGapsFilled?: () => void;
}

interface Gap {
  missing_date: string;
  suggested_time: string;
  template_appt_id: string;
}

const RecurringGapsCard: React.FC<Props> = ({ patientId, onGapsFilled }) => {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [filling, setFilling] = useState(false);

  const load = async () => {
    if (!patientId) return;
    const { data, error } = await supabase.rpc('detect_recurring_gaps' as any, {
      p_patient_id: patientId,
      p_lookahead_days: 120,
    });
    if (error) { console.warn('[gaps]', error); return; }
    setGaps((data as Gap[]) || []);
  };

  useEffect(() => { load(); }, [patientId]);

  const fillAll = async () => {
    if (gaps.length === 0) return;
    setFilling(true);
    try {
      // Clone the nearest template appointment for each gap, swap date + time.
      let filled = 0;
      let failed = 0;
      for (const gap of gaps) {
        const { data: template, error: tErr } = await supabase
          .from('appointments').select('*').eq('id', gap.template_appt_id).maybeSingle();
        if (tErr || !template) { failed++; continue; }

        // UTC timestamp for the missing date at noon local (conservative).
        // The appointment_time column carries the actual visit time.
        const iso = `${gap.missing_date}T13:00:00+00:00`; // 9 AM ET = 13:00 UTC (EDT)

        const payload: any = { ...template };
        delete payload.id;
        delete payload.stripe_checkout_session_id;
        delete payload.stripe_payment_intent_id;
        delete payload.stripe_invoice_id;
        delete payload.stripe_invoice_url;
        delete payload.view_token;
        delete payload.created_at;
        delete payload.updated_at;
        payload.appointment_date = iso;
        payload.appointment_time = gap.suggested_time;
        payload.status = 'scheduled';
        payload.payment_status = 'pending';
        payload.invoice_status = 'sent';
        payload.invoice_sent_at = new Date().toISOString();
        payload.invoice_due_at = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
        payload.booking_source = 'admin_gap_fill';
        payload.notes = `Back-filled weekly gap. Template: ${template.id}.`;
        payload.cancelled_at = null;
        payload.cancellation_reason = null;
        payload.completion_time = null;
        payload.start_time = null;
        payload.arrival_time = null;
        payload.no_show = false;

        const { error: insErr } = await supabase.from('appointments').insert([payload]);
        if (insErr) { console.error('[gap-fill]', insErr); failed++; }
        else filled++;
      }
      if (filled > 0) toast.success(`Filled ${filled} missing visit${filled === 1 ? '' : 's'}${failed > 0 ? ` (${failed} failed)` : ''}`);
      if (filled === 0 && failed > 0) toast.error('All gap fills failed — check console');
      await load();
      onGapsFilled?.();
    } catch (e: any) {
      toast.error(e?.message || 'Gap fill failed');
    } finally {
      setFilling(false);
    }
  };

  if (gaps.length === 0) return null;

  return (
    <Card className="shadow-sm border-amber-200 bg-gradient-to-br from-amber-50 to-white">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <CalendarClock className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Missing weekly visits detected</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              This patient has a weekly pattern but {gaps.length} date{gaps.length === 1 ? ' is' : 's are'} not scheduled:
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {gaps.map(g => (
                <li key={g.missing_date} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-white border border-amber-300 text-amber-900">
                  {format(new Date(g.missing_date + 'T12:00:00'), 'EEE MMM d')}
                </li>
              ))}
            </ul>
          </div>
          <Button
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white flex-shrink-0"
            onClick={fillAll}
            disabled={filling}
          >
            {filling ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Filling…</> : <><Plus className="h-3.5 w-3.5 mr-1" /> Fill {gaps.length} gap{gaps.length === 1 ? '' : 's'}</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default RecurringGapsCard;
