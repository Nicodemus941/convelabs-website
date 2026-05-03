/**
 * LabOrderFunnelCard — Hormozi Dashboard tile.
 *
 * Tracks the patient-side lab-order request funnel (last 30 days):
 *   Sent → Opened → Uploaded
 * with a benchmark callout per stage. Helps the owner see where leakage
 * is happening and decide whether the SMS copy / page UX needs work.
 *
 * Hormozi: every funnel deserves a daily look. The first stage with a
 * lower-than-target conversion IS your highest-ROI thing to fix.
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Send, Eye, CheckCircle2, Loader2 } from 'lucide-react';

interface Funnel {
  sent: number;
  opened: number;
  uploaded: number;
  median_time_to_upload_minutes: number | null;
}

const LabOrderFunnelCard: React.FC = () => {
  const [data, setData] = useState<Funnel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: rows } = await supabase
          .from('appointment_lab_order_requests' as any)
          .select('status, opened_at, uploaded_at, last_send_at, requested_at')
          .gte('requested_at', since);
        const all = (rows || []) as any[];
        const sent = all.filter(r => !!r.last_send_at).length;
        const opened = all.filter(r => !!r.opened_at).length;
        const uploaded = all.filter(r => !!r.uploaded_at).length;

        // Median time-to-upload from last_send_at → uploaded_at
        const times = all
          .filter(r => r.last_send_at && r.uploaded_at)
          .map(r => (new Date(r.uploaded_at).getTime() - new Date(r.last_send_at).getTime()) / 60000)
          .sort((a, b) => a - b);
        const median = times.length === 0 ? null
          : times.length % 2 === 1 ? times[(times.length - 1) / 2]
          : (times[times.length / 2 - 1] + times[times.length / 2]) / 2;

        setData({ sent, opened, uploaded, median_time_to_upload_minutes: median });
      } catch (e) {
        console.warn('[lab-order-funnel] load failed:', e);
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-5 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading lab-order funnel…
        </CardContent>
      </Card>
    );
  }

  if (!data || data.sent === 0) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-5">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Lab Order Request Funnel · 30d</p>
          <p className="text-sm text-gray-700 mt-2">No requests sent yet — fire the first one from any appointment with a missing lab order.</p>
        </CardContent>
      </Card>
    );
  }

  const openRate = data.sent > 0 ? Math.round((data.opened / data.sent) * 100) : 0;
  const uploadRate = data.sent > 0 ? Math.round((data.uploaded / data.sent) * 100) : 0;
  const openToUploadRate = data.opened > 0 ? Math.round((data.uploaded / data.opened) * 100) : 0;

  // Hormozi benchmarks (he'd say): 80%+ open, 60%+ upload, 75%+ open-to-upload
  const openColor = openRate >= 80 ? 'emerald' : openRate >= 50 ? 'amber' : 'red';
  const uploadColor = uploadRate >= 60 ? 'emerald' : uploadRate >= 35 ? 'amber' : 'red';

  const medianLine = data.median_time_to_upload_minutes != null
    ? data.median_time_to_upload_minutes < 60
      ? `${Math.round(data.median_time_to_upload_minutes)} min`
      : `${(data.median_time_to_upload_minutes / 60).toFixed(1)} hrs`
    : '—';

  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Lab Order Request Funnel</p>
            <h3 className="text-sm font-bold text-gray-900">Last 30 days · {data.sent} requests sent</h3>
          </div>
          <span className="text-[10px] text-gray-400">Median time-to-upload: <strong className="text-gray-700">{medianLine}</strong></span>
        </div>

        <div className="space-y-2.5">
          {/* Sent */}
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
              <Send className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-700 font-semibold">Sent</span>
                <span className="text-gray-900 font-bold">{data.sent}</span>
              </div>
              <div className="h-1.5 w-full bg-blue-100 rounded-full overflow-hidden mt-1">
                <div className="h-full bg-blue-500" style={{ width: '100%' }} />
              </div>
            </div>
          </div>

          {/* Opened */}
          <div className="flex items-center gap-3">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${openColor === 'emerald' ? 'bg-emerald-100 text-emerald-700' : openColor === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
              <Eye className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-700 font-semibold">Opened the link</span>
                <span className="text-gray-900 font-bold">{data.opened} <span className="text-gray-500 font-normal">· {openRate}%</span></span>
              </div>
              <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mt-1">
                <div className={`h-full ${openColor === 'emerald' ? 'bg-emerald-500' : openColor === 'amber' ? 'bg-amber-500' : 'bg-red-400'}`} style={{ width: `${openRate}%` }} />
              </div>
            </div>
          </div>

          {/* Uploaded */}
          <div className="flex items-center gap-3">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${uploadColor === 'emerald' ? 'bg-emerald-100 text-emerald-700' : uploadColor === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-700 font-semibold">Uploaded</span>
                <span className="text-gray-900 font-bold">{data.uploaded} <span className="text-gray-500 font-normal">· {uploadRate}%</span></span>
              </div>
              <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mt-1">
                <div className={`h-full ${uploadColor === 'emerald' ? 'bg-emerald-500' : uploadColor === 'amber' ? 'bg-amber-500' : 'bg-red-400'}`} style={{ width: `${uploadRate}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-600 leading-relaxed">
          {openRate < 50 && <p>⚠ <strong>Open rate {openRate}%</strong> is low — patients aren't seeing/clicking the SMS+email. Consider tweaking the SMS copy or sending earlier in the day.</p>}
          {openRate >= 50 && openToUploadRate < 60 && <p>⚠ <strong>{openToUploadRate}% upload rate among openers</strong> — they're seeing the page but not finishing. The upload UX or "Don't have it yet" fallback may need work.</p>}
          {openRate >= 80 && uploadRate >= 60 && <p>✓ Funnel is healthy. Keep doing what you're doing.</p>}
        </div>
      </CardContent>
    </Card>
  );
};

export default LabOrderFunnelCard;
