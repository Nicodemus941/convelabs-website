/**
 * AppointmentPayPage — branded checkout at /pay/:token.
 *
 * Patient lands here from the invoice email/SMS. Reviews the visit, can add
 * a tip for their phlebotomist, accepts T&C, then "Pay" → redirected to
 * Stripe Checkout (server recomputes the total, never trusts the client).
 *
 * Token-only; no PHI in the URL.
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

const SUPABASE_URL = 'https://yluyonhrxxtyuiyrdixl.supabase.co';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

const TIP_PRESETS = [0, 1000, 1500, 2500]; // cents: $0 / $10 / $15 / $25

interface PayDetails {
  status: 'unpaid' | 'paid' | 'expired' | 'voided';
  subtotal_cents?: number;
  terms_url?: string;
  privacy_url?: string;
  appointment?: {
    patient_first_name: string;
    appointment_date: string;
    appointment_time: string | null;
    address: string | null;
    service_name: string | null;
    phleb_first_name: string | null;
  };
}

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const AppointmentPayPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PayDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tipCents, setTipCents] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [acceptTc, setAcceptTc] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/get-appointment-pay-details?token=${encodeURIComponent(token)}`, {
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        });
        const j = await res.json();
        if (!res.ok) setError('We couldn\'t find this payment link.');
        else setData(j);
      } catch {
        setError('Something went wrong loading your invoice.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const subtotal = data?.subtotal_cents || 0;
  const effectiveTip = useCustom
    ? Math.max(0, Math.round((parseFloat(customTip) || 0) * 100))
    : tipCents;
  const total = subtotal + effectiveTip;

  async function handlePay() {
    if (!token || submitting || !acceptTc) return;
    setSubmitting(true); setSubmitError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/proceed-to-stripe-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ token, tip_cents: effectiveTip, accept_tc: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.stripe_url) {
        window.location.href = j.stripe_url;
      } else if (j.error === 'tip_too_large') {
        setSubmitError('That tip is larger than we can accept — please lower it.');
      } else if (j.error === 'already_paid') {
        setSubmitError('This invoice has already been paid.');
      } else if (j.error === 'expired' || j.error === 'voided') {
        setSubmitError('This payment link is no longer valid. Please contact us for a new one.');
      } else {
        setSubmitError('We couldn\'t start checkout. Please try again or call (941) 527-9169.');
      }
    } catch {
      setSubmitError('We couldn\'t start checkout. Please try again or call (941) 527-9169.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" /></div>;

  const statusMsg: Record<string, { title: string; body: string }> = {
    paid: { title: 'This visit is paid ✓', body: 'Thanks! Nothing more to do. See you at your appointment.' },
    expired: { title: 'This link has expired', body: 'Reply to your booking confirmation or call (941) 527-9169 for a fresh link.' },
    voided: { title: 'This invoice was voided', body: 'Contact us for an updated invoice.' },
  };

  if (error || !data || (data.status && data.status !== 'unpaid')) {
    const s = (data?.status && statusMsg[data.status]) || { title: 'Hmm — let\'s try that again', body: error || 'We couldn\'t load this invoice.' };
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white border rounded-2xl p-6 shadow-sm text-center">
          {data?.status === 'paid'
            ? <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
            : <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />}
          <h1 className="text-lg font-semibold text-gray-900 mb-2">{s.title}</h1>
          <p className="text-sm text-gray-600">{s.body}</p>
          <p className="text-xs text-gray-400 mt-4">info@convelabs.com · (941) 527-9169</p>
        </div>
      </div>
    );
  }

  const a = data.appointment!;
  const dateLabel = a.appointment_date
    ? new Date(String(a.appointment_date).substring(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : '';

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] text-white px-6 py-5 text-center">
            <h1 className="text-xl font-bold">Almost done — review &amp; pay</h1>
          </div>

          <div className="p-6 space-y-5">
            {/* Visit summary */}
            <div className="bg-gray-50 border rounded-lg p-3 text-sm">
              <p className="text-gray-900">Hi <strong>{a.patient_first_name}</strong>,</p>
              {dateLabel && <p className="text-gray-700 mt-1"><strong>{dateLabel}{a.appointment_time ? ` at ${a.appointment_time}` : ''}</strong></p>}
              {a.address && <p className="text-gray-600 text-xs mt-1">{a.address}</p>}
              {a.service_name && <p className="text-gray-500 text-xs mt-1">{a.service_name}</p>}
              {a.phleb_first_name && <p className="text-gray-500 text-xs mt-1">Phlebotomist: {a.phleb_first_name}</p>}
            </div>

            {/* Pricing */}
            <div className="text-sm">
              <div className="flex justify-between text-gray-700"><span>Visit total</span><span>{fmt(subtotal)}</span></div>
            </div>

            {/* Tip */}
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-2">Add a tip for {a.phleb_first_name || 'your phlebotomist'}? <span className="font-normal text-gray-400">(optional)</span></p>
              <div className="grid grid-cols-4 gap-1.5">
                {TIP_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { setUseCustom(false); setTipCents(c); }}
                    className={`py-2.5 rounded-lg text-sm font-semibold border min-h-[44px] ${!useCustom && tipCents === c ? 'bg-[#B91C1C] text-white border-[#B91C1C]' : 'bg-white text-gray-700 border-gray-200 hover:border-[#B91C1C]'}`}
                  >
                    {c === 0 ? 'None' : `$${c / 100}`}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setUseCustom(true)}
                className={`mt-1.5 w-full py-2.5 rounded-lg text-sm font-medium border ${useCustom ? 'border-[#B91C1C] text-[#B91C1C]' : 'border-gray-200 text-gray-600'}`}
              >
                Custom amount
              </button>
              {useCustom && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-gray-500">$</span>
                  <input
                    type="number" min="0" step="1" inputMode="decimal"
                    value={customTip}
                    onChange={(e) => setCustomTip(e.target.value)}
                    placeholder="Tip amount"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>

            {/* Total */}
            <div className="border-t pt-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-gray-900">Total</span>
              <span className="text-2xl font-extrabold text-gray-900">{fmt(total)}</span>
            </div>

            {/* T&C */}
            <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={acceptTc} onChange={(e) => setAcceptTc(e.target.checked)} className="mt-0.5" />
              <span>
                I confirm my visit details and agree to ConveLabs'{' '}
                <a href={data.terms_url} target="_blank" rel="noreferrer" className="text-[#B91C1C] underline">Terms</a> &amp;{' '}
                <a href={data.privacy_url} target="_blank" rel="noreferrer" className="text-[#B91C1C] underline">Privacy Policy</a>.
              </span>
            </label>

            {submitError && <p className="text-xs text-red-600">{submitError}</p>}

            <button
              type="button"
              onClick={handlePay}
              disabled={submitting || !acceptTc}
              className="w-full bg-[#B91C1C] hover:bg-[#991B1B] disabled:opacity-50 text-white py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              Pay {fmt(total)} securely with Stripe →
            </button>

            <p className="text-center text-[11px] text-gray-400 flex items-center justify-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> Powered by Stripe. Your card never touches ConveLabs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppointmentPayPage;
