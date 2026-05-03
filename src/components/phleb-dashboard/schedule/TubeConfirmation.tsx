/**
 * TubeConfirmation — phleb taps "Predicted tubes were correct" after a draw,
 * which:
 *   1. Inserts a tube_draw_confirmations row (audit trail + future ML data)
 *   2. Calls bump_catalog_confidence_on_confirm RPC → flips matching
 *      lab_test_catalog rows to confidence=1.0 (verified)
 *
 * If the prediction was WRONG, phleb taps "Different from predicted"
 * which inserts the row with matches_prediction=false + an open notes field.
 * Admin reviews these in the Inbox.
 *
 * No-op when there's no prediction to confirm against (e.g. service is
 * in-office, no lab destination, or no test codes extracted).
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, AlertTriangle, Loader2, FlaskConical } from 'lucide-react';
import { toast } from '@/components/ui/sonner';

interface Props { appointmentId: string }

const TubeConfirmation: React.FC<Props> = ({ appointmentId }) => {
  const [labName, setLabName] = useState<string | null>(null);
  const [testCodes, setTestCodes] = useState<string[]>([]);
  const [prediction, setPrediction] = useState<any>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionNote, setCorrectionNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: appt } = await supabase
        .from('appointments')
        .select('lab_destination')
        .eq('id', appointmentId)
        .maybeSingle();
      if (!appt?.lab_destination) return;
      if (!cancelled) setLabName(appt.lab_destination);

      // Aggregate codes from this appointment's lab orders
      const { data: orders } = await supabase
        .from('appointment_lab_orders')
        .select('ocr_detected_panels')
        .eq('appointment_id', appointmentId)
        .is('deleted_at', null);
      const codes = new Set<string>();
      for (const row of (orders || []) as any[]) {
        const panels = row.ocr_detected_panels;
        if (!Array.isArray(panels)) continue;
        for (const p of panels) {
          if (typeof p === 'string') {
            const m = p.match(/^\s*(\d{2,7})\b/);
            if (m) codes.add(m[1]);
          } else if (p && typeof p === 'object' && p.code) {
            codes.add(String(p.code));
          }
        }
      }
      const codeArr = Array.from(codes);
      if (!cancelled) setTestCodes(codeArr);

      if (codeArr.length > 0) {
        const { data: pred } = await supabase
          .rpc('predict_tube_requirements' as any, {
            p_lab_name: appt.lab_destination,
            p_test_codes: codeArr,
          });
        if (!cancelled) setPrediction(pred);
      }

      // Check if already confirmed for this appointment
      const { data: prior } = await supabase
        .from('tube_draw_confirmations' as any)
        .select('id')
        .eq('appointment_id', appointmentId)
        .limit(1);
      if (!cancelled && prior && prior.length > 0) setConfirmed(true);
    })();
    return () => { cancelled = true; };
  }, [appointmentId]);

  const handleConfirm = async (matches: boolean) => {
    if (!labName || testCodes.length === 0) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let staffId: string | null = null;
      if (user?.id) {
        const { data: sp } = await supabase
          .from('staff_profiles').select('id').eq('user_id', user.id).maybeSingle();
        staffId = (sp as any)?.id || null;
      }

      await supabase.from('tube_draw_confirmations' as any).insert({
        appointment_id: appointmentId,
        staff_id: staffId,
        lab_name: labName,
        test_codes_input: testCodes,
        predicted: prediction || null,
        actual: matches
          ? { same_as_predicted: true }
          : { same_as_predicted: false, note: correctionNote || null },
        matches_prediction: matches,
        notes: matches ? null : (correctionNote || null),
      });

      if (matches) {
        // Bump catalog rows for those codes to confidence=1.0
        await supabase.rpc('bump_catalog_confidence_on_confirm' as any, {
          p_lab_name: labName,
          p_test_codes: testCodes,
        });
        toast.success('Thanks — catalog updated to "verified" for these tests');
      } else {
        toast.info('Logged for admin review. Thanks for the correction.');
      }
      setConfirmed(true);
    } catch (e: any) {
      toast.error(e?.message || 'Could not save confirmation');
    } finally {
      setBusy(false);
    }
  };

  // Nothing to confirm against
  if (!labName || testCodes.length === 0 || !prediction || (prediction?.tubes || []).length === 0) {
    return null;
  }

  if (confirmed) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5 text-xs text-emerald-800 flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Tube confirmation logged · thanks
      </div>
    );
  }

  const totalTubes = (prediction.tubes || []).reduce((s: number, t: any) => s + (t.count || 1), 0);
  const summary = (prediction.tubes || [])
    .map((t: any) => `${t.count}× ${t.tube_color}`)
    .join(' + ');

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-indigo-700 font-semibold mb-1.5">
        <FlaskConical className="h-3 w-3" />
        Tube confirmation (helps the catalog learn)
      </div>
      <p className="text-xs text-gray-700 mb-2">
        We predicted: <strong>{summary}</strong> ({totalTubes} tube{totalTubes === 1 ? '' : 's'}).
      </p>

      {!showCorrection ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => handleConfirm(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 gap-1.5"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Predicted correctly
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setShowCorrection(true)}
            className="text-xs h-8 gap-1.5 border-amber-300 text-amber-800"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Different from predicted
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={correctionNote}
            onChange={(e) => setCorrectionNote(e.target.value)}
            placeholder="What did you actually draw? (e.g. 'Needed 2 SST not 1' or 'Quest required Mint not SST for B12')"
            className="text-xs min-h-[60px]"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => { setShowCorrection(false); setCorrectionNote(''); }}
              className="text-xs h-8"
            >
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || correctionNote.trim().length < 4}
              onClick={() => handleConfirm(false)}
              className="text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Submit correction
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TubeConfirmation;
