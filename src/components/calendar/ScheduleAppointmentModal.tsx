import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AdminErrorBoundary from '@/components/admin/AdminErrorBoundary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, ArrowRight, Loader2, Crown, Search, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import AddressAutocomplete from '@/components/ui/address-autocomplete';
import { getBufferMinutes } from '@/lib/bookingBuffer';
import { getServicePrice, getServiceById, EXTENDED_AREA_CITIES, isExtendedArea, calculateTotal } from '@/services/pricing/pricingService';

interface ScheduleAppointmentModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultDate?: string;
  /**
   * When opened from a specific patient's chart (PatientProfileTab),
   * pass the patient here to skip the search step. The modal hydrates
   * patientName / email / phone / address / DOB into the form and jumps
   * straight to the service-picker step.
   *
   * Hormozi: every click that doesn't serve the patient is waste —
   * admin-booking-from-a-chart should NOT make the admin retype the
   * patient they're already looking at. (Owner caught this 2026-05-13.)
   */
  prefilledPatient?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string | null;
    phone?: string | null;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    gateCode?: string;
    insuranceProvider?: string;
    insuranceMemberId?: string;
  } | null;
}

const SERVICE_TYPES = [
  { value: 'mobile', label: 'Mobile Blood Draw', price: 150 },
  { value: 'in-office', label: 'Office Visit', price: 55 },
  { value: 'senior', label: 'Senior (65+)', price: 100 },
  { value: 'specialty-kit', label: 'Specialty Collection Kit', price: 185 },
  { value: 'specialty-kit-genova', label: 'Genova Diagnostics', price: 200 },
  { value: 'therapeutic', label: 'Therapeutic Phlebotomy', price: 200 },
  { value: 'partner-nd-wellness', label: 'ND Wellness', price: 85 },
  { value: 'partner-restoration-place', label: 'Restoration Place', price: 125 },
  { value: 'partner-elite-medical-concierge', label: 'Elite Medical Concierge', price: 72.25 },
  { value: 'partner-naturamed', label: 'NaturaMed', price: 85 },
  { value: 'partner-aristotle-education', label: 'Aristotle Education', price: 185 },
];

// 15-min increments per owner 2026-04-25 — :00, :15, :30, :45 of every hour.
function _fmtSlot(h: number, m: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hr}:${String(m).padStart(2, '0')} ${period}`;
}
const TIME_SLOTS: string[] = (() => {
  const out: string[] = [];
  // 6:00 AM .. 5:00 PM (last regular-hours slot 5:00 PM ends 5:30)
  for (let totalMin = 6 * 60; totalMin <= 17 * 60; totalMin += 15) {
    out.push(_fmtSlot(Math.floor(totalMin / 60), totalMin % 60));
  }
  return out;
})();
const AFTER_HOURS_SLOTS: string[] = (() => {
  const out: string[] = [];
  // 5:15 PM .. 8:00 PM
  for (let totalMin = 17 * 60 + 15; totalMin <= 20 * 60; totalMin += 15) {
    out.push(_fmtSlot(Math.floor(totalMin / 60), totalMin % 60));
  }
  return out;
})();

interface PatientResult {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

const ScheduleAppointmentModal: React.FC<ScheduleAppointmentModalProps> = ({
  open, onClose, onCreated, defaultDate, prefilledPatient,
}) => {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Patient search
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState<PatientResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null);

  // Sprint: auto-apply member benefits in admin flow
  const [detectedTier, setDetectedTier] = useState<'none' | 'member' | 'vip' | 'concierge'>('none');
  // Founding member detection — when true AND tier='vip', the first companion
  // in this booking is FREE (Founding-50 perk).
  const [isFoundingMember, setIsFoundingMember] = useState<boolean>(false);
  const [referralCredits, setReferralCredits] = useState<Array<{ id: string; amount_cents: number; description: string | null }>>([]);
  // Matched lab_request from AutoLinkPreview — bound into the insert payload
  // so the DB trigger can stamp prepaid_at when the org already paid. Without
  // this binding the appointment lands un-linked, the prepaid trigger doesn't
  // fire, and the invoice flow double-bills the org. (Fix 2026-05-20.)
  const [matchedLabRequest, setMatchedLabRequest] = useState<{
    id: string;
    organization_id: string | null;
    providerPaymentStatus: string | null;
    billedTo: string | null;
  } | null>(null);
  const [referralModalOpen, setReferralModalOpen] = useState(false);
  const [redeemReferralIds, setRedeemReferralIds] = useState<string[]>([]);

  // Form state
  const [patientName, setPatientName] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [date, setDate] = useState(defaultDate || new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('');

  // Set of HH:MM strings already booked on the selected date. Used to
  // disable those times in the dropdown. Overridable via the
  // "Override Availability" checkbox for urgent bookings.
  const [bookedTimesOnDate, setBookedTimesOnDate] = useState<Set<string>>(new Set());
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Convert "9:00 AM" ↔ "09:00:00" for matching against appointments.appointment_time
  const timeLabelToDbFormat = (label: string): string => {
    const m = label.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) return label;
    let h = parseInt(m[1], 10);
    const mm = m[2];
    const period = m[3].toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${mm}:00`;
  };
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [zipcode, setZipcode] = useState('');
  const [notes, setNotes] = useState('');
  const [isVip, setIsVip] = useState(false);
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'fixed' | 'waive' | 'custom'>('none');
  const [discountValue, setDiscountValue] = useState('');

  // Companion-visit add-on — admin books a couple/family together in one flow.
  // Hormozi: every time a patient books, ask "anyone else at the same address?"
  // Tier-aware price mirrors TIER_PRICING['additional']: none=$75, member=$55,
  // vip=$45, concierge=$35. Each companion creates a separate appointment row
  // linked to the primary via family_group_id; reporting stays clean.
  // SUPPORTS MULTIPLE: a family of 4 = primary + 3 companions, all in one flow.
  interface CompanionEntry {
    id: string;            // stable client-side key
    name: string;
    dob: string;
    relationship: 'Spouse' | 'Child' | 'Parent' | 'Sibling' | 'Other';
    kitsCount: number;
  }
  const [companions, setCompanions] = useState<CompanionEntry[]>([]);
  // Derived flag for the rest of the form math
  const addCompanion = companions.length > 0;

  // Specialty-kit bundle: per-patient kit count for `specialty-kit*` services.
  // Active only when service is specialty-kit. Preview/submit math routes
  // through calculateTotal({ specialtyKitBundle }) to apply Hormozi volume
  // discount + couple/family bundle savings.
  const [primaryKitsCount, setPrimaryKitsCount] = useState(1);
  // Legacy single-companion kit state, kept as fallback for one-companion flows
  // that haven't migrated to the array yet. New code reads companions[i].kitsCount.
  const [companionKitsCount, setCompanionKitsCount] = useState(1);

  const addCompanionRow = () => {
    setCompanions(curr => [
      ...curr,
      { id: crypto.randomUUID(), name: '', dob: '', relationship: 'Spouse', kitsCount: 1 },
    ]);
  };
  const updateCompanion = (id: string, patch: Partial<CompanionEntry>) => {
    setCompanions(curr => curr.map(c => c.id === id ? { ...c, ...patch } : c));
  };
  const removeCompanion = (id: string) => {
    setCompanions(curr => curr.filter(c => c.id !== id));
  };
  const [invoiceMemo, setInvoiceMemo] = useState('');
  const [orgBilling, setOrgBilling] = useState(false);

  // Sprint: load all partner organizations with their rules so admin picks
  // from a dropdown instead of typing org name. Auto-applies time windows,
  // default billing mode, locked service type, masking flag.
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const selectedOrg = organizations.find(o => o.id === selectedOrgId);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('organizations')
        .select('id, name, billing_email, default_billed_to, show_patient_name_on_appointment, time_window_rules, locked_service_type, locked_price_cents, org_invoice_price_cents, member_stacking_rule')
        .eq('is_active', true)
        .order('name');
      setOrganizations((data as any) || []);
    })();
  }, []);
  // When admin picks an org, auto-populate the fields + flip org-billing flag
  useEffect(() => {
    if (!selectedOrg) return;
    setOrgName(selectedOrg.name);
    setOrgEmail(selectedOrg.billing_email || '');
    if (selectedOrg.default_billed_to === 'org') setOrgBilling(true);
    if (selectedOrg.locked_service_type) setServiceType(selectedOrg.locked_service_type);
  }, [selectedOrg]);

  // Load existing bookings for the selected date and build the booked-times set.
  // This feeds the time dropdown so already-taken slots render as "taken" and
  // non-selectable (unless admin flips the Override checkbox).
  useEffect(() => {
    if (!date) { setBookedTimesOnDate(new Set()); return; }
    let cancelled = false;
    setLoadingSlots(true);
    (async () => {
      try {
        // Pull active slot_holds in parallel — a patient mid-checkout has a
        // reservation we must NOT let admin book over (pre-fix: admin modal
        // never read this table; admin could book on top of patient holds
        // and the patient would 409 at Stripe).
        const nowIso = new Date().toISOString();
        const [apptResp, holdResp, blockResp] = await Promise.all([
          supabase
            .from('appointments')
            .select('appointment_time, status, duration_minutes, service_type, address, family_group_id')
            .gte('appointment_date', `${date}T00:00:00`)
            .lte('appointment_date', `${date}T23:59:59`)
            .in('status', ['scheduled', 'confirmed', 'en_route', 'arrived', 'in_progress']),
          (supabase as any)
            .from('slot_holds')
            .select('appointment_time')
            .eq('appointment_date', date)
            .gt('expires_at', nowIso),
          (supabase as any)
            .from('time_blocks')
            .select('start_time, end_time')
            .lte('start_date', date)
            .gte('end_date', date),
        ]);
        const data = apptResp.data;
        if (cancelled) return;

        // Buffer math owner-confirmed 2026-04-27 — see src/lib/bookingBuffer.ts.
        // Default 0; +30 specialty/therapeutic/aristotle, +30 extended-area,
        // +15 same-address companion (family_group_id present).
        const DEFAULT_DURATION_MIN = 60;
        // Scale the new-appt forward-block by the selected service's actual
        // duration (mirrors server VISIT_DURATIONS in availability.ts). Pre-fix
        // was hardcoded 60, so admin could book a 75-min therapeutic at 10:30
        // even though it'd run into an 11:30 existing appt.
        const VISIT_DURATIONS: Record<string, number> = {
          'mobile': 60, 'in-office': 60, 'senior': 60,
          'therapeutic': 75, 'specialty-kit': 75, 'specialty-kit-genova': 80,
        };
        const NEW_APPT_FOOTPRINT_MIN = VISIT_DURATIONS[String(serviceType || '').toLowerCase()] || 60;

        const parseTimeStr = (t: string): number => {
          // Handles both "09:00:00" (24h) and "9:00 AM" (12h)
          const ampm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t.trim());
          if (ampm) {
            let h = parseInt(ampm[1], 10);
            const m = parseInt(ampm[2], 10);
            const p = ampm[3].toUpperCase();
            if (p === 'PM' && h !== 12) h += 12;
            if (p === 'AM' && h === 12) h = 0;
            return h * 60 + m;
          }
          const mil = /^(\d{1,2}):(\d{2})/.exec(t.trim());
          if (mil) return parseInt(mil[1], 10) * 60 + parseInt(mil[2], 10);
          return -1;
        };
        const formatTime12 = (mins: number): string => {
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          const period = h >= 12 ? 'PM' : 'AM';
          const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
          return `${hr}:${String(m).padStart(2, '0')} ${period}`;
        };

        const booked = new Set<string>();
        for (const row of (data || []) as any[]) {
          if (!row.appointment_time) continue;
          const startMin = parseTimeStr(String(row.appointment_time));
          if (startMin < 0) continue;
          const duration = (row.duration_minutes && row.duration_minutes > 0) ? row.duration_minutes : DEFAULT_DURATION_MIN;
          const buffer = getBufferMinutes({
            service_type: row.service_type,
            address: row.address,
            family_group_id: row.family_group_id,
          });
          const apptEndMin = startMin + duration + buffer;
          // BACKWARD block — every 15-min slot from start (inclusive) to
          // start+duration+buffer (exclusive). 15-min step matches the new
          // grid so :15 and :45 inside the busy span are also flagged TAKEN.
          for (let t = startMin; t < apptEndMin; t += 15) {
            const h = Math.floor(t / 60), m = t % 60;
            booked.add(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
            booked.add(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
            booked.add(formatTime12(t));
          }
          // FORWARD block — a new 30-min draw + 30-min buffer (60-min footprint)
          // starting in (startMin - 60, startMin) would bleed into this appt.
          for (let t = startMin - NEW_APPT_FOOTPRINT_MIN + 15; t < startMin; t += 15) {
            if (t < 0) continue;
            const h = Math.floor(t / 60), m = t % 60;
            booked.add(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
            booked.add(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
            booked.add(formatTime12(t));
          }
        }
        // Mark active patient slot_holds as TAKEN — same key-shape variants
        // as appointments so the dropdown match still works.
        for (const h of (holdResp?.data || []) as any[]) {
          if (!h.appointment_time) continue;
          const t = parseTimeStr(String(h.appointment_time));
          if (t < 0) continue;
          const hh = Math.floor(t / 60), mm = t % 60;
          booked.add(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`);
          booked.add(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
          booked.add(formatTime12(t));
        }
        // Time-block windowed closures — block every 15-min slot inside
        // (matches AdminCalendar's partial-day rendering).
        for (const b of (blockResp?.data || []) as any[]) {
          if (!b.start_time || !b.end_time) continue;
          const sMin = parseTimeStr(String(b.start_time));
          const eMin = parseTimeStr(String(b.end_time));
          if (sMin < 0 || eMin < 0) continue;
          for (let t = sMin; t < eMin; t += 15) {
            const hh = Math.floor(t / 60), mm = t % 60;
            booked.add(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`);
            booked.add(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
            booked.add(formatTime12(t));
          }
        }
        setBookedTimesOnDate(booked);
      } catch (e) {
        console.warn('[slot load] failed:', e);
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => { cancelled = true; };
  }, [date, serviceType]);
  const [orgName, setOrgName] = useState('');
  const [orgEmail, setOrgEmail] = useState('');
  const [overrideSlot, setOverrideSlot] = useState(false);
  const [gateCode, setGateCode] = useState('');
  // Lab destination — where the phleb should deliver specimens.
  // Phleb dashboard now surfaces this prominently; manual appointments
  // without it show a "Check with office" warning to the phleb.
  const [labDestination, setLabDestination] = useState('');

  const resetForm = () => {
    setStep(1);
    setPatientSearch('');
    setPatientResults([]);
    setSelectedPatient(null);
    setPatientName('');
    setPatientEmail('');
    setPatientPhone('');
    setServiceType('');
    setDate(defaultDate || new Date().toISOString().split('T')[0]);
    setTime('');
    setAddress('');
    setCity('');
    setZipcode('');
    setNotes('');
    setIsVip(false);
    setDiscountType('none');
    setDiscountValue('');
    setInvoiceMemo('');
    setOrgBilling(false);
    setOrgName('');
    setOrgEmail('');
    setOverrideSlot(false);
    setGateCode('');
  };

  const handleClose = () => { resetForm(); onClose(); };

  // Hydrate from prefilledPatient (or legacy sessionStorage stash) when
  // the modal opens. Removes the dead-step "search for the patient you're
  // already looking at" UX bug. After hydrate, jump straight to step 2
  // (service + schedule) — patient identity is already known.
  //
  // Legacy fallback: PatientProfileTab used to write to sessionStorage
  // under 'convelabs_admin_prefill_patient' BEFORE we added the prop.
  // We honor that key once and clear it so it doesn't leak across visits.
  useEffect(() => {
    if (!open) return;
    let p: any = prefilledPatient || null;
    if (!p) {
      try {
        const raw = sessionStorage.getItem('convelabs_admin_prefill_patient');
        if (raw) {
          p = JSON.parse(raw);
          sessionStorage.removeItem('convelabs_admin_prefill_patient');
        }
      } catch { /* ignore */ }
    }
    if (!p) return;

    const fullName = `${p.firstName || ''} ${p.lastName || ''}`.trim();
    setPatientName(fullName);
    setPatientEmail(String(p.email || ''));
    setPatientPhone(String(p.phone || ''));
    setAddress(String(p.address || ''));
    setCity(String(p.city || ''));
    setZipcode(String(p.zipCode || p.zipcode || ''));
    setGateCode(String(p.gateCode || ''));
    if (p.id) {
      setSelectedPatient({
        id: p.id,
        first_name: p.firstName || '',
        last_name: p.lastName || '',
        email: p.email || null,
        phone: p.phone || null,
      });
      // CRITICAL: run the membership-tier + founding-member detection that
      // was previously only firing on selectPatient() from the search
      // dropdown. Without this, opening the modal from a patient chart
      // (PatientProfileTab → 'Schedule') left detectedTier='none' and the
      // patient was charged non-member rate. Reported on Mariela Sadrameli
      // (VIP founding #2) — her \$115 mobile draw was being quoted at \$150.
      (async () => {
        try {
          const { data: tp } = await supabase
            .from('tenant_patients').select('user_id').eq('id', p.id).maybeSingle();
          const uid = (tp as any)?.user_id;
          if (!uid) return;
          const { data: mem } = await supabase
            .from('user_memberships' as any)
            .select('founding_member, membership_plans(name)')
            .eq('user_id', uid).eq('status', 'active').maybeSingle();
          const planName = String((mem as any)?.membership_plans?.name || '').toLowerCase();
          let tier: 'none' | 'member' | 'vip' | 'concierge' = 'none';
          if (planName.includes('concierge')) tier = 'concierge';
          else if (planName.includes('vip')) tier = 'vip';
          else if (planName.includes('regular') || planName.includes('member')) tier = 'member';
          setDetectedTier(tier);
          setIsFoundingMember(Boolean((mem as any)?.founding_member));
        } catch (e) {
          console.warn('[modal-tier-detect] failed:', e);
        }
      })();
    }
    // Skip the patient-search step — admin is booking for THIS patient.
    setStep(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefilledPatient]);

  // Search patients as user types
  useEffect(() => {
    if (patientSearch.length < 2) { setPatientResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('tenant_patients')
        .select('id, first_name, last_name, email, phone')
        .or(`first_name.ilike.%${patientSearch}%,last_name.ilike.%${patientSearch}%,email.ilike.%${patientSearch}%`)
        .limit(5);
      setPatientResults((data as PatientResult[]) || []);
      setShowResults(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [patientSearch]);

  const selectPatient = async (p: PatientResult) => {
    setSelectedPatient(p);
    setPatientName(`${p.first_name} ${p.last_name}`.trim());
    setPatientEmail(p.email || '');
    setPatientPhone(p.phone || '');
    setPatientSearch(`${p.first_name} ${p.last_name}`.trim());
    setShowResults(false);

    // Sprint: auto-detect member tier + pull referral credit balance
    try {
      const { data: tp } = await supabase
        .from('tenant_patients').select('user_id').eq('id', p.id).maybeSingle();
      const uid = (tp as any)?.user_id;
      if (uid) {
        // Active membership?
        const { data: mem } = await supabase
          .from('user_memberships' as any)
          .select('founding_member, membership_plans(name)')
          .eq('user_id', uid).eq('status', 'active').maybeSingle();
        const planName = String((mem as any)?.membership_plans?.name || '').toLowerCase();
        let tier: 'none' | 'member' | 'vip' | 'concierge' = 'none';
        if (planName.includes('concierge')) tier = 'concierge';
        else if (planName.includes('vip')) tier = 'vip';
        else if (planName.includes('regular') || planName.includes('member')) tier = 'member';
        setDetectedTier(tier);
        // Surface founding member status so the family-add UI can show
        // the "first companion FREE" perk live in the form
        setIsFoundingMember(Boolean((mem as any)?.founding_member));

        // Unredeemed referral credits?
        const { data: credits } = await supabase
          .from('referral_credits' as any)
          .select('id, amount, description')
          .eq('user_id', uid)
          .eq('redeemed', false);
        const mapped = (credits || []).map((c: any) => ({
          id: c.id,
          amount_cents: Math.round(Number(c.amount || 0) * 100),
          description: c.description || null,
        })).filter((c: any) => c.amount_cents > 0);
        setReferralCredits(mapped);
        // If any credits exist, auto-open the "ask patient" modal
        if (mapped.length > 0) {
          setReferralModalOpen(true);
        }
      }
    } catch (e) { console.warn('[admin-booking] tier/credit lookup failed (non-blocking):', e); }

    // Hydrate from three sources, priority order:
    //   (1) tenant_patients — the canonical patient profile. Holds address,
    //       gate_code, preferred_day/time, standing_order_doctor. When admin
    //       corrects these mid-booking, the submit handler writes them back
    //       (self-healing data).
    //   (2) most recent appointment — latest truth in case they moved and
    //       tenant_patients hasn't caught up.
    //   (3) user_profiles — only exists for patients with auth accounts
    //       (~4% of the book), kept as last-resort fallback.
    // Pre-populating these cuts 30+ seconds off re-entry and kills the
    // "what's your address again?" call that tanks same-day bookings.
    const [{ data: tp }, { data: lastAppt }, { data: profile }] = await Promise.all([
      supabase
        .from('tenant_patients')
        .select('address, city, state, zipcode, gate_code, preferred_day, preferred_time, standing_order_doctor, patient_notes, insurance_provider, insurance_member_id')
        .eq('id', p.id)
        .maybeSingle(),
      supabase
        .from('appointments')
        .select('address_street, address_city, address_zip, gate_code, service_type, notes')
        .eq('patient_id', p.id)
        .order('appointment_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('user_profiles')
        .select('address_street, address_city, address_state, address_zipcode')
        .eq('id', p.id)
        .maybeSingle(),
    ]);

    const street = tp?.address || lastAppt?.address_street || profile?.address_street || '';
    const cityVal = tp?.city || lastAppt?.address_city || profile?.address_city || '';
    const zip = tp?.zipcode || lastAppt?.address_zip || profile?.address_zipcode || '';
    const gc = tp?.gate_code || lastAppt?.gate_code || '';

    if (street) setAddress(street);
    if (cityVal) setCity(cityVal);
    if (zip) setZipcode(zip);
    if (gc) setGateCode(gc);
    if (lastAppt?.service_type && !serviceType) setServiceType(lastAppt.service_type);

    // Stitch phleb-facing context into notes: standing order doctor + prior
    // patient notes ("hard stick", "dog in yard") + last-visit notes.
    const noteBits: string[] = [];
    if (tp?.standing_order_doctor) noteBits.push(`Standing order: Dr. ${tp.standing_order_doctor}`);
    if (tp?.patient_notes) noteBits.push(tp.patient_notes);
    if (lastAppt?.notes) noteBits.push(`Previous visit: ${lastAppt.notes}`);
    if (noteBits.length && !notes) setNotes(noteBits.join(' | '));
  };

  // Manual "look up saved address" — runs hydration using whatever identifier
  // we have (selected id, email, or phone-digits). Rescues cases where the
  // admin typed a name without clicking a dropdown result.
  const [lookupStatus, setLookupStatus] = useState<'idle' | 'searching' | 'found' | 'missing' | 'no-match'>('idle');
  const lookupSavedAddress = async () => {
    setLookupStatus('searching');
    let query = supabase.from('tenant_patients')
      .select('id, address, city, state, zipcode, gate_code, preferred_day, preferred_time, standing_order_doctor, patient_notes');
    let found: any = null;
    if (selectedPatient?.id) {
      const { data } = await query.eq('id', selectedPatient.id).maybeSingle();
      found = data;
    } else if (patientEmail) {
      const { data } = await query.ilike('email', patientEmail.trim()).maybeSingle();
      found = data;
    } else if (patientPhone) {
      const digitsOnly = patientPhone.replace(/\D+/g, '');
      if (digitsOnly) {
        const { data } = await query.ilike('phone', `%${digitsOnly}%`).maybeSingle();
        found = data;
      }
    }
    if (!found) { setLookupStatus('no-match'); return; }
    if (!found.address && !found.city && !found.gate_code) { setLookupStatus('missing'); return; }
    if (found.address) setAddress(found.address);
    if (found.city) setCity(found.city);
    if (found.zipcode) setZipcode(found.zipcode);
    if (found.gate_code) setGateCode(found.gate_code);
    const noteBits: string[] = [];
    if (found.standing_order_doctor) noteBits.push(`Standing order: Dr. ${found.standing_order_doctor}`);
    if (found.patient_notes) noteBits.push(found.patient_notes);
    if (noteBits.length && !notes) setNotes(noteBits.join(' | '));
    setLookupStatus('found');
  };

  const canGoToStep2 = patientName.trim() && serviceType;
  const canGoToStep3 = date && time;

  // Compute surcharges for preview (same logic as handleSubmit)
  const EXTENDED_CITIES_LIST = ['lake nona','celebration','kissimmee','sanford','eustis','clermont','montverde','deltona','geneva','tavares','mount dora','leesburg','groveland','mascotte','minneola','daytona beach','deland','debary','orange city'];
  const previewSurcharges: { label: string; amount: number }[] = [];
  if (city && EXTENDED_CITIES_LIST.some(c => city.toLowerCase().includes(c))) previewSurcharges.push({ label: 'Extended Area', amount: 75 });
  if (date && [0, 6].includes(new Date(date + 'T12:00:00').getDay())) previewSurcharges.push({ label: 'Weekend', amount: 75 });
  if (time && (() => { const [t, p] = time.split(' '); const h = parseInt(t); return (p === 'PM' && h !== 12 ? h + 12 : h) >= 17; })()) previewSurcharges.push({ label: 'After-Hours', amount: 50 });
  if (date === new Date().toISOString().split('T')[0]) previewSurcharges.push({ label: 'Same-Day', amount: 100 });
  const previewBasePrice = getServicePrice(serviceType, 'none');
  const previewSurchargeTotal = previewSurcharges.reduce((s, x) => s + x.amount, 0);
  // Companion price: tier-aware. Non-member $75, Member $55, VIP $45, Concierge $35.
  const companionPrice = (() => {
    const tier = detectedTier;
    if (tier === 'concierge') return 35;
    if (tier === 'vip') return 45;
    if (tier === 'member') return 55;
    return 75;
  })();
  // Multi-companion total with founding-perk + Concierge waivers:
  //   • Founding VIP: 1 free companion slot per visit
  //   • Concierge: 2 free companion slots per visit
  //   • Everyone else: pays tier rate × N
  const freeCompanionSlots = (() => {
    if (detectedTier === 'concierge') return 2;
    if (isFoundingMember && detectedTier === 'vip') return 1;
    return 0;
  })();
  const billableCompanionCount = Math.max(0, companions.length - freeCompanionSlots);
  const companionAdd = billableCompanionCount * companionPrice;

  // Hormozi specialty-kit bundle path. When the admin picks a `specialty-kit*`
  // service, the bundle pricing handles primary + companion + multi-kit math
  // including the savings line. Falls back to the old companion-add for
  // non-kit services.
  const isSpecialtyKitService = serviceType === 'specialty-kit' || serviceType === 'specialty-kit-genova';
  const specialtyBundleBreakdown = isSpecialtyKitService
    ? calculateTotal(serviceType, {
        specialtyKitBundle: {
          patients: [
            { kits: Math.max(1, primaryKitsCount) },
            ...companions.map(c => ({ kits: Math.max(1, c.kitsCount) })),
          ],
          isGenova: serviceType === 'specialty-kit-genova',
        },
      }, 0, 0, (detectedTier as any) || 'none')
    : null;

  const previewBaseWithAddons = isSpecialtyKitService && specialtyBundleBreakdown
    ? specialtyBundleBreakdown.subtotal + previewSurchargeTotal
    : previewBasePrice + previewSurchargeTotal + companionAdd;
  const previewTotal = discountType === 'waive' ? 0
    : discountType === 'custom' && discountValue ? Math.max(parseFloat(discountValue) || 0, 0)
    : discountType === 'percentage' && discountValue ? Math.round(previewBaseWithAddons * (1 - (parseFloat(discountValue) || 0) / 100) * 100) / 100
    : discountType === 'fixed' && discountValue ? Math.max(previewBaseWithAddons - (parseFloat(discountValue) || 0), 0)
    : previewBaseWithAddons;

  const handleSubmit = async () => {
    console.log('handleSubmit triggered', { patientName, serviceType, date, time, discountType });
    setSubmitError('');
    setIsSubmitting(true);
    try {
      // Use selected patient ID or find by email/name
      let patientId = selectedPatient?.id || null;

      if (!patientId && patientEmail) {
        const { data } = await supabase.from('tenant_patients').select('id').ilike('email', patientEmail.trim()).maybeSingle();
        if (data) patientId = data.id;
      }
      if (!patientId && patientName) {
        const firstName = patientName.split(' ')[0];
        const { data } = await supabase.from('tenant_patients').select('id').ilike('first_name', `%${firstName}%`).maybeSingle();
        if (data) patientId = data.id;
      }

      // patient_id is now optional — admin can schedule without a matching patient record
      if (!patientId) {
        console.log('No patient_id found — scheduling without patient link');
      }

      // Parse time
      let hours = 0, minutes = 0;
      if (time.includes('AM') || time.includes('PM')) {
        const [tStr, period] = time.split(' ');
        [hours, minutes] = tStr.split(':').map(Number);
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
      }
      const appointmentDate = `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

      // Calculate price with surcharges + discount
      // PRICING — single source of truth via pricingService (audit 2026-04-28).
      // Replaces the modal's local SERVICE_TYPES + MEMBER_TIER_PRICING which
      // didn't cover partner services and was the root cause of the kiturah
      // doward bug (booked as specialty-kit $185 instead of partner-nd-wellness
      // $85). pricingService handles all 11 services + 5 partner orgs uniformly.
      // svc is still used for the human-readable label below; price comes from
      // pricingService.
      const svc = SERVICE_TYPES.find(s => s.value === serviceType);
      const listPrice = getServicePrice(serviceType, 'none');
      const tierPrice = detectedTier !== 'none'
        ? getServicePrice(serviceType, detectedTier as any)
        : listPrice;
      const basePrice = tierPrice;
      const memberSavings = detectedTier !== 'none' ? (listPrice - tierPrice) : 0;

      // Auto-detect surcharges — uses canonical extended-area helper.
      const isInExtendedArea = isExtendedArea(city);
      const appointmentDay = date ? new Date(date + 'T12:00:00').getDay() : 1;
      const isWeekend = appointmentDay === 0 || appointmentDay === 6;
      const isAfterHours = time && (() => {
        const [tStr, period] = time.split(' ');
        const [h] = tStr.split(':').map(Number);
        const h24 = period === 'PM' && h !== 12 ? h + 12 : h;
        return h24 >= 17;
      })();
      const isSameDay = date === new Date().toISOString().split('T')[0];

      let surchargeTotal = 0;
      const surchargeItems: string[] = [];
      if (isInExtendedArea) { surchargeTotal += 75; surchargeItems.push('Extended area +$75'); }
      if (isWeekend) { surchargeTotal += 75; surchargeItems.push('Weekend +$75'); }
      if (isAfterHours) { surchargeTotal += 50; surchargeItems.push('After-hours +$50'); }
      if (isSameDay) { surchargeTotal += 100; surchargeItems.push('Same-day +$100'); }

      // Companion-visit fee (tier-aware, computed above in previewBaseWithAddons).
      // CRITICAL: must be included in finalPrice so the Stripe invoice charges
      // the full amount. Prior bug (Cheryl Hanin / Ben Tov Ofer case 2026-04-21)
      // included it in the UI preview but not in finalPrice, so the primary
      // invoice went out at $150 instead of $225 and admin had to create a
      // manual make-up invoice for $75.
      // Multi-companion fee total with founding-perk + Concierge waivers
      const companionFeeApplied = billableCompanionCount * companionPrice;
      // Specialty-kit bundle override: replace base+companion math with the
      // bundle subtotal so the admin invoice matches what the patient-facing
      // bundle card would have produced.
      let finalPrice = isSpecialtyKitService && specialtyBundleBreakdown
        ? specialtyBundleBreakdown.subtotal + surchargeTotal
        : basePrice + surchargeTotal + companionFeeApplied;
      let discountNote = surchargeItems.join(', ');
      if (isSpecialtyKitService && specialtyBundleBreakdown?.bundleLabel) {
        discountNote += (discountNote ? ' | ' : '') + `${specialtyBundleBreakdown.bundleLabel}`;
      } else if (companionFeeApplied > 0) {
        const compNames = companions.filter(c => c.name.trim()).map(c => c.name.trim()).join(', ');
        discountNote += (discountNote ? ' | ' : '') + `Family bundle: ${companions.length} additional patient${companions.length === 1 ? '' : 's'} +$${companionFeeApplied.toFixed(2)}${compNames ? ` (${compNames})` : ''}`;
      }
      if (memberSavings > 0) {
        discountNote += (discountNote ? ' | ' : '') + `${detectedTier.toUpperCase()} member — saved $${memberSavings.toFixed(2)}`;
      }

      // Apply any referral credits the admin redeemed via the pop-up modal
      const referralCreditApplied = redeemReferralIds.length > 0
        ? referralCredits.filter(c => redeemReferralIds.includes(c.id)).reduce((s, c) => s + c.amount_cents, 0) / 100
        : 0;
      if (referralCreditApplied > 0) {
        finalPrice = Math.max(0, finalPrice - referralCreditApplied);
        discountNote += (discountNote ? ' | ' : '') + `Referral credit -$${referralCreditApplied.toFixed(2)}`;
      }

      if (discountType === 'waive') { finalPrice = 0; discountNote = 'Fee waived'; }
      else if (discountType === 'custom' && discountValue) {
        const overridePrice = Math.max(parseFloat(discountValue) || 0, 0);
        discountNote += (discountNote ? ' | ' : '') + `Custom price $${overridePrice.toFixed(2)} (base ${basePrice + surchargeTotal})`;
        finalPrice = overridePrice;
      }
      else if (discountType === 'percentage' && discountValue) {
        const pct = Math.min(parseFloat(discountValue) || 0, 100);
        finalPrice = Math.round(finalPrice * (1 - pct / 100) * 100) / 100;
        discountNote += (discountNote ? ' | ' : '') + `${pct}% discount`;
      } else if (discountType === 'fixed' && discountValue) {
        finalPrice = Math.max(finalPrice - (parseFloat(discountValue) || 0), 0);
        discountNote += (discountNote ? ' | ' : '') + `$${parseFloat(discountValue).toFixed(2)} off`;
      }

      // Hormozi: "Waive Fee" on an org-billed patient means the PATIENT pays
      // $0, but the ORG still owes the partner rate. Previously we dropped
      // the invoice entirely → $185/visit revenue leak for Aristotle etc.
      // Now: isWaived=true only when there is no org to bill. When an org is
      // selected with default_billed_to='org', we always send an invoice to
      // the org at org_invoice_price_cents (or locked_price_cents fallback).
      const orgCoversPatient = selectedOrg && selectedOrg.default_billed_to === 'org';
      const orgInvoiceDollars = orgCoversPatient
        ? (selectedOrg.org_invoice_price_cents ?? selectedOrg.locked_price_cents ?? 0) / 100
        : 0;
      if (orgCoversPatient && discountType === 'waive' && orgInvoiceDollars > 0) {
        // Patient owes $0 (waive), but the org gets invoiced the partner rate.
        finalPrice = orgInvoiceDollars;
        discountNote += (discountNote ? ' | ' : '') + `Patient pays $0; org billed $${orgInvoiceDollars.toFixed(2)}`;
      }
      const isWaived = finalPrice === 0;
      const invoiceDueAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      const billingEmail = orgBilling && orgEmail ? orgEmail : patientEmail;

      // Determine duration
      const durationMap: Record<string, number> = {
        'therapeutic': 75, 'specialty-kit': 75, 'specialty-kit-genova': 80,
        'partner-nd-wellness': 65, 'partner-aristotle-education': 75,
      };
      const duration = durationMap[serviceType] || 60;

      // Build appointment payload
      // If AutoLinkPreview found a matching lab_request for this patient AND
      // the org already paid via lab-request checkout, the appointment should
      // be marked prepaid + org_billed at INSERT time. The DB trigger
      // trg_sync_prepaid_from_lab_request (migration
      // appointments_prepaid_lab_request_guardrail) handles this when we
      // pass lab_request_id. We ALSO force payment_status=org_billed +
      // invoice_status=not_required on the client side so the post-insert
      // invoice block doesn't try to fire before the trigger sees it.
      const prepaidViaLabRequest = !!matchedLabRequest && matchedLabRequest.providerPaymentStatus === 'completed';

      const appointmentPayload: any = {
        appointment_date: appointmentDate,
        appointment_time: time,
        patient_name: patientName,
        patient_email: patientEmail || null,
        patient_phone: patientPhone || null,
        service_type: serviceType,
        service_name: svc?.label || serviceType,
        status: 'scheduled',
        address: [address, city, zipcode].filter(Boolean).join(', ') || 'TBD',
        zipcode: zipcode || '32801',
        // CRITICAL: primary's total_amount must NOT include companion fees.
        // Each companion appointment row carries its OWN total_amount, and
        // send-appointment-invoice adds a line item per companion. If we
        // bake the bundle total into primary here, Stripe double-bills.
        // Subtract companion fees so primary line = base + surcharges only.
        total_amount: Math.max(0, finalPrice - companionFeeApplied),
        service_price: basePrice,
        surcharge_amount: surchargeTotal,
        duration_minutes: duration,
        booking_source: 'manual',
        is_vip: isVip,
        // FIX (2026-04-24 / Blake Hutton case): previously stamped 'sent' +
        // invoice_sent_at unconditionally at INSERT time, even when the Stripe
        // call below never ran (e.g., no email) or failed silently. That lied
        // to the admin — dashboard showed "invoice sent" while Stripe had no
        // invoice. Now we stamp intent markers and let the edge-fn callback
        // flip to 'sent' only on confirmed success.
        invoice_status: prepaidViaLabRequest
          ? 'paid'
          : isWaived
          ? 'not_required'
          : billingEmail ? 'pending_send' : 'missing_email',
        invoice_sent_at: null,
        invoice_due_at: (prepaidViaLabRequest || isWaived) ? null : invoiceDueAt,
        payment_status: prepaidViaLabRequest
          ? 'org_billed'
          : isWaived ? 'completed' : 'pending',
        // Link to the lab_request so the DB trigger can stamp prepaid_at +
        // suppress the invoice flow. The auto-attach of any lab order PDF
        // can also rely on this link.
        ...(matchedLabRequest ? { lab_request_id: matchedLabRequest.id } : {}),
        gate_code: gateCode || null,
        lab_destination: labDestination.trim() || null,
        phlebotomist_id: '91c76708-8c5b-4068-92c6-323805a3b164',
        notes: [notes, gateCode ? `Gate: ${gateCode}` : '', labDestination ? `Lab: ${labDestination}` : '', discountNote, orgBilling ? `Org: ${orgName}` : '', invoiceMemo ? `Memo: ${invoiceMemo}` : ''].filter(Boolean).join(' | ') || null,
        // Partner linkage (if admin picked an org from the dropdown)
        ...(selectedOrg ? {
          organization_id: selectedOrg.id,
          billed_to: selectedOrg.default_billed_to || 'patient',
          patient_name_masked: selectedOrg.show_patient_name_on_appointment === false,
          org_reference_id: selectedOrg.show_patient_name_on_appointment === false
            ? `${String(selectedOrg.name).toUpperCase().replace(/[^A-Z]/g, '').substring(0, 4)}-${Date.now().toString().slice(-6)}`
            : null,
        } : {}),
      };

      // Only include patient_id if we found one (column is nullable)
      if (patientId) {
        appointmentPayload.patient_id = patientId;
      }

      console.log('Creating appointment:', JSON.stringify(appointmentPayload, null, 2));

      // Create appointment
      const { data: newAppt, error } = await supabase.from('appointments').insert([appointmentPayload]).select().single();

      if (error) {
        console.error('Appointment creation error:', error);
        const errMsg = `Failed: ${error.message || 'Unknown database error'}`;
        setSubmitError(errMsg);
        toast.error(errMsg, { duration: 8000 });
        setIsSubmitting(false);
        return;
      }

      if (!newAppt) {
        console.error('No appointment returned after insert');
        const errMsg = 'Appointment was not created. RLS policy may be blocking — contact support.';
        setSubmitError(errMsg);
        toast.error(errMsg, { duration: 8000 });
        setIsSubmitting(false);
        return;
      }

      console.log('Appointment created:', newAppt.id);

      // Companion visits — for each named companion in the array, create a
      // separate appointment row linked to the primary via family_group_id.
      // Same address, same time slot, tier-aware price. Phleb handles all in
      // one visit window; each companion gets their own clinical chart.
      const namedCompanions = companions.filter(c => c.name.trim());
      if (namedCompanions.length > 0) {
        try {
          const familyGroupId = newAppt.id;
          await supabase.from('appointments').update({ family_group_id: familyGroupId }).eq('id', newAppt.id);
          for (const comp of namedCompanions) {
            const compPayload: any = {
              ...appointmentPayload,
              patient_name: comp.name.trim(),
              patient_email: null,
              patient_phone: null,
              patient_id: null,
              total_amount: companionPrice,
              service_price: companionPrice,
              surcharge_amount: 0,
              invoice_status: 'not_required',
              payment_status: 'completed',
              family_group_id: familyGroupId,
              companion_role: comp.relationship,
              notes: `Companion of ${patientName}${comp.dob ? ` · DOB ${comp.dob}` : ''} · rel: ${comp.relationship} · billed on primary appt ${newAppt.id}`,
            };
            delete compPayload.stripe_checkout_session_id;
            const { error: compErr } = await supabase.from('appointments').insert([compPayload]);
            if (compErr) {
              console.error(`Companion appointment failed for ${comp.name}:`, compErr);
              toast.error(`Couldn't add ${comp.name}: ${compErr.message}`);
            } else {
              await supabase.from('upgrade_events' as any).insert({
                event_type: 'companion_click', status: 'converted',
                patient_email: patientEmail?.toLowerCase() || null,
                patient_name: patientName || null,
                appointment_id: newAppt.id,
                revenue_cents: Math.round(companionPrice * 100),
                discount_cents: Math.round((75 - companionPrice) * 100),
                metadata: { source: 'admin_manual', companion_name: comp.name, companion_role: comp.relationship, tier: detectedTier, family_size: namedCompanions.length + 1 },
                converted_at: new Date().toISOString(),
              }).catch(() => {});
            }
          }
          console.log(`Created ${namedCompanions.length} companion appointment(s) under family_group ${familyGroupId}`);
        } catch (e) {
          console.warn('Companion creation exception (non-blocking):', e);
        }
      }

      // Self-healing data: if admin typed a new/corrected address or gate_code
      // for a known patient, write it back to tenant_patients so the next
      // booking pre-fills with the right info. Fire-and-forget — a failure
      // here must not block the appointment that just saved.
      if (patientId) {
        const backfill: Record<string, string> = {};
        if (address) backfill.address = address;
        if (city) backfill.city = city;
        if (zipcode) backfill.zipcode = zipcode;
        if (gateCode) backfill.gate_code = gateCode;
        if (Object.keys(backfill).length > 0) {
          supabase
            .from('tenant_patients')
            .update({ ...backfill, updated_at: new Date().toISOString() })
            .eq('id', patientId)
            .then(({ error: bfErr }) => {
              if (bfErr) console.warn('tenant_patients backfill failed (non-fatal):', bfErr.message);
            });
        }
      }

      // Send Stripe invoice (non-blocking) — flip invoice_status to 'sent'
      // ONLY on confirmed success from the edge fn. On failure, stamp a
      // diagnostic status so admin can see the row isn't actually invoiced.
      if (newAppt && !isWaived && billingEmail && !prepaidViaLabRequest) {
        (async () => {
          try {
            const { data, error } = await supabase.functions.invoke('send-appointment-invoice', {
              body: {
                appointmentId: newAppt.id,
                patientName: orgBilling ? orgName : patientName,
                patientEmail: billingEmail,
                patientPhone,
                serviceType,
                serviceName: svc?.label || serviceType,
                servicePrice: finalPrice,
                appointmentDate: date,
                appointmentTime: time,
                address: [address, city, zipcode].filter(Boolean).join(', ') || 'TBD',
                isVip,
                memo: invoiceMemo || (orgBilling ? `Patient: ${patientName}` : ''),
                orgName: orgBilling ? orgName : undefined,
              },
            });
            if (error || (data as any)?.error) {
              const msg = (data as any)?.error || error?.message || 'unknown';
              console.error('Invoice send failed:', msg);
              await supabase.from('appointments').update({
                invoice_status: 'failed',
              }).eq('id', newAppt.id);
              toast.error(`Invoice didn't go out: ${msg}. Fix in the row and resend.`);
              return;
            }
            // Success — confirm flip to 'sent' + stamp timestamp. (The edge
            // fn may have already done this, but we stamp here too as the
            // idempotent source of truth from the client side.)
            await supabase.from('appointments').update({
              invoice_status: 'sent',
              invoice_sent_at: new Date().toISOString(),
              invoice_due_at: invoiceDueAt,
            }).eq('id', newAppt.id);
            console.log('Invoice sent for appointment', newAppt.id);
          } catch (err: any) {
            console.error('Invoice send error:', err);
            await supabase.from('appointments').update({
              invoice_status: 'failed',
            }).eq('id', newAppt.id);
            toast.error(`Invoice send crashed: ${err?.message || 'unknown'}`);
          }
        })();
      } else if (newAppt && !isWaived && !billingEmail) {
        // No email to send to — loud warning so admin fixes it
        toast.warning(
          `⚠ No email on file for ${patientName}. Invoice NOT sent. Add an email to the patient, then use Resend from their row.`,
          { duration: 10000 }
        );
      }

      // Send ALL notifications (non-blocking)
      if (newAppt) {
        const svcLabel = svc?.label || serviceType;
        const fullAddress = [address, city, zipcode].filter(Boolean).join(', ') || 'TBD';

        // 1. Patient confirmation (email + SMS)
        supabase.functions.invoke('send-appointment-confirmation', {
          body: {
            appointmentId: newAppt.id,
            patientName,
            patientEmail: patientEmail || null,
            patientPhone: patientPhone || null,
            serviceName: svcLabel,
            appointmentDate: date,
            appointmentTime: time,
            address: fullAddress,
            totalAmount: finalPrice,
            isWaived,
          },
        }).catch(err => console.error('Patient confirmation error:', err));

        // 2. Owner SMS
        supabase.functions.invoke('send-sms-notification', {
          body: {
            to: '9415279169',
            message: `💰 New Booking (Admin)\n\nPatient: ${patientName}\nService: ${svcLabel}\nRevenue: $${finalPrice.toFixed(2)}\nDate: ${date} at ${time}\nSource: manual`,
          },
        }).catch(() => {});

        // 3. Phlebotomist SMS
        supabase.from('staff_profiles').select('phone').eq('user_id', '91c76708-8c5b-4068-92c6-323805a3b164').maybeSingle()
          .then(({ data: staff }) => {
            if (staff?.phone) {
              supabase.functions.invoke('send-sms-notification', {
                body: {
                  to: staff.phone,
                  message: `New Booking!\n\nPatient: ${patientName}\nService: ${svcLabel}\nDate: ${date} at ${time}\nLocation: ${fullAddress}\nAmount: $${finalPrice.toFixed(2)}`,
                },
              }).catch(() => {});
            }
          });
      }

      // Mark any redeemed referral credits as used + stamp benefit_first_used_at if tier > none
      if (redeemReferralIds.length > 0) {
        try {
          await supabase.from('referral_credits' as any)
            .update({ redeemed: true, redeemed_at: new Date().toISOString() })
            .in('id', redeemReferralIds);
        } catch (e) { console.warn('credit mark failed:', e); }
      }
      if (detectedTier !== 'none' || redeemReferralIds.length > 0) {
        try {
          const { data: tp } = await supabase
            .from('tenant_patients').select('user_id').ilike('email', patientEmail).maybeSingle();
          const uid = (tp as any)?.user_id;
          if (uid) {
            const nowIso = new Date().toISOString();
            await supabase.from('user_memberships' as any)
              .update({ benefit_first_used_at: nowIso })
              .eq('user_id', uid).eq('status', 'active').is('benefit_first_used_at', null);
            await supabase.from('membership_agreements' as any)
              .update({ benefit_first_used_at: nowIso })
              .eq('user_email', patientEmail.toLowerCase())
              .is('benefit_first_used_at', null);
          }
        } catch (e) { console.warn('benefit stamp failed:', e); }
      }

      // Emit upgrade_events so the Upgrades & ROI dashboard shows admin-
      // created appointments too (previously only public-flow bookings
      // fired these events → dashboard read zero for months). Status
      // 'converted' immediately since admin bookings are pre-paid or
      // invoiced — no pending intent state.
      try {
        if (detectedTier !== 'none' && memberSavings > 0) {
          await supabase.from('upgrade_events' as any).insert({
            event_type: 'membership_applied',
            status: 'converted',
            patient_email: patientEmail?.toLowerCase() || null,
            patient_name: patientName || null,
            patient_phone: patientPhone || null,
            appointment_id: newAppt?.id || null,
            revenue_cents: Math.round((finalPrice || 0) * 100),
            potential_cents: Math.round((listPrice || 0) * 100),
            discount_cents: Math.round(memberSavings * 100),
            metadata: { tier: detectedTier, service_type: serviceType, source: 'admin_manual' },
            converted_at: new Date().toISOString(),
          });
        }
        if (redeemReferralIds.length > 0) {
          await supabase.from('upgrade_events' as any).insert({
            event_type: 'promo_applied',
            status: 'converted',
            patient_email: patientEmail?.toLowerCase() || null,
            patient_name: patientName || null,
            patient_phone: patientPhone || null,
            appointment_id: newAppt?.id || null,
            revenue_cents: Math.round((finalPrice || 0) * 100),
            discount_cents: 0,
            metadata: { source: 'admin_manual', credits_redeemed: redeemReferralIds.length },
            converted_at: new Date().toISOString(),
          });
        }
      } catch (e) { console.warn('upgrade_events emit failed (non-blocking):', e); }

      const statusMsg = isWaived ? ' (Fee waived)' : isVip ? ' (VIP)' : ' Invoice sent to patient.';
      toast.success(`Appointment scheduled!${statusMsg}${memberSavings > 0 ? ` (${detectedTier.toUpperCase()} saved $${memberSavings.toFixed(2)})` : ''}`);
      handleClose();
      onCreated();
    } catch (err: any) {
      console.error('Schedule error:', err);
      const errMsg = err.message || 'Failed to schedule appointment';
      setSubmitError(errMsg);
      toast.error(errMsg, { duration: 8000 });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full p-4 sm:p-6">
        <AdminErrorBoundary surface="Schedule appointment">
        <DialogHeader>
          <DialogTitle>Schedule New Appointment</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4">
          {['Patient & Service', 'Schedule', 'Confirm'].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
                i + 1 <= step ? 'bg-[#B91C1C] text-white' : 'bg-muted text-muted-foreground'
              }`}>{i + 1}</div>
              <span className={`text-xs font-medium ${i + 1 <= step ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
              {i < 2 && <div className={`w-8 h-px ${i + 1 < step ? 'bg-[#B91C1C]' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Patient & Service */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Patient Search */}
            <div className="relative">
              <Label>Search Patient *</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={patientSearch}
                  onChange={e => { setPatientSearch(e.target.value); setShowResults(true); }}
                  placeholder="Type patient name or email..."
                  className="pl-9"
                  onFocus={() => patientResults.length > 0 && setShowResults(true)}
                />
              </div>
              {showResults && patientResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {patientResults.map(p => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 border-b last:border-0"
                      onClick={() => selectPatient(p)}
                    >
                      <p className="font-medium text-sm">{p.first_name} {p.last_name}</p>
                      <p className="text-xs text-muted-foreground">{p.email || 'No email'} {p.phone ? `· ${p.phone}` : ''}</p>
                    </button>
                  ))}
                </div>
              )}
              {patientSearch.length >= 2 && patientResults.length === 0 && showResults && (
                <p className="text-xs text-muted-foreground mt-1">No patients found. Fill in details manually below.</p>
              )}
            </div>

            {selectedPatient && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-emerald-800">Patient selected: {patientName}</p>
                {patientEmail && <p className="text-xs text-emerald-600">{patientEmail}</p>}
                {patientPhone && <p className="text-xs text-emerald-600">{patientPhone}</p>}
              </div>
            )}

            {!selectedPatient && (
              <>
                <div>
                  <Label>Patient Name *</Label>
                  <Input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Full name" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Email <span className="text-[11px] text-gray-400 font-normal">(optional)</span></Label>
                    <Input type="email" value={patientEmail} onChange={e => setPatientEmail(e.target.value)} placeholder="patient@email.com" />
                    {!patientEmail && selectedOrg && selectedOrg.default_billed_to === 'org' && (
                      <p className="text-[11px] text-emerald-700 mt-1">
                        ✓ No patient email — confirmation + invoice will route to <strong>{selectedOrg.name}</strong> ({orgEmail || 'org contact'}).
                      </p>
                    )}
                    {!patientEmail && !selectedOrg && (
                      <p className="text-[11px] text-amber-700 mt-1">
                        ⚠ Without an email, patient won't receive confirmation. Assign a partner org below to route notifications there instead.
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input type="tel" value={patientPhone} onChange={e => setPatientPhone(e.target.value)} placeholder="(555) 123-4567" />
                  </div>
                </div>
              </>
            )}

            <div>
              <Label>Service *</Label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger><SelectValue placeholder="Select a service" /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label} — ${s.price}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <Checkbox id="vip-patient" checked={isVip} onCheckedChange={(c) => setIsVip(c === true)} className="mt-0.5" />
              <label htmlFor="vip-patient" className="text-sm cursor-pointer">
                <span className="font-medium text-amber-800 flex items-center gap-1"><Crown className="h-3.5 w-3.5" /> VIP Patient</span>
                <p className="text-xs text-amber-600 mt-0.5">VIP appointments will not be auto-cancelled if payment is not received.</p>
              </label>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!canGoToStep2}>
                Next: Schedule <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Schedule */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date *</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div>
                <Label>Time *{loadingSlots && <span className="ml-2 text-[11px] text-gray-400">checking availability…</span>}</Label>
                <Select value={time} onValueChange={setTime}>
                  <SelectTrigger><SelectValue placeholder="Select time" /></SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map(t => {
                      const taken = bookedTimesOnDate.has(timeLabelToDbFormat(t));
                      return (
                        <SelectItem key={t} value={t} disabled={taken && !overrideSlot}>
                          <span className={taken ? 'text-gray-400 line-through' : ''}>{t}</span>
                          {taken && <span className="ml-2 text-[10px] text-amber-600 font-semibold">TAKEN</span>}
                        </SelectItem>
                      );
                    })}
                    <div className="px-2 py-1.5 text-[10px] font-semibold text-amber-600 uppercase tracking-wide">After Hours (+$50)</div>
                    {AFTER_HOURS_SLOTS.map(t => {
                      const taken = bookedTimesOnDate.has(timeLabelToDbFormat(t));
                      return (
                        <SelectItem key={t} value={t} disabled={taken && !overrideSlot}>
                          <span className={taken ? 'text-gray-400 line-through' : ''}>{t} ⏰</span>
                          {taken && <span className="ml-2 text-[10px] text-amber-600 font-semibold">TAKEN</span>}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {bookedTimesOnDate.size > 0 && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    {bookedTimesOnDate.size} slot{bookedTimesOnDate.size > 1 ? 's' : ''} already taken on {date}. Toggle Override below to book anyway.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <Checkbox id="override-slot" checked={overrideSlot} onCheckedChange={(c) => setOverrideSlot(c === true)} className="mt-0.5" />
              <label htmlFor="override-slot" className="text-sm cursor-pointer">
                <span className="font-medium text-orange-800">Override Availability</span>
                <p className="text-xs text-orange-600 mt-0.5">Bypass slot blocking for urgent bookings.</p>
              </label>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label>Address</Label>
                {(selectedPatient || patientEmail || patientPhone) && (
                  <button
                    type="button"
                    onClick={lookupSavedAddress}
                    className="text-xs text-[#B91C1C] hover:underline"
                  >
                    {lookupStatus === 'searching' ? 'Looking up…' : '↻ Look up saved address'}
                  </button>
                )}
              </div>
              <AddressAutocomplete
                value={address}
                onChange={(v) => setAddress(v)}
                onPlaceSelected={(place) => {
                  // Store the street-only portion in the address field;
                  // city + zip get their own fields below. Previously we
                  // crammed the full "street, city, state zip" string
                  // into address AND left city/zip blank — admin had to
                  // retype them. Now the picker fills all three at once.
                  setAddress(place.address || place.street || '');
                  if (place.city) setCity(place.city);
                  if (place.zipCode) setZipcode(place.zipCode);
                }}
                placeholder="Start typing — Google suggests"
              />
              {lookupStatus === 'found' && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 mt-1">
                  ✓ Loaded saved address from patient profile.
                </p>
              )}
              {lookupStatus === 'missing' && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                  ⚠ Patient on file but no address saved yet — ask the patient; we'll save it back for next time.
                </p>
              )}
              {lookupStatus === 'no-match' && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                  ⚠ No matching patient in our records by that email/phone.
                </p>
              )}
              {lookupStatus === 'idle' && selectedPatient && !address && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                  ⚠ No address loaded. Click "Look up saved address" or type manually.
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>City</Label>
                <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Orlando" />
              </div>
              <div>
                <Label>Zip Code</Label>
                <Input value={zipcode} onChange={e => setZipcode(e.target.value)} placeholder="32801" />
              </div>
              <div>
                <Label>Gate Code</Label>
                <Input value={gateCode} onChange={e => setGateCode(e.target.value)} placeholder="#1234" />
              </div>
            </div>
            <div>
              <Label>Lab Destination <span className="text-xs text-muted-foreground font-normal">— Where to deliver samples</span></Label>
              <Input
                value={labDestination}
                onChange={e => setLabDestination(e.target.value)}
                placeholder="e.g. Quest Diagnostics - Orlando, LabCorp - Winter Park"
                list="common-labs"
              />
              <datalist id="common-labs">
                <option value="Quest Diagnostics - Orlando" />
                <option value="LabCorp - Orlando" />
                <option value="LabCorp - Winter Park" />
                <option value="Quest Diagnostics - Winter Park" />
                <option value="AdventHealth Lab" />
                <option value="Orlando Health Lab" />
              </datalist>
              <p className="text-xs text-muted-foreground mt-1">
                Visible to the phleb on their appointment card. Leave blank if patient brings their own requisition.
              </p>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Special instructions, gate code, parking..." rows={2} />
            </div>

            {/* Family / companion visits — add unlimited additional family members
                at the same address + time slot. Each pays the tier-aware companion
                price. UI scales from 0 → N companions inline (no modal jump). */}
            <div className={`border-2 rounded-lg p-3 ${addCompanion ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}>
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5">👨‍👩‍👧‍👦</span>
                <div className="flex-1">
                  <div className="text-sm font-semibold">
                    Family at the same address
                    {companions.length > 0 && (
                      <span className="ml-2 text-[11px] font-normal text-blue-800">
                        · {companions.length} added · +${companionAdd.toFixed(0)}
                        {freeCompanionSlots > 0 && (
                          <span className="ml-1 text-emerald-700 font-semibold">
                            ({Math.min(companions.length, freeCompanionSlots)} FREE
                            {freeCompanionSlots === 1 ? ' · Founding VIP perk' : ' · Concierge perk'})
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {freeCompanionSlots > 0 ? (
                      <>
                        <strong className="text-emerald-700">
                          First {freeCompanionSlots === 2 ? '2 family members FREE' : 'family member FREE'}
                        </strong>
                        {' '}({freeCompanionSlots === 1 ? 'Founding VIP perk' : 'Concierge perk'}).
                        Additional: ${companionPrice} each ({detectedTier.toUpperCase()} rate).
                      </>
                    ) : (
                      <>
                        Each additional family member: <strong>${companionPrice}</strong>
                        {detectedTier !== 'none' && <span className="ml-1">({detectedTier.toUpperCase()} rate · saves ${75 - companionPrice} each vs non-member)</span>}
                        {detectedTier === 'none' && <span className="ml-1">($75 non-member · members save up to $40 each)</span>}
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* List of currently-added companions */}
              {companions.length > 0 && (
                <div className="mt-3 space-y-2">
                  {companions.map((c, idx) => {
                    const isFreeSlot = idx < freeCompanionSlots;
                    return (
                    <div key={c.id} className={`bg-white border rounded-lg p-2.5 space-y-2 ${isFreeSlot ? 'border-emerald-300 bg-emerald-50/30' : 'border-blue-200'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-blue-900">
                          Family member {idx + 2}
                          {isFreeSlot ? (
                            <span className="ml-2 text-[10px] font-semibold text-emerald-700">FREE · {detectedTier === 'concierge' ? 'Concierge' : 'Founding VIP'} perk</span>
                          ) : (
                            <span className="ml-2 text-[10px] font-normal text-gray-500">+${companionPrice}</span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeCompanion(c.id)}
                          className="text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 rounded px-2 py-0.5"
                          aria-label="Remove this family member"
                        >Remove</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px]">Name *</Label>
                          <Input
                            value={c.name}
                            onChange={e => updateCompanion(c.id, { name: e.target.value })}
                            placeholder="Jane Smith"
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px]">Relationship</Label>
                          <select
                            value={c.relationship}
                            onChange={e => updateCompanion(c.id, { relationship: e.target.value as any })}
                            className="w-full h-9 border rounded-md px-2 text-sm bg-white"
                          >
                            <option>Spouse</option><option>Child</option><option>Parent</option><option>Sibling</option><option>Other</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <Label className="text-[10px]">DOB (optional)</Label>
                        <Input
                          type="date"
                          value={c.dob}
                          onChange={e => updateCompanion(c.id, { dob: e.target.value })}
                          className="h-9"
                        />
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}

              {/* Add-another button — label reflects perk status */}
              <button
                type="button"
                onClick={addCompanionRow}
                className="mt-3 w-full text-center text-[12px] font-semibold py-2 rounded-lg border-2 border-dashed border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400 transition"
              >
                + Add {companions.length === 0 ? 'a family member' : 'another family member'}
                {companions.length < freeCompanionSlots
                  ? <span className="text-emerald-700"> (FREE — {detectedTier === 'concierge' ? 'Concierge' : 'Founding VIP'} perk)</span>
                  : <span> (+${companionPrice} each)</span>}
              </button>

              {companions.length > 0 && (
                <p className="text-[11px] text-blue-800 bg-white/60 rounded p-1.5 mt-2">
                  {companions.length} extra appointment{companions.length === 1 ? '' : 's'} will be created at the same address + time, linked to {patientName || 'the primary'} via family_group_id. One invoice covers everyone. Tubes + supplies scale per person.
                </p>
              )}
            </div>

            {/* Specialty-kit bundle controls — appears only for `specialty-kit*`
                services. Mirrors the patient-facing booking flow's bundle card. */}
            {isSpecialtyKitService && (
              <div className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-white rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-bold text-purple-900">🧪 Specialty Kits</span>
                  {specialtyBundleBreakdown?.bundleSavings ? (
                    <span className="ml-auto text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                      {specialtyBundleBreakdown.bundleLabel}
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px]">Primary kits</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <button type="button" onClick={() => setPrimaryKitsCount(Math.max(1, primaryKitsCount - 1))}
                        className="h-8 w-8 rounded-md border border-gray-300 bg-white flex items-center justify-center hover:bg-gray-50 disabled:opacity-30" disabled={primaryKitsCount <= 1}>−</button>
                      <span className="w-8 text-center font-mono font-bold">{primaryKitsCount}</span>
                      <button type="button" onClick={() => setPrimaryKitsCount(Math.min(6, primaryKitsCount + 1))}
                        className="h-8 w-8 rounded-md border border-gray-300 bg-white flex items-center justify-center hover:bg-gray-50 disabled:opacity-30" disabled={primaryKitsCount >= 6}>+</button>
                    </div>
                  </div>
                  {/* Per-companion kit count for multi-family bundles */}
                  {companions.map((c, idx) => (
                    <div key={c.id}>
                      <Label className="text-[11px]">{c.name || `Family member ${idx + 2}`} kits</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <button type="button" onClick={() => updateCompanion(c.id, { kitsCount: Math.max(1, c.kitsCount - 1) })}
                          className="h-8 w-8 rounded-md border border-gray-300 bg-white flex items-center justify-center hover:bg-gray-50 disabled:opacity-30" disabled={c.kitsCount <= 1}>−</button>
                        <span className="w-8 text-center font-mono font-bold">{c.kitsCount}</span>
                        <button type="button" onClick={() => updateCompanion(c.id, { kitsCount: Math.min(6, c.kitsCount + 1) })}
                          className="h-8 w-8 rounded-md border border-gray-300 bg-white flex items-center justify-center hover:bg-gray-50 disabled:opacity-30" disabled={c.kitsCount >= 6}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
                {specialtyBundleBreakdown?.bundleSavings ? (
                  <p className="text-[11px] text-emerald-700 mt-2">
                    Volume discount: <strong>save ${specialtyBundleBreakdown.bundleSavings.toFixed(0)}</strong> vs unbundled.
                  </p>
                ) : null}
              </div>
            )}

            {/* Pricing & Invoicing */}
            <div className="border-t pt-3">
              <Label className="text-sm font-semibold">Pricing & Invoice</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button type="button" onClick={() => { setDiscountType('none'); setDiscountValue(''); }}
                  className={`p-2.5 rounded-lg border-2 text-xs font-medium transition-all text-left ${
                    discountType === 'none' ? 'border-[#B91C1C] bg-[#B91C1C]/10 text-[#B91C1C]' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <span className="block font-semibold">Full Price</span>
                  <span className="block text-[10px] opacity-70 mt-0.5">Invoice sent to patient</span>
                </button>
                <button type="button" onClick={() => { setDiscountType('waive'); setDiscountValue(''); }}
                  className={`p-2.5 rounded-lg border-2 text-xs font-medium transition-all text-left ${
                    discountType === 'waive' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <span className="block font-semibold">Waive Fee</span>
                  <span className="block text-[10px] opacity-70 mt-0.5">No invoice, marked as paid</span>
                </button>
                <button type="button" onClick={() => { setDiscountType('percentage'); setDiscountValue(''); }}
                  className={`p-2.5 rounded-lg border-2 text-xs font-medium transition-all text-left ${
                    discountType === 'percentage' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <span className="block font-semibold">% Discount</span>
                  <span className="block text-[10px] opacity-70 mt-0.5">Percentage off base price</span>
                </button>
                <button type="button" onClick={() => { setDiscountType('fixed'); setDiscountValue(''); }}
                  className={`p-2.5 rounded-lg border-2 text-xs font-medium transition-all text-left ${
                    discountType === 'fixed' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <span className="block font-semibold">$ Discount</span>
                  <span className="block text-[10px] opacity-70 mt-0.5">Fixed dollar amount off</span>
                </button>
                <button type="button" onClick={() => { setDiscountType('custom'); setDiscountValue(''); }}
                  className={`p-2.5 rounded-lg border-2 text-xs font-medium transition-all text-left col-span-2 ${
                    discountType === 'custom' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <span className="block font-semibold">Custom Price</span>
                  <span className="block text-[10px] opacity-70 mt-0.5">Override total with any dollar amount</span>
                </button>
              </div>

              {/* Custom price input */}
              {discountType === 'custom' && (
                <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <Label className="text-xs font-medium text-purple-900">Custom Total ($)</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-muted-foreground">$</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discountValue}
                      onChange={e => setDiscountValue(e.target.value)}
                      placeholder="e.g. 125.00"
                      className="flex-1"
                      autoFocus
                    />
                  </div>
                  <p className="text-[11px] text-purple-700 mt-1">
                    Normal price with surcharges: <span className="font-semibold">${(previewBasePrice + previewSurchargeTotal).toFixed(2)}</span>. Entering a custom amount overrides this total.
                  </p>
                </div>
              )}

              {/* Discount amount input */}
              {(discountType === 'percentage' || discountType === 'fixed') && (
                <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                  <Label className="text-xs font-medium">
                    {discountType === 'percentage' ? 'Discount Percentage' : 'Discount Amount ($)'}
                  </Label>
                  <div className="flex items-center gap-2 mt-1">
                    {discountType === 'percentage' && <span className="text-sm text-muted-foreground">%</span>}
                    {discountType === 'fixed' && <span className="text-sm text-muted-foreground">$</span>}
                    <Input
                      type="number"
                      min="0"
                      max={discountType === 'percentage' ? '100' : undefined}
                      value={discountValue}
                      onChange={e => setDiscountValue(e.target.value)}
                      placeholder={discountType === 'percentage' ? 'e.g. 25' : 'e.g. 50'}
                      className="flex-1"
                      autoFocus
                    />
                  </div>
                  {discountValue && (
                    <p className="text-xs text-emerald-600 mt-1 font-medium">
                      Final price: ${(() => {
                        const base = getServicePrice(serviceType, 'none');
                        if (discountType === 'percentage') return Math.round(base * (1 - (parseFloat(discountValue) || 0) / 100) * 100) / 100;
                        return Math.max(base - (parseFloat(discountValue) || 0), 0);
                      })().toFixed(2)}
                    </p>
                  )}
                </div>
              )}

              {/* Status messages */}
              {discountType === 'waive' && (
                <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <p className="text-xs text-emerald-700 font-medium">Fee waived — no invoice, appointment marked as paid.</p>
                </div>
              )}
              {discountType === 'none' && (
                <p className="text-xs text-muted-foreground mt-2">
                  Stripe invoice for <span className="font-semibold">${getServicePrice(serviceType, 'none')}</span> → {patientEmail || 'patient email'}
                </p>
              )}
            </div>

            {/* Partner organization picker — auto-applies rules */}
            <div className="border-t pt-3">
              <Label className="text-sm font-medium">Partner Organization <span className="text-muted-foreground font-normal">(if applicable)</span></Label>
              <Select value={selectedOrgId || '__none__'} onValueChange={(v) => setSelectedOrgId(v === '__none__' ? '' : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="No organization — standard patient booking" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None — standard patient booking</SelectItem>
                  {organizations.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedOrg && (
                <div className="mt-2 rounded-lg border p-3 bg-blue-50 border-blue-200 text-xs space-y-1">
                  {Array.isArray(selectedOrg.time_window_rules) && selectedOrg.time_window_rules.length > 0 && (
                    <p className="text-blue-900">
                      <strong>⏰ Allowed times:</strong>{' '}
                      {selectedOrg.time_window_rules.map((r: any, i: number) => (
                        <span key={i} className="inline-block mr-2">
                          {r.label || `${r.startHour}:00 – ${r.endHour}:00`}
                        </span>
                      ))}
                    </p>
                  )}
                  <p className="text-blue-900">
                    <strong>💰 Billed to:</strong>{' '}
                    {selectedOrg.default_billed_to === 'org'
                      ? `${selectedOrg.name} ($${((selectedOrg.org_invoice_price_cents || 0) / 100).toFixed(2)}/visit)`
                      : `Patient${selectedOrg.locked_price_cents ? ` ($${(selectedOrg.locked_price_cents / 100).toFixed(2)})` : ''}`}
                  </p>
                  {selectedOrg.show_patient_name_on_appointment === false && (
                    <p className="text-blue-900"><strong>🔒 Privacy:</strong> Patient name will be masked in admin/phleb views.</p>
                  )}
                  {selectedOrg.member_stacking_rule === 'lowest_wins' && (
                    <p className="text-blue-900"><strong>🎁 Stacking:</strong> Member tier wins if cheaper than partner rate.</p>
                  )}
                </div>
              )}
            </div>

            {/* Fallback: manual org billing (when no partner dropdown row exists) */}
            {!selectedOrg && (
              <div className="border-t pt-3">
                <div className="flex items-start gap-3">
                  <Checkbox id="org-billing" checked={orgBilling} onCheckedChange={(c) => setOrgBilling(c === true)} className="mt-1" />
                  <label htmlFor="org-billing" className="text-sm cursor-pointer">
                    <span className="font-medium">Bill manually to an organization</span>
                    <p className="text-xs text-muted-foreground">Use if no partner row exists for this customer yet.</p>
                  </label>
                </div>
                {orgBilling && (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <Input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Org name" />
                    <Input type="email" value={orgEmail} onChange={e => setOrgEmail(e.target.value)} placeholder="billing@org.com" />
                  </div>
                )}
              </div>
            )}

            <div>
              <Label className="text-xs">Invoice Memo (optional)</Label>
              <Input value={invoiceMemo} onChange={e => setInvoiceMemo(e.target.value)} placeholder="e.g. Patient: John Doe - Annual Wellness" />
            </div>

            {/* Visible hint when the Review button is disabled — tells the
                admin exactly what's missing so "button does nothing" never
                appears to be a bug again. */}
            {!canGoToStep3 && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                ⚠ Pick {(!date ? 'a Date' : '')}{(!date && !time) ? ' and ' : ''}{(!time ? 'a Time' : '')} above to continue.
              </div>
            )}
            {/* Partner-window preview warning — shown BEFORE clicking Next so
                admin sees the issue and can either change time/org or flip
                Override Availability to bypass. Previously this was a
                post-click toast that was easy to miss. */}
            {(() => {
              if (!date || !time || !selectedOrg || !Array.isArray(selectedOrg.time_window_rules)) return null;
              let hh = 0, mm = 0;
              if (time.includes('AM') || time.includes('PM')) {
                const [tp, period] = time.split(' ');
                const [h, m] = tp.split(':').map(Number);
                hh = period === 'PM' && h !== 12 ? h + 12 : (period === 'AM' && h === 12 ? 0 : h);
                mm = m || 0;
              } else { [hh, mm] = time.split(':').map(Number); }
              const hour = hh + mm / 60;
              const dow = new Date(date + 'T12:00:00').getDay();
              const inWindow = (selectedOrg.time_window_rules as any[]).some((r: any) =>
                r.dayOfWeek.includes(dow) && hour >= r.startHour && hour < r.endHour
              );
              if (inWindow) return null;
              const wins = (selectedOrg.time_window_rules as any[]).map((r: any) => r.label || `${r.startHour}-${r.endHour}`).join(' · ');
              return (
                <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded p-2">
                  🚫 <strong>{selectedOrg.name}</strong> normally only allows bookings: <strong>{wins}</strong>. Your pick ({new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })} at {time}) is outside that window.
                  <span className="block mt-1 text-[11px]">To book anyway, flip <strong>Override Availability</strong> above — it now bypasses partner time rules as well as slot conflicts.</span>
                </div>
              );
            })()}
            {/* Member-hours warning — flags when the appointment's END time
                spills past 12:00 PM (weekday members-only territory) AND
                the patient is not a VIP/Concierge. Hormozi rule: admin
                should know the moment they're scheduling against the
                membership promise, not after the member complains. */}
            {(() => {
              if (!date || !time) return null;
              // Parse time to hour float
              let hh = 0, mm = 0;
              if (time.includes('AM') || time.includes('PM')) {
                const [tp, period] = time.split(' ');
                const [h, m] = tp.split(':').map(Number);
                hh = period === 'PM' && h !== 12 ? h + 12 : (period === 'AM' && h === 12 ? 0 : h);
                mm = m || 0;
              } else { [hh, mm] = time.split(':').map(Number); }
              const startHour = hh + (mm / 60);
              const durationMap: Record<string, number> = {
                'therapeutic': 75, 'specialty-kit': 75, 'specialty-kit-genova': 80,
                'partner-nd-wellness': 65, 'partner-aristotle-education': 75,
              };
              const durationMin = durationMap[serviceType] || 60;
              const endHour = startHour + (durationMin / 60);
              const dow = new Date(date + 'T12:00:00').getDay();
              const isWeekday = dow >= 1 && dow <= 5;
              const crossesNoon = endHour > 12 && startHour < 14; // ends after noon but before VIP cutoff
              const patientIsMember = detectedTier === 'vip' || detectedTier === 'concierge';
              const isPartner = String(serviceType || '').startsWith('partner-');
              if (!isWeekday || !crossesNoon || patientIsMember || isPartner) return null;
              const endLabel = (() => {
                const eh = Math.floor(endHour); const em = Math.round((endHour - eh) * 60);
                const period = eh >= 12 ? 'PM' : 'AM';
                const h12 = eh > 12 ? eh - 12 : eh === 0 ? 12 : eh;
                return `${h12}:${String(em).padStart(2, '0')} ${period}`;
              })();
              return (
                <div className="text-xs text-amber-900 bg-amber-50 border-2 border-amber-300 rounded p-2.5">
                  <div className="font-bold mb-1">⚠ Running into member-only hours</div>
                  <div>This visit starts at <strong>{time}</strong> and ends at <strong>{endLabel}</strong> ({durationMin} min). Mon–Fri after <strong>12:00 PM</strong> is reserved for VIP/Concierge members.</div>
                  <div className="mt-1.5 text-[11px]">
                    {detectedTier === 'none'
                      ? <>This patient is a non-member. Either <strong>move the appointment earlier</strong>, <strong>upgrade them to VIP</strong>, or flip <strong>Override Availability</strong> above to book anyway.</>
                      : <>This patient is a <strong>Member ($99/yr)</strong> tier — same window as non-members. VIP upgrade removes this restriction.</>}
                  </div>
                </div>
              );
            })()}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => {
                console.log('[schedule] Next:Review clicked', { date, time, selectedOrg: selectedOrg?.name, canGoToStep3, overrideSlot });
                if (!date || !time) {
                  toast.error('Pick a date and time before continuing');
                  return;
                }
                // Partner time-window guard: reject advance if admin picked an org
                // and the time is outside the org's allowed window. Override
                // Availability bypasses this too (admin explicit override).
                if (!overrideSlot && selectedOrg && Array.isArray(selectedOrg.time_window_rules) && time && date) {
                  let hh = 0, mm = 0;
                  if (time.includes('AM') || time.includes('PM')) {
                    const [tp, period] = time.split(' ');
                    const [h, m] = tp.split(':').map(Number);
                    hh = period === 'PM' && h !== 12 ? h + 12 : (period === 'AM' && h === 12 ? 0 : h);
                    mm = m || 0;
                  } else {
                    [hh, mm] = time.split(':').map(Number);
                  }
                  const hour = hh + mm / 60;
                  const dow = new Date(date + 'T12:00:00').getDay();
                  const inWindow = (selectedOrg.time_window_rules as any[]).some((r: any) =>
                    r.dayOfWeek.includes(dow) && hour >= r.startHour && hour < r.endHour
                  );
                  if (!inWindow) {
                    const wins = (selectedOrg.time_window_rules as any[]).map((r: any) => r.label || `${r.startHour}-${r.endHour}`).join(' · ');
                    toast.error(`${selectedOrg.name} only allows bookings: ${wins}. Pick a time in range or change org.`);
                    return;
                  }
                }
                setStep(3);
              }} disabled={!canGoToStep3}>Next: Review <ArrowRight className="ml-1 h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Patient</span><span className="font-medium">{patientName}</span></div>
              {patientEmail && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{patientEmail}</span></div>}
              {patientPhone && <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{patientPhone}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Service</span><span className="font-medium">{SERVICE_TYPES.find(s => s.value === serviceType)?.label} — ${previewBasePrice}</span></div>
              {previewSurcharges.map((sc, i) => (
                <div key={i} className="flex justify-between text-xs"><span className="text-amber-600">+ {sc.label}</span><span className="text-amber-600">+${sc.amount}</span></div>
              ))}
              <div className="flex justify-between border-t pt-1 mt-1"><span className="font-semibold">Total</span><span className="font-bold text-[#B91C1C]">${previewTotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-medium">{time}</span></div>
              {address && <div className="flex justify-between"><span className="text-muted-foreground">Address</span><span>{[address, city, zipcode].filter(Boolean).join(', ')}</span></div>}
              {isVip && <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-medium text-amber-700 flex items-center gap-1"><Crown className="h-3.5 w-3.5" /> VIP</span></div>}
              {discountType !== 'none' && (
                <div className="flex justify-between"><span className="text-muted-foreground">{discountType === 'custom' ? 'Custom Price' : 'Discount'}</span><span className="font-medium text-emerald-700">
                  {discountType === 'waive' ? 'Fee Waived ($0)'
                    : discountType === 'custom' ? `Overridden to $${parseFloat(discountValue || '0').toFixed(2)}`
                    : discountType === 'percentage' ? `${discountValue}% off`
                    : `$${parseFloat(discountValue || '0').toFixed(2)} off`}
                </span></div>
              )}
              {orgBilling && <div className="flex justify-between"><span className="text-muted-foreground">Bill To</span><span>{orgName} ({orgEmail})</span></div>}
              {invoiceMemo && <div className="flex justify-between"><span className="text-muted-foreground">Memo</span><span className="text-xs">{invoiceMemo}</span></div>}
              {overrideSlot && <div className="flex justify-between"><span className="text-muted-foreground">Override</span><span className="text-orange-700">Availability Override Active</span></div>}
              {notes && <div className="flex justify-between"><span className="text-muted-foreground">Notes</span><span className="text-xs">{notes}</span></div>}
            </div>

            {!discountType || discountType === 'none' ? (
              <p className="text-xs text-muted-foreground text-center">An invoice for ${getServicePrice(serviceType, 'none')} will be sent to the patient via Stripe.</p>
            ) : discountType === 'waive' ? (
              <p className="text-xs text-emerald-600 text-center">Fee waived — no invoice will be sent.</p>
            ) : null}

            {/* PRICING SANITY GUARD — Hormozi: when admin's custom price is
                lower than the calculated total, surface a loud warning so
                we don't silently lose $100+ on a typo. Kandace Bennett
                2026-05-12: admin typed $100 over a calculated $200,
                missing the same-day surcharge. Showed up in Stripe as
                undercharge until manually fixed. */}
            {discountType === 'custom' && (() => {
              const calculatedTotal = previewBasePrice + previewSurcharges.reduce((s, x) => s + x.amount, 0);
              const customVal = parseFloat(discountValue || '0');
              if (customVal >= calculatedTotal) return null;
              const gap = calculatedTotal - customVal;
              return (
                <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-3 text-sm">
                  <p className="font-bold text-amber-900 flex items-center gap-1.5">
                    ⚠ Custom price is ${gap.toFixed(2)} LESS than calculated
                  </p>
                  <p className="text-xs text-amber-800 mt-1">
                    Charging <strong>${customVal.toFixed(2)}</strong> instead of the calculated <strong>${calculatedTotal.toFixed(2)}</strong>:
                  </p>
                  <ul className="text-[11px] text-amber-800 mt-1 ml-4 list-disc">
                    <li>Base ({SERVICE_TYPES.find(s => s.value === serviceType)?.label}): ${previewBasePrice.toFixed(2)}</li>
                    {previewSurcharges.map((sc, i) => <li key={i}>{sc.label}: +${sc.amount.toFixed(2)}</li>)}
                  </ul>
                  <p className="text-[11px] text-amber-900 mt-1.5 font-medium">
                    Sure this is right? If yes, click Schedule below. Otherwise go back and clear the Custom Price.
                  </p>
                </div>
              );
            })()}

            {/* AUTO-LINK PREVIEW — if a pending lab request exists for this
                patient from a provider's office, the DB trigger will
                auto-link it on submit. Show that here so admin sees the
                expected attribution before clicking Schedule. */}
            <AutoLinkPreview
              patientEmail={patientEmail}
              patientPhone={patientPhone}
              patientName={patientName}
              onMatch={(m) => setMatchedLabRequest(m ? { id: m.id, organization_id: m.organization_id, providerPaymentStatus: m.providerPaymentStatus, billedTo: m.billedTo } : null)}
            />

            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <p className="font-medium">Error:</p>
                <p className="text-xs mt-1">{submitError}</p>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => { setStep(2); setSubmitError(''); }}>Back</Button>
              <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white">
                {isSubmitting ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Scheduling...</> : 'Schedule Appointment'}
              </Button>
            </div>
          </div>
        )}
        </AdminErrorBoundary>
      </DialogContent>
    </Dialog>

    {/* Referral-credit redemption modal — fires when patient has unredeemed credits */}
    <Dialog open={referralModalOpen} onOpenChange={setReferralModalOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">🎁</span>
            {patientName.split(' ')[0] || 'This patient'} has referral credits
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Ask the patient: <strong className="text-gray-900">&quot;You have ${(referralCredits.reduce((s, c) => s + c.amount_cents, 0) / 100).toFixed(2)} in referral credits. Would you like to redeem them on today&apos;s visit?&quot;</strong>
          </p>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1.5">
            {referralCredits.map((c) => (
              <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={redeemReferralIds.includes(c.id)}
                  onChange={(e) => {
                    setRedeemReferralIds(prev =>
                      e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id)
                    );
                  }}
                  className="rounded"
                />
                <span className="text-sm flex-1">
                  <strong className="text-emerald-800">${(c.amount_cents / 100).toFixed(2)}</strong>
                  {c.description && <span className="text-emerald-700 ml-1">— {c.description}</span>}
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setRedeemReferralIds([]); setReferralModalOpen(false); }}>
              Don&apos;t apply (save for later)
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setReferralModalOpen(false)}
              disabled={redeemReferralIds.length === 0}
            >
              Apply ${(referralCredits.filter(c => redeemReferralIds.includes(c.id)).reduce((s, c) => s + c.amount_cents, 0) / 100).toFixed(2)} to this visit
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
};

// ──────────────────────────────────────────────────────────────────
// AutoLinkPreview — on Step 3 of the modal, queries patient_lab_requests
// for any pending order matching the patient. If found, shows a green
// banner so the admin sees the linkage that the DB trigger will make on
// submit. Prevents the Kandace Bennett gap (manual booking → no link →
// false "no lab order" alert).
// ──────────────────────────────────────────────────────────────────
/**
 * AutoLinkPreview — now also EMITS the matched row upward so the parent
 * modal can include lab_request_id (+ prepaid flags) in the appointment
 * insert. Without that the trigger-based prepaid detection can't fire
 * because the appointment is never linked.
 *
 * Pre-fix this component was display-only; the comment claimed "DB
 * trigger will make on submit" but no such trigger existed. Result: Elite
 * Medical Concierge prepaid orders went un-linked, the appointment got a
 * fresh invoice, and the org was double-billed. (2026-05-20 audit.)
 */
interface AutoLinkMatch {
  id: string;
  organization_id: string | null;
  orgName: string;
  createdAt: string;
  hasFile: boolean;
  /** When 'completed', the org has already paid via lab-request checkout. */
  providerPaymentStatus: string | null;
  providerPaidAt: string | null;
  billedTo: string | null;
}

const AutoLinkPreview: React.FC<{
  patientEmail: string;
  patientPhone: string;
  patientName: string;
  onMatch?: (m: AutoLinkMatch | null) => void;
}> = ({ patientEmail, patientPhone, patientName, onMatch }) => {
  const [match, setMatch] = React.useState<AutoLinkMatch | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const phoneDigits = (patientPhone || '').replace(/\D/g, '');
      const last10 = phoneDigits.slice(-10);
      if (!patientEmail && !last10 && !patientName) {
        if (!cancelled) { setMatch(null); onMatch?.(null); }
        return;
      }
      try {
        const filters: string[] = [];
        if (patientEmail) filters.push(`patient_email.ilike.${patientEmail}`);
        if (last10) filters.push(`patient_phone.ilike.%${last10}`);
        if (patientName) filters.push(`patient_name.ilike.${patientName}`);
        if (filters.length === 0) return;
        const { data } = await supabase
          .from('patient_lab_requests' as any)
          .select('id, organization_id, lab_order_file_path, created_at, patient_email, patient_phone, patient_name, status, provider_payment_status, provider_paid_at, billed_to, organizations(name)')
          .or(filters.join(','))
          .in('status', ['pending_schedule', 'expired'] as any)
          .is('appointment_id', null)
          .gt('created_at', new Date(Date.now() - 90 * 86400000).toISOString())
          .order('created_at', { ascending: false })
          .limit(1);
        if (cancelled) return;
        const row = (data as any[])?.[0];
        if (row) {
          const m: AutoLinkMatch = {
            id: row.id,
            organization_id: row.organization_id || null,
            orgName: row.organizations?.name || 'a provider\'s office',
            createdAt: row.created_at,
            hasFile: !!row.lab_order_file_path,
            providerPaymentStatus: row.provider_payment_status || null,
            providerPaidAt: row.provider_paid_at || null,
            billedTo: row.billed_to || null,
          };
          setMatch(m);
          onMatch?.(m);
        } else {
          setMatch(null);
          onMatch?.(null);
        }
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [patientEmail, patientPhone, patientName]);

  if (!match) return null;
  const created = new Date(match.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const isPrepaid = match.providerPaymentStatus === 'completed';
  return (
    <div className={`border-2 rounded-lg p-3 text-sm ${isPrepaid ? 'bg-purple-50 border-purple-300' : 'bg-emerald-50 border-emerald-300'}`}>
      <p className={`font-bold flex items-center gap-1.5 ${isPrepaid ? 'text-purple-900' : 'text-emerald-900'}`}>
        {isPrepaid ? '💰' : '✨'} {isPrepaid ? `Already paid by ${match.orgName} — no invoice will fire` : `Will auto-link to ${match.orgName}'s lab order`}
      </p>
      <p className={`text-xs mt-1 ${isPrepaid ? 'text-purple-800' : 'text-emerald-800'}`}>
        {match.orgName} submitted a lab order for this patient on {created}.
        {match.hasFile ? ' The PDF will auto-attach.' : ' No PDF on file yet — admin will need to attach one separately.'}
        {isPrepaid && match.providerPaidAt ? ` Paid by org on ${new Date(match.providerPaidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.` : ''}
      </p>
      <p className={`text-[11px] mt-1 italic ${isPrepaid ? 'text-purple-700' : 'text-emerald-700'}`}>
        {isPrepaid
          ? 'This appointment will be marked prepaid on save — no chase invoices, no double-billing.'
          : 'The system links it the moment you click Schedule.'}
      </p>
    </div>
  );
};

export default ScheduleAppointmentModal;
