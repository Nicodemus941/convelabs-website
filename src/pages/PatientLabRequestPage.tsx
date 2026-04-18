import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, AlertCircle, Clock, Home, Building2, Calendar, ArrowRight, Mail, Phone, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

/**
 * PATIENT LAB REQUEST BOOKING PAGE (/lab-request/:token)
 *
 * Public page (no auth) that a patient lands on after clicking their
 * personalized link in the email/SMS we sent them. Designed for
 * 90-second completion on mobile.
 *
 * UX:
 *  1. Urgency banner (color shifts with days-until-deadline)
 *  2. Context: doctor/org, panels, prep (fasting/urine/gtt)
 *  3. Service choice: mobile vs in-office (with org pricing rules)
 *  4. Time picker (simplified — only a small set of morning slots for now)
 *  5. Address capture if mobile
 *  6. Submit → creates appointment → (if patient pays) redirects to Stripe
 *  7. Success screen with next-appt reminder
 */

const TIME_SLOTS = [
  '6:00 AM', '6:30 AM', '7:00 AM', '7:30 AM', '8:00 AM', '8:30 AM',
  '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
];

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

const PatientLabRequestPage: React.FC = () => {
  const { token } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState<LabRequestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [serviceType, setServiceType] = useState<'mobile' | 'in-office'>('mobile');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [address, setAddress] = useState('');
  const [emailOverride, setEmailOverride] = useState('');
  const [phoneOverride, setPhoneOverride] = useState('');

  // Fetch the lab request context
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
      } catch (e: any) {
        setErr(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // Stripe success redirect support
  useEffect(() => {
    if (params.get('scheduled') === '1') setSuccess(true);
  }, [params]);

  // Date helpers
  const minDate = useMemo(() => new Date().toISOString().substring(0, 10), []);
  const maxDate = useMemo(() => data?.request.draw_by_date || '', [data]);
  const daysLeft = useMemo(() => {
    if (!data?.request.draw_by_date) return 0;
    const d = new Date(data.request.draw_by_date); const now = new Date();
    return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }, [data]);

  const urgency = daysLeft <= 2 ? 'urgent' : daysLeft <= 7 ? 'soon' : 'ok';
  const urgencyColor = urgency === 'urgent' ? 'red' : urgency === 'soon' ? 'amber' : 'emerald';

  const canSubmit = !!(serviceType && date && time && (serviceType === 'in-office' || address));

  const handleSubmit = async () => {
    if (!canSubmit || !token) return;
    setSubmitting(true);
    try {
      const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/schedule-lab-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: token,
          service_type: serviceType,
          appointment_date: date,
          appointment_time: time,
          address: serviceType === 'mobile' ? address : null,
          patient_email_override: emailOverride.trim() || undefined,
          patient_phone_override: phoneOverride.trim() || undefined,
        }),
      });
      const j = await resp.json();
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
          <CardHeader>
            <CardTitle className="text-red-700">We couldn't open this link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
  const patientPrice = org.patient_price_cents != null ? `$${(org.patient_price_cents / 100).toFixed(0)}` : (serviceType === 'mobile' ? '$150' : '$55');

  // ── SUCCESS VIEW ─────────────────────────────────────────────────────
  if (success) {
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
              <p className="text-gray-600">{org.name} has been notified. You'll get a confirmation email and SMS shortly with all the details.</p>

              {request.next_doctor_appt_date && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
                  <p className="text-xs uppercase tracking-wider text-blue-900 font-semibold">Reminder</p>
                  <p className="text-sm text-blue-900 mt-1">Your next visit with {org.name} is <strong>{format(new Date(request.next_doctor_appt_date + 'T12:00:00'), 'EEEE, MMMM d')}</strong>. Your results will be in their hands before then.</p>
                </div>
              )}

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

            {/* Lab order preview */}
            {request.lab_order_url && (
              <a href={request.lab_order_url} target="_blank" rel="noreferrer" className="text-xs text-[#B91C1C] underline mt-3 inline-flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> View the lab order your provider uploaded
              </a>
            )}
          </CardContent>
        </Card>

        {/* Service choice */}
        <Card className="shadow-sm mb-4">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">Where would you like your draw?</p>
            <div className="space-y-2">
              <button onClick={() => setServiceType('mobile')}
                className={`w-full text-left p-3 border rounded-lg transition ${serviceType === 'mobile' ? 'border-[#B91C1C] bg-red-50/40 ring-1 ring-[#B91C1C]' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="flex items-center gap-3">
                  <Home className="h-5 w-5 text-[#B91C1C]" />
                  <div className="flex-1">
                    <p className="font-semibold text-sm">At home / office (mobile)</p>
                    <p className="text-xs text-gray-500">We come to you — no waiting room</p>
                  </div>
                  <p className="text-sm font-bold">{org.org_covers ? 'Covered' : patientPrice}</p>
                </div>
              </button>
              <button onClick={() => setServiceType('in-office')}
                className={`w-full text-left p-3 border rounded-lg transition ${serviceType === 'in-office' ? 'border-[#B91C1C] bg-red-50/40 ring-1 ring-[#B91C1C]' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-[#B91C1C]" />
                  <div className="flex-1">
                    <p className="font-semibold text-sm">At ConveLabs Maitland office</p>
                    <p className="text-xs text-gray-500">1800 Pembrook Dr, Suite 300</p>
                  </div>
                  <p className="text-sm font-bold">{org.org_covers ? 'Covered' : (org.patient_price_cents != null ? patientPrice : '$55')}</p>
                </div>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Date + time */}
        <Card className="shadow-sm mb-4">
          <CardContent className="p-5 space-y-4">
            <div>
              <Label>Pick a date <span className="text-[11px] text-gray-400">(by {format(new Date(request.draw_by_date + 'T12:00:00'), 'EEE MMM d')})</span></Label>
              <Input type="date" value={date} min={minDate} max={maxDate} onChange={e => setDate(e.target.value)} />
            </div>
            {date && (
              <div>
                <Label>Pick a time</Label>
                <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                  {TIME_SLOTS.map(t => (
                    <button key={t} onClick={() => setTime(t)}
                      className={`text-xs py-2 px-2 rounded border transition ${time === t ? 'bg-[#B91C1C] text-white border-[#B91C1C]' : 'bg-white border-gray-200 hover:border-[#B91C1C] hover:bg-red-50'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Address if mobile */}
        {serviceType === 'mobile' && (
          <Card className="shadow-sm mb-4">
            <CardContent className="p-5 space-y-3">
              <div>
                <Label>Where should we come? *</Label>
                <Input value={address} onChange={e => setAddress(e.target.value)}
                  placeholder="Street, City, State, ZIP" />
              </div>
            </CardContent>
          </Card>
        )}

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
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Scheduling…</> : <>Book my draw <ArrowRight className="h-4 w-4" /></>}
        </Button>

        <p className="text-center text-xs text-gray-400 mt-4">
          Questions? <a href="mailto:info@convelabs.com" className="underline">info@convelabs.com</a> · (941) 527-9169
        </p>
      </div>
    </div>
  );
};

export default PatientLabRequestPage;
