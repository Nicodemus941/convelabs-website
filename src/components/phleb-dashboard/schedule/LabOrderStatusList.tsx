/**
 * LabOrderStatusList
 *
 * Inline OCR + org-match status display for every lab-order row attached
 * to an appointment. Phlebs see, at a glance:
 *   • "Reading lab order…" (ocr_status pending|running)
 *   • "Linked: The Restoration Place" (org_match_status='matched')
 *   • "New lead: Acme Wellness · queued" (org_match_status='auto_created')
 *   • "Provider not matched — admin will review" (everything else)
 *
 * Polls every 3s while any row is mid-flight, then stops to keep the
 * dashboard cheap. Source: appointment_lab_orders table directly (the
 * legacy comma-split path on appointments doesn't carry this state).
 */

import React, { useEffect, useState, useRef } from 'react';
import { Loader2, CheckCircle2, Building2, Sparkles, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface LabOrderRow {
  id: string;
  appointment_id?: string | null;
  original_filename: string | null;
  ocr_status: string | null;
  ocr_completed_at: string | null;
  ocr_detected_panels: string[] | null;
  org_match_status: string | null;
  org_match_reason: string | null;
  org_match_organization_id: string | null;
  uploaded_at: string;
  matched_org_name?: string | null;
  /** True when the row's own org_match_status is null but the appointment
   *  itself has an organization linked (e.g. assigned manually via the
   *  "Assign organization" picker, which doesn't stamp the lab-order row). */
  appt_level_matched?: boolean;
}

interface Props {
  appointmentId: string;
  /** Optional refresh trigger — bump to force a re-fetch (e.g. after upload completes) */
  refreshKey?: number;
}

const LabOrderStatusList: React.FC<Props> = ({ appointmentId, refreshKey }) => {
  const [rows, setRows] = useState<LabOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Bundle members (companions) drawn together who have NO lab order on file
  // but whose service needs one — the phleb must know what to draw for them.
  const [missing, setMissing] = useState<{ id: string; name: string }[]>([]);
  const pollTimer = useRef<number | null>(null);

  const fetchRows = async () => {
    // Pull lab orders for this appointment AND all family-group siblings.
    // Couple/family bookings put each patient's order on their OWN row;
    // without this widening, the phleb opening the primary's card sees
    // only the primary's order. (Westphal/Rowland 2026-05-04.)
    const { data: anchor } = await supabase
      .from('appointments')
      .select('id, family_group_id')
      .eq('id', appointmentId)
      .maybeSingle();

    let appointmentIds: string[] = [appointmentId];
    if ((anchor as any)?.family_group_id) {
      const { data: siblings } = await supabase
        .from('appointments')
        .select('id')
        .eq('family_group_id', (anchor as any).family_group_id);
      appointmentIds = (siblings as any[] || []).map(s => s.id);
      if (!appointmentIds.includes(appointmentId)) appointmentIds.push(appointmentId);
    }

    // The appointment(s) may already be linked to an org (e.g. assigned
    // manually via the "Assign organization" picker, which sets
    // appointments.organization_id but does NOT stamp the lab-order row's
    // org_match_status). Pull that so we can show "Linked" and stop the
    // "Matching provider…" spinner instead of polling forever.
    const { data: apptOrgRows } = await supabase
      .from('appointments')
      .select('id, organization_id, patient_name, companion_role, service_type')
      .in('id', appointmentIds);
    const apptOrgMap: Record<string, string> = Object.fromEntries(
      (apptOrgRows as any[] || [])
        .filter(a => a.organization_id)
        .map(a => [a.id, a.organization_id])
    );

    const { data } = await supabase
      .from('appointment_lab_orders' as any)
      .select(`
        id, appointment_id, original_filename, ocr_status, ocr_completed_at, ocr_detected_panels,
        org_match_status, org_match_reason, org_match_organization_id, uploaded_at
      `)
      .in('appointment_id', appointmentIds)
      .is('deleted_at', null)
      .order('uploaded_at', { ascending: false });

    const baseRows = (data || []) as LabOrderRow[];
    // Resolve org names for BOTH the row-level match and the appointment-level
    // org fallback, in one query.
    const orgIds = Array.from(new Set([
      ...baseRows.map(r => r.org_match_organization_id).filter(Boolean) as string[],
      ...Object.values(apptOrgMap),
    ]));
    let orgMap: Record<string, string> = {};
    if (orgIds.length > 0) {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name')
        .in('id', orgIds);
      orgMap = Object.fromEntries((orgs || []).map((o: any) => [o.id, o.name]));
    }
    setRows(baseRows.map(r => {
      const apptOrgId = r.appointment_id ? apptOrgMap[r.appointment_id] : undefined;
      // Appointment-level fallback applies only when the row itself wasn't
      // matched/auto-created/unmatched by OCR (status is null).
      const apptLevelMatched = !r.org_match_status && !!apptOrgId;
      const effectiveOrgId = r.org_match_organization_id || (apptLevelMatched ? apptOrgId : null);
      return {
        ...r,
        appt_level_matched: apptLevelMatched,
        matched_org_name: effectiveOrgId ? orgMap[effectiveOrgId] : null,
      };
    }));

    // For couple/family bundles, flag any member with NO lab order on file
    // whose service actually needs one (in-office + partner-billed visits
    // don't require a patient-uploaded order). Couple case (Brian + Kimberly):
    // only the primary had an order — the phleb had nothing to draw for the
    // companion. Only computed for true bundles to avoid solo-visit noise.
    const isBundle = appointmentIds.length > 1;
    if (isBundle) {
      const haveOrder = new Set(baseRows.map(r => r.appointment_id));
      const needsOrder = (st?: string | null) => {
        const s = (st || '').toLowerCase();
        return s !== 'in-office' && !s.startsWith('partner-');
      };
      const miss = (apptOrgRows as any[] || [])
        .filter(a => !haveOrder.has(a.id) && needsOrder(a.service_type))
        .map(a => ({ id: a.id, name: a.patient_name || 'Companion' }));
      setMissing(miss);
    } else {
      setMissing([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId, refreshKey]);

  // Poll while any row is mid-flight (ocr running OR org-match not yet stamped)
  useEffect(() => {
    const inFlight = rows.some(r =>
      r.ocr_status === 'pending' || r.ocr_status === 'running' ||
      // OCR done but no match yet — still in flight, UNLESS the appointment
      // is already linked to an org (manual assignment), in which case it's
      // resolved and we must NOT keep polling.
      (r.ocr_status === 'complete' && !r.org_match_status && !r.appt_level_matched)
    );
    if (inFlight && !pollTimer.current) {
      pollTimer.current = window.setInterval(fetchRows, 3000);
    }
    if (!inFlight && pollTimer.current) {
      window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  if (loading) return null;
  if (rows.length === 0 && missing.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {/* Companion(s) with no lab order on file — phleb must confirm what to draw */}
      {missing.map(m => (
        <div key={`miss-${m.id}`} className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-amber-50 text-amber-800 border-amber-300">
            <AlertCircle className="h-3 w-3" />
            No lab order on file for {m.name} — confirm before drawing
          </span>
        </div>
      ))}
      {rows.map(row => {
        const ocrRunning = row.ocr_status === 'pending' || row.ocr_status === 'running';
        const ocrFailed = row.ocr_status === 'failed';
        const ocrDone = row.ocr_status === 'complete';
        // "matched" if OCR stamped it OR the appointment is linked to an org
        // by other means (manual assignment via the Assign-organization picker).
        const matched = row.org_match_status === 'matched' || row.appt_level_matched === true;
        const autoCreated = row.org_match_status === 'auto_created';
        const unmatched = row.org_match_status === 'unmatched';

        let pill: { icon: React.ReactNode; text: string; cls: string };

        if (ocrRunning) {
          pill = {
            icon: <Loader2 className="h-3 w-3 animate-spin" />,
            text: 'Reading lab order…',
            cls: 'bg-blue-50 text-blue-700 border-blue-200',
          };
        } else if (ocrFailed) {
          pill = {
            icon: <AlertCircle className="h-3 w-3" />,
            text: 'OCR failed — admin will review',
            cls: 'bg-red-50 text-red-700 border-red-200',
          };
        } else if (ocrDone && matched) {
          pill = {
            icon: <CheckCircle2 className="h-3 w-3" />,
            text: `Linked: ${row.matched_org_name || 'matched provider'}`,
            cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          };
        } else if (ocrDone && autoCreated) {
          pill = {
            icon: <Sparkles className="h-3 w-3" />,
            text: `New lead: ${row.matched_org_name || 'practice'} · queued for review`,
            cls: 'bg-amber-50 text-amber-800 border-amber-200',
          };
        } else if (ocrDone && unmatched) {
          pill = {
            icon: <Building2 className="h-3 w-3" />,
            text: 'Provider not matched — admin will review',
            cls: 'bg-gray-50 text-gray-700 border-gray-200',
          };
        } else if (ocrDone && !row.org_match_status) {
          // OCR done but no match writeback yet (older edge function version,
          // or match step not yet run)
          pill = {
            icon: <Loader2 className="h-3 w-3 animate-spin" />,
            text: 'Matching provider…',
            cls: 'bg-blue-50 text-blue-700 border-blue-200',
          };
        } else {
          pill = {
            icon: <Building2 className="h-3 w-3" />,
            text: 'Pending review',
            cls: 'bg-gray-50 text-gray-700 border-gray-200',
          };
        }

        const fileName = row.original_filename || 'Lab order';
        const trimmedFile = fileName.length > 28 ? fileName.slice(0, 28) + '…' : fileName;

        return (
          <div key={row.id} className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-gray-500 truncate max-w-[160px]">{trimmedFile}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${pill.cls}`}>
              {pill.icon}
              {pill.text}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default LabOrderStatusList;
