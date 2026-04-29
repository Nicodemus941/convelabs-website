/**
 * /providers/register — public partner-org sign-up form.
 *
 * Hormozi structure: ask for the bare minimum (5 fields, ~90 seconds).
 * Everything else gets filled in via the in-portal Practice Profile
 * panel after we set them up. Each field has a one-line WHY label so
 * the prospect feels the trade.
 *
 * Submit creates a discovered_orgs row tagged outreach_status='inbound_signup'
 * + SMSes the owner so a real human onboards within 24h.
 */

import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2, Building2, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

const ProviderRegister: React.FC = () => {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    org_name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    primary_lab: '',
    notes: '',
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.org_name.trim() || !form.contact_email.trim()) {
      toast.error('Practice name and email are required');
      return;
    }
    setSubmitting(true);
    try {
      // Insert into provider_partnership_inquiries — existing table with
      // an open anon-INSERT policy (ppi_insert_anon_auth). Admin sees it
      // in the existing partnership-inquiries triage. status='new'.
      const { error } = await supabase.from('provider_partnership_inquiries' as any).insert({
        practice_name: form.org_name.trim(),
        contact_name: form.contact_name.trim() || null,
        contact_email: form.contact_email.trim(),
        contact_phone: form.contact_phone.trim() || null,
        practice_type: form.primary_lab || null, // reuse this column for primary lab hint
        notes: form.notes.trim() || null,
        referral_source: 'self_registration',
        landing_url: typeof window !== 'undefined' ? window.location.href : null,
        status: 'new',
      } as any);
      if (error) throw error;
      setSubmitted(true);
      toast.success('Thanks — we\'ll reach out within 24 hours');
    } catch (e: any) {
      toast.error(`Couldn't submit: ${e?.message || 'unknown'}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <>
        <Header />
        <main className="bg-gray-50 min-h-screen flex items-center justify-center px-6 py-12">
          <Card className="max-w-md w-full">
            <CardContent className="p-8 text-center space-y-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
              <h1 className="text-2xl font-bold">You're on the list</h1>
              <p className="text-sm text-gray-600">
                Nico will reach out within 24 hours with next steps. While you wait, you can review services + pricing here:
              </p>
              <Button asChild className="bg-[#B91C1C] hover:bg-[#991B1B] text-white">
                <Link to="/for-providers">Services & pricing</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Register your practice · ConveLabs</title>
        <meta name="description" content="Sign up your medical practice for ConveLabs concierge mobile lab services. Org-billed monthly invoicing, patient roster, branded patient portal." />
      </Helmet>

      <Header />

      <main className="bg-gray-50 min-h-screen py-12 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <Building2 className="h-10 w-10 text-[#B91C1C] mx-auto mb-3" />
            <h1 className="text-3xl font-bold mb-2">Register your practice</h1>
            <p className="text-sm text-gray-600">90 seconds. No obligation. We'll set up your portal within 24 hours.</p>
          </div>

          {/* Value stack */}
          <Card className="mb-6 bg-gradient-to-br from-[#B91C1C]/5 to-[#7F1D1D]/5 border-[#B91C1C]/20">
            <CardContent className="p-5 space-y-2">
              <p className="text-xs uppercase tracking-wide font-semibold text-[#B91C1C] flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> What you get
              </p>
              <ul className="text-sm text-gray-800 space-y-1.5">
                <li>✓ Branded patient booking portal — patients book in 90 seconds</li>
                <li>✓ Tokenized lab-request links with the order pre-attached</li>
                <li>✓ Patient roster — saved patients = one-click re-orders</li>
                <li>✓ Live status: pending, scheduled, completed, results posted</li>
                <li>✓ Monthly org-billed invoicing once you complete your profile (optional)</li>
                <li>✓ Live in &lt;48 hours, unlimited team logins, no per-seat pricing</li>
              </ul>
            </CardContent>
          </Card>

          <form onSubmit={onSubmit}>
            <Card>
              <CardContent className="p-6 space-y-4">
                <Field
                  label="Practice / organization name *"
                  hint="What appears on patient confirmations and invoices"
                  value={form.org_name}
                  onChange={v => setForm({ ...form, org_name: v })}
                  required
                />
                <Field
                  label="Your name"
                  hint="Who should we reach out to?"
                  value={form.contact_name}
                  onChange={v => setForm({ ...form, contact_name: v })}
                />
                <Field
                  label="Email *"
                  hint="Where the welcome packet + portal credentials go"
                  type="email"
                  value={form.contact_email}
                  onChange={v => setForm({ ...form, contact_email: v })}
                  required
                />
                <Field
                  label="Phone"
                  hint="In case email goes to spam"
                  value={form.contact_phone}
                  onChange={v => setForm({ ...form, contact_phone: v })}
                />
                <div className="space-y-1.5">
                  <Label className="text-sm">Primary lab</Label>
                  <select
                    value={form.primary_lab}
                    onChange={e => setForm({ ...form, primary_lab: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm"
                  >
                    <option value="">Pick one (or leave blank)</option>
                    <option value="Quest">Quest Diagnostics</option>
                    <option value="LabCorp">LabCorp</option>
                    <option value="AdventHealth">AdventHealth</option>
                    <option value="Orlando Health">Orlando Health</option>
                    <option value="Genova">Genova Diagnostics</option>
                    <option value="Mixed">Multiple labs</option>
                  </select>
                  <p className="text-[11px] text-gray-500">So we can default specimen routing for your patients</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Anything else we should know? (optional)</Label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-sm resize-none"
                    placeholder="Specialty (functional medicine, primary care, etc.), expected volume, anything specific to your workflow…"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-11 gap-2"
                >
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : 'Get my practice set up →'}
                </Button>
                <p className="text-[11px] text-gray-500 text-center">
                  No commitment. Cancel anytime — we delete your roster on request.
                </p>
              </CardContent>
            </Card>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            Already a partner? <Link to="/login" className="text-[#B91C1C] font-medium hover:underline">Sign in to your portal</Link>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  type?: string;
  required?: boolean;
}> = ({ label, value, onChange, hint, type = 'text', required }) => (
  <div className="space-y-1.5">
    <Label className="text-sm">{label}</Label>
    <Input type={type} value={value} onChange={e => onChange(e.target.value)} required={required} className="h-10" />
    {hint && <p className="text-[11px] text-gray-500">{hint}</p>}
  </div>
);

export default ProviderRegister;
