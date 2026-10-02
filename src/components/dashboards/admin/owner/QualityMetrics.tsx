/**
 * OWNER › QUALITY — measured draw + delivery numbers (owner/super_admin).
 *
 * Everything here comes from two security-definer RPCs in
 * DRAFT_20261003_draw_outcome_tracking.sql, both scoped to visits dated on or
 * after `system_settings.quality_metrics_since` (seeded 2026-10-03):
 *   • get_quality_metrics()  — draw success (first-stick / overall) over visits
 *     with a recorded outcome, median + p90 draw time (collection_at −
 *     start_time), delivery coverage, samples lost, overrides, redraws.
 *   • get_delivery_gaps()    — lab-bound visits that are collected/closed with
 *     NO specimen_deliveries row. Each row can be fixed through the real
 *     specimen-delivery flow (SpecimenDeliveryModal → canonical ledger row)
 *     or closed with an admin override + reason (delivery_gate_overrides).
 *
 * Nothing is back-filled: pre-baseline visits are invisible here on purpose,
 * so every number starts at 0 and is provable.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, RefreshCw, Package, Droplets, Timer, AlertTriangle, Repeat, FileWarning, ClipboardCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { formatAppointmentDate } from '@/lib/appointmentDate';
import { serviceTypeLabel } from '@/components/dashboards/admin/enhanced/scheduleShared';
import SpecimenDeliveryModal from '@/components/phleb-dashboard/schedule/SpecimenDeliveryModal';
import { DRAW_OUTCOME_LABELS, QUALITY_TRACKING_FALLBACK_SINCE } from '@/lib/phlebHelpers';
import {
  SectionHeader, SectionTitle, KpiTile, Pill, LaneHeader, LoadingRows, LoadingTiles, EmptyState, ErrorBanner,
  Th, ThActions, TdActions, rowKeyHandler, Field, DetailDrawer, fmtInt,
} from './sectionUi';

type Metrics = {
  since: string;
  visits_in_window: number;
  outcome_n: number;
  first_stick: number;
  second_stick: number;
  partial: number;
  unsuccessful: number;
  first_stick_rate: number | null;
  overall_success_rate: number | null;
  draw_time_n: number;
  draw_time_median_min: number | null;
  draw_time_p90_min: number | null;
  lab_bound_closed: number;
  delivered_count: number;
  delivery_coverage: number | null;
  samples_lost: number;
  overrides: number;
  delivery_pending: number;
  redraws: number;
  redraws_completed: number;
  advertisable: boolean;
};

type Gap = {
  appointment_id: string;
  appointment_date: string;
  appointment_time: string | null;
  status: string;
  service_type: string | null;
  patient_name: string | null;
  patient_id: string | null;
  patient_phone: string | null;
  patient_email: string | null;
  phlebotomist_id: string | null;
  lab_destination: string | null;
  collection_at: string | null;
  completion_time: string | null;
  draw_outcome: string | null;
  overridden: boolean;
  pending_6h: boolean;
};

const ADVERTISE_MIN_N = 200;

const pct = (v: number | null | undefined) => (v == null ? '—' : `${Number(v).toFixed(1)}%`);
const mins = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(Number(v))} min`);
const sinceLabel = (iso: string) => {
  const d = new Date(`${(iso || QUALITY_TRACKING_FALLBACK_SINCE).slice(0, 10)}T12:00:00`);
  return isNaN(d.getTime()) ? 'Oct 3, 2026' : format(d, 'MMM d, yyyy');
};

const STATUS_PILL: Record<string, { cls: string; dot: string }> = {
  in_progress: { cls: 'bg-purple-100 text-purple-800 border-purple-200', dot: 'bg-purple-500' },
  specimen_delivered: { cls: 'bg-indigo-100 text-indigo-800 border-indigo-200', dot: 'bg-indigo-500' },
  completed: { cls: 'bg-gray-100 text-gray-700 border-gray-200', dot: 'bg-gray-400' },
};

const QualityMetrics: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [selected, setSelected] = useState<Gap | null>(null);
  const [deliveryFor, setDeliveryFor] = useState<Gap | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overriding, setOverriding] = useState(false);

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [m, g] = await Promise.all([
        (supabase as any).rpc('get_quality_metrics'),
        (supabase as any).rpc('get_delivery_gaps'),
      ]);
      if (m.error) throw new Error(`get_quality_metrics: ${m.error.message}`);
      if (g.error) throw new Error(`get_delivery_gaps: ${g.error.message}`);
      setMetrics((m.data || null) as Metrics | null);
      setGaps(((g.data || []) as Gap[]));
      setUpdatedAt(new Date());
    } catch (e: any) {
      setError(e?.message || 'Failed to load quality metrics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const since = sinceLabel(metrics?.since || QUALITY_TRACKING_FALLBACK_SINCE);
  const outcomeN = metrics?.outcome_n ?? 0;
  const advertisable = !!metrics?.advertisable;
  const pendingGaps = useMemo(() => gaps.filter(g => g.pending_6h && !g.overridden), [gaps]);
  const otherGaps = useMemo(() => gaps.filter(g => !(g.pending_6h && !g.overridden)), [gaps]);

  const closeDrawer = useCallback(() => { setSelected(null); setOverrideReason(''); }, []);

  const submitOverride = async () => {
    if (!selected) return;
    const reason = overrideReason.trim();
    if (reason.length < 5) { toast.error('Give a reason (at least 5 characters)'); return; }
    setOverriding(true);
    try {
      const { error: rpcErr } = await (supabase as any).rpc('admin_override_delivery_gate', {
        p_appointment_id: selected.appointment_id,
        p_reason: reason,
        p_target_status: 'completed',
      });
      if (rpcErr) throw rpcErr;
      toast.success('Override logged — visit marked completed without a delivery record');
      closeDrawer();
      fetchAll();
    } catch (e: any) {
      toast.error(e?.message || 'Override failed');
    } finally {
      setOverriding(false);
    }
  };

  const missingMigration = !!error && /could not find the function|does not exist|404/i.test(error);

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={ShieldCheck}
        title="Quality"
        subtitle={<>Measured draw and delivery numbers · <span className="font-medium text-gray-700">Tracking since {since}</span>{updatedAt && <> · updated {formatDistanceToNowStrict(updatedAt, { addSuffix: true })}</>}</>}
        actions={
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={fetchAll} disabled={refreshing}>
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} aria-hidden="true" /> Refresh
          </Button>
        }
      />

      {error && (
        <ErrorBanner
          title={missingMigration ? 'Quality RPCs not installed yet' : 'Could not load quality metrics'}
          message={missingMigration ? `${error} — apply supabase/migrations/DRAFT_20261003_draw_outcome_tracking.sql first.` : error}
          onRetry={fetchAll}
        />
      )}

      {/* Advertising readiness */}
      {!loading && !error && (
        <Card className={cn('border', advertisable ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50')}>
          <CardContent className="p-3 flex items-start gap-2 text-sm">
            {advertisable ? <ClipboardCheck className="h-4 w-4 text-emerald-700 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />}
            <div>
              <p className={cn('font-semibold', advertisable ? 'text-emerald-800' : 'text-amber-800')}>
                {advertisable ? 'Enough data to advertise' : 'Not enough data to advertise yet'}
              </p>
              <p className={cn('text-xs mt-0.5', advertisable ? 'text-emerald-700' : 'text-amber-700')}>
                {fmtInt(outcomeN)} of {ADVERTISE_MIN_N} recorded draw outcomes since {since}. Rates below are real but small-sample until then.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Draw quality */}
      <section aria-labelledby="q-draw">
        <SectionTitle id="q-draw" hint={`N = ${fmtInt(outcomeN)} visits with a recorded outcome`}>Draw success</SectionTitle>
        {loading ? <LoadingTiles n={4} /> : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <KpiTile label="First-stick success" value={pct(metrics?.first_stick_rate)} hint={`${fmtInt(metrics?.first_stick ?? 0)} of ${fmtInt(outcomeN)}`} tone="green" icon={Droplets} />
            <KpiTile label="Overall success" value={pct(metrics?.overall_success_rate)} hint={`+${fmtInt(metrics?.second_stick ?? 0)} on second stick`} tone="brand" icon={Droplets} />
            <KpiTile label="Median draw time" value={mins(metrics?.draw_time_median_min)} hint={`start → collected · n=${fmtInt(metrics?.draw_time_n ?? 0)}`} icon={Timer} />
            <KpiTile label="p90 draw time" value={mins(metrics?.draw_time_p90_min)} hint="9 in 10 draws finish within" icon={Timer} />
          </div>
        )}
        {!loading && metrics && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Pill className="bg-emerald-50 text-emerald-800 border-emerald-200" dot="bg-emerald-500">{DRAW_OUTCOME_LABELS.success_first_stick} · {fmtInt(metrics.first_stick)}</Pill>
            <Pill className="bg-amber-50 text-amber-800 border-amber-200" dot="bg-amber-500">{DRAW_OUTCOME_LABELS.success_after_second_stick} · {fmtInt(metrics.second_stick)}</Pill>
            <Pill className="bg-orange-50 text-orange-800 border-orange-200" dot="bg-orange-500">{DRAW_OUTCOME_LABELS.partial} · {fmtInt(metrics.partial)}</Pill>
            <Pill className="bg-red-50 text-red-800 border-red-200" dot="bg-red-500">{DRAW_OUTCOME_LABELS.unsuccessful} · {fmtInt(metrics.unsuccessful)}</Pill>
          </div>
        )}
      </section>

      {/* Delivery */}
      <section aria-labelledby="q-delivery">
        <SectionTitle id="q-delivery" hint="lab-bound visits only">Every sample delivered</SectionTitle>
        {loading ? <LoadingTiles n={4} /> : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <KpiTile label="Delivery coverage" value={pct(metrics?.delivery_coverage)} hint={`${fmtInt(metrics?.delivered_count ?? 0)} of ${fmtInt(metrics?.lab_bound_closed ?? 0)} closed visits`} tone="green" icon={Package} />
            <KpiTile label="Samples lost" value={fmtInt(metrics?.samples_lost ?? 0)} hint={`closed with no delivery record · ${fmtInt(metrics?.overrides ?? 0)} overridden`} tone={(metrics?.samples_lost ?? 0) > 0 ? 'red' : 'default'} icon={FileWarning} />
            <KpiTile label="Delivery pending" value={fmtInt(metrics?.delivery_pending ?? 0)} hint="no record after 6 hours" tone={(metrics?.delivery_pending ?? 0) > 0 ? 'amber' : 'default'} icon={AlertTriangle} />
            <KpiTile label="Free redraws" value={fmtInt(metrics?.redraws ?? 0)} hint={`${fmtInt(metrics?.redraws_completed ?? 0)} completed · ${fmtInt(metrics?.unsuccessful ?? 0)} unsuccessful draws`} icon={Repeat} />
          </div>
        )}
      </section>

      {/* Gap list */}
      <section aria-labelledby="q-gaps">
        <LaneHeader id="q-gaps" title="Delivery gaps" count={gaps.length} tone={pendingGaps.length > 0 ? 'red' : 'gray'} />
        {loading ? <LoadingRows rows={3} /> : gaps.length === 0 ? (
          <EmptyState icon={Package} title="No delivery gaps" hint={`Every lab-bound visit collected since ${since} has a delivery record.`} />
        ) : (
          <>
            <GapRows rows={[...pendingGaps, ...otherGaps]} onOpen={setSelected} onDeliver={setDeliveryFor} />
          </>
        )}
      </section>

      <p className="text-[11px] text-gray-400 leading-relaxed">
        Definitions — first-stick / overall success: share of visits with a recorded outcome (overall = first or second stick; partial and
        unsuccessful are not successes). Draw time: collection stamp minus "Start draw", 0–4h window. Delivery coverage: closed lab-bound
        visits with a specimen delivery record. Samples lost: closed lab-bound visits without one. Lab-bound excludes in-office, partner
        sites, therapeutic, specialty kits, invoices and test bookings. Nothing before {since} is counted and nothing is back-filled.
      </p>

      {selected && (
        <DetailDrawer
          eyebrow={selected.overridden ? 'Delivery gap · overridden' : 'Delivery gap'}
          title={selected.patient_name || 'Patient'}
          titleExtra={<><Pill className={cn('border', (STATUS_PILL[selected.status] || STATUS_PILL.completed).cls)} dot={(STATUS_PILL[selected.status] || STATUS_PILL.completed).dot}>{selected.status.replace(/_/g, ' ')}</Pill>{selected.pending_6h && !selected.overridden && <Pill className="bg-red-100 text-red-800 border-red-200" dot="bg-red-500">pending &gt; 6h</Pill>}</>}
          onClose={closeDrawer}
          footer={`Appointment ${selected.appointment_id}`}
        >
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <Field label="Visit">{formatAppointmentDate(selected.appointment_date)}{selected.appointment_time ? ` · ${selected.appointment_time.slice(0, 5)}` : ''}</Field>
            <Field label="Service">{serviceTypeLabel(selected.service_type || '')}</Field>
            <Field label="Lab">{selected.lab_destination || '—'}</Field>
            <Field label="Collected">{selected.collection_at ? format(new Date(selected.collection_at), 'MMM d, h:mm a') : '—'}</Field>
            <Field label="Outcome">{selected.draw_outcome ? (DRAW_OUTCOME_LABELS as any)[selected.draw_outcome] || selected.draw_outcome : 'not recorded'}</Field>
          </div>

          <div className="rounded-lg border border-gray-200 p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-700">Fix it the right way</p>
            <p className="text-xs text-gray-500">Log the actual lab drop-off. This writes the canonical delivery record and closes the gap.</p>
            <Button className="w-full h-10 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-2" onClick={() => { setDeliveryFor(selected); closeDrawer(); }}>
              <Package className="h-4 w-4" /> Add delivery record
            </Button>
          </div>

          {selected.status !== 'completed' && !selected.overridden && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-800">Override (counts against you)</p>
              <p className="text-xs text-amber-700">Marks the visit completed with no delivery record. The reason is logged to delivery_gate_overrides and shows on this page.</p>
              <Textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} rows={2} placeholder="Why is there no delivery record? (e.g. patient kept sample for own courier)" className="bg-white text-sm" />
              <Button variant="outline" className="w-full h-10 border-amber-300 text-amber-900 hover:bg-amber-100" disabled={overriding || overrideReason.trim().length < 5} onClick={submitOverride}>
                {overriding ? 'Logging…' : 'Override with reason'}
              </Button>
            </div>
          )}
        </DetailDrawer>
      )}

      {deliveryFor && (
        <SpecimenDeliveryModal
          open
          onClose={() => setDeliveryFor(null)}
          appointmentId={deliveryFor.appointment_id}
          patientId={deliveryFor.patient_id}
          patientName={deliveryFor.patient_name || 'Patient'}
          patientPhone={deliveryFor.patient_phone}
          patientEmail={deliveryFor.patient_email}
          serviceType={deliveryFor.service_type || ''}
          onDelivered={() => { setDeliveryFor(null); fetchAll(); }}
        />
      )}
    </div>
  );
};

const GapRows: React.FC<{ rows: Gap[]; onOpen: (g: Gap) => void; onDeliver: (g: Gap) => void }> = ({ rows, onOpen, onDeliver }) => (
  <>
    {/* Mobile cards */}
    <div className="sm:hidden space-y-1.5">
      {rows.map(g => {
        const sp = STATUS_PILL[g.status] || STATUS_PILL.completed;
        return (
          <Card key={g.appointment_id} className="shadow-sm cursor-pointer" onClick={() => onOpen(g)} role="button" tabIndex={0} onKeyDown={rowKeyHandler(() => onOpen(g))}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900 truncate">{g.patient_name || 'Patient'}</p>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {g.overridden ? <Pill className="bg-amber-100 text-amber-800 border-amber-200">overridden</Pill>
                    : g.pending_6h ? <Pill className="bg-red-100 text-red-800 border-red-200" dot="bg-red-500">pending</Pill> : null}
                  <Pill className={sp.cls} dot={sp.dot}>{g.status.replace(/_/g, ' ')}</Pill>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{formatAppointmentDate(g.appointment_date)} · {serviceTypeLabel(g.service_type || '')} · {g.lab_destination || 'lab TBD'}</p>
              <Button size="sm" variant="outline" className="mt-2 h-9 text-xs gap-1.5 w-full" onClick={(e) => { e.stopPropagation(); onDeliver(g); }}>
                <Package className="h-3.5 w-3.5" /> Add delivery record
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
    {/* Desktop table */}
    <Card className="hidden sm:block shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr><Th>Patient</Th><Th>Visit</Th><Th>Service</Th><Th>Lab</Th><Th>Collected</Th><Th>Status</Th><ThActions /></tr>
          </thead>
          <tbody>
            {rows.map(g => {
              const sp = STATUS_PILL[g.status] || STATUS_PILL.completed;
              return (
                <tr key={g.appointment_id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => onOpen(g)} tabIndex={0} onKeyDown={rowKeyHandler(() => onOpen(g))}>
                  <td className="py-2 px-3 font-medium text-gray-900">{g.patient_name || 'Patient'}</td>
                  <td className="py-2 px-3 text-gray-700 whitespace-nowrap">{formatAppointmentDate(g.appointment_date)}{g.appointment_time ? ` · ${g.appointment_time.slice(0, 5)}` : ''}</td>
                  <td className="py-2 px-3 text-gray-700">{serviceTypeLabel(g.service_type || '')}</td>
                  <td className="py-2 px-3 text-gray-700">{g.lab_destination || '—'}</td>
                  <td className="py-2 px-3 text-gray-700 whitespace-nowrap">{g.collection_at ? format(new Date(g.collection_at), 'MMM d, h:mm a') : '—'}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      <Pill className={sp.cls} dot={sp.dot}>{g.status.replace(/_/g, ' ')}</Pill>
                      {g.overridden ? <Pill className="bg-amber-100 text-amber-800 border-amber-200">overridden</Pill>
                        : g.pending_6h ? <Pill className="bg-red-100 text-red-800 border-red-200" dot="bg-red-500">pending &gt; 6h</Pill> : null}
                    </div>
                  </td>
                  <TdActions>
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={(e) => { e.stopPropagation(); onDeliver(g); }}>
                      <Package className="h-3.5 w-3.5" /> Add delivery record
                    </Button>
                  </TdActions>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  </>
);

export default QualityMetrics;
