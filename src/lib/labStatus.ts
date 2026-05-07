/**
 * labStatus — small client-side helpers for the new labs table.
 *
 * Provides:
 *   - getLabHoursStatus(lab) → { open, label, closesInMinutes }
 *     Used by the phleb appointment card to render the "Closes in 18 min"
 *     warning chip before the phleb taps "Route to lab."
 *   - logMileage(args) → fire-and-forget insert into phleb_mileage_log
 *     Stamped every time the phleb taps "Route to" so they get an
 *     IRS-grade audit trail without thinking about it.
 */
import { supabase } from '@/integrations/supabase/client';

export interface LabRow {
  id: string;
  brand: string;
  name: string;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  phone: string | null;
  hours: Record<string, { open: string; close: string } | null> | null;
  is_24_7: boolean;
  accepts_after_hours_drop: boolean;
  notes: string | null;
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export interface LabHoursStatus {
  open: boolean;
  label: string;             // "Open · closes 5:30 PM" / "Closed · opens Mon 6:30 AM" / "Open 24/7"
  closesInMinutes: number | null;
  warning: 'closing_soon' | 'closed' | null;  // for chip color
}

export function getLabHoursStatus(lab: LabRow, now: Date = new Date()): LabHoursStatus {
  if (lab.is_24_7) {
    return { open: true, label: 'Open 24/7', closesInMinutes: null, warning: null };
  }
  if (!lab.hours) {
    return { open: false, label: 'Hours unknown', closesInMinutes: null, warning: null };
  }
  const todayKey = DAYS[now.getDay()];
  const todayBlock = lab.hours[todayKey];

  if (!todayBlock) {
    // Closed today — find next open day for the label
    for (let i = 1; i <= 7; i++) {
      const k = DAYS[(now.getDay() + i) % 7];
      const b = lab.hours[k];
      if (b) {
        const day = k.charAt(0).toUpperCase() + k.slice(1, 3);
        return { open: false, label: `Closed · opens ${day} ${fmt12h(b.open)}`, closesInMinutes: null, warning: 'closed' };
      }
    }
    return { open: false, label: 'Closed', closesInMinutes: null, warning: 'closed' };
  }

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = todayBlock.open.split(':').map(Number);
  const [ch, cm] = todayBlock.close.split(':').map(Number);
  const openMin = oh * 60 + om;
  const closeMin = ch * 60 + cm;

  if (minutesNow < openMin) {
    return { open: false, label: `Opens ${fmt12h(todayBlock.open)}`, closesInMinutes: null, warning: 'closed' };
  }
  if (minutesNow >= closeMin) {
    return { open: false, label: `Closed · closed at ${fmt12h(todayBlock.close)}`, closesInMinutes: null, warning: 'closed' };
  }
  const remaining = closeMin - minutesNow;
  if (remaining <= 30) {
    return { open: true, label: `Closes in ${remaining} min`, closesInMinutes: remaining, warning: 'closing_soon' };
  }
  return { open: true, label: `Open · closes ${fmt12h(todayBlock.close)}`, closesInMinutes: remaining, warning: null };
}

function fmt12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export interface MileageStamp {
  appointmentId?: string | null;
  labId?: string | null;
  tripKind: 'to_patient' | 'to_lab' | 'to_office' | 'other';
  destinationAddress?: string | null;
  destinationZip?: string | null;
  originAddress?: string | null;
  originZip?: string | null;
  estimatedMiles?: number | null;
  notes?: string | null;
}

/**
 * Fire-and-forget mileage stamp. Phleb gets the audit trail without
 * thinking about it. Errors swallowed: this never blocks navigation.
 */
export async function logMileage(args: MileageStamp): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('phleb_mileage_log' as any).insert({
      phleb_user_id: user.id,
      appointment_id: args.appointmentId || null,
      lab_id: args.labId || null,
      trip_kind: args.tripKind,
      origin_address: args.originAddress || null,
      destination_address: args.destinationAddress || null,
      origin_zip: args.originZip || null,
      destination_zip: args.destinationZip || null,
      estimated_miles: args.estimatedMiles ?? null,
      notes: args.notes || null,
    });
  } catch (e) {
    console.warn('[mileage] log failed (non-blocking):', e);
  }
}
