/**
 * LabOrderRequestStatus — admin/phleb view of the patient-side request
 * pipeline. Sits next to the "Request from patient" button and shows
 * the current state with timestamps so admin knows whether to nudge,
 * call, or stop pestering the patient.
 *
 * States: pending → sent → opened → uploaded.
 * Subscribes to realtime so the moment a patient hits the page or
 * uploads, the badge flips without a refresh.
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Send, Clock, Eye, CheckCircle2, AlertTriangle } from 'lucide-react';

interface Props {
  appointmentId: string;
}

interface RequestRow {
  id: string;
  status: 'pending' | 'sent' | 'opened' | 'uploaded' | 'expired' | 'cancelled';
  send_attempts: number;
  last_send_at: string | null;
  last_send_status: string | null;
  opened_at: string | null;
  uploaded_at: string | null;
  expires_at: string;
  requested_at: string;
}

function relTime(iso: string | null): string {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

const LabOrderRequestStatus: React.FC<Props> = ({ appointmentId }) => {
  const [row, setRow] = useState<RequestRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('appointment_lab_order_requests' as any)
        .select('id, status, send_attempts, last_send_at, last_send_status, opened_at, uploaded_at, expires_at, requested_at')
        .eq('appointment_id', appointmentId)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) setRow(data as any);
    };
    load();

    // Realtime — flip the badge the moment patient opens or uploads
    const ch = supabase
      .channel(`alor-${appointmentId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'appointment_lab_order_requests',
        filter: `appointment_id=eq.${appointmentId}`,
      }, () => load())
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [appointmentId]);

  if (!row) return null;

  // Already uploaded — don't render here, the lab-orders list shows the file
  if (row.status === 'uploaded') return null;

  if (row.status === 'cancelled' || row.status === 'expired') return null;

  if (row.status === 'opened') {
    return (
      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1 w-fit">
        <Eye className="h-3 w-3" />
        Patient opened the link {relTime(row.opened_at)} · waiting for upload
      </div>
    );
  }

  if (row.status === 'sent' || row.status === 'pending') {
    const isLast = row.send_attempts >= 3;
    if (isLast) {
      return (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 w-fit">
          <AlertTriangle className="h-3 w-3" />
          Sent 3× — no upload. Consider calling the patient.
        </div>
      );
    }
    return (
      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 w-fit">
        <Send className="h-3 w-3" />
        Sent {relTime(row.last_send_at)} · attempt {row.send_attempts}/3
        {row.send_attempts < 3 && <span className="text-emerald-600">· auto-reminder in {row.send_attempts === 1 ? '24h' : '48h'}</span>}
      </div>
    );
  }

  return null;
};

export default LabOrderRequestStatus;
