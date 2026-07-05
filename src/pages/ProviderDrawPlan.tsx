import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/home/Header';
import Footer from '@/components/home/Footer';
import { toast } from 'sonner';
import { ArrowRight, Check, Loader2 } from 'lucide-react';

/**
 * Provider draw-plan configurator (/providers/draw-plan).
 * Patients × cadence × window × start date → live quote → e-sign → upfront
 * subscription checkout. Billing = recurring subscription (first cycle charged
 * now); scheduling = hybrid (cadence set here, we generate slots).
 */

type Frequency = 'monthly' | 'biweekly' | 'weekly';

interface Quote {
  drawsPerCycle: number;
  tier: { label: string };
  perDrawCents: number;
  monthlyTotalCents: number;
  setupFeeCents: number;
  firstChargeCents: number;
}

const FREQUENCIES: { key: Frequency; label: string; sub: string }[] = [
  { key: 'monthly', label: 'Monthly', sub: 'once a month' },
  { key: 'biweekly', label: 'Bi-weekly', sub: 'every 2 weeks' },
  { key: 'weekly', label: 'Weekly', sub: 'every week' },
];

const WINDOWS = [
  { key: 'fasting_am', label: 'Fasting mornings (6–9am)' },
  { key: 'routine_am', label: 'Routine mornings (9am–1pm)' },
  { key: 'anytime', label: 'Anytime (6am–6pm)' },
];

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const ProviderDrawPlan: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [practiceName, setPracticeName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [patientCount, setPatientCount] = useState(20);
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [drawWindow, setDrawWindow] = useState('fasting_am');
  const [startDate, setStartDate] = useState('');
  const [agreed, setAgreed] = useState(false);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Default start date = 7 days out (first Monday-ish); avoids Date.now in render.
  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    setStartDate(d.toISOString().slice(0, 10));
  }, []);

  // Status returns from Stripe
  useEffect(() => {
    if (params.get('status') === 'success') toast.success('Payment received — your draw plan is being set up.');
    if (params.get('status') === 'cancel') toast.info('Checkout canceled — your plan wasn\'t charged.');
  }, [params]);

  // Restore a draft saved before sign-in
  useEffect(() => {
    const raw = sessionStorage.getItem('cl.providerPlanDraft');
    if (raw) {
      try {
        const d = JSON.parse(raw);
        if (d.patientCount) setPatientCount(d.patientCount);
        if (d.frequency) setFrequency(d.frequency);
        if (d.drawWindow) setDrawWindow(d.drawWindow);
        if (d.startDate) setStartDate(d.startDate);
        if (d.practiceName) setPracticeName(d.practiceName);
      } catch { /* ignore */ }
    }
  }, []);

  // Debounced live quote
  useEffect(() => {
    if (patientCount < 1) return;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('provider-quote', {
          body: { patientCount, frequency },
        });
        if (error || !data?.ok) throw error ?? new Error('quote failed');
        setQuote(data.quote as Quote);
      } catch {
        setQuote(null);
      } finally {
        setQuoting(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [patientCount, frequency]);

  const canSubmit = useMemo(
    () => !!quote && agreed && !!startDate && patientCount >= 1 && (!!user || practiceName.trim().length > 1),
    [quote, agreed, startDate, patientCount, user, practiceName],
  );

  const handleSubmit = async () => {
    if (!canSubmit) return;
    // Not signed in → stash the draft and send to signup, then resume here.
    if (!user) {
      sessionStorage.setItem('cl.providerPlanDraft', JSON.stringify({ practiceName, patientCount, frequency, drawWindow, startDate }));
      navigate(`/signup?redirect=${encodeURIComponent('/providers/draw-plan')}`);
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-provider-plan-checkout', {
        body: { practiceName, contactEmail, patientCount, frequency, drawWindow, startDate },
      });
      if (error || !data?.url) throw error ?? new Error('No checkout URL');
      sessionStorage.removeItem('cl.providerPlanDraft');
      window.location.href = data.url as string;
    } catch (e) {
      console.error(e);
      toast.error('Could not start checkout. Please try again or contact us.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-cream text-foreground">
      <Helmet><title>Partner Draw Plan | ConveLabs for Practices</title></Helmet>
      <Header />

      <main className="container mx-auto px-4 py-12 md:py-16 max-w-5xl">
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-3">
            <span className="h-px w-8 bg-brand-gold/50" />
            <span className="text-xs font-medium uppercase tracking-[0.24em] text-brand-gold-deep">For practices</span>
            <span className="h-px w-8 bg-brand-gold/50" />
          </div>
          <h1 className="font-playfair text-3xl md:text-5xl font-medium text-conve-black mb-3">
            Build your <span className="italic text-brand-gold-deep">draw plan.</span>
          </h1>
          <p className="text-brand-gray-warm max-w-xl mx-auto">
            Tell us how many patients and how often. We handle the draws on your cadence — you pay one predictable fee, billed monthly.
          </p>
        </div>

        <div className="grid md:grid-cols-[1fr_360px] gap-6 md:gap-8 items-start">
          {/* Configurator */}
          <div className="bg-white rounded-2xl border border-brand-gold/25 shadow-luxury p-6 md:p-8 space-y-7">
            {!user && (
              <div>
                <label className="block text-sm font-medium text-conve-black mb-1.5">Practice name</label>
                <input value={practiceName} onChange={(e) => setPracticeName(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-brand-gold/30 focus:border-conve-red focus:outline-none"
                  placeholder="e.g. Winter Park Concierge Medicine" />
              </div>
            )}

            {/* Patients */}
            <div>
              <label className="block text-sm font-medium text-conve-black mb-1.5">Patients per cycle</label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setPatientCount((n) => Math.max(1, n - 5))}
                  className="h-11 w-11 rounded-lg border border-brand-gold/30 text-lg font-semibold hover:bg-brand-cream-soft">−</button>
                <input type="number" min={1} max={5000} value={patientCount}
                  onChange={(e) => setPatientCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24 h-11 text-center rounded-lg border border-brand-gold/30 focus:border-conve-red focus:outline-none tabular-nums text-lg font-semibold" />
                <button type="button" onClick={() => setPatientCount((n) => Math.min(5000, n + 5))}
                  className="h-11 w-11 rounded-lg border border-brand-gold/30 text-lg font-semibold hover:bg-brand-cream-soft">+</button>
              </div>
            </div>

            {/* Frequency */}
            <div>
              <label className="block text-sm font-medium text-conve-black mb-2">How often are they drawn?</label>
              <div className="grid grid-cols-3 gap-2">
                {FREQUENCIES.map((f) => (
                  <button key={f.key} type="button" onClick={() => setFrequency(f.key)}
                    className={`rounded-lg border p-3 text-left transition ${frequency === f.key ? 'border-conve-red ring-2 ring-conve-red/15 bg-conve-red/5' : 'border-brand-gold/25 hover:border-brand-gold/50'}`}>
                    <span className="block font-semibold text-conve-black text-sm">{f.label}</span>
                    <span className="block text-xs text-brand-gray-warm">{f.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Window + start date */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-conve-black mb-1.5">Draw window</label>
                <select value={drawWindow} onChange={(e) => setDrawWindow(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-brand-gold/30 focus:border-conve-red focus:outline-none bg-white">
                  {WINDOWS.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-conve-black mb-1.5">Start date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-brand-gold/30 focus:border-conve-red focus:outline-none" />
              </div>
            </div>
          </div>

          {/* Quote rail */}
          <div className="bg-conve-black text-white rounded-2xl p-6 md:p-7 border border-brand-gold/20 md:sticky md:top-24">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand-gold-soft mb-4">Your quote</p>
            {quoting && !quote ? (
              <div className="flex items-center gap-2 text-white/70 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Calculating…</div>
            ) : quote ? (
              <>
                <div className="space-y-2.5 text-sm">
                  <Row label="Draws / month" value={<span className="tabular-nums">{quote.drawsPerCycle}</span>} />
                  <Row label="Volume tier" value={quote.tier.label} />
                  <Row label="Per draw" value={<span className="tabular-nums">{usd(quote.perDrawCents)}</span>} />
                  <div className="h-px bg-white/10 my-2" />
                  <Row label="Monthly" value={<span className="tabular-nums font-semibold">{usd(quote.monthlyTotalCents)}</span>} />
                  <Row label="One-time setup" value={<span className="tabular-nums">{usd(quote.setupFeeCents)}</span>} />
                </div>
                <div className="mt-4 pt-4 border-t border-white/15 flex items-baseline justify-between">
                  <span className="text-sm text-white/80">Due today</span>
                  <span className="font-playfair text-3xl font-medium text-brand-gold tabular-nums">{usd(quote.firstChargeCents)}</span>
                </div>
                <p className="text-[11px] text-white/55 mt-1">Then {usd(quote.monthlyTotalCents)}/month. Cancel or adjust anytime.</p>

                <label className="flex items-start gap-2 mt-5 text-xs text-white/80 cursor-pointer">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 accent-[#B91C1C]" />
                  <span>I agree to the <a href="/terms" target="_blank" className="text-brand-gold underline">Partner Terms</a> and authorize the first charge today.</span>
                </label>

                <button type="button" onClick={handleSubmit} disabled={!canSubmit || submitting}
                  className="mt-4 w-full h-12 rounded-lg bg-conve-red hover:bg-conve-red-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm uppercase tracking-[0.12em] flex items-center justify-center gap-2 transition">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{user ? 'Pay & start' : 'Continue'} <ArrowRight className="h-4 w-4" /></>}
                </button>
                <p className="flex items-center justify-center gap-1.5 text-[11px] text-white/50 mt-3">
                  <Check className="h-3 w-3 text-brand-gold" /> Lab tests still bill insurance separately
                </p>
              </>
            ) : (
              <p className="text-white/60 text-sm">Enter your patient count to see pricing.</p>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="text-white/70">{label}</span>
    <span className="text-white">{value}</span>
  </div>
);

export default ProviderDrawPlan;
