/**
 * AppointmentConfirmPage — patient lands here from the 48h-out
 * confirmation SMS/email. Three big buttons: Confirm / Reschedule /
 * Cancel. Token-only auth via view_token.
 *
 * Route: /appt/:token/confirm
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, CheckCircle2, Calendar, X, AlertTriangle } from 'lucide-react';

const SUPABASE_URL = 'https://yluyonhrxxtyuiyrdixl.supabase.co';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

interface Appt {
  id: string;
  patient_first_name: string;
  appointment_date: string;
  appointment_time: string | null;
  address: string | null;
  service_name: string | null;
  status: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
}

const CANCEL_REASONS = [
  'Schedule conflict',
  'Feeling sick',
  'Don\'t have my lab order yet',
  'Going out of town',
  'Other',
];

const AppointmentConfirmPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appt, setAppt] = useState<Appt | null>(null);
  const [busy, setBusy] = useState<'confirm' | 'cancel' | 'reschedule' | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('Schedule conflict');
  const [cancelOther, setCancelOther] = useState('');
  // Reschedule self-service
  const [showReschedule, setShowReschedule] = useState(false);
  const [rsDate, setRsDate] = useState<string>('');
  const [rsSlots, setRsSlots] = useState<string[]>([]);
  const [rsLoadingSlots, setRsLoadingSlots] = useState(false);
  const [rsTime, setRsTime] = useState<string>('');
  const [rsError, setRsError] = useState<string | null>(null);
  const [rescheduled, setRescheduled] = useState<{ date: string; time: string } | null>(null);

  const todayIso = new Date().toISOString().substring(0, 10);

  async function loadSlots(date: string) {
    if (!token || !date) return;
    setRsLoadingSlots(true); setRsError(null); setRsTime(''); setRsSlots([]);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/appointment-self-service`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: 'available_slots', token, date }),
      });
      const j = await res.json();
      if (res.ok && Array.isArray(j.slots)) {
        setRsSlots(j.slots.filter((s: any) => s.available).map((s: any) => s.time));
      } else {
        setRsError('Could not load times for that day.');
      }
    } catch {
      setRsError('Could not load times for that day.');
    } finally {
      setRsLoadingSlots(false);
    }
  }

  async function handleReschedule() {
    if (!token || busy || !rsDate || !rsTime) return;
    setBusy('reschedule'); setRsError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/appointment-self-service`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: 'reschedule', token, date: rsDate, time: rsTime }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) {
        setRescheduled({ date: rsDate, time: rsTime });
      } else if (res.status === 402 && j.fee_required) {
        // Moving within 24h — a $25 fee applies (members are free). Send the
        // patient to Stripe; the move is committed by the webhook once paid.
        // Stripe's page shows the "$25 Reschedule fee" line + the new time, so
        // they confirm the fee there; canceling returns them here unchanged.
        try {
          const fr = await fetch(`${SUPABASE_URL}/functions/v1/create-reschedule-fee-checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
            body: JSON.stringify({ token, date: rsDate, time: rsTime }),
          });
          const fj = await fr.json().catch(() => ({}));
          if (fr.ok && fj.url) { window.location.href = fj.url; return; }
          if (fj.error === 'slot_conflict') { setRsError('Sorry, that time was just taken — please pick another.'); loadSlots(rsDate); }
          else setRsError('Could not start payment for the reschedule fee. Please call (941) 527-9169.');
        } catch {
          setRsError('Could not start payment for the reschedule fee. Please call (941) 527-9169.');
        }
      } else if (j.error === 'slot_conflict') {
        setRsError('Sorry, that time was just taken — please pick another.');
        loadSlots(rsDate);
      } else if (j.error === 'too_close') {
        setRsError('Your visit is too soon to reschedule online. Please call (941) 527-9169.');
      } else if (j.error === 'not_reschedulable') {
        setRsError('This visit can no longer be rescheduled online. Please call (941) 527-9169.');
      } else {
        setRsError('Could not reschedule. Please call (941) 527-9169.');
      }
    } finally { setBusy(null); }
  }

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/appointment-self-service?token=${encodeURIComponent(token)}`, {
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        });
        const j = await res.json();
        if (!res.ok) {
          setError(j.error === 'expired' ? 'This link has expired.' : 'Could not load your appointment.');
        } else {
          setAppt(j.appointment);
          if (j.appointment.confirmed_at) setConfirmed(true);
          if (j.appointment.cancelled_at) setCancelled(true);
          // Returned from paying the late-reschedule fee. The webhook commits
          // the move within a few seconds; show success now (the confirmation
          // SMS/email is the authoritative receipt).
          if (new URLSearchParams(window.location.search).get('rescheduled') === '1') {
            setRescheduled({
              date: String(j.appointment.appointment_date || '').substring(0, 10),
              time: j.appointment.appointment_time || '',
            });
          }
        }
      } catch (e: any) {
        setError(e?.message || 'Could not load.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function handleConfirm() {
    if (!token || busy) return;
    setBusy('confirm');
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/appointment-self-service`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: 'confirm', token }),
      });
      if (res.ok) setConfirmed(true);
      else setError('Could not confirm. Please call (941) 527-9169.');
    } finally { setBusy(null); }
  }

  async function handleCancel() {
    if (!token || busy) return;
    const finalReason = cancelReason === 'Other' ? cancelOther.trim() : cancelReason;
    if (finalReason.length < 3) {
      setError('Please choose or enter a reason.');
      return;
    }
    setBusy('cancel');
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/appointment-self-service`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: 'cancel', token, reason: finalReason }),
      });
      if (res.ok) setCancelled(true);
      else setError('Could not cancel. Please call (941) 527-9169.');
    } finally { setBusy(null); }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" /></div>;

  if (error || !appt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white border rounded-2xl p-6 shadow-sm text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Hmm — let's try that again</h1>
          <p className="text-sm text-gray-600">{error || 'Could not load your appointment.'}</p>
          <p className="text-xs text-gray-400 mt-4">Email <a href="mailto:info@convelabs.com" className="text-[#B91C1C] underline">info@convelabs.com</a> or call (941) 527-9169.</p>
        </div>
      </div>
    );
  }

  const dateLabel = new Date(String(appt.appointment_date).substring(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  if (cancelled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white border rounded-2xl p-6 shadow-sm text-center">
          <X className="h-10 w-10 text-gray-400 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Cancelled</h1>
          <p className="text-sm text-gray-600">Your appointment has been cancelled. Reach out anytime to reschedule.</p>
          <p className="text-xs text-gray-400 mt-4">Email <a href="mailto:info@convelabs.com" className="text-[#B91C1C] underline">info@convelabs.com</a> or call (941) 527-9169.</p>
        </div>
      </div>
    );
  }

  if (rescheduled) {
    const newLabel = new Date(rescheduled.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white border rounded-2xl p-6 shadow-sm text-center">
          <div className="bg-emerald-100 rounded-full w-16 h-16 mx-auto flex items-center justify-center mb-4">
            <Calendar className="h-9 w-9 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Rescheduled ✓</h1>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mt-3 text-left text-sm">
            <p className="text-emerald-900"><strong>{newLabel} at {rescheduled.time}</strong></p>
            {appt.address && <p className="text-emerald-800 mt-1 text-xs">{appt.address}</p>}
          </div>
          <p className="text-xs text-gray-500 mt-3">We'll send a reminder the night before.</p>
          <p className="text-xs text-gray-400 mt-4">Need to change again? <a href="mailto:info@convelabs.com" className="text-[#B91C1C] underline">info@convelabs.com</a> · (941) 527-9169</p>
        </div>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white border rounded-2xl p-6 shadow-sm text-center">
          <div className="bg-emerald-100 rounded-full w-16 h-16 mx-auto flex items-center justify-center mb-4">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Confirmed ✓</h1>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mt-3 text-left text-sm">
            <p className="text-emerald-900"><strong>{dateLabel}{appt.appointment_time ? ` at ${appt.appointment_time}` : ''}</strong></p>
            {appt.address && <p className="text-emerald-800 mt-1 text-xs">{appt.address}</p>}
            <ul className="text-xs text-gray-700 mt-3 space-y-0.5 list-disc list-inside">
              <li>Wear a short-sleeve shirt</li>
              <li>Drink water tonight (helps the draw)</li>
              <li>Have your photo ID + insurance card ready</li>
            </ul>
          </div>
          <p className="text-xs text-gray-400 mt-4">Need to change something? <a href="mailto:info@convelabs.com" className="text-[#B91C1C] underline">info@convelabs.com</a> · (941) 527-9169</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] text-white px-6 py-5">
            <h1 className="text-xl font-bold">See you {dateLabel.split(',')[0]}?</h1>
            <p className="text-sm opacity-90 mt-0.5">Quick confirm so we know to come</p>
          </div>

          <div className="p-6">
            <div className="bg-gray-50 border rounded-lg p-3 mb-4 text-sm">
              <p className="text-gray-900">Hi <strong>{appt.patient_first_name}</strong>,</p>
              <p className="text-gray-700 mt-1"><strong>{dateLabel}{appt.appointment_time ? ` at ${appt.appointment_time}` : ''}</strong></p>
              {appt.address && <p className="text-gray-600 text-xs mt-1">{appt.address}</p>}
              {appt.service_name && <p className="text-gray-500 text-xs mt-1">{appt.service_name}</p>}
            </div>

            {!showCancelForm && !showReschedule ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!!busy}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2"
                >
                  {busy === 'confirm' ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                  Yes, I'll be there
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowReschedule(true);
                    const t = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
                    setRsDate(t); loadSlots(t);
                  }}
                  className="w-full bg-white border-2 border-gray-300 hover:border-[#B91C1C] text-gray-800 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                >
                  <Calendar className="h-4 w-4" />
                  Need to reschedule
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelForm(true)}
                  className="w-full bg-white border-2 border-gray-200 hover:border-red-400 text-gray-600 hover:text-red-700 py-3 rounded-xl font-medium text-sm"
                >
                  Cancel this visit
                </button>
              </div>
            ) : showReschedule ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-900">Pick a new day & time</p>
                <input
                  type="date"
                  value={rsDate}
                  min={todayIso}
                  onChange={(e) => { setRsDate(e.target.value); loadSlots(e.target.value); }}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
                {rsLoadingSlots ? (
                  <div className="flex items-center justify-center py-6 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : rsSlots.length === 0 ? (
                  <p className="text-xs text-gray-500 py-3 text-center">No open times that day — try another date.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5 max-h-52 overflow-y-auto">
                    {rsSlots.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setRsTime(t)}
                        className={`py-2 rounded-lg text-xs font-medium border ${rsTime === t ? 'bg-[#B91C1C] text-white border-[#B91C1C]' : 'bg-white text-gray-700 border-gray-200 hover:border-[#B91C1C]'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {rsError && <p className="text-xs text-red-600">{rsError}</p>}
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => { setShowReschedule(false); setRsError(null); setRsTime(''); }}
                    className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-xl font-semibold text-sm"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleReschedule}
                    disabled={!!busy || !rsTime}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5"
                  >
                    {busy === 'reschedule' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Move to this time
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-900">Why are you cancelling?</p>
                <div className="space-y-1.5">
                  {CANCEL_REASONS.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded hover:bg-gray-50">
                      <input
                        type="radio"
                        name="cancel-reason"
                        value={r}
                        checked={cancelReason === r}
                        onChange={() => setCancelReason(r)}
                      />
                      <span>{r}</span>
                    </label>
                  ))}
                </div>
                {cancelReason === 'Other' && (
                  <input
                    type="text"
                    value={cancelOther}
                    onChange={(e) => setCancelOther(e.target.value)}
                    placeholder="Tell us briefly…"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  />
                )}
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => setShowCancelForm(false)}
                    className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-xl font-semibold text-sm"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={!!busy}
                    className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5"
                  >
                    {busy === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Confirm cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <p className="text-center text-[11px] text-gray-400 mt-4">
          Questions? <a href="mailto:info@convelabs.com" className="text-[#B91C1C] underline">info@convelabs.com</a> · (941) 527-9169
        </p>
      </div>
    </div>
  );
};

export default AppointmentConfirmPage;
