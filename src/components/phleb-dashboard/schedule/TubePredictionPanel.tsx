/**
 * TubePredictionPanel — "the tube atlas" surfaced per appointment.
 *
 * Pulls extracted test codes from appointment_lab_orders.ocr_detected_panels
 * across all the appointment's lab order rows, runs them through
 * predict_tube_requirements RPC against the appointment's lab_destination,
 * and renders a phleb-grade draw plan:
 *   • Tubes in CLSI order-of-draw (yellow → blue → red/SST → green → lavender → gray → urine)
 *   • Per-tube color icon + count + volume
 *   • Tests grouped under their tube
 *   • Special handling + time-window warnings
 *   • Fasting flag aggregate
 *   • Confidence indicator (manual seed = 0.85; phleb confirmation bumps to 1.0)
 *
 * Hormozi: replace the "I'll call the lab" mid-visit moment with
 * "I already know what to draw before I unzip the bag."
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FlaskConical, AlertTriangle, Loader2, Clock, Sparkles } from 'lucide-react';

interface TubeEntry {
  tube_type: string;
  tube_color: string;
  draw_order: number;
  count: number;
  volume_ml: number;
  tests: Array<{ code: string; name: string; fasting?: boolean; time_window?: string | null }>;
  special_handling?: string[] | null;
  time_windows?: string[] | null;
}

interface Prediction {
  tubes: TubeEntry[];
  total_volume_ml: number;
  fasting_required: boolean;
  missing_codes: string[];
  warnings: string[];
  confidence_min: number;
  lab_name?: string;
}

interface Props {
  appointmentId: string;
  labDestination: string | null;
  refreshKey?: number;
}

// Tube color → CSS for the visual chip. CLSI standard colors.
const COLOR_STYLES: Record<string, { bg: string; ring: string; text: string }> = {
  'Gold':         { bg: 'bg-yellow-300',  ring: 'ring-yellow-500',   text: 'text-yellow-900' },
  'Yellow':       { bg: 'bg-yellow-300',  ring: 'ring-yellow-500',   text: 'text-yellow-900' },
  'Lavender':     { bg: 'bg-purple-300',  ring: 'ring-purple-500',   text: 'text-purple-900' },
  'Light Blue':   { bg: 'bg-sky-300',     ring: 'ring-sky-500',      text: 'text-sky-900' },
  'Mint':         { bg: 'bg-green-300',   ring: 'ring-green-500',    text: 'text-green-900' },
  'Royal Blue':   { bg: 'bg-blue-500',    ring: 'ring-blue-700',     text: 'text-white' },
  'Gray':         { bg: 'bg-gray-400',    ring: 'ring-gray-600',     text: 'text-gray-900' },
  'Red':          { bg: 'bg-red-500',     ring: 'ring-red-700',      text: 'text-white' },
  'Urine Yellow': { bg: 'bg-amber-200',   ring: 'ring-amber-400',    text: 'text-amber-900' },
};

const TubePredictionPanel: React.FC<Props> = ({ appointmentId, labDestination, refreshKey }) => {
  const [loading, setLoading] = useState(true);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [allCodes, setAllCodes] = useState<string[]>([]);
  const [aiResolving, setAiResolving] = useState(false);

  useEffect(() => {
    if (!appointmentId || !labDestination) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Pull every test code/name from every lab order on this appt
        const { data: orders } = await supabase
          .from('appointment_lab_orders')
          .select('ocr_detected_panels')
          .eq('appointment_id', appointmentId)
          .is('deleted_at', null);

        const codes = new Set<string>();
        for (const row of (orders || []) as any[]) {
          const panels = row.ocr_detected_panels;
          if (!panels) continue;
          // panels can be: array of strings OR array of { code, name } objects
          if (Array.isArray(panels)) {
            for (const p of panels) {
              if (typeof p === 'string') {
                // Try to extract a code prefix like "7600" from "7600 - Lipid Panel"
                const m = p.match(/^\s*(\d{2,7})\b/);
                if (m) codes.add(m[1]);
                codes.add(p.trim());
              } else if (p && typeof p === 'object') {
                if (p.code) codes.add(String(p.code));
                if (p.name) codes.add(String(p.name));
              }
            }
          }
        }
        const codeArr = Array.from(codes);
        if (!cancelled) setAllCodes(codeArr);

        if (codeArr.length === 0) {
          if (!cancelled) { setPrediction(null); setLoading(false); }
          return;
        }

        const { data: pred, error } = await supabase
          .rpc('predict_tube_requirements' as any, {
            p_lab_name: labDestination,
            p_test_codes: codeArr,
          });
        if (error) throw error;
        if (!cancelled) setPrediction(pred as Prediction);

        // AI fallback — fire Claude lookups for any missing codes that
        // look like real test codes (digits or short ALPHA tokens, not
        // free-form text). Cached forever in lab_test_catalog. Once
        // any lookup completes, we re-run predict_tube_requirements
        // to fold the new rows in.
        const missing = ((pred as Prediction)?.missing_codes || []).filter(c =>
          /^[A-Z0-9-]{1,12}$/i.test(c) && !c.includes(' ')
        );
        if (missing.length > 0 && !cancelled) {
          setAiResolving(true);
          const lookups = missing.slice(0, 8).map(code =>
            supabase.functions.invoke('lookup-lab-test-code', {
              body: { lab_name: labDestination, test_code: code },
            }).catch(() => null),
          );
          await Promise.all(lookups);
          if (!cancelled) {
            const { data: predRetry } = await supabase
              .rpc('predict_tube_requirements' as any, {
                p_lab_name: labDestination,
                p_test_codes: codeArr,
              });
            if (predRetry) setPrediction(predRetry as Prediction);
            setAiResolving(false);
          }
        }
      } catch (e) {
        console.warn('[tube-prediction] failed:', e);
        if (!cancelled) setPrediction(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [appointmentId, labDestination, refreshKey]);

  if (!labDestination || allCodes.length === 0) return null;

  if (loading) {
    return (
      <div className="mt-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100 text-xs text-indigo-700 flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Predicting tubes…
      </div>
    );
  }

  if (!prediction || prediction.tubes.length === 0) {
    return (
      <div className="mt-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Couldn't predict tubes for this order.</p>
          <p className="text-amber-700 mt-0.5">
            None of the {allCodes.length} test code{allCodes.length === 1 ? '' : 's'} matched our {labDestination} catalog.
            Manual lookup required — call the lab or check Accudraw.
          </p>
        </div>
      </div>
    );
  }

  const totalTubeCount = prediction.tubes.reduce((s, t) => s + t.count, 0);
  const allHandling = Array.from(new Set(prediction.tubes.flatMap(t => t.special_handling || [])));
  const allTimeWindows = Array.from(new Set(prediction.tubes.flatMap(t => t.time_windows || [])));
  const lowConfidence = prediction.confidence_min < 0.75;

  return (
    <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-indigo-700 flex items-center gap-1.5">
          <FlaskConical className="h-3 w-3" />
          Draw Plan · {labDestination}
          {aiResolving && (
            <span className="ml-1 text-[9px] normal-case tracking-normal text-indigo-500 flex items-center gap-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> resolving extra codes…
            </span>
          )}
        </p>
        <span className="text-[10px] text-indigo-600 font-medium">
          {totalTubeCount} tube{totalTubeCount === 1 ? '' : 's'} · {prediction.total_volume_ml} mL total
        </span>
      </div>

      {/* CLSI order-of-draw row visualization */}
      <div className="flex items-center gap-2 mb-2.5 px-1">
        {prediction.tubes.map((t, idx) => {
          const c = COLOR_STYLES[t.tube_color] || { bg: 'bg-gray-300', ring: 'ring-gray-500', text: 'text-gray-900' };
          return (
            <React.Fragment key={`${t.tube_type}-${idx}`}>
              <div className="flex flex-col items-center" title={`${t.tube_color} (${t.tube_type})`}>
                {Array.from({ length: t.count }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-5 h-7 ${c.bg} ${c.ring} ring-2 rounded-sm mb-0.5 flex items-end justify-center text-[8px] font-bold ${c.text}`}
                  >
                    {t.tube_type.charAt(0)}
                  </div>
                ))}
                <span className="text-[9px] text-gray-600 mt-0.5">{t.tube_color}</span>
              </div>
              {idx < prediction.tubes.length - 1 && <span className="text-gray-400 text-xs">→</span>}
            </React.Fragment>
          );
        })}
      </div>

      {/* Detailed list */}
      <div className="space-y-2">
        {prediction.tubes.map((t, idx) => {
          const c = COLOR_STYLES[t.tube_color] || { bg: 'bg-gray-300', ring: 'ring-gray-500', text: 'text-gray-900' };
          return (
            <div key={`${t.tube_type}-${idx}-detail`} className="bg-white rounded-md border border-gray-200 p-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-sm ${c.bg} ${c.ring} ring-1 flex-shrink-0`} />
                  <span className="font-bold text-gray-900">
                    {t.count}× {t.tube_color} {t.tube_type}
                  </span>
                  <span className="text-gray-500 text-[11px]">· {t.volume_ml} mL</span>
                </div>
              </div>
              <ul className="mt-1 ml-5 space-y-0.5 text-[11px] text-gray-700">
                {t.tests.map((test, i) => (
                  <li key={i}>
                    <span className="text-gray-500 font-mono mr-1">{test.code}</span>
                    {test.name}
                    {test.time_window && <span className="ml-1 text-amber-700">· {test.time_window}</span>}
                  </li>
                ))}
              </ul>
              {(t.special_handling && t.special_handling.length > 0) && (
                <p className="mt-1 ml-5 text-[10px] text-amber-700">
                  ⚠ {t.special_handling.join(' · ')}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer signals */}
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
        <span className="font-mono text-gray-500">Order: Y → R/SST → M → L → G → U</span>
        {prediction.fasting_required && (
          <span className="bg-amber-100 text-amber-900 border border-amber-200 rounded-full px-2 py-0.5 font-semibold">
            ⚠ Fasting required
          </span>
        )}
        {allTimeWindows.length > 0 && (
          <span className="bg-amber-100 text-amber-900 border border-amber-200 rounded-full px-2 py-0.5">
            <Clock className="h-2.5 w-2.5 inline mr-0.5" /> {allTimeWindows.join(', ')}
          </span>
        )}
        {prediction.missing_codes.length > 0 && (
          <span className="bg-red-100 text-red-800 border border-red-200 rounded-full px-2 py-0.5" title={prediction.missing_codes.join(', ')}>
            ⚠ {prediction.missing_codes.length} unmatched code{prediction.missing_codes.length === 1 ? '' : 's'} — verify manually
          </span>
        )}
        {lowConfidence && (
          <span className="bg-orange-100 text-orange-800 border border-orange-200 rounded-full px-2 py-0.5">
            <Sparkles className="h-2.5 w-2.5 inline mr-0.5" /> {(prediction.confidence_min * 100).toFixed(0)}% confidence — verify
          </span>
        )}
      </div>
      {(allHandling.length > 0) && (
        <p className="mt-1.5 text-[10px] text-amber-800 bg-amber-50 border border-amber-100 rounded p-1.5">
          ⚠ {allHandling.join(' · ')}
        </p>
      )}
    </div>
  );
};

export default TubePredictionPanel;
