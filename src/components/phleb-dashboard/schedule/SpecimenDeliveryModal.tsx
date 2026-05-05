/**
 * SpecimenDeliveryModal — multi-patient, auto-saving, HIPAA-safe.
 *
 * Use case: a phleb who drew blood for a primary patient + companions
 * (linked via family_group_id) needs to log ONE specimen-tracking ID per
 * patient, send each patient's data to ONLY that patient's referring
 * organization, and not lose any of it if the PWA navigates away mid-typing.
 *
 * Key behaviors:
 *   • On open, fetches ALL appointments in the family_group (or just the
 *     one if no group), shows each as its own row with its own controls.
 *   • Auto-saves on every keystroke (600ms debounce) directly to the
 *     specific appointment row — close + reopen restores everything.
 *   • Per-row "Confirm delivered" stamps THAT row's specimens_delivered_at
 *     and fires send-specimen-delivery-notification for THAT appointmentId
 *     only — the edge fn already scopes recipients by appointment.org_id,
 *     so a companion routed to a different org never leaks the primary
 *     patient's data and vice versa.
 *   • "Confirm all delivered" sweeps unconfirmed rows with one click.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Loader2, Send, MapPin, Check, Users, Building2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import SignaturePad, { type SignaturePadHandle } from './SignaturePad';
import TubeConfirmation from './TubeConfirmation';

const LABS = [
  { value: 'labcorp', label: 'LabCorp' },
  { value: 'quest', label: 'Quest Diagnostics' },
  { value: 'adventhealth', label: 'AdventHealth' },
  { value: 'orlando_health', label: 'Orlando Health' },
  { value: 'ups', label: 'UPS (Shipping)' },
  { value: 'fedex', label: 'FedEx (Shipping)' },
  { value: 'rupa_health', label: 'Rupa Health' },
  { value: 'other', label: 'Other' },
];

interface SpecimenDeliveryModalProps {
  open: boolean;
  onClose: () => void;
  appointmentId: string;
  patientId: string | null;
  patientName: string;
  patientPhone: string | null;
  patientEmail: string | null;
  serviceType: string;
  onDelivered: () => void;
}

interface RowState {
  // From DB
  appointmentId: string;
  /**
   * If set, this row represents a single appointment_lab_orders row on the
   * anchor appointment (the "one appointment, multiple lab orders for
   * different patients" case — e.g. delivering specimens for 3 family
   * members under a single booking). Persistence writes to
   * appointment_lab_orders, not the appointments table.
   */
  labOrderId: string | null;
  patientId: string | null;
  patientName: string;
  patientPhone: string | null;
  patientEmail: string | null;
  serviceType: string;
  organizationId: string | null;
  organizationName: string | null;
  companionRole: string | null;
  alreadyDelivered: boolean;
  // Editable
  specimenId: string;
  labName: string;
  tubeCount: string;
  tubeTypes: string;
  deliveryNotes: string;
  // Local UX flags
  saving: boolean;
  confirming: boolean;
}

/**
 * Derive a human patient name from a lab-order filename. Sanitize-edge-fn
 * renames originals to `laborder_<unixms>_<safe_original_basename>.pdf`.
 * Strip prefix + extension + replace underscores → spaces and Title Case.
 * Handles legacy unrenamed files too (just strips extension).
 */
function patientNameFromFilename(name: string | null | undefined): string {
  if (!name) return 'Patient';
  let s = name.replace(/\.[^.]+$/, '');
  s = s.replace(/^laborder_\d+_/, '');
  s = s.replace(/[_]+/g, ' ').replace(/,\s*/g, ', ').trim();
  if (!s) return 'Patient';
  // Title-case each word
  return s.split(/\s+/).map(w => w.length > 1 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()).join(' ');
}

const SpecimenDeliveryModal: React.FC<SpecimenDeliveryModalProps> = ({
  open, onClose, appointmentId, onDelivered,
}) => {
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingAll, setConfirmingAll] = useState(false);

  // Chain-of-custody (per modal session)
  const signatureRef = useRef<SignaturePadHandle>(null);
  const [geoCapturing, setGeoCapturing] = useState(false);
  const [geoStamp, setGeoStamp] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);

  // Debounce timers per row (key: appointmentId)
  const saveTimers = useRef<Record<string, any>>({});

  /** Map a lab `value` to its canonical label */
  const labLabel = (v: string) => LABS.find(l => l.value === v)?.label || v;

  /**
   * localStorage draft layer — defensive fallback so PWA tab-suspend or
   * service-worker refresh can't lose in-flight keystrokes. Keyed per row;
   * cleared on successful confirmRow. On loadRows() we merge any cached
   * draft OVER the DB-loaded value so unsaved entries always win.
   */
  const draftKey = (rk: string) => `specimen-draft:${rk}`;
  const writeDraft = (rk: string, row: RowState) => {
    try {
      localStorage.setItem(draftKey(rk), JSON.stringify({
        specimenId: row.specimenId,
        labName: row.labName,
        tubeCount: row.tubeCount,
        tubeTypes: row.tubeTypes,
        deliveryNotes: row.deliveryNotes,
        ts: Date.now(),
      }));
    } catch { /* localStorage might be full or disabled — non-critical */ }
  };
  const readDraft = (rk: string): Partial<RowState> | null => {
    try {
      const raw = localStorage.getItem(draftKey(rk));
      if (!raw) return null;
      const d = JSON.parse(raw);
      // Treat drafts older than 12 hours as stale (typical phleb shift)
      if (typeof d?.ts === 'number' && Date.now() - d.ts > 12 * 60 * 60 * 1000) {
        localStorage.removeItem(draftKey(rk));
        return null;
      }
      return d;
    } catch { return null; }
  };
  const clearDraft = (rk: string) => { try { localStorage.removeItem(draftKey(rk)); } catch { /* */ } };

  /** Pull every appointment in the family group (or just the one if not in a group) */
  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data: anchor, error: anchorErr } = await supabase
        .from('appointments')
        .select(`
          id, patient_id, patient_name, patient_phone, patient_email,
          service_type, organization_id, family_group_id, companion_role,
          specimen_tracking_id, specimen_lab_name, specimens_delivered_at, delivered_at
        `)
        .eq('id', appointmentId)
        .maybeSingle();
      if (anchorErr || !anchor) throw anchorErr || new Error('Appointment not found');

      let siblings: any[] = [anchor];
      if ((anchor as any).family_group_id) {
        const { data: group } = await supabase
          .from('appointments')
          .select(`
            id, patient_id, patient_name, patient_phone, patient_email,
            service_type, organization_id, family_group_id, companion_role,
            specimen_tracking_id, specimen_lab_name, specimens_delivered_at, delivered_at
          `)
          .eq('family_group_id', (anchor as any).family_group_id)
          .neq('status', 'cancelled')
          // Anchor first, then companions
          .order('companion_role', { ascending: true, nullsFirst: true });
        if (group && group.length > 0) siblings = group;
      }

      // Fetch each org's name in one call
      const orgIds = Array.from(new Set(siblings.map(s => s.organization_id).filter(Boolean))) as string[];
      const orgNameMap = new Map<string, string>();
      if (orgIds.length > 0) {
        const { data: orgs } = await supabase.from('organizations').select('id, name').in('id', orgIds);
        for (const o of (orgs || [])) orgNameMap.set((o as any).id, (o as any).name);
      }

      // Per-lab-order branch — single appointment with multiple lab orders
      // for different patients (e.g. one head-of-household books and uploads
      // 3 family members' lab orders). Use lab-order rows as the unit instead
      // of sibling appointment rows.
      let labOrders: any[] = [];
      if (siblings.length === 1 && !(anchor as any).family_group_id) {
        const { data: lo } = await supabase
          .from('appointment_lab_orders')
          .select('id, original_filename, ocr_patient_name, org_match_organization_id, delivery_specimen_id, delivery_lab_name, delivery_tube_count, delivery_tube_types, delivered_at')
          .eq('appointment_id', appointmentId)
          .is('deleted_at', null)
          .order('uploaded_at', { ascending: true });
        if (lo && lo.length >= 2) {
          labOrders = lo;
          // Pull org names for any per-lab-order org assignments not in the
          // sibling-derived map already
          const extraOrgIds = Array.from(new Set(lo.map((l: any) => l.org_match_organization_id).filter(Boolean))) as string[];
          const missing = extraOrgIds.filter(id => !orgNameMap.has(id));
          if (missing.length > 0) {
            const { data: orgs2 } = await supabase.from('organizations').select('id, name').in('id', missing);
            for (const o of (orgs2 || [])) orgNameMap.set((o as any).id, (o as any).name);
          }
        }
      }

      let next: RowState[];
      if (labOrders.length >= 2) {
        // Per-lab-order rows, one per patient on the booking
        next = labOrders.map((lo: any) => {
          const matchLab = LABS.find(l => l.label.toLowerCase() === String(lo.delivery_lab_name || '').toLowerCase());
          const orgId = lo.org_match_organization_id || (anchor as any).organization_id || null;
          return {
            appointmentId: (anchor as any).id,
            labOrderId: lo.id as string,
            patientId: (anchor as any).patient_id,
            patientName: lo.ocr_patient_name || patientNameFromFilename(lo.original_filename),
            patientPhone: (anchor as any).patient_phone,
            patientEmail: (anchor as any).patient_email,
            serviceType: (anchor as any).service_type || '',
            organizationId: orgId,
            organizationName: orgId ? (orgNameMap.get(orgId) || null) : null,
            companionRole: null,
            alreadyDelivered: !!lo.delivered_at,
            specimenId: lo.delivery_specimen_id || '',
            labName: matchLab ? matchLab.value : (lo.delivery_lab_name ? 'other' : ''),
            tubeCount: lo.delivery_tube_count ? String(lo.delivery_tube_count) : '1',
            tubeTypes: lo.delivery_tube_types || '',
            deliveryNotes: '',
            saving: false,
            confirming: false,
          };
        });
      } else {
        next = siblings.map((a: any) => {
          // Try to map any saved specimen_lab_name back to a lab `value`
          const matchLab = LABS.find(l => l.label.toLowerCase() === String(a.specimen_lab_name || '').toLowerCase());
          return {
            appointmentId: a.id,
            labOrderId: null,
            patientId: a.patient_id,
            patientName: a.patient_name || 'Patient',
            patientPhone: a.patient_phone,
            patientEmail: a.patient_email,
            serviceType: a.service_type || '',
            organizationId: a.organization_id || null,
            organizationName: a.organization_id ? (orgNameMap.get(a.organization_id) || null) : null,
            companionRole: a.companion_role || null,
            alreadyDelivered: !!(a.specimens_delivered_at || a.delivered_at),
            specimenId: a.specimen_tracking_id || '',
            labName: matchLab ? matchLab.value : (a.specimen_lab_name ? 'other' : ''),
            tubeCount: '1',
            tubeTypes: '',
            deliveryNotes: '',
            saving: false,
            confirming: false,
          };
        });
      }
      // Merge any localStorage drafts OVER the DB-loaded values. This guards
      // against the PWA losing in-flight keystrokes that hadn't yet hit the
      // 600ms debounced save when the tab suspended or refreshed.
      next = next.map(r => {
        const rk = r.labOrderId || r.appointmentId;
        const d = readDraft(rk);
        if (!d || r.alreadyDelivered) return r;
        return {
          ...r,
          specimenId: d.specimenId !== undefined ? String(d.specimenId) : r.specimenId,
          labName: d.labName !== undefined ? String(d.labName) : r.labName,
          tubeCount: d.tubeCount !== undefined ? String(d.tubeCount) : r.tubeCount,
          tubeTypes: d.tubeTypes !== undefined ? String(d.tubeTypes) : r.tubeTypes,
          deliveryNotes: d.deliveryNotes !== undefined ? String(d.deliveryNotes) : r.deliveryNotes,
        };
      });
      setRows(next);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load companion patients');
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => { if (open) loadRows(); }, [open, loadRows]);

  // Cleanup pending timers when the modal closes
  useEffect(() => {
    if (!open) {
      Object.values(saveTimers.current).forEach((t: any) => clearTimeout(t));
      saveTimers.current = {};
    }
  }, [open]);

  /** Stable per-row key — labOrderId in per-lab-order mode, else appointmentId */
  const rowKey = (r: RowState) => r.labOrderId || r.appointmentId;

  /** Mutate the row + schedule a debounced DB save + write localStorage draft immediately */
  const updateRow = (id: string, patch: Partial<RowState>) => {
    setRows(rs => {
      const next = rs.map(r => rowKey(r) === id ? { ...r, ...patch } : r);
      // Write to localStorage SYNCHRONOUSLY on every keystroke — this is the
      // tab-suspend / refresh insurance policy. DB save still happens
      // debounced 600ms later via persistRow.
      const updatedRow = next.find(r => rowKey(r) === id);
      if (updatedRow) writeDraft(id, updatedRow);
      return next;
    });
    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(() => persistRow(id), 600);
  };

  /** Write the editable fields for a single row to its backing record */
  const persistRow = async (id: string) => {
    setRows(rs => rs.map(r => rowKey(r) === id ? { ...r, saving: true } : r));
    const row = rowsRef.current.find(r => rowKey(r) === id);
    if (!row) return;
    try {
      if (row.labOrderId) {
        // Per-lab-order autosave (multiple patients on one appointment)
        await supabase.from('appointment_lab_orders' as any).update({
          delivery_specimen_id: row.specimenId.trim() || null,
          delivery_lab_name: row.labName ? labLabel(row.labName) : null,
          delivery_tube_count: parseInt(row.tubeCount) || null,
          delivery_tube_types: row.tubeTypes || null,
        }).eq('id', row.labOrderId);
      } else {
        await supabase.from('appointments').update({
          specimen_tracking_id: row.specimenId.trim() || null,
          specimen_lab_name: row.labName ? labLabel(row.labName) : null,
          updated_at: new Date().toISOString(),
        }).eq('id', row.appointmentId);
      }
    } catch (e) {
      console.warn('[specimen] auto-save failed:', e);
    } finally {
      setRows(rs => rs.map(r => rowKey(r) === id ? { ...r, saving: false } : r));
    }
  };

  // Keep a live ref of rows so persistRow always reads the latest state inside its setTimeout
  const rowsRef = useRef<RowState[]>([]);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  const captureGeo = async () => {
    setGeoCapturing(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) return reject('Geolocation not available');
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 30_000,
        });
      });
      setGeoStamp({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      });
      toast.success('Delivery location captured');
    } catch (e: any) {
      toast.error('Location permission denied — delivery will record without geo-stamp');
    } finally {
      setGeoCapturing(false);
    }
  };

  /**
   * Confirm delivery for ONE row:
   *   1. Persist any pending edits
   *   2. Insert a specimen_deliveries audit row
   *   3. Stamp the appointment specimens_delivered_at + status
   *   4. Fire send-specimen-delivery-notification ONLY for this appointmentId
   *      (HIPAA-safe — that fn is scoped to a single appointment.org_id, so
   *      a companion routed to a different org never sees the primary's data)
   */
  const confirmRow = async (id: string): Promise<boolean> => {
    const row = rowsRef.current.find(r => rowKey(r) === id);
    if (!row) return false;
    if (!row.specimenId.trim() || !row.labName) {
      toast.error(`${row.patientName}: specimen ID + lab are required`);
      return false;
    }
    setRows(rs => rs.map(r => rowKey(r) === id ? { ...r, confirming: true } : r));
    try {
      const lab = labLabel(row.labName);
      const nowIso = new Date().toISOString();
      const deliveredBy = (() => {
        try {
          const stored = localStorage.getItem('sb-yluyonhrxxtyuiyrdixl-auth-token');
          if (stored) {
            const p = JSON.parse(stored);
            return p?.user?.user_metadata?.full_name || p?.user?.email || 'Phlebotomist';
          }
        } catch { /* noop */ }
        return 'Phlebotomist';
      })();

      // Audit row in specimen_deliveries — fired for both branches so the
      // ledger has one row per delivered patient regardless of mode.
      try {
        await supabase.from('specimen_deliveries' as any).insert({
          appointment_id: row.appointmentId,
          patient_id: row.patientId,
          patient_name: row.patientName,
          specimen_id: row.specimenId.trim(),
          lab_name: lab,
          tube_count: parseInt(row.tubeCount) || 1,
          tube_types: row.tubeTypes || null,
          service_type: row.serviceType,
          delivery_notes: row.deliveryNotes || (row.labOrderId ? `lab_order:${row.labOrderId}` : null),
          collection_time: nowIso,
          delivered_at: nowIso,
          delivered_by: deliveredBy,
          status: 'delivered',
        });
      } catch (e) { console.warn('specimen_deliveries insert failed:', e); }

      // Optional signature upload (only on the FIRST delivered row of the session)
      let signaturePath: string | null = null;
      try {
        if (signatureRef.current && !signatureRef.current.isEmpty()) {
          const blob = await signatureRef.current.toBlob();
          if (blob) {
            const sigName = `sig_${row.appointmentId}_${Date.now()}.png`;
            const { error: sigErr } = await supabase.storage.from('specimen-signatures').upload(sigName, blob, {
              contentType: 'image/png',
              upsert: true,
            });
            if (!sigErr) signaturePath = sigName;
          }
        }
      } catch (e) { console.warn('signature upload exception:', e); }

      if (row.labOrderId) {
        // Per-lab-order branch — stamp the lab_order row, then promote the
        // parent appointment ONLY once every lab order is delivered.
        await supabase.from('appointment_lab_orders' as any).update({
          delivery_specimen_id: row.specimenId.trim(),
          delivery_lab_name: lab,
          delivery_tube_count: parseInt(row.tubeCount) || 1,
          delivery_tube_types: row.tubeTypes || null,
          delivered_at: nowIso,
          delivered_by: deliveredBy,
        }).eq('id', row.labOrderId);

        // Calculate post-update "all delivered?" against the live ref +
        // this row that's about to flip
        const postState = rowsRef.current.map(r => rowKey(r) === id ? { ...r, alreadyDelivered: true } : r);
        const allNowDelivered = postState.every(r => r.alreadyDelivered);
        if (allNowDelivered) {
          // Aggregate every specimen ID + lab into the parent appointment
          // for backwards-compatible reads (calendar, reports).
          const aggIds = postState.map(r => r.specimenId.trim()).filter(Boolean).join(' / ');
          const labels = Array.from(new Set(postState.map(r => labLabel(r.labName)).filter(Boolean)));
          await supabase.from('appointments').update({
            status: 'specimen_delivered',
            delivered_at: nowIso,
            specimens_delivered_at: nowIso,
            specimen_tracking_id: aggIds,
            specimen_lab_name: labels.join(' / '),
            ...(geoStamp ? { delivery_location: geoStamp } : {}),
            ...(signaturePath ? { delivery_signature_path: signaturePath } : {}),
          }).eq('id', row.appointmentId);
        }
      } else {
        // Family-group / single-appointment branch.
        // BUG FIX 2026-05-04: previously this flipped status='specimen_delivered'
        // on the FIRST sibling delivery, which removed the card from the
        // schedule view before the phleb could deliver remaining companions
        // (often to a DIFFERENT lab on a separate trip). Now we:
        //   1. Stamp THIS sibling's per-row delivery timestamp (so audit + UI
        //      knows it's done, and the green check shows in the modal).
        //   2. Only flip status='specimen_delivered' across ALL siblings when
        //      every sibling in the family has its specimens_delivered_at set.
        const isFamilyGroup = rowsRef.current.length > 1;

        // Stamp this sibling's delivery WITHOUT the terminal status
        await supabase.from('appointments').update({
          delivered_at: nowIso,
          specimens_delivered_at: nowIso,
          specimen_tracking_id: row.specimenId.trim(),
          specimen_lab_name: lab,
          ...(geoStamp ? { delivery_location: geoStamp } : {}),
          ...(signaturePath ? { delivery_signature_path: signaturePath } : {}),
        }).eq('id', row.appointmentId);

        // Compute "all siblings now delivered?" against post-update state
        const postState = rowsRef.current.map(r => rowKey(r) === id ? { ...r, alreadyDelivered: true } : r);
        const allNowDelivered = postState.every(r => r.alreadyDelivered);

        if (allNowDelivered) {
          // Every sibling delivered → flip status terminal on ALL siblings.
          // Doing it as a batch keeps the schedule view consistent: family
          // card disappears for everyone simultaneously, not piecemeal.
          const allIds = postState.map(r => r.appointmentId);
          await supabase.from('appointments').update({
            status: 'specimen_delivered',
          }).in('id', allIds);
        } else if (!isFamilyGroup) {
          // Solo appointment with no companions — terminal flip is fine.
          await supabase.from('appointments').update({
            status: 'specimen_delivered',
          }).eq('id', row.appointmentId);
        }
        // Else (family group, only some delivered): leave status alone so the
        // card stays visible on the schedule for the remaining companions.
      }

      // Fire the unified notification — scoped to this appointment + the
      // specific patient + lab order. The edge fn routes by org_id to avoid
      // cross-patient HIPAA leak.
      try {
        await supabase.functions.invoke('send-specimen-delivery-notification', {
          body: {
            appointmentId: row.appointmentId,
            labOrderId: row.labOrderId,
            patientName: row.patientName,
            organizationId: row.organizationId,
            specimenId: row.specimenId.trim(),
            labName: lab,
            tubeCount: parseInt(row.tubeCount) || 1,
            deliveredAt: nowIso,
          },
        });
      } catch (e) { console.warn('[specimen] notify failed (non-blocking):', e); }

      setRows(rs => rs.map(r => rowKey(r) === id ? { ...r, alreadyDelivered: true, confirming: false } : r));
      // Successful delivery — clear the localStorage draft for this row
      clearDraft(id);
      // BUG FIX 2026-05-04: bubble up to the parent on EVERY successful
      // confirm (not just confirmAll) so the appointment card refreshes
      // and the "Job Completed" button enables when status flipped.
      try { onDelivered(); } catch { /* parent unmounted — fine */ }
      toast.success(`${row.patientName} delivered to ${lab}`);
      return true;
    } catch (e: any) {
      toast.error(e?.message || `Failed to confirm ${row.patientName}`);
      setRows(rs => rs.map(r => rowKey(r) === id ? { ...r, confirming: false } : r));
      return false;
    }
  };

  /** Confirm every still-unconfirmed row */
  const confirmAll = async () => {
    setConfirmingAll(true);
    let anyConfirmed = false;
    for (const r of rowsRef.current) {
      if (!r.alreadyDelivered) {
        const ok = await confirmRow(rowKey(r));
        if (ok) anyConfirmed = true;
      }
    }
    setConfirmingAll(false);
    // confirmRow already fires onDelivered() on every successful per-row
    // confirm — the redundant call here was double-firing parent refetches.
    // Don't auto-close — let the phleb see the green checks first
  };

  /** Render summary chip with org info — color-coded if companion org differs */
  const orgChip = (row: RowState, primaryOrgId: string | null) => {
    if (!row.organizationName) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-600 border border-gray-200 rounded-full px-2 py-0.5">
          <Building2 className="h-2.5 w-2.5" /> No org
        </span>
      );
    }
    const isDifferent = !!primaryOrgId && row.organizationId !== primaryOrgId;
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 ${
        isDifferent
          ? 'bg-amber-100 text-amber-800 border border-amber-300'
          : 'bg-blue-50 text-blue-700 border border-blue-200'
      }`}>
        <Building2 className="h-2.5 w-2.5" />
        {row.organizationName.length > 28 ? row.organizationName.slice(0, 28) + '…' : row.organizationName}
        {isDifferent && <span className="ml-1 font-bold">·different</span>}
      </span>
    );
  };

  const primaryOrgId = useMemo(() => rows[0]?.organizationId || null, [rows]);
  const distinctOrgs = useMemo(
    () => Array.from(new Set(rows.map(r => r.organizationId).filter(Boolean))),
    [rows]
  );
  const totalRows = rows.length;
  const deliveredCount = rows.filter(r => r.alreadyDelivered).length;
  const allDelivered = totalRows > 0 && deliveredCount === totalRows;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-5 py-4 border-b sticky top-0 bg-white z-10">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Package className="h-5 w-5 text-[#B91C1C]" />
            Specimen Delivery
            {totalRows > 1 && (
              <span className="ml-2 inline-flex items-center gap-1 text-[11px] bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">
                <Users className="h-3 w-3" /> {totalRows} patients · {distinctOrgs.length} org{distinctOrgs.length === 1 ? '' : 's'}
              </span>
            )}
          </DialogTitle>
          {totalRows > 1 && (
            <p className="text-xs text-gray-500 mt-1">
              {deliveredCount} of {totalRows} confirmed delivered. Each patient's data is sent only to their assigned organization.
            </p>
          )}
        </DialogHeader>

        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading patients…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">No patients found.</div>
          ) : (
            <>
              {/* Cross-org HIPAA banner — shown when companions are linked to a
                  different org than the primary patient */}
              {distinctOrgs.length > 1 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900">
                    <strong>Multiple organizations on this booking.</strong> The system will deliver each patient's specimen ID + name to ONLY that patient's referring organization. Companions routed to a different practice never see the primary patient's data.
                  </div>
                </div>
              )}

              {rows.map((row, idx) => (
                <div key={rowKey(row)}
                  className={`rounded-lg border p-3 ${
                    row.alreadyDelivered
                      ? 'border-emerald-300 bg-emerald-50/40'
                      : 'border-gray-200 bg-white'
                  }`}>
                  {/* Header row: name, role, org chip, delivered status */}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-sm font-semibold text-gray-900">{row.patientName}</span>
                    {row.companionRole && row.companionRole !== 'primary' && (
                      <span className="text-[10px] bg-gray-100 text-gray-600 border border-gray-200 rounded-full px-2 py-0.5">
                        {row.companionRole}
                      </span>
                    )}
                    {idx === 0 && totalRows > 1 && !row.companionRole && !row.labOrderId && (
                      <span className="text-[10px] bg-gray-100 text-gray-600 border border-gray-200 rounded-full px-2 py-0.5">primary</span>
                    )}
                    {row.labOrderId && (
                      <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5">
                        from lab order
                      </span>
                    )}
                    {orgChip(row, primaryOrgId)}
                    <span className="ml-auto inline-flex items-center gap-1 text-[10px]">
                      {row.alreadyDelivered ? (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Delivered
                        </span>
                      ) : row.saving ? (
                        <span className="text-gray-500 flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Saving
                        </span>
                      ) : (
                        <span className="text-amber-700">Pending</span>
                      )}
                    </span>
                  </div>

                  {/* Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <Label className="text-[11px]">Specimen / Tracking ID *</Label>
                      <Input
                        className="h-9 text-sm"
                        value={row.specimenId}
                        onChange={(e) => updateRow(rowKey(row), { specimenId: e.target.value })}
                        placeholder="e.g. LC-2026-04131"
                        disabled={row.alreadyDelivered}
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">Lab Destination *</Label>
                      <Select
                        value={row.labName}
                        onValueChange={(v) => updateRow(rowKey(row), { labName: v })}
                        disabled={row.alreadyDelivered}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Select lab" />
                        </SelectTrigger>
                        <SelectContent>
                          {LABS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[11px]">Tubes</Label>
                      <Input
                        type="number" min="1" max="50"
                        className="h-9 text-sm"
                        value={row.tubeCount}
                        onChange={(e) => updateRow(rowKey(row), { tubeCount: e.target.value })}
                        disabled={row.alreadyDelivered}
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">Tube types <span className="text-gray-400 font-normal">(optional)</span></Label>
                      <Input
                        className="h-9 text-sm"
                        value={row.tubeTypes}
                        onChange={(e) => updateRow(rowKey(row), { tubeTypes: e.target.value })}
                        placeholder="SST, EDTA…"
                        disabled={row.alreadyDelivered}
                      />
                    </div>
                  </div>

                  {/* Per-row Confirm button */}
                  {!row.alreadyDelivered && (
                    <div className="mt-2.5 flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => confirmRow(rowKey(row))}
                        disabled={row.confirming || !row.specimenId.trim() || !row.labName}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-8 text-xs"
                      >
                        {row.confirming
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Confirming…</>
                          : <><Check className="h-3.5 w-3.5" /> Confirm delivered</>}
                      </Button>
                    </div>
                  )}
                </div>
              ))}

              {/* Chain-of-custody (geo + signature) */}
              <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Chain of custody</div>
                <div className="flex flex-wrap gap-2 mb-3">
                  <Button size="sm" variant="outline" onClick={captureGeo} disabled={geoCapturing} className="text-xs h-8 gap-1">
                    {geoCapturing ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
                    {geoStamp ? 'Location captured ✓' : 'Capture delivery location'}
                  </Button>
                  {geoStamp && (
                    <span className="text-[10px] text-gray-600 self-center">
                      {geoStamp.lat.toFixed(5)}, {geoStamp.lng.toFixed(5)} · ±{Math.round(geoStamp.accuracy)}m
                    </span>
                  )}
                </div>
                <div>
                  <Label className="text-[11px]">Lab tech signature (optional)</Label>
                  <SignaturePad ref={signatureRef} />
                </div>
              </div>

              {/* Tube confirmation — Hormozi Sprint 3. One-tap "predicted
                  tubes were correct" → bumps catalog rows to confidence 1.0.
                  Mismatches captured for admin review. */}
              <TubeConfirmation appointmentId={appointmentId} />
            </>
          )}
        </div>

        {/* Sticky action bar */}
        <div className="px-5 py-3 border-t bg-white sticky bottom-0 flex flex-wrap gap-2 justify-between items-center">
          <div className="text-xs text-gray-500">
            {totalRows > 0 && (
              <>
                <strong>{deliveredCount} / {totalRows}</strong> delivered
                {totalRows > 1 && ' · auto-saving as you type'}
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={confirmingAll}>
              {allDelivered ? 'Close' : 'Done editing'}
            </Button>
            {totalRows > 1 && !allDelivered && (
              <Button
                onClick={confirmAll}
                disabled={confirmingAll || rows.every(r => r.alreadyDelivered || !r.specimenId.trim() || !r.labName)}
                className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 min-w-[180px]"
              >
                {confirmingAll
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming all…</>
                  : <><Send className="h-4 w-4" /> Confirm all delivered</>}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SpecimenDeliveryModal;
