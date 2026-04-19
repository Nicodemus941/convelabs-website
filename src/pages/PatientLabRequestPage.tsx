import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, Home, ArrowRight, ExternalLink, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import AddressAutocomplete from '@/components/ui/address-autocomplete';

/**
 * PATIENT LAB REQUEST BOOKING PAGE (/lab-request/:token)
 *
 * Public page (no auth) that a patient lands on after clicking their
 * personalized link in the email/SMS we sent them.
 *
 * KEY RULES (per latest product decision):
 *   - 100% MOBILE SERVICE — no in-office option. We come to the patient.
 *   - REAL-TIME AVAILABILITY — slot grid recomputed from live appointments
 *     table every time a date is picked. Unavailable slots are shown
 *     greyed-out (Hormozi: visible demand signals > missing signals).
 *   - DRAW-BY ENFORCEMENT — date picker capped at draw_by_date from server.
 *   - ORG SCHEDULING WINDOW — enforced server-side; patient only sees
 *     slots their provider's org allows (e.g. Restoration Place 6-9am).
 *   - RACE-SAFE BOOKING — final availability re-check at submit time.
 *     If the slot was taken in the seconds between pick and submit, we
 *     surface a clear "that just got taken" error + refresh the grid.
 *
 * SMS DEEP-LINK: if ?d=YYYY-MM-DD&t=H:MM%20AM are in the URL (from the
 * patient replying 1/2/3 to our SMS), we pre-select that date+time and
 * bias the page to the address section.
 */

interface LabRequestData {
  request: {
    id: string;
    patient_name: string;
    patient_email: string | null;
    patient_phone: string | null;
    lab_order_url: string | null;
    panels: any[];
    fasting_required: boolean;
    urine_required: boolean;
    gtt_required: boolean;
    draw_by_date: string;
    next_doctor_appt_date: string | null;
    next_doctor_appt_notes: string | null;
    status: string;
    already_scheduled: boolean;
    appointment_id: string | null;
  };
  org: {
    id: string;
    name: string;
    contact_name: string | null;
    default_billed_to: string | null;
    patient_price_cents: number | null;
    org_covers: boolean;
  };
}

interface Slot {
  time: string;
  available: boolean;
  reason?: string;
  requires_tier?: string;
  unlock_price_cents?: number;
  visit_savings_cents?: number;
}

const TIER_LABEL: Record<string, string> = {
  regular_member: 'Regular Member',
  vip: 'VIP',
  concierge: 'Concierge',
};
const TIER_COLOR: Record<string, { bg: string; text: string; border: string; button: string }> = {
  regular_member: { bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-300', button: 'bg-amber-500 hover:bg-amber-600' },
  vip: { bg: 'bg-red-50', text: 'text-red-900', border: 'border-red-300', button: 'bg-red-600 hover:bg-red-700' },
  concierge: { bg: 'bg-purple-50', text: 'text-purple-900', border: 'border-purple-300', button: 'bg-purple-600 hover:bg-purple-700' },
};

const PatientLabRequestPage: React.FC = () => {
  const { token } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState<LabRequestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [address, setAddress] = useState('');
  const [emailOverride, setEmailOverride] = useState('');
  const [phoneOverride, setPhoneOverride] = useState('');

  // Live availability state
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [orgCovers, setOrgCovers] = useState(false);

  // Unlock modal state
  const [unlockSlot, setUnlockSlot] = useState<Slot | null>(null);

  // Fetch the lab request context once
  useEffect(() => {
    if (!token) { setErr('No token provided'); setLoading(false); return; }
    (async () => {
      try {
        const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/get-lab-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: token }),
        });
        const j = await resp.json();
        if (!resp.ok) throw new Error(j.error || 'Link not found');
        setData(j);
        if (j.request.already_scheduled) setSuccess(true);

        // If the SMS deep-linked with ?d=&t=, pre-select them
        const preD = params.get('d');
        const preT = params.get('t');
        if (preD) setDate(preD);
        if (preT) setTime(preT);
      } catch (e: any) {
        setErr(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [token, params]);

  // Re-check availability every time the date changes
  useEffect(() => {
    if (!date || !token) return;
    setSlotsLoading(true);
    (async () => {
      try {
        const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/get-lab-request-slots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: token, date }),
        });
        const j = await resp.json();
        if (!resp.ok) throw new Error(j.error || 'Failed to load slots');
        setSlots(j.slots || []);
        setOrgCovers(!!j.org_covers);
        // If the currently-selected time is no longer available, clear it
        if (time && !(j.slots || []).some((s: Slot) => s.time === time && s.available)) {
          setTime('');
        }
      } catch (e: any) {
        console.error('[lab-request-slots]', e);
        setSlots([]);
      } finally {
        setSlotsLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, token]);

  // Stripe success redirect support
  useEffect(() => {
    if (params.get('scheduled') === '1') setSuccess(true);
  }, [params]);

  const minDate = useMemo(() => new Date().toISOString().substring(0, 10), []);
  const maxDate = useMemo(() => data?.request.draw_by_date || '', [data]);

  const daysLeft = useMemo(() => {
    if (!data?.request.draw_by_date) return 0;
    const d = new Date(data.request.draw_by_date); const now = new Date();
    return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }, [data]);

  const urgency = daysLeft <= 2 ? 'urgent' : daysLeft <= 7 ? 'soon' : 'ok';
  const urgencyColor = urgency === 'urgent' ? 'red' : urgency === 'soon' ? 'amber' : 'emerald';

  const availableSlots = useMemo(() => slots.filter(s => s.available), [slots]);
  const firstAvailable = availableSlots[0]?.time;

  const canSubmit = !!(date && time && address.trim().length >= 10);

  const handleSubmit = async () => {
    if (!canSubmit || !token) return;
    setSubmitting(true);
    try {
      const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/schedule-lab-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: token,
          appointment_date: date,
          appointment_time: time,
          address,
          patient_email_override: emailOverride.trim() || undefined,
          patient_phone_override: phoneOverride.trim() || undefined,
        }),
      });
      const j = await resp.json();

      // Race-condition: slot was taken between page load and submit
      if (resp.status === 409 && j.slot_conflict) {
        toast.error(j.error || 'That slot was just taken. Please pick another.');
        setTime('');
        // Re-fetch slots so the UI updates
        const slotsResp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/get-lab-request-slots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: token, date }),
        });
        const sj = await slotsResp.json();
        setSlots(sj.slots || []);
        setSubmitting(false);
        return;
      }

      if (!resp.ok) throw new Error(j.error || 'Failed to schedule');

      if (j.stripe_url) {
        window.location.href = j.stripe_url;
      } else {
        setSuccess(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to schedule');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 space-y-3">
            <h2 className="text-xl font-bold text-red-700">We couldn't open this link</h2>
            <p className="text-sm text-gray-600">{err}</p>
            <p className="text-sm text-gray-600">If you believe this is a mistake, please contact your provider's office, or email <a href="mailto:info@convelabs.com" className="text-[#B91C1C] underline">info@convelabs.com</a>.</p>
            <Button variant="outline" asChild className="w-full"><Link to="/">Back to ConveLabs</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { request, org } = data;
  const firstName = request.patient_name.split(' ')[0];
  const patientPrice = org.patient_price_cents != null ? `$${(org.patient_price_cents / 100).toFixed(0)}` : '$150';

  // ── SUCCESS VIEW ─────────────────────────────────────────────────────
  if (success) {
    // Compute the fasting cutoff label for display (mirrors send-fasting-reminders logic)
    const fastingCutoff = (() => {
      if (!request.fasting_required || !time) return null;
      const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
      if (!match) return null;
      let h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      if (match[3].toUpperCase() === 'PM' && h !== 12) h += 12;
      if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
      const cutoffMin = h * 60 + m - 8 * 60; // 8 hours before
      let cutH: number, cutM: number, suffix: string;
      if (cutoffMin >= 0) { cutH = Math.floor(cutoffMin / 60); cutM = cutoffMin % 60; suffix = 'on draw day'; }
      else { const w = cutoffMin + 1440; cutH = Math.floor(w / 60); cutM = w % 60; suffix = 'the night before'; }
      if (cutH === 0 && cutM === 0) return `midnight ${suffix}`;
      const period = cutH >= 12 ? 'PM' : 'AM';
      const dH = cutH > 12 ? cutH - 12 : cutH === 0 ? 12 : cutH;
      const mStr = cutM === 0 ? '' : `:${String(cutM).padStart(2, '0')}`;
      return `${dH}${mStr} ${period} ${suffix}`;
    })();

    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-6">
            <span className="text-xl font-bold">ConveLabs<span className="text-[#B91C1C]">.</span></span>
          </div>
          <Card className="shadow-sm">
            <CardContent className="p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              </div>
              <h1 className="text-2xl font-bold">You're all set, {firstName}.</h1>
              <div className="flex items-center justify-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-1.5 w-fit mx-auto">
                <CheckCircle2 className="h-4 w-4" />
                <span><strong>{org.name}</strong> has been notified</span>
              </div>
              <p className="text-sm text-gray-600">A confirmation SMS + email is on the way.</p>

              {/* Fasting cutoff callout (if fasting required) */}
              {fastingCutoff && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-left">
                  <p className="text-xs uppercase tracking-wider text-amber-900 font-semibold">🍽️ Fasting required</p>
                  <p className="text-sm text-amber-900 mt-1"><strong>Stop eating &amp; drinking by {fastingCutoff}.</strong> Water is fine — no coffee, juice, mints, or gum.</p>
                  <p className="text-xs text-amber-800 mt-1.5">We'll text you another reminder the night before at 8 PM so you don't have to keep this in your head.</p>
                </div>
              )}

              {/* Next consult reminder */}
              {request.next_doctor_appt_date && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
                  <p className="text-xs uppercase tracking-wider text-blue-900 font-semibold">Your consult is on the way too</p>
                  <p className="text-sm text-blue-900 mt-1">Your next visit with {org.name} is <strong>{format(new Date(request.next_doctor_appt_date + 'T12:00:00'), 'EEEE, MMMM d')}</strong>. Your results will be in their hands before then.</p>
                </div>
              )}

              {/* Recollection guarantee — trust anchor */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-left">
                <p className="text-xs uppercase tracking-wider text-gray-700 font-semibold">Our guarantee — in writing</p>
                <ul className="mt-2 space-y-1 text-xs text-gray-700">
                  <li>• If <strong>ConveLabs</strong> made a mistake, recollection is <strong>free</strong>.</li>
                  <li>• If the <strong>lab</strong> made a mistake, recollection is <strong>50% off</strong>.</li>
                </ul>
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm text-gray-600 mb-3">Want to manage future appointments in one place?</p>
                <Button asChild className="bg-[#B91C1C] hover:bg-[#991B1B] text-white w-full"><Link to="/signup">Create a ConveLabs account</Link></Button>
              </div>
              <p className="text-xs text-gray-400 pt-4">Questions? Email <a href="mailto:info@convelabs.com" className="underline">info@convelabs.com</a> or call (941) 527-9169.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── BOOKING VIEW ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-4">
          <span className="text-xl font-bold">ConveLabs<span className="text-[#B91C1C]">.</span></span>
        </div>

        {/* Context card */}
        <Card className="shadow-sm mb-4">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Lab request from</p>
            <h1 className="text-xl font-bold mt-1">{org.name}</h1>
            {org.contact_name && <p className="text-sm text-gray-600">{org.contact_name}</p>}

            {/* Urgency banner */}
            <div className={`mt-4 border-l-4 rounded-r-lg p-3 ${
              urgencyColor === 'red' ? 'bg-red-50 border-red-500' :
              urgencyColor === 'amber' ? 'bg-amber-50 border-amber-500' :
              'bg-emerald-50 border-emerald-500'
            }`}>
              <p className={`text-sm font-semibold ${
                urgencyColor === 'red' ? 'text-red-800' :
                urgencyColor === 'amber' ? 'text-amber-800' :
                'text-emerald-800'
              }`}>
                {urgency === 'urgent' && `🔴 URGENT — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                {urgency === 'soon' && `🟡 ${daysLeft} days left to book`}
                {urgency === 'ok' && `🟢 Ready when you are · ${daysLeft} days`}
              </p>
              <p className="text-xs text-gray-700 mt-1">
                Draw by <strong>{format(new Date(request.draw_by_date + 'T12:00:00'), 'EEE, MMM d')}</strong>
                {request.next_doctor_appt_date && ` · Your consult: ${format(new Date(request.next_doctor_appt_date + 'T12:00:00'), 'EEE, MMM d')}`}
              </p>
            </div>

            {/* Panels */}
            {request.panels && request.panels.length > 0 && (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">What they ordered</p>
                <div className="flex flex-wrap gap-1">
                  {request.panels.map((p: any, i: number) => (
                    <Badge key={i} className="bg-red-50 text-[#B91C1C] hover:bg-red-50 border-red-200">
                      {typeof p === 'string' ? p : p.name || 'Panel'}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Prep warnings */}
            {(request.fasting_required || request.urine_required || request.gtt_required) && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 space-y-1">
                {request.fasting_required && <p>⚠️ <strong>Fasting required</strong> — 12 hours, water only</p>}
                {request.urine_required && <p>💧 <strong>Urine specimen required</strong> — we'll bring a cup</p>}
                {request.gtt_required && <p>🧪 <strong>Glucose tolerance test</strong> — plan for 2–3 hours</p>}
              </div>
            )}

            {request.lab_order_url && (
              <a href={request.lab_order_url} target="_blank" rel="noreferrer" className="text-xs text-[#B91C1C] underline mt-3 inline-flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> View the lab order your provider uploaded
              </a>
            )}
          </CardContent>
        </Card>

        {/* Mobile-only service confirmation */}
        <Card className="shadow-sm mb-4 bg-gradient-to-br from-red-50/60 to-white border-red-100">
          <CardContent className="p-4 flex items-center gap-3">
            <Home className="h-5 w-5 text-[#B91C1C] flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm">We come to you — 100% mobile service</p>
              <p className="text-xs text-gray-600">
                {org.org_covers ? 'Covered by ' + org.name : `${patientPrice} · billed by ConveLabs`}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Date + time */}
        <Card className="shadow-sm mb-4">
          <CardContent className="p-5 space-y-4">
            <div>
              <Label>Pick a date <span className="text-[11px] text-gray-400">(by {format(new Date(request.draw_by_date + 'T12:00:00'), 'EEE MMM d')})</span></Label>
              <Input type="date" value={date} min={minDate} max={maxDate} onChange={e => { setDate(e.target.value); setTime(''); }} />
            </div>

            {date && (
              <div>
                <div className="flex items-center justify-between">
                  <Label>Pick an available time</Label>
                  {slotsLoading && <span className="text-[10px] text-gray-400 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> checking…</span>}
                </div>
                {!slotsLoading && availableSlots.length === 0 && (() => {
                  const isToday = date === new Date().toISOString().substring(0, 10);
                  const nowHr = new Date().getHours();
                  const sameDayCutoff = isToday && nowHr >= 10;
                  return (
                    <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800">
                      {sameDayCutoff
                        ? <>Same-day bookings cut off at 10 AM ET — please pick tomorrow, or call <a href="tel:+19415279169" className="underline font-semibold">(941) 527-9169</a> for an urgent draw.</>
                        : <>No open slots on this date — try another day.</>}
                    </div>
                  );
                })()}
                <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                  {slots.map(s => {
                    const isFirst = s.available && s.time === firstAvailable;
                    const isLocked = s.reason === 'tier_locked';
                    const tierColor = isLocked && s.requires_tier ? TIER_COLOR[s.requires_tier] : null;
                    const titleText = s.available
                      ? (isFirst ? 'First available' : 'Available')
                      : isLocked ? `🔒 Unlock with ${TIER_LABEL[s.requires_tier || ''] || 'membership'}`
                      : s.reason === 'booked' ? 'Already booked'
                      : s.reason === 'past' ? 'Need at least 2 hrs lead time'
                      : s.reason === 'blocked' ? 'Office closed'
                      : s.reason === 'outside_window' ? 'Outside your provider\'s scheduling window'
                      : 'Unavailable';
                    return (
                      <button key={s.time} type="button"
                        onClick={() => {
                          if (s.available) setTime(s.time);
                          else if (isLocked) setUnlockSlot(s);
                        }}
                        disabled={!s.available && !isLocked}
                        title={titleText}
                        className={`relative text-xs py-2 px-2 rounded border transition ${
                          time === s.time
                            ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
                            : s.available
                              ? 'bg-white border-gray-200 hover:border-[#B91C1C] hover:bg-red-50 text-gray-700'
                              : isLocked && tierColor
                                ? `${tierColor.bg} ${tierColor.text} ${tierColor.border} cursor-pointer hover:opacity-80`
                                : 'bg-gray-50 text-gray-300 border-gray-100 line-through cursor-not-allowed'
                        }`}>
                        {isLocked && <span className="mr-0.5">🔒</span>}
                        {s.time}
                        {isFirst && time !== s.time && (
                          <span className="absolute -top-1.5 -right-1 text-[8px] bg-emerald-500 text-white px-1 rounded">first</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Nudge: if first several slots are locked, surface an unlock callout */}
                {slots.some(s => s.reason === 'tier_locked') && (
                  <div className="mt-2 bg-gradient-to-r from-amber-50 to-red-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900 flex items-center gap-2">
                    <span>⚡</span>
                    <span className="flex-1">Early morning slots unlock with a membership · tap any 🔒 slot to see the math</span>
                  </div>
                )}
                {availableSlots.length > 0 && (
                  <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" /> Live availability · refreshes each time you pick a date
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pre-submit fasting cutoff callout (shows INLINE as patient picks their time) */}
        {time && request.fasting_required && (() => {
          const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
          if (!m) return null;
          let h = parseInt(m[1], 10); const min = parseInt(m[2], 10);
          if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
          if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
          const cutoffMin = h * 60 + min - 8 * 60;
          let cH: number, cM: number, suf: string;
          if (cutoffMin >= 0) { cH = Math.floor(cutoffMin / 60); cM = cutoffMin % 60; suf = 'on draw day'; }
          else { const w = cutoffMin + 1440; cH = Math.floor(w / 60); cM = w % 60; suf = 'the night before'; }
          const period = cH >= 12 ? 'PM' : 'AM';
          const dH = cH > 12 ? cH - 12 : cH === 0 ? 12 : cH;
          const mStr = cM === 0 ? '' : `:${String(cM).padStart(2, '0')}`;
          const cutoffStr = cH === 0 && cM === 0 ? `midnight ${suf}` : `${dH}${mStr} ${period} ${suf}`;
          return (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-4 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Picking {time} means: stop eating & drinking by {cutoffStr}</p>
                <p className="text-xs text-amber-800 mt-0.5">Water is fine. No coffee, juice, soda, mints, or gum. We'll remind you by text at 8 PM the night before.</p>
              </div>
            </div>
          );
        })()}

        {/* Address — required because we're mobile-only, powered by Google Places */}
        <Card className="shadow-sm mb-4">
          <CardContent className="p-5 space-y-3">
            <div>
              <Label>Where should we come? *</Label>
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                placeholder="Start typing your address…"
              />
              <p className="text-[11px] text-gray-500 mt-1">Home, office, hotel, wherever you'll be at your appointment time.</p>
            </div>
          </CardContent>
        </Card>

        {/* Optional contact overrides */}
        {(!request.patient_email || !request.patient_phone) && (
          <Card className="shadow-sm mb-4">
            <CardContent className="p-5 space-y-3">
              <p className="text-xs text-gray-500">Please confirm how to reach you:</p>
              {!request.patient_email && (
                <div><Label>Email</Label><Input type="email" value={emailOverride} onChange={e => setEmailOverride(e.target.value)} placeholder="you@example.com" /></div>
              )}
              {!request.patient_phone && (
                <div><Label>Phone</Label><Input value={phoneOverride} onChange={e => setPhoneOverride(e.target.value)} placeholder="407-555-1234" /></div>
              )}
            </CardContent>
          </Card>
        )}

        <Button onClick={handleSubmit} disabled={!canSubmit || submitting}
          className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-14 text-base gap-2">
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Scheduling…</> : <>Book my mobile draw <ArrowRight className="h-4 w-4" /></>}
        </Button>

        <p className="text-center text-xs text-gray-400 mt-4">
          Questions? <a href="mailto:info@convelabs.com" className="underline">info@convelabs.com</a> · (941) 527-9169
        </p>
      </div>

      {/* UNLOCK SLOT MODAL */}
      {unlockSlot && unlockSlot.requires_tier && (() => {
        const tier = unlockSlot.requires_tier;
        const label = TIER_LABEL[tier] || 'Member';
        const color = TIER_COLOR[tier] || TIER_COLOR.regular_member;
        const unlockPrice = (unlockSlot.unlock_price_cents || 0) / 100;
        const visitSavings = (unlockSlot.visit_savings_cents || 0) / 100;
        const visitsToBreakEven = visitSavings > 0 ? Math.ceil(unlockPrice / visitSavings) : null;
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setUnlockSlot(null)}>
            <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className={`${color.bg} ${color.border} border rounded-xl p-4 text-center`}>
                <div className="text-3xl mb-1">🔒</div>
                <p className={`text-xs uppercase tracking-wider ${color.text} font-semibold`}>Unlocks with {label}</p>
                <h3 className={`text-2xl font-bold ${color.text} mt-1`}>{unlockSlot.time}</h3>
                <p className="text-xs text-gray-600 mt-1">Before most offices open · home before 8 AM</p>
              </div>

              {!orgCovers && visitSavings > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm">
                  <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">Math for this visit</p>
                  <div className="space-y-1 text-gray-700">
                    <div className="flex justify-between"><span>Non-member rate</span><span>${(visitSavings + (unlockSlot.visit_savings_cents != null ? (15000 - unlockSlot.visit_savings_cents) / 100 : 130)).toFixed(0)}</span></div>
                    <div className="flex justify-between font-semibold text-emerald-700"><span>{label} rate</span><span>${((15000 - (unlockSlot.visit_savings_cents || 0)) / 100).toFixed(0)}</span></div>
                    <div className="border-t my-2" />
                    <div className="flex justify-between"><span>Membership (annual)</span><span>${unlockPrice.toFixed(0)} /yr</span></div>
                    <div className="flex justify-between"><span>Savings today</span><span className="text-emerald-700 font-semibold">${visitSavings.toFixed(0)}</span></div>
                    {visitsToBreakEven && (
                      <p className="text-[11px] text-gray-500 italic mt-2">Membership pays for itself in {visitsToBreakEven} visit{visitsToBreakEven === 1 ? '' : 's'} — every future visit is pure savings.</p>
                    )}
                  </div>
                </div>
              )}

              {orgCovers && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
                  <p className="font-semibold mb-1">This visit is covered by {org.name}</p>
                  <p className="text-xs">No cost to you today. Joining {label} for <strong>${unlockPrice.toFixed(0)}/yr</strong> unlocks {unlockSlot.time} for this visit AND saves you on all your own future ConveLabs visits.</p>
                </div>
              )}

              <div className="space-y-2">
                <Button
                  className={`w-full ${color.button} text-white h-11 gap-1.5`}
                  onClick={async () => {
                    if (!address || address.trim().length < 10) {
                      toast.error('Please enter your address first — we need it to book your visit.');
                      setUnlockSlot(null);
                      setTimeout(() => {
                        document.querySelector('input[placeholder*="address"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 150);
                      return;
                    }
                    try {
                      const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/unlock-lab-request-slot', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          access_token: token,
                          tier,
                          appointment_date: date,
                          appointment_time: unlockSlot.time,
                          address,
                          email_override: emailOverride.trim() || undefined,
                          phone_override: phoneOverride.trim() || undefined,
                        }),
                      });
                      const j = await resp.json();
                      if (!resp.ok) {
                        toast.error(j.error || 'Could not start checkout');
                        return;
                      }
                      if (j.checkout_url) window.location.href = j.checkout_url;
                    } catch (e: any) {
                      toast.error(e?.message || 'Failed to start checkout');
                    }
                  }}>
                  Join {label} + book this slot
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setUnlockSlot(null)}>
                  Skip — pick an available slot
                </Button>
              </div>
              <p className="text-[11px] text-gray-500 text-center">47% of ConveLabs patients are members — early slots fill fast.</p>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default PatientLabRequestPage;
