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
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('Schedule conflict');
  const [cancelOther, setCancelOther] = useState('');

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

            {!showCancelForm ? (
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
                <a
                  href="mailto:info@convelabs.com?subject=Reschedule%20my%20appointment"
                  className="w-full bg-white border-2 border-gray-300 hover:border-[#B91C1C] text-gray-800 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                >
                  <Calendar className="h-4 w-4" />
                  Need to reschedule
                </a>
                <button
                  type="button"
                  onClick={() => setShowCancelForm(true)}
                  className="w-full bg-white border-2 border-gray-200 hover:border-red-400 text-gray-600 hover:text-red-700 py-3 rounded-xl font-medium text-sm"
                >
                  Cancel this visit
                </button>
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
