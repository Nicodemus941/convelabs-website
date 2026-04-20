import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, Building2, User, Mail, Phone, Sparkles, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * /join/:token
 *
 * Landing for providers who click the CTA in the 5-email acquisition drip.
 * One-click portal claim — magic-link, no password. Uses claim-provider-portal
 * edge fn in two modes: preview (render pre-filled form) + activate (create org).
 */

interface Provider {
  provider_name: string | null;
  practice_name: string | null;
  practice_email: string | null;
  practice_phone: string | null;
  practice_city: string | null;
}

const EDGE = 'https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/claim-provider-portal';

const ProviderClaimPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [done, setDone] = useState<{ email: string } | null>(null);
  const [referredCount, setReferredCount] = useState<number>(0);
  const [referredPatients, setReferredPatients] = useState<any[]>([]);

  // Editable fields (pre-filled from the row)
  const [practiceName, setPracticeName] = useState('');
  const [providerName, setProviderName] = useState('');
  const [practiceEmail, setPracticeEmail] = useState('');
  const [practicePhone, setPracticePhone] = useState('');

  useEffect(() => {
    if (!token) { setError('No token in URL'); setLoading(false); return; }
    (async () => {
      try {
        const resp = await fetch(EDGE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, mode: 'preview' }),
        });
        const j = await resp.json();
        if (!resp.ok) { setError(j.error || 'Link not found'); setLoading(false); return; }
        if (j.already_converted) {
          navigate('/dashboard/provider', { replace: true });
          return;
        }
        setProvider(j.provider);
        setReferredCount(j.referred_patient_count || 0);
        setPracticeName(j.provider.practice_name || '');
        setProviderName(j.provider.provider_name || '');
        setPracticeEmail(j.provider.practice_email || '');
        setPracticePhone(j.provider.practice_phone || '');
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [token, navigate]);

  const handleActivate = async () => {
    if (!practiceName.trim() || !practiceEmail.trim()) {
      setError('Practice name + email required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch(EDGE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          mode: 'activate',
          practice_name: practiceName.trim(),
          provider_name: providerName.trim(),
          practice_email: practiceEmail.trim().toLowerCase(),
          practice_phone: practicePhone.trim(),
        }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || 'Activation failed');
      setDone({ email: practiceEmail.trim().toLowerCase() });
      // Fetch the referred-patients list post-activation for the welcome ceremony
      try {
        const patientsResp = await fetch(EDGE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, mode: 'referred_patients' }),
        });
        const patientsJ = await patientsResp.json();
        if (patientsResp.ok && Array.isArray(patientsJ.patients)) {
          setReferredPatients(patientsJ.patients);
        }
      } catch { /* non-blocking */ }
    } catch (e: any) {
      setError(e?.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-white">
        <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  if (error && !provider) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-white p-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-red-200 p-6 text-center">
          <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-900 mb-2">Link unavailable</h1>
          <p className="text-sm text-gray-600">{error}</p>
          <p className="text-xs text-gray-500 mt-4">Reply to Nico's last email and he'll send a fresh link in minutes.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-white p-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-emerald-200 p-7 text-center shadow-lg">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">You're in. Welcome aboard.</h1>
          <p className="text-sm text-gray-600 mb-4">
            We sent a one-click sign-in link to <strong>{done.email}</strong>. Check your inbox (and spam, just in case) — tap the link and you're in your provider portal.
          </p>
          <div className="bg-gray-50 rounded-lg p-3 text-left text-xs text-gray-600 space-y-1.5 mb-4">
            <div><strong>What happens next:</strong></div>
            <div>✓ Every ConveLabs draw for your patients shows up in real time</div>
            <div>✓ You'll get delivery receipts automatically — no more chasing</div>
            <div>✓ Use "Request Labs" to send any patient a booking link in 15 sec</div>
          </div>

          {/* Referred patients list — auto-linked to the new org via DB trigger */}
          {referredPatients.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-left mb-4">
              <p className="text-sm font-semibold text-emerald-900 mb-2">
                ✓ {referredPatients.length} patient{referredPatients.length === 1 ? '' : 's'} already in your dashboard
              </p>
              <ul className="space-y-1.5">
                {referredPatients.slice(0, 5).map((p, i) => (
                  <li key={i} className="flex items-center justify-between text-xs text-emerald-900">
                    <span className="font-medium">{p.patient_name || p.patient_email}</span>
                    {p.appointment_count > 0 && (
                      <span className="text-[11px] text-emerald-700">
                        {p.appointment_count} visit{p.appointment_count === 1 ? '' : 's'}
                      </span>
                    )}
                  </li>
                ))}
                {referredPatients.length > 5 && (
                  <li className="text-[11px] text-emerald-700 italic">+ {referredPatients.length - 5} more — all visible in your dashboard</li>
                )}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-gray-500">Didn't get the email in 5 min? Email <a href="mailto:info@convelabs.com" className="text-[#B91C1C] underline">info@convelabs.com</a>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-white py-10 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-[#B91C1C] text-white px-4 py-1.5 rounded-full text-xs font-semibold mb-4">
            <Sparkles className="h-3.5 w-3.5" /> Provider portal · free · no contract
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">One click to activate</h1>
          <p className="text-sm text-gray-600">
            Confirm your practice info — we'll email you a sign-in link. No password to create. 30 seconds, done.
          </p>
        </div>

        {/* Patient-count anchor — personalizes the ask */}
        {referredCount > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-3 text-center">
            <p className="text-sm text-emerald-900">
              <strong>{referredCount} of your patient{referredCount === 1 ? '' : 's'}</strong> {referredCount === 1 ? 'has' : 'have'} already booked with ConveLabs. Activate to see {referredCount === 1 ? 'their' : 'all of their'} visits in your dashboard.
            </p>
          </div>
        )}

        {/* Value card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">What you'll get, free forever:</h2>
          <ul className="text-sm text-gray-700 space-y-1.5">
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" /> Real-time status for every ConveLabs draw your patients book</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" /> Specimen delivery receipts — no more fax-machine chasing</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" /> "Request Labs" — send any patient a booking link in 15 seconds</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" /> OCR reads your lab orders automatically</li>
          </ul>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
          <div>
            <Label className="text-xs text-gray-700 flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Practice name *</Label>
            <Input value={practiceName} onChange={e => setPracticeName(e.target.value)} placeholder="e.g. Winter Park Family Med" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-700 flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Your name</Label>
              <Input value={providerName} onChange={e => setProviderName(e.target.value)} placeholder="Dr. Jane Smith" />
            </div>
            <div>
              <Label className="text-xs text-gray-700 flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Phone</Label>
              <Input value={practicePhone} onChange={e => setPracticePhone(e.target.value)} placeholder="(407) 555-1234" />
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-700 flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Practice email *</Label>
            <Input type="email" value={practiceEmail} onChange={e => setPracticeEmail(e.target.value)} placeholder="office@practice.com" />
            <p className="text-[10px] text-gray-500 mt-1">We'll send your sign-in link here.</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-2.5 text-xs text-red-700">
              {error}
            </div>
          )}

          <Button
            onClick={handleActivate}
            disabled={submitting || !practiceName.trim() || !practiceEmail.trim()}
            className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-11 text-sm font-semibold gap-2"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Activating…</>
            ) : (
              <>Activate my portal →</>
            )}
          </Button>

          <p className="text-[11px] text-gray-500 text-center">
            No credit card. No contract. Takes 30 seconds.
          </p>
        </div>

        <p className="text-center text-[11px] text-gray-500 mt-6">
          Questions? Reply to Nico at <a href="mailto:nico@convelabs.com" className="text-[#B91C1C]">nico@convelabs.com</a> or call (941) 527-9169.
        </p>
      </div>
    </div>
  );
};

export default ProviderClaimPage;
