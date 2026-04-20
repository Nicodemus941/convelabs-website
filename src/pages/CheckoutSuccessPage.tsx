import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, Sparkles, Calendar, Mail, Crown, Heart, AlertTriangle, ChevronRight } from 'lucide-react';
import ReferringProviderCapture from '@/components/patient/ReferringProviderCapture';

/**
 * Universal checkout-success page: /welcome?session_id=cs_...
 *
 * Hormozi's trust ceremony — the most important UX moment in the business is
 * the MOMENT money changes hands. Before this page existed, patients got
 * dropped into a void after Stripe → didn't know if they paid → hit submit
 * again → double-charge (see: Suzanne/Aditya, 2026-04-20).
 *
 * This page:
 *   1. Verifies the session server-side (via confirm-checkout-session edge fn)
 *   2. Renders a kind-specific receipt (membership / appointment / lab request)
 *   3. Shows exactly what unlocked + the immediate next step
 *   4. Tells the user they'll also get an email receipt (idempotent backup)
 */

type Kind = 'membership' | 'appointment' | 'lab_request' | 'other';

interface ConfirmResponse {
  ok: boolean;
  paid: boolean;
  kind: Kind;
  customer_email: string | null;
  customer_name: string | null;
  amount_display: string;
  details: any;
}

const TIER_META: Record<string, { label: string; color: string; benefits: string[]; icon: any }> = {
  member: {
    label: 'Member',
    color: '#0F766E',
    icon: Heart,
    benefits: ['$10 off every lab visit — forever', 'Priority booking windows', 'Unified dashboard for every visit + result', 'Family sharing under one account'],
  },
  vip: {
    label: 'VIP · Founding Member',
    color: '#B91C1C',
    icon: Sparkles,
    benefits: [
      '$10 off every lab visit — forever',
      'Priority same-day mobile booking',
      'One free family member under your account',
      'Founding rate-lock: your $199 never goes up',
      '48-hour priority result delivery window',
      'Founding Member badge · first access to new services',
    ],
  },
  concierge: {
    label: 'Concierge Elite',
    color: '#7C3AED',
    icon: Crown,
    benefits: [
      'Dedicated care coordinator · direct phone line',
      'Unlimited same-day reschedules (no fee)',
      'Anywhere-in-Florida draw (out-of-zone fee waived)',
      'Early access to new test panels + advanced labs',
      'Quarterly health-trends review',
    ],
  },
};

const CheckoutSuccessPage: React.FC = () => {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ConfirmResponse | null>(null);
  // Referring-provider capture modal (appointment / lab_request bookings only)
  const [providerModalOpen, setProviderModalOpen] = useState(false);

  useEffect(() => {
    if (!sessionId) { setErr('No session_id provided'); setLoading(false); return; }
    (async () => {
      try {
        const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/confirm-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const j = await resp.json();
        if (!resp.ok) throw new Error(j.error || 'Could not verify payment');
        setData(j);
        // For appointment / lab-request bookings, prompt for referring-provider
        // capture ~2 seconds after success renders — patient is warm + just paid.
        if ((j.kind === 'appointment' || j.kind === 'lab_request') && j.paid && j.details?.patient_name) {
          setTimeout(() => setProviderModalOpen(true), 2000);
        }
      } catch (e: any) {
        setErr(e?.message || 'Could not verify payment');
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-white">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-emerald-600 mx-auto" />
          <p className="text-sm text-gray-600">Verifying your payment…</p>
        </div>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-white p-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-red-200 p-6 text-center">
          <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-900 mb-2">We couldn't verify this session</h1>
          <p className="text-sm text-gray-600">{err || 'Something went wrong.'}</p>
          <p className="text-xs text-gray-500 mt-3">If you just paid, please email <a className="text-[#B91C1C] underline" href="mailto:info@convelabs.com">info@convelabs.com</a> with your name — we'll confirm your receipt within minutes.</p>
          <p className="text-[11px] text-gray-400 mt-4">Do NOT retry your payment — we'll sort it out on our side.</p>
        </div>
      </div>
    );
  }

  if (!data.paid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-white p-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-amber-200 p-6 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-900 mb-2">Payment hasn't cleared yet</h1>
          <p className="text-sm text-gray-600">Your bank is still processing. This usually resolves in 30 seconds — refresh this page in a minute.</p>
          <Button onClick={() => window.location.reload()} variant="outline" className="mt-4">Refresh</Button>
        </div>
      </div>
    );
  }

  const firstName = (data.customer_name || data.customer_email || 'there').split(/[ @]/)[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-white py-12 px-4">
      <div className="max-w-xl mx-auto">
        {/* Hero — the unmistakable ✓ */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/30">
            <CheckCircle2 className="h-12 w-12 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 mb-1.5">Payment confirmed</h1>
          <p className="text-base text-gray-600">
            Thanks, {firstName}. <strong>{data.amount_display}</strong> charged · receipt on its way to your inbox.
          </p>
        </div>

        {/* Kind-specific body */}
        {data.kind === 'membership' && <MembershipBody data={data} />}
        {data.kind === 'lab_request' && <LabRequestBody data={data} />}
        {data.kind === 'appointment' && <AppointmentBody data={data} />}
        {data.kind === 'other' && <OtherBody data={data} />}

        {/* Universal footer */}
        <div className="mt-6 space-y-2">
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-center text-sm text-gray-600">
            📧 A receipt is landing at <strong className="text-gray-900">{data.customer_email || 'your email'}</strong> within 60 seconds.
            <br/><span className="text-xs text-gray-500">If you don't see it, check spam — or email <a href="mailto:info@convelabs.com" className="text-[#B91C1C]">info@convelabs.com</a>.</span>
          </div>
          <div className="text-center">
            <p className="text-[11px] text-gray-400 mt-3">
              <strong>Do not refresh or re-submit.</strong> You are not charged again.
            </p>
          </div>
        </div>

        {/* Referring-provider capture (appointment / lab-request only) */}
        {(data.kind === 'appointment' || data.kind === 'lab_request') && data.details?.patient_name && sessionId && (
          <ReferringProviderCapture
            open={providerModalOpen}
            onClose={() => setProviderModalOpen(false)}
            appointmentId={data.details?.id || sessionId}
            patientEmail={data.customer_email || ''}
            patientName={data.details?.patient_name || data.customer_name || ''}
          />
        )}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════
// Kind-specific bodies
// ════════════════════════════════════════════════════════════════════════

const MembershipBody: React.FC<{ data: ConfirmResponse }> = ({ data }) => {
  const tier = (data.details?.tier || 'member') as keyof typeof TIER_META;
  const meta = TIER_META[tier] || TIER_META.member;
  const Icon = meta.icon;
  const memberNum = data.details?.founding_member_number;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden">
      <div style={{ background: `linear-gradient(135deg, ${meta.color}, ${meta.color}dd)` }} className="text-white px-6 py-5 text-center">
        <Icon className="h-6 w-6 mx-auto mb-1 opacity-90" />
        <p className="text-xs uppercase tracking-[2px] opacity-80">Welcome to ConveLabs</p>
        <h2 className="text-2xl font-extrabold mt-1">{meta.label}</h2>
        {memberNum != null && (
          <div className="inline-block bg-white/20 border border-white/40 rounded-full px-3 py-1 text-xs font-bold mt-2">
            Founding Member #{memberNum} · rate locked for life
          </div>
        )}
      </div>
      <div className="p-5">
        <p className="text-sm font-semibold text-gray-900 mb-2.5">Here's what just unlocked:</p>
        <ul className="space-y-1.5">
          {meta.benefits.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: meta.color }} />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 pt-4 border-t border-gray-100 flex justify-center">
          <Button asChild className="text-white gap-1.5" style={{ backgroundColor: meta.color }}>
            <Link to="/dashboard/patient">Open my dashboard <ChevronRight className="h-4 w-4" /></Link>
          </Button>
        </div>
        <div className="mt-4 bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
          <p><strong className="text-gray-900">Two rules we live by:</strong></p>
          <p>1. If ConveLabs causes a redraw, it's free.</p>
          <p>2. If the reference lab causes it, 50% off.</p>
        </div>
      </div>
    </div>
  );
};

const LabRequestBody: React.FC<{ data: ConfirmResponse }> = ({ data }) => {
  const d = data.details || {};
  const when = d.appointment_date ? new Date(d.appointment_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '';
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden">
      <div className="bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] text-white px-6 py-5 text-center">
        <Calendar className="h-6 w-6 mx-auto mb-1 opacity-90" />
        <p className="text-xs uppercase tracking-[2px] opacity-80">Your visit is booked</p>
        <h2 className="text-xl font-extrabold mt-1">{when}{d.appointment_time ? ` at ${d.appointment_time}` : ''}</h2>
      </div>
      <div className="p-5 space-y-2.5 text-sm">
        <div className="flex justify-between"><span className="text-gray-500">Where:</span><span className="font-semibold text-gray-900 text-right">At your address (mobile)</span></div>
        {d.address && <div className="text-xs text-gray-600 text-right">{d.address}</div>}
        {d.fasting_required && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
            <p className="text-xs font-bold text-amber-900">⚠️ Fasting required</p>
            <p className="text-xs text-amber-800 mt-1">Stop eating/drinking (water is fine) 8 hours before your draw. We'll text a reminder the night before.</p>
          </div>
        )}
        <div className="mt-4 pt-3 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-600 mb-2">We'll text when the phleb is on the way.</p>
          <Button asChild variant="outline" className="gap-1">
            <Link to="/dashboard/patient">View in my dashboard <ChevronRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

const AppointmentBody: React.FC<{ data: ConfirmResponse }> = ({ data }) => <LabRequestBody data={data} />;

const OtherBody: React.FC<{ data: ConfirmResponse }> = ({ data }) => (
  <div className="rounded-2xl border border-gray-200 bg-white shadow-lg p-6 text-center">
    <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
    <p className="text-base font-semibold text-gray-900 mb-2">Your purchase is confirmed.</p>
    <p className="text-sm text-gray-600 mb-4">{data.amount_display} has been charged to your card on file. A receipt is on the way.</p>
    <Button asChild>
      <Link to="/dashboard/patient">Open my dashboard</Link>
    </Button>
  </div>
);

export default CheckoutSuccessPage;
