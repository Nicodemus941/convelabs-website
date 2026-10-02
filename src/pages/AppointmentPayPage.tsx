/**
 * AppointmentPayPage — branded on-site checkout at /pay/:token.
 *
 * The patient lands here from the invoice email/SMS (most open it on a
 * phone). They review the visit, optionally add a tip for their
 * phlebotomist, accept T&C, and pay with Stripe Embedded Checkout — card,
 * Apple Pay, Google Pay, Link — WITHOUT leaving convelabs.com. The server
 * recomputes every amount; this page never sends a total it computed.
 *
 * States: loading · unpaid (review → tip → pay) · paid (receipt) ·
 * expired · voided/cancelled · not found.
 *
 * Token-only; no PHI in the URL.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertTriangle, ShieldCheck, Heart, Phone, Mail, MapPin, CalendarDays, Clock, Lock, Pencil } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import ReferringProviderCapture from '@/components/patient/ReferringProviderCapture';

const SUPABASE_URL = 'https://yluyonhrxxtyuiyrdixl.supabase.co';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';
// Public Stripe key — safe to embed. Prefer env; fall back to the live key
// so the build works even before VITE_STRIPE_PUBLISHABLE_KEY is set in Vercel.
const STRIPE_PK = (import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY ||
  'pk_live_51TLWYvAPnMg8iHarlnWKX7obn6WvawSBRFhLUs793yCO55JjSMn2y6zyldU2wJiOxVabqS8iOP3jpRmWD4QrJw2H00HQgI7pTr';
const stripePromise = loadStripe(STRIPE_PK);

const BRAND = '#B91C1C';
const PHONE_DISPLAY = '(941) 527-9169';
const PHONE_TEL = 'tel:+19415279169';
const SUPPORT_EMAIL = 'info@convelabs.com';

// Tip presets as % of the pre-tip subtotal. Server caps at min($500, 50%).
const TIP_PERCENTS = [15, 20, 25] as const;
type TipChoice = 'none' | 15 | 20 | 25 | 'custom';

interface PayLine { label: string; cents: number }
interface PayDetails {
  status: 'unpaid' | 'paid' | 'expired' | 'voided';
  subtotal_cents?: number;
  lines?: PayLine[];
  selected_tip_cents?: number | null;
  terms_url?: string;
  privacy_url?: string;
  receipt_email_hint?: string | null;
  paid?: { total_cents: number; tip_cents: number; paid_at: string | null };
  appointment?: {
    patient_first_name: string;
    appointment_date: string;
    appointment_time: string | null;
    address: string | null;
    service_name: string | null;
    phleb_first_name: string | null;
  };
}

const fmt = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string | null) => d
  ? new Date(String(d).substring(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  : '';
const fmtTime = (t?: string | null) => {
  if (!t) return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t));
  if (!m) return String(t);
  const h = parseInt(m[1], 10);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
};

async function fetchDetails(token: string): Promise<PayDetails> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/get-appointment-pay-details?token=${encodeURIComponent(token)}`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
    cache: 'no-store',
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error || 'not_found');
  return j as PayDetails;
}

/* ───────────────────────── Shell ───────────────────────── */

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-[100dvh] bg-[#FBF8F2] text-gray-900 flex flex-col">
    <header className="px-4 pt-[max(16px,env(safe-area-inset-top))] pb-3">
      <div className="max-w-md mx-auto flex items-center justify-between">
        <a href="https://www.convelabs.com" className="flex items-center gap-2 font-extrabold tracking-tight text-lg" aria-label="ConveLabs home">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: BRAND }} aria-hidden="true" />
          ConveLabs
        </a>
        <span className="text-[11px] text-gray-500 flex items-center gap-1"><Lock className="h-3 w-3" aria-hidden="true" /> Secure checkout</span>
      </div>
    </header>
    <main className="flex-1 px-4 pb-[max(24px,env(safe-area-inset-bottom))]">
      <div className="max-w-md mx-auto">{children}</div>
    </main>
    <footer className="px-4 pb-6 text-center text-[11px] text-gray-500">
      <p>Questions? <a href={PHONE_TEL} className="underline underline-offset-2">{PHONE_DISPLAY}</a> · <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2">{SUPPORT_EMAIL}</a></p>
      <p className="mt-1">ConveLabs · Mobile phlebotomy · Central Florida</p>
    </footer>
  </div>
);

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <section className={`bg-white border border-gray-200 rounded-2xl shadow-sm ${className}`}>{children}</section>
);

const ContactRow: React.FC = () => (
  <div className="grid grid-cols-2 gap-2 mt-5">
    <a href={PHONE_TEL} className="min-h-[44px] rounded-xl border border-gray-200 flex items-center justify-center gap-2 text-sm font-semibold text-gray-800 hover:border-gray-400">
      <Phone className="h-4 w-4" aria-hidden="true" /> Call or text
    </a>
    <a href={`mailto:${SUPPORT_EMAIL}`} className="min-h-[44px] rounded-xl border border-gray-200 flex items-center justify-center gap-2 text-sm font-semibold text-gray-800 hover:border-gray-400">
      <Mail className="h-4 w-4" aria-hidden="true" /> Email us
    </a>
  </div>
);

/* ───────────────────────── Page ───────────────────────── */

const AppointmentPayPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const returnedPaid = searchParams.get('paid') === '1';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PayDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tipChoice, setTipChoice] = useState<TipChoice>(20);
  const [customTip, setCustomTip] = useState('');
  const [acceptTc, setAcceptTc] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [lockedTotal, setLockedTotal] = useState<{ subtotal: number; tip: number } | null>(null);
  const [paidInline, setPaidInline] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);

  const checkoutRef = useRef<HTMLDivElement | null>(null);
  const checkoutInstanceRef = useRef<any>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const j = await fetchDetails(token);
      setData(j);
      if (j.status === 'unpaid' && typeof j.selected_tip_cents === 'number' && j.subtotal_cents) {
        // Restore the tip the patient picked before a refresh.
        const pct = TIP_PERCENTS.find((p) => Math.round(j.subtotal_cents! * p / 100) === j.selected_tip_cents);
        if (j.selected_tip_cents === 0) setTipChoice('none');
        else if (pct) setTipChoice(pct);
        else { setTipChoice('custom'); setCustomTip((j.selected_tip_cents / 100).toFixed(2)); }
      }
    } catch (e: any) {
      setError(e?.message === 'token_not_found' ? 'not_found' : 'load_failed');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // After an on-page payment (or a ?paid=1 return from the redirect
  // fallback), poll until the webhook has stamped the appointment so the
  // receipt can say "recorded" truthfully. Stops after ~30s.
  useEffect(() => {
    if (!token || !(paidInline || returnedPaid)) return;
    let tries = 0;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const j = await fetchDetails(token);
        if (j.status === 'paid') { setData(j); setRecorded(true); return; }
      } catch { /* keep polling */ }
      if (++tries < 15) setTimeout(tick, 2000);
    };
    tick();
    return () => { cancelled = true; };
  }, [token, paidInline, returnedPaid]);

  const subtotal = data?.subtotal_cents || 0;
  const tipCap = Math.min(50000, Math.round(subtotal * 0.5));
  const presetCents = useMemo(() => Object.fromEntries(TIP_PERCENTS.map((p) => [p, Math.round(subtotal * p / 100)])) as Record<number, number>, [subtotal]);
  const customCents = Math.max(0, Math.round((parseFloat(customTip) || 0) * 100));
  const tipCents = tipChoice === 'none' ? 0 : tipChoice === 'custom' ? customCents : presetCents[tipChoice];
  const tipTooLarge = tipCents > tipCap;
  const total = subtotal + tipCents;
  const phleb = data?.appointment?.phleb_first_name || null;
  const phlebLabel = phleb || 'your phlebotomist';

  // Mount Stripe Embedded Checkout once we have a client secret.
  useEffect(() => {
    if (!clientSecret) return;
    let cancelled = false;
    setCheckoutReady(false);
    (async () => {
      try {
        const stripe = await stripePromise;
        if (!stripe || cancelled) return;
        const checkout = await (stripe as any).initEmbeddedCheckout({
          clientSecret,
          onComplete: () => setPaidInline(true),
        });
        if (cancelled) { try { checkout.destroy(); } catch { /* */ } return; }
        checkoutInstanceRef.current = checkout;
        if (checkoutRef.current) checkout.mount(checkoutRef.current);
        setCheckoutReady(true);
      } catch {
        setSubmitError(`Could not load the payment form. Please refresh, or call ${PHONE_DISPLAY}.`);
        setClientSecret(null);
        setLockedTotal(null);
      }
    })();
    return () => {
      cancelled = true;
      try { checkoutInstanceRef.current?.destroy(); } catch { /* */ }
      checkoutInstanceRef.current = null;
    };
  }, [clientSecret]);

  useEffect(() => { if (submitError && errorRef.current) errorRef.current.focus(); }, [submitError]);

  async function handlePay() {
    if (!token || submitting || !acceptTc || tipTooLarge) return;
    setSubmitting(true); setSubmitError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/proceed-to-stripe-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ token, tip_cents: tipCents, accept_tc: true, embedded: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.client_secret) {
        setLockedTotal({ subtotal, tip: tipCents });
        setClientSecret(j.client_secret);
      } else if (j.error === 'tip_too_large') {
        setSubmitError(`That tip is larger than we can accept (max ${fmt(j.max_tip_cents || tipCap)}). Please lower it.`);
      } else if (j.error === 'already_paid') {
        setSubmitError('Good news — this invoice is already paid.');
        load();
      } else if (j.error === 'expired' || j.error === 'voided') {
        setSubmitError(`This payment link is no longer valid. Call or text ${PHONE_DISPLAY} for a new one.`);
        load();
      } else {
        setSubmitError(`We couldn't start checkout. Please try again or call ${PHONE_DISPLAY}.`);
      }
    } catch {
      setSubmitError(`We couldn't start checkout. Please try again or call ${PHONE_DISPLAY}.`);
    } finally {
      setSubmitting(false);
    }
  }

  function changeTip() {
    // Tear down the mounted form and go back to the tip picker. The server
    // expires the stale session when a new total is requested.
    try { checkoutInstanceRef.current?.destroy(); } catch { /* */ }
    checkoutInstanceRef.current = null;
    setClientSecret(null);
    setLockedTotal(null);
    setCheckoutReady(false);
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <Shell>
        <div role="status" aria-live="polite" className="py-24 flex flex-col items-center gap-3 text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: BRAND }} aria-hidden="true" />
          <span className="text-sm">Loading your invoice…</span>
        </div>
      </Shell>
    );
  }

  const a = data?.appointment;
  const firstName = a?.patient_first_name || 'there';

  /* ── Paid (just now, or earlier) ── */
  if (paidInline || returnedPaid || data?.status === 'paid') {
    const paidTip = data?.paid?.tip_cents ?? lockedTotal?.tip ?? 0;
    const paidTotal = data?.paid?.total_cents ?? (lockedTotal ? lockedTotal.subtotal + lockedTotal.tip : 0);
    const paidVisit = Math.max(0, paidTotal - paidTip);
    const justPaid = paidInline || returnedPaid;
    return (
      <Shell>
        <Card className="p-6 text-center">
          <div className="bg-emerald-100 rounded-full w-16 h-16 mx-auto flex items-center justify-center mb-4">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">{justPaid ? `Thank you, ${firstName}!` : 'This visit is paid'}</h1>
          <p className="text-sm text-gray-600 mt-1">
            {justPaid ? 'Your payment went through.' : 'Nothing more to do here.'}
            {justPaid && (
              <span className="block mt-1 text-xs" aria-live="polite">
                {recorded
                  ? <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Recorded on your appointment</span>
                  : <span className="inline-flex items-center gap-1 text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Updating your appointment…</span>}
              </span>
            )}
          </p>

          {paidTotal > 0 && (
            <dl className="mt-5 text-sm text-left bg-[#FBF8F2] border border-gray-200 rounded-xl p-4 space-y-1.5">
              <div className="flex justify-between"><dt className="text-gray-600">Visit</dt><dd className="font-medium">{fmt(paidVisit)}</dd></div>
              {paidTip > 0 && <div className="flex justify-between"><dt className="text-gray-600">Tip for {phlebLabel}</dt><dd className="font-medium">{fmt(paidTip)}</dd></div>}
              <div className="flex justify-between border-t border-gray-200 pt-1.5 mt-1.5"><dt className="font-semibold">Total paid</dt><dd className="font-extrabold">{fmt(paidTotal)}</dd></div>
            </dl>
          )}

          {paidTip > 0 && (
            <p className="mt-4 text-sm text-gray-700 flex items-start gap-2 text-left bg-rose-50 border border-rose-100 rounded-xl p-3">
              <Heart className="h-4 w-4 mt-0.5 shrink-0" style={{ color: BRAND }} aria-hidden="true" />
              <span>100% of your {fmt(paidTip)} tip goes to {phleb ? <strong>{phleb}</strong> : 'your phlebotomist'}. That means a lot — thank you.</span>
            </p>
          )}

          <div className="mt-5 text-xs text-gray-500 space-y-1">
            {data?.receipt_email_hint && <p>A card receipt from Stripe is on its way to <span className="font-medium text-gray-700">{data.receipt_email_hint}</span>.</p>}
            {a?.appointment_date && <p>See you {fmtDate(a.appointment_date)}{a.appointment_time ? ` at ${fmtTime(a.appointment_time)}` : ''}.</p>}
          </div>

          <ContactRow />
        </Card>

        {justPaid && token && (
          <>
            <button
              type="button"
              onClick={() => setProviderOpen(true)}
              className="mt-4 w-full text-sm text-gray-600 underline underline-offset-2 min-h-[44px]"
            >
              Want your doctor to receive the results? Add their info
            </button>
            <ReferringProviderCapture
              open={providerOpen}
              onClose={() => setProviderOpen(false)}
              payToken={token}
              appointmentId=""
              patientEmail=""
              patientName={firstName}
            />
          </>
        )}
      </Shell>
    );
  }

  /* ── Expired / voided / not found ── */
  if (error || !data || data.status !== 'unpaid') {
    const kind = data?.status === 'expired' ? 'expired' : data?.status === 'voided' ? 'voided' : error === 'not_found' ? 'not_found' : 'failed';
    const copy: Record<string, { title: string; body: string }> = {
      expired: { title: 'This payment link has expired', body: `No charge was made. Call or text ${PHONE_DISPLAY} and we'll send you a fresh link in a minute.` },
      voided: { title: 'This invoice is no longer active', body: `It was cancelled or replaced, so nothing is due on this link. If you think that's a mistake, call or text ${PHONE_DISPLAY}.` },
      not_found: { title: "We couldn't find this payment link", body: `Double-check the link in your message, or call or text ${PHONE_DISPLAY} and we'll resend it.` },
      failed: { title: "Hmm — that didn't load", body: 'Please refresh the page. If it keeps happening, we can take payment over the phone.' },
    };
    const c = copy[kind];
    return (
      <Shell>
        <Card className="p-6 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" aria-hidden="true" />
          <h1 className="text-lg font-bold">{c.title}</h1>
          <p className="text-sm text-gray-600 mt-2">{c.body}</p>
          {kind === 'failed' && (
            <button type="button" onClick={() => { setLoading(true); setError(null); load(); }} className="mt-4 min-h-[44px] px-5 rounded-xl text-white font-semibold" style={{ background: BRAND }}>
              Try again
            </button>
          )}
          <ContactRow />
        </Card>
      </Shell>
    );
  }

  /* ── Unpaid: review → tip → pay ── */
  const lines = data.lines && data.lines.length > 0 ? data.lines : [{ label: a?.service_name || 'Mobile Blood Draw', cents: subtotal }];
  const inCheckout = !!clientSecret;

  return (
    <Shell>
      <h1 className="text-2xl font-extrabold tracking-tight mb-1">Hi {firstName}, here's your invoice</h1>
      <p className="text-sm text-gray-600 mb-4">Review your visit, add an optional tip, and pay right here. Takes about a minute.</p>

      {/* Visit summary */}
      <Card className="p-4 mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Your visit</h2>
        <ul className="text-sm space-y-1.5">
          {a?.appointment_date && (
            <li className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-gray-400 shrink-0" aria-hidden="true" /><span className="font-medium">{fmtDate(a.appointment_date)}</span></li>
          )}
          {a?.appointment_time && (
            <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-gray-400 shrink-0" aria-hidden="true" /><span>{fmtTime(a.appointment_time)}</span></li>
          )}
          {a?.address && (
            <li className="flex items-start gap-2"><MapPin className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" aria-hidden="true" /><span className="text-gray-700">{a.address}</span></li>
          )}
        </ul>
        <dl className="mt-3 pt-3 border-t border-gray-100 text-sm space-y-1">
          {lines.map((l, i) => (
            <div key={i} className="flex justify-between gap-3"><dt className="text-gray-700">{l.label}</dt><dd className="font-medium tabular-nums">{fmt(l.cents)}</dd></div>
          ))}
          {lines.length > 1 && (
            <div className="flex justify-between pt-1 border-t border-gray-100"><dt className="text-gray-600">Subtotal</dt><dd className="font-semibold tabular-nums">{fmt(subtotal)}</dd></div>
          )}
        </dl>
      </Card>

      {/* Tip */}
      <Card className="p-4 mb-3">
        {inCheckout ? (
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-semibold">Tip for {phlebLabel}: <span className="tabular-nums">{fmt(lockedTotal?.tip ?? tipCents)}</span></p>
              <p className="text-xs text-gray-500">100% goes to {phlebLabel}.</p>
            </div>
            <button type="button" onClick={changeTip} className="min-h-[44px] px-3 rounded-lg border border-gray-200 text-sm font-medium flex items-center gap-1.5 hover:border-gray-400">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Change
            </button>
          </div>
        ) : (
          <fieldset>
            <legend className="text-sm font-semibold">Add a tip for {phlebLabel}? <span className="font-normal text-gray-500">Optional</span></legend>
            <p className="text-xs text-gray-500 mt-0.5 mb-3">100% of your tip goes to {phlebLabel} — it's added to their next payout.</p>
            <div role="radiogroup" aria-label="Tip amount" className="grid grid-cols-4 gap-1.5">
              {TIP_PERCENTS.map((p) => {
                const on = tipChoice === p;
                return (
                  <button
                    key={p} type="button" role="radio" aria-checked={on}
                    onClick={() => setTipChoice(p)}
                    className={`min-h-[56px] rounded-xl border text-center leading-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#B91C1C] ${on ? 'text-white border-transparent' : 'bg-white text-gray-800 border-gray-200 hover:border-gray-400'}`}
                    style={on ? { background: BRAND } : undefined}
                  >
                    <span className="block text-sm font-bold">{p}%</span>
                    <span className={`block text-[11px] tabular-nums ${on ? 'text-white/85' : 'text-gray-500'}`}>{fmt(presetCents[p])}</span>
                  </button>
                );
              })}
              <button
                type="button" role="radio" aria-checked={tipChoice === 'custom'}
                onClick={() => setTipChoice('custom')}
                className={`min-h-[56px] rounded-xl border text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#B91C1C] ${tipChoice === 'custom' ? 'text-white border-transparent' : 'bg-white text-gray-800 border-gray-200 hover:border-gray-400'}`}
                style={tipChoice === 'custom' ? { background: BRAND } : undefined}
              >
                Other
              </button>
            </div>
            <div className="mt-2 min-h-[48px]">
              {tipChoice === 'custom' ? (
                <label className="flex items-center gap-2 border border-gray-300 rounded-xl px-3 min-h-[48px] focus-within:ring-2 focus-within:ring-[#B91C1C]">
                  <span className="text-gray-500" aria-hidden="true">$</span>
                  <span className="sr-only">Custom tip amount in dollars</span>
                  <input
                    type="text" inputMode="decimal" autoFocus
                    value={customTip}
                    onChange={(e) => setCustomTip(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="0.00"
                    aria-invalid={tipTooLarge}
                    className="w-full py-2 text-base outline-none bg-transparent"
                  />
                </label>
              ) : (
                <button type="button" onClick={() => setTipChoice('none')} aria-pressed={tipChoice === 'none'}
                  className={`min-h-[44px] w-full rounded-xl text-sm font-medium border ${tipChoice === 'none' ? 'border-gray-800 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
                  {tipChoice === 'none' ? '✓ No tip this time' : 'No tip this time'}
                </button>
              )}
            </div>
            {tipTooLarge && <p className="text-xs text-red-600 mt-1" role="alert">Max tip is {fmt(tipCap)}.</p>}
          </fieldset>
        )}
      </Card>

      {/* Total + pay */}
      <Card className="p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold">Total</span>
          <span className="text-2xl font-extrabold tabular-nums" aria-live="polite">{fmt(inCheckout && lockedTotal ? lockedTotal.subtotal + lockedTotal.tip : total)}</span>
        </div>
        {tipCents > 0 && !inCheckout && <p className="text-xs text-gray-500 text-right -mt-0.5">includes {fmt(tipCents)} tip</p>}

        {inCheckout ? (
          <div className="mt-4">
            {/* Fixed-height slot so the page doesn't jump while Stripe loads. */}
            <div className="relative min-h-[420px]">
              {!checkoutReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-500 text-sm" role="status" aria-live="polite">
                  <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /> Loading secure payment form…
                </div>
              )}
              <div ref={checkoutRef} aria-label="Payment form" />
            </div>
            <p className="text-center text-[11px] text-gray-500 mt-3 flex items-center justify-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Secured by Stripe. Your card details never touch ConveLabs.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="flex items-start gap-3 text-xs text-gray-600 cursor-pointer min-h-[44px]">
              <input type="checkbox" checked={acceptTc} onChange={(e) => setAcceptTc(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#B91C1C]" />
              <span>
                I confirm my visit details and agree to ConveLabs'{' '}
                <a href={data.terms_url} target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ color: BRAND }}>Terms</a> and{' '}
                <a href={data.privacy_url} target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ color: BRAND }}>Privacy Policy</a>.
              </span>
            </label>

            <p ref={errorRef} tabIndex={-1} role="alert" aria-live="assertive" className={`text-xs text-red-600 min-h-[16px] outline-none ${submitError ? '' : 'sr-only'}`}>{submitError || ''}</p>

            <button
              type="button"
              onClick={handlePay}
              disabled={submitting || !acceptTc || tipTooLarge || subtotal <= 0}
              aria-disabled={submitting || !acceptTc || tipTooLarge}
              className="w-full min-h-[56px] rounded-xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#B91C1C] transition-opacity"
              style={{ background: BRAND }}
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
              Pay {fmt(total)}
            </button>
            {!acceptTc && <p className="text-[11px] text-gray-500 text-center">Tick the box above to continue.</p>}

            <p className="text-center text-[11px] text-gray-500 flex items-center justify-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Card, Apple Pay &amp; Google Pay · processed by Stripe
            </p>
          </div>
        )}
      </Card>
    </Shell>
  );
};

export default AppointmentPayPage;
