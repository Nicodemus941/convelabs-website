import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CalendarClock, Loader2, AlertTriangle, DollarSign, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * ADMIN / OWNER RESCHEDULE MODAL
 *
 * Hardened reschedule flow for admin + owner. Mirrors the guardrails the
 * patient-facing PatientRescheduleModal has, so an admin can't accidentally
 * create a booking problem the patient flow would have blocked.
 *
 * Guardrails:
 *   - Cannot pick a past date (HTML min + JS defensive check)
 *   - Cannot pick a date blocked in `time_blocks` (fetched on date change)
 *   - Booked time slots appear dim + unclickable (queries appointments + slot_holds)
 *   - After-hours surcharge is SHOWN explicitly before save ($50 preview)
 *   - Audit trail written to both `activity_log` and `booking_audit_log`
 *   - Owner gets an SMS when an admin reschedules (visibility)
 *   - Noon-anchored appointment_date for timezone stability
 */

interface RescheduleAppointmentModalProps {
  appointment: any;
  open: boolean;
  onClose: () => void;
  onRescheduled: () => void;
}

const TIME_SLOTS = [
  '6:00 AM', '6:30 AM', '7:00 AM', '7:30 AM', '8:00 AM', '8:30 AM',
  '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM',
  '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM',
];

const AFTER_HOURS_SLOTS = ['5:30 PM', '6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM', '8:00 PM'];

/**
 * GRANDFATHERING — NEW PRICING POLICY EFFECTIVE DATE
 *
 * Any appointment created BEFORE this timestamp is grandfathered: reschedules
 * will NOT adjust the total, will NOT trigger a charge/refund, and will NOT
 * touch the existing invoice. Patients who were already scheduled keep their
 * original price locked in — moving them between slots is a no-op financially.
 *
 * The new pricing rules (after-hours +$50, etc.) only apply to appointments
 * created on or after this cutoff.
 */
const NEW_PRICING_POLICY_EFFECTIVE_AT = '2026-04-18T00:00:00-04:00';

// Today in YYYY-MM-DD (America/New_York) — used as HTML input min
function todayET(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y = et.getFullYear();
  const m = String(et.getMonth() + 1).padStart(2, '0');
  const d = String(et.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Max date = +6 months (admins occasionally book far-out corporate events)
function maxDateET(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  et.setMonth(et.getMonth() + 6);
  const y = et.getFullYear();
  const m = String(et.getMonth() + 1).padStart(2, '0');
  const d = String(et.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const RescheduleAppointmentModal: React.FC<RescheduleAppointmentModalProps> = ({
  appointment, open, onClose, onRescheduled,
}) => {
  const appt = appointment;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [reason, setReason] = useState('');
  const [notifyPatient, setNotifyPatient] = useState(true);

  // availability state
  const [bookedTimes, setBookedTimes] = useState<Set<string>>(new Set());
  const [heldTimes, setHeldTimes] = useState<Set<string>>(new Set());
  const [dateBlocked, setDateBlocked] = useState<{ blocked: boolean; reason?: string }>({ blocked: false });
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  const minDate = todayET();
  const maxDate = maxDateET();

  // Pre-fill current date/time
  useEffect(() => {
    if (appt && open) {
      const dateStr = appt.appointment_date?.substring(0, 10) || '';
      setNewDate(dateStr);
      if (appt.appointment_time) {
        const timeStr = String(appt.appointment_time);
        if (timeStr.includes('AM') || timeStr.includes('PM')) {
          setNewTime(timeStr);
        } else {
          const [h, m] = timeStr.split(':').map(Number);
          const period = h >= 12 ? 'PM' : 'AM';
          const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
          setNewTime(`${h12}:${String(m || 0).padStart(2, '0')} ${period}`);
        }
      }
      setReason('');
    }
  }, [appt, open]);

  // When date changes, check if it's blocked + load bookings/holds for that day
  useEffect(() => {
    if (!open || !newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return;
    let cancelled = false;
    (async () => {
      setCheckingAvailability(true);
      try {
        const [{ data: blocks }, { data: appts }, { data: holds }] = await Promise.all([
          supabase.from('time_blocks')
            .select('start_date, end_date, reason, block_type')
            .lte('start_date', newDate)
            .gte('end_date', newDate)
            .eq('block_type', 'office_closure')
            .limit(1),
          supabase.from('appointments')
            .select('id, appointment_time')
            .gte('appointment_date', newDate)
            .lte('appointment_date', `${newDate}T23:59:59`)
            .in('status', ['scheduled', 'confirmed', 'en_route', 'arrived', 'in_progress'])
            .neq('id', appt?.id || '00000000-0000-0000-0000-000000000000'),
          supabase.from('slot_holds' as any)
            .select('appointment_time')
            .eq('appointment_date', newDate)
            .eq('released', false)
            .gt('expires_at', new Date().toISOString()),
        ]);
        if (cancelled) return;
        if (blocks && blocks.length > 0) {
          setDateBlocked({ blocked: true, reason: blocks[0].reason || 'office closure' });
        } else {
          setDateBlocked({ blocked: false });
        }
        const booked = new Set<string>();
        for (const a of appts || []) if (a.appointment_time) booked.add(String(a.appointment_time));
        setBookedTimes(booked);
        const held = new Set<string>();
        for (const h of (holds as any[]) || []) if (h.appointment_time) held.add(String(h.appointment_time));
        setHeldTimes(held);
      } catch (e) {
        console.warn('availability check failed:', e);
      } finally {
        if (!cancelled) setCheckingAvailability(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, newDate, appt?.id]);

  const patientName = appt?.patient_name
    || appt?.notes?.match(/Patient:\s*([^|]+)/)?.[1]?.trim()
    || 'Patient';

  const patientPhone = appt?.patient_phone
    || appt?.notes?.match(/Phone:\s*([^|]+)/)?.[1]?.trim()
    || null;

  // Is this appointment grandfathered under the old pricing? (Created before
  // the new-pricing policy cutoff — no financial changes on reschedule.)
  const isGrandfathered = useMemo(() => {
    if (!appt?.created_at) return true; // if we can't tell, be conservative and grandfather
    return new Date(appt.created_at).getTime() < new Date(NEW_PRICING_POLICY_EFFECTIVE_AT).getTime();
  }, [appt?.created_at]);

  // Is the NEW time after-hours? Preview surcharge — but ONLY for appointments
  // created under the new pricing policy. Pre-policy appointments get a $0 delta.
  const { isAfterHoursNew, wasAfterHoursOld, surchargeDelta } = useMemo(() => {
    const parseAfterHours = (t: string) => {
      if (!t) return false;
      if (t.includes('AM')) return false;
      const [tStr] = t.split(' ');
      const [h, m] = tStr.split(':').map(Number);
      const h24 = h === 12 ? 12 : h + 12;
      return h24 > 17 || (h24 === 17 && (m || 0) >= 30);
    };
    const newAH = parseAfterHours(newTime);
    const oldAH = parseAfterHours(String(appt?.appointment_time || ''));
    let delta = 0;
    // Grandfathered appointments never see a price delta on reschedule
    if (isGrandfathered) return { isAfterHoursNew: newAH, wasAfterHoursOld: oldAH, surchargeDelta: 0 };
    if (newAH && !oldAH) delta = 50;
    else if (!newAH && oldAH) delta = -50;
    return { isAfterHoursNew: newAH, wasAfterHoursOld: oldAH, surchargeDelta: delta };
  }, [newTime, appt?.appointment_time, isGrandfathered]);

  const handleReschedule = async () => {
    if (!newDate || !newTime) { toast.error('Please select both a new date and time'); return; }
    if (newDate < minDate) { toast.error('Cannot reschedule to a past date'); return; }
    if (dateBlocked.blocked) { toast.error(`${newDate} is blocked (${dateBlocked.reason})`); return; }
    if (bookedTimes.has(newTime) || heldTimes.has(newTime)) {
      toast.error(`${newTime} is already taken on ${newDate}`); return;
    }

    setIsSubmitting(true);
    try {
      // Noon-local anchor for timezone stability (matches verify-appointment-checkout)
      const appointmentDate = `${newDate}T12:00:00-04:00`;

      const updatePayload: any = {
        appointment_date: appointmentDate,
        appointment_time: newTime,
        rescheduled_at: new Date().toISOString(),
        reschedule_count: (appt.reschedule_count || 0) + 1,
        status: 'scheduled',
      };
      if (surchargeDelta !== 0) {
        updatePayload.total_amount = Math.max(0, (appt.total_amount || 0) + surchargeDelta);
        updatePayload.surcharge_amount = Math.max(0, (appt.surcharge_amount || 0) + surchargeDelta);
      }

      const { error } = await supabase.from('appointments').update(updatePayload).eq('id', appt.id);
      if (error) throw error;

      // Dual audit trail
      try {
        await supabase.from('activity_log' as any).insert({
          patient_id: appt.patient_id || null,
          activity_type: 'reschedule',
          description: `Rescheduled to ${newDate} at ${newTime}${reason ? `. Reason: ${reason}` : ''}${surchargeDelta !== 0 ? ` (surcharge delta $${surchargeDelta})` : ''}`,
          performed_by: 'admin',
          appointment_id: appt.id,
        });
      } catch (e) { console.warn('activity_log insert failed:', e); }
      try {
        await supabase.from('booking_audit_log' as any).insert({
          stage: 'admin_reschedule',
          patient_email: appt.patient_email || null,
          patient_phone: appt.patient_phone || null,
          patient_name: appt.patient_name || null,
          client_appointment_date: appt.appointment_date || null,
          client_appointment_time: appt.appointment_time || null,
          server_appointment_date: newDate,
          server_appointment_time: newTime,
          raw_payload: { old: { date: appt.appointment_date, time: appt.appointment_time, total: appt.total_amount }, new: { date: newDate, time: newTime, total: updatePayload.total_amount ?? appt.total_amount, surchargeDelta }, reason: reason || null },
        });
      } catch (e) { console.warn('booking_audit_log insert failed:', e); }

      // Patient SMS
      if (notifyPatient && patientPhone) {
        try {
          await supabase.functions.invoke('send-sms-notification', {
            body: {
              to: patientPhone,
              message: `ConveLabs: Your appointment has been rescheduled to ${new Date(newDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at ${newTime}.${surchargeDelta > 0 ? ` Note: after-hours surcharge of $${surchargeDelta} applied.` : ''}${reason ? ` Reason: ${reason}.` : ''} Questions? Call (941) 527-9169`,
            },
          });
        } catch (e) { console.warn('patient SMS failed:', e); }
      }

      // Owner visibility SMS (admin-initiated reschedules were invisible before)
      try {
        await supabase.functions.invoke('send-sms-notification', {
          body: {
            to: '9415279169',
            message: `[Admin Reschedule] ${patientName}: ${appt.appointment_date?.substring(0, 10) || '?'} ${appt.appointment_time || ''} → ${newDate} ${newTime}${surchargeDelta !== 0 ? ` (surcharge ${surchargeDelta > 0 ? '+' : ''}$${surchargeDelta})` : ''}${reason ? `. Reason: ${reason}` : ''}`,
          },
        });
      } catch (e) { console.warn('owner SMS failed:', e); }

      toast.success(`Appointment rescheduled to ${newDate} at ${newTime}`);
      onRescheduled();
      onClose();
    } catch (err: any) {
      console.error('Reschedule error:', err);
      toast.error(err.message || 'Failed to reschedule appointment');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!appt) return null;

  const oldDate = appt.appointment_date?.substring(0, 10) || '';
  const oldTime = (() => {
    const t = String(appt.appointment_time || '');
    if (t.includes('AM') || t.includes('PM')) return t;
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:${String(m || 0).padStart(2, '0')} ${period}`;
  })();

  const isSlotUnavailable = (t: string) => bookedTimes.has(t) || heldTimes.has(t);
  const hasDateChange = newDate !== oldDate || newTime !== oldTime;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md w-[95vw] sm:w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-[#B91C1C]" />
            Reschedule Appointment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current appointment info */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
            <p className="font-medium">{patientName}</p>
            <p className="text-muted-foreground">
              Currently: {oldDate ? new Date(oldDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—'} at {oldTime}
            </p>
            {appt.service_name && <p className="text-muted-foreground text-xs">{appt.service_name}</p>}
            {(appt.reschedule_count || 0) > 0 && (
              <p className={`text-xs font-medium ${(appt.reschedule_count || 0) >= 3 ? 'text-red-600' : 'text-amber-600'}`}>
                Rescheduled {appt.reschedule_count} time{appt.reschedule_count !== 1 ? 's' : ''} previously
                {(appt.reschedule_count || 0) >= 3 && ' — consider requiring a deposit'}
              </p>
            )}
          </div>

          {/* New date */}
          <div>
            <Label>New Date *</Label>
            <Input
              type="date"
              value={newDate}
              min={minDate}
              max={maxDate}
              onChange={e => setNewDate(e.target.value)}
              className={dateBlocked.blocked ? 'border-red-400' : ''}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Earliest: {minDate} · Past dates blocked
            </p>
            {dateBlocked.blocked && (
              <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>Office closed: {dateBlocked.reason}. Pick a different day.</span>
              </div>
            )}
          </div>

          {/* New time — slot grid with availability */}
          <div>
            <div className="flex items-center justify-between">
              <Label>New Time *</Label>
              {checkingAvailability && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Checking…
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5 mt-1.5">
              {TIME_SLOTS.map(t => {
                const unavailable = isSlotUnavailable(t);
                const selected = newTime === t;
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={unavailable || dateBlocked.blocked}
                    onClick={() => setNewTime(t)}
                    className={`text-xs py-1.5 px-2 rounded border transition ${
                      selected
                        ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
                        : unavailable
                          ? 'bg-gray-50 text-gray-300 border-gray-100 line-through cursor-not-allowed'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-[#B91C1C] hover:bg-red-50'
                    }`}
                    title={unavailable ? 'Already booked or held' : ''}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-600 mt-2">
              After Hours{isGrandfathered ? '' : ' (+$50)'}
            </p>
            <div className="grid grid-cols-3 gap-1.5 mt-1.5">
              {AFTER_HOURS_SLOTS.map(t => {
                const unavailable = isSlotUnavailable(t);
                const selected = newTime === t;
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={unavailable || dateBlocked.blocked}
                    onClick={() => setNewTime(t)}
                    className={`text-xs py-1.5 px-2 rounded border transition ${
                      selected
                        ? 'bg-amber-600 text-white border-amber-600'
                        : unavailable
                          ? 'bg-gray-50 text-gray-300 border-gray-100 line-through cursor-not-allowed'
                          : 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50'
                    }`}
                    title={unavailable ? 'Already booked or held' : ''}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grandfathered notice — pre-policy appointments keep their original total */}
          {isGrandfathered && (
            <div className="border rounded-lg p-3 flex items-start gap-2 text-xs bg-blue-50 border-blue-200 text-blue-800">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Existing appointment — no financial changes</p>
                <p className="mt-0.5">This appointment was booked before our new pricing policy took effect. Rescheduling (including into after-hours) will not change the original total, invoice, or payment. New pricing rules only apply to appointments booked going forward.</p>
              </div>
            </div>
          )}

          {/* Surcharge preview */}
          {surchargeDelta !== 0 && (
            <div className={`border rounded-lg p-3 flex items-start gap-2 text-xs ${surchargeDelta > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
              <DollarSign className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  {surchargeDelta > 0
                    ? `Patient will be charged an extra $${surchargeDelta} after-hours fee`
                    : `Patient will be refunded $${Math.abs(surchargeDelta)} (moving out of after-hours)`}
                </p>
                <p className="mt-0.5">New total will be ${Math.max(0, (appt.total_amount || 0) + surchargeDelta).toFixed(2)}. Process manually in Stripe.</p>
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <Label>Reason for Reschedule <span className="text-muted-foreground font-normal">(Optional)</span></Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Patient request, scheduling conflict, etc."
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Notify patient */}
          <div className="border rounded-lg p-3 flex items-start gap-3">
            <input
              type="checkbox"
              id="reschedule-notify-patient"
              checked={notifyPatient}
              onChange={e => setNotifyPatient(e.target.checked)}
              disabled={!patientPhone}
              className="mt-1 rounded border-gray-300"
            />
            <label htmlFor="reschedule-notify-patient" className="text-sm flex-1 cursor-pointer">
              <div className="font-medium text-gray-900">Notify patient via SMS</div>
              <p className="text-xs text-gray-500 mt-0.5">
                {!patientPhone ? 'No phone number on file — cannot notify'
                  : notifyPatient ? `Text will be sent to ${patientPhone}`
                  : <span className="text-amber-600">Patient will NOT be notified — use for corrections you'll relay manually</span>}
              </p>
            </label>
          </div>

          {/* Diff preview */}
          {hasDateChange && !dateBlocked.blocked && newTime && !isSlotUnavailable(newTime) && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-emerald-800">
                <p className="font-medium mb-0.5">Ready to save:</p>
                <p className="line-through text-emerald-600/60">{oldDate ? new Date(oldDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''} {oldTime}</p>
                <p className="font-semibold">{newDate ? new Date(newDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''} {newTime}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
            <Button
              onClick={handleReschedule}
              disabled={isSubmitting || !newDate || !newTime || dateBlocked.blocked || isSlotUnavailable(newTime)}
              className="bg-[#B91C1C] hover:bg-[#991B1B] text-white"
            >
              {isSubmitting ? (<><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Rescheduling...</>) : 'Confirm Reschedule'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RescheduleAppointmentModal;
