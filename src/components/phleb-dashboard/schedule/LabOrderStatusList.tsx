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
  original_filename: string | null;
  ocr_status: string | null;
  ocr_completed_at: string | null;
  ocr_detected_panels: string[] | null;
  org_match_status: string | null;
  org_match_reason: string | null;
  org_match_organization_id: string | null;
  uploaded_at: string;
  matched_org_name?: string | null;
}

interface Props {
  appointmentId: string;
  /** Optional refresh trigger — bump to force a re-fetch (e.g. after upload completes) */
  refreshKey?: number;
}

const LabOrderStatusList: React.FC<Props> = ({ appointmentId, refreshKey }) => {
  const [rows, setRows] = useState<LabOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const pollTimer = useRef<number | null>(null);

  const fetchRows = async () => {
    const { data } = await supabase
      .from('appointment_lab_orders' as any)
      .select(`
        id, original_filename, ocr_status, ocr_completed_at, ocr_detected_panels,
        org_match_status, org_match_reason, org_match_organization_id, uploaded_at
      `)
      .eq('appointment_id', appointmentId)
      .is('deleted_at', null)
      .order('uploaded_at', { ascending: false });

    const baseRows = (data || []) as LabOrderRow[];
    // Resolve matched org names in one query
    const orgIds = baseRows
      .map(r => r.org_match_organization_id)
      .filter(Boolean) as string[];
    let orgMap: Record<string, string> = {};
    if (orgIds.length > 0) {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name')
        .in('id', orgIds);
      orgMap = Object.fromEntries((orgs || []).map((o: any) => [o.id, o.name]));
    }
    setRows(baseRows.map(r => ({
      ...r,
      matched_org_name: r.org_match_organization_id ? orgMap[r.org_match_organization_id] : null,
    })));
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
      (r.ocr_status === 'complete' && !r.org_match_status)
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

  if (loading || rows.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {rows.map(row => {
        const ocrRunning = row.ocr_status === 'pending' || row.ocr_status === 'running';
        const ocrFailed = row.ocr_status === 'failed';
        const ocrDone = row.ocr_status === 'complete';
        const matched = row.org_match_status === 'matched';
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
