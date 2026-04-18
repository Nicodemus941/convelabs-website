import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardCheck, Loader2, FlaskConical, FileText, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * DATA HEALTH CARD — operational gap visibility for the owner.
 *
 * Shows what percentage of mobile bookings in the last 30 days are missing
 * critical pre-visit data (lab destination, lab order file, insurance card).
 *
 * Hormozi principle: "If you can't see the leak, you can't plug it." Before
 * this card existed, we had 0% destination capture and didn't know. This
 * turns an invisible problem into a boardroom-visible metric.
 */

interface Stat {
  total: number;
  missing: number;
}

const fmtPct = (s: Stat): string => {
  if (!s.total) return '—';
  return `${((s.missing / s.total) * 100).toFixed(0)}%`;
};

const barColor = (s: Stat): string => {
  if (!s.total) return 'bg-gray-200';
  const pct = (s.missing / s.total) * 100;
  if (pct >= 30) return 'bg-red-500';
  if (pct >= 10) return 'bg-amber-500';
  return 'bg-emerald-500';
};

const DataHealthCard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [destination, setDestination] = useState<Stat>({ total: 0, missing: 0 });
  const [labOrder, setLabOrder] = useState<Stat>({ total: 0, missing: 0 });
  const [insurance, setInsurance] = useState<Stat>({ total: 0, missing: 0 });

  useEffect(() => {
    (async () => {
      try {
        // Last 30 days, mobile-equivalent services (excludes in-office / partner)
        const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
        const MOBILE_SERVICE_TYPES = ['mobile', 'senior', 'therapeutic', 'specialty-kit', 'specialty-kit-genova'];

        const { data: rows, error } = await supabase
          .from('appointments')
          .select('id, service_type, lab_destination, lab_order_file_path, insurance_card_path')
          .gte('created_at', cutoff)
          .in('service_type', MOBILE_SERVICE_TYPES);

        if (error || !rows) {
          console.warn('[data-health] query failed', error);
          setLoading(false);
          return;
        }

        const total = rows.length;
        const missingDest = rows.filter(r => !r.lab_destination).length;
        const missingFile = rows.filter(r => !r.lab_order_file_path).length;
        const missingIns = rows.filter(r => !r.insurance_card_path).length;

        setDestination({ total, missing: missingDest });
        setLabOrder({ total, missing: missingFile });
        setInsurance({ total, missing: missingIns });
      } catch (e) {
        console.warn('[data-health] exception', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rows = [
    { label: 'Lab destination', stat: destination, icon: FlaskConical },
    { label: 'Lab order file', stat: labOrder, icon: FileText },
    { label: 'Insurance card', stat: insurance, icon: Shield },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-emerald-600" />
          Data Health (last 30 days, mobile)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : destination.total === 0 ? (
          <p className="text-sm text-gray-500">No mobile bookings in the last 30 days.</p>
        ) : (
          <div className="space-y-3">
            {rows.map(({ label, stat, icon: Icon }) => (
              <div key={label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-gray-500" />
                    <span className="text-gray-700">{label}</span>
                  </div>
                  <span className="font-semibold text-gray-900 tabular-nums">
                    {stat.missing}/{stat.total} missing · {fmtPct(stat)}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${barColor(stat)}`}
                    style={{ width: stat.total ? `${(stat.missing / stat.total) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
            <p className="text-[11px] text-gray-500 pt-2 leading-relaxed">
              Target: under 10% missing for each. Above 30% means the booking flow or admin
              retroactive-attach workflow needs a closer look.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DataHealthCard;
