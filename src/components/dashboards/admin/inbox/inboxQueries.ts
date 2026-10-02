/**
 * Shared "Needs attention" queries.
 *
 * One definition of what counts as an open action item, used by BOTH the
 * sidebar badge (useAdminBadges) and the Needs-attention screen (InboxTab).
 * Before this file the two were separate hand-copied filters that drifted:
 * the badge counted every open pending_insurance_changes row while the screen
 * hid rows whose patient already had insurance on file; the badge ignored the
 * next_attempt_at snooze and the "referring visit already completed" rule;
 * and partner inquiries were counted on the badge but never listed anywhere
 * in the inbox. The number on the nav and the rows on the screen now come
 * from the same code.
 */
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays } from 'date-fns';

const db = supabase as any;

export type AgingTier = 'fresh' | 'aging' | 'stale';
export function ageTier(iso: string | null | undefined): AgingTier {
  if (!iso) return 'fresh';
  const d = differenceInDays(new Date(), new Date(iso));
  if (d >= 5) return 'stale';
  if (d >= 3) return 'aging';
  return 'fresh';
}

export interface PendingChange {
  id: string;
  appointment_id: string | null;
  appointment_lab_order_id: string | null;
  tenant_patient_id: string | null;
  current_provider: string | null;
  current_member_id: string | null;
  current_group_number: string | null;
  proposed_provider: string | null;
  proposed_member_id: string | null;
  proposed_group_number: string | null;
  status: string;
  created_at: string;
  patient_name: string;
  patient_email: string | null;
  patient_phone: string | null;
}

export interface DiscoveredOrg {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  manager_email: string | null;
  npi: string | null;
  ordering_physician: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  office_phone: string | null;
  outreach_status: string | null;
  outreach_note: string | null;
  referral_count: number | null;
  first_discovered_at: string | null;
  last_referral_at: string | null;
  next_attempt_at: string | null;
  last_attempt_outcome: string | null;
  last_patient_name: string | null;
  last_appointment_date: string | null;
  last_appointment_status: string | null;
}

export interface PartnerInquiry {
  id: string;
  practice_name: string | null;
  contact_name: string | null;
  contact_role: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  practice_type: string | null;
  monthly_patient_volume: string | null;
  notes: string | null;
  referral_source: string | null;
  status: string;
  assigned_to: string | null;
  internal_notes: string | null;
  created_at: string;
}

const TERMINAL_APPT = new Set(['completed', 'specimen_delivered', 'cancelled', 'no_show', 'rescheduled']);

/** Open insurance mismatches whose patient chart still lacks a usable card. */
export async function fetchPendingInsurance(): Promise<PendingChange[]> {
  const { data } = await db
    .from('pending_insurance_changes')
    .select(`
      id, appointment_id, appointment_lab_order_id, tenant_patient_id,
      current_provider, current_member_id, current_group_number,
      proposed_provider, proposed_member_id, proposed_group_number,
      status, created_at,
      tenant_patients!inner(first_name, last_name, email, phone, insurance_provider, insurance_member_id)
    `)
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  return ((data as any[]) || [])
    .filter(r => {
      // Fulfilled the moment a valid card is on the chart (owner rule 2026-05-29).
      const prov = String(r.tenant_patients?.insurance_provider || '').trim();
      const mid = String(r.tenant_patients?.insurance_member_id || '').trim();
      return !(prov && mid);
    })
    .map(r => ({
      ...r,
      patient_name: [r.tenant_patients?.first_name, r.tenant_patients?.last_name].filter(Boolean).join(' ') || 'Patient',
      patient_email: r.tenant_patients?.email || null,
      patient_phone: r.tenant_patients?.phone || null,
    }));
}

/** Auto-discovered practices still missing comms, not snoozed, not unreachable. */
export async function fetchDiscoveredOrgs(): Promise<DiscoveredOrg[]> {
  const { data: orgs } = await db
    .from('organizations')
    .select(`
      id, name, contact_email, contact_phone, manager_email, npi,
      ordering_physician, address_street, address_city, address_state,
      address_zip, office_phone, outreach_status, outreach_note,
      referral_count, first_discovered_at, last_referral_at,
      next_attempt_at, last_attempt_outcome
    `)
    .eq('discovered_from_lab_order', true)
    .eq('is_active', true)
    .or('outreach_status.is.null,outreach_status.in.(pending,untouched,contacted,attempt_logged)')
    .or('manager_email.is.null,contact_email.is.null')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
    .order('referral_count', { ascending: false, nullsFirst: false })
    .order('first_discovered_at', { ascending: false })
    .limit(50);

  const list = (orgs as any[]) || [];
  const ids = list.map(o => o.id);
  const last = new Map<string, { name: string; date: string; status: string | null }>();
  if (ids.length > 0) {
    const { data: appts } = await db
      .from('appointments')
      .select('organization_id, patient_name, appointment_date, status, created_at')
      .in('organization_id', ids)
      .order('created_at', { ascending: false });
    for (const a of (appts as any[]) || []) {
      if (!last.has(a.organization_id)) {
        last.set(a.organization_id, { name: a.patient_name || 'Unknown', date: a.appointment_date, status: a.status || null });
      }
    }
  }
  return list
    .map(o => ({
      ...o,
      last_patient_name: last.get(o.id)?.name || null,
      last_appointment_date: last.get(o.id)?.date || null,
      last_appointment_status: last.get(o.id)?.status || null,
    }))
    // Referring visit already closed → no reason to chase this office now.
    .filter(o => !(o.last_appointment_status && TERMINAL_APPT.has(o.last_appointment_status)));
}

/** Practices that asked to partner and have not had a first response. */
export async function fetchPartnerInquiries(): Promise<PartnerInquiry[]> {
  const { data } = await db
    .from('provider_partnership_inquiries')
    .select('id, practice_name, contact_name, contact_role, contact_email, contact_phone, practice_type, monthly_patient_volume, notes, referral_source, status, assigned_to, internal_notes, created_at')
    .eq('status', 'new')
    .order('created_at', { ascending: false })
    .limit(50);
  return ((data as any[]) || []) as PartnerInquiry[];
}

export interface ActionItemCounts { insurance: number; orgs: number; partners: number; total: number }

/** The badge number — identical to what the Needs-attention screen lists. */
export async function countActionItems(): Promise<ActionItemCounts> {
  const [ins, orgs, partners] = await Promise.all([
    fetchPendingInsurance().catch(() => [] as PendingChange[]),
    fetchDiscoveredOrgs().catch(() => [] as DiscoveredOrg[]),
    fetchPartnerInquiries().catch(() => [] as PartnerInquiry[]),
  ]);
  return { insurance: ins.length, orgs: orgs.length, partners: partners.length, total: ins.length + orgs.length + partners.length };
}

/** Admin dashboard base path for the current role (mirrors LabOrdersTab). */
export function adminBasePath(role: string | undefined | null): string {
  return `/dashboard/${role === 'office_manager' ? 'office_manager' : 'super_admin'}`;
}
