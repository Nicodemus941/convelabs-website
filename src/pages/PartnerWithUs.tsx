import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Building2, CheckCircle2, Loader2, Shield,
  Sparkles, Clock, Calendar, FileCheck, Smartphone, DollarSign,
  Zap, Stethoscope, Users, FlaskConical, Mail, Phone,
} from 'lucide-react';
import Header from '@/components/home/Header';
import Footer from '@/components/home/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * PartnerWithUs — lightweight intake for providers who want to become a
 * lab-collection partner. Fully responsive (mobile + tablet + desktop),
 * self-sufficient end-to-end:
 *
 *   1. Provider fills 1-page form
 *   2. submit-partner-inquiry edge fn inserts row (service_role)
 *   3. Admin gets notification email at info@convelabs.com
 *   4. Submitter gets auto-reply with 3-step "what happens next" outline
 *   5. Redirects to /partner-with-us/thanks
 *
 * No manual admin touch required until the founder reads the email and
 * replies.
 */

const PRACTICE_TYPES = [
  { value: 'concierge', label: 'Concierge medicine' },
  { value: 'functional_med', label: 'Functional / integrative medicine' },
  { value: 'naturopath', label: 'Naturopathic / holistic' },
  { value: 'primary_care', label: 'Primary care' },
  { value: 'specialty', label: 'Specialty clinic (HRT, BHRT, fertility, etc.)' },
  { value: 'wellness', label: 'Wellness / longevity clinic' },
  { value: 'research', label: 'Clinical research / IRB-governed trials' },
  { value: 'other', label: 'Other' },
];

const VOLUMES = [
  { value: '<10', label: 'Under 10 / month' },
  { value: '10-25', label: '10 – 25 / month' },
  { value: '25-50', label: '25 – 50 / month' },
  { value: '50-100', label: '50 – 100 / month' },
  { value: '100+', label: '100+ / month' },
];

const BILLING = [
  { value: 'patient_pay', label: 'Patient pays directly (default)' },
  { value: 'org_pay', label: 'Our practice pays (we invoice you)' },
  { value: 'mixed', label: 'Depends on the visit — we decide per-patient' },
];

// Benefits content — "how ConveLabs streamlines your lab process"
const BENEFITS = [
  {
    icon: Calendar,
    title: 'Your patients self-schedule in 90 seconds',
    body: 'No more phone tag. Your patients tap a link, pick a day, and a licensed phleb shows up at their door. You see every booking live.',
  },
  {
    icon: FileCheck,
    title: 'Upload a lab order, our OCR does the rest',
    body: 'Our proprietary OCR reads every panel, flags fasting/urine/GTT requirements, and auto-sends the patient protocol-specific prep instructions. Fewer redraws, zero invalid specimens.',
  },
  {
    icon: DollarSign,
    title: 'Billing isolated. Patient-pay, org-pay, or mixed.',
    body: "Flip a toggle per visit — we invoice you or the patient. Your org's billing is walled off from your patient's. No cross-contamination. No surprises.",
  },
  {
    icon: Smartphone,
    title: 'Live specimen tracking — like FedEx for blood',
    body: "Every specimen gets a unique ID. Collected → In Transit → Delivered → Results ETA. You see status in your portal instantly. You never chase us.",
  },
  {
    icon: Zap,
    title: 'Set up in under 48 hours',
    body: "From 'yes' to your first patient booking: 2 days or less. Custom portal, team logins, branded patient emails — all live in under 48 hours.",
  },
  {
    icon: Shield,
    title: 'Recollection guarantee — in writing',
    body: 'If ConveLabs caused the error, recollection is 100% free. If the reference lab caused it, 50% off. No other mobile phleb service in Florida puts this in writing.',
  },
  {
    icon: Users,
    title: 'Unlimited team logins — no per-seat pricing',
    body: 'Add every provider, nurse, and front-desk member at no extra cost. Each gets their own scoped portal view.',
  },
  {
    icon: Stethoscope,
    title: 'Built for your workflow',
    body: "Quiet-hours gate (9pm-8am ET), fasting reminders at 8 PM the night before, Google-review automation, provider-portal SMS alerts, QuickBooks sync. Set once, runs forever.",
  },
];

// Stats block — social proof numbers visible above the fold
const TRUST_STATS = [
  { num: '8', label: 'provider partnerships' },
  { num: '<48h', label: 'to go live' },
  { num: '24h', label: 'founder response' },
  { num: '100%', label: 'recollection guarantee' },
];

const PartnerWithUs: React.FC = () => {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    practiceName: '',
    contactName: '',
    contactRole: '',
    contactEmail: '',
    contactPhone: '',
    practiceType: '',
    servicesOffered: '',
    monthlyVolume: '',
    preferredBilling: '',
    notes: '',
  });

  const update = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));
  const canSubmit = form.practiceName.trim() && form.contactName.trim() && form.contactEmail.trim().includes('@');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);

    try {
      const params = new URLSearchParams(window.location.search);
      const referralSource = params.get('utm_source') || params.get('src') || 'direct';

      const { data, error } = await supabase.functions.invoke('submit-partner-inquiry', {
        body: {
          practiceName: form.practiceName,
          contactName: form.contactName,
          contactRole: form.contactRole || undefined,
          contactEmail: form.contactEmail,
          contactPhone: form.contactPhone || undefined,
          practiceType: form.practiceType || undefined,
          servicesOffered: form.servicesOffered || undefined,
          monthlyVolume: form.monthlyVolume || undefined,
          preferredBilling: form.preferredBilling || undefined,
          notes: form.notes || undefined,
          referralSource,
          landingUrl: document.referrer || undefined,
        },
      });

      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || 'Submission failed');
      }

      toast.success("Got it — check your email.");
      navigate('/partner-with-us/thanks');
    } catch (err: any) {
      console.error('Partner inquiry submit failed:', err);
      toast.error(`Something went wrong: ${err.message || 'please try again or email info@convelabs.com'}`);
      setSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Partner with ConveLabs — concierge lab collection for your patients</title>
        <meta name="description" content="Join 8 providers who trust ConveLabs with their patients' blood work. Custom pricing, branded portal, billing isolation, live in under 48 hours." />
        <link rel="canonical" href="https://www.convelabs.com/partner-with-us" />
      </Helmet>

      <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-50 via-white to-gray-50">
        <Header />

        <main className="flex-grow">
          {/* HERO */}
          <section className="pt-8 pb-8 sm:pt-12 sm:pb-10">
            <div className="container mx-auto px-4 max-w-4xl">
              <Link to="/" className="inline-flex items-center gap-1 text-xs sm:text-sm text-gray-500 hover:text-conve-red mb-4 sm:mb-6">
                <ArrowLeft className="h-4 w-4" /> Back to home
              </Link>

              <div className="text-center">
                <div className="inline-flex items-center gap-2 bg-conve-red/5 border border-conve-red/20 rounded-full px-3 py-1 sm:px-4 sm:py-1.5 mb-3 sm:mb-4">
                  <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-conve-red" />
                  <span className="text-[10px] sm:text-[11px] font-bold text-conve-red uppercase tracking-widest">For healthcare providers</span>
                </div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-3 leading-tight">
                  Partner with ConveLabs — your patients, our collection
                </h1>
                <p className="text-sm sm:text-base md:text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
                  Join the providers sending their patients to the concierge phlebotomy team that handles Aristotle Education, ND Wellness, The Restoration Place, Kristen Blake Wellness, and more.
                </p>
              </div>

              {/* Trust stats — responsive 2-col on mobile, 4-col desktop */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 sm:mt-8 max-w-2xl mx-auto">
                {TRUST_STATS.map((s) => (
                  <div key={s.label} className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-center">
                    <div className="text-xl sm:text-2xl font-bold text-conve-red">{s.num}</div>
                    <div className="text-[10px] sm:text-[11px] text-gray-600 mt-0.5 leading-tight">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* BENEFITS — "How ConveLabs streamlines your lab process" */}
          <section className="py-10 sm:py-14 bg-white border-y border-gray-100">
            <div className="container mx-auto px-4 max-w-5xl">
              <div className="text-center mb-8 sm:mb-10">
                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-conve-red mb-2">
                  Why providers partner with us
                </p>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 leading-tight">
                  Streamline your entire lab workflow — in one platform
                </h2>
                <p className="text-sm sm:text-base text-gray-600 mt-3 max-w-2xl mx-auto">
                  You write the order. We handle every single step that happens after. Your team stops playing phone tag; your patients get a VIP experience.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {BENEFITS.map((b) => {
                  const Icon = b.icon;
                  return (
                    <div key={b.title} className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 hover:border-conve-red/40 hover:shadow-md transition-all">
                      <div className="h-10 w-10 rounded-lg bg-conve-red/10 flex items-center justify-center mb-3">
                        <Icon className="h-5 w-5 text-conve-red" />
                      </div>
                      <h3 className="font-bold text-gray-900 text-sm sm:text-[15px] leading-tight mb-1.5">
                        {b.title}
                      </h3>
                      <p className="text-[12px] sm:text-xs text-gray-600 leading-relaxed">
                        {b.body}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 4-CLICK WORKFLOW — how simple it is */}
          <section className="py-10 sm:py-14 bg-gradient-to-br from-amber-50 to-rose-50">
            <div className="container mx-auto px-4 max-w-4xl">
              <div className="text-center mb-8">
                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-amber-700 mb-2">
                  Your typical lab request
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
                  Four clicks. Our entire workflow.
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {[
                  { n: 1, t: 'Upload the lab order', b: 'Drag-and-drop PDF or phone photo. OCR reads every panel + NPI + fasting flags automatically.' },
                  { n: 2, t: 'Register the patient', b: 'Name, phone, email. Existing patients auto-merge — no duplicates.' },
                  { n: 3, t: 'Set the draw-by date', b: '"Must be drawn before next Tuesday\'s consult." Patient can only book on or before.' },
                  { n: 4, t: 'Click send', b: 'Done. Patient gets tokenized SMS + email. No account, no password — just pick a slot.' },
                ].map((s) => (
                  <div key={s.n} className="bg-white border border-amber-200 rounded-xl p-4 sm:p-5 flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-conve-red to-red-900 text-white font-bold flex items-center justify-center flex-shrink-0">
                      {s.n}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-sm sm:text-[15px] text-gray-900 mb-1">{s.t}</h3>
                      <p className="text-[12px] sm:text-xs text-gray-600 leading-relaxed">{s.b}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white/60 border border-amber-200 rounded-xl p-4 mt-4 text-center">
                <p className="text-xs sm:text-sm text-amber-900 font-medium">
                  <Sparkles className="inline h-4 w-4 mr-1 text-amber-600" />
                  Reminders, fasting prep, morning-of ETA, post-visit follow-up, Google reviews, specimen tracking — all automated. Your team never touches it.
                </p>
              </div>
            </div>
          </section>

          {/* FORM */}
          <section className="py-10 sm:py-14 bg-white">
            <div className="container mx-auto px-4 max-w-3xl">
              <div className="text-center mb-6 sm:mb-8">
                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-conve-red mb-2">
                  Get started
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
                  Tell us about your practice
                </h2>
                <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto">
                  Takes 2 minutes. We reply within 24 hours with pricing and next steps.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 md:p-8 shadow-sm space-y-4 sm:space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="practiceName">Practice / organization name *</Label>
                    <Input id="practiceName" value={form.practiceName} onChange={e => update('practiceName', e.target.value)} placeholder="e.g. Your Wellness Clinic" required />
                  </div>
                  <div>
                    <Label htmlFor="practiceType">Practice type</Label>
                    <Select value={form.practiceType} onValueChange={v => update('practiceType', v)}>
                      <SelectTrigger id="practiceType"><SelectValue placeholder="Pick one" /></SelectTrigger>
                      <SelectContent>
                        {PRACTICE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="contactName">Your name *</Label>
                    <Input id="contactName" value={form.contactName} onChange={e => update('contactName', e.target.value)} placeholder="Jane Doe" required />
                  </div>
                  <div>
                    <Label htmlFor="contactRole">Your role</Label>
                    <Input id="contactRole" value={form.contactRole} onChange={e => update('contactRole', e.target.value)} placeholder="Owner / Office Manager / etc." />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="contactEmail">Email *</Label>
                    <Input id="contactEmail" type="email" inputMode="email" autoComplete="email" value={form.contactEmail} onChange={e => update('contactEmail', e.target.value)} placeholder="you@yourpractice.com" required />
                  </div>
                  <div>
                    <Label htmlFor="contactPhone">Phone</Label>
                    <Input id="contactPhone" type="tel" inputMode="tel" autoComplete="tel" value={form.contactPhone} onChange={e => update('contactPhone', e.target.value)} placeholder="(407) 555-0100" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="monthlyVolume">Monthly patient volume (est.)</Label>
                    <Select value={form.monthlyVolume} onValueChange={v => update('monthlyVolume', v)}>
                      <SelectTrigger id="monthlyVolume"><SelectValue placeholder="How many draws per month?" /></SelectTrigger>
                      <SelectContent>
                        {VOLUMES.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="preferredBilling">Preferred billing</Label>
                    <Select value={form.preferredBilling} onValueChange={v => update('preferredBilling', v)}>
                      <SelectTrigger id="preferredBilling"><SelectValue placeholder="Who pays?" /></SelectTrigger>
                      <SelectContent>
                        {BILLING.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="servicesOffered">What services / panels do you typically order?</Label>
                  <Textarea id="servicesOffered" value={form.servicesOffered} onChange={e => update('servicesOffered', e.target.value)} rows={3} placeholder="e.g. CBC/CMP, thyroid full, hormones, DUTCH kits, specialty fasting panels…" />
                </div>

                <div>
                  <Label htmlFor="notes">Anything else we should know?</Label>
                  <Textarea id="notes" value={form.notes} onChange={e => update('notes', e.target.value)} rows={3} placeholder="Special hours, unique panel requirements, starting volume, when you'd like to go live…" />
                </div>

                <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                  <Shield className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                  <span>Your information stays with us. 24-hour response — weekdays sooner.</span>
                </div>

                <Button
                  type="submit"
                  disabled={!canSubmit || submitting}
                  className="w-full bg-conve-red hover:bg-conve-red-dark text-white font-semibold py-5 sm:py-6 text-sm sm:text-base rounded-xl"
                >
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</>
                  ) : (
                    <>Send inquiry <ArrowRight className="h-4 w-4 ml-1" /></>
                  )}
                </Button>

                <p className="text-[10px] sm:text-[11px] text-gray-400 text-center">
                  Prefer to talk? Call <a href="tel:+19415279169" className="text-conve-red hover:underline">(941) 527-9169</a> or email <a href="mailto:info@convelabs.com" className="text-conve-red hover:underline">info@convelabs.com</a>.
                </p>
              </form>

              <div className="mt-8 sm:mt-10 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                  Providers who already trust us
                </p>
                <p className="text-xs sm:text-sm text-gray-700 leading-relaxed max-w-3xl mx-auto">
                  Aristotle Education · Clinical Associates of Orlando · Elite Medical Concierge · Dr. Jason Littleton · Natura Integrative and Functional Medicine · ND Wellness · The Restoration Place · Kristen Blake Wellness
                </p>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default PartnerWithUs;
