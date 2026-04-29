/**
 * DeliveriesTab — past completed specimen deliveries.
 *
 * Lists every appointment where a specimen has been confirmed-delivered
 * (delivered_at IS NOT NULL OR specimens_delivered_at IS NOT NULL OR
 * status = 'specimen_delivered' / 'completed' with a lab_destination set),
 * grouped by date, with the destination + tracking + signature surfaced
 * for quick reference.
 *
 * Phleb uses this to:
 *   • Verify what they delivered last Tuesday when admin asks
 *   • Re-pull a tracking number / signature image for a chargeback dispute
 *   • Spot-check the past week of routing accuracy (LabCorp vs Quest mix)
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Truck, MapPin, Clock, CheckCircle2, Search, FileSignature } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface DeliveryRow {
  id: string;
  appointment_date: string;
  appointment_time: string | null;
  patient_name: string | null;
  lab_destination: string | null;
  specimen_lab_name: string | null;
  // Stored as JSONB { lat, lng, accuracy } by SpecimenDeliveryModal.
  // Legacy rows may contain a plain string address. Handle both.
  delivery_location: string | { lat: number; lng: number; accuracy?: number } | null;
  specimen_tracking_id: string | null;
  delivered_at: string | null;
  specimens_delivered_at: string | null;
  collection_at: string | null;
  delivery_signature_path: string | null;
  status: string | null;
  organization_id: string | null;
}

const DeliveriesTab: React.FC = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [signatureUrls, setSignatureUrls] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!user) return;
    (async () => {
      setIsLoading(true);
      try {
        const isPhlebRole = user.role === 'phlebotomist';
        let query = supabase
          .from('appointments')
          .select('id, appointment_date, appointment_time, patient_name, lab_destination, specimen_lab_name, delivery_location, specimen_tracking_id, delivered_at, specimens_delivered_at, collection_at, delivery_signature_path, status, organization_id, phlebotomist_id')
          .or('delivered_at.not.is.null,specimens_delivered_at.not.is.null,status.in.(specimen_delivered,completed)')
          .order('appointment_date', { ascending: false })
          .order('appointment_time', { ascending: false })
          .limit(500);

        // Phlebs only see their own; admins see all
        if (isPhlebRole) {
          query = query.eq('phlebotomist_id', user.id);
        }

        const { data, error } = await query;
        if (error) throw error;
        setRows((data || []) as DeliveryRow[]);
      } catch (err) {
        console.warn('[deliveries] load failed:', err);
        setRows([]);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      (r.patient_name || '').toLowerCase().includes(q) ||
      (r.lab_destination || '').toLowerCase().includes(q) ||
      (r.specimen_lab_name || '').toLowerCase().includes(q) ||
      (r.specimen_tracking_id || '').toLowerCase().includes(q) ||
      (r.appointment_date || '').includes(q)
    );
  }, [rows, search]);

  // Group by appointment_date for visual scanning
  const grouped = useMemo(() => {
    const map = new Map<string, DeliveryRow[]>();
    for (const r of filtered) {
      const dateKey = (r.appointment_date || '').slice(0, 10);
      const list = map.get(dateKey) || [];
      list.push(r);
      map.set(dateKey, list);
    }
    return Array.from(map.entries()); // already sorted desc from query
  }, [filtered]);

  const fetchSignatureUrl = async (path: string) => {
    if (signatureUrls.has(path)) return signatureUrls.get(path)!;
    try {
      const { data } = await supabase.storage.from('signatures').createSignedUrl(path, 600);
      if (data?.signedUrl) {
        setSignatureUrls(prev => new Map(prev).set(path, data.signedUrl));
        return data.signedUrl;
      }
    } catch { /* noop */ }
    return null;
  };

  const isFullyDelivered = (r: DeliveryRow) =>
    !!(r.delivered_at || r.specimens_delivered_at || r.status === 'specimen_delivered' || r.status === 'completed');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Truck className="h-5 w-5 text-[#B91C1C]" />
        <h2 className="text-lg font-bold">Specimen Deliveries</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        Past completed deliveries — most recent first. Tap any row for full details.
      </p>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search patient, lab, tracking #…"
          className="pl-9"
        />
      </div>

      {isLoading && (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading deliveries…</div>
      )}

      {!isLoading && grouped.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed p-8 text-center">
          <Truck className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-800 mb-1">No deliveries yet</h3>
          <p className="text-sm text-muted-foreground">
            Completed specimen drop-offs will show up here for quick reference.
          </p>
        </div>
      )}

      {!isLoading && grouped.map(([dateKey, dayRows]) => (
        <div key={dateKey} className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 px-1 mt-3">
            {(() => {
              try {
                return format(new Date(dateKey + 'T12:00:00'), 'EEEE, MMM d, yyyy');
              } catch { return dateKey; }
            })()}
            <span className="font-normal text-gray-400 ml-2">
              · {dayRows.length} {dayRows.length === 1 ? 'delivery' : 'deliveries'}
            </span>
          </p>
          {dayRows.map(r => {
            const labLabel = r.specimen_lab_name || r.lab_destination || 'Unknown lab';
            const deliveredAt = r.specimens_delivered_at || r.delivered_at;
            const isDelivered = isFullyDelivered(r);
            return (
              <Card key={r.id} className="shadow-sm">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{r.patient_name || 'Unknown patient'}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        {r.appointment_time || '—'}
                      </p>
                    </div>
                    {isDelivered ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Delivered
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-700 border-amber-300">Pending</Badge>
                    )}
                  </div>

                  <div className="flex items-start gap-2 text-xs text-gray-700 bg-gray-50 rounded-md p-2 border border-gray-100">
                    <MapPin className="h-3.5 w-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{labLabel}</p>
                      {r.delivery_location && (
                        <p className="text-gray-500 text-[11px] mt-0.5 truncate">
                          {typeof r.delivery_location === 'string'
                            ? r.delivery_location
                            : `${r.delivery_location.lat.toFixed(5)}, ${r.delivery_location.lng.toFixed(5)}${r.delivery_location.accuracy ? ` · ±${Math.round(r.delivery_location.accuracy)}m` : ''}`}
                        </p>
                      )}
                      {r.specimen_tracking_id && (
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Tracking: <span className="font-mono">{r.specimen_tracking_id}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      {deliveredAt
                        ? `Drop: ${format(new Date(deliveredAt), 'h:mm a')}`
                        : (r.collection_at ? `Collected: ${format(new Date(r.collection_at), 'h:mm a')}` : 'No timestamp')}
                    </span>
                    {r.delivery_signature_path && (
                      <button
                        type="button"
                        onClick={async () => {
                          const url = await fetchSignatureUrl(r.delivery_signature_path!);
                          if (url) window.open(url, '_blank');
                        }}
                        className="inline-flex items-center gap-1 text-[#B91C1C] hover:underline"
                      >
                        <FileSignature className="h-3 w-3" /> View signature
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default DeliveriesTab;
