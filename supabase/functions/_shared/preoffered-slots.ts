// Compute 3 pre-offered appointment slots for an SMS message. Shared by
// create-lab-request, remind-lab-request-patients, and twilio-inbound-sms
// (when patient texts "DATES" they get a fresh list).
//
// Strategy: next N business days (weekday-only) starting tomorrow, at 8:00 AM
// ET each day. If fasting is required we keep 8 AM. Stops at draw_by_date.

export interface Slot { date: string; time: string; label: string }

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function computePreofferedSlots(drawByDateIso: string, count = 3): Slot[] {
  const drawBy = new Date(drawByDateIso + 'T23:59:59');
  const now = new Date();
  const slots: Slot[] = [];
  const d = new Date(now);
  d.setDate(d.getDate() + 1); // start tomorrow
  d.setHours(0, 0, 0, 0);

  while (slots.length < count && d.getTime() <= drawBy.getTime()) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) { // skip weekends
      slots.push({
        date: isoDate(d),
        time: '8:00 AM',
        label: `${dayLabel(d)} 8am`,
      });
    }
    d.setDate(d.getDate() + 1);
  }
  return slots;
}

export function formatSlotsForSms(slots: Slot[]): string {
  if (slots.length === 0) return '';
  return slots.map((s, i) => `${i + 1}) ${s.label}`).join(' · ');
}
